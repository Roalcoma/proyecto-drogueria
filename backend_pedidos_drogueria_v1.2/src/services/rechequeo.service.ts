import mssql from 'mssql';
import { connectDb } from '../db/db.conection';

const ESQ = 'dbo';

const BASE_PEDIDOS_SELECT = `
    CAB.NUMSERIE,
    CAB.NUMPEDIDO,
    CAB.N,
    ISNULL(P.NOMPROVEEDOR, '') AS PROVEEDOR,
    ISNULL(CONVERT(VARCHAR(10), CAST(CAB.FECHAPEDIDO AS DATETIME), 23),
           CAST(CAB.FECHAPEDIDO AS NVARCHAR(20))) AS FECHAPEDIDO,
    SUM(LIN.UNIDADESTOTAL) AS TOTAL_PEDIDAS,
    SUM(LIN.UNIDADESREC)  AS TOTAL_RECIBIDAS,
    SUM(LIN.UNIDADESPEN)  AS TOTAL_PENDIENTES
`;

const BASE_PEDIDOS_FROM = `
    FROM PEDCOMPRACAB CAB WITH(NOLOCK)
    INNER JOIN PEDCOMPRALIN LIN WITH(NOLOCK)
        ON LIN.NUMSERIE = CAB.NUMSERIE AND LIN.NUMPEDIDO = CAB.NUMPEDIDO AND LIN.N = CAB.N
    LEFT JOIN PROVEEDORES P WITH(NOLOCK) ON P.CODPROVEEDOR = CAB.CODPROVEEDOR
`;

const BASE_PEDIDOS_GROUP = `
    GROUP BY CAB.NUMSERIE, CAB.NUMPEDIDO, CAB.N, P.NOMPROVEEDOR, CAB.FECHAPEDIDO
    ORDER BY CAB.FECHAPEDIDO DESC
`;

export class RechequeoService {

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_RECHEQUEO_CAB')
                CREATE TABLE ${ESQ}.APP_RECHEQUEO_CAB (
                    ID          INT IDENTITY(1,1) PRIMARY KEY,
                    NUMSERIE    NVARCHAR(4)    NOT NULL,
                    NUMPEDIDO   INT            NOT NULL,
                    N           NCHAR(1)       NOT NULL,
                    IDFACTURA   NVARCHAR(100)  NOT NULL,
                    FECHA       DATETIME       NOT NULL DEFAULT GETDATE(),
                    CODUSUARIO  INT            NULL,
                    USUARIO     NVARCHAR(100)  NOT NULL
                )
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_RECHEQUEO_DET')
                CREATE TABLE ${ESQ}.APP_RECHEQUEO_DET (
                    ID                INT IDENTITY(1,1) PRIMARY KEY,
                    IDCAB             INT            NOT NULL REFERENCES ${ESQ}.APP_RECHEQUEO_CAB(ID),
                    CODARTICULO       NVARCHAR(20)   NOT NULL,
                    UNIDADES_CONTADAS DECIMAL(10,2)  NOT NULL DEFAULT 0,
                    FECHA             DATETIME       NOT NULL DEFAULT GETDATE()
                )
            `);
            console.log('[Rechequeo] Tablas APP_RECHEQUEO verificadas/creadas');
        } catch (err) {
            console.error('[Rechequeo] initTablas error:', err);
        }
    }

    static async initTablasCierre(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_RECHEQUEO_CERRADO_CAB')
                CREATE TABLE ${ESQ}.APP_RECHEQUEO_CERRADO_CAB (
                    ID          INT IDENTITY(1,1) PRIMARY KEY,
                    NUMSERIE    NVARCHAR(4)    NOT NULL,
                    NUMPEDIDO   INT            NOT NULL,
                    N           NCHAR(1)       NOT NULL,
                    IDFACTURA   NVARCHAR(100)  NOT NULL,
                    USUARIO     NVARCHAR(100)  NOT NULL,
                    FECHA       DATETIME       NOT NULL DEFAULT GETDATE()
                )
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_RECHEQUEO_CERRADO_LIN')
                CREATE TABLE ${ESQ}.APP_RECHEQUEO_CERRADO_LIN (
                    ID                INT IDENTITY(1,1) PRIMARY KEY,
                    IDCAB             INT            NOT NULL REFERENCES ${ESQ}.APP_RECHEQUEO_CERRADO_CAB(ID),
                    NUMLINEA          INT            NOT NULL,
                    CODARTICULO       NVARCHAR(20)   NOT NULL,
                    TALLA             NVARCHAR(50)   NOT NULL DEFAULT '@',
                    COLOR             NVARCHAR(10)   NOT NULL DEFAULT '',
                    IDFACTURA         NVARCHAR(100)  NOT NULL,
                    UNIDADES_CONTADAS DECIMAL(10,2)  NOT NULL DEFAULT 0,
                    PRECIO            DECIMAL(10,4)  NOT NULL DEFAULT 0,
                    DTOCOMERCIAL      DECIMAL(10,4)  NOT NULL DEFAULT 0,
                    FECHA             DATETIME       NOT NULL DEFAULT GETDATE()
                )
            `);
            // Agregar columnas si la tabla ya existía sin ellas
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_RECHEQUEO_CERRADO_LIN' AND COLUMN_NAME='TALLA')
                    ALTER TABLE ${ESQ}.APP_RECHEQUEO_CERRADO_LIN ADD TALLA NVARCHAR(50) NOT NULL DEFAULT '@'
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_RECHEQUEO_CERRADO_LIN' AND COLUMN_NAME='COLOR')
                    ALTER TABLE ${ESQ}.APP_RECHEQUEO_CERRADO_LIN ADD COLOR NVARCHAR(10) NOT NULL DEFAULT ''
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_RECHEQUEO_CERRADO_LIN' AND COLUMN_NAME='DTOCOMERCIAL')
                    ALTER TABLE ${ESQ}.APP_RECHEQUEO_CERRADO_LIN ADD DTOCOMERCIAL DECIMAL(10,4) NOT NULL DEFAULT 0
            `);
            console.log('[Rechequeo] Tablas CERRADO verificadas/creadas');
        } catch (err) {
            console.error('[Rechequeo] initTablasCierre error:', err);
        }
    }

    // ── Pedidos disponibles (sin lock activo) ──────────────────────────────
    static async getPedidosDisponibles(): Promise<any[]> {
        const pool = await connectDb();
        const r = await pool.request().query(`
            SELECT ${BASE_PEDIDOS_SELECT}
            ${BASE_PEDIDOS_FROM}
            WHERE LIN.UNIDADESPEN > 0
              AND NOT EXISTS (
                SELECT 1 FROM ${ESQ}.APP_RECHEQUEO_CAB RC
                WHERE RC.NUMSERIE COLLATE Latin1_General_CS_AI = CAB.NUMSERIE
                  AND RC.NUMPEDIDO = CAB.NUMPEDIDO
                  AND RC.N COLLATE Latin1_General_CS_AI = CAB.N
              )
            ${BASE_PEDIDOS_GROUP}
        `);
        return r.recordset;
    }

    // ── Mis pedidos (donde yo tengo el lock) ──────────────────────────────
    static async getMisPedidos(usuario: string): Promise<any[]> {
        const pool = await connectDb();
        const r = await pool.request()
            .input('USU', mssql.NVarChar(100), usuario)
            .query(`
                SELECT ${BASE_PEDIDOS_SELECT}
                ${BASE_PEDIDOS_FROM}
                WHERE LIN.UNIDADESPEN > 0
                  AND EXISTS (
                    SELECT 1 FROM ${ESQ}.APP_RECHEQUEO_CAB RC
                    WHERE RC.NUMSERIE COLLATE Latin1_General_CS_AI = CAB.NUMSERIE
                      AND RC.NUMPEDIDO = CAB.NUMPEDIDO
                      AND RC.N COLLATE Latin1_General_CS_AI = CAB.N
                      AND RC.USUARIO = @USU
                  )
                ${BASE_PEDIDOS_GROUP}
            `);
        return r.recordset;
    }

    // ── Tomar conteo (lock exclusivo por usuario; múltiples identificadores OK) ──
    static async tomarConteo(
        numserie: string, numpedido: number, n: string,
        idfactura: string, codusuario: number | null, usuario: string
    ): Promise<number> {
        const pool = await connectDb();

        // Verificar si otro usuario tiene el lock
        const otherLock = await pool.request()
            .input('NS',  mssql.NVarChar(4),   numserie)
            .input('NP',  mssql.Int,           numpedido)
            .input('N',   mssql.NChar(1),      n)
            .input('USU', mssql.NVarChar(100), usuario)
            .query(`SELECT TOP 1 USUARIO FROM ${ESQ}.APP_RECHEQUEO_CAB
                    WHERE NUMSERIE=@NS AND NUMPEDIDO=@NP AND N=@N AND USUARIO <> @USU`);
        if (otherLock.recordset.length > 0) {
            throw new Error(`Este pedido ya está siendo contado por ${otherLock.recordset[0].USUARIO}`);
        }

        // Si el mismo usuario ya tiene ese identificador, devolver el ID
        const existingFac = await pool.request()
            .input('NS',  mssql.NVarChar(4),   numserie)
            .input('NP',  mssql.Int,           numpedido)
            .input('N',   mssql.NChar(1),      n)
            .input('FAC', mssql.NVarChar(100), idfactura)
            .input('USU', mssql.NVarChar(100), usuario)
            .query(`SELECT ID FROM ${ESQ}.APP_RECHEQUEO_CAB
                    WHERE NUMSERIE=@NS AND NUMPEDIDO=@NP AND N=@N AND IDFACTURA=@FAC AND USUARIO=@USU`);
        if (existingFac.recordset.length) return existingFac.recordset[0].ID;

        // Crear nuevo identificador para el mismo usuario
        const ins = await pool.request()
            .input('NS',  mssql.NVarChar(4),   numserie)
            .input('NP',  mssql.Int,           numpedido)
            .input('N',   mssql.NChar(1),      n)
            .input('FAC', mssql.NVarChar(100), idfactura)
            .input('CU',  mssql.Int,           codusuario)
            .input('USU', mssql.NVarChar(100), usuario)
            .query(`INSERT INTO ${ESQ}.APP_RECHEQUEO_CAB (NUMSERIE,NUMPEDIDO,N,IDFACTURA,CODUSUARIO,USUARIO)
                    OUTPUT INSERTED.ID VALUES (@NS,@NP,@N,@FAC,@CU,@USU)`);
        return ins.recordset[0].ID;
    }

    // ── Cerrar conteo (cierra TODOS los identificadores del usuario para ese pedido) ──
    static async cerrarConteo(numserie: string, numpedido: number, n: string, usuario: string): Promise<void> {
        const pool = await connectDb();

        // Obtener todos los cabs del usuario para este pedido
        const cabsRes = await pool.request()
            .input('NS',  mssql.NVarChar(4),   numserie)
            .input('NP',  mssql.Int,           numpedido)
            .input('N',   mssql.NChar(1),      n)
            .input('USU', mssql.NVarChar(100), usuario)
            .query(`SELECT ID, IDFACTURA FROM ${ESQ}.APP_RECHEQUEO_CAB
                    WHERE NUMSERIE=@NS AND NUMPEDIDO=@NP AND N=@N AND USUARIO=@USU`);

        if (!cabsRes.recordset.length) throw new Error('No se encontraron conteos activos para este pedido');

        // Obtener DTOCOMERCIAL del pedido de compra
        const dtoRes = await pool.request()
            .input('NS2', mssql.NVarChar(4),  numserie)
            .input('NP2', mssql.Int,          numpedido)
            .input('N2',  mssql.NChar(1),     n)
            .query(`SELECT TOP 1 ISNULL(DTOCOMERCIAL,0) AS DTO FROM PEDCOMPRACAB WITH(NOLOCK)
                    WHERE NUMSERIE=@NS2 AND NUMPEDIDO=@NP2 AND N=@N2`);
        const dto: number = Number(dtoRes.recordset[0]?.DTO ?? 0);

        for (const cab of cabsRes.recordset) {
            // Saltar cabs vacíos (sin conteo registrado)
            const detCheck = await pool.request()
                .input('IDCAB', mssql.Int, cab.ID)
                .query(`SELECT TOP 1 1 AS TIENE FROM ${ESQ}.APP_RECHEQUEO_DET WHERE IDCAB=@IDCAB`);
            if (!detCheck.recordset.length) {
                await pool.request().input('IDCAB', mssql.Int, cab.ID)
                    .query(`DELETE FROM ${ESQ}.APP_RECHEQUEO_CAB WHERE ID=@IDCAB`);
                continue;
            }

            // Insertar cabecera cerrada
            const cerradoCabRes = await pool.request()
                .input('NS',  mssql.NVarChar(4),   numserie)
                .input('NP',  mssql.Int,           numpedido)
                .input('N',   mssql.NChar(1),      n)
                .input('FAC', mssql.NVarChar(100), cab.IDFACTURA)
                .input('USU', mssql.NVarChar(100), usuario)
                .query(`INSERT INTO ${ESQ}.APP_RECHEQUEO_CERRADO_CAB (NUMSERIE,NUMPEDIDO,N,IDFACTURA,USUARIO)
                        OUTPUT INSERTED.ID VALUES (@NS,@NP,@N,@FAC,@USU)`);
            const idCerrado: number = cerradoCabRes.recordset[0].ID;

            // Insertar lineas cerradas
            await pool.request()
                .input('IDCAB',     mssql.Int,            cab.ID)
                .input('IDCERRADO', mssql.Int,            idCerrado)
                .input('FAC',       mssql.NVarChar(100),  cab.IDFACTURA)
                .input('NS',        mssql.NVarChar(4),    numserie)
                .input('NP',        mssql.Int,            numpedido)
                .input('N',         mssql.NChar(1),       n)
                .input('DTO',       mssql.Decimal(10, 4), dto)
                .query(`
                    INSERT INTO ${ESQ}.APP_RECHEQUEO_CERRADO_LIN
                        (IDCAB, NUMLINEA, CODARTICULO, TALLA, COLOR, IDFACTURA, UNIDADES_CONTADAS, PRECIO, DTOCOMERCIAL)
                    SELECT
                        @IDCERRADO,
                        ISNULL(LIN.NUMLINEA, 0),
                        D.CODARTICULO,
                        '@',
                        RIGHT(REPLICATE('0', 10) + CAST(
                            ISNULL((
                                SELECT MAX(CAST(A.COLOR AS BIGINT))
                                FROM ARTICULOSLIN A WITH(NOLOCK)
                                WHERE A.CODARTICULO = CAST(D.CODARTICULO AS INT)
                                  AND A.TALLA COLLATE Latin1_General_CS_AI = '@'
                            ), 0) + 1
                        AS NVARCHAR(10)), 10),
                        @FAC,
                        D.UNIDADES_CONTADAS,
                        ISNULL(LIN.PRECIO, 0),
                        @DTO
                    FROM ${ESQ}.APP_RECHEQUEO_DET D
                    LEFT JOIN PEDCOMPRALIN LIN WITH(NOLOCK)
                        ON LIN.NUMSERIE=@NS AND LIN.NUMPEDIDO=@NP AND LIN.N=@N
                       AND CAST(LIN.CODARTICULO AS NVARCHAR(20))=D.CODARTICULO
                    WHERE D.IDCAB=@IDCAB
                `);

            // Borrar de tablas activas
            await pool.request().input('IDCAB', mssql.Int, cab.ID)
                .query(`DELETE FROM ${ESQ}.APP_RECHEQUEO_DET WHERE IDCAB=@IDCAB`);
            await pool.request().input('IDCAB', mssql.Int, cab.ID)
                .query(`DELETE FROM ${ESQ}.APP_RECHEQUEO_CAB WHERE ID=@IDCAB`);
        }
    }

    static async getPedidosCerrados(): Promise<any[]> {
        const pool = await connectDb();
        const r = await pool.request().query(`
            SELECT
                C.ID, C.NUMSERIE, C.NUMPEDIDO, C.N,
                C.IDFACTURA, C.USUARIO, C.FECHA,
                ISNULL(P.NOMPROVEEDOR,'') AS PROVEEDOR,
                COUNT(L.ID)              AS TOTAL_LINEAS,
                SUM(L.UNIDADES_CONTADAS) AS TOTAL_CONTADAS
            FROM ${ESQ}.APP_RECHEQUEO_CERRADO_CAB C
            LEFT JOIN ${ESQ}.APP_RECHEQUEO_CERRADO_LIN L ON L.IDCAB = C.ID
            LEFT JOIN PROVEEDORES P WITH(NOLOCK)
                ON P.CODPROVEEDOR = (
                    SELECT TOP 1 CAB2.CODPROVEEDOR FROM PEDCOMPRACAB CAB2 WITH(NOLOCK)
                    WHERE CAB2.NUMSERIE  COLLATE Latin1_General_CS_AI = C.NUMSERIE  COLLATE Latin1_General_CS_AI
                      AND CAB2.NUMPEDIDO = C.NUMPEDIDO
                      AND CAB2.N         COLLATE Latin1_General_CS_AI = C.N         COLLATE Latin1_General_CS_AI
                )
            GROUP BY C.ID, C.NUMSERIE, C.NUMPEDIDO, C.N, C.IDFACTURA, C.USUARIO, C.FECHA, P.NOMPROVEEDOR
            ORDER BY C.FECHA DESC
        `);
        return r.recordset;
    }

    static async getDetalleCerrado(idcab: number): Promise<any[]> {
        const pool = await connectDb();
        const r = await pool.request()
            .input('IDCAB', mssql.Int, idcab)
            .query(`
                SELECT L.NUMLINEA, L.CODARTICULO, L.IDFACTURA,
                       L.UNIDADES_CONTADAS, L.PRECIO,
                       ISNULL(ART.DESCRIPCION,'') AS DESCRIPCION
                FROM ${ESQ}.APP_RECHEQUEO_CERRADO_LIN L
                LEFT JOIN ARTICULOS ART WITH(NOLOCK) ON ART.CODARTICULO = L.CODARTICULO
                WHERE L.IDCAB = @IDCAB
                ORDER BY L.NUMLINEA
            `);
        return r.recordset;
    }

    // ── Detalle del pedido ─────────────────────────────────────────────────
    static async getDetallePedido(numserie: string, numpedido: number, n: string): Promise<any[]> {
        const pool = await connectDb();
        const r = await pool.request()
            .input('NS', mssql.NVarChar(4), numserie)
            .input('NP', mssql.Int,         numpedido)
            .input('N',  mssql.NChar(1),    n)
            .query(`
                SELECT
                    LIN.NUMLINEA,
                    LIN.CODARTICULO,
                    LIN.DESCRIPCION,
                    LIN.UNIDADESTOTAL AS PEDIDAS,
                    LIN.UNIDADESREC   AS RECIBIDAS,
                    LIN.UNIDADESPEN   AS PENDIENTES,
                    ISNULL(ART.REFPROVEEDOR, '') AS REFPROVEEDOR,
                    ISNULL((
                        SELECT SUM(D.UNIDADES_CONTADAS)
                        FROM ${ESQ}.APP_RECHEQUEO_DET D
                        INNER JOIN ${ESQ}.APP_RECHEQUEO_CAB C ON C.ID = D.IDCAB
                        WHERE C.NUMSERIE COLLATE Latin1_General_CS_AI = LIN.NUMSERIE
                          AND C.NUMPEDIDO = LIN.NUMPEDIDO
                          AND C.N COLLATE Latin1_General_CS_AI = LIN.N
                          AND D.CODARTICULO = CAST(LIN.CODARTICULO AS NVARCHAR(20))
                    ), 0) AS CONTADAS_TOTAL
                FROM PEDCOMPRALIN LIN WITH(NOLOCK)
                LEFT JOIN ARTICULOS ART WITH(NOLOCK)
                    ON ART.CODARTICULO = CAST(LIN.CODARTICULO AS NVARCHAR(20))
                WHERE LIN.NUMSERIE = @NS AND LIN.NUMPEDIDO = @NP AND LIN.N = @N
                ORDER BY LIN.NUMLINEA
            `);
        return r.recordset;
    }

    static async getCabeceras(numserie: string, numpedido: number, n: string): Promise<any[]> {
        const pool = await connectDb();
        const r = await pool.request()
            .input('NS', mssql.NVarChar(4), numserie)
            .input('NP', mssql.Int,         numpedido)
            .input('N',  mssql.NChar(1),    n)
            .query(`SELECT ID, IDFACTURA, USUARIO, CODUSUARIO, FECHA
                    FROM ${ESQ}.APP_RECHEQUEO_CAB
                    WHERE NUMSERIE=@NS AND NUMPEDIDO=@NP AND N=@N`);
        return r.recordset;
    }

    // ── Conteo CRUD ────────────────────────────────────────────────────────
    static async upsertDetalle(idcab: number, codarticulo: string, unidades: number): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('IDCAB', mssql.Int,           idcab)
            .input('COD',   mssql.NVarChar(20),  String(codarticulo))
            .input('UNI',   mssql.Decimal(10,2), unidades)
            .query(`
                IF EXISTS (SELECT 1 FROM ${ESQ}.APP_RECHEQUEO_DET WHERE IDCAB=@IDCAB AND CODARTICULO=@COD)
                    UPDATE ${ESQ}.APP_RECHEQUEO_DET SET UNIDADES_CONTADAS=@UNI, FECHA=GETDATE()
                    WHERE IDCAB=@IDCAB AND CODARTICULO=@COD
                ELSE
                    INSERT INTO ${ESQ}.APP_RECHEQUEO_DET (IDCAB, CODARTICULO, UNIDADES_CONTADAS)
                    VALUES (@IDCAB, @COD, @UNI)
            `);
    }

    static async getDetallesCabecera(idcab: number): Promise<any[]> {
        const pool = await connectDb();
        const r = await pool.request()
            .input('IDCAB', mssql.Int, idcab)
            .query(`SELECT CODARTICULO, UNIDADES_CONTADAS FROM ${ESQ}.APP_RECHEQUEO_DET WHERE IDCAB=@IDCAB`);
        return r.recordset;
    }

    // ── Quién tiene el lock (para disponibles) ─────────────────────────────
    static async getLockInfo(numserie: string, numpedido: number, n: string): Promise<{ usuario: string } | null> {
        const pool = await connectDb();
        const r = await pool.request()
            .input('NS', mssql.NVarChar(4), numserie)
            .input('NP', mssql.Int,         numpedido)
            .input('N',  mssql.NChar(1),    n)
            .query(`SELECT TOP 1 USUARIO FROM ${ESQ}.APP_RECHEQUEO_CAB WHERE NUMSERIE=@NS AND NUMPEDIDO=@NP AND N=@N`);
        return r.recordset.length ? r.recordset[0] : null;
    }
}
