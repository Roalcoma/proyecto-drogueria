import { mssql, connectDb } from '../db/db.conection';

const TABLA = 'APP_PROMO_AUDIT';

export class AuditService {

    static async initTabla() {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${TABLA}')
                CREATE TABLE ${TABLA} (
                    ID              INT IDENTITY(1,1) PRIMARY KEY,
                    ENTIDAD         NVARCHAR(50)  NOT NULL,
                    ACCION          NVARCHAR(20)  NOT NULL,
                    REGISTRO_ID     INT           NULL,
                    REGISTRO_NOMBRE NVARCHAR(200) NULL,
                    USUARIO_ID      INT           NULL,
                    USUARIO         NVARCHAR(100) NULL,
                    DATOS           NVARCHAR(MAX) NULL,
                    FECHA           DATETIME      NOT NULL DEFAULT GETDATE()
                )
            `);
        } catch (e: any) {
            console.error('[Audit] initTabla:', e.message);
        }
    }

    static async log(
        entidad: string,
        accion: 'CREAR' | 'ACTUALIZAR' | 'ELIMINAR',
        registroId: number | null,
        registroNombre: string,
        usuarioId: number | null,
        usuario: string | null,
        datos?: object,
    ) {
        try {
            const pool = await connectDb();
            await pool.request()
                .input('ENTIDAD',   mssql.NVarChar(50),   entidad)
                .input('ACCION',    mssql.NVarChar(20),   accion)
                .input('RID',       mssql.Int,             registroId)
                .input('RNOMBRE',   mssql.NVarChar(200),   registroNombre)
                .input('UID',       mssql.Int,             usuarioId)
                .input('USR',       mssql.NVarChar(100),   usuario)
                .input('DATOS',     mssql.NVarChar(mssql.MAX), datos ? JSON.stringify(datos) : null)
                .query(`INSERT INTO ${TABLA} (ENTIDAD,ACCION,REGISTRO_ID,REGISTRO_NOMBRE,USUARIO_ID,USUARIO,DATOS)
                        VALUES (@ENTIDAD,@ACCION,@RID,@RNOMBRE,@UID,@USR,@DATOS)`);
        } catch (e: any) {
            console.error('[Audit] log:', e.message);
        }
    }

    static async getAll(params: { entidad?: string; page: number; limit: number }) {
        const pool = await connectDb();
        const offset = (params.page - 1) * params.limit;
        const where  = params.entidad ? `WHERE ENTIDAD = @ENT` : '';
        const req    = pool.request()
            .input('OFFSET', mssql.Int, offset)
            .input('LIMIT',  mssql.Int, params.limit);
        if (params.entidad) req.input('ENT', mssql.NVarChar(50), params.entidad);

        const [data, cnt] = await Promise.all([
            req.query(`SELECT * FROM ${TABLA} ${where} ORDER BY FECHA DESC
                       OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY`),
            pool.request().query(`SELECT COUNT(*) AS TOTAL FROM ${TABLA} ${params.entidad ? `WHERE ENTIDAD='${params.entidad}'` : ''}`),
        ]);
        return { data: data.recordset, total: cnt.recordset[0].TOTAL };
    }
}
