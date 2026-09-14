import { mssql, connectDb } from '../db/db.conection';

const CAB  = 'APP_PROMO_ESPECIAL';
const PROV = 'APP_PROMO_ESPECIAL_PROV';
const PED  = 'APP_PROMO_ESPECIAL_PEDIDOS';

export class PromoEspecialService {

    static async initTablas() {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${CAB}')
                CREATE TABLE ${CAB} (
                    ID               INT IDENTITY(1,1) PRIMARY KEY,
                    NOMBRE           NVARCHAR(150) NOT NULL,
                    DIASMONTOFACTURA INT NOT NULL DEFAULT 0,
                    FECHAINICIO      DATE NOT NULL,
                    FECHAFIN         DATE NOT NULL,
                    ACTIVO           BIT NOT NULL DEFAULT 1,
                    FECHACREACION    DATETIME DEFAULT GETDATE()
                )
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${PROV}')
                CREATE TABLE ${PROV} (
                    ID           INT IDENTITY(1,1) PRIMARY KEY,
                    IDPROMO      INT NOT NULL,
                    CODPROVEEDOR INT NOT NULL,
                    NOMPROVEEDOR NVARCHAR(200) NOT NULL,
                    CONSTRAINT UQ_PE_PROV UNIQUE (IDPROMO, CODPROVEEDOR),
                    CONSTRAINT FK_PE_PROV_PROMO FOREIGN KEY (IDPROMO) REFERENCES ${CAB}(ID) ON DELETE CASCADE
                )
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${PED}')
                CREATE TABLE ${PED} (
                    ID               INT IDENTITY(1,1) PRIMARY KEY,
                    ORDERID          VARCHAR(50) NOT NULL,
                    DIASMONTOFACTURA INT NOT NULL DEFAULT 0,
                    FECHA            DATETIME DEFAULT GETDATE()
                )
            `);
            console.log('Tablas APP_PROMO_ESPECIAL* verificadas.');
        } catch (e: any) {
            console.error('[PromoEspecial] initTablas:', e.message);
        }
    }

    static async getById(id: number) {
        const pool = await connectDb();
        const res = await pool.request().input('ID', mssql.Int, id)
            .query(`SELECT * FROM ${CAB} WHERE ID=@ID`);
        return res.recordset[0] ?? null;
    }

    static async getAll() {
        const pool = await connectDb();
        const [cabRes, provRes] = await Promise.all([
            pool.request().query(`SELECT * FROM ${CAB} ORDER BY FECHACREACION DESC`),
            pool.request().query(`SELECT * FROM ${PROV}`),
        ]);
        const provPorPromo: Record<number, any[]> = {};
        provRes.recordset.forEach((r: any) => {
            (provPorPromo[r.IDPROMO] ??= []).push({ CODPROVEEDOR: r.CODPROVEEDOR, NOMPROVEEDOR: r.NOMPROVEEDOR });
        });
        const hoy = new Date();
        return cabRes.recordset.map((r: any) => ({
            ...r,
            proveedores: provPorPromo[r.ID] ?? [],
            VIGENTE_HOY: r.ACTIVO && new Date(r.FECHAINICIO) <= hoy && new Date(r.FECHAFIN) >= hoy,
        }));
    }

    static async getVigentes() {
        const pool = await connectDb();
        const hoy = new Date().toISOString().slice(0, 10);
        const cabRes = await pool.request()
            .input('HOY', mssql.Date, hoy)
            .query(`
                SELECT * FROM ${CAB}
                WHERE FECHAINICIO <= @HOY AND FECHAFIN >= @HOY
            `);
        if (!cabRes.recordset.length) return [];
        const ids = cabRes.recordset.map((r: any) => r.ID).join(',');
        const provRes = await pool.request().query(`SELECT * FROM ${PROV} WHERE IDPROMO IN (${ids})`);
        const provPorPromo: Record<number, number[]> = {};
        provRes.recordset.forEach((r: any) => {
            (provPorPromo[r.IDPROMO] ??= []).push(r.CODPROVEEDOR);
        });
        return cabRes.recordset.map((r: any) => ({
            ID:              r.ID,
            NOMBRE:          r.NOMBRE,
            DIASMONTOFACTURA: r.DIASMONTOFACTURA,
            codigos_proveedor: provPorPromo[r.ID] ?? [],
        }));
    }

    static async create(data: {
        nombre: string;
        diasMontofactura: number;
        fechaInicio: string;
        fechaFin: string;
        proveedores: { CODPROVEEDOR: number; NOMPROVEEDOR: string }[];
    }) {
        const pool = await connectDb();
        const res = await pool.request()
            .input('NOMBRE', mssql.NVarChar(150), data.nombre)
            .input('DMF',    mssql.Int,           data.diasMontofactura)
            .input('FI',     mssql.Date,           data.fechaInicio)
            .input('FF',     mssql.Date,           data.fechaFin)
            .query(`INSERT INTO ${CAB} (NOMBRE, DIASMONTOFACTURA, FECHAINICIO, FECHAFIN) OUTPUT INSERTED.ID VALUES (@NOMBRE, @DMF, @FI, @FF)`);
        const id = res.recordset[0].ID;
        for (const p of data.proveedores) {
            await pool.request()
                .input('IDPROMO', mssql.Int,          id)
                .input('COD',     mssql.Int,           p.CODPROVEEDOR)
                .input('NOM',     mssql.NVarChar(200), p.NOMPROVEEDOR)
                .query(`INSERT INTO ${PROV} (IDPROMO, CODPROVEEDOR, NOMPROVEEDOR) VALUES (@IDPROMO, @COD, @NOM)`);
        }
        return id;
    }

    static async update(id: number, data: {
        nombre: string;
        diasMontofactura: number;
        fechaInicio: string;
        fechaFin: string;
        activo: boolean;
        proveedores: { CODPROVEEDOR: number; NOMPROVEEDOR: string }[];
    }) {
        const pool = await connectDb();
        await pool.request()
            .input('ID',     mssql.Int,          id)
            .input('NOMBRE', mssql.NVarChar(150), data.nombre)
            .input('DMF',    mssql.Int,           data.diasMontofactura)
            .input('FI',     mssql.Date,          data.fechaInicio)
            .input('FF',     mssql.Date,          data.fechaFin)
            .input('ACTIVO', mssql.Bit,           data.activo ? 1 : 0)
            .query(`UPDATE ${CAB} SET NOMBRE=@NOMBRE, DIASMONTOFACTURA=@DMF, FECHAINICIO=@FI, FECHAFIN=@FF, ACTIVO=@ACTIVO WHERE ID=@ID`);
        await pool.request().input('ID', mssql.Int, id).query(`DELETE FROM ${PROV} WHERE IDPROMO=@ID`);
        for (const p of data.proveedores) {
            await pool.request()
                .input('IDPROMO', mssql.Int,          id)
                .input('COD',     mssql.Int,           p.CODPROVEEDOR)
                .input('NOM',     mssql.NVarChar(200), p.NOMPROVEEDOR)
                .query(`INSERT INTO ${PROV} (IDPROMO, CODPROVEEDOR, NOMPROVEEDOR) VALUES (@IDPROMO, @COD, @NOM)`);
        }
    }

    static async remove(id: number) {
        const pool = await connectDb();
        await pool.request().input('ID', mssql.Int, id).query(`DELETE FROM ${CAB} WHERE ID=@ID`);
    }

    static async registrarPedido(orderId: string, diasMontofactura: number) {
        try {
            const pool = await connectDb();
            await pool.request()
                .input('ORDERID', mssql.VarChar(50), orderId)
                .input('DMF',     mssql.Int,          diasMontofactura)
                .query(`INSERT INTO ${PED} (ORDERID, DIASMONTOFACTURA) VALUES (@ORDERID, @DMF)`);
        } catch (e: any) {
            console.error('[PromoEspecial] registrarPedido:', e.message);
        }
    }
}
