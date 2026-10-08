import mssql from 'mssql';
import { connectDb } from '../db/db.conection';
import { getDbConfig } from './dbconfig.service';

const esquema = process.env.DB_ESQUEMA || 'dbo';
const ESTATUS_RESERVA = `'PENDIENTE POR AUTORIZACION','APROBACION PSICOTROPICOS','SANIDAD','AUTORIZADO','EMPACADO','OK'`;
const INTERVALO_MS = 5 * 60_000;

// Solo LEE tablas de ICG (STOCKS, MOVIMENTS, ALBVENTA*). Escribe únicamente en APP_ALERTAS_STOCK.
export class StockMonitorService {
    private static timer: NodeJS.Timeout | null = null;
    private static revisando = false;

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'APP_ALERTAS_STOCK')
                    CREATE TABLE ${esquema}.APP_ALERTAS_STOCK (
                        ID                    INT IDENTITY(1,1) PRIMARY KEY,
                        CODARTICULO           INT            NOT NULL,
                        DESCRIPCION           NVARCHAR(255)  NULL,
                        STOCK                 FLOAT          NOT NULL,
                        RESERVADO             FLOAT          NOT NULL,
                        DEFICIT               FLOAT          NOT NULL,
                        DEFICIT_MAXIMO        FLOAT          NOT NULL,
                        PEDIDOS               NVARCHAR(MAX)  NULL,
                        MOVIMIENTOS           NVARCHAR(MAX)  NULL,
                        FECHA_DETECCION       DATETIME       NOT NULL DEFAULT GETDATE(),
                        FECHA_ULTIMA_REVISION DATETIME       NOT NULL DEFAULT GETDATE(),
                        RESUELTA              BIT            NOT NULL DEFAULT 0,
                        FECHA_RESOLUCION      DATETIME       NULL
                    );
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ALERTAS_STOCK_ART' AND object_id = OBJECT_ID('${esquema}.APP_ALERTAS_STOCK'))
                    CREATE INDEX IX_ALERTAS_STOCK_ART ON ${esquema}.APP_ALERTAS_STOCK (RESUELTA, CODARTICULO);
            `);
            console.log('[StockMonitor] Tabla APP_ALERTAS_STOCK verificada.');
        } catch (err) {
            console.error('[StockMonitor] initTablas:', err);
        }
    }

    static iniciar(): void {
        if (StockMonitorService.timer) return;
        StockMonitorService.revisar().catch(e => console.error('[StockMonitor]', e));
        StockMonitorService.timer = setInterval(
            () => StockMonitorService.revisar().catch(e => console.error('[StockMonitor]', e)),
            INTERVALO_MS
        );
        console.log(`[StockMonitor] Revisión de sobregiros cada ${INTERVALO_MS / 60_000} min`);
    }

    // Detecta artículos donde lo reservado por pedidos de la app supera el stock de ICG.
    // Alta: nueva alerta con pedidos afectados y movimientos de ICG que sacaron stock. Sigue: actualiza. Se normaliza: resuelve.
    static async revisar(): Promise<{ nuevas: number; activas: number; resueltas: number }> {
        if (StockMonitorService.revisando) return { nuevas: 0, activas: 0, resueltas: 0 };
        StockMonitorService.revisando = true;
        try {
            const pool = await connectDb();
            const { codAlmacen } = getDbConfig();

            const sobregiros = (await pool.request()
                .input('ALMACEN', mssql.VarChar(10), codAlmacen)
                .query(`
                    ;WITH R AS (
                        SELECT LP.CODARTICULO, SUM(LP.PRODUCTCOUNT) AS RESERVADO
                        FROM ${esquema}.CABECERA_PED CP WITH (NOLOCK)
                        INNER JOIN ${esquema}.LINEA_PED LP WITH (NOLOCK) ON LP.ORDERID = CP.ORDERID
                        WHERE CP.ESTATUS IN (${ESTATUS_RESERVA})
                        GROUP BY LP.CODARTICULO
                    )
                    SELECT R.CODARTICULO, A.DESCRIPCION, ISNULL(S.STOCK, 0) AS STOCK, R.RESERVADO
                    FROM R
                    LEFT JOIN ARTICULOS A WITH (NOLOCK) ON A.CODARTICULO = R.CODARTICULO
                    OUTER APPLY (SELECT SUM(STOCK) AS STOCK FROM STOCKS WITH (NOLOCK)
                                 WHERE CODARTICULO = R.CODARTICULO AND CODALMACEN = @ALMACEN) S
                    WHERE R.RESERVADO > ISNULL(S.STOCK, 0)
                `)).recordset;

            const activas = (await pool.request()
                .query(`SELECT ID, CODARTICULO, DEFICIT_MAXIMO FROM ${esquema}.APP_ALERTAS_STOCK WITH (NOLOCK) WHERE RESUELTA = 0`)).recordset;
            const activaPorArt = new Map<number, any>(activas.map((a: any) => [Number(a.CODARTICULO), a]));
            const enSobregiro = new Set<number>(sobregiros.map((s: any) => Number(s.CODARTICULO)));

            let nuevas = 0;
            for (const s of sobregiros) {
                const cod = Number(s.CODARTICULO);
                const deficit = Number(s.RESERVADO) - Number(s.STOCK);
                const pedidos = JSON.stringify(await StockMonitorService.pedidosQueReservan(cod));
                const actual = activaPorArt.get(cod);
                if (actual) {
                    await pool.request()
                        .input('ID', mssql.Int, actual.ID)
                        .input('STOCK', mssql.Float, Number(s.STOCK))
                        .input('RES', mssql.Float, Number(s.RESERVADO))
                        .input('DEF', mssql.Float, deficit)
                        .input('PED', mssql.NVarChar(mssql.MAX), pedidos)
                        .query(`UPDATE ${esquema}.APP_ALERTAS_STOCK
                                SET STOCK = @STOCK, RESERVADO = @RES, DEFICIT = @DEF,
                                    DEFICIT_MAXIMO = CASE WHEN @DEF > DEFICIT_MAXIMO THEN @DEF ELSE DEFICIT_MAXIMO END,
                                    PEDIDOS = @PED, FECHA_ULTIMA_REVISION = GETDATE()
                                WHERE ID = @ID`);
                } else {
                    const movimientos = JSON.stringify(await StockMonitorService.movimientosRecientes(cod));
                    await pool.request()
                        .input('COD', mssql.Int, cod)
                        .input('DESC', mssql.NVarChar(255), s.DESCRIPCION ?? null)
                        .input('STOCK', mssql.Float, Number(s.STOCK))
                        .input('RES', mssql.Float, Number(s.RESERVADO))
                        .input('DEF', mssql.Float, deficit)
                        .input('PED', mssql.NVarChar(mssql.MAX), pedidos)
                        .input('MOV', mssql.NVarChar(mssql.MAX), movimientos)
                        .query(`INSERT INTO ${esquema}.APP_ALERTAS_STOCK
                                    (CODARTICULO, DESCRIPCION, STOCK, RESERVADO, DEFICIT, DEFICIT_MAXIMO, PEDIDOS, MOVIMIENTOS)
                                VALUES (@COD, @DESC, @STOCK, @RES, @DEF, @DEF, @PED, @MOV)`);
                    nuevas++;
                }
            }

            const aResolver = activas.filter((a: any) => !enSobregiro.has(Number(a.CODARTICULO)));
            for (const a of aResolver) {
                await pool.request()
                    .input('ID', mssql.Int, a.ID)
                    .query(`UPDATE ${esquema}.APP_ALERTAS_STOCK
                            SET RESUELTA = 1, FECHA_RESOLUCION = GETDATE(), FECHA_ULTIMA_REVISION = GETDATE()
                            WHERE ID = @ID`);
            }

            if (nuevas || aResolver.length) {
                console.log(`[StockMonitor] ${nuevas} alerta(s) nueva(s), ${aResolver.length} resuelta(s), ${sobregiros.length} activa(s)`);
            }
            return { nuevas, activas: sobregiros.length, resueltas: aResolver.length };
        } finally {
            StockMonitorService.revisando = false;
        }
    }

    static async pedidosQueReservan(codarticulo: number): Promise<any[]> {
        const pool = await connectDb();
        return (await pool.request()
            .input('COD', mssql.Int, codarticulo)
            .query(`
                SELECT CP.ORDERID, CP.ESTATUS, CP.CLIENTEID, ISNULL(CL.NOMBRECLIENTE, '') AS CLIENTE,
                       CONVERT(VARCHAR(16), CP.FECHA, 120) AS FECHA, SUM(LP.PRODUCTCOUNT) AS CANTIDAD
                FROM ${esquema}.CABECERA_PED CP WITH (NOLOCK)
                INNER JOIN ${esquema}.LINEA_PED LP WITH (NOLOCK) ON LP.ORDERID = CP.ORDERID
                LEFT JOIN CLIENTES CL WITH (NOLOCK) ON CL.CODCLIENTE = CP.CLIENTEID
                WHERE LP.CODARTICULO = @COD AND CP.ESTATUS IN (${ESTATUS_RESERVA})
                GROUP BY CP.ORDERID, CP.ESTATUS, CP.CLIENTEID, CL.NOMBRECLIENTE, CP.FECHA
                ORDER BY CP.FECHA
            `)).recordset;
    }

    // Documentos de ICG de las últimas 24 h que sacaron stock del almacén sin pasar por un pedido de la app
    static async movimientosRecientes(codarticulo: number): Promise<any[]> {
        const pool = await connectDb();
        const { codAlmacen } = getDbConfig();
        return (await pool.request()
            .input('COD', mssql.Int, codarticulo)
            .input('ALMACEN', mssql.VarChar(10), codAlmacen)
            .query(`
                SELECT * FROM (
                    SELECT CASE M.TIPO WHEN 'ENV' THEN 'TRASPASO' WHEN 'CON' THEN 'CONSUMO' ELSE M.TIPO END AS TIPO,
                           LTRIM(RTRIM(M.SERIEDOC)) + '-' + CAST(CAST(M.NUMDOC AS BIGINT) AS VARCHAR(20)) AS DOCUMENTO,
                           M.UNIDADES, M.CODALMACENDESTINO AS DESTINO, NULL AS CLIENTE,
                           CAST(M.FECHA AS DATETIME) + CAST(CAST(M.HORA AS TIME) AS DATETIME) AS MOMENTO
                    FROM MOVIMENTS M WITH (NOLOCK)
                    WHERE M.CODARTICULO = @COD AND M.CODALMACENORIGEN = @ALMACEN
                      AND M.FECHA >= CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
                    UNION ALL
                    SELECT 'ALBARAN DIRECTO',
                           LTRIM(RTRIM(AVC.NUMSERIE)) + '-' + CAST(AVC.NUMALBARAN AS VARCHAR(20)),
                           AVL.UNIDADESTOTAL, NULL, AVC.CODCLIENTE,
                           CAST(AVC.FECHA AS DATETIME) + CAST(CAST(AVC.HORA AS TIME) AS DATETIME)
                    FROM ALBVENTALIN AVL WITH (NOLOCK)
                    INNER JOIN ALBVENTACAB AVC WITH (NOLOCK) ON AVC.NUMSERIE = AVL.NUMSERIE AND AVC.NUMALBARAN = AVL.NUMALBARAN AND AVC.N = AVL.N
                    WHERE AVL.CODARTICULO = @COD AND AVL.CODALMACEN = @ALMACEN AND AVL.UNIDADESTOTAL > 0
                      AND AVC.FECHA >= CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
                      AND NOT EXISTS (SELECT 1 FROM PEDVENTACAB PVC WITH (NOLOCK)
                                      WHERE PVC.SERIEALBARAN = AVC.NUMSERIE AND PVC.NUMEROALBARAN = AVC.NUMALBARAN
                                        AND PVC.NALBARAN = AVC.N AND LTRIM(RTRIM(ISNULL(PVC.SUPEDIDO, ''))) <> '')
                ) X
                WHERE X.MOMENTO >= DATEADD(HOUR, -24, GETDATE())
                ORDER BY X.MOMENTO
            `)).recordset.map((r: any) => ({
                ...r,
                MOMENTO: r.MOMENTO ? new Date(r.MOMENTO).toISOString() : null,
            }));
    }

    static async getStockLibre(buscar: string, soloReservados: boolean, page: number, limit: number) {
        const pool = await connectDb();
        const { codAlmacen } = getDbConfig();
        const safeLimit = Math.min(500, Math.max(1, limit || 50));
        const offset = (Math.max(1, page || 1) - 1) * safeLimit;
        const filtro = buscar?.trim() ? `%${buscar.trim()}%` : null;
        const base = `
            ;WITH R AS (
                SELECT LP.CODARTICULO, SUM(LP.PRODUCTCOUNT) AS RESERVADO, COUNT(DISTINCT CP.ORDERID) AS PEDIDOS
                FROM ${esquema}.CABECERA_PED CP WITH (NOLOCK)
                INNER JOIN ${esquema}.LINEA_PED LP WITH (NOLOCK) ON LP.ORDERID = CP.ORDERID
                WHERE CP.ESTATUS IN (${ESTATUS_RESERVA})
                GROUP BY LP.CODARTICULO
            ), S AS (
                SELECT CODARTICULO, SUM(STOCK) AS STOCK
                FROM STOCKS WITH (NOLOCK) WHERE CODALMACEN = @ALMACEN
                GROUP BY CODARTICULO
            ), T AS (
                SELECT A.CODARTICULO, A.DESCRIPCION, ISNULL(S.STOCK, 0) AS STOCK,
                       ISNULL(R.RESERVADO, 0) AS RESERVADO, ISNULL(R.PEDIDOS, 0) AS PEDIDOS,
                       ISNULL(S.STOCK, 0) - ISNULL(R.RESERVADO, 0) AS LIBRE
                FROM ARTICULOS A WITH (NOLOCK)
                LEFT JOIN S ON S.CODARTICULO = A.CODARTICULO
                LEFT JOIN R ON R.CODARTICULO = A.CODARTICULO
                WHERE A.DPTO = 1 AND (A.DESCATALOGADO = 'F' OR R.CODARTICULO IS NOT NULL)
                  AND (@SOLO_RES = 0 OR R.CODARTICULO IS NOT NULL)
                  AND (@FILTRO IS NULL OR A.DESCRIPCION LIKE @FILTRO OR CAST(A.CODARTICULO AS VARCHAR(20)) LIKE @FILTRO)
            )`;
        const req = () => pool.request()
            .input('ALMACEN', mssql.VarChar(10), codAlmacen)
            .input('SOLO_RES', mssql.Bit, soloReservados ? 1 : 0)
            .input('FILTRO', mssql.NVarChar(200), filtro);
        const [data, count] = await Promise.all([
            req().input('OFF', mssql.Int, offset).input('LIM', mssql.Int, safeLimit)
                .query(`${base} SELECT * FROM T ORDER BY LIBRE, DESCRIPCION OFFSET @OFF ROWS FETCH NEXT @LIM ROWS ONLY`),
            req().query(`${base} SELECT COUNT(*) AS TOTAL, SUM(CASE WHEN LIBRE < 0 THEN 1 ELSE 0 END) AS SOBREGIRADOS FROM T`),
        ]);
        return { data: data.recordset, total: count.recordset[0].TOTAL, sobregirados: count.recordset[0].SOBREGIRADOS ?? 0 };
    }

    static async getAlertas(soloActivas: boolean, page: number, limit: number) {
        const pool = await connectDb();
        const safeLimit = Math.min(200, Math.max(1, limit || 50));
        const offset = (Math.max(1, page || 1) - 1) * safeLimit;
        const [data, count] = await Promise.all([
            pool.request()
                .input('SOLO', mssql.Bit, soloActivas ? 1 : 0)
                .input('OFF', mssql.Int, offset).input('LIM', mssql.Int, safeLimit)
                .query(`SELECT * FROM ${esquema}.APP_ALERTAS_STOCK WITH (NOLOCK)
                        WHERE (@SOLO = 0 OR RESUELTA = 0)
                        ORDER BY RESUELTA, FECHA_DETECCION DESC
                        OFFSET @OFF ROWS FETCH NEXT @LIM ROWS ONLY`),
            pool.request()
                .input('SOLO', mssql.Bit, soloActivas ? 1 : 0)
                .query(`SELECT COUNT(*) AS TOTAL, SUM(CASE WHEN RESUELTA = 0 THEN 1 ELSE 0 END) AS ACTIVAS
                        FROM ${esquema}.APP_ALERTAS_STOCK WITH (NOLOCK) WHERE (@SOLO = 0 OR RESUELTA = 0)`),
        ]);
        return {
            data: data.recordset.map((a: any) => ({
                ...a,
                PEDIDOS: a.PEDIDOS ? JSON.parse(a.PEDIDOS) : [],
                MOVIMIENTOS: a.MOVIMIENTOS ? JSON.parse(a.MOVIMIENTOS) : [],
            })),
            total: count.recordset[0].TOTAL,
            activas: count.recordset[0].ACTIVAS ?? 0,
        };
    }
}
