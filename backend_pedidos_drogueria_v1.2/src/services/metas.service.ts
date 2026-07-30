import { mssql, connectDb } from "../db/db.conection";

export class MetasService {

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_METAS_VENDEDOR' AND xtype='U')
                CREATE TABLE APP_METAS_VENDEDOR (
                    ID          INT IDENTITY(1,1) PRIMARY KEY,
                    CODVENDEDOR INT           NOT NULL,
                    ANIO        INT           NOT NULL,
                    MES         INT           NOT NULL,
                    META        DECIMAL(18,2) NOT NULL,
                    CUMPLIDA    BIT           NOT NULL DEFAULT 0,
                    FECHACARGA  DATETIME      NOT NULL DEFAULT GETDATE(),
                    CONSTRAINT UQ_META_VEND_MES UNIQUE (CODVENDEDOR, ANIO, MES)
                );
                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_METAS_ZONA' AND xtype='U')
                CREATE TABLE APP_METAS_ZONA (
                    ID          INT IDENTITY(1,1) PRIMARY KEY,
                    CODRUTA     INT           NOT NULL,
                    ANIO        INT           NOT NULL,
                    MES         INT           NOT NULL,
                    META        DECIMAL(18,2) NOT NULL,
                    FECHACARGA  DATETIME      NOT NULL DEFAULT GETDATE(),
                    CONSTRAINT UQ_META_ZONA UNIQUE (CODRUTA, ANIO, MES)
                );
            `);
            console.log('Tablas APP_METAS_VENDEDOR y APP_METAS_ZONA verificadas.');
        } catch (err) {
            console.error('Error en MetasService.initTablas:', err);
        }
    }

    static async getZonas(anio: number, mes: number): Promise<any[]> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('ANIO', mssql.Int, anio)
            .input('MES',  mssql.Int, mes)
            .query(`
                SELECT
                    R.CODRUTA,
                    R.DESCRIPCION,
                    COUNT(DISTINCT TRY_CAST(CLC.CODVENDEDOR AS INT)) AS NUM_VENDEDORES,
                    MZ.META AS META_ZONA,
                    MZ.ID   AS ID_ZONA
                FROM RUTAS R
                LEFT JOIN CLIENTESCAMPOSLIBRES CLC WITH(NOLOCK)
                    ON  TRY_CAST(CLC.ZONA AS INT) = R.CODRUTA
                    AND CLC.CODVENDEDOR IS NOT NULL
                    AND LTRIM(RTRIM(CAST(CLC.CODVENDEDOR AS NVARCHAR))) != ''
                    AND TRY_CAST(CLC.CODVENDEDOR AS INT) > 0
                LEFT JOIN APP_METAS_ZONA MZ
                    ON  MZ.CODRUTA = R.CODRUTA AND MZ.ANIO = @ANIO AND MZ.MES = @MES
                GROUP BY R.CODRUTA, R.DESCRIPCION, MZ.META, MZ.ID
                HAVING COUNT(DISTINCT TRY_CAST(CLC.CODVENDEDOR AS INT)) > 0
                ORDER BY R.DESCRIPCION
            `);
        return res.recordset;
    }

    static async getVendedoresByZona(codruta: number, anio: number, mes: number): Promise<{ vendedores: any[]; metaZona: number }> {
        const pool = await connectDb();
        const metaRes = await pool.request()
            .input('CODRUTA', mssql.Int, codruta)
            .input('ANIO',    mssql.Int, anio)
            .input('MES',     mssql.Int, mes)
            .query(`
                SELECT ISNULL(META, 0) AS META
                FROM APP_METAS_ZONA
                WHERE CODRUTA = @CODRUTA AND ANIO = @ANIO AND MES = @MES
            `);
        const metaZona = Number(metaRes.recordset[0]?.META ?? 0);

        const res = await pool.request()
            .input('CODRUTA', mssql.Int, codruta)
            .input('ANIO',    mssql.Int, anio)
            .input('MES',     mssql.Int, mes)
            .query(`
                SELECT
                    V.CODVENDEDOR,
                    V.NOMVENDEDOR,
                    ISNULL(M.META, 0)    AS META,
                    M.ID                 AS ID_META,
                    ISNULL(M.CUMPLIDA,0) AS CUMPLIDA
                FROM (
                    SELECT DISTINCT TRY_CAST(CLC.CODVENDEDOR AS INT) AS CODVENDEDOR
                    FROM CLIENTESCAMPOSLIBRES CLC WITH(NOLOCK)
                    WHERE TRY_CAST(CLC.ZONA AS INT) = @CODRUTA
                      AND CLC.CODVENDEDOR IS NOT NULL
                      AND LTRIM(RTRIM(CAST(CLC.CODVENDEDOR AS NVARCHAR))) != ''
                      AND TRY_CAST(CLC.CODVENDEDOR AS INT) > 0
                ) Z
                INNER JOIN VENDEDORES V WITH(NOLOCK) ON V.CODVENDEDOR = Z.CODVENDEDOR
                LEFT JOIN APP_METAS_VENDEDOR M
                    ON M.CODVENDEDOR = Z.CODVENDEDOR AND M.ANIO = @ANIO AND M.MES = @MES
                ORDER BY V.NOMVENDEDOR
            `);
        return { vendedores: res.recordset, metaZona };
    }

    static async setMetaZona(codruta: number, anio: number, mes: number, metaTotal: number): Promise<void> {
        const pool = await connectDb();

        // Upsert zona meta
        await pool.request()
            .input('CODRUTA', mssql.Int,           codruta)
            .input('ANIO',    mssql.Int,           anio)
            .input('MES',     mssql.Int,           mes)
            .input('META',    mssql.Decimal(18, 2), metaTotal)
            .query(`
                MERGE APP_METAS_ZONA AS T
                USING (SELECT @CODRUTA AS C, @ANIO AS A, @MES AS M) AS S
                ON (T.CODRUTA = S.C AND T.ANIO = S.A AND T.MES = S.M)
                WHEN MATCHED     THEN UPDATE SET T.META = @META, T.FECHACARGA = GETDATE()
                WHEN NOT MATCHED THEN INSERT (CODRUTA, ANIO, MES, META) VALUES (@CODRUTA, @ANIO, @MES, @META);
            `);

        // Get vendors in zone
        const vendRes = await pool.request()
            .input('CODRUTA', mssql.Int, codruta)
            .query(`
                SELECT DISTINCT TRY_CAST(CODVENDEDOR AS INT) AS CODVENDEDOR
                FROM CLIENTESCAMPOSLIBRES WITH(NOLOCK)
                WHERE TRY_CAST(ZONA AS INT) = @CODRUTA
                  AND CODVENDEDOR IS NOT NULL
                  AND LTRIM(RTRIM(CAST(CODVENDEDOR AS NVARCHAR))) != ''
                  AND TRY_CAST(CODVENDEDOR AS INT) > 0
            `);
        const vendors = vendRes.recordset;
        if (!vendors.length) return;

        const metaPorVendedor = Math.round((metaTotal / vendors.length) * 100) / 100;
        for (const { CODVENDEDOR } of vendors) {
            await MetasService.upsert(CODVENDEDOR, anio, mes, metaPorVendedor);
        }
    }

    static async getVendedores(): Promise<{ CODVENDEDOR: number; NOMVENDEDOR: string }[]> {
        const pool = await connectDb();
        const res = await pool.request().query(
            `SELECT CODVENDEDOR, NOMVENDEDOR FROM VENDEDORES ORDER BY NOMVENDEDOR`
        );
        return res.recordset;
    }

    static async getMetas(anio?: number, mes?: number, codVendedor?: number): Promise<any[]> {
        const pool = await connectDb();
        const req  = pool.request();
        const wheres: string[] = [];
        if (anio)        { req.input('ANIO', mssql.Int, anio);              wheres.push('M.ANIO = @ANIO'); }
        if (mes)         { req.input('MES',  mssql.Int, mes);               wheres.push('M.MES = @MES'); }
        if (codVendedor) { req.input('COD',  mssql.Int, codVendedor);       wheres.push('M.CODVENDEDOR = @COD'); }
        const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
        const res = await req.query(`
            SELECT M.ID, M.CODVENDEDOR, V.NOMVENDEDOR, M.ANIO, M.MES, M.META, M.CUMPLIDA, M.FECHACARGA
            FROM APP_METAS_VENDEDOR M
            INNER JOIN VENDEDORES V ON V.CODVENDEDOR = M.CODVENDEDOR
            ${where}
            ORDER BY M.ANIO DESC, M.MES DESC, V.NOMVENDEDOR
        `);
        return res.recordset;
    }

    static async upsert(codVendedor: number, anio: number, mes: number, meta: number): Promise<number> {
        const pool = await connectDb();
        const req  = pool.request()
            .input('COD',  mssql.Int,           codVendedor)
            .input('ANIO', mssql.Int,           anio)
            .input('MES',  mssql.Int,           mes)
            .input('META', mssql.Decimal(18,6), meta);

        await req.query(`
            MERGE APP_METAS_VENDEDOR AS T
            USING (SELECT @COD AS C, @ANIO AS A, @MES AS M) AS S
            ON (T.CODVENDEDOR = S.C AND T.ANIO = S.A AND T.MES = S.M)
            WHEN MATCHED THEN UPDATE SET T.META = @META, T.FECHACARGA = GETDATE()
            WHEN NOT MATCHED THEN INSERT (CODVENDEDOR, ANIO, MES, META) VALUES (@COD, @ANIO, @MES, @META);

            MERGE [RIP].[METAS_VENDEDORES] AS T
            USING (SELECT @COD AS C, @ANIO AS A, @MES AS M) AS S
            ON (T.CODVENDEDOR = S.C AND T.ANYO = S.A AND T.MES = S.M)
            WHEN MATCHED THEN UPDATE SET T.META = @META
            WHEN NOT MATCHED THEN INSERT (CODVENDEDOR, ANYO, MES, META) VALUES (@COD, @ANIO, @MES, @META);

            -- Auto-sync CUMPLIDA tras cambiar la meta
            UPDATE M
            SET M.CUMPLIDA = CASE WHEN ISNULL((
                SELECT SUM(CASE WHEN CP.ESTATUS != 'CANCELADO' THEN CP.TOTALPRECIO ELSE 0 END)
                FROM CABECERA_PED CP
                WHERE CP.CODVENDEDOR = @COD
                  AND YEAR(CP.FECHA) = @ANIO
                  AND MONTH(CP.FECHA) = @MES
            ), 0) >= M.META THEN 1 ELSE 0 END
            FROM APP_METAS_VENDEDOR M
            WHERE M.CODVENDEDOR = @COD AND M.ANIO = @ANIO AND M.MES = @MES;
        `);
        const idRes = await pool.request()
            .input('COD',  mssql.Int, codVendedor)
            .input('ANIO', mssql.Int, anio)
            .input('MES',  mssql.Int, mes)
            .query(`SELECT ID FROM APP_METAS_VENDEDOR WHERE CODVENDEDOR = @COD AND ANIO = @ANIO AND MES = @MES`);
        return idRes.recordset[0]?.ID ?? 0;
    }

    static async getProgreso(anio: number, mes: number): Promise<any[]> {
        const pool = await connectDb();
        const req  = pool.request()
            .input('ANIO', mssql.Int, anio)
            .input('MES',  mssql.Int, mes);

        // Auto-sync CUMPLIDA: si las ventas superan la meta se marca, si no, se desmarca
        await req.query(`
            WITH Ventas AS (
                SELECT
                    M.ID,
                    M.META,
                    ISNULL(SUM(CASE WHEN CP.ESTATUS != 'CANCELADO' THEN CP.TOTALPRECIO ELSE 0 END), 0) AS VENTA_TOTAL
                FROM APP_METAS_VENDEDOR M
                LEFT JOIN CABECERA_PED CP
                    ON  CP.CODVENDEDOR = M.CODVENDEDOR
                    AND YEAR(CP.FECHA)  = @ANIO
                    AND MONTH(CP.FECHA) = @MES
                WHERE M.ANIO = @ANIO AND M.MES = @MES
                GROUP BY M.ID, M.META
            )
            UPDATE M
            SET M.CUMPLIDA = CASE WHEN V.VENTA_TOTAL >= V.META THEN 1 ELSE 0 END
            FROM APP_METAS_VENDEDOR M
            INNER JOIN Ventas V ON V.ID = M.ID
        `);

        const res = await req.query(`
                SELECT
                    M.ID,
                    M.CODVENDEDOR,
                    V.NOMVENDEDOR,
                    M.META,
                    M.CUMPLIDA,
                    ISNULL(CZ.CODRUTA, 0)                AS CODRUTA,
                    ISNULL(RZ.DESCRIPCION, 'Sin zona')   AS NOMBREZONA,
                    ISNULL(SUM(CASE WHEN CP.ESTATUS != 'CANCELADO' THEN CP.TOTALPRECIO ELSE 0 END), 0)           AS VENTA_TOTAL,
                    ISNULL(SUM(CASE WHEN CP.ESTATUS IN ('ICG','FINALIZADO') THEN CP.TOTALPRECIO ELSE 0 END), 0)  AS VENTA_FACTURADO,
                    COUNT(CASE WHEN CP.ESTATUS != 'CANCELADO'              THEN 1 END)                           AS NUM_PEDIDOS,
                    COUNT(CASE WHEN CP.ESTATUS IN ('ICG','FINALIZADO')     THEN 1 END)                           AS NUM_FACTURADO
                FROM APP_METAS_VENDEDOR M
                INNER JOIN VENDEDORES V ON V.CODVENDEDOR = M.CODVENDEDOR
                OUTER APPLY (
                    SELECT TOP 1 MZ.CODRUTA
                    FROM APP_METAS_ZONA MZ WITH(NOLOCK)
                    INNER JOIN CLIENTESCAMPOSLIBRES CLC WITH(NOLOCK)
                        ON  TRY_CAST(CLC.ZONA AS INT) = MZ.CODRUTA
                        AND TRY_CAST(CLC.CODVENDEDOR AS INT) = M.CODVENDEDOR
                    WHERE MZ.ANIO = @ANIO AND MZ.MES = @MES
                    ORDER BY MZ.CODRUTA
                ) CZ
                LEFT JOIN RUTAS RZ WITH(NOLOCK) ON RZ.CODRUTA = CZ.CODRUTA
                LEFT JOIN CABECERA_PED CP
                    ON  CP.CODVENDEDOR = M.CODVENDEDOR
                    AND YEAR(CP.FECHA)  = @ANIO
                    AND MONTH(CP.FECHA) = @MES
                    AND (CZ.CODRUTA IS NULL OR EXISTS (
                        SELECT 1 FROM CLIENTESCAMPOSLIBRES CLC2 WITH(NOLOCK)
                        WHERE CLC2.CODCLIENTE = CP.CLIENTEID
                          AND TRY_CAST(CLC2.ZONA AS INT) = CZ.CODRUTA
                    ))
                WHERE M.ANIO = @ANIO AND M.MES = @MES
                GROUP BY M.ID, M.CODVENDEDOR, V.NOMVENDEDOR, M.META, M.CUMPLIDA, CZ.CODRUTA, RZ.DESCRIPCION
                ORDER BY ISNULL(RZ.DESCRIPCION, 'Sin zona'), VENTA_TOTAL DESC
        `);
        return res.recordset;
    }

    static async getProgresoVendedor(anio: number, mes: number): Promise<any[]> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('ANIO', mssql.Int, anio)
            .input('MES',  mssql.Int, mes)
            .query(`
                SELECT
                    M.ID              AS ID_META,
                    M.CODVENDEDOR,
                    V.NOMVENDEDOR,
                    M.META,
                    M.CUMPLIDA,
                    ISNULL(TRY_CAST(CLC.ZONA AS INT), 0)  AS CODRUTA_ZONA,
                    ISNULL(RZ.DESCRIPCION, 'Sin zona')     AS NOMBRE_ZONA,
                    ISNULL(SUM(CASE WHEN CP.ESTATUS != 'CANCELADO'          THEN CP.TOTALPRECIO ELSE 0 END), 0) AS VENTA_TOTAL,
                    ISNULL(SUM(CASE WHEN CP.ESTATUS IN ('ICG','FINALIZADO') THEN CP.TOTALPRECIO ELSE 0 END), 0) AS VENTA_FACTURADO,
                    COUNT(CASE WHEN CP.ESTATUS != 'CANCELADO'               THEN 1 END)                        AS NUM_PEDIDOS,
                    COUNT(CASE WHEN CP.ESTATUS IN ('ICG','FINALIZADO')      THEN 1 END)                        AS NUM_FACTURADO
                FROM APP_METAS_VENDEDOR M
                INNER JOIN VENDEDORES V ON V.CODVENDEDOR = M.CODVENDEDOR
                LEFT JOIN CABECERA_PED CP
                    ON  CP.CODVENDEDOR = M.CODVENDEDOR
                    AND YEAR(CP.FECHA)  = @ANIO
                    AND MONTH(CP.FECHA) = @MES
                LEFT JOIN CLIENTESCAMPOSLIBRES CLC WITH(NOLOCK) ON CLC.CODCLIENTE = CP.CLIENTEID
                LEFT JOIN RUTAS RZ WITH(NOLOCK) ON RZ.CODRUTA = TRY_CAST(CLC.ZONA AS INT)
                WHERE M.ANIO = @ANIO AND M.MES = @MES
                GROUP BY M.ID, M.CODVENDEDOR, V.NOMVENDEDOR, M.META, M.CUMPLIDA,
                         TRY_CAST(CLC.ZONA AS INT), RZ.DESCRIPCION
                ORDER BY V.NOMVENDEDOR, ISNULL(RZ.DESCRIPCION, 'Sin zona')
            `);
        return res.recordset;
    }

    static async setCumplida(id: number, cumplida: boolean): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('ID',  mssql.Int, id)
            .input('CUM', mssql.Bit, cumplida ? 1 : 0)
            .query(`UPDATE APP_METAS_VENDEDOR SET CUMPLIDA = @CUM WHERE ID = @ID`);
    }

    static async eliminar(id: number): Promise<void> {
        const pool = await connectDb();
        // Obtener codvendedor/anio/mes antes de borrar para sincronizar RIP
        const meta = await pool.request()
            .input('ID', mssql.Int, id)
            .query(`SELECT CODVENDEDOR, ANIO, MES FROM APP_METAS_VENDEDOR WHERE ID = @ID`);
        const row = meta.recordset[0];

        await pool.request()
            .input('ID', mssql.Int, id)
            .query(`DELETE FROM APP_METAS_VENDEDOR WHERE ID = @ID`);

        if (row) {
            await pool.request()
                .input('COD',  mssql.Int, row.CODVENDEDOR)
                .input('ANIO', mssql.Int, row.ANIO)
                .input('MES',  mssql.Int, row.MES)
                .query(`DELETE FROM [RIP].[METAS_VENDEDORES] WHERE CODVENDEDOR = @COD AND ANYO = @ANIO AND MES = @MES`);
        }
    }
}
