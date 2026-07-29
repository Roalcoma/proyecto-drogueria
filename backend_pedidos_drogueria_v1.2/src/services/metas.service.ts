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
            `);
            console.log('Tabla APP_METAS_VENDEDOR verificada.');
        } catch (err) {
            console.error('Error en MetasService.initTablas:', err);
        }
    }

    static async getVendedores(): Promise<{ CODVENDEDOR: number; NOMVENDEDOR: string }[]> {
        const pool = await connectDb();
        const res = await pool.request().query(
            `SELECT CODVENDEDOR, NOMVENDEDOR FROM VENDEDORES WHERE ACTIVO = 1 ORDER BY NOMVENDEDOR`
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

        const res = await req.query(`
            MERGE APP_METAS_VENDEDOR AS T
            USING (SELECT @COD AS C, @ANIO AS A, @MES AS M) AS S
            ON (T.CODVENDEDOR = S.C AND T.ANIO = S.A AND T.MES = S.M)
            WHEN MATCHED THEN UPDATE SET T.META = @META, T.FECHACARGA = GETDATE()
            WHEN NOT MATCHED THEN INSERT (CODVENDEDOR, ANIO, MES, META) VALUES (@COD, @ANIO, @MES, @META);
            SELECT SCOPE_IDENTITY() AS ID;

            MERGE [RIP].[METAS_VENDEDORES] AS T
            USING (SELECT @COD AS C, @ANIO AS A, @MES AS M) AS S
            ON (T.CODVENDEDOR = S.C AND T.ANYO = S.A AND T.MES = S.M)
            WHEN MATCHED THEN UPDATE SET T.META = @META
            WHEN NOT MATCHED THEN INSERT (CODVENDEDOR, ANYO, MES, META) VALUES (@COD, @ANIO, @MES, @META);
        `);
        return res.recordset[0]?.ID ?? 0;
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
