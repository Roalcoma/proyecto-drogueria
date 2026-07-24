import { mssql, connectDb } from "../db/db.conection";

export interface ReclamoLinea {
    numSerie:    string | null;
    numFactura:  number | null;
    numPedido:   number | null;
    fechaFac:    string | null;
    codarticulo: string;
    descripcion: string;
    cantidad:    number;
    motivo:      string | null;
}

export class ReclamosService {

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_RECLAMOS' AND xtype='U')
                CREATE TABLE APP_RECLAMOS (
                    ID            INT IDENTITY PRIMARY KEY,
                    CODCLIENTE    INT NOT NULL,
                    NUMSERIE      VARCHAR(20) NULL,
                    NUMFACTURA    INT NULL,
                    RECLAMO       NVARCHAR(MAX) NULL,
                    OBSERVACIONES NVARCHAR(MAX) NULL,
                    ARGUMENTOS    NVARCHAR(MAX) NULL,
                    USUARIO       NVARCHAR(100) NULL,
                    ESTATUS       NVARCHAR(50) NULL DEFAULT 'PENDIENTE',
                    FECHACREACION DATETIME NOT NULL DEFAULT GETDATE()
                );
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_RECLAMOS_CODCLI' AND object_id=OBJECT_ID('APP_RECLAMOS'))
                    CREATE INDEX IX_RECLAMOS_CODCLI ON APP_RECLAMOS (CODCLIENTE);

                -- Migrar columnas en tabla existente
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('APP_RECLAMOS') AND name='OBSERVACIONES')
                    ALTER TABLE APP_RECLAMOS ADD OBSERVACIONES NVARCHAR(MAX) NULL;
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('APP_RECLAMOS') AND name='ARGUMENTOS')
                    ALTER TABLE APP_RECLAMOS ADD ARGUMENTOS NVARCHAR(MAX) NULL;
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('APP_RECLAMOS') AND name='USUARIO')
                    ALTER TABLE APP_RECLAMOS ADD USUARIO NVARCHAR(100) NULL;
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('APP_RECLAMOS') AND name='ESTATUS')
                    ALTER TABLE APP_RECLAMOS ADD ESTATUS NVARCHAR(50) NULL;

                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_RECLAMOS_DET' AND xtype='U')
                CREATE TABLE APP_RECLAMOS_DET (
                    ID           INT IDENTITY PRIMARY KEY,
                    IDRECLAMO    INT NOT NULL,
                    NUMSERIE     VARCHAR(20) NULL,
                    NUMFACTURA   INT NULL,
                    NUMPEDIDO    INT NULL,
                    FECHA_FAC    DATE NULL,
                    CODARTICULO  VARCHAR(20) NULL,
                    DESCRIPCION  NVARCHAR(200) NULL,
                    CANTIDAD     DECIMAL(10,2) NOT NULL DEFAULT 1,
                    MOTIVO       NVARCHAR(200) NULL
                );
            `);
            console.log('Tablas APP_RECLAMOS / APP_RECLAMOS_DET verificadas.');
        } catch (err) {
            console.error('Advertencia en ReclamosService.initTablas:', err);
        }
    }

    static async crear(
        codCliente:    number,
        observaciones: string | null,
        argumentos:    string | null,
        usuario:       string | null,
        lineas:        ReclamoLinea[]
    ): Promise<number> {
        const pool = await connectDb();
        const result = await pool.request()
            .input('CODCLIENTE',    mssql.Int,           codCliente)
            .input('OBSERVACIONES', mssql.NVarChar(4000), observaciones ?? null)
            .input('ARGUMENTOS',    mssql.NVarChar(4000), argumentos ?? null)
            .input('USUARIO',       mssql.NVarChar(100),  usuario ?? null)
            .input('RECLAMO',       mssql.NVarChar(4000), observaciones ?? '')
            .query(`
                INSERT INTO APP_RECLAMOS (CODCLIENTE, RECLAMO, OBSERVACIONES, ARGUMENTOS, USUARIO, ESTATUS)
                OUTPUT INSERTED.ID
                VALUES (@CODCLIENTE, @RECLAMO, @OBSERVACIONES, @ARGUMENTOS, @USUARIO, 'PENDIENTE')
            `);
        const id: number = result.recordset[0].ID;

        if (lineas.length > 0) {
            const tabla = new mssql.Table('APP_RECLAMOS_DET');
            tabla.create = false;
            tabla.columns.add('IDRECLAMO',   mssql.Int,            { nullable: false });
            tabla.columns.add('NUMSERIE',    mssql.VarChar(20),    { nullable: true  });
            tabla.columns.add('NUMFACTURA',  mssql.Int,            { nullable: true  });
            tabla.columns.add('NUMPEDIDO',   mssql.Int,            { nullable: true  });
            tabla.columns.add('FECHA_FAC',   mssql.Date,           { nullable: true  });
            tabla.columns.add('CODARTICULO', mssql.VarChar(20),    { nullable: true  });
            tabla.columns.add('DESCRIPCION', mssql.NVarChar(200),  { nullable: true  });
            tabla.columns.add('CANTIDAD',    mssql.Decimal(10, 2), { nullable: false });
            tabla.columns.add('MOTIVO',      mssql.NVarChar(200),  { nullable: true  });
            for (const l of lineas) {
                tabla.rows.add(
                    id,
                    l.numSerie   ?? null,
                    l.numFactura ?? null,
                    l.numPedido  ?? null,
                    l.fechaFac   ? new Date(l.fechaFac) : null,
                    l.codarticulo || null,
                    l.descripcion || null,
                    l.cantidad,
                    l.motivo || null
                );
            }
            await pool.request().bulk(tabla);
        }

        return id;
    }

    static async getReclamos(search: string, page: number, limit: number) {
        const pool = await connectDb();
        const safeLimit = limit === -1 ? 10000 : Math.max(1, limit);
        const offset    = limit === -1 ? 0 : (Math.max(1, page) - 1) * safeLimit;
        const filtro    = search ? `%${search.toUpperCase()}%` : '%';
        const result = await pool.request()
            .input('FILTRO', mssql.NVarChar, filtro)
            .input('OFFSET', mssql.Int, offset)
            .input('LIMIT',  mssql.Int, safeLimit)
            .query(`
                SELECT R.ID, R.CODCLIENTE, CL.NOMBRECLIENTE, R.NUMSERIE, R.NUMFACTURA,
                       ISNULL(R.OBSERVACIONES, R.RECLAMO) AS RECLAMO,
                       R.FECHACREACION, R.USUARIO, ISNULL(R.ESTATUS,'PENDIENTE') AS ESTATUS,
                       (SELECT COUNT(*) FROM APP_RECLAMOS_DET D WHERE D.IDRECLAMO = R.ID) AS NUM_LINEAS
                FROM APP_RECLAMOS R
                    LEFT JOIN CLIENTES CL ON CL.CODCLIENTE = R.CODCLIENTE
                WHERE UPPER(ISNULL(CL.NOMBRECLIENTE,'')) LIKE @FILTRO
                   OR UPPER(ISNULL(R.OBSERVACIONES, ISNULL(R.RECLAMO,''))) LIKE @FILTRO
                ORDER BY R.FECHACREACION DESC
                OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
            `);
        const countResult = await pool.request()
            .input('FILTRO', mssql.NVarChar, filtro)
            .query(`
                SELECT COUNT(*) AS TOTAL
                FROM APP_RECLAMOS R
                    LEFT JOIN CLIENTES CL ON CL.CODCLIENTE = R.CODCLIENTE
                WHERE UPPER(ISNULL(CL.NOMBRECLIENTE,'')) LIKE @FILTRO
                   OR UPPER(ISNULL(R.OBSERVACIONES, ISNULL(R.RECLAMO,''))) LIKE @FILTRO
            `);
        return { data: result.recordset, total: countResult.recordset[0].TOTAL };
    }

    static async getById(id: number) {
        const pool = await connectDb();
        const reclamoRes = await pool.request()
            .input('ID', mssql.Int, id)
            .query(`
                SELECT R.ID, R.CODCLIENTE, R.FECHACREACION,
                       ISNULL(R.ESTATUS,'PENDIENTE') AS ESTATUS,
                       ISNULL(R.USUARIO,'') AS USUARIO,
                       ISNULL(R.OBSERVACIONES, R.RECLAMO) AS OBSERVACIONES,
                       ISNULL(R.ARGUMENTOS,'') AS ARGUMENTOS,
                       CL.NOMBRECLIENTE,
                       ISNULL(CL.TELEFONO1,'') AS TELEFONO,
                       ISNULL(CL.DIRECCION1,'') AS DIRECCION,
                       ISNULL(CLC.ZONA,'') AS CODZONA,
                       ISNULL(RUT.NOMBRE, ISNULL(CLC.ZONA,'')) AS NOMBRERUTA
                FROM APP_RECLAMOS R
                    LEFT JOIN CLIENTES CL ON CL.CODCLIENTE = R.CODCLIENTE
                    LEFT JOIN CLIENTESCAMPOSLIBRES CLC ON CLC.CODCLIENTE = R.CODCLIENTE
                    LEFT JOIN RUTAS RUT ON RUT.CODRUTA = TRY_CAST(CLC.ZONA AS INT)
                WHERE R.ID = @ID
            `);
        if (reclamoRes.recordset.length === 0) return null;

        const lineasRes = await pool.request()
            .input('ID', mssql.Int, id)
            .query(`
                SELECT ID, ISNULL(NUMSERIE,'') AS NUMSERIE, NUMFACTURA, NUMPEDIDO,
                       FECHA_FAC, ISNULL(CODARTICULO,'') AS CODARTICULO,
                       ISNULL(DESCRIPCION,'') AS DESCRIPCION,
                       CANTIDAD, ISNULL(MOTIVO,'') AS MOTIVO
                FROM APP_RECLAMOS_DET
                WHERE IDRECLAMO = @ID
                ORDER BY ID
            `);

        return {
            reclamo: reclamoRes.recordset[0],
            lineas:  lineasRes.recordset,
        };
    }

    static async getFacturasDeCliente(codCliente: number) {
        const pool = await connectDb();
        const result = await pool.request()
            .input('CODCLIENTE', mssql.Int, codCliente)
            .query(`
                SELECT TOP 100 NUMSERIE, NUMFACTURA, FECHA, TOTALNETO
                FROM FACTURASVENTA
                WHERE CODCLIENTE = @CODCLIENTE
                ORDER BY FECHA DESC
            `);
        return result.recordset;
    }

    static async getArticulosDeFactura(numSerie: string, numFactura: number) {
        const pool = await connectDb();
        const result = await pool.request()
            .input('NS', mssql.VarChar(20), numSerie)
            .input('NF', mssql.Int, numFactura)
            .query(`
                SELECT
                    ART.CODARTICULO,
                    ART.DESCRIPCION,
                    SUM(VENTA.UNIDADESTOTAL) AS CANTIDAD,
                    CAST(FACVE.FECHA AS DATE) AS FECHA,
                    ISNULL(CAST(PED.SUPEDIDO AS NVARCHAR(50)), '') AS NUMPEDIDO
                FROM FACTURASVENTA FACVE WITH(NOLOCK)
                INNER JOIN ALBVENTACAB AVC WITH(NOLOCK)
                    ON AVC.NUMSERIEFAC COLLATE DATABASE_DEFAULT = FACVE.NUMSERIE COLLATE DATABASE_DEFAULT
                    AND AVC.NUMFAC = FACVE.NUMFACTURA
                LEFT JOIN PEDVENTACAB PED WITH(NOLOCK)
                    ON PED.SERIEALBARAN = AVC.NUMSERIE
                    AND PED.NUMEROALBARAN = AVC.NUMALBARAN
                    AND PED.NALBARAN = AVC.N
                INNER JOIN ALBVENTALIN VENTA WITH(NOLOCK)
                    ON VENTA.NUMSERIE = AVC.NUMSERIE
                    AND VENTA.NUMALBARAN = AVC.NUMALBARAN
                    AND VENTA.UNIDADESTOTAL <> 0
                INNER JOIN ARTICULOS ART WITH(NOLOCK)
                    ON ART.CODARTICULO = VENTA.CODARTICULO
                WHERE FACVE.NUMSERIE = @NS AND FACVE.NUMFACTURA = @NF
                GROUP BY ART.CODARTICULO, ART.DESCRIPCION, FACVE.FECHA, PED.SUPEDIDO
                ORDER BY ART.DESCRIPCION
            `);
        return result.recordset;
    }
}
