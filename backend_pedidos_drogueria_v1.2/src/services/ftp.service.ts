import fs from 'fs';
import os from 'os';
import path from 'path';
import mssql from 'mssql';
import bcrypt from 'bcryptjs';
import { FtpSrv } from 'ftp-srv';
import { connectDb } from '../db/db.conection';
import { getDbConfig } from './dbconfig.service';
import { STOCK_DISPONIBLE_SQL } from './products.service';

const getLocalIp = (): string => {
    for (const ifaces of Object.values(os.networkInterfaces())) {
        for (const iface of ifaces ?? []) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return '127.0.0.1';
};

const esquema = process.env.DB_ESQUEMA || 'dbo';

export class FtpService {
    private static escaneando   = false;
    private static generando    = false;
    private static ftpServer: FtpSrv | null = null;
    private static ftpWatcher: fs.FSWatcher | null = null;
    private static cicloTimer: NodeJS.Timeout | null = null;

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
                        PASSWORD_PLAIN NVARCHAR(100) NULL,
                        COD_CLIENTE    NVARCHAR(50)  NULL,
                        ACTIVO         CHAR(1) NOT NULL DEFAULT 'T',
                        FECHA_CREACION DATETIME NOT NULL DEFAULT GETDATE(),
                        CONSTRAINT UQ_FTP_USUARIO UNIQUE (USUARIO)
                    );
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('APP_FTP_USUARIOS') AND name = 'PASSWORD_PLAIN')
                    ALTER TABLE APP_FTP_USUARIOS ADD PASSWORD_PLAIN NVARCHAR(100) NULL;

                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_FTP_FACTURAS_ENVIADAS')
                    CREATE TABLE APP_FTP_FACTURAS_ENVIADAS (
                        ID          INT IDENTITY PRIMARY KEY,
                        NUMSERIE    NVARCHAR(20) NOT NULL,
                        NUMFACTURA  INT NOT NULL,
                        COD_CLIENTE NVARCHAR(50) NOT NULL,
                        FECHA_ENVIO DATETIME NOT NULL DEFAULT GETDATE(),
                        CONSTRAINT UQ_FTP_FACTURA UNIQUE (NUMSERIE, NUMFACTURA)
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

        // Precios reales del sistema; ignoramos el precio del archivo
        const codigos = [...new Set(lineas.map(l => l.codarticulo))].join(',');
        const preciosRes = await pool.request()
            .input('TARIFA', mssql.Int, tarifa)
            .query(`SELECT CODARTICULO, PNETO FROM PRECIOSVENTA WHERE IDTARIFAV = @TARIFA AND CODARTICULO IN (${codigos})`);
        const preciosSistema = new Map<number, number>(
            preciosRes.recordset.map((r: any) => [r.CODARTICULO, Number(r.PNETO)])
        );
        for (const l of lineas) {
            l.precioUnit = preciosSistema.get(l.codarticulo) ?? 0;
            l.precioTotal = l.precioUnit * l.cantidad;
        }
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
            `SELECT ID, USUARIO, PASSWORD_PLAIN, COD_CLIENTE, ACTIVO, FECHA_CREACION FROM APP_FTP_USUARIOS ORDER BY ID`
        );
        return res.recordset;
    }

    static async crearUsuario(usuario: string, password: string, codCliente: string): Promise<void> {
        const hash = await bcrypt.hash(password, 10);
        const pool = await connectDb();
        await pool.request()
            .input('USR',   mssql.NVarChar(100), usuario.trim())
            .input('HASH',  mssql.NVarChar(255), hash)
            .input('PLAIN', mssql.NVarChar(100), password)
            .input('COD',   mssql.NVarChar(50),  codCliente.trim() || null)
            .query(`INSERT INTO APP_FTP_USUARIOS (USUARIO, PASSWORD_HASH, PASSWORD_PLAIN, COD_CLIENTE) VALUES (@USR, @HASH, @PLAIN, @COD)`);
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
            .input('ID',    mssql.Int,           id)
            .input('HASH',  mssql.NVarChar(255), hash)
            .input('PLAIN', mssql.NVarChar(100), password)
            .query(`UPDATE APP_FTP_USUARIOS SET PASSWORD_HASH = @HASH, PASSWORD_PLAIN = @PLAIN WHERE ID = @ID`);
    }

    // ── Estructura de carpetas por cliente ────────────────────────────────────

    static _crearEstructuraCliente(codCliente: string, ftpPath: string): void {
        const base = path.join(ftpPath, `c${codCliente}`);
        fs.mkdirSync(path.join(base, 'Facturas'), { recursive: true });
        fs.mkdirSync(path.join(base, 'Pedidos'),  { recursive: true });
    }

    // ── Generación de inventario.txt ──────────────────────────────────────────

    static async _generarInventarioCliente(codCliente: string, ftpPath: string): Promise<void> {
        const { tarifaBaseCatalogo, codAlmacen } = getDbConfig();
        const clienteNum = parseInt(codCliente.replace(/^c/i, ''), 10);
        const pool = await connectDb();

        const dtoRes = await pool.request()
            .input('CLI', mssql.Int, clienteNum)
            .query(`SELECT ISNULL(TRY_CAST(D1 AS FLOAT), 0) AS D1 FROM CLIENTESCAMPOSLIBRES WHERE CODCLIENTE = @CLI`);
        const d1Cliente = Number(dtoRes.recordset[0]?.D1 ?? 0);

        const result = await pool.request()
            .input('TARIFA',  mssql.Int,         tarifaBaseCatalogo)
            .input('ALMACEN', mssql.VarChar(10), codAlmacen)
            .input('CLI',     mssql.Int,         clienteNum)
            .query(`
                SELECT A.CODARTICULO,
                    A.REFPROVEEDOR,
                    ACL.DESCRIPCIONLARGA AS DESCRIPCION,
                    ISNULL(A.NODTOAPLICABLE, 0) AS NODTO,
                    (SELECT TOP 1
                        CONVERT(NVARCHAR(10),
                            COALESCE(TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 103), TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 23)),
                            103)
                     FROM ARTICULOSLIN AL WITH(NOLOCK)
                     WHERE AL.CODARTICULO = A.CODARTICULO
                       AND COALESCE(TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 103), TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 23)) >= CAST(GETDATE() AS DATE)
                     ORDER BY COALESCE(TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 103), TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 23))
                    ) AS VENCE,
                    PV.PNETO AS PRECIO,
                    ISNULL(M.DESCRIPCION, '') AS MARCA,
                    ${STOCK_DISPONIBLE_SQL} AS STOCK_DISP,
                    ISNULL((
                        SELECT TOP 1 E.PORCENTAJE
                        FROM APP_PROMOCIONES P
                        INNER JOIN APP_PROMOCIONES_GRUPOS_ARTICULOS GA ON GA.IDPROMO = P.ID AND GA.TIPO = 'INCLUIR'
                        INNER JOIN APP_GRUPOS_ARTICULOS G  ON G.ID = GA.IDGRUPO AND G.TIPO <> 'CONDICION'
                        INNER JOIN APP_GRUPOS_ARTICULOS_DETALLE D ON D.IDGRUPO = G.ID AND D.CODARTICULO = A.CODARTICULO
                        INNER JOIN APP_PROMOCIONES_ESCALAS E ON E.IDPROMOCION = P.ID
                        WHERE P.ACTIVO = 1 AND ISNULL(P.SLOT_DESCUENTO, 2) = 1
                          AND CAST(GETDATE() AS DATE) BETWEEN P.FECHAINICIO AND P.FECHAFIN
                          AND ISNULL(A.NODTOAPLICABLE, 0) = 0
                          AND (
                              NOT EXISTS (SELECT 1 FROM APP_PROMOCIONES_GRUPOS_CLIENTES GC WHERE GC.IDPROMO = P.ID)
                              OR EXISTS (SELECT 1 FROM APP_PROMOCIONES_GRUPOS_CLIENTES GC
                                         INNER JOIN APP_GRUPOS_CLIENTES_DETALLE GCD ON GCD.IDGRUPO = GC.IDGRUPO
                                         WHERE GC.IDPROMO = P.ID AND GC.TIPO = 'INCLUIR' AND GCD.CODCLIENTE = @CLI)
                          )
                        ORDER BY E.MINIMO
                    ), 0) AS PROMO1,
                    ISNULL((
                        SELECT TOP 1 E.PORCENTAJE
                        FROM APP_PROMOCIONES P
                        INNER JOIN APP_PROMOCIONES_GRUPOS_ARTICULOS GA ON GA.IDPROMO = P.ID AND GA.TIPO = 'INCLUIR'
                        INNER JOIN APP_GRUPOS_ARTICULOS G  ON G.ID = GA.IDGRUPO AND G.TIPO <> 'CONDICION'
                        INNER JOIN APP_GRUPOS_ARTICULOS_DETALLE D ON D.IDGRUPO = G.ID AND D.CODARTICULO = A.CODARTICULO
                        INNER JOIN APP_PROMOCIONES_ESCALAS E ON E.IDPROMOCION = P.ID
                        WHERE P.ACTIVO = 1 AND ISNULL(P.SLOT_DESCUENTO, 2) = 2
                          AND CAST(GETDATE() AS DATE) BETWEEN P.FECHAINICIO AND P.FECHAFIN
                          AND ISNULL(A.NODTOAPLICABLE, 0) = 0
                          AND (
                              NOT EXISTS (SELECT 1 FROM APP_PROMOCIONES_GRUPOS_CLIENTES GC WHERE GC.IDPROMO = P.ID)
                              OR EXISTS (SELECT 1 FROM APP_PROMOCIONES_GRUPOS_CLIENTES GC
                                         INNER JOIN APP_GRUPOS_CLIENTES_DETALLE GCD ON GCD.IDGRUPO = GC.IDGRUPO
                                         WHERE GC.IDPROMO = P.ID AND GC.TIPO = 'INCLUIR' AND GCD.CODCLIENTE = @CLI)
                          )
                        ORDER BY E.MINIMO
                    ), 0) AS PROMO2
                FROM ARTICULOS A WITH(NOLOCK)
                INNER JOIN ARTICULOSCAMPOSLIBRES ACL WITH(NOLOCK) ON ACL.CODARTICULO = A.CODARTICULO
                INNER JOIN PRECIOSVENTA PV WITH(NOLOCK) ON PV.CODARTICULO = A.CODARTICULO AND PV.IDTARIFAV = @TARIFA
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
        for (const r of result.recordset) {
            const nodto = r.NODTO === 1;
            const d1    = nodto ? 0 : d1Cliente;
            // ponytail: d2 (descuento inventario) - identificar columna origen en BD cuando esté disponible
            const d2    = 0;
            const p1    = nodto ? 0 : Number(r.PROMO1);
            const p2    = nodto ? 0 : Number(r.PROMO2);

            const dtoStr = (d1 || d2 || p1 || p2) ? `${d1}+${d2}+${p1}+${p2}` : '';
            const precio = Number(r.PRECIO);
            const precioFinal = precio * (1 - d1/100) * (1 - d2/100) * (1 - p1/100) * (1 - p2/100);

            lines.push([
                String(r.CODARTICULO).padStart(5, '0'),
                r.REFPROVEEDOR || '',
                (r.DESCRIPCION || '').substring(0, 45).replace(/;/g, ','),
                r.VENCE || '',
                precio.toFixed(2),
                dtoStr,
                precioFinal.toFixed(2),
                Math.max(0, Math.round(Number(r.STOCK_DISP))),
                (r.MARCA || '').substring(0, 30),
            ].join(';'));
        }

        FtpService._crearEstructuraCliente(codCliente, ftpPath);
        const dest = path.join(ftpPath, `c${codCliente}`, 'inventario.txt');
        fs.writeFileSync(dest, lines.join('\r\n'), 'latin1');
        console.log(`[FTP] inventario.txt → c${codCliente}: ${lines.length} arts`);
    }

    // ── Generación de facturas TXT ────────────────────────────────────────────

    static async _generarFacturasCliente(codCliente: string, ftpPath: string): Promise<void> {
        const { tarifaBaseCatalogo } = getDbConfig();
        const clienteNum = parseInt(codCliente.replace(/^c/i, ''), 10);
        const pool = await connectDb();

        // Facturas pendientes de envío (no en APP_FTP_FACTURAS_ENVIADAS)
        const facRes = await pool.request()
            .input('CLI', mssql.Int, clienteNum)
            .query(`
                SELECT FV.NUMSERIE, FV.NUMFACTURA,
                    CONVERT(NVARCHAR(10), CAST(FV.FECHA AS DATE), 103) AS FECHA,
                    ISNULL(TRY_CAST(DBO.F_GET_COTIZACION(FV.FECHA, 1) AS DECIMAL(18,2)), 1) AS TASA,
                    FV.TOTALNETO, FV.TOTALBRUTO, FV.TOTALIMPUESTOS,
                    ISNULL(CAST(CCAM.SICM AS NVARCHAR(20)), '') AS SICM,
                    ISNULL(FCAM.NOCONTROL, '') AS NOFISCAL
                FROM FACTURASVENTA FV WITH(NOLOCK)
                LEFT JOIN CLIENTESCAMPOSLIBRES CCAM WITH(NOLOCK) ON CCAM.CODCLIENTE = FV.CODCLIENTE
                LEFT JOIN FACTURASVENTACAMPOSLIBRES FCAM WITH(NOLOCK)
                    ON FCAM.NUMSERIE COLLATE DATABASE_DEFAULT = FV.NUMSERIE AND FCAM.NUMFACTURA = FV.NUMFACTURA
                WHERE FV.CODCLIENTE = @CLI
                  AND FV.NUMSERIE NOT IN ('ZACN','ZAVN','ZACE','ZAVQ')
                  AND NOT EXISTS (
                      SELECT 1 FROM APP_FTP_FACTURAS_ENVIADAS EV
                      WHERE EV.NUMSERIE COLLATE DATABASE_DEFAULT = FV.NUMSERIE AND EV.NUMFACTURA = FV.NUMFACTURA
                  )
                ORDER BY FV.NUMFACTURA
            `);

        if (!facRes.recordset.length) return;

        const facturaDir = path.join(ftpPath, `c${codCliente}`, 'Facturas');
        fs.mkdirSync(facturaDir, { recursive: true });

        for (const fac of facRes.recordset) {
            try {
                const lineasRes = await pool.request()
                    .input('NS', mssql.NVarChar(20), fac.NUMSERIE)
                    .input('NF', mssql.Int, fac.NUMFACTURA)
                    .query(`
                        SELECT DISTINCT
                            ART.CODARTICULO,
                            A.REFPROVEEDOR,
                            ACL.DESCRIPCIONLARGA AS DESCRIPCION,
                            VENTA.UNIDADESTOTAL AS CANTIDAD,
                            VENTA.TOTAL AS TOTAL_LINEA,
                            ISNULL(LIP.PRECIOBRUTO, PV.PNETO) AS PRECIO_SD,
                            ISNULL(LIP.PRECIOUNITARIO, VENTA.TOTAL / NULLIF(VENTA.UNIDADESTOTAL,0)) AS PRECIO_CD,
                            ISNULL(LIP.DESCUENTO1, 0) AS D1,
                            ISNULL(LIP.DESCUENTO2, 0) AS D2,
                            ISNULL(LIP.DESCUENTO3, 0) AS D3,
                            ISNULL(IMP.IVA, 0) AS TASA_IVA,
                            ISNULL(ALIN.LOTE, '') AS LOTE,
                            ISNULL(CONVERT(NVARCHAR(10), ALIN.GARANTIACOMPRA, 103), '') AS FECHA_LOTE
                        FROM ALBVENTACAB AVC WITH(NOLOCK)
                        INNER JOIN ALBVENTALIN VENTA WITH(NOLOCK)
                            ON VENTA.NUMSERIE = AVC.NUMSERIE AND VENTA.NUMALBARAN = AVC.NUMALBARAN
                        INNER JOIN ARTICULOS ART WITH(NOLOCK) ON ART.CODARTICULO = VENTA.CODARTICULO
                        INNER JOIN ARTICULOSCAMPOSLIBRES ACL WITH(NOLOCK) ON ACL.CODARTICULO = ART.CODARTICULO
                        INNER JOIN ARTICULOS A WITH(NOLOCK) ON A.CODARTICULO = ART.CODARTICULO
                        LEFT  JOIN PRECIOSVENTA PV WITH(NOLOCK)
                            ON PV.CODARTICULO = ART.CODARTICULO AND PV.IDTARIFAV = ${tarifaBaseCatalogo}
                        LEFT  JOIN PEDVENTACAB PED WITH(NOLOCK)
                            ON PED.SERIEALBARAN = AVC.NUMSERIE AND PED.NUMEROALBARAN = AVC.NUMALBARAN AND PED.NALBARAN = AVC.N
                        LEFT  JOIN LINEA_PED LIP WITH(NOLOCK)
                            ON LIP.ORDERID COLLATE DATABASE_DEFAULT = PED.SUPEDIDO AND LIP.CODARTICULO = ART.CODARTICULO
                        LEFT  JOIN IMPUESTOS IMP WITH(NOLOCK) ON IMP.TIPOIVA = VENTA.TIPOIMPUESTO
                        OUTER APPLY (
                            SELECT TOP 1 AL.CODBARRAS AS LOTE,
                                COALESCE(TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 103), TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 23)) AS GARANTIACOMPRA
                            FROM ARTICULOSLIN AL WITH(NOLOCK)
                            WHERE AL.CODARTICULO = ART.CODARTICULO
                            ORDER BY COALESCE(TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 103), TRY_CONVERT(DATE, AL.GARANTIACOMPRA, 23)) DESC
                        ) ALIN
                        WHERE AVC.NUMSERIEFAC COLLATE DATABASE_DEFAULT = @NS AND AVC.NUMFAC = @NF
                          AND VENTA.UNIDADESTOTAL <> 0
                    `);

                if (!lineasRes.recordset.length) continue;

                const numFacPad = String(fac.NUMFACTURA).padStart(8, '0');
                const noFiscal  = fac.NOFISCAL || '';
                const txtLines: string[] = [];
                let totalUnidades = 0;

                for (const l of lineasRes.recordset) {
                    const cant   = Number(l.CANTIDAD);
                    const psd    = Number(l.PRECIO_SD);
                    const pcd    = Number(l.PRECIO_CD);
                    const iva    = Number(l.TASA_IVA);
                    const neto   = cant * pcd * (1 + iva / 100);
                    const dtoStr = [l.D1, l.D2, l.D3].map(Number).join('+');

                    totalUnidades += cant;
                    txtLines.push([
                        'R',
                        numFacPad,
                        noFiscal,
                        String(l.CODARTICULO).padStart(5, '0'),
                        l.REFPROVEEDOR || '',
                        (l.DESCRIPCION || '').substring(0, 40).replace(/;/g, ','),
                        cant.toFixed(3),
                        neto.toFixed(2),
                        psd.toFixed(2),
                        dtoStr,
                        pcd.toFixed(2),
                        l.LOTE || '',
                        l.FECHA_LOTE || '',
                        iva.toFixed(2),
                    ].join(';'));
                }

                const totNeto  = Number(fac.TOTALNETO);
                const totBruto = Number(fac.TOTALBRUTO);
                const totIva   = Number(fac.TOTALIMPUESTOS);
                const desLineal = Math.max(0, totBruto - totNeto);

                txtLines.push([
                    'E',
                    numFacPad,
                    noFiscal,
                    fac.FECHA,
                    Number(fac.TASA).toFixed(2),
                    '',
                    Math.round(totalUnidades),
                    totNeto.toFixed(2),
                    (totNeto + totIva).toFixed(2),
                    desLineal.toFixed(2),
                    totIva.toFixed(2),
                    '',
                    fac.SICM,
                    totIva.toFixed(2),
                ].join(';'));

                const dest = path.join(facturaDir, `F${String(fac.NUMFACTURA).padStart(8, '0')}.txt`);
                fs.writeFileSync(dest, txtLines.join('\r\n'), 'latin1');

                await pool.request()
                    .input('NS',  mssql.NVarChar(20), fac.NUMSERIE)
                    .input('NF',  mssql.Int, fac.NUMFACTURA)
                    .input('CLI', mssql.NVarChar(50), codCliente)
                    .query(`INSERT INTO APP_FTP_FACTURAS_ENVIADAS (NUMSERIE, NUMFACTURA, COD_CLIENTE) VALUES (@NS, @NF, @CLI)`);

                console.log(`[FTP] factura F${numFacPad}.txt → c${codCliente}`);
                await FtpService.registrarAuditoria(`F${numFacPad}.txt`, 'FACTURA_ENVIADA', codCliente, numFacPad);
            } catch (err) {
                console.error(`[FTP] Error generando factura ${fac.NUMFACTURA}:`, err);
            }
        }
    }

    // ── Ciclo completo (inventario + facturas + pedidos) ─────────────────────

    static async cicloFtp(): Promise<void> {
        if (FtpService.generando) return;
        FtpService.generando = true;
        try {
            const ftpPath = await FtpService.getConfig();
            if (!ftpPath || !fs.existsSync(ftpPath)) return;

            const pool = await connectDb();
            const usrs = await pool.request().query(
                `SELECT DISTINCT COD_CLIENTE FROM APP_FTP_USUARIOS WHERE ACTIVO = 'T' AND COD_CLIENTE IS NOT NULL`
            );

            for (const u of usrs.recordset) {
                const cod = String(u.COD_CLIENTE);
                try {
                    await FtpService._generarInventarioCliente(cod, ftpPath);
                    await FtpService._generarFacturasCliente(cod, ftpPath);
                } catch (err) {
                    console.error(`[FTP] Error en ciclo para cliente ${cod}:`, err);
                }
            }

            // Después de escribir, leer pedidos nuevos
            await FtpService._escanearInterno();
        } finally {
            FtpService.generando = false;
        }
    }

    static async triggerCiclo(): Promise<{ message: string }> {
        if (FtpService.generando) return { message: 'Ciclo FTP ya en progreso' };
        FtpService.cicloFtp().catch(console.error);
        return { message: 'Ciclo FTP iniciado' };
    }

    private static iniciarCicloFtp(): void {
        FtpService.detenerCicloFtp();
        // Ejecutar inmediatamente y luego cada 10 minutos
        FtpService.cicloFtp().catch(console.error);
        FtpService.cicloTimer = setInterval(() => FtpService.cicloFtp().catch(console.error), 10 * 60 * 1000);
        console.log('[FTP] Ciclo automático iniciado (10 min)');
    }

    private static detenerCicloFtp(): void {
        if (FtpService.cicloTimer) {
            clearInterval(FtpService.cicloTimer);
            FtpService.cicloTimer = null;
        }
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

        const serverOpts: any = {
            url:       `ftp://0.0.0.0:${puerto}`,
            anonymous: false,
            pasv_url:  cfg.ftpIpExterna || getLocalIp(),
            pasv_min:  pasivoMin,
            pasv_max:  pasivoMax,
            greeting:  ['Bienvenido - Pedidos Drogueria FTP'],
        };

        const server = new FtpSrv(serverOpts);

        server.on('login', async ({ username, password }: any, resolve: any, reject: any) => {
            try {
                const user = await FtpService._getUsuarioPorNombre(username);
                if (!user || user.ACTIVO !== 'T') {
                    return reject(new Error('Usuario inactivo o no encontrado'));
                }
                const valid = await bcrypt.compare(password, user.PASSWORD_HASH);
                if (!valid) return reject(new Error('Credenciales incorrectas'));

                const ftpPath = await FtpService.getConfig();
                if (!ftpPath) return reject(new Error('Ruta FTP no configurada en el servidor'));

                if (user.COD_CLIENTE) {
                    const cod = String(user.COD_CLIENTE);
                    FtpService._crearEstructuraCliente(cod, ftpPath);
                    // Regenerar inventario en cada conexión del cliente (datos frescos)
                    FtpService._generarInventarioCliente(cod, ftpPath).catch(console.error);
                    FtpService._generarFacturasCliente(cod, ftpPath).catch(console.error);
                    resolve({ root: path.join(ftpPath, `c${cod}`) });
                } else {
                    resolve({ root: ftpPath });
                }
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

            FtpService.iniciarCicloFtp();
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
        FtpService.detenerCicloFtp();
        if (FtpService.ftpWatcher) {
            FtpService.ftpWatcher.close();
            FtpService.ftpWatcher = null;
        }
        console.log('[FTP] Servidor detenido');
        return { ok: true, message: 'Servidor FTP detenido' };
    }
}
