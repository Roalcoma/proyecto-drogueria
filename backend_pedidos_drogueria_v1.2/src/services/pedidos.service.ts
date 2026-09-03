import mssql from 'mssql'
import { connectDb } from "../db/db.conection";
import { PromocionesService } from "./promociones.service";
import { getDbConfig } from './dbconfig.service';
import 'dotenv/config'

const esquema = process.env.DB_ESQUEMA || 'dbo';

const TRANSICIONES_PERMITIDAS: Record<string, string[]> = {
    'PENDIENTE':                  ['PENDIENTE POR AUTORIZACION', 'AUTORIZADO', 'CANCELADO'],
    'PENDIENTE POR AUTORIZACION': ['AUTORIZADO', 'CANCELADO'],
    'AUTORIZADO':                 ['CANCELADO'],
    'OK':                         ['CANCELADO'],
    'EMPACADO':                   ['AUTORIZADO', 'CANCELADO'],
    'ICG':                        ['CANCELADO'],
    'APROBACION PSICOTROPICOS':   ['SANIDAD', 'CANCELADO'],
    'SANIDAD':                    ['CANCELADO'],
};

export const ESTATUS_APROBACION_PSICOTROPICOS = 'APROBACION PSICOTROPICOS';

const ESTATUSES_VALIDOS = new Set([
    'PENDIENTE', 'PENDIENTE POR AUTORIZACION', 'APROBACION PSICOTROPICOS', 'SANIDAD',
    'AUTORIZADO', 'ICG', 'OK', 'EMPACADO', 'FINALIZADO', 'CANCELADO',
]);
const buildEstatusClause = (estatus: string | undefined, col: string): string | null => {
    if (!estatus) return null;
    const lista = estatus.split(',').map(s => s.trim()).filter(s => ESTATUSES_VALIDOS.has(s));
    if (lista.length === 0) return null;
    if (lista.length === 1) return `${col} = '${lista[0]}'`;
    return `${col} IN (${lista.map(s => `'${s}'`).join(',')})`;
};

export class PedidosServices {

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='CABECERA_PED')
                  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='CABECERA_PED' AND COLUMN_NAME='OBSERVACIONES')
                BEGIN
                  ALTER TABLE ${esquema}.CABECERA_PED ADD OBSERVACIONES NVARCHAR(255) NULL
                END
            `);
            await pool.request().query(`
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='CABECERA_PED')
                  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='CABECERA_PED' AND COLUMN_NAME='PROMO_NOMBRE')
                BEGIN
                  ALTER TABLE ${esquema}.CABECERA_PED ADD PROMO_NOMBRE NVARCHAR(500) NULL
                END
            `);
            await pool.request().query(`
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='LINEA_PED')
                  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='LINEA_PED' AND COLUMN_NAME='PORCENTAJEIVA')
                BEGIN
                  ALTER TABLE ${esquema}.LINEA_PED ADD PORCENTAJEIVA FLOAT NULL
                END
            `);
            await pool.request().query(`
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='LINEA_PED')
                  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='LINEA_PED' AND COLUMN_NAME='MONTOIVA')
                BEGIN
                  ALTER TABLE ${esquema}.LINEA_PED ADD MONTOIVA FLOAT NULL
                END
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_PEDIDO_SEQ')
                    CREATE TABLE ${esquema}.APP_PEDIDO_SEQ (ULTIMO_ID INT NOT NULL DEFAULT 0)
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM ${esquema}.APP_PEDIDO_SEQ)
                    INSERT INTO ${esquema}.APP_PEDIDO_SEQ VALUES (0)
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_PEDIDO_LOG')
                    CREATE TABLE ${esquema}.APP_PEDIDO_LOG (
                        ID           INT IDENTITY(1,1) PRIMARY KEY,
                        ORDERID      VARCHAR(50)   NOT NULL,
                        EST_ANTERIOR VARCHAR(50)   NULL,
                        EST_NUEVO    VARCHAR(50)   NOT NULL,
                        CODUSUARIO   INT           NULL,
                        USUARIO      VARCHAR(100)  NULL,
                        FECHA        DATETIME      NOT NULL DEFAULT GETDATE(),
                        DETALLES     NVARCHAR(500) NULL
                    )
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PEDLOG_ORDERID' AND object_id=OBJECT_ID('${esquema}.APP_PEDIDO_LOG'))
                    CREATE INDEX IX_PEDLOG_ORDERID ON ${esquema}.APP_PEDIDO_LOG (ORDERID)
            `);
            // Migraciones en APP_PEDIDO_LOG
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_PEDIDO_LOG' AND COLUMN_NAME='SNAPSHOT_ANTES')
                    ALTER TABLE ${esquema}.APP_PEDIDO_LOG ADD SNAPSHOT_ANTES NVARCHAR(MAX) NULL;
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_PEDIDO_LOG' AND COLUMN_NAME='SNAPSHOT_DESPUES')
                    ALTER TABLE ${esquema}.APP_PEDIDO_LOG ADD SNAPSHOT_DESPUES NVARCHAR(MAX) NULL;
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_PEDIDO_LOG' AND COLUMN_NAME='DETALLES' AND CHARACTER_MAXIMUM_LENGTH = 500)
                    ALTER TABLE ${esquema}.APP_PEDIDO_LOG ALTER COLUMN DETALLES NVARCHAR(MAX) NULL;
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_CABECERA_PED_ELIMINADOS')
                    CREATE TABLE ${esquema}.APP_CABECERA_PED_ELIMINADOS (
                        ID               INT IDENTITY(1,1) PRIMARY KEY,
                        ORDERID          VARCHAR(50)    NOT NULL,
                        CLIENTEID        INT            NULL,
                        FECHA            DATETIME       NULL,
                        ESTATUS          VARCHAR(50)    NULL,
                        CODVENDEDOR      INT            NULL,
                        TOTALPRECIO      FLOAT          NULL,
                        OBSERVACIONES    NVARCHAR(255)  NULL,
                        PROMO_NOMBRE     NVARCHAR(500)  NULL,
                        FECHA_ELIMINADO  DATETIME       NOT NULL DEFAULT GETDATE(),
                        CODUSUARIO_ELIMINO INT          NULL,
                        USUARIO_ELIMINO  VARCHAR(100)   NULL
                    )
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_LINEA_PED_ELIMINADOS')
                    CREATE TABLE ${esquema}.APP_LINEA_PED_ELIMINADOS (
                        ID               INT IDENTITY(1,1) PRIMARY KEY,
                        ORDERID          VARCHAR(50)    NOT NULL,
                        CODARTICULO      INT            NULL,
                        REFERENCIA       VARCHAR(50)    NULL,
                        CODALMACEN       VARCHAR(10)    NULL,
                        IDTARIFAV        INT            NULL,
                        PRODUCTCOUNT     INT            NULL,
                        PRECIOUNITARIO   FLOAT          NULL,
                        DESCUENTO1       FLOAT          NULL,
                        DESCUENTO2       FLOAT          NULL,
                        DESCUENTO3       FLOAT          NULL,
                        DESCUENTO4       FLOAT          NULL,
                        PRECIOBRUTO      FLOAT          NULL,
                        PORCENTAJEIVA    FLOAT          NULL,
                        MONTOIVA         FLOAT          NULL,
                        FECHA_ELIMINADO  DATETIME       NOT NULL DEFAULT GETDATE()
                    )
            `);
            console.log('Tablas de pedidos verificadas.');
        } catch (err) {
            console.error('Advertencia en PedidosServices.initTablas:', err);
        }
    }

    static async reservarNumero(): Promise<number> {
        const pool = await connectDb();
        const res = await pool.request().query(`
            UPDATE ${esquema}.APP_PEDIDO_SEQ SET ULTIMO_ID = ULTIMO_ID + 1
            OUTPUT INSERTED.ULTIMO_ID
        `);
        return res.recordset[0].ULTIMO_ID as number;
    }

    static async getSeq(): Promise<number> {
        const pool = await connectDb();
        const res = await pool.request().query(`SELECT ULTIMO_ID FROM ${esquema}.APP_PEDIDO_SEQ WITH (NOLOCK)`);
        return res.recordset[0]?.ULTIMO_ID ?? 0;
    }

    static async setSeq(valor: number): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('V', mssql.Int, valor)
            .query(`UPDATE ${esquema}.APP_PEDIDO_SEQ SET ULTIMO_ID = @V`);
    }

    private static async tieneArticulosPsicotropicos(codigos: number[]): Promise<boolean> {
        if (codigos.length === 0) return false;
        const pool = await connectDb();
        const request = pool.request();
        const placeholders = codigos.map((id, i) => { request.input(`cod${i}`, id); return `@cod${i}`; }).join(',');
        request.input('dptoPsico', mssql.Int, getDbConfig().dptoPsicotropicos);
        const result = await request.query(`SELECT COUNT(*) AS CNT FROM ARTICULOS WITH (NOLOCK) WHERE CODARTICULO IN (${placeholders}) AND SECCION = @dptoPsico`);
        return result.recordset[0].CNT > 0;
    }

    static async postPedidosCabecera(pedido: any, codusuario?: number, usuario?: string) {
        try {
            console.log('Datos recibidos para el pedido:', pedido);
            const { clienteId, codVendedor, totalPed, lineas, sufijo, promocionesAplicadas } = pedido;
            // Si el frontend pre-asignó un número, úsalo; si no, reserva uno nuevo
            let orderId: string;
            if (pedido.orderId) {
                orderId = String(pedido.orderId);
            } else {
                const num = await PedidosServices.reservarNumero();
                orderId = sufijo ? `${num}${sufijo}` : String(num);
            }

            const requierePsicotropicos = await this.tieneArticulosPsicotropicos(lineas.map((l: any) => l.codarticulo));
            const estatusInicial = requierePsicotropicos ? ESTATUS_APROBACION_PSICOTROPICOS : 'PENDIENTE';
            const promoNombre = (promocionesAplicadas || []).map((p: any) => p.nombre).filter(Boolean).join(', ');

            const maxLineas = getDbConfig().maxLineasPorPedido ?? 0;
            const insertarCabecera = async (chunkId: string, chunkTotal: number) => {
                const pool = await connectDb();
                return pool.request()
                    .input('ORDERID', mssql.NVarChar, chunkId)
                    .input('CLIENTEID', mssql.Int, clienteId)
                    .input('CODVENDEDOR', mssql.Int, codVendedor)
                    .input('TOTALPRECIO', mssql.Float, chunkTotal)
                    .input('ESTATUS', mssql.VarChar, estatusInicial)
                    .input('PROMO_NOMBRE', mssql.NVarChar(500), promoNombre || null)
                    .query(`INSERT INTO ${esquema}.CABECERA_PED (
                                ORDERID, CLIENTEID, FECHA, ESTATUS, CODVENDEDOR, TOTALPRECIO, PROMO_NOMBRE
                            ) VALUES (
                                @ORDERID, @CLIENTEID, GETDATE(), @ESTATUS,
                                ISNULL(NULLIF((SELECT TOP 1 CAST(CCL.CODVENDEDOR AS INT) FROM CLIENTESCAMPOSLIBRES CCL WITH (NOLOCK) WHERE CCL.CODCLIENTE = @CLIENTEID AND CCL.CODVENDEDOR IS NOT NULL AND LTRIM(RTRIM(CAST(CCL.CODVENDEDOR AS NVARCHAR)))!=''), 0), @CODVENDEDOR),
                                @TOTALPRECIO, @PROMO_NOMBRE
                            );`);
            };

            if (maxLineas > 0 && lineas.length > maxLineas) {
                const totalChunks = Math.ceil(lineas.length / maxLineas);
                const orderIds: string[] = [];
                for (let i = 0; i < lineas.length; i += maxLineas) {
                    const chunk = lineas.slice(i, i + maxLineas);
                    const idx = Math.floor(i / maxLineas);
                    const chunkId = idx === 0 ? orderId : `${orderId}-${idx + 1}`;
                    const chunkTotal = chunk.reduce((s: number, l: any) => s + ((l.precio || 0) * (l.cantidad || 0)), 0);

                    const result = await insertarCabecera(chunkId, chunkTotal || totalPed);
                    const insertLineas = await this.postPedidosLinea(chunk, chunkId);
                    if (Number(result.rowsAffected) === 0 || insertLineas.success === false) {
                        return { success: false, message: 'No se pudo insertar el pedido' };
                    }
                    await PedidosServices.registrarLog(chunkId, null, estatusInicial, codusuario, usuario,
                        `Pedido creado (parte ${idx + 1}/${totalChunks}). Cliente: ${clienteId}.`);
                    orderIds.push(chunkId);
                }
                await PromocionesService.registrarAplicadas(orderId, promocionesAplicadas);
                return { success: true, message: 'El pedido fue insertado de forma satisfactoria', orderId, orderIds };
            }

            const result = await insertarCabecera(orderId, totalPed);
            const insertLineas = await this.postPedidosLinea(lineas, orderId);

            if (Number(result.rowsAffected) === 0 || insertLineas.success === false) {
                return { success: false, message: 'No se pudo insertar el pedido' };
            }

            await PromocionesService.registrarAplicadas(orderId, promocionesAplicadas);
            await PedidosServices.registrarLog(orderId, null, estatusInicial, codusuario, usuario, `Pedido creado. Cliente: ${clienteId}. Total: ${totalPed}`);

            return { success: true, message: 'El pedido fue insertado de forma satisfactoria', orderId };

        } catch (error) {
            console.error('Error al subir el pedido: ', error)
            return { success: false, message: 'Hubo un fallo con la base de datos', error: error }
        }
    }

    static async postPedidosLinea(lineas: any[], orderId: string) {
        try {
            const pool = await connectDb();

            // PREPARAR LA TABLA EN MEMORIA
            const tablaLineas = new mssql.Table(`${esquema}.LINEA_PED`);
            tablaLineas.create = false;

            tablaLineas.columns.add('ORDERID', mssql.VarChar(50), { nullable: false });
            tablaLineas.columns.add('CODARTICULO', mssql.Int, { nullable: false });
            tablaLineas.columns.add('REFERENCIA', mssql.VarChar(50), { nullable: true });
            tablaLineas.columns.add('CODALMACEN', mssql.VarChar(10), { nullable: false });
            tablaLineas.columns.add('IDTARIFAV', mssql.Int, { nullable: false });
            tablaLineas.columns.add('PRODUCTCOUNT', mssql.Int, { nullable: false });
            tablaLineas.columns.add('PRECIOUNITARIO', mssql.Float, { nullable: false });

            tablaLineas.columns.add('DESCUENTO1', mssql.Float, { nullable: true });
            tablaLineas.columns.add('DESCUENTO2', mssql.Float, { nullable: true });
            tablaLineas.columns.add('DESCUENTO3', mssql.Float, { nullable: true });
            tablaLineas.columns.add('DESCUENTO4', mssql.Float, { nullable: true });
            tablaLineas.columns.add('PRECIOBRUTO', mssql.Float, { nullable: true });
            tablaLineas.columns.add('PORCENTAJEIVA', mssql.Float, { nullable: true });
            tablaLineas.columns.add('MONTOIVA', mssql.Float, { nullable: true });

            for (let i = 0; i < lineas.length; i++) {
                const {
                    codarticulo, referencia, idtarifav, cantidad, precio,
                    DESCUENTO1, DESCUENTO2, DESCUENTO3, DESCUENTO4, PRECIOBRUTO,
                    PORCENTAJEIVA, MONTOIVA
                } = lineas[i];

                if (!cantidad || cantidad < 1) throw new Error(`Cantidad inválida (${cantidad}) en artículo ${codarticulo}`);

                tablaLineas.rows.add(
                    orderId,
                    codarticulo,
                    referencia || '',
                    getDbConfig().codAlmacen,
                    idtarifav,
                    cantidad,
                    precio,
                    DESCUENTO1 || 0,
                    DESCUENTO2 || 0,
                    DESCUENTO3 || 0,
                    DESCUENTO4 || 0,
                    PRECIOBRUTO || precio,
                    PORCENTAJEIVA || 0,
                    MONTOIVA || 0
                );
            }

            // 4. EJECUTAR BULK INSERT
            const result = await pool.request().bulk(tablaLineas);
            
            return {
                success: true,
                message: `Se insertaron ${lineas.length} líneas correctamente`,
                filasAfectadas: result.rowsAffected
            };

        } catch (error) {
            console.error('Error al subir las líneas del pedido: ', error);
            return {
                success: false,
                message: 'Hubo un fallo con la base de datos al procesar el detalle',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    static async getPedidos(page: any = 1, limit: any = 10, estatus?: string, buscarId?: string,
                             clienteId?: string, codVendedor?: string, riesgo?: string, codruta?: string,
                             fechaDesde?: string, fechaHasta?: string, esPsicotropico?: boolean,
                             nombreCliente?: string, soloFacturado?: boolean, usuario?: string,
                             nroFactura?: string) {
        try {
            const isAll = Number(limit) === -1;
            let validPage = isAll ? 1 : Math.max(1, Number(page) || 1);
            let validLimit = isAll ? 10000 : Math.max(1, Number(limit) || 10);
            const offset = isAll ? 0 : (validPage - 1) * validLimit;
            const usdCode = Number(process.env.USD) || 2;
            const vedCode = Number(process.env.VED) || 1;

            const pool = await connectDb();
            const estatusClause  = buildEstatusClause(estatus, 'CP.ESTATUS');
            const estatusClause2 = buildEstatusClause(estatus, 'CP.ESTATUS');
            const incluirCancelado = !!(estatus && estatus.split(',').map(s => s.trim()).includes('CANCELADO'));
            const sumaUSD = incluirCancelado
                ? 'ISNULL(SUM(CP.TOTALPRECIO), 0)'
                : "ISNULL(SUM(CASE WHEN CP.ESTATUS != 'CANCELADO' THEN CP.TOTALPRECIO ELSE 0 END), 0)";

            // Pre-lookup por nroFactura: query tiny sobre ALBVENTACAB+PEDVENTACAB para obtener
            // los ORDERIDs correspondientes. Evita joins+COLLATE en el query principal.
            let preIds: string[] = [];
            let orderIdClause = '';
            if (nroFactura) {
                const preRes = await pool.request()
                    .input('NRO', mssql.Int, Number(nroFactura))
                    .query(`
                        SELECT DISTINCT RTRIM(LTRIM(PVC.SUPEDIDO)) AS ORDERID
                        FROM ALBVENTACAB AVC WITH(NOLOCK)
                        INNER JOIN PEDVENTACAB PVC WITH(NOLOCK)
                            ON PVC.SERIEALBARAN = AVC.NUMSERIE
                            AND PVC.NUMEROALBARAN = AVC.NUMALBARAN
                            AND PVC.NALBARAN = AVC.N
                        WHERE AVC.NUMFAC = @NRO AND AVC.FACTURADO = 'T'
                    `);
                preIds = preRes.recordset.map((r: any) => String(r.ORDERID).trim());
                if (preIds.length === 0) {
                    return { success: true, message: 'Pedidos obtenidos correctamente', data: [], total: 0, totalUSD: 0 };
                }
                orderIdClause = `AND CP.ORDERID IN (${preIds.map((_, i) => `@PRE${i}`).join(',')})`;
            }

            const req = pool.request()
                .input('OFFSET',         mssql.Int,           offset)
                .input('LIMIT',          mssql.Int,           validLimit)
                .input('BUSCAR_ID',      mssql.VarChar(50),   buscarId      ? `%${buscarId}%`      : null)
                .input('CLIENTE_ID',     mssql.Int,           clienteId     ? Number(clienteId)     : null)
                .input('COD_VENDEDOR',   mssql.Int,           codVendedor   ? Number(codVendedor)   : null)
                .input('RIESGO',         mssql.VarChar(20),   riesgo        || null)
                .input('CODRUTA',        mssql.Int,           codruta       ? Number(codruta)       : null)
                .input('FECHA_DESDE',    mssql.VarChar(10),   fechaDesde    || null)
                .input('FECHA_HASTA',    mssql.VarChar(10),   fechaHasta    || null)
                .input('PSICO',          mssql.Bit,           esPsicotropico ? 1 : null)
                .input('NOMBRE_CLIENTE', mssql.NVarChar(200), nombreCliente ? `%${nombreCliente.toLowerCase()}%` : null)
                .input('SOLO_FACTURADO', mssql.Bit,           soloFacturado  ? 1 : null)
                .input('USD_CODE',       mssql.Int,           usdCode)
                .input('VED_CODE',       mssql.Int,           vedCode)
                .input('USUARIO',        mssql.VarChar(100),  usuario       ? `%${usuario.toLowerCase()}%`       : null);
            preIds.forEach((id, i) => req.input(`PRE${i}`, mssql.VarChar(50), id));

            const result = await req.query(`
                SELECT
                    CP.ORDERID, CP.CLIENTEID, CP.FECHA, CP.ESTATUS, CP.CODVENDEDOR, CP.TOTALPRECIO,
                    CP.OBSERVACIONES, CP.PROMO_NOMBRE, LG.USUARIO AS CREADO_POR,
                    FAC.FACTURADO, FAC.SERIE_FAC, FAC.NROFAC,
                    CL.NOMBRECLIENTE, ISNULL(CL.NOMBRECOMERCIAL, '') AS NOMBRECOMERCIAL, CL.CIF, ISNULL(CL.NIF20, '') AS NIF20, CL.DIRECCION1, ISNULL(CE.DIRECCION1, CL.DIRECCION1) AS DIRECCION_ENVIO,
                    ISNULL(CLC.ZONA, '') AS ZONA, ISNULL(RUT.DESCRIPCION, '') AS RUTA,
                    V.NOMVENDEDOR,
                    CR.ESTATUS AS RIESGO_ESTATUS,
                    (SELECT SUM(LP.PRODUCTCOUNT) FROM ${esquema}.LINEA_PED LP WITH (NOLOCK) WHERE LP.ORDERID = CP.ORDERID) AS TOTALUNIDADES
                FROM
                    ${esquema}.CABECERA_PED CP WITH (NOLOCK)
                    LEFT JOIN CLIENTES CL WITH (NOLOCK) ON CL.CODCLIENTE = CP.CLIENTEID
                    OUTER APPLY (SELECT TOP 1 DIRECCION1 FROM CLIENTESENVIO WITH (NOLOCK) WHERE CODCLIENTE = CP.CLIENTEID) CE
                    LEFT JOIN VENDEDORES V WITH (NOLOCK) ON V.CODVENDEDOR = CP.CODVENDEDOR
                    OUTER APPLY (SELECT TOP 1 ZONA FROM CLIENTESCAMPOSLIBRES WITH (NOLOCK) WHERE CODCLIENTE = CP.CLIENTEID) CLC
                    LEFT JOIN RUTAS RUT WITH (NOLOCK) ON RUT.CODRUTA = TRY_CAST(CLC.ZONA AS INT)
                    OUTER APPLY (SELECT TOP 1 USUARIO FROM ${esquema}.APP_PEDIDO_LOG WITH (NOLOCK) WHERE ORDERID = CP.ORDERID AND USUARIO IS NOT NULL ORDER BY FECHA ASC) LG
                    OUTER APPLY (
                        SELECT TOP 1 AVC.FACTURADO, AVC.NUMSERIEFAC AS SERIE_FAC, AVC.NUMFAC AS NROFAC
                        FROM PEDVENTACAB PVC WITH(NOLOCK)
                        INNER JOIN ALBVENTACAB AVC WITH(NOLOCK) ON AVC.NUMSERIE = PVC.SERIEALBARAN AND AVC.NUMALBARAN = PVC.NUMEROALBARAN AND AVC.N = PVC.NALBARAN
                            AND AVC.FACTURADO = 'T'
                        WHERE PVC.SUPEDIDO COLLATE DATABASE_DEFAULT = CP.ORDERID COLLATE DATABASE_DEFAULT
                    ) FAC
                    LEFT JOIN (
                        SELECT CL.CODCLIENTE,
                            CASE
                                WHEN CL.RIESGOCONCEDIDO = 0 THEN 'SIN LIMITE'
                                WHEN (ISNULL(SUM(CASE WHEN ISNULL(T.CODMONEDA,1)=@USD_CODE THEN T.IMPORTE ELSE T.IMPORTE/NULLIF(DBO.F_GET_COTIZACION(GETDATE(),@VED_CODE),0) END),0) * 100.0 / CL.RIESGOCONCEDIDO) >= 100 THEN 'SUPERADO'
                                WHEN (ISNULL(SUM(CASE WHEN ISNULL(T.CODMONEDA,1)=@USD_CODE THEN T.IMPORTE ELSE T.IMPORTE/NULLIF(DBO.F_GET_COTIZACION(GETDATE(),@VED_CODE),0) END),0) * 100.0 / CL.RIESGOCONCEDIDO) >= 80  THEN 'ALTO'
                                WHEN (ISNULL(SUM(CASE WHEN ISNULL(T.CODMONEDA,1)=@USD_CODE THEN T.IMPORTE ELSE T.IMPORTE/NULLIF(DBO.F_GET_COTIZACION(GETDATE(),@VED_CODE),0) END),0) * 100.0 / CL.RIESGOCONCEDIDO) >= 30  THEN 'MEDIO'
                                ELSE 'BAJO'
                            END AS ESTATUS
                        FROM CLIENTES CL WITH (NOLOCK)
                        LEFT JOIN TESORERIA T WITH (NOLOCK) ON T.CODIGOINTERNO = CL.CODCLIENTE
                            AND T.ESTADO = 'P' AND T.ORIGEN = 'C' AND T.SERIE NOT LIKE '%P'
                        GROUP BY CL.CODCLIENTE, CL.RIESGOCONCEDIDO
                    ) CR ON CR.CODCLIENTE = CP.CLIENTEID
                WHERE
                    (${estatusClause ? estatusClause : '1=1'})
                    AND (@BUSCAR_ID    IS NULL OR CP.ORDERID    LIKE @BUSCAR_ID)
                    AND (@CLIENTE_ID   IS NULL OR CP.CLIENTEID  = @CLIENTE_ID)
                    AND (@COD_VENDEDOR IS NULL OR CP.CODVENDEDOR = @COD_VENDEDOR)
                    AND (@RIESGO       IS NULL OR CR.ESTATUS     = @RIESGO)
                    AND (@CODRUTA      IS NULL OR TRY_CAST(CLC.ZONA AS INT) = @CODRUTA)
                    AND (@FECHA_DESDE  IS NULL OR CAST(CP.FECHA AS DATE) >= @FECHA_DESDE)
                    AND (@FECHA_HASTA  IS NULL OR CAST(CP.FECHA AS DATE) <= @FECHA_HASTA)
                    AND (@PSICO        IS NULL OR (@PSICO = 1 AND CP.ORDERID LIKE '%P'))
                    AND (@NOMBRE_CLIENTE IS NULL OR LOWER(CL.NOMBRECLIENTE) LIKE @NOMBRE_CLIENTE)
                    AND (@USUARIO       IS NULL OR LOWER(ISNULL(LG.USUARIO, '')) LIKE @USUARIO OR LOWER(ISNULL(V.NOMVENDEDOR, '')) LIKE @USUARIO)
                    AND (@SOLO_FACTURADO IS NULL OR FAC.FACTURADO IS NOT NULL)
                    ${orderIdClause}
                ORDER BY
                    CP.FECHA DESC
                OFFSET @OFFSET ROWS
                FETCH NEXT @LIMIT ROWS ONLY
            `);

            const countReq = pool.request()
                .input('BUSCAR_ID2',       mssql.VarChar(50),   buscarId      ? `%${buscarId}%`      : null)
                .input('CLIENTE_ID2',      mssql.Int,           clienteId     ? Number(clienteId)     : null)
                .input('COD_VENDEDOR2',    mssql.Int,           codVendedor   ? Number(codVendedor)   : null)
                .input('RIESGO2',          mssql.VarChar(20),   riesgo        || null)
                .input('CODRUTA2',         mssql.Int,           codruta       ? Number(codruta)       : null)
                .input('FECHA_DESDE2',     mssql.VarChar(10),   fechaDesde    || null)
                .input('FECHA_HASTA2',     mssql.VarChar(10),   fechaHasta    || null)
                .input('PSICO2',           mssql.Bit,           esPsicotropico ? 1 : null)
                .input('NOMBRE_CLIENTE2',  mssql.NVarChar(200), nombreCliente ? `%${nombreCliente.toLowerCase()}%` : null)
                .input('SOLO_FACTURADO2',  mssql.Bit,           soloFacturado  ? 1 : null)
                .input('USUARIO2',         mssql.VarChar(100),  usuario       ? `%${usuario.toLowerCase()}%`       : null);
            preIds.forEach((id, i) => countReq.input(`CPRE${i}`, mssql.VarChar(50), id));
            const countOrderIdClause = preIds.length
                ? `AND CP.ORDERID IN (${preIds.map((_, i) => `@CPRE${i}`).join(',')})`
                : '';

            const countResult = await countReq.query(`
                SELECT COUNT(*) AS TOTAL, ${sumaUSD} AS TOTAL_USD
                FROM ${esquema}.CABECERA_PED CP WITH (NOLOCK)
                LEFT JOIN CLIENTES CL2 WITH (NOLOCK) ON CL2.CODCLIENTE = CP.CLIENTEID
                OUTER APPLY (SELECT TOP 1 ZONA FROM CLIENTESCAMPOSLIBRES WITH (NOLOCK) WHERE CODCLIENTE = CP.CLIENTEID) CLC
                OUTER APPLY (SELECT TOP 1 USUARIO FROM ${esquema}.APP_PEDIDO_LOG WITH (NOLOCK) WHERE ORDERID = CP.ORDERID AND USUARIO IS NOT NULL ORDER BY FECHA ASC) LG2
                LEFT JOIN VENDEDORES V2 WITH (NOLOCK) ON V2.CODVENDEDOR = CP.CODVENDEDOR
                LEFT JOIN (
                    SELECT DISTINCT RTRIM(LTRIM(PVC.SUPEDIDO)) AS SUPEDIDO
                    FROM PEDVENTACAB PVC WITH(NOLOCK)
                    INNER JOIN ALBVENTACAB AVC WITH(NOLOCK) ON AVC.NUMSERIE = PVC.SERIEALBARAN AND AVC.NUMALBARAN = PVC.NUMEROALBARAN AND AVC.N = PVC.NALBARAN
                        AND AVC.FACTURADO = 'T'
                    WHERE @SOLO_FACTURADO2 IS NOT NULL
                ) PF ON PF.SUPEDIDO COLLATE DATABASE_DEFAULT = CP.ORDERID COLLATE DATABASE_DEFAULT
                LEFT JOIN (
                    SELECT CL.CODCLIENTE,
                        CASE
                            WHEN CL.RIESGOCONCEDIDO = 0 THEN 'SIN LIMITE'
                            WHEN (ISNULL(SUM(T.IMPORTE),0) * 100.0 / CL.RIESGOCONCEDIDO) >= 100 THEN 'SUPERADO'
                            WHEN (ISNULL(SUM(T.IMPORTE),0) * 100.0 / CL.RIESGOCONCEDIDO) >= 80  THEN 'ALTO'
                            WHEN (ISNULL(SUM(T.IMPORTE),0) * 100.0 / CL.RIESGOCONCEDIDO) >= 30  THEN 'MEDIO'
                            ELSE 'BAJO'
                        END AS ESTATUS
                    FROM CLIENTES CL WITH (NOLOCK)
                    LEFT JOIN TESORERIA T WITH (NOLOCK) ON T.CODIGOINTERNO = CL.CODCLIENTE
                        AND T.ESTADO = 'P' AND T.ORIGEN = 'C' AND T.SERIE NOT LIKE '%P'
                    GROUP BY CL.CODCLIENTE, CL.RIESGOCONCEDIDO
                ) CR ON CR.CODCLIENTE = CP.CLIENTEID
                WHERE (${estatusClause2 ? estatusClause2 : '1=1'})
                    AND (@BUSCAR_ID2    IS NULL OR CP.ORDERID    LIKE @BUSCAR_ID2)
                    AND (@CLIENTE_ID2   IS NULL OR CP.CLIENTEID  = @CLIENTE_ID2)
                    AND (@COD_VENDEDOR2 IS NULL OR CP.CODVENDEDOR = @COD_VENDEDOR2)
                    AND (@RIESGO2       IS NULL OR CR.ESTATUS     = @RIESGO2)
                    AND (@CODRUTA2      IS NULL OR TRY_CAST(CLC.ZONA AS INT) = @CODRUTA2)
                    AND (@FECHA_DESDE2  IS NULL OR CAST(CP.FECHA AS DATE) >= @FECHA_DESDE2)
                    AND (@FECHA_HASTA2  IS NULL OR CAST(CP.FECHA AS DATE) <= @FECHA_HASTA2)
                    AND (@PSICO2        IS NULL OR (@PSICO2 = 1 AND CP.ORDERID LIKE '%P'))
                    AND (@NOMBRE_CLIENTE2 IS NULL OR LOWER(CL2.NOMBRECLIENTE) LIKE @NOMBRE_CLIENTE2)
                    AND (@USUARIO2       IS NULL OR LOWER(ISNULL(LG2.USUARIO, '')) LIKE @USUARIO2 OR LOWER(ISNULL(V2.NOMVENDEDOR, '')) LIKE @USUARIO2)
                    AND (@SOLO_FACTURADO2 IS NULL OR PF.SUPEDIDO IS NOT NULL)
                    ${countOrderIdClause}
            `);

            return {
                success: true,
                message: 'Pedidos obtenidos correctamente',
                data: result.recordset,
                total: countResult.recordset[0].TOTAL,
                totalUSD: Number(countResult.recordset[0].TOTAL_USD)
            };

        } catch (error) {
            console.error('Error al obtener la lista de pedidos: ', error);
            return {
                success: false,
                message: 'Hubo un fallo al obtener los pedidos',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    static async getConteo(orderId: string) {
        try {
            const pool = await connectDb();
            const result = await pool.request()
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`
                    SELECT
                        PC.IDCONTEO,
                        CONVERT(VARCHAR(16), PC.FECHA, 120)  AS FECHA_CONTEO,
                        PC.ESTADO                            AS ESTADO_CONTEO,
                        RTRIM(PC.ESTADOPED)                  AS ESTADOPED,
                        LP.CODARTICULO,
                        ACL.DESCRIPCIONLARGA                 AS DESCRIPCION,
                        LP.PRODUCTCOUNT                      AS CANTPEDIDA,
                        ISNULL(CL.UNIDADES, 0)               AS CANTCONTADA,
                        LP.PRECIOUNITARIO
                    FROM ${esquema}.LINEA_PED LP WITH(NOLOCK)
                    LEFT JOIN ARTICULOSCAMPOSLIBRES ACL WITH(NOLOCK) ON ACL.CODARTICULO = LP.CODARTICULO
                    OUTER APPLY (
                        SELECT TOP 1 PC2.IDCONTEO, PC2.FECHA, PC2.ESTADO, PC2.ESTADOPED
                        FROM PEDIDOS_CONTEOS PC2 WITH(NOLOCK)
                        WHERE PC2.IDPEDIDO COLLATE DATABASE_DEFAULT
                            = CAST(LP.ORDERID AS NVARCHAR(50)) COLLATE DATABASE_DEFAULT
                        ORDER BY PC2.FECHA DESC
                    ) PC
                    LEFT JOIN CONTEOSLIN CL WITH(NOLOCK)
                        ON  CL.IDCONTEO COLLATE DATABASE_DEFAULT = PC.IDCONTEO COLLATE DATABASE_DEFAULT
                        AND CL.CODARTICULO = LP.CODARTICULO
                    WHERE LP.ORDERID = @ORDERID
                    ORDER BY ACL.DESCRIPCIONLARGA
                `);

            const rows = result.recordset;
            if (!rows.length) return { success: true, data: null };

            return {
                success: true,
                data: {
                    idConteo:     rows[0].IDCONTEO    ?? null,
                    fechaConteo:  rows[0].FECHA_CONTEO ?? null,
                    estadoConteo: rows[0].ESTADO_CONTEO ?? null,
                    estadoPed:    rows[0].ESTADOPED    ?? null,
                    lineas: rows.map((l: any) => ({
                        codarticulo: l.CODARTICULO,
                        descripcion: l.DESCRIPCION || '',
                        cantPedida:  Number(l.CANTPEDIDA),
                        cantContada: Number(l.CANTCONTADA),
                        precio:      Number(l.PRECIOUNITARIO),
                    }))
                }
            };
        } catch (error) {
            console.error('Error al obtener conteo:', error);
            return { success: false, message: error instanceof Error ? error.message : String(error) };
        }
    }

    static async getPedidoById(orderId: string) {
        try {
            const pool = await connectDb();
            
            // 1. Buscamos la cabecera
            const cabeceraResult = await pool.request()
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`SELECT * FROM ${esquema}.CABECERA_PED WITH (NOLOCK) WHERE ORDERID = @ORDERID`);

            if (cabeceraResult.recordset.length === 0) {
                return {
                    success: false,
                    message: 'El pedido solicitado no existe'
                };
            }

            const pedido = cabeceraResult.recordset[0];

            // 2. Buscamos las líneas con todos los campos de descuento
            const lineasResult = await pool.request()
                .input('ORDERID', mssql.VarChar(50), orderId)
                .input('dptoPsico', mssql.Int, getDbConfig().dptoPsicotropicos)
                .query(`
                    SELECT
                        LP.LINEAID,
                        LP.CODARTICULO,
                        ACL.DESCRIPCIONLARGA AS DESCRIPCION,
                        LP.REFERENCIA,
                        LP.CODALMACEN,
                        LP.IDTARIFAV,
                        LP.PRODUCTCOUNT,
                        LP.PRECIOUNITARIO,
                        ISNULL(LP.PRECIOBRUTO, LP.PRECIOUNITARIO) AS PRECIOBRUTO,
                        ISNULL(LP.DESCUENTO1, 0) AS DESCUENTO1,
                        ISNULL(LP.DESCUENTO2, 0) AS DESCUENTO2,
                        ISNULL(LP.DESCUENTO3, 0) AS DESCUENTO3,
                        ISNULL(LP.DESCUENTO4, 0) AS DESCUENTO4,
                        LP.TOTALLINEA,
                        ISNULL(PCL.DIASPROTECCION, 0) AS DIASPROTECCION,
                        ISNULL(ARTICULOS.NODTOAPLICABLE, 0) AS NODTOAPLICABLE,
                        CASE WHEN ARTICULOS.SECCION = @dptoPsico THEN 'T' ELSE 'F' END AS ES_PSICOTROPICO,
                        ISNULL(LP.PORCENTAJEIVA, 0) AS PORCENTAJEIVA,
                        ISNULL(LP.MONTOIVA, 0) AS MONTOIVA,
                        ISNULL(LV.LOTE, '') AS LOTE,
                        ISNULL(LV.FECHA_VEN, '') AS FECHA_VENCIMIENTO
                    FROM
                        ${esquema}.LINEA_PED LP WITH (NOLOCK)
                        INNER JOIN ARTICULOS WITH (NOLOCK) ON LP.CODARTICULO = ARTICULOS.CODARTICULO
                        LEFT JOIN ARTICULOSCAMPOSLIBRES ACL WITH (NOLOCK) ON LP.CODARTICULO = ACL.CODARTICULO
                        LEFT JOIN PROVEEDORESCAMPOSLIBRES PCL WITH (NOLOCK) ON PCL.CODPROVEEDOR = ACL.CODPROVEEDORICG
                        OUTER APPLY (
                            SELECT TOP 1
                                AL.CODBARRAS AS LOTE,
                                CONVERT(VARCHAR(10), AL.GARANTIACOMPRA, 103) AS FECHA_VEN
                            FROM ARTICULOSLIN AL WITH (NOLOCK)
                            WHERE AL.CODARTICULO = LP.CODARTICULO
                              AND AL.GARANTIACOMPRA IS NOT NULL
                              AND AL.COLOR <> '.'
                              AND AL.TALLA <> '.'
                            ORDER BY AL.GARANTIACOMPRA ASC
                        ) LV
                    WHERE
                        LP.ORDERID = @ORDERID
                `);

            pedido.lineas = lineasResult.recordset;

            return {
                success: true,
                message: 'Detalle del pedido obtenido correctamente',
                data: pedido
            };

        } catch (error) {
            console.error(`Error al obtener el detalle del pedido ${orderId}: `, error);
            return {
                success: false,
                message: 'Hubo un fallo al obtener el detalle del pedido',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    static async updatePedidoCompleto(orderId: string, pedido: any, codusuario?: number, usuario?: string) {
        let transaction: mssql.Transaction | null = null;

        try {
            const { clienteId, codVendedor, totalPed, lineas } = pedido;

            const maxLineasEdit = getDbConfig().maxLineasPorPedido ?? 0;
            if (maxLineasEdit > 0 && lineas.length > maxLineasEdit) {
                return {
                    success: false,
                    message: `El pedido tiene ${lineas.length} líneas, superando el límite de ${maxLineasEdit} por pedido.`
                };
            }
            
            const pool = await connectDb();
            transaction = new mssql.Transaction(pool);
            await transaction.begin();

            // 1. Verificar que el pedido existe y está PENDIENTE
            const checkReq = new mssql.Request(transaction);
            const checkRes = await checkReq
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`SELECT ESTATUS, TOTALPRECIO, CLIENTEID FROM ${esquema}.CABECERA_PED WITH (NOLOCK) WHERE ORDERID = @ORDERID`);

            if (checkRes.recordset.length === 0) {
                await transaction.rollback();
                return { success: false, message: 'El pedido no existe' };
            }

            const estatusActual = checkRes.recordset[0].ESTATUS as string;
            const totalAntes    = Number(checkRes.recordset[0].TOTALPRECIO ?? 0);
            const clienteAntes  = Number(checkRes.recordset[0].CLIENTEID   ?? 0);

            if (!['PENDIENTE', ESTATUS_APROBACION_PSICOTROPICOS].includes(estatusActual)) {
                await transaction.rollback();
                return { success: false, message: 'Solo se pueden editar pedidos en estatus PENDIENTE o APROBACION PSICOTROPICOS' };
            }

            // 1b. Snapshot de las líneas ANTES de cualquier modificación
            const snapReq = new mssql.Request(transaction);
            const snapRes = await snapReq
                .input('ORDERID_SNAP', mssql.VarChar(50), orderId)
                .query(`SELECT CODARTICULO, REFERENCIA, PRODUCTCOUNT, PRECIOUNITARIO,
                               DESCUENTO1, DESCUENTO2, DESCUENTO3, DESCUENTO4, PRECIOBRUTO
                        FROM ${esquema}.LINEA_PED WITH (NOLOCK) WHERE ORDERID = @ORDERID_SNAP`);
            const lineasAntes = snapRes.recordset.map((r: any) => ({
                cod:    r.CODARTICULO,
                ref:    r.REFERENCIA ?? '',
                qty:    Number(r.PRODUCTCOUNT),
                precio: Number(r.PRECIOUNITARIO),
                d1: Number(r.DESCUENTO1 ?? 0), d2: Number(r.DESCUENTO2 ?? 0),
                d3: Number(r.DESCUENTO3 ?? 0), d4: Number(r.DESCUENTO4 ?? 0),
                bruto:  Number(r.PRECIOBRUTO ?? r.PRECIOUNITARIO),
            }));

            // 2. Actualizar la Cabecera (Totales, Vendedor o Cliente si cambió)
            const updateCabeceraReq = new mssql.Request(transaction);
            await updateCabeceraReq
                .input('ORDERID', mssql.VarChar(50), orderId)
                .input('CLIENTEID', mssql.Int, clienteId)
                .input('CODVENDEDOR', mssql.Int, codVendedor)
                .input('TOTALPRECIO', mssql.Decimal(18, 2), totalPed)
                .query(`
                    UPDATE ${esquema}.CABECERA_PED
                    SET CLIENTEID = @CLIENTEID,
                        CODVENDEDOR = ISNULL((SELECT CODVENDEDOR FROM CLIENTES WITH (NOLOCK) WHERE CODCLIENTE = @CLIENTEID), @CODVENDEDOR),
                        TOTALPRECIO = @TOTALPRECIO
                    WHERE ORDERID = @ORDERID
                `);

            // 3. Borrar todas las líneas actuales de este pedido
            const deleteLineasReq = new mssql.Request(transaction);
            await deleteLineasReq
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`DELETE FROM ${esquema}.LINEA_PED WHERE ORDERID = @ORDERID`);

            // 4. Re-insertar las líneas con INSERT parametrizados (más confiable que bulk dentro de transaction)
            for (let i = 0; i < lineas.length; i++) {
                const { codarticulo, referencia, codalmacen, idtarifav, cantidad, precio,
                        DESCUENTO1, DESCUENTO2, DESCUENTO3, DESCUENTO4, PRECIOBRUTO,
                        PORCENTAJEIVA, MONTOIVA } = lineas[i];
                if (!cantidad || cantidad < 1) throw new Error(`Cantidad inválida (${cantidad}) en artículo ${codarticulo}`);
                const insReq = new mssql.Request(transaction);
                insReq.input('ORDERID',        mssql.VarChar(50),    orderId);
                insReq.input('CODARTICULO',    mssql.Int,            codarticulo);
                insReq.input('REFERENCIA',     mssql.VarChar(50),    referencia || '');
                insReq.input('CODALMACEN',     mssql.VarChar(10),    codalmacen);
                insReq.input('IDTARIFAV',      mssql.Int,            idtarifav);
                insReq.input('PRODUCTCOUNT',   mssql.Int,            cantidad);
                insReq.input('PRECIOUNITARIO', mssql.Decimal(18, 2), precio);
                insReq.input('D1',             mssql.Float,          Number(DESCUENTO1 ?? 0));
                insReq.input('D2',             mssql.Float,          Number(DESCUENTO2 ?? 0));
                insReq.input('D3',             mssql.Float,          Number(DESCUENTO3 ?? 0));
                insReq.input('D4',             mssql.Float,          Number(DESCUENTO4 ?? 0));
                insReq.input('PRECIOBRUTO',    mssql.Float,          Number(PRECIOBRUTO ?? precio));
                insReq.input('PIVA',           mssql.Float,          Number(PORCENTAJEIVA ?? 0));
                insReq.input('MIVA',           mssql.Float,          Number(MONTOIVA ?? 0));
                await insReq.query(`
                    INSERT INTO ${esquema}.LINEA_PED
                        (ORDERID, CODARTICULO, REFERENCIA, CODALMACEN, IDTARIFAV, PRODUCTCOUNT,
                         PRECIOUNITARIO, DESCUENTO1, DESCUENTO2, DESCUENTO3, DESCUENTO4,
                         PRECIOBRUTO, PORCENTAJEIVA, MONTOIVA)
                    VALUES
                        (@ORDERID, @CODARTICULO, @REFERENCIA, @CODALMACEN, @IDTARIFAV, @PRODUCTCOUNT,
                         @PRECIOUNITARIO, @D1, @D2, @D3, @D4,
                         @PRECIOBRUTO, @PIVA, @MIVA)
                `);
            }

            // 6. Si todo salió perfecto, confirmamos los cambios en la base de datos
            await transaction.commit();

            // Snapshot de las líneas DESPUÉS (normalizado igual que el de antes)
            const lineasDespues = lineas.map((l: any) => ({
                cod:    l.codarticulo,
                ref:    l.referencia ?? '',
                qty:    Number(l.cantidad),
                precio: Number(l.precio),
                d1: Number(l.DESCUENTO1 ?? 0), d2: Number(l.DESCUENTO2 ?? 0),
                d3: Number(l.DESCUENTO3 ?? 0), d4: Number(l.DESCUENTO4 ?? 0),
                bruto:  Number(l.PRECIOBRUTO ?? l.precio),
            }));

            // Calcular diff para DETALLES
            const antesMap  = new Map(lineasAntes.map((l: any)   => [l.cod, l]));
            const despuesMap = new Map(lineasDespues.map((l: any) => [l.cod, l]));
            let eliminados = 0, agregados = 0, modificados = 0;
            const precioCero: number[] = [];
            for (const [cod, la] of antesMap as Map<number, any>) {
                if (!despuesMap.has(cod)) { eliminados++; }
                else {
                    const ld = despuesMap.get(cod) as any;
                    if (la.qty !== ld.qty || Math.abs(la.precio - ld.precio) > 0.001 ||
                        la.d1 !== ld.d1 || la.d2 !== ld.d2 || la.d3 !== ld.d3 || la.d4 !== ld.d4) {
                        modificados++;
                        if (ld.precio === 0 && la.precio > 0) precioCero.push(cod);
                    }
                }
            }
            for (const [cod] of despuesMap as Map<number, any>) {
                if (!antesMap.has(cod)) {
                    agregados++;
                    if ((despuesMap.get(cod) as any).precio === 0) precioCero.push(cod);
                }
            }
            const partesDiff: string[] = [];
            if (eliminados)        partesDiff.push(`${eliminados} eliminada(s)`);
            if (agregados)         partesDiff.push(`${agregados} agregada(s)`);
            if (modificados)       partesDiff.push(`${modificados} modificada(s)`);
            if (precioCero.length) partesDiff.push(`⚠ precio=0 en art. ${precioCero.join(',')}`);
            const detallesLog = `total: ${totalAntes} → ${totalPed}${clienteAntes !== Number(clienteId) ? ` | cliente: ${clienteAntes} → ${clienteId}` : ''} | ${partesDiff.join(' | ') || 'sin cambios en líneas'}`;

            await PedidosServices.registrarLog(
                orderId, estatusActual, 'EDITADO', codusuario, usuario,
                detallesLog,
                JSON.stringify({ total: totalAntes, cliente: clienteAntes, lineas: lineasAntes }),
                JSON.stringify({ total: totalPed,   cliente: clienteId,    lineas: lineasDespues }),
            );

            return {
                success: true,
                message: 'El pedido fue actualizado de forma satisfactoria'
            };

        } catch (error) {
            // Si ocurre cualquier error, revertimos absolutamente todo
            if (transaction) {
                try {
                    await transaction.rollback();
                } catch (rollbackError) {
                    console.error('Error al intentar hacer rollback:', rollbackError);
                }
            }
            console.error(`Error al actualizar el pedido ${orderId}: `, error);
            return {
                success: false,
                message: 'Hubo un fallo crítico al actualizar el pedido',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    static async fusionarPedidos(orderIds: string[], codusuario?: number, usuario?: string) {
        if (!orderIds || orderIds.length < 2)
            return { success: false, message: 'Se necesitan al menos 2 pedidos para fusionar' };

        const pool = await connectDb();

        // 1. Cargar cabeceras
        const req = pool.request();
        const placeholders = orderIds.map((id, i) => { req.input(`ID${i}`, mssql.VarChar(50), id); return `@ID${i}`; }).join(',');
        const ordersRes = await req.query(`
            SELECT ORDERID, CLIENTEID, ESTATUS FROM ${esquema}.CABECERA_PED WITH (NOLOCK) WHERE ORDERID IN (${placeholders})
        `);
        const orders = ordersRes.recordset;

        if (orders.length !== orderIds.length)
            return { success: false, message: 'Uno o más pedidos no fueron encontrados' };

        // 2. Mismo cliente
        const clientes = [...new Set(orders.map((o: any) => o.CLIENTEID))];
        if (clientes.length > 1)
            return { success: false, message: 'Los pedidos deben pertenecer al mismo cliente' };

        // 3. Estados válidos
        const VALIDOS = ['PENDIENTE', 'PENDIENTE POR AUTORIZACION'];
        const invalido = orders.find((o: any) => !VALIDOS.includes(o.ESTATUS));
        if (invalido)
            return { success: false, message: `El pedido ${invalido.ORDERID} tiene estado "${invalido.ESTATUS}" y no puede fusionarse` };

        // 4. Mismo sufijo (caracteres alfabéticos al final del ORDERID)
        const sufijo = (id: string) => (id.match(/[A-Za-z]*$/) || [''])[0];
        const sufijos = [...new Set(orders.map((o: any) => sufijo(o.ORDERID)))];
        if (sufijos.length > 1)
            return { success: false, message: 'Los pedidos deben ser del mismo tipo (mismo sufijo)' };

        // 5. Verificar límite de líneas en el resultado de la fusión
        const maxLineas = getDbConfig().maxLineasPorPedido ?? 0;
        if (maxLineas > 0) {
            const cntReq = pool.request();
            const cntConds = orderIds.map((id, i) => {
                cntReq.input(`CNT_ID${i}`, mssql.VarChar(50), id);
                return `ORDERID = @CNT_ID${i} OR ORDERID LIKE @CNT_ID${i} + '-%'`;
            }).join(' OR ');
            const cntRes = await cntReq.query(`SELECT COUNT(*) AS TOTAL FROM ${esquema}.LINEA_PED WITH (NOLOCK) WHERE ${cntConds}`);
            const totalLineas = Number(cntRes.recordset[0].TOTAL);
            if (totalLineas > maxLineas) {
                return {
                    success: false,
                    message: `La fusión resultaría en ${totalLineas} líneas, superando el límite de ${maxLineas} por pedido. Reduzca los artículos antes de fusionar.`
                };
            }
        }

        // 6. Maestro = primer orderId del array; resto = fuentes
        const masterId = orderIds[0];
        const fuenteIds = orderIds.slice(1);

        // 6. Estado final
        const hayPsico = orders.some((o: any) => o.ESTATUS === 'PENDIENTE POR AUTORIZACION');
        const estadoFinal = hayPsico ? 'PENDIENTE POR AUTORIZACION' : 'PENDIENTE';

        let transaction: mssql.Transaction | null = null;
        try {
            transaction = new mssql.Transaction(pool);
            await transaction.begin();

            for (const fuenteId of fuenteIds) {
                // Mover líneas (incluyendo chunks: fuenteId-2, fuenteId-3…)
                await new mssql.Request(transaction)
                    .input('MASTER', mssql.VarChar(50), masterId)
                    .input('FUENTE', mssql.VarChar(50), fuenteId)
                    .query(`
                        UPDATE ${esquema}.LINEA_PED SET ORDERID = @MASTER
                        WHERE ORDERID = @FUENTE OR ORDERID LIKE @FUENTE + '-%'
                    `);
                // Eliminar logs y cabeceras de la fuente (y sus chunks)
                await new mssql.Request(transaction)
                    .input('FUENTE', mssql.VarChar(50), fuenteId)
                    .query(`
                        DELETE FROM ${esquema}.APP_PEDIDO_LOG  WHERE ORDERID = @FUENTE OR ORDERID LIKE @FUENTE + '-%';
                        DELETE FROM ${esquema}.APP_PEDIDO_PROMOCIONES WHERE ORDERID = @FUENTE OR ORDERID LIKE @FUENTE + '-%';
                        DELETE FROM ${esquema}.CABECERA_PED     WHERE ORDERID = @FUENTE OR ORDERID LIKE @FUENTE + '-%'
                    `);
            }

            // Mover líneas de los chunks del maestro al maestro, luego borrar los chunks
            await new mssql.Request(transaction)
                .input('MASTER', mssql.VarChar(50), masterId)
                .query(`
                    UPDATE ${esquema}.LINEA_PED SET ORDERID = @MASTER WHERE ORDERID LIKE @MASTER + '-%';
                    DELETE FROM ${esquema}.APP_PEDIDO_LOG        WHERE ORDERID LIKE @MASTER + '-%';
                    DELETE FROM ${esquema}.APP_PEDIDO_PROMOCIONES WHERE ORDERID LIKE @MASTER + '-%';
                    DELETE FROM ${esquema}.CABECERA_PED           WHERE ORDERID LIKE @MASTER + '-%'
                `);

            // Recalcular total y actualizar estado del maestro
            await new mssql.Request(transaction)
                .input('MASTER', mssql.VarChar(50), masterId)
                .input('ESTADO', mssql.VarChar(50), estadoFinal)
                .query(`
                    UPDATE ${esquema}.CABECERA_PED
                    SET TOTALPRECIO = (
                            SELECT ISNULL(SUM(PRODUCTCOUNT * PRECIOUNITARIO), 0)
                            FROM ${esquema}.LINEA_PED WITH (NOLOCK) WHERE ORDERID = @MASTER
                        ),
                        ESTATUS = @ESTADO
                    WHERE ORDERID = @MASTER
                `);

            await transaction.commit();

            const masterEstatus = (orders.find((o: any) => o.ORDERID === masterId) as any).ESTATUS as string;
            await PedidosServices.registrarLog(
                masterId, masterEstatus, estadoFinal, codusuario, usuario,
                `Fusión de pedidos: [${orderIds.join(', ')}] → ${masterId}`
            );

            return { success: true, message: `Pedidos fusionados en ${masterId}`, orderId: masterId };
        } catch (error) {
            if (transaction) try { await transaction.rollback(); } catch {}
            console.error('Error al fusionar pedidos:', error);
            return { success: false, message: 'Error al fusionar pedidos', error: error instanceof Error ? error.message : String(error) };
        }
    }

    static async deletePedido(orderId: string, codusuario?: number, usuario?: string) {
        let transaction: mssql.Transaction | null = null;

        try {
            const pool = await connectDb();
            transaction = new mssql.Transaction(pool);
            await transaction.begin();

            // 1. Archivar cabecera y líneas antes de borrar
            await new mssql.Request(transaction)
                .input('ORDERID',    mssql.VarChar(50),  orderId)
                .input('CODUSUARIO', mssql.Int,          codusuario ?? null)
                .input('USUARIO',    mssql.VarChar(100), usuario ?? null)
                .query(`INSERT INTO ${esquema}.APP_CABECERA_PED_ELIMINADOS
                            (ORDERID, CLIENTEID, FECHA, ESTATUS, CODVENDEDOR, TOTALPRECIO,
                             OBSERVACIONES, PROMO_NOMBRE, FECHA_ELIMINADO, CODUSUARIO_ELIMINO, USUARIO_ELIMINO)
                        SELECT ORDERID, CLIENTEID, FECHA, ESTATUS, CODVENDEDOR, TOTALPRECIO,
                               ISNULL(OBSERVACIONES, ''), ISNULL(PROMO_NOMBRE, ''),
                               GETDATE(), @CODUSUARIO, @USUARIO
                        FROM ${esquema}.CABECERA_PED WITH (NOLOCK) WHERE ORDERID = @ORDERID`);

            await new mssql.Request(transaction)
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`INSERT INTO ${esquema}.APP_LINEA_PED_ELIMINADOS
                            (ORDERID, CODARTICULO, REFERENCIA, CODALMACEN, IDTARIFAV, PRODUCTCOUNT,
                             PRECIOUNITARIO, DESCUENTO1, DESCUENTO2, DESCUENTO3, DESCUENTO4,
                             PRECIOBRUTO, PORCENTAJEIVA, MONTOIVA, FECHA_ELIMINADO)
                        SELECT ORDERID, CODARTICULO, REFERENCIA, CODALMACEN, IDTARIFAV, PRODUCTCOUNT,
                               PRECIOUNITARIO, DESCUENTO1, DESCUENTO2, DESCUENTO3, DESCUENTO4,
                               PRECIOBRUTO, PORCENTAJEIVA, MONTOIVA, GETDATE()
                        FROM ${esquema}.LINEA_PED WITH (NOLOCK) WHERE ORDERID = @ORDERID`);

            // 2. Borrar promociones aplicadas
            await new mssql.Request(transaction)
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`DELETE FROM ${esquema}.APP_PEDIDO_PROMOCIONES WHERE ORDERID = @ORDERID`);

            // 3. Borrar líneas
            await new mssql.Request(transaction)
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`DELETE FROM ${esquema}.LINEA_PED WHERE ORDERID = @ORDERID`);

            // 4. Borrar cabecera
            const result = await new mssql.Request(transaction)
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`DELETE FROM ${esquema}.CABECERA_PED WHERE ORDERID = @ORDERID`);

            if (Number(result.rowsAffected[0]) === 0) {
                await transaction.rollback();
                return { success: false, message: 'No se pudo eliminar. El pedido no existe.' };
            }

            // 5. Registrar eliminación en el log (dentro de la transacción)
            await new mssql.Request(transaction)
                .input('ORDERID',    mssql.VarChar(50),  orderId)
                .input('CODUSUARIO', mssql.Int,          codusuario ?? null)
                .input('USUARIO',    mssql.VarChar(100), usuario ?? null)
                .query(`INSERT INTO ${esquema}.APP_PEDIDO_LOG (ORDERID, EST_ANTERIOR, EST_NUEVO, CODUSUARIO, USUARIO, DETALLES)
                        VALUES (@ORDERID, NULL, 'ELIMINADO', @CODUSUARIO, @USUARIO, 'Pedido eliminado manualmente')`);

            await transaction.commit();

            return { success: true, message: 'El pedido y todos sus artículos fueron eliminados de forma satisfactoria' };

        } catch (error) {
            // Revertir en caso de cualquier fallo
            if (transaction) {
                try {
                    await transaction.rollback();
                } catch (rollbackError) {
                    console.error('Error al intentar hacer rollback:', rollbackError);
                }
            }
            console.error(`Error al eliminar el pedido ${orderId}: `, error);
            return {
                success: false,
                message: 'Hubo un fallo al eliminar el pedido de la base de datos',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    static async getAnomaliasPedido(orderId: string): Promise<{ tipo: string; descripcion: string; codarticulo?: number }[]> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('OID', mssql.VarChar(50), orderId)
            .query(`SELECT CODARTICULO, REFERENCIA, PRODUCTCOUNT, PRECIOUNITARIO FROM ${esquema}.LINEA_PED WITH (NOLOCK) WHERE ORDERID = @OID`);
        const lineas = res.recordset;
        const anomalias: { tipo: string; descripcion: string; codarticulo?: number }[] = [];

        const conteo = new Map<number, number>();
        for (const l of lineas) conteo.set(l.CODARTICULO, (conteo.get(l.CODARTICULO) ?? 0) + 1);

        const reportadoDuplicado = new Set<number>();
        for (const l of lineas) {
            const cod   = l.CODARTICULO as number;
            const ref   = (l.REFERENCIA as string | null) ?? `Artículo ${cod}`;
            const qty   = Number(l.PRODUCTCOUNT);
            const precio = Number(l.PRECIOUNITARIO);

            if (precio === 0)
                anomalias.push({ tipo: 'PRECIO_CERO',      descripcion: `"${ref}" (cod ${cod}): precio unitario = 0`, codarticulo: cod });
            else if (precio < 0)
                anomalias.push({ tipo: 'PRECIO_NEGATIVO',  descripcion: `"${ref}" (cod ${cod}): precio unitario negativo (${precio})`, codarticulo: cod });

            if (qty <= 0)
                anomalias.push({ tipo: 'CANTIDAD_INVALIDA', descripcion: `"${ref}" (cod ${cod}): cantidad ${qty} inválida`, codarticulo: cod });

            const veces = conteo.get(cod) ?? 1;
            if (veces > 1 && !reportadoDuplicado.has(cod)) {
                anomalias.push({ tipo: 'ARTICULO_DUPLICADO', descripcion: `"${ref}" (cod ${cod}): aparece ${veces} veces en el pedido`, codarticulo: cod });
                reportadoDuplicado.add(cod);
            }
        }
        return anomalias;
    }

    static async updateEstatusPedido(orderId: string, nuevoEstatus: string, codusuario?: number, usuario?: string, visibilidadUsuario?: number, anomaliasConfirmadas?: string) {
        try {
            const estatusLimpio = nuevoEstatus.trim().toUpperCase();
            const BIT_AUTORIZADOR = 2048;
            const BIT_BACKOFFICE  = 16;

            const pool = await connectDb();

            // Leer visibilidad directo de la BD — más confiable que el JWT
            let vis = visibilidadUsuario ?? 0;
            if (codusuario) {
                const visRes = await pool.request()
                    .input('COD', codusuario)
                    .query(`SELECT ISNULL(VISIBILIDAD, 0) AS VIS FROM VENDEDORES WITH (NOLOCK) WHERE CODVENDEDOR = @COD`);
                if (visRes.recordset.length > 0) vis = Number(visRes.recordset[0].VIS);
            }

            const puedeAutorizar = (vis & BIT_AUTORIZADOR) !== 0 || (vis & BIT_BACKOFFICE) !== 0;

            // Obtener estatus actual (necesario antes de validar permisos)
            const checkRes = await pool.request()
                .input('ORDERID_CHK', mssql.VarChar(50), orderId)
                .query(`SELECT ESTATUS FROM ${esquema}.CABECERA_PED WITH (NOLOCK) WHERE ORDERID = @ORDERID_CHK`);

            if (checkRes.recordset.length === 0) {
                return { success: false, message: 'El pedido no existe' };
            }

            const estadoActual = checkRes.recordset[0].ESTATUS as string;
            const permitidos = TRANSICIONES_PERMITIDAS[estadoActual] ?? [];
            if (!permitidos.includes(estatusLimpio)) {
                return {
                    success: false,
                    message: `No se puede cambiar de "${estadoActual}" a "${estatusLimpio}". Transición no permitida.`
                };
            }

            // CANCELADO desde PENDIENTE o ICG no requiere rol Autorizador
            const cancelacionLibre = estatusLimpio === 'CANCELADO' && ['PENDIENTE', 'ICG', ESTATUS_APROBACION_PSICOTROPICOS].includes(estadoActual);
            const requiereAutorizador = estatusLimpio === 'AUTORIZADO' ||
                (estatusLimpio === 'CANCELADO' && !cancelacionLibre);
            if (requiereAutorizador && !puedeAutorizar) {
                return {
                    success: false,
                    message: 'No tienes permiso para realizar esta transición. Se requiere el rol Autorizador.'
                };
            }

            // Verificar límite de líneas antes de cualquier avance en el flujo de autorización
            const maxLineasAuth = getDbConfig().maxLineasPorPedido ?? 0;
            if (maxLineasAuth > 0 && ['PENDIENTE POR AUTORIZACION', 'AUTORIZADO'].includes(estatusLimpio)) {
                const cntRes = await pool.request()
                    .input('ORDERID_CNT', mssql.VarChar(50), orderId)
                    .query(`SELECT COUNT(*) AS TOTAL FROM ${esquema}.LINEA_PED WITH (NOLOCK)
                            WHERE ORDERID = @ORDERID_CNT OR ORDERID LIKE @ORDERID_CNT + '-%'`);
                const totalLineas = Number(cntRes.recordset[0].TOTAL);
                if (totalLineas > maxLineasAuth) {
                    return {
                        success: false,
                        message: `Este pedido tiene ${totalLineas} líneas, superando el límite de ${maxLineasAuth}. Divídalo antes de autorizar.`
                    };
                }
            }

            // Al pasar a PENDIENTE POR AUTORIZACION, verificar stock disponible por línea
            // (mientras estuvo en PENDIENTE no reservaba stock, otro pedido pudo haberlo agotado)
            if (estatusLimpio === 'PENDIENTE POR AUTORIZACION') {
                const lineasRes = await pool.request()
                    .input('ORDERID_LINEAS', mssql.VarChar(50), orderId)
                    .query(`SELECT LP.CODARTICULO, LP.PRODUCTCOUNT AS CANTIDAD
                            FROM ${esquema}.LINEA_PED LP WITH (NOLOCK) WHERE LP.ORDERID = @ORDERID_LINEAS`);

                const faltantes: string[] = [];
                for (const linea of lineasRes.recordset) {
                    const stockRes = await pool.request()
                        .input('COD', mssql.Int, linea.CODARTICULO)
                        .input('ORDERID_EXCL', mssql.VarChar(50), orderId)
                        .input('ALMACEN', mssql.VarChar(10), getDbConfig().codAlmacen)
                        .query(`
                            SELECT
                                ISNULL((SELECT SUM(STOCK) FROM STOCKS WITH (NOLOCK) WHERE CODARTICULO = @COD AND CODALMACEN = @ALMACEN), 0)
                                - ISNULL((
                                    SELECT SUM(LP2.PRODUCTCOUNT) FROM ${esquema}.CABECERA_PED CP2 WITH (NOLOCK)
                                    INNER JOIN ${esquema}.LINEA_PED LP2 WITH (NOLOCK) ON LP2.ORDERID = CP2.ORDERID
                                    WHERE LP2.CODARTICULO = @COD
                                      AND CP2.ORDERID <> @ORDERID_EXCL
                                      AND CP2.ESTATUS IN ('PENDIENTE POR AUTORIZACION','APROBACION PSICOTROPICOS','SANIDAD','AUTORIZADO','EMPACADO','OK')
                                ), 0) AS DISPONIBLE
                        `);
                    const disponible: number = stockRes.recordset[0]?.DISPONIBLE ?? 0;
                    if (disponible < linea.CANTIDAD) {
                        faltantes.push(`${linea.CODARTICULO} (necesita ${linea.CANTIDAD}, disponible ${disponible})`);
                    }
                }
                if (faltantes.length > 0) {
                    return {
                        success: false,
                        message: `Stock insuficiente para: ${faltantes.join('; ')}`
                    };
                }
            }

            const result = await pool.request()
                .input('ORDERID', mssql.VarChar(50), orderId)
                .input('ESTATUS', mssql.VarChar(50), estatusLimpio)
                .query(`
                    UPDATE ${esquema}.CABECERA_PED
                    SET ESTATUS = @ESTATUS
                    WHERE ORDERID = @ORDERID
                `);

            // Validamos si realmente se encontró un pedido con ese ID
            if (Number(result.rowsAffected[0]) === 0) {
                return {
                    success: false,
                    message: 'No se pudo actualizar el estatus. El pedido no existe en el sistema.'
                };
            }

            const detallesEstatus = anomaliasConfirmadas
                ? `Anomalías confirmadas al autorizar: ${anomaliasConfirmadas}`
                : undefined;
            await PedidosServices.registrarLog(orderId, estadoActual, estatusLimpio, codusuario, usuario, detallesEstatus);

            return {
                success: true,
                message: `El estatus del pedido se actualizó a ${estatusLimpio} de forma satisfactoria`
            };

        } catch (error) {
            console.error(`Error al actualizar el estatus del pedido ${orderId}: `, error);
            return {
                success: false,
                message: 'Hubo un fallo al actualizar el estatus en la base de datos',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private static async registrarLog(
        orderId: string,
        estAnterior: string | null,
        estNuevo: string,
        codusuario?: number,
        usuario?: string,
        detalles?: string,
        snapshotAntes?: string,
        snapshotDespues?: string,
    ): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request()
                .input('ORDERID',      mssql.VarChar(50),            orderId)
                .input('EST_ANT',      mssql.VarChar(50),            estAnterior ?? null)
                .input('EST_NUE',      mssql.VarChar(50),            estNuevo)
                .input('CODUSUARIO',   mssql.Int,                    codusuario ?? null)
                .input('USUARIO',      mssql.VarChar(100),           usuario ?? null)
                .input('DETALLES',     mssql.NVarChar(mssql.MAX),    detalles ?? null)
                .input('SNAP_ANT',     mssql.NVarChar(mssql.MAX),    snapshotAntes ?? null)
                .input('SNAP_DES',     mssql.NVarChar(mssql.MAX),    snapshotDespues ?? null)
                .query(`INSERT INTO ${esquema}.APP_PEDIDO_LOG
                        (ORDERID, EST_ANTERIOR, EST_NUEVO, CODUSUARIO, USUARIO, DETALLES, SNAPSHOT_ANTES, SNAPSHOT_DESPUES)
                        VALUES (@ORDERID, @EST_ANT, @EST_NUE, @CODUSUARIO, @USUARIO, @DETALLES, @SNAP_ANT, @SNAP_DES)`);
        } catch (err) {
            console.error('Error al registrar log de auditoría:', err);
        }
    }

    static async getAuditoria(orderId?: string, usuario?: string, page = 1, limit = 50) {
        try {
            const pool = await connectDb();
            const safeLimit = limit === -1 ? 10000 : Math.max(1, limit);
            const offset = limit === -1 ? 0 : (Math.max(1, page) - 1) * safeLimit;
            const orderId_l  = orderId  ? `%${orderId.toLowerCase()}%`  : '%';
            const usuario_l  = usuario  ? `%${usuario.toLowerCase()}%`  : '%';
            const result = await pool.request()
                .input('ORDERID',    mssql.VarChar(50),   orderId_l)
                .input('USUARIO',    mssql.VarChar(100),  usuario_l)
                .input('LIMIT',      mssql.Int, safeLimit)
                .input('OFFSET',     mssql.Int, offset)
                .query(`
                    SELECT ID, ORDERID, EST_ANTERIOR, EST_NUEVO, CODUSUARIO, USUARIO, FECHA, DETALLES,
                        CASE WHEN EST_NUEVO = 'EDITADO' THEN SNAPSHOT_ANTES   ELSE NULL END AS SNAPSHOT_ANTES,
                        CASE WHEN EST_NUEVO = 'EDITADO' THEN SNAPSHOT_DESPUES ELSE NULL END AS SNAPSHOT_DESPUES
                    FROM ${esquema}.APP_PEDIDO_LOG WITH (NOLOCK)
                    WHERE LOWER(ORDERID) LIKE @ORDERID AND LOWER(ISNULL(USUARIO,'')) LIKE @USUARIO
                    ORDER BY FECHA DESC
                    OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
                `);
            const countRes = await pool.request()
                .input('ORDERID2',   mssql.VarChar(50),   orderId_l)
                .input('USUARIO2',   mssql.VarChar(100),  usuario_l)
                .query(`SELECT COUNT(*) AS TOTAL FROM ${esquema}.APP_PEDIDO_LOG WITH (NOLOCK)
                        WHERE LOWER(ORDERID) LIKE @ORDERID2 AND LOWER(ISNULL(USUARIO,'')) LIKE @USUARIO2`);
            return { success: true, data: result.recordset, total: countRes.recordset[0].TOTAL };
        } catch (error) {
            return { success: false, data: [], total: 0, message: String(error) };
        }
    }

    static async actualizarCodigoAprobacion(orderId: string, codigo: string, codusuario?: number, usuario?: string): Promise<{ success: boolean; message?: string }> {
        try {
            const pool = await connectDb();
            const check = await pool.request()
                .input('ORDERID_CHK', mssql.VarChar(50), orderId)
                .query(`SELECT 1 FROM ${esquema}.CABECERA_PED WITH (NOLOCK) WHERE ORDERID = @ORDERID_CHK`);
            if (check.recordset.length === 0) return { success: false, message: 'Pedido no encontrado' };
            await pool.request()
                .input('ORDERID', mssql.VarChar(50), orderId)
                .input('CODIGO', mssql.NVarChar(255), codigo.trim())
                .query(`UPDATE ${esquema}.CABECERA_PED SET OBSERVACIONES = @CODIGO WHERE ORDERID = @ORDERID`);
            await PedidosServices.registrarLog(orderId, null, 'CODIGO_APROBACION', codusuario, usuario, `Código de aprobación actualizado`);
            return { success: true };
        } catch (error) {
            return { success: false, message: String(error) };
        }
    }

    static async aprobarPsicotropico(orderId: string, codigoAprobacion: string, codusuario?: number, usuario?: string) {
        try {
            if (!codigoAprobacion || !codigoAprobacion.trim()) {
                return { success: false, message: 'El código de aprobación es requerido' };
            }
            const pool = await connectDb();
            const checkRes = await pool.request()
                .input('ORDERID_CHK', mssql.VarChar(50), orderId)
                .query(`SELECT ESTATUS FROM ${esquema}.CABECERA_PED WITH (NOLOCK) WHERE ORDERID = @ORDERID_CHK`);

            if (checkRes.recordset.length === 0) {
                return { success: false, message: 'El pedido no existe' };
            }
            if (!['APROBACION PSICOTROPICOS', 'SANIDAD'].includes(checkRes.recordset[0].ESTATUS)) {
                return { success: false, message: 'El pedido no está pendiente de aprobación de psicotrópicos' };
            }
            const estatusOrigen = checkRes.recordset[0].ESTATUS as string;

            await pool.request()
                .input('ORDERID', mssql.VarChar(50), orderId)
                .input('OBSERVACIONES', mssql.NVarChar(255), codigoAprobacion.trim())
                .query(`
                    UPDATE ${esquema}.CABECERA_PED
                    SET ESTATUS = 'PENDIENTE POR AUTORIZACION', OBSERVACIONES = @OBSERVACIONES
                    WHERE ORDERID = @ORDERID
                `);

            await PedidosServices.registrarLog(orderId, estatusOrigen, 'PENDIENTE POR AUTORIZACION', codusuario, usuario, `Código aprobación: ${codigoAprobacion.trim()}`);

            return { success: true, message: 'Pedido aprobado y liberado a PENDIENTE' };
        } catch (error) {
            console.error(`Error al aprobar psicotrópico del pedido ${orderId}: `, error);
            return {
                success: false,
                message: 'Hubo un fallo al aprobar el pedido',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    static async marcarSanidad(orderId: string, codusuario?: number, usuario?: string) {
        try {
            const pool = await connectDb();
            const checkRes = await pool.request()
                .input('OID', mssql.VarChar(50), orderId)
                .query(`SELECT ESTATUS FROM ${esquema}.CABECERA_PED WITH (NOLOCK) WHERE ORDERID = @OID`);

            if (!checkRes.recordset.length) return { success: false, message: 'Pedido no encontrado' };
            if (checkRes.recordset[0].ESTATUS !== 'APROBACION PSICOTROPICOS') {
                return { success: false, message: 'El pedido debe estar en APROBACION PSICOTROPICOS para marcarlo en SANIDAD' };
            }

            await pool.request()
                .input('OID', mssql.VarChar(50), orderId)
                .query(`UPDATE ${esquema}.CABECERA_PED SET ESTATUS = 'SANIDAD' WHERE ORDERID = @OID`);

            await PedidosServices.registrarLog(orderId, 'APROBACION PSICOTROPICOS', 'SANIDAD', codusuario, usuario);
            return { success: true };
        } catch (error) {
            return { success: false, message: String(error) };
        }
    }
}