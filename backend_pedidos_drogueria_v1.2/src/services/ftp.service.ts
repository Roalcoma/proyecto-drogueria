import fs from 'fs';
import path from 'path';
import mssql from 'mssql';
import bcrypt from 'bcryptjs';
import { FtpServer } from 'ftp-srv';
import { connectDb } from '../db/db.conection';
import { getDbConfig } from './dbconfig.service';

const esquema = process.env.DB_ESQUEMA || 'dbo';

export class FtpService {
    private static escaneando = false;
    private static ftpServer: FtpServer | null = null;
    private static ftpWatcher: fs.FSWatcher | null = null;

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_FTP_CONFIG')
                    CREATE TABLE APP_FTP_CONFIG (
                        ID   INT PRIMARY KEY DEFAULT 1,
                        RUTA NVARCHAR(500) NOT NULL DEFAULT '',
                        CONSTRAINT CK_FTP_CONFIG_ID CHECK (ID = 1)
                    );
                IF NOT EXISTS (SELECT 1 FROM APP_FTP_CONFIG WHERE ID = 1)
                    INSERT INTO APP_FTP_CONFIG (ID, RUTA) VALUES (1, '');

                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_FTP_AUDITORIA')
                    CREATE TABLE APP_FTP_AUDITORIA (
                        ID      INT IDENTITY PRIMARY KEY,
                        ARCHIVO NVARCHAR(500) NOT NULL,
                        FECHA   DATETIME NOT NULL DEFAULT GETUTCDATE(),
                        EVENTO  NVARCHAR(50)  NOT NULL,
                        COD_CLI NVARCHAR(50)  NULL,
                        ORDERID NVARCHAR(200) NULL,
                        MENSAJE NVARCHAR(500) NULL
                    );
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_FTPAUD_ARCH' AND object_id=OBJECT_ID('APP_FTP_AUDITORIA'))
                    CREATE INDEX IX_FTPAUD_ARCH ON APP_FTP_AUDITORIA (ARCHIVO, FECHA);

                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_FTP_USUARIOS')
                    CREATE TABLE APP_FTP_USUARIOS (
                        ID             INT IDENTITY(1,1) PRIMARY KEY,
                        USUARIO        NVARCHAR(100) NOT NULL,
                        PASSWORD_HASH  NVARCHAR(255) NOT NULL,
                        COD_CLIENTE    NVARCHAR(50)  NULL,
                        ACTIVO         CHAR(1) NOT NULL DEFAULT 'T',
                        FECHA_CREACION DATETIME NOT NULL DEFAULT GETDATE(),
                        CONSTRAINT UQ_FTP_USUARIO UNIQUE (USUARIO)
                    );
            `);
            console.log('[FTP] Tablas verificadas/creadas');
        } catch (err) {
            console.error('[FTP] Error en initTablas:', err);
        }
    }

    // ── Configuración de ruta de escaneo ──────────────────────────────────────

    static async getConfig(): Promise<string> {
        const pool = await connectDb();
        const res = await pool.request().query(`SELECT RUTA FROM APP_FTP_CONFIG WHERE ID = 1`);
        return res.recordset[0]?.RUTA ?? '';
    }

    static async setConfig(ruta: string): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('RUTA', mssql.NVarChar(500), ruta)
            .query(`UPDATE APP_FTP_CONFIG SET RUTA = @RUTA WHERE ID = 1`);
    }

    // ── Auditoría ─────────────────────────────────────────────────────────────

    private static async registrarAuditoria(
        archivo: string, evento: string, codCli?: string, orderId?: string, mensaje?: string
    ): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request()
                .input('ARCH', mssql.NVarChar(500), archivo)
                .input('EVT',  mssql.NVarChar(50),  evento)
                .input('COD',  mssql.NVarChar(50),  codCli  ?? null)
                .input('OID',  mssql.NVarChar(200), orderId ?? null)
                .input('MSG',  mssql.NVarChar(500), mensaje ? mensaje.substring(0, 500) : null)
                .query(`INSERT INTO APP_FTP_AUDITORIA (ARCHIVO, FECHA, EVENTO, COD_CLI, ORDERID, MENSAJE)
                        VALUES (@ARCH, GETUTCDATE(), @EVT, @COD, @OID, @MSG)`);
        } catch {}
    }

    static async getAuditoria(search: string, page: number, limit: number): Promise<{ data: any[]; total: number }> {
        const pool = await connectDb();
        const filtro = `%${search ?? ''}%`;
        const safeLimit = limit === -1 ? 10000 : Math.max(1, limit);
        const offset    = limit === -1 ? 0 : (Math.max(1, page) - 1) * safeLimit;

        const [totalRes, dataRes] = await Promise.all([
            pool.request()
                .input('F', mssql.NVarChar, filtro)
                .query(`SELECT COUNT(*) AS T FROM APP_FTP_AUDITORIA
                        WHERE ARCHIVO LIKE @F OR EVENTO LIKE @F
                           OR ISNULL(COD_CLI,'') LIKE @F OR ISNULL(ORDERID,'') LIKE @F OR ISNULL(MENSAJE,'') LIKE @F`),
            pool.request()
                .input('F',   mssql.NVarChar, filtro)
                .input('OFF', mssql.Int, offset)
                .input('LIM', mssql.Int, safeLimit)
                .query(`SELECT * FROM APP_FTP_AUDITORIA
                        WHERE ARCHIVO LIKE @F OR EVENTO LIKE @F
                           OR ISNULL(COD_CLI,'') LIKE @F OR ISNULL(ORDERID,'') LIKE @F OR ISNULL(MENSAJE,'') LIKE @F
                        ORDER BY FECHA DESC
                        OFFSET @OFF ROWS FETCH NEXT @LIM ROWS ONLY`),
        ]);

        return { data: dataRes.recordset, total: totalRes.recordset[0].T };
    }

    // ── Escaneo de archivos ───────────────────────────────────────────────────

    static async escanearCarpeta(): Promise<void> {
        if (FtpService.escaneando) return;
        FtpService.escaneando = true;
        try {
            await FtpService._escanearInterno();
        } finally {
            FtpService.escaneando = false;
        }
    }

    private static async _escanearInterno(): Promise<void> {
        const ftpPath = await FtpService.getConfig();
        if (!ftpPath) {
            console.log('[FTP] Ruta no configurada, omitiendo escaneo');
            return;
        }
        if (!fs.existsSync(ftpPath)) {
            console.warn(`[FTP] Ruta no existe: ${ftpPath}`);
            return;
        }

        let clientDirs: string[];
        try {
            clientDirs = fs.readdirSync(ftpPath)
                .map(d => path.join(ftpPath, d))
                .filter(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
        } catch (err) {
            console.error('[FTP] Error leyendo directorio:', err);
            return;
        }

        for (const clientDir of clientDirs) {
            const pedidosDir = path.join(clientDir, 'Pedidos');
            if (!fs.existsSync(pedidosDir)) continue;

            let archivos: string[];
            try {
                archivos = fs.readdirSync(pedidosDir).filter(f => f.toLowerCase().endsWith('.txt'));
            } catch { continue; }

            for (const archivo of archivos) {
                const rutaCompleta = path.join(pedidosDir, archivo);
                try {
                    await FtpService._procesarArchivo(rutaCompleta, archivo);
                } catch (err) {
                    console.error(`[FTP] Error crítico en ${archivo}:`, err);
                    FtpService.registrarAuditoria(archivo, 'ERROR_CRITICO', undefined, undefined, String(err).substring(0, 500)).catch(() => {});
                }
            }
        }
    }

    private static async _procesarArchivo(rutaCompleta: string, archivo: string): Promise<void> {
        const match = archivo.match(/^(.+)P(\d+)\.txt$/i);
        if (!match) {
            await FtpService.registrarAuditoria(archivo, 'PARSE_ERROR', undefined, undefined, 'Nombre de archivo no reconocido (esperado: {cliente}P{numero}.txt)');
            return;
        }
        const codCli    = match[1];
        const numPedido = match[2];
        const orderId   = `FP-${codCli}-${numPedido}`;

        const pool = await connectDb();

        const dup = await pool.request()
            .input('OID', mssql.VarChar(50), orderId)
            .query(`SELECT 1 FROM ${esquema}.CABECERA_PED WHERE ORDERID = @OID`);
        if (dup.recordset.length > 0) {
            await FtpService.registrarAuditoria(archivo, 'YA_PROCESADO', codCli, orderId);
            try { fs.renameSync(rutaCompleta, rutaCompleta.replace(/\.txt$/i, '.bak')); } catch {}
            return;
        }

        const clienteRes = await pool.request()
            .input('COD', mssql.NVarChar(50), codCli.replace(/^c/i, ''))
            .query(`SELECT TOP 1 CODCLIENTE,
                        ISNULL((SELECT TOP 1 CAST(CCL.CODVENDEDOR AS INT) FROM CLIENTESCAMPOSLIBRES CCL
                                WHERE CCL.CODCLIENTE = CL.CODCLIENTE AND CCL.CODVENDEDOR IS NOT NULL
                                  AND LTRIM(RTRIM(CAST(CCL.CODVENDEDOR AS NVARCHAR))) != ''), 1) AS CODVENDEDOR
                    FROM CLIENTES CL
                    WHERE CAST(CODCLIENTE AS NVARCHAR(50)) = @COD
                       OR CODCLIENTE = TRY_CAST(@COD AS INT)`);
        if (clienteRes.recordset.length === 0) {
            await FtpService.registrarAuditoria(archivo, 'CLIENTE_NO_ENCONTRADO', codCli, orderId,
                `Cliente '${codCli}' no existe en el sistema`);
            return;
        }
        const { CODCLIENTE, CODVENDEDOR } = clienteRes.recordset[0];

        let contenido: string;
        try {
            contenido = fs.readFileSync(rutaCompleta, 'latin1');
        } catch (err) {
            await FtpService.registrarAuditoria(archivo, 'PARSE_ERROR', codCli, orderId, `Error leyendo archivo: ${err}`);
            return;
        }

        const lineas = contenido
            .split('\n')
            .map(l => l.trim().replace(/\r$/, ''))
            .filter(l => l.length > 0)
            .map(l => {
                const f = l.split(';');
                const cantidad    = parseFloat((f[2] ?? '0').replace(',', '.'));
                const precioTotal = parseFloat((f[3] ?? '0').replace(',', '.'));
                return {
                    codarticulo: parseInt((f[0] ?? '').trim(), 10),
                    descripcion: (f[1] ?? '').trim(),
                    cantidad,
                    precioTotal,
                    precioUnit: cantidad > 0 ? precioTotal / cantidad : 0,
                };
            })
            .filter(l => l.codarticulo > 0 && l.cantidad > 0);

        if (lineas.length === 0) {
            await FtpService.registrarAuditoria(archivo, 'PARSE_ERROR', codCli, orderId, 'Archivo sin líneas válidas');
            return;
        }

        const maxLineas   = getDbConfig().maxLineasPorPedido ?? 0;
        const cfg         = getDbConfig();
        const tarifa      = cfg.tarifaBaseCatalogo;
        const almacen     = cfg.codAlmacen;
        const totalChunks = maxLineas > 0 && lineas.length > maxLineas
            ? Math.ceil(lineas.length / maxLineas) : 1;
        const chunks: typeof lineas[] = [];
        for (let i = 0; i < lineas.length; i += (maxLineas > 0 ? maxLineas : lineas.length)) {
            chunks.push(lineas.slice(i, maxLineas > 0 ? i + maxLineas : lineas.length));
        }

        const orderIds: string[] = [];
        try {
            for (let ci = 0; ci < chunks.length; ci++) {
                const chunk      = chunks[ci];
                const chunkId    = ci === 0 ? orderId : `${orderId}-${ci + 1}`;
                const totalChunk = chunk.reduce((s, l) => s + l.precioTotal, 0);

                await pool.request()
                    .input('OID', mssql.NVarChar(50), chunkId)
                    .input('CLI', mssql.Int, CODCLIENTE)
                    .input('VND', mssql.Int, CODVENDEDOR)
                    .input('TOT', mssql.Decimal(18, 2), totalChunk)
                    .query(`INSERT INTO ${esquema}.CABECERA_PED (ORDERID, CLIENTEID, FECHA, ESTATUS, CODVENDEDOR, TOTALPRECIO)
                            VALUES (@OID, @CLI, GETDATE(), 'PENDIENTE', @VND, @TOT)`);

                const tabla = new mssql.Table(`${esquema}.LINEA_PED`);
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
                    tabla.rows.add(chunkId, l.codarticulo, '', almacen, tarifa,
                        Math.round(l.cantidad), l.precioUnit, 0, 0, 0, 0, l.precioUnit, 0, 0);
                }
                await pool.request().bulk(tabla);

                await pool.request()
                    .input('OID', mssql.NVarChar(50), chunkId)
                    .input('EST', mssql.NVarChar(50), 'PENDIENTE')
                    .input('DET', mssql.NVarChar(500),
                        `Pedido FTP importado desde ${archivo}. Cliente: ${codCli}. Parte ${ci + 1}/${totalChunks}.`)
                    .query(`INSERT INTO ${esquema}.APP_PEDIDO_LOG (ORDERID, EST_ANTERIOR, EST_NUEVO, USUARIO, DETALLES)
                            VALUES (@OID, NULL, @EST, 'FTP', @DET)`);

                orderIds.push(chunkId);
                console.log(`[FTP] ${archivo} → ${chunkId} (${chunk.length} líneas, parte ${ci + 1}/${totalChunks})`);
            }

            fs.renameSync(rutaCompleta, rutaCompleta.replace(/\.txt$/i, '.bak'));
            await FtpService.registrarAuditoria(archivo, 'PROCESADO', codCli, orderIds.join(', '),
                `${lineas.length} línea(s) → ${orderIds.join(', ')}`);

        } catch (err) {
            console.error(`[FTP] Error insertando ${orderId}:`, err);
            await FtpService.registrarAuditoria(archivo, 'ERROR_INSERCION', codCli, orderId,
                String(err).substring(0, 500));
        }
    }

    static async triggerEscaneo(): Promise<{ message: string }> {
        if (FtpService.escaneando) return { message: 'Escaneo ya en progreso' };
        FtpService.escanearCarpeta().catch(console.error);
        return { message: 'Escaneo iniciado' };
    }

    // ── Gestión de usuarios FTP ───────────────────────────────────────────────

    static async getUsuarios(): Promise<any[]> {
        const pool = await connectDb();
        const res = await pool.request().query(
            `SELECT ID, USUARIO, COD_CLIENTE, ACTIVO, FECHA_CREACION FROM APP_FTP_USUARIOS ORDER BY ID`
        );
        return res.recordset;
    }

    static async crearUsuario(usuario: string, password: string, codCliente: string): Promise<void> {
        const hash = await bcrypt.hash(password, 10);
        const pool = await connectDb();
        await pool.request()
            .input('USR',  mssql.NVarChar(100), usuario.trim())
            .input('HASH', mssql.NVarChar(255), hash)
            .input('COD',  mssql.NVarChar(50),  codCliente.trim() || null)
            .query(`INSERT INTO APP_FTP_USUARIOS (USUARIO, PASSWORD_HASH, COD_CLIENTE) VALUES (@USR, @HASH, @COD)`);
    }

    static async eliminarUsuario(id: number): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('ID', mssql.Int, id)
            .query(`DELETE FROM APP_FTP_USUARIOS WHERE ID = @ID`);
    }

    static async toggleUsuario(id: number): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('ID', mssql.Int, id)
            .query(`UPDATE APP_FTP_USUARIOS SET ACTIVO = CASE WHEN ACTIVO = 'T' THEN 'F' ELSE 'T' END WHERE ID = @ID`);
    }

    static async cambiarPassword(id: number, password: string): Promise<void> {
        const hash = await bcrypt.hash(password, 10);
        const pool = await connectDb();
        await pool.request()
            .input('ID',   mssql.Int,           id)
            .input('HASH', mssql.NVarChar(255), hash)
            .query(`UPDATE APP_FTP_USUARIOS SET PASSWORD_HASH = @HASH WHERE ID = @ID`);
    }

    private static async _getUsuarioPorNombre(usuario: string): Promise<any | null> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('USR', mssql.NVarChar(100), usuario)
            .query(`SELECT * FROM APP_FTP_USUARIOS WHERE USUARIO = @USR`);
        return res.recordset[0] ?? null;
    }

    // ── Servidor FTP embebido ─────────────────────────────────────────────────

    static getEstadoServidor(): { activo: boolean; puerto: number } {
        const cfg = getDbConfig();
        return { activo: FtpService.ftpServer !== null, puerto: cfg.ftpPuerto };
    }

    static async iniciarServidor(): Promise<{ ok: boolean; message: string }> {
        if (FtpService.ftpServer) return { ok: false, message: 'El servidor FTP ya está en ejecución' };

        const cfg       = getDbConfig();
        const puerto    = cfg.ftpPuerto;
        const pasivoMin = cfg.ftpPasivoMin;
        const pasivoMax = cfg.ftpPasivoMax;
        const ipExterna = cfg.ftpIpExterna || '0.0.0.0';

        const server = new FtpServer({
            url:       `ftp://0.0.0.0:${puerto}`,
            anonymous: false,
            pasv_url:  ipExterna,
            pasv_min:  pasivoMin,
            pasv_max:  pasivoMax,
            greeting:  ['Bienvenido - Pedidos Drogueria FTP'],
        });

        server.on('login', async ({ username, password }, resolve, reject) => {
            try {
                const user = await FtpService._getUsuarioPorNombre(username);
                if (!user || user.ACTIVO !== 'T') {
                    return reject(new Error('Usuario inactivo o no encontrado'));
                }
                const valid = await bcrypt.compare(password, user.PASSWORD_HASH);
                if (!valid) return reject(new Error('Credenciales incorrectas'));

                const ftpPath  = await FtpService.getConfig();
                const userRoot = path.join(ftpPath, `c${user.COD_CLIENTE}`);
                fs.mkdirSync(path.join(userRoot, 'Pedidos'), { recursive: true });
                resolve({ root: userRoot });
            } catch (err: any) {
                reject(err);
            }
        });

        try {
            await server.listen();
            FtpService.ftpServer = server;

            // Detectar archivos nuevos y disparar escaneo (debounce 3s)
            const ftpPath = await FtpService.getConfig();
            if (ftpPath && fs.existsSync(ftpPath)) {
                let scanTimer: ReturnType<typeof setTimeout> | null = null;
                FtpService.ftpWatcher = fs.watch(ftpPath, { recursive: true }, (_evt, filename) => {
                    if (filename && filename.toLowerCase().endsWith('.txt')) {
                        if (scanTimer) clearTimeout(scanTimer);
                        scanTimer = setTimeout(() => FtpService.escanearCarpeta().catch(console.error), 3000);
                    }
                });
            }

            console.log(`[FTP] Servidor iniciado en puerto ${puerto}`);
            return { ok: true, message: `Servidor FTP iniciado en puerto ${puerto}` };
        } catch (err: any) {
            FtpService.ftpServer = null;
            const msg = `Error al iniciar servidor FTP: ${err.message ?? err}`;
            console.error('[FTP]', msg);
            return { ok: false, message: msg };
        }
    }

    static async detenerServidor(): Promise<{ ok: boolean; message: string }> {
        if (!FtpService.ftpServer) return { ok: false, message: 'El servidor FTP no está en ejecución' };
        try { await FtpService.ftpServer.close(); } catch {}
        FtpService.ftpServer = null;
        if (FtpService.ftpWatcher) {
            FtpService.ftpWatcher.close();
            FtpService.ftpWatcher = null;
        }
        console.log('[FTP] Servidor detenido');
        return { ok: true, message: 'Servidor FTP detenido' };
    }
}
