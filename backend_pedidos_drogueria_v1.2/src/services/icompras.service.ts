import fs from 'fs';
import path from 'path';
import mssql from 'mssql';
import { connectDb } from '../db/db.conection';

const ESQ = process.env.DB_ESQUEMA || 'dbo';

export interface IComprasConfig {
    urlBase: string;
    codisb: string;
    intervaloSeg: number;
    habilitado: boolean;
    rutaPedidos: string;
}

interface PedidoRemoto {
    id: string | number;
    pedido?: any;
    pedren?: any[];
    [key: string]: any;
}

const HTTP_HEADERS = {
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent':       'iCompras360-SIAD/1.0',
    'Content-Type':     'application/json',
};

export class IComprasService {
    private static scheduler: NodeJS.Timeout | null = null;

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='APP_ICOMPRAS_CONFIG')
                    CREATE TABLE ${ESQ}.APP_ICOMPRAS_CONFIG (
                        ID             INT PRIMARY KEY DEFAULT 1,
                        URL_BASE       NVARCHAR(500) NOT NULL DEFAULT '',
                        CODISB         NVARCHAR(100) NOT NULL DEFAULT '',
                        INTERVALO_SEG  INT           NOT NULL DEFAULT 60,
                        HABILITADO     CHAR(1)       NOT NULL DEFAULT 'F',
                        RUTA_PEDIDOS   NVARCHAR(500) NOT NULL DEFAULT '',
                        CONSTRAINT CK_ICOMPRAS_CFG_ID CHECK (ID = 1)
                    );
                IF NOT EXISTS (SELECT 1 FROM ${ESQ}.APP_ICOMPRAS_CONFIG WHERE ID=1)
                    INSERT INTO ${ESQ}.APP_ICOMPRAS_CONFIG (ID) VALUES (1);

                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='APP_ICOMPRAS_PEDIDOS')
                    CREATE TABLE ${ESQ}.APP_ICOMPRAS_PEDIDOS (
                        ID             INT IDENTITY PRIMARY KEY,
                        ID_PEDIDO_REM  NVARCHAR(100) NOT NULL,
                        ESTADO         NVARCHAR(50)  NOT NULL DEFAULT 'RECIBIDO',
                        FECHA_DESCARGA DATETIME      NOT NULL DEFAULT GETDATE(),
                        DATOS_JSON     NVARCHAR(MAX) NULL,
                        NUMEROD        NVARCHAR(100) NULL,
                        ARCHIVO_PATH   NVARCHAR(500) NULL,
                        ERROR_MSG      NVARCHAR(500) NULL
                    );
            `);
            // Agregar INTERVALO_SEG si no existe (migración desde INTERVALO_MIN)
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_ICOMPRAS_CONFIG' AND COLUMN_NAME='INTERVALO_SEG')
                    ALTER TABLE ${ESQ}.APP_ICOMPRAS_CONFIG ADD INTERVALO_SEG INT NOT NULL DEFAULT 60;
            `);
        } catch (e: any) {
            console.error('[ICompras] initTablas:', e.message);
        }
    }

    static async getConfig(): Promise<IComprasConfig> {
        const pool = await connectDb();
        const res = await pool.request().query(`
            SELECT URL_BASE, CODISB, INTERVALO_SEG, HABILITADO, RUTA_PEDIDOS
            FROM ${ESQ}.APP_ICOMPRAS_CONFIG WITH (NOLOCK) WHERE ID=1
        `);
        const r = res.recordset[0];
        return {
            urlBase:      r?.URL_BASE      ?? '',
            codisb:       r?.CODISB        ?? '',
            intervaloSeg: r?.INTERVALO_SEG ?? 60,
            habilitado:   r?.HABILITADO    === 'T',
            rutaPedidos:  r?.RUTA_PEDIDOS  ?? '',
        };
    }

    static async saveConfig(cfg: IComprasConfig): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('URL', mssql.NVarChar(500), cfg.urlBase.trim())
            .input('COD', mssql.NVarChar(100), cfg.codisb.trim())
            .input('INT', mssql.Int,            Math.max(1, cfg.intervaloSeg))
            .input('HAB', mssql.Char(1),        cfg.habilitado ? 'T' : 'F')
            .input('RUT', mssql.NVarChar(500),  cfg.rutaPedidos.trim())
            .query(`
                UPDATE ${ESQ}.APP_ICOMPRAS_CONFIG
                SET URL_BASE=@URL, CODISB=@COD, INTERVALO_SEG=@INT, HABILITADO=@HAB, RUTA_PEDIDOS=@RUT
                WHERE ID=1
            `);

        if (cfg.habilitado) {
            IComprasService.iniciarScheduler(cfg);
        } else {
            IComprasService.detenerScheduler();
        }
    }

    static async ejecutarCiclo(): Promise<{ descargados: number; errores: number }> {
        const cfg = await IComprasService.getConfig();
        if (!cfg.urlBase || !cfg.codisb) {
            throw new Error('ICompras no configurado (URL_BASE o CODISB vacío)');
        }

        const getUrl = `${cfg.urlBase}/api/get_pedido_recibido?codisb=${encodeURIComponent(cfg.codisb)}&estado=RECIBIDO`;
        const getRes = await fetch(getUrl, { headers: HTTP_HEADERS });
        if (!getRes.ok) throw new Error(`HTTP ${getRes.status} al obtener pedidos`);

        const rawText = await getRes.text();
        let body: any;
        if (!rawText.trim()) {
            body = [];  // servidor devuelve body vacío cuando no hay pedidos
        } else {
            try { body = JSON.parse(rawText); }
            catch {
                console.error('[ICompras] Respuesta no-JSON del servidor remoto:', rawText.slice(0, 300));
                throw new Error(`Respuesta no válida del servidor remoto. Primeros 100 chars: ${rawText.slice(0, 100)}`);
            }
        }
        const pedidos: PedidoRemoto[] = Array.isArray(body)
            ? body
            : (body.pedidos ?? (body.id ? [body] : []));

        let descargados = 0;
        let errores     = 0;

        for (const ped of pedidos) {
            try {
                await IComprasService.procesarPedido(cfg, ped);
                descargados++;
            } catch (e: any) {
                console.error('[ICompras] Error en pedido', ped.id, e.message);
                await IComprasService.registrarError(String(ped.id ?? '?'), JSON.stringify(ped), e.message);
                errores++;
            }
        }

        return { descargados, errores };
    }

    private static async procesarPedido(cfg: IComprasConfig, ped: PedidoRemoto): Promise<void> {
        const pool      = await connectDb();
        const datosJson = JSON.stringify(ped);
        const idRem     = String(ped.id);

        // Audit INSERT
        const insRes = await pool.request()
            .input('IR',   mssql.NVarChar(100),      idRem)
            .input('DAT',  mssql.NVarChar(mssql.MAX), datosJson)
            .query(`
                INSERT INTO ${ESQ}.APP_ICOMPRAS_PEDIDOS (ID_PEDIDO_REM, ESTADO, DATOS_JSON)
                OUTPUT INSERTED.ID
                VALUES (@IR, 'DESCARGANDO', @DAT);
            `);
        const auditId: number = insRes.recordset[0]?.ID;

        // [4b] Marcar PROCESADO en remoto
        const updRes = await fetch(`${cfg.urlBase}/api/upd_pedido`, {
            method:  'POST',
            headers: HTTP_HEADERS,
            body:    JSON.stringify({ id: idRem, estado: 'PROCESADO', numerod: '' }),
        });
        if (!updRes.ok) throw new Error(`HTTP ${updRes.status} al marcar PROCESADO`);

        // [4c] Escribir archivo
        let archivoPath = '';
        if (cfg.rutaPedidos) {
            fs.mkdirSync(cfg.rutaPedidos, { recursive: true });
            archivoPath = path.join(cfg.rutaPedidos, `${idRem}.txt`);
            fs.writeFileSync(archivoPath, datosJson, 'utf-8');
        }

        // Actualizar audit
        await pool.request()
            .input('AID',  mssql.Int,           auditId)
            .input('PATH', mssql.NVarChar(500),  archivoPath)
            .query(`
                UPDATE ${ESQ}.APP_ICOMPRAS_PEDIDOS
                SET ESTADO='PROCESADO', ARCHIVO_PATH=@PATH
                WHERE ID=@AID
            `);
    }

    private static async registrarError(idRem: string, datos: string, error: string): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request()
                .input('IR',  mssql.NVarChar(100),      idRem)
                .input('DAT', mssql.NVarChar(mssql.MAX), datos)
                .input('ERR', mssql.NVarChar(500),       error.slice(0, 490))
                .query(`
                    INSERT INTO ${ESQ}.APP_ICOMPRAS_PEDIDOS (ID_PEDIDO_REM, ESTADO, DATOS_JSON, ERROR_MSG)
                    VALUES (@IR, 'ERROR', @DAT, @ERR)
                `);
        } catch {}
    }

    static async reprocesarPedido(idRemoto: string): Promise<void> {
        const cfg = await IComprasService.getConfig();
        if (!cfg.urlBase) throw new Error('ICompras no configurado');

        // Resetear estado remoto a RECIBIDO para que el ciclo lo tome
        const res = await fetch(`${cfg.urlBase}/api/upd_pedido`, {
            method:  'POST',
            headers: HTTP_HEADERS,
            body:    JSON.stringify({ id: idRemoto, estado: 'RECIBIDO', numerod: '' }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} al resetear estado remoto`);

        // Ejecutar ciclo inmediatamente para descargarlo
        await IComprasService.ejecutarCiclo();
    }

    static async getAuditoria(limite = 100): Promise<any[]> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('LIM', mssql.Int, limite)
            .query(`
                SELECT TOP (@LIM)
                    ID, ID_PEDIDO_REM, ESTADO, FECHA_DESCARGA, NUMEROD, ARCHIVO_PATH, ERROR_MSG
                FROM ${ESQ}.APP_ICOMPRAS_PEDIDOS WITH (NOLOCK)
                ORDER BY ID DESC
            `);
        return res.recordset;
    }

    static iniciarScheduler(cfg?: IComprasConfig): void {
        IComprasService.detenerScheduler();
        const segundos = cfg?.intervaloSeg ?? 60;
        console.log(`[ICompras] Scheduler iniciado — cada ${segundos}s`);
        IComprasService.scheduler = setInterval(async () => {
            try { await IComprasService.ejecutarCiclo(); }
            catch (e: any) { console.error('[ICompras] Ciclo automático:', e.message); }
        }, segundos * 1000);
    }

    static detenerScheduler(): void {
        if (IComprasService.scheduler) {
            clearInterval(IComprasService.scheduler);
            IComprasService.scheduler = null;
            console.log('[ICompras] Scheduler detenido');
        }
    }

    static schedulerActivo(): boolean {
        return IComprasService.scheduler !== null;
    }
}
