import fs from 'fs';
import path from 'path';
import mssql from 'mssql';
import { connectDb } from '../db/db.conection';
import { getDbConfig } from './dbconfig.service';
import { STOCK_DISPONIBLE_SQL } from './products.service';
import { PromocionesService } from './promociones.service';

const ESQ = process.env.DB_ESQUEMA || 'dbo';

export interface FarcomprasConfig {
    rutaBase:     string;
    habilitado:   boolean;
    intervaloSeg: number;
    usuarioFtp:   string;
}

export class FarcomprasService {
    private static scheduler: NodeJS.Timeout | null = null;

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_FARCOMPRAS_CONFIG')
                    CREATE TABLE ${ESQ}.APP_FARCOMPRAS_CONFIG (
                        ID            INT PRIMARY KEY DEFAULT 1,
                        RUTA_BASE     NVARCHAR(500) NOT NULL DEFAULT '',
                        HABILITADO    CHAR(1)       NOT NULL DEFAULT 'F',
                        INTERVALO_SEG INT           NOT NULL DEFAULT 300,
                        USUARIO_FTP   NVARCHAR(100) NOT NULL DEFAULT '',
                        CONSTRAINT CK_FARCOMPRAS_CFG_ID CHECK (ID = 1)
                    );
                IF EXISTS (SELECT 1 FROM sys.columns WHERE name = 'COD_CLIENTE' AND object_id = OBJECT_ID('${ESQ}.APP_FARCOMPRAS_CONFIG'))
                    ALTER TABLE ${ESQ}.APP_FARCOMPRAS_CONFIG DROP COLUMN COD_CLIENTE;
                IF EXISTS (SELECT 1 FROM sys.columns WHERE name = 'COD_VENDEDOR' AND object_id = OBJECT_ID('${ESQ}.APP_FARCOMPRAS_CONFIG'))
                    ALTER TABLE ${ESQ}.APP_FARCOMPRAS_CONFIG DROP COLUMN COD_VENDEDOR;
                IF EXISTS (SELECT 1 FROM sys.columns WHERE name = 'FTP_HOST' AND object_id = OBJECT_ID('${ESQ}.APP_FARCOMPRAS_CONFIG'))
                    ALTER TABLE ${ESQ}.APP_FARCOMPRAS_CONFIG DROP COLUMN FTP_HOST;
                IF EXISTS (SELECT 1 FROM sys.columns WHERE name = 'FTP_PORT' AND object_id = OBJECT_ID('${ESQ}.APP_FARCOMPRAS_CONFIG'))
                    ALTER TABLE ${ESQ}.APP_FARCOMPRAS_CONFIG DROP COLUMN FTP_PORT;
                IF EXISTS (SELECT 1 FROM sys.columns WHERE name = 'FTP_USUARIO' AND object_id = OBJECT_ID('${ESQ}.APP_FARCOMPRAS_CONFIG'))
                    ALTER TABLE ${ESQ}.APP_FARCOMPRAS_CONFIG DROP COLUMN FTP_USUARIO;
                IF EXISTS (SELECT 1 FROM sys.columns WHERE name = 'FTP_PASSWORD' AND object_id = OBJECT_ID('${ESQ}.APP_FARCOMPRAS_CONFIG'))
                    ALTER TABLE ${ESQ}.APP_FARCOMPRAS_CONFIG DROP COLUMN FTP_PASSWORD;
                IF EXISTS (SELECT 1 FROM sys.columns WHERE name = 'FTP_RUTA' AND object_id = OBJECT_ID('${ESQ}.APP_FARCOMPRAS_CONFIG'))
                    ALTER TABLE ${ESQ}.APP_FARCOMPRAS_CONFIG DROP COLUMN FTP_RUTA;
                IF NOT EXISTS (SELECT 1 FROM ${ESQ}.APP_FARCOMPRAS_CONFIG WHERE ID = 1)
                    INSERT INTO ${ESQ}.APP_FARCOMPRAS_CONFIG (ID) VALUES (1);

                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_FARCOMPRAS_PEDIDOS')
                    CREATE TABLE ${ESQ}.APP_FARCOMPRAS_PEDIDOS (
                        ID           INT IDENTITY PRIMARY KEY,
                        ARCHIVO      NVARCHAR(500)  NOT NULL,
                        EVENTO       NVARCHAR(50)   NOT NULL,
                        ORDERID      NVARCHAR(200)  NULL,
                        MENSAJE      NVARCHAR(500)  NULL,
                        FECHA        DATETIME       NOT NULL DEFAULT GETUTCDATE()
                    );
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FARCOMP_FECHA' AND object_id = OBJECT_ID('APP_FARCOMPRAS_PEDIDOS'))
                    CREATE INDEX IX_FARCOMP_FECHA ON ${ESQ}.APP_FARCOMPRAS_PEDIDOS (FECHA DESC);
            `);
            console.log('[Farcompras] Tablas verificadas/creadas');
        } catch (e: any) {
            console.error('[Farcompras] initTablas:', e.message);
        }
    }

    static async getConfig(): Promise<FarcomprasConfig> {
        const pool = await connectDb();
        const res = await pool.request().query(
            `SELECT RUTA_BASE, HABILITADO, INTERVALO_SEG, USUARIO_FTP
             FROM ${ESQ}.APP_FARCOMPRAS_CONFIG WITH (NOLOCK) WHERE ID = 1`
        );
        const r = res.recordset[0];
        return {
            rutaBase:     r?.RUTA_BASE     ?? '',
            habilitado:   r?.HABILITADO    === 'T',
            intervaloSeg: r?.INTERVALO_SEG ?? 300,
            usuarioFtp:   r?.USUARIO_FTP   ?? '',
        };
    }

    static async saveConfig(cfg: FarcomprasConfig): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('RUTA', mssql.NVarChar(500), cfg.rutaBase.trim())
            .input('HAB',  mssql.Char(1),        cfg.habilitado ? 'T' : 'F')
            .input('INT',  mssql.Int,            Math.max(30, cfg.intervaloSeg))
            .input('USR',  mssql.NVarChar(100),  cfg.usuarioFtp.trim())
            .query(`
                UPDATE ${ESQ}.APP_FARCOMPRAS_CONFIG
                SET RUTA_BASE=@RUTA, HABILITADO=@HAB, INTERVALO_SEG=@INT, USUARIO_FTP=@USR
                WHERE ID=1
            `);

        if (cfg.habilitado && cfg.rutaBase) {
            FarcomprasService.iniciarScheduler(cfg);
        } else {
            FarcomprasService.detenerScheduler();
        }
    }

    // ── Registro de auditoría ─────────────────────────────────────────────────

    private static async log(archivo: string, evento: string, orderId?: string, mensaje?: string): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request()
                .input('ARCH', mssql.NVarChar(500), archivo)
                .input('EVT',  mssql.NVarChar(50),  evento)
                .input('OID',  mssql.NVarChar(200), orderId ?? null)
                .input('MSG',  mssql.NVarChar(500), mensaje ? mensaje.substring(0, 490) : null)
                .query(`INSERT INTO ${ESQ}.APP_FARCOMPRAS_PEDIDOS (ARCHIVO, EVENTO, ORDERID, MENSAJE)
                        VALUES (@ARCH, @EVT, @OID, @MSG)`);
        } catch {}
    }

    static async getAuditoria(limite = 100): Promise<any[]> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('LIM', mssql.Int, Math.min(500, limite))
            .query(`SELECT TOP (@LIM) * FROM ${ESQ}.APP_FARCOMPRAS_PEDIDOS WITH (NOLOCK) ORDER BY FECHA DESC`);
        return res.recordset;
    }

    // ── Generación de inventario.txt (catálogo general) ───────────────────────

    static async generarInventario(rutaBase: string): Promise<void> {
        const { tarifaBaseCatalogo, codAlmacen } = getDbConfig();
        const pool = await connectDb();

        // D2 de promos activas para todos los clientes (primer tramo, slot 2)
        const d2Map = new Map<number, number>();
        try {
            const vigentes = await PromocionesService.getVigentes();
            for (const promo of vigentes) {
                if ((promo.slotDescuento ?? 2) !== 2) continue;
                if (promo.alcanceCliente !== 'TODOS') continue;
                const primerTramo = promo.escalas[0];
                if (!primerTramo || primerTramo.porcentaje <= 0) continue;
                for (const cod of promo.codigosArticulo as number[]) {
                    if (!d2Map.has(cod)) d2Map.set(cod, primerTramo.porcentaje);
                }
            }
        } catch {}

        const result = await pool.request()
            .input('TARIFA',  mssql.Int,         tarifaBaseCatalogo)
            .input('ALMACEN', mssql.VarChar(10),  codAlmacen)
            .query(`
                SELECT A.CODARTICULO,
                    A.REFPROVEEDOR,
                    ACL.DESCRIPCIONLARGA AS DESCRIPCION,
                    ISNULL(A.NODTOAPLICABLE, 0) AS NODTO,
                    ISNULL((SELECT TOP 1
                        CONVERT(NVARCHAR(10),
                            COALESCE(TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 103), TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 23)),
                            103)
                     FROM ARTICULOSLIN AL WITH(NOLOCK)
                     WHERE AL.CODARTICULO = A.CODARTICULO
                       AND COALESCE(TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 103), TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 23)) >= CAST(GETDATE() AS DATE)
                     ORDER BY COALESCE(TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 103), TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 23))
                    ), '') AS VENCE,
                    PV.PNETO AS PRECIO,
                    ISNULL(M.DESCRIPCION, '') AS MARCA,
                    ${STOCK_DISPONIBLE_SQL} AS STOCK_DISP
                FROM ARTICULOS A WITH(NOLOCK)
                INNER JOIN ARTICULOSCAMPOSLIBRES ACL WITH(NOLOCK) ON ACL.CODARTICULO = A.CODARTICULO
                INNER JOIN PRECIOSVENTA PV WITH(NOLOCK)
                    ON PV.CODARTICULO = A.CODARTICULO AND PV.TALLA = '.' AND PV.COLOR = '.' AND PV.IDTARIFAV = @TARIFA
                LEFT  JOIN MARCA M WITH(NOLOCK) ON M.CODMARCA = A.MARCA
                LEFT  JOIN SECCIONES S WITH(NOLOCK) ON S.NUMDPTO = A.DPTO AND S.NUMSECCION = A.SECCION
                WHERE A.TIPOARTICULO = 'A'
                  AND A.DESCATALOGADO = 'F'
                  AND A.DPTO = 1
                  AND UPPER(ISNULL(S.DESCRIPCION, '')) NOT LIKE '%GASTO%'
                  AND ${STOCK_DISPONIBLE_SQL} > 0
                ORDER BY ACL.DESCRIPCIONLARGA
            `);

        const lines: string[] = [];
        const clean = (s: string) => s.replace(/[\r\n\t]/g, ' ').trim();

        for (const r of result.recordset) {
            const precio  = Number(r.PRECIO);
            const nodto   = r.NODTO === 1;
            const d2      = nodto ? 0 : (d2Map.get(Number(r.CODARTICULO)) ?? 0);
            const dtoStr  = d2 > 0 ? `0+${d2}+0+0` : '';

            lines.push([
                String(r.CODARTICULO).padStart(5, '0'),
                clean(r.REFPROVEEDOR || ''),
                clean(r.DESCRIPCION  || '').substring(0, 45).replace(/;/g, ','),
                r.VENCE || '',
                precio.toFixed(2),
                dtoStr,
                precio.toFixed(2),
                Math.max(0, Math.round(Number(r.STOCK_DISP))),
                clean(r.MARCA || '').substring(0, 30),
            ].join(';'));
        }

        fs.mkdirSync(path.join(rutaBase, 'pedidos'), { recursive: true });
        fs.writeFileSync(path.join(rutaBase, 'inventario.txt'), lines.join('\r\n'), 'latin1');
        console.log(`[Farcompras] inventario.txt generado: ${lines.length} artículos`);
    }

    static async generarClientes(rutaBase: string): Promise<void> {
        const pool = await connectDb();
        const res = await pool.request().query(`
            SELECT C.CODCLIENTE,
                   ISNULL(C.NIF20, '')         AS NIF20,
                   ISNULL(C.NOMBRECLIENTE, '') AS NOMBRECLIENTE,
                   ISNULL(TRY_CAST(CCL.D1 AS FLOAT), 0) AS D1
            FROM CLIENTES C WITH(NOLOCK)
            LEFT JOIN CLIENTESCAMPOSLIBRES CCL WITH(NOLOCK) ON CCL.CODCLIENTE = C.CODCLIENTE
            ORDER BY C.NOMBRECLIENTE
        `);
        const clean = (s: string) => s.replace(/[\r\n\t;]/g, ' ').trim();
        const lines = res.recordset.map((r: any) =>
            [r.CODCLIENTE, clean(r.NIF20), clean(r.NOMBRECLIENTE), Number(r.D1).toFixed(2)].join(';')
        );
        fs.writeFileSync(path.join(rutaBase, 'clientes.txt'), lines.join('\r\n'), 'latin1');
        console.log(`[Farcompras] clientes.txt generado: ${lines.length} clientes`);
    }

    // ── Escaneo de pedidos ────────────────────────────────────────────────────

    static async escanearPedidos(): Promise<void> {
        const cfg = await FarcomprasService.getConfig();
        if (!cfg.rutaBase) return;

        const pedidosDir = path.join(cfg.rutaBase, 'pedidos');
        if (!fs.existsSync(pedidosDir)) {
            fs.mkdirSync(pedidosDir, { recursive: true });
            return;
        }

        let archivos: string[];
        try {
            archivos = fs.readdirSync(pedidosDir).filter(f => f.toLowerCase().endsWith('.txt'));
        } catch (e: any) {
            console.error('[Farcompras] Error leyendo carpeta pedidos:', e.message);
            return;
        }

        for (const archivo of archivos) {
            const rutaCompleta = path.join(pedidosDir, archivo);
            try {
                await FarcomprasService._procesarArchivo(cfg, rutaCompleta, archivo);
            } catch (e: any) {
                console.error(`[Farcompras] Error crítico en ${archivo}:`, e.message);
                FarcomprasService.log(archivo, 'ERROR_CRITICO', undefined, e.message.substring(0, 490)).catch(() => {});
            }
        }
    }

    private static async _procesarArchivo(cfg: FarcomprasConfig, rutaCompleta: string, archivo: string): Promise<void> {
        const pool = await connectDb();

        // Usar nombre del archivo (sin extensión) como base del ORDERID
        const base   = path.basename(archivo, path.extname(archivo)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase();
        const baseId = `FC${base}`.substring(0, 13);

        // Deduplicación
        const dup = await pool.request()
            .input('BASE', mssql.VarChar(15), baseId)
            .query(`SELECT 1 FROM ${ESQ}.CABECERA_PED WITH (NOLOCK) WHERE ORDERID LIKE @BASE + '%'`);
        if (dup.recordset.length > 0) {
            await FarcomprasService.log(archivo, 'YA_PROCESADO', baseId);
            try { fs.renameSync(rutaCompleta, rutaCompleta.replace(/\.txt$/i, '.bak')); } catch {}
            return;
        }

        let contenido: string;
        try {
            contenido = fs.readFileSync(rutaCompleta, 'latin1');
        } catch (e: any) {
            await FarcomprasService.log(archivo, 'PARSE_ERROR', baseId, `Error leyendo archivo: ${e.message}`);
            return;
        }

        const todasLasLineas = contenido
            .split('\n')
            .map(l => l.trim().replace(/\r$/, ''))
            .filter(l => l.length > 0);

        // Primera línea: RIF del cliente
        const rif = (todasLasLineas[0] ?? '').trim();
        if (!rif) {
            await FarcomprasService.log(archivo, 'PARSE_ERROR', baseId, 'Archivo sin RIF en primera línea');
            return;
        }
        const clienteRes = await pool.request()
            .input('RIF', mssql.NVarChar(50), rif)
            .query(`SELECT TOP 1 CL.CODCLIENTE,
                        ISNULL((SELECT TOP 1 CAST(CCL.CODVENDEDOR AS INT)
                                FROM CLIENTESCAMPOSLIBRES CCL WITH (NOLOCK)
                                WHERE CCL.CODCLIENTE = CL.CODCLIENTE
                                  AND CCL.CODVENDEDOR IS NOT NULL
                                  AND LTRIM(RTRIM(CAST(CCL.CODVENDEDOR AS NVARCHAR))) != ''), 1) AS CODVENDEDOR
                    FROM CLIENTES CL WITH (NOLOCK)
                    WHERE LTRIM(RTRIM(ISNULL(CL.NIF20,''))) = LTRIM(RTRIM(@RIF))`);
        if (clienteRes.recordset.length === 0) {
            await FarcomprasService.log(archivo, 'CLIENTE_NO_ENCONTRADO', baseId, `RIF no encontrado: ${rif}`);
            return;
        }
        const { CODCLIENTE, CODVENDEDOR } = clienteRes.recordset[0];

        // Líneas 2+ : codarticulo;descripcion;cantidad;precioTotal
        const lineas = todasLasLineas.slice(1)
            .map(l => {
                const f = l.split(';');
                const cantidad    = parseFloat((f[2] ?? '0').replace(',', '.'));
                const precioTotal = parseFloat((f[3] ?? '0').replace(',', '.'));
                return {
                    codarticulo: parseInt((f[0] ?? '').trim(), 10),
                    cantidad,
                    precioTotal,
                    precioUnit: cantidad > 0 ? precioTotal / cantidad : 0,
                };
            })
            .filter(l => l.codarticulo > 0 && l.cantidad > 0);

        // Agrupar duplicados
        const lineasMap = new Map<number, typeof lineas[0]>();
        for (const l of lineas) {
            const ex = lineasMap.get(l.codarticulo);
            if (ex) { ex.cantidad += l.cantidad; ex.precioTotal += l.precioTotal; }
            else lineasMap.set(l.codarticulo, { ...l });
        }
        const lineasAgrupadas = [...lineasMap.values()];

        if (lineasAgrupadas.length === 0) {
            await FarcomprasService.log(archivo, 'PARSE_ERROR', baseId, 'Archivo sin líneas válidas');
            return;
        }

        const { tarifaBaseCatalogo, codAlmacen, maxLineasPorPedido } = getDbConfig();
        const codigos = lineasAgrupadas.map(l => l.codarticulo).join(',');

        const [preciosRes, artInfoRes] = await Promise.all([
            pool.request()
                .input('TARIFA', mssql.Int, tarifaBaseCatalogo)
                .query(`SELECT CODARTICULO, PNETO FROM PRECIOSVENTA WITH (NOLOCK) WHERE IDTARIFAV = @TARIFA AND COLOR = '.' AND TALLA = '.' AND CODARTICULO IN (${codigos})`),
            pool.request()
                .input('dptoPsico', mssql.Int, getDbConfig().dptoPsicotropicos)
                .query(`
                    SELECT A.CODARTICULO,
                        ISNULL(A.NODTOAPLICABLE,0) AS NODTO,
                        CASE WHEN A.SECCION = @dptoPsico THEN 1 ELSE 0 END AS ES_PSICO,
                        ISNULL(PCL.DIASPROTECCION,0) AS DIAS_PROT
                    FROM ARTICULOS A WITH(NOLOCK)
                    LEFT JOIN ARTICULOSCAMPOSLIBRES ACL WITH(NOLOCK) ON ACL.CODARTICULO = A.CODARTICULO
                    LEFT JOIN PROVEEDORESCAMPOSLIBRES PCL WITH(NOLOCK) ON PCL.CODPROVEEDOR = ACL.CODPROVEEDORICG
                    WHERE A.CODARTICULO IN (${codigos})
                `),
        ]);

        const preciosSistema = new Map<number, number>(preciosRes.recordset.map((r: any) => [r.CODARTICULO, Number(r.PNETO)]));
        const artInfoMap = new Map<number, { nodto: boolean; esPsico: boolean; diasProt: number }>(
            artInfoRes.recordset.map((r: any) => [Number(r.CODARTICULO), { nodto: !!r.NODTO, esPsico: !!r.ES_PSICO, diasProt: Number(r.DIAS_PROT) }])
        );
        const getTipo = (cod: number): string => {
            const info = artInfoMap.get(cod);
            if (!info)             return 'N';
            if (info.esPsico)      return 'P';
            if (info.nodto)        return 'SD';
            if (info.diasProt > 0) return 'NI';
            return 'N';
        };

        // Sin cliente ICG: precio base sin descuentos
        for (const l of lineasAgrupadas) {
            const pneto  = preciosSistema.get(l.codarticulo) ?? 0;
            l.precioUnit  = pneto;
            l.precioTotal = pneto * l.cantidad;
        }

        const grupos = new Map<string, typeof lineasAgrupadas>();
        for (const l of lineasAgrupadas) {
            const tipo = getTipo(l.codarticulo);
            if (!grupos.has(tipo)) grupos.set(tipo, []);
            grupos.get(tipo)!.push(l);
        }

        const step = maxLineasPorPedido > 0 ? maxLineasPorPedido : Infinity;
        const buildChunkId = (tipo: string, chunk: number): string => {
            const typeSuf  = tipo === 'N' ? '' : tipo;
            const chunkSuf = chunk > 1 ? String(Math.min(chunk, 9)) : '';
            return (baseId + typeSuf + chunkSuf).substring(0, 15);
        };

        const orderIds: string[] = [];
        let transaction: mssql.Transaction | null = null;
        try {
            transaction = new mssql.Transaction(pool);
            await transaction.begin();

            for (const [tipo, artsTipo] of grupos) {
                const sz = step === Infinity ? artsTipo.length : step;
                const chunks: (typeof lineasAgrupadas)[] = [];
                for (let i = 0; i < artsTipo.length; i += sz) chunks.push(artsTipo.slice(i, i + sz));

                for (let ci = 0; ci < chunks.length; ci++) {
                    const chunk      = chunks[ci];
                    const chunkId    = buildChunkId(tipo, ci + 1);
                    const totalChunk = chunk.reduce((s, l) => s + l.precioTotal, 0);
                    const estatusInicial = tipo === 'P' ? 'APROBACION PSICOTROPICOS' : 'PENDIENTE';

                    await new mssql.Request(transaction)
                        .input('OID', mssql.NVarChar(15), chunkId)
                        .input('CLI', mssql.Int, CODCLIENTE)
                        .input('VND', mssql.Int, CODVENDEDOR)
                        .input('TOT', mssql.Decimal(18, 2), totalChunk)
                        .input('EST', mssql.NVarChar(50), estatusInicial)
                        .query(`INSERT INTO ${ESQ}.CABECERA_PED (ORDERID, CLIENTEID, FECHA, ESTATUS, CODVENDEDOR, TOTALPRECIO)
                                VALUES (@OID, @CLI, GETDATE(), @EST, @VND, @TOT)`);

                    const tabla = new mssql.Table(`${ESQ}.LINEA_PED`);
                    tabla.create = false;
                    tabla.columns.add('ORDERID',        mssql.VarChar(50),  { nullable: false });
                    tabla.columns.add('CODARTICULO',    mssql.Int,           { nullable: false });
                    tabla.columns.add('REFERENCIA',     mssql.VarChar(50),  { nullable: true  });
                    tabla.columns.add('CODALMACEN',     mssql.VarChar(10),  { nullable: false });
                    tabla.columns.add('IDTARIFAV',      mssql.Int,           { nullable: false });
                    tabla.columns.add('PRODUCTCOUNT',   mssql.Int,           { nullable: false });
                    tabla.columns.add('PRECIOUNITARIO', mssql.Float,         { nullable: false });
                    tabla.columns.add('DESCUENTO1',     mssql.Float,         { nullable: true  });
                    tabla.columns.add('DESCUENTO2',     mssql.Float,         { nullable: true  });
                    tabla.columns.add('DESCUENTO3',     mssql.Float,         { nullable: true  });
                    tabla.columns.add('DESCUENTO4',     mssql.Float,         { nullable: true  });
                    tabla.columns.add('PRECIOBRUTO',    mssql.Float,         { nullable: true  });
                    tabla.columns.add('PORCENTAJEIVA',  mssql.Float,         { nullable: true  });
                    tabla.columns.add('MONTOIVA',       mssql.Float,         { nullable: true  });

                    for (const l of chunk) {
                        tabla.rows.add(chunkId, l.codarticulo, '', codAlmacen, tarifaBaseCatalogo,
                            Math.round(l.cantidad), l.precioUnit,
                            0, 0, 0, 0,
                            l.precioUnit, 0, 0);
                    }
                    await new mssql.Request(transaction).bulk(tabla);

                    await new mssql.Request(transaction)
                        .input('OID', mssql.NVarChar(15), chunkId)
                        .input('EST', mssql.NVarChar(50), estatusInicial)
                        .input('DET', mssql.NVarChar(500),
                            `Pedido Farcompras desde ${archivo}. Tipo: ${tipo}. Parte ${ci + 1}/${chunks.length}.`)
                        .query(`INSERT INTO ${ESQ}.APP_PEDIDO_LOG (ORDERID, EST_ANTERIOR, EST_NUEVO, USUARIO, DETALLES)
                                VALUES (@OID, NULL, @EST, 'FARCOMPRAS', @DET)`);

                    orderIds.push(chunkId);
                    console.log(`[Farcompras] ${archivo} → ${chunkId} (${chunk.length} líneas, tipo ${tipo}, parte ${ci + 1}/${chunks.length})`);
                }
            }

            await transaction.commit();
            fs.renameSync(rutaCompleta, rutaCompleta.replace(/\.txt$/i, '.bak'));
            await FarcomprasService.log(archivo, 'PROCESADO', orderIds.join(', '),
                `${lineasAgrupadas.length} línea(s) → ${orderIds.join(', ')}`);

        } catch (e: any) {
            if (transaction) try { await transaction.rollback(); } catch {}
            console.error(`[Farcompras] Error insertando ${baseId}:`, e.message);
            await FarcomprasService.log(archivo, 'ERROR_INSERCION', baseId, e.message.substring(0, 490));
        }
    }

    // ── Ciclo completo ────────────────────────────────────────────────────────

    static async ciclo(): Promise<void> {
        const cfg = await FarcomprasService.getConfig();
        if (!cfg.rutaBase || !fs.existsSync(cfg.rutaBase)) {
            if (cfg.rutaBase) console.warn('[Farcompras] Ruta base no existe:', cfg.rutaBase);
            return;
        }
        try { await FarcomprasService.generarInventario(cfg.rutaBase); }
        catch (e: any) { console.error('[Farcompras] Error generando inventario:', e.message); }
        try { await FarcomprasService.generarClientes(cfg.rutaBase); }
        catch (e: any) { console.error('[Farcompras] Error generando clientes:', e.message); }
        await FarcomprasService.escanearPedidos();
    }

    static async triggerCiclo(): Promise<{ message: string }> {
        FarcomprasService.ciclo().catch(console.error);
        return { message: 'Ciclo Farcompras iniciado' };
    }

    // ── Scheduler ─────────────────────────────────────────────────────────────

    static iniciarScheduler(cfg?: FarcomprasConfig): void {
        FarcomprasService.detenerScheduler();
        const seg = cfg?.intervaloSeg ?? 300;
        console.log(`[Farcompras] Scheduler iniciado — cada ${seg}s`);
        FarcomprasService.ciclo().catch(console.error);
        FarcomprasService.scheduler = setInterval(
            () => FarcomprasService.ciclo().catch(console.error),
            seg * 1000
        );
    }

    static detenerScheduler(): void {
        if (FarcomprasService.scheduler) {
            clearInterval(FarcomprasService.scheduler);
            FarcomprasService.scheduler = null;
            console.log('[Farcompras] Scheduler detenido');
        }
    }

    static schedulerActivo(): boolean {
        return FarcomprasService.scheduler !== null;
    }
}
