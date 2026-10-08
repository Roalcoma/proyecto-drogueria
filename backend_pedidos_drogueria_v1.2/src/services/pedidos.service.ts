import mssql from 'mssql'
import { connectDb } from "../db/db.conection";
import { PromocionesService } from "./promociones.service";
import { PromoEspecialService } from "./promoEspecial.service";
import { getDbConfig } from './dbconfig.service';
import 'dotenv/config'

const esquema = process.env.DB_ESQUEMA || 'dbo';

const TRANSICIONES_PERMITIDAS: Record<string, string[]> = {
    'PENDIENTE':                  ['PENDIENTE POR AUTORIZACION', 'CANCELADO'],
    'PENDIENTE POR AUTORIZACION': ['AUTORIZADO', 'CANCELADO'],
    'AUTORIZADO':                 ['CANCELADO'],
    'OK':                         ['CANCELADO'],
    'EMPACADO':                   ['AUTORIZADO', 'CANCELADO'],
    'ICG':                        ['CANCELADO'],
    'APROBACION PSICOTROPICOS':   ['SANIDAD', 'CANCELADO'],
    'SANIDAD':                    ['CANCELADO'],
};

export const ESTATUS_APROBACION_PSICOTROPICOS = 'APROBACION PSICOTROPICOS';

// Para descuentos que vienen de datos maestros (cliente, artículo, promoción) en las integraciones:
// fuera de 0–99.99% es un dato corrupto (ya hubo un D3 de 192% → precio negativo) y se ignora
export const dtoValido = (pct: number): number => {
    const n = Number(pct) || 0;
    if (n >= 0 && n < 100) return n;
    console.warn(`[Descuentos] Porcentaje inválido ignorado: ${pct}`);
    return 0;
};

export type LineaNormalizada = {
    codarticulo: number; referencia: string; cantidad: number;
    d1: number; d2: number; d3: number; d4: number;
    precioBruto: number; precio: number; pctIva: number; montoIva: number; esPsico: boolean;
};

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
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_PEDIDO_FALLAS')
                    CREATE TABLE ${esquema}.APP_PEDIDO_FALLAS (
                        ID               INT IDENTITY(1,1) PRIMARY KEY,
                        ORDERID          NVARCHAR(50)  NOT NULL,
                        CODARTICULO      INT           NOT NULL,
                        DESCRIPCION      NVARCHAR(255) NULL,
                        CANT_PEDIDA      INT           NOT NULL,
                        STOCK_DISPONIBLE INT           NOT NULL,
                        FECHA            DATETIME      NOT NULL DEFAULT GETDATE()
                    )
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PFALLAS_OID' AND object_id=OBJECT_ID('${esquema}.APP_PEDIDO_FALLAS'))
                    CREATE INDEX IX_PFALLAS_OID ON ${esquema}.APP_PEDIDO_FALLAS (ORDERID)
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_FUSION_LOG')
                    CREATE TABLE ${esquema}.APP_FUSION_LOG (
                        ID              INT IDENTITY(1,1) PRIMARY KEY,
                        ORDERID_MAESTRO VARCHAR(50)     NOT NULL,
                        ORDERIDS_FUSION NVARCHAR(500)   NOT NULL,
                        CODUSUARIO      INT             NULL,
                        USUARIO         VARCHAR(100)    NULL,
                        FECHA_FUSION    DATETIME        NOT NULL DEFAULT GETDATE()
                    );
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_FUSION_SNAPSHOT_CAB')
                    CREATE TABLE ${esquema}.APP_FUSION_SNAPSHOT_CAB (
                        ID              INT IDENTITY(1,1) PRIMARY KEY,
                        FUSION_ID       INT             NOT NULL,
                        ROL             VARCHAR(10)     NOT NULL,
                        ORDERID         VARCHAR(50)     NOT NULL,
                        CLIENTEID       INT             NULL,
                        FECHA           DATETIME        NULL,
                        ESTATUS         VARCHAR(50)     NULL,
                        CODVENDEDOR     INT             NULL,
                        TOTALPRECIO     FLOAT           NULL,
                        OBSERVACIONES   NVARCHAR(255)   NULL,
                        PROMO_NOMBRE    NVARCHAR(500)   NULL
                    );
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_FUSION_SNAPSHOT_LIN')
                    CREATE TABLE ${esquema}.APP_FUSION_SNAPSHOT_LIN (
                        ID              INT IDENTITY(1,1) PRIMARY KEY,
                        FUSION_ID       INT             NOT NULL,
                        ORDERID         VARCHAR(50)     NOT NULL,
                        CODARTICULO     INT             NULL,
                        REFERENCIA      VARCHAR(50)     NULL,
                        CODALMACEN      VARCHAR(10)     NULL,
                        IDTARIFAV       INT             NULL,
                        PRODUCTCOUNT    INT             NULL,
                        PRECIOUNITARIO  FLOAT           NULL,
                        DESCUENTO1      FLOAT           NULL,
                        DESCUENTO2      FLOAT           NULL,
                        DESCUENTO3      FLOAT           NULL,
                        DESCUENTO4      FLOAT           NULL,
                        PRECIOBRUTO     FLOAT           NULL,
                        PORCENTAJEIVA   FLOAT           NULL,
                        MONTOIVA        FLOAT           NULL
                    );
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_FUSION_SNAPSHOT_PROMO')
                    CREATE TABLE ${esquema}.APP_FUSION_SNAPSHOT_PROMO (
                        ID                  INT IDENTITY(1,1) PRIMARY KEY,
                        FUSION_ID           INT             NOT NULL,
                        ORDERID             VARCHAR(50)     NOT NULL,
                        IDPROMOCION         INT             NOT NULL,
                        NOMBREPROMOCION     NVARCHAR(150)   NOT NULL,
                        PORCENTAJEAPLICADO  FLOAT           NOT NULL,
                        BASETOTAL           FLOAT           NULL
                    )
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_PEDIDO_AUDITORIA')
                    CREATE TABLE ${esquema}.APP_PEDIDO_AUDITORIA (
                        ID              INT IDENTITY(1,1) PRIMARY KEY,
                        ORDERID         VARCHAR(50)     NOT NULL,
                        ACCION          VARCHAR(50)     NOT NULL,
                        CODUSUARIO      INT             NULL,
                        USUARIO         VARCHAR(100)    NULL,
                        FECHA           DATETIME        NOT NULL DEFAULT GETDATE()
                    );
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_PEDIDO_AUDITORIA_CAB')
                    CREATE TABLE ${esquema}.APP_PEDIDO_AUDITORIA_CAB (
                        ID              INT IDENTITY(1,1) PRIMARY KEY,
                        AUDITORIA_ID    INT             NOT NULL,
                        ORDERID         VARCHAR(50)     NOT NULL,
                        CLIENTEID       INT             NULL,
                        FECHA           DATETIME        NULL,
                        ESTATUS         VARCHAR(50)     NULL,
                        CODVENDEDOR     INT             NULL,
                        TOTALPRECIO     FLOAT           NULL,
                        OBSERVACIONES   NVARCHAR(255)   NULL,
                        PROMO_NOMBRE    NVARCHAR(500)   NULL
                    );
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_PEDIDO_AUDITORIA_LIN')
                    CREATE TABLE ${esquema}.APP_PEDIDO_AUDITORIA_LIN (
                        ID              INT IDENTITY(1,1) PRIMARY KEY,
                        AUDITORIA_ID    INT             NOT NULL,
                        ORDERID         VARCHAR(50)     NOT NULL,
                        CODARTICULO     INT             NULL,
                        REFERENCIA      VARCHAR(50)     NULL,
                        CODALMACEN      VARCHAR(10)     NULL,
                        IDTARIFAV       INT             NULL,
                        PRODUCTCOUNT    INT             NULL,
                        PRECIOUNITARIO  FLOAT           NULL,
                        DESCUENTO1      FLOAT           NULL,
                        DESCUENTO2      FLOAT           NULL,
                        DESCUENTO3      FLOAT           NULL,
                        DESCUENTO4      FLOAT           NULL,
                        PRECIOBRUTO     FLOAT           NULL,
                        PORCENTAJEIVA   FLOAT           NULL,
                        MONTOIVA        FLOAT           NULL
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

    // Serializa toda operación que reserva stock (chequeo + cambio) para que dos usuarios no reserven el mismo stock a la vez.
    // ponytail: lock global; pasar a un lock por artículo si aparece contención
    static async bloquearStock(tx: mssql.Transaction): Promise<void> {
        const r = await new mssql.Request(tx).query(`
            DECLARE @r INT;
            EXEC @r = sp_getapplock @Resource = 'PEDIDOS_RESERVA_STOCK', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 20000;
            SELECT @r AS R
        `);
        if (Number(r.recordset[0].R) < 0) throw new Error('Otra operación está reservando stock en este momento. Intente de nuevo.');
    }

    // Precios y descuentos de un pedido existente, aceptados al copiarlo o editarlo
    private static async referenciasDePedido(orderId: string, source?: mssql.ConnectionPool | mssql.Transaction): Promise<Map<number, { brutos: number[]; d4s: number[] }>> {
        const req = source ? new mssql.Request(source as any) : (await connectDb()).request();
        const res = await req.input('OID_REF', mssql.VarChar(50), orderId)
            .query(`SELECT CODARTICULO, PRECIOBRUTO, ISNULL(DESCUENTO4, 0) AS D4 FROM ${esquema}.LINEA_PED WITH (NOLOCK) WHERE ORDERID = @OID_REF`);
        const mapa = new Map<number, { brutos: number[]; d4s: number[] }>();
        for (const r of res.recordset) {
            const ref = mapa.get(Number(r.CODARTICULO)) ?? { brutos: [], d4s: [] };
            if (r.PRECIOBRUTO != null) ref.brutos.push(Number(r.PRECIOBRUTO));
            ref.d4s.push(Number(r.D4));
            mapa.set(Number(r.CODARTICULO), ref);
        }
        return mapa;
    }

    // El servidor decide los montos: precio base de la tarifa (o el ya pactado en el pedido de referencia),
    // descuentos validados, precio neto, IVA del artículo y total. Lo que mande el navegador solo se usa como propuesta.
    static async normalizarLineas(
        lineas: any[],
        puedeDescuentoLinea: boolean,
        referencias?: Map<number, { brutos: number[]; d4s: number[] }>,
    ): Promise<{ lineas: LineaNormalizada[]; total: number; ajustes: string[] }> {
        if (!Array.isArray(lineas) || lineas.length === 0) throw new Error('El pedido no tiene líneas');
        const cerca = (a: number, b: number) => Math.abs(a - b) < 0.005;
        const pct = (v: any, campo: string, cod: number) => {
            const n = Number(v ?? 0) || 0;
            if (n < 0 || n >= 100) throw new Error(`Descuento ${campo} inválido (${n}%) en artículo ${cod}`);
            return n;
        };

        const entrada = lineas.map((l: any) => {
            const cod = Math.trunc(Number(l.codarticulo));
            const cantidad = Number(l.cantidad);
            if (!(cod > 0)) throw new Error(`Código de artículo inválido (${l.codarticulo})`);
            if (!Number.isInteger(cantidad) || cantidad < 1) throw new Error(`Cantidad inválida (${l.cantidad}) en artículo ${cod}`);
            return {
                cod, cantidad, referencia: String(l.referencia ?? '').substring(0, 50),
                d1: pct(l.DESCUENTO1, 'D1', cod), d2: pct(l.DESCUENTO2, 'D2', cod),
                d3: pct(l.DESCUENTO3, 'D3', cod), d4: pct(l.DESCUENTO4, 'D4', cod),
                brutoPropuesto: l.PRECIOBRUTO != null && l.PRECIOBRUTO !== '' ? Number(l.PRECIOBRUTO) : null,
            };
        });

        const { tarifaBaseCatalogo, dptoPsicotropicos } = getDbConfig();
        const codigos = [...new Set(entrada.map(e => e.cod))];
        const pool = await connectDb();
        const artRes = await pool.request()
            .input('TARIFA', mssql.Int, tarifaBaseCatalogo)
            .query(`
                SELECT A.CODARTICULO, ISNULL(A.NODTOAPLICABLE, 0) AS NODTO, A.SECCION,
                       PV.PNETO, ISNULL(IMP.IVA, 0) AS IVA
                FROM ARTICULOS A WITH (NOLOCK)
                LEFT JOIN PRECIOSVENTA PV WITH (NOLOCK) ON PV.CODARTICULO = A.CODARTICULO AND PV.IDTARIFAV = @TARIFA AND PV.COLOR = '.' AND PV.TALLA = '.'
                LEFT JOIN IMPUESTOS IMP WITH (NOLOCK) ON IMP.TIPOIVA = A.TIPOIMPUESTO
                WHERE A.CODARTICULO IN (${codigos.join(',')})
            `);
        const arts = new Map<number, any>(artRes.recordset.map((r: any) => [Number(r.CODARTICULO), r]));

        const ajustes: string[] = [];
        const salida: LineaNormalizada[] = entrada.map(e => {
            const art = arts.get(e.cod);
            if (!art) throw new Error(`El artículo ${e.cod} no existe`);
            if (art.PNETO == null) throw new Error(`El artículo ${e.cod} no tiene precio en la tarifa ${tarifaBaseCatalogo}`);
            const ref = referencias?.get(e.cod);
            const nodto = art.NODTO === true || art.NODTO === 1;

            let { d1, d2, d3, d4 } = e;
            if (nodto) d1 = d2 = d3 = d4 = 0;
            if (d4 > 0 && !puedeDescuentoLinea && !(ref?.d4s.some(x => cerca(x, d4))))
                throw new Error(`No tiene permiso para aplicar descuento manual (D4) en el artículo ${e.cod}`);

            const tarifa = Number(art.PNETO);
            const pactado = e.brutoPropuesto != null ? ref?.brutos.find(b => cerca(b, e.brutoPropuesto!)) : undefined;
            const bruto = pactado ?? tarifa;
            if (e.brutoPropuesto != null && !cerca(e.brutoPropuesto, bruto))
                ajustes.push(`art. ${e.cod}: precio base ${e.brutoPropuesto} → ${bruto}`);

            const precio = bruto * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100) * (1 - d4 / 100);
            const pctIva = Number(art.IVA) || 0;
            return {
                codarticulo: e.cod, referencia: e.referencia, cantidad: e.cantidad,
                d1, d2, d3, d4, precioBruto: bruto, precio,
                pctIva, montoIva: precio * e.cantidad * pctIva / 100,
                esPsico: Number(art.SECCION) === Number(dptoPsicotropicos),
            };
        });

        return { lineas: salida, total: salida.reduce((s, l) => s + l.precio * l.cantidad, 0), ajustes };
    }

    private static async insertarLineas(tx: mssql.Transaction, lineas: LineaNormalizada[], orderId: string): Promise<void> {
        const { codAlmacen, tarifaBaseCatalogo } = getDbConfig();
        const tabla = new mssql.Table(`${esquema}.LINEA_PED`);
        tabla.create = false;
        tabla.columns.add('ORDERID',        mssql.VarChar(50), { nullable: false });
        tabla.columns.add('CODARTICULO',    mssql.Int,         { nullable: false });
        tabla.columns.add('REFERENCIA',     mssql.VarChar(50), { nullable: true });
        tabla.columns.add('CODALMACEN',     mssql.VarChar(10), { nullable: false });
        tabla.columns.add('IDTARIFAV',      mssql.Int,         { nullable: false });
        tabla.columns.add('PRODUCTCOUNT',   mssql.Int,         { nullable: false });
        tabla.columns.add('PRECIOUNITARIO', mssql.Float,       { nullable: false });
        tabla.columns.add('DESCUENTO1',     mssql.Float,       { nullable: true });
        tabla.columns.add('DESCUENTO2',     mssql.Float,       { nullable: true });
        tabla.columns.add('DESCUENTO3',     mssql.Float,       { nullable: true });
        tabla.columns.add('DESCUENTO4',     mssql.Float,       { nullable: true });
        tabla.columns.add('PRECIOBRUTO',    mssql.Float,       { nullable: true });
        tabla.columns.add('PORCENTAJEIVA',  mssql.Float,       { nullable: true });
        tabla.columns.add('MONTOIVA',       mssql.Float,       { nullable: true });
        for (const l of lineas) {
            tabla.rows.add(orderId, l.codarticulo, l.referencia, codAlmacen, tarifaBaseCatalogo, l.cantidad, l.precio,
                l.d1, l.d2, l.d3, l.d4, l.precioBruto, l.pctIva, l.montoIva);
        }
        await new mssql.Request(tx).bulk(tabla);
    }

    static async postPedidosCabecera(pedido: any, codusuario?: number, usuario?: string, puedeDescuentoLinea = false) {
        let tx: mssql.Transaction | null = null;
        try {
            const { clienteId, codVendedor, lineas, sufijo, promocionesAplicadas, diasMontofactura, sourceOrderId } = pedido;
            let orderId: string;
            if (pedido.orderId) {
                orderId = String(pedido.orderId);
            } else {
                const num = await PedidosServices.reservarNumero();
                orderId = sufijo ? `${num}${sufijo}` : String(num);
            }

            const referencias = sourceOrderId ? await PedidosServices.referenciasDePedido(String(sourceOrderId)) : undefined;
            const norm = await PedidosServices.normalizarLineas(lineas, puedeDescuentoLinea, referencias);
            const estatusInicial = norm.lineas.some(l => l.esPsico) ? ESTATUS_APROBACION_PSICOTROPICOS : 'PENDIENTE';
            const promoNombre = (promocionesAplicadas || []).map((p: any) => p.nombre).filter(Boolean).join(', ');

            const maxLineas = getDbConfig().maxLineasPorPedido ?? 0;
            const partes: LineaNormalizada[][] = [];
            const paso = maxLineas > 0 ? maxLineas : norm.lineas.length;
            for (let i = 0; i < norm.lineas.length; i += paso) partes.push(norm.lineas.slice(i, i + paso));

            const pool = await connectDb();
            tx = new mssql.Transaction(pool);
            await tx.begin();
            if (estatusInicial !== 'PENDIENTE') await PedidosServices.bloquearStock(tx);

            const { insuficiente } = await PedidosServices.checkStockLineas(
                norm.lineas.map(l => ({ codarticulo: l.codarticulo, cantidad: l.cantidad })), undefined, tx);
            if (insuficiente.length > 0) {
                await tx.rollback();
                const detalle = insuficiente.map(i => `${i.descripcion} (pedido: ${i.cantidad_pedida}, disponible: ${i.disponible})`).join('; ');
                return { success: false, message: `Stock insuficiente para: ${detalle}` };
            }

            const orderIds: string[] = [];
            for (let idx = 0; idx < partes.length; idx++) {
                const chunkId = idx === 0 ? orderId : `${orderId}-${idx + 1}`;
                const totalParte = partes[idx].reduce((s, l) => s + l.precio * l.cantidad, 0);
                await new mssql.Request(tx)
                    .input('ORDERID', mssql.VarChar(50), chunkId)
                    .input('CLIENTEID', mssql.Int, clienteId)
                    .input('CODVENDEDOR', mssql.Int, codVendedor)
                    .input('TOTALPRECIO', mssql.Float, totalParte)
                    .input('ESTATUS', mssql.VarChar(50), estatusInicial)
                    .input('PROMO_NOMBRE', mssql.NVarChar(500), promoNombre || null)
                    .query(`INSERT INTO ${esquema}.CABECERA_PED (
                                ORDERID, CLIENTEID, FECHA, ESTATUS, CODVENDEDOR, TOTALPRECIO, PROMO_NOMBRE
                            ) VALUES (
                                @ORDERID, @CLIENTEID, GETDATE(), @ESTATUS,
                                ISNULL(NULLIF((SELECT TOP 1 CAST(CCL.CODVENDEDOR AS INT) FROM CLIENTESCAMPOSLIBRES CCL WITH (NOLOCK) WHERE CCL.CODCLIENTE = @CLIENTEID AND CCL.CODVENDEDOR IS NOT NULL AND LTRIM(RTRIM(CAST(CCL.CODVENDEDOR AS NVARCHAR)))!=''), 0), @CODVENDEDOR),
                                @TOTALPRECIO, @PROMO_NOMBRE
                            )`);
                await PedidosServices.insertarLineas(tx, partes[idx], chunkId);
                orderIds.push(chunkId);
            }
            await tx.commit();
            tx = null;

            await PromocionesService.registrarAplicadas(orderId, promocionesAplicadas);
            if (diasMontofactura) for (const oid of orderIds) await PromoEspecialService.registrarPedido(oid, diasMontofactura);
            const ajustesTxt = norm.ajustes.length ? ` | Precios ajustados por el servidor: ${norm.ajustes.join('; ')}` : '';
            for (let idx = 0; idx < orderIds.length; idx++) {
                const total = partes[idx].reduce((s, l) => s + l.precio * l.cantidad, 0);
                const parte = orderIds.length > 1 ? ` (parte ${idx + 1}/${orderIds.length})` : '';
                const detalles = sourceOrderId
                    ? `Pedido copiado de ${sourceOrderId}${parte}. Cliente: ${clienteId}. Total: ${total.toFixed(2)}${ajustesTxt}`
                    : `Pedido creado${parte}. Cliente: ${clienteId}. Total: ${total.toFixed(2)}${ajustesTxt}`;
                await PedidosServices.registrarLog(orderIds[idx], sourceOrderId ? `COPIA:${sourceOrderId}` : null, estatusInicial, codusuario, usuario, detalles);
            }

            return {
                success: true,
                message: 'El pedido fue insertado de forma satisfactoria',
                orderId,
                ...(orderIds.length > 1 ? { orderIds } : {}),
                total: norm.total,
                ...(norm.ajustes.length ? { warning: `Algunos precios se actualizaron a la tarifa vigente: ${norm.ajustes.join('; ')}` } : {}),
            };

        } catch (error) {
            if (tx) { try { await tx.rollback(); } catch { /* ya revertida */ } }
            console.error('Error al subir el pedido: ', error);
            return { success: false, message: `No se pudo crear el pedido: ${error instanceof Error ? error.message : String(error)}` };
        }
    }

    static async getPedidos(page: any = 1, limit: any = 10, estatus?: string, buscarId?: string,
                             clienteId?: string, codVendedor?: string, riesgo?: string, codruta?: string,
                             fechaDesde?: string, fechaHasta?: string, esPsicotropico?: boolean,
                             nombreCliente?: string, soloFacturado?: boolean, usuario?: string,
                             nroFactura?: string, editadoPor?: string, soloAtrasados?: boolean) {
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
                .input('ALMACEN',        mssql.VarChar(10),   getDbConfig().codAlmacen)
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
                .input('USUARIO',        mssql.VarChar(100),  usuario       ? `%${usuario.toLowerCase()}%`       : null)
                .input('EDITADO_POR',    mssql.VarChar(100),  editadoPor    ? `%${editadoPor.toLowerCase()}%`    : null)
                .input('SOLO_ATRASADOS', mssql.Bit,           soloAtrasados  ? 1 : null);
            preIds.forEach((id, i) => req.input(`PRE${i}`, mssql.VarChar(50), id));

            const result = await req.query(`
                SELECT
                    CP.ORDERID, CP.CLIENTEID, CP.FECHA, CP.ESTATUS, CP.CODVENDEDOR, CP.TOTALPRECIO,
                    CP.OBSERVACIONES, CP.PROMO_NOMBRE, LG.USUARIO AS CREADO_POR, LE.EDITADO_POR,
                    FAC.FACTURADO, FAC.SERIE_FAC, FAC.NROFAC,
                    CL.NOMBRECLIENTE, ISNULL(CL.NOMBRECOMERCIAL, '') AS NOMBRECOMERCIAL, CL.CIF, ISNULL(CL.NIF20, '') AS NIF20, CL.DIRECCION1, ISNULL(CE.DIRECCION1, CL.DIRECCION1) AS DIRECCION_ENVIO,
                    ISNULL(CLC.ZONA, '') AS ZONA, ISNULL(RUT.DESCRIPCION, '') AS RUTA,
                    V.NOMVENDEDOR,
                    CR.ESTATUS AS RIESGO_ESTATUS,
                    (SELECT SUM(LP.PRODUCTCOUNT) FROM ${esquema}.LINEA_PED LP WITH (NOLOCK) WHERE LP.ORDERID = CP.ORDERID) AS TOTALUNIDADES,
                    CASE WHEN EXISTS (SELECT 1 FROM ${esquema}.APP_PEDIDO_FALLAS WITH(NOLOCK) WHERE ORDERID = CP.ORDERID)
                           -- falla viva: algún artículo pide más de lo que hay (stock menos lo reservado por otros pedidos)
                           OR EXISTS (
                                SELECT 1 FROM ${esquema}.LINEA_PED LF WITH (NOLOCK)
                                WHERE LF.ORDERID = CP.ORDERID
                                  AND CP.ESTATUS IN ('PENDIENTE','PENDIENTE POR AUTORIZACION','APROBACION PSICOTROPICOS','SANIDAD','AUTORIZADO','EMPACADO')
                                GROUP BY LF.CODARTICULO
                                HAVING SUM(LF.PRODUCTCOUNT) >
                                       ISNULL((SELECT SUM(S.STOCK) FROM STOCKS S WITH (NOLOCK) WHERE S.CODARTICULO = LF.CODARTICULO AND S.CODALMACEN = @ALMACEN), 0)
                                     - ISNULL((SELECT SUM(L2.PRODUCTCOUNT) FROM ${esquema}.CABECERA_PED C2 WITH (NOLOCK)
                                               INNER JOIN ${esquema}.LINEA_PED L2 WITH (NOLOCK) ON L2.ORDERID = C2.ORDERID
                                               WHERE L2.CODARTICULO = LF.CODARTICULO AND C2.ORDERID <> CP.ORDERID
                                                 AND C2.ESTATUS IN ('PENDIENTE POR AUTORIZACION','APROBACION PSICOTROPICOS','SANIDAD','AUTORIZADO','EMPACADO','OK')), 0)
                           )
                         THEN 1 ELSE 0 END AS TIENE_FALLAS
                FROM
                    ${esquema}.CABECERA_PED CP WITH (NOLOCK)
                    LEFT JOIN CLIENTES CL WITH (NOLOCK) ON CL.CODCLIENTE = CP.CLIENTEID
                    OUTER APPLY (SELECT TOP 1 DIRECCION1 FROM CLIENTESENVIO WITH (NOLOCK) WHERE CODCLIENTE = CP.CLIENTEID) CE
                    LEFT JOIN VENDEDORES V WITH (NOLOCK) ON V.CODVENDEDOR = CP.CODVENDEDOR
                    OUTER APPLY (SELECT TOP 1 ZONA FROM CLIENTESCAMPOSLIBRES WITH (NOLOCK) WHERE CODCLIENTE = CP.CLIENTEID) CLC
                    LEFT JOIN RUTAS RUT WITH (NOLOCK) ON RUT.CODRUTA = TRY_CAST(CLC.ZONA AS INT)
                    OUTER APPLY (SELECT TOP 1 USUARIO FROM ${esquema}.APP_PEDIDO_LOG WITH (NOLOCK) WHERE ORDERID = CP.ORDERID AND USUARIO IS NOT NULL ORDER BY FECHA ASC) LG
                    OUTER APPLY (SELECT TOP 1 USUARIO AS EDITADO_POR FROM ${esquema}.APP_PEDIDO_LOG WITH (NOLOCK) WHERE ORDERID = CP.ORDERID AND EST_NUEVO = 'EDITADO' AND USUARIO IS NOT NULL ORDER BY FECHA DESC) LE
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
                    AND (@EDITADO_POR   IS NULL OR LOWER(ISNULL(LE.EDITADO_POR, '')) LIKE @EDITADO_POR)
                    AND (@SOLO_FACTURADO IS NULL OR FAC.FACTURADO IS NOT NULL)
                    AND (@SOLO_ATRASADOS IS NULL OR (DATEDIFF(MINUTE, CP.FECHA, GETDATE()) > 60 AND CP.ESTATUS IN ('PENDIENTE','PENDIENTE POR AUTORIZACION')))
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
                .input('USUARIO2',         mssql.VarChar(100),  usuario       ? `%${usuario.toLowerCase()}%`       : null)
                .input('EDITADO_POR2',     mssql.VarChar(100),  editadoPor    ? `%${editadoPor.toLowerCase()}%`    : null)
                .input('SOLO_ATRASADOS2',  mssql.Bit,           soloAtrasados  ? 1 : null)
                .input('USD_CODE2',        mssql.Int,           usdCode)
                .input('VED_CODE2',        mssql.Int,           vedCode);
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
                OUTER APPLY (SELECT TOP 1 USUARIO AS EDITADO_POR FROM ${esquema}.APP_PEDIDO_LOG WITH (NOLOCK) WHERE ORDERID = CP.ORDERID AND EST_NUEVO = 'EDITADO' AND USUARIO IS NOT NULL ORDER BY FECHA DESC) LE2
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
                            WHEN (ISNULL(SUM(CASE WHEN ISNULL(T.CODMONEDA,1)=@USD_CODE2 THEN T.IMPORTE ELSE T.IMPORTE/NULLIF(DBO.F_GET_COTIZACION(GETDATE(),@VED_CODE2),0) END),0) * 100.0 / CL.RIESGOCONCEDIDO) >= 100 THEN 'SUPERADO'
                            WHEN (ISNULL(SUM(CASE WHEN ISNULL(T.CODMONEDA,1)=@USD_CODE2 THEN T.IMPORTE ELSE T.IMPORTE/NULLIF(DBO.F_GET_COTIZACION(GETDATE(),@VED_CODE2),0) END),0) * 100.0 / CL.RIESGOCONCEDIDO) >= 80  THEN 'ALTO'
                            WHEN (ISNULL(SUM(CASE WHEN ISNULL(T.CODMONEDA,1)=@USD_CODE2 THEN T.IMPORTE ELSE T.IMPORTE/NULLIF(DBO.F_GET_COTIZACION(GETDATE(),@VED_CODE2),0) END),0) * 100.0 / CL.RIESGOCONCEDIDO) >= 30  THEN 'MEDIO'
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
                    AND (@EDITADO_POR2   IS NULL OR LOWER(ISNULL(LE2.EDITADO_POR, '')) LIKE @EDITADO_POR2)
                    AND (@SOLO_FACTURADO2 IS NULL OR PF.SUPEDIDO IS NOT NULL)
                    AND (@SOLO_ATRASADOS2 IS NULL OR (DATEDIFF(MINUTE, CP.FECHA, GETDATE()) > 60 AND CP.ESTATUS IN ('PENDIENTE','PENDIENTE POR AUTORIZACION')))
                    ${countOrderIdClause}
            `);

            const atrasadosResult = await pool.request().query(`
                SELECT COUNT(*) AS CNT FROM ${esquema}.CABECERA_PED WITH (NOLOCK)
                WHERE ESTATUS IN ('PENDIENTE','PENDIENTE POR AUTORIZACION')
                  AND DATEDIFF(MINUTE, FECHA, GETDATE()) > 60
            `);

            return {
                success: true,
                message: 'Pedidos obtenidos correctamente',
                data: result.recordset,
                total: countResult.recordset[0].TOTAL,
                totalUSD: Number(countResult.recordset[0].TOTAL_USD),
                conteoAtrasados: atrasadosResult.recordset[0].CNT
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

    static async updatePedidoCompleto(
        orderId: string, pedido: any, codusuario?: number, usuario?: string,
        permisos: { editar: boolean; editarPsico: boolean; descuentoLinea: boolean } = { editar: false, editarPsico: false, descuentoLinea: false },
    ) {
        let transaction: mssql.Transaction | null = null;

        try {
            const { clienteId, codVendedor, lineas } = pedido;

            const maxLineasEdit = getDbConfig().maxLineasPorPedido ?? 0;
            if (maxLineasEdit > 0 && Array.isArray(lineas) && lineas.length > maxLineasEdit) {
                return {
                    success: false,
                    message: `El pedido tiene ${lineas.length} líneas, superando el límite de ${maxLineasEdit} por pedido.`
                };
            }

            const pool = await connectDb();
            transaction = new mssql.Transaction(pool);
            await transaction.begin();

            // 1. Verificar que el pedido existe y bloquear su fila hasta terminar
            const checkRes = await new mssql.Request(transaction)
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`SELECT ESTATUS, TOTALPRECIO, CLIENTEID FROM ${esquema}.CABECERA_PED WITH (UPDLOCK, ROWLOCK) WHERE ORDERID = @ORDERID`);

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
            const autorizado = estatusActual === 'PENDIENTE' ? permisos.editar : permisos.editarPsico;
            if (!autorizado) {
                await transaction.rollback();
                return { success: false, message: `No tienes permiso para editar pedidos en estatus ${estatusActual}` };
            }

            // APROBACION PSICOTROPICOS ya reserva stock: cambiar sus cantidades es una reserva nueva
            if (estatusActual === ESTATUS_APROBACION_PSICOTROPICOS) await PedidosServices.bloquearStock(transaction);

            // 1b. Snapshot de las líneas ANTES de cualquier modificación
            const snapRes = await new mssql.Request(transaction)
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

            // Precios ya pactados en este pedido se respetan; artículos nuevos toman la tarifa vigente
            const referencias = new Map<number, { brutos: number[]; d4s: number[] }>();
            for (const l of lineasAntes) {
                const ref = referencias.get(Number(l.cod)) ?? { brutos: [], d4s: [] };
                ref.brutos.push(l.bruto);
                ref.d4s.push(l.d4);
                referencias.set(Number(l.cod), ref);
            }
            const norm = await PedidosServices.normalizarLineas(lineas, permisos.descuentoLinea, referencias);

            if (estatusActual === 'PENDIENTE' && norm.lineas.some(l => l.esPsico)) {
                await transaction.rollback();
                return { success: false, message: 'Los psicotrópicos deben ir en un pedido aparte para pasar por aprobación sanitaria. Créelos desde el carrito.' };
            }

            const { insuficiente: insuficienteEdit } = await PedidosServices.checkStockLineas(
                norm.lineas.map(l => ({ codarticulo: l.codarticulo, cantidad: l.cantidad })), orderId, transaction);
            if (insuficienteEdit.length > 0) {
                await transaction.rollback();
                const detalle = insuficienteEdit.map(i => `${i.descripcion} (pedido: ${i.cantidad_pedida}, disponible: ${i.disponible})`).join('; ');
                return { success: false, message: `Stock insuficiente para: ${detalle}` };
            }

            // Auditoría pre-edición: snapshot de cabecera + líneas actuales
            await PedidosServices.auditarPedido(orderId, 'EDICION', codusuario, usuario, transaction, true);

            // 2. Cabecera: total calculado en el servidor; el vendedor elegido en la edición se respeta
            const vendedor = Number(codVendedor) > 0 ? Math.trunc(Number(codVendedor)) : null;
            await new mssql.Request(transaction)
                .input('ORDERID', mssql.VarChar(50), orderId)
                .input('CLIENTEID', mssql.Int, clienteId)
                .input('CODVENDEDOR', mssql.Int, vendedor)
                .input('TOTALPRECIO', mssql.Float, norm.total)
                .query(`
                    UPDATE ${esquema}.CABECERA_PED
                    SET CLIENTEID = @CLIENTEID,
                        CODVENDEDOR = ISNULL(@CODVENDEDOR, CODVENDEDOR),
                        TOTALPRECIO = @TOTALPRECIO
                    WHERE ORDERID = @ORDERID
                `);

            // 3. Reemplazar las líneas
            await new mssql.Request(transaction)
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`DELETE FROM ${esquema}.LINEA_PED WHERE ORDERID = @ORDERID`);
            await PedidosServices.insertarLineas(transaction, norm.lineas, orderId);

            await transaction.commit();
            transaction = null;

            const lineasDespues = norm.lineas.map(l => ({
                cod: l.codarticulo, ref: l.referencia, qty: l.cantidad, precio: l.precio,
                d1: l.d1, d2: l.d2, d3: l.d3, d4: l.d4, bruto: l.precioBruto,
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
            if (norm.ajustes.length) partesDiff.push(`precios ajustados: ${norm.ajustes.join('; ')}`);
            const detallesLog = `total: ${totalAntes.toFixed(2)} → ${norm.total.toFixed(2)}${clienteAntes !== Number(clienteId) ? ` | cliente: ${clienteAntes} → ${clienteId}` : ''} | ${partesDiff.join(' | ') || 'sin cambios en líneas'}`;

            await PedidosServices.registrarLog(
                orderId, estatusActual, 'EDITADO', codusuario, usuario,
                detallesLog,
                JSON.stringify({ total: totalAntes, cliente: clienteAntes, lineas: lineasAntes }),
                JSON.stringify({ total: norm.total, cliente: clienteId,    lineas: lineasDespues }),
            );

            return {
                success: true,
                message: 'El pedido fue actualizado de forma satisfactoria',
                total: norm.total,
                ...(norm.ajustes.length ? { warning: `Algunos precios se actualizaron a la tarifa vigente: ${norm.ajustes.join('; ')}` } : {}),
            };

        } catch (error) {
            if (transaction) {
                try { await transaction.rollback(); } catch (rollbackError) { console.error('Error al intentar hacer rollback:', rollbackError); }
            }
            console.error(`Error al actualizar el pedido ${orderId}: `, error);
            return {
                success: false,
                message: `No se pudo actualizar el pedido: ${error instanceof Error ? error.message : String(error)}`,
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
        const sufijo = (id: string) => (id.replace(/-\d+$/, '').match(/[A-Za-z]*$/) || [''])[0];
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

            // Reconfirmar estatus con la fila bloqueada: otro usuario pudo cambiarlos desde la validación
            const lockReq = new mssql.Request(transaction);
            const lockPH = orderIds.map((id, i) => { lockReq.input(`LK${i}`, mssql.VarChar(50), id); return `@LK${i}`; }).join(',');
            const lockRes = await lockReq.query(`SELECT ORDERID, ESTATUS FROM ${esquema}.CABECERA_PED WITH (UPDLOCK, ROWLOCK) WHERE ORDERID IN (${lockPH})`);
            const cambiado = lockRes.recordset.find((r: any) => orders.find((o: any) => o.ORDERID === r.ORDERID)?.ESTATUS !== r.ESTATUS);
            if (cambiado || lockRes.recordset.length !== orderIds.length) {
                await transaction.rollback();
                return { success: false, message: 'Uno de los pedidos cambió de estatus mientras se fusionaba. Recargue e intente de nuevo.' };
            }

            // Si el resultado será PENDIENTE POR AUTORIZACION, las líneas de pedidos en PENDIENTE
            // pasan a reservar stock: se verifican con el lock de reservas tomado
            if (estadoFinal === 'PENDIENTE POR AUTORIZACION') {
                const pendienteIds = orders.filter((o: any) => o.ESTATUS === 'PENDIENTE').map((o: any) => o.ORDERID as string);
                if (pendienteIds.length > 0) {
                    await PedidosServices.bloquearStock(transaction);
                    const linReq = new mssql.Request(transaction);
                    const linPH = pendienteIds.map((id, i) => { linReq.input(`LF${i}`, mssql.VarChar(50), id); return `@LF${i}`; }).join(',');
                    const linRes = await linReq.query(`
                        SELECT CODARTICULO, SUM(PRODUCTCOUNT) AS CANTIDAD
                        FROM ${esquema}.LINEA_PED WITH (NOLOCK)
                        WHERE ORDERID IN (${linPH})
                        GROUP BY CODARTICULO
                    `);
                    const lineasPendientes = linRes.recordset.map((r: any) => ({ codarticulo: Number(r.CODARTICULO), cantidad: Number(r.CANTIDAD) }));
                    const { insuficiente } = await PedidosServices.checkStockLineas(lineasPendientes, undefined, transaction);
                    if (insuficiente.length > 0) {
                        await transaction.rollback();
                        const detalle = insuficiente.map(i => `${i.descripcion} (pedido: ${i.cantidad_pedida}, disponible: ${i.disponible})`).join('; ');
                        return { success: false, message: `No se puede fusionar: stock insuficiente para ${detalle}` };
                    }
                }
            }

            // 0. Snapshot pre-fusión (atómico con la transacción — si falla, no queda basura)
            const logRes = await new mssql.Request(transaction)
                .input('MASTER',     mssql.VarChar(50),    masterId)
                .input('IDS',        mssql.NVarChar(500),  orderIds.join(', '))
                .input('CODUSUARIO', mssql.Int,            codusuario ?? null)
                .input('USUARIO',    mssql.VarChar(100),   usuario ?? null)
                .query(`
                    INSERT INTO ${esquema}.APP_FUSION_LOG (ORDERID_MAESTRO, ORDERIDS_FUSION, CODUSUARIO, USUARIO)
                    VALUES (@MASTER, @IDS, @CODUSUARIO, @USUARIO);
                    SELECT SCOPE_IDENTITY() AS FUSION_ID
                `);
            const fusionId = Number(logRes.recordset[0].FUSION_ID);

            const snapReq = new mssql.Request(transaction);
            snapReq.input('FID', mssql.Int, fusionId);
            const whereSnap = orderIds.map((id, i) => {
                snapReq.input(`SID${i}`, mssql.VarChar(50), id);
                return `ORDERID = @SID${i} OR ORDERID LIKE @SID${i} + '-%'`;
            }).join(' OR ');
            await snapReq.query(`
                INSERT INTO ${esquema}.APP_FUSION_SNAPSHOT_CAB
                    (FUSION_ID, ROL, ORDERID, CLIENTEID, FECHA, ESTATUS, CODVENDEDOR, TOTALPRECIO, OBSERVACIONES, PROMO_NOMBRE)
                SELECT @FID,
                       CASE WHEN ORDERID = @SID0 OR ORDERID LIKE @SID0 + '-%' THEN 'MAESTRO' ELSE 'FUENTE' END,
                       ORDERID, CLIENTEID, FECHA, ESTATUS, CODVENDEDOR, TOTALPRECIO,
                       ISNULL(OBSERVACIONES, ''), ISNULL(PROMO_NOMBRE, '')
                FROM ${esquema}.CABECERA_PED WITH (NOLOCK) WHERE ${whereSnap};

                INSERT INTO ${esquema}.APP_FUSION_SNAPSHOT_LIN
                    (FUSION_ID, ORDERID, CODARTICULO, REFERENCIA, CODALMACEN, IDTARIFAV, PRODUCTCOUNT,
                     PRECIOUNITARIO, DESCUENTO1, DESCUENTO2, DESCUENTO3, DESCUENTO4, PRECIOBRUTO, PORCENTAJEIVA, MONTOIVA)
                SELECT @FID,
                       ORDERID, CODARTICULO, REFERENCIA, CODALMACEN, IDTARIFAV, PRODUCTCOUNT,
                       PRECIOUNITARIO, DESCUENTO1, DESCUENTO2, DESCUENTO3, DESCUENTO4, PRECIOBRUTO, PORCENTAJEIVA, MONTOIVA
                FROM ${esquema}.LINEA_PED WITH (NOLOCK) WHERE ${whereSnap};

                INSERT INTO ${esquema}.APP_FUSION_SNAPSHOT_PROMO
                    (FUSION_ID, ORDERID, IDPROMOCION, NOMBREPROMOCION, PORCENTAJEAPLICADO, BASETOTAL)
                SELECT @FID, ORDERID, IDPROMOCION, NOMBREPROMOCION, PORCENTAJEAPLICADO, BASETOTAL
                FROM ${esquema}.APP_PEDIDO_PROMOCIONES WITH (NOLOCK) WHERE ${whereSnap}
            `);

            for (const fuenteId of fuenteIds) {
                // Mover líneas (incluyendo chunks: fuenteId-2, fuenteId-3…)
                await new mssql.Request(transaction)
                    .input('MASTER', mssql.VarChar(50), masterId)
                    .input('FUENTE', mssql.VarChar(50), fuenteId)
                    .query(`
                        UPDATE ${esquema}.LINEA_PED SET ORDERID = @MASTER
                        WHERE ORDERID = @FUENTE OR ORDERID LIKE @FUENTE + '-%'
                    `);
                // Migrar logs de la fuente al maestro; borrar promociones y cabeceras de la fuente
                await new mssql.Request(transaction)
                    .input('MASTER', mssql.VarChar(50), masterId)
                    .input('FUENTE', mssql.VarChar(50), fuenteId)
                    .query(`
                        UPDATE ${esquema}.APP_PEDIDO_LOG SET ORDERID = @MASTER
                            WHERE ORDERID = @FUENTE OR ORDERID LIKE @FUENTE + '-%';
                        DELETE FROM ${esquema}.APP_PEDIDO_PROMOCIONES WHERE ORDERID = @FUENTE OR ORDERID LIKE @FUENTE + '-%';
                        DELETE FROM ${esquema}.CABECERA_PED            WHERE ORDERID = @FUENTE OR ORDERID LIKE @FUENTE + '-%'
                    `);
            }

            // Consolidar chunks del maestro en el maestro
            await new mssql.Request(transaction)
                .input('MASTER', mssql.VarChar(50), masterId)
                .query(`
                    UPDATE ${esquema}.LINEA_PED      SET ORDERID = @MASTER WHERE ORDERID LIKE @MASTER + '-%';
                    UPDATE ${esquema}.APP_PEDIDO_LOG SET ORDERID = @MASTER WHERE ORDERID LIKE @MASTER + '-%';
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

            const est = await new mssql.Request(transaction)
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`SELECT ESTATUS FROM ${esquema}.CABECERA_PED WITH (UPDLOCK, ROWLOCK) WHERE ORDERID = @ORDERID`);
            if (est.recordset.length === 0) {
                await transaction.rollback();
                return { success: false, message: 'No se pudo eliminar. El pedido no existe.' };
            }
            if (est.recordset[0].ESTATUS !== 'PENDIENTE') {
                await transaction.rollback();
                return { success: false, message: `Solo se pueden eliminar pedidos en PENDIENTE (este está en ${est.recordset[0].ESTATUS}). Use CANCELADO.` };
            }

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

            // 2. Borrar promociones, fallas, líneas y cabecera
            await new mssql.Request(transaction)
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`
                    DELETE FROM ${esquema}.APP_PEDIDO_PROMOCIONES WHERE ORDERID = @ORDERID;
                    DELETE FROM ${esquema}.APP_PEDIDO_FALLAS      WHERE ORDERID = @ORDERID;
                    DELETE FROM ${esquema}.LINEA_PED              WHERE ORDERID = @ORDERID;
                    DELETE FROM ${esquema}.CABECERA_PED           WHERE ORDERID = @ORDERID;
                `);

            // 3. Registrar eliminación en el log (dentro de la transacción)
            await new mssql.Request(transaction)
                .input('ORDERID',    mssql.VarChar(50),  orderId)
                .input('CODUSUARIO', mssql.Int,          codusuario ?? null)
                .input('USUARIO',    mssql.VarChar(100), usuario ?? null)
                .query(`INSERT INTO ${esquema}.APP_PEDIDO_LOG (ORDERID, EST_ANTERIOR, EST_NUEVO, CODUSUARIO, USUARIO, DETALLES)
                        VALUES (@ORDERID, 'PENDIENTE', 'ELIMINADO', @CODUSUARIO, @USUARIO, 'Pedido eliminado manualmente')`);

            await transaction.commit();

            return { success: true, message: 'El pedido y todos sus artículos fueron eliminados de forma satisfactoria' };

        } catch (error) {
            if (transaction) {
                try { await transaction.rollback(); } catch (rollbackError) { console.error('Error al intentar hacer rollback:', rollbackError); }
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

    // source: pasar la transacción que tiene tomado el lock de reservas para leer dentro de ella
    static async checkStockLineas(
        lineas: { codarticulo: number; cantidad: number }[],
        excludeOrderId?: string,
        source?: mssql.ConnectionPool | mssql.Transaction,
    ): Promise<{ insuficiente: { codarticulo: number; descripcion: string; cantidad_pedida: number; disponible: number }[] }> {
        if (!lineas.length) return { insuficiente: [] };
        const { codAlmacen } = getDbConfig();
        // Validate all codes are integers before interpolating
        const codigos = lineas.map(l => Math.trunc(Number(l.codarticulo))).filter(n => n > 0);
        if (!codigos.length) return { insuficiente: [] };

        const excludeClause = excludeOrderId ? `AND CP.ORDERID <> @EXCL_OID` : '';
        const req = (source ? new mssql.Request(source as any) : (await connectDb()).request())
            .input('ALMACEN', mssql.VarChar(10), codAlmacen);
        if (excludeOrderId) req.input('EXCL_OID', mssql.VarChar(50), excludeOrderId);

        const stockRes = await req.query(`
                SELECT A.CODARTICULO, A.DESCRIPCION,
                    ISNULL((SELECT SUM(STOCK) FROM ${esquema}.STOCKS WITH (NOLOCK)
                            WHERE CODARTICULO = A.CODARTICULO AND CODALMACEN = @ALMACEN), 0)
                    - ISNULL((
                        SELECT SUM(LP.PRODUCTCOUNT)
                        FROM ${esquema}.CABECERA_PED CP WITH (NOLOCK)
                        INNER JOIN ${esquema}.LINEA_PED LP WITH (NOLOCK) ON LP.ORDERID = CP.ORDERID
                        WHERE LP.CODARTICULO = A.CODARTICULO
                          ${excludeClause}
                          AND CP.ESTATUS IN ('PENDIENTE POR AUTORIZACION','APROBACION PSICOTROPICOS',
                                             'SANIDAD','AUTORIZADO','EMPACADO','OK')
                    ), 0) AS DISPONIBLE
                FROM ${esquema}.ARTICULOS A WITH (NOLOCK)
                WHERE A.CODARTICULO IN (${codigos.join(',')})
            `);

        const stockMap = new Map<number, { disponible: number; descripcion: string }>(
            stockRes.recordset.map((r: any) => [Number(r.CODARTICULO), { disponible: Number(r.DISPONIBLE), descripcion: r.DESCRIPCION ?? '' }])
        );

        // Sumar por artículo: el mismo código en varias líneas (p. ej. tras una fusión) compite por el mismo stock
        const pedidoPorArticulo = new Map<number, number>();
        for (const l of lineas) {
            const cod = Number(l.codarticulo);
            pedidoPorArticulo.set(cod, (pedidoPorArticulo.get(cod) ?? 0) + Number(l.cantidad));
        }

        const insuficiente = [...pedidoPorArticulo.entries()]
            .filter(([cod, cantidad]) => {
                const s = stockMap.get(cod);
                return !s || s.disponible < cantidad;
            })
            .map(([cod, cantidad]) => {
                const s = stockMap.get(cod);
                return { codarticulo: cod, descripcion: s?.descripcion ?? String(cod), cantidad_pedida: cantidad, disponible: s?.disponible ?? 0 };
            });

        return { insuficiente };
    }

    static async updateEstatusPedido(orderId: string, nuevoEstatus: string, codusuario?: number, usuario?: string, visibilidadUsuario?: number, anomaliasConfirmadas?: string) {
        let tx: mssql.Transaction | null = null;
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
            const reservaStock = estatusLimpio === 'PENDIENTE POR AUTORIZACION' || estatusLimpio === 'AUTORIZADO';

            // Los cambios que reservan stock se hacen en una transacción con el lock de reservas:
            // nadie más puede chequear/reservar stock hasta que este cambio termine.
            if (reservaStock) {
                tx = new mssql.Transaction(pool);
                await tx.begin();
                await PedidosServices.bloquearStock(tx);
            }
            const src: mssql.ConnectionPool | mssql.Transaction = tx ?? pool;
            const req = () => new mssql.Request(src as any);
            const abortar = async (resp: any) => {
                if (tx) { await tx.rollback(); tx = null; }
                return resp;
            };

            const checkRes = await req()
                .input('ORDERID_CHK', mssql.VarChar(50), orderId)
                .query(`SELECT ESTATUS FROM ${esquema}.CABECERA_PED ${tx ? 'WITH (UPDLOCK, ROWLOCK)' : 'WITH (NOLOCK)'} WHERE ORDERID = @ORDERID_CHK`);

            if (checkRes.recordset.length === 0) return abortar({ success: false, message: 'El pedido no existe' });

            const estadoActual = checkRes.recordset[0].ESTATUS as string;
            const permitidos = TRANSICIONES_PERMITIDAS[estadoActual] ?? [];
            if (!permitidos.includes(estatusLimpio)) {
                return abortar({
                    success: false,
                    message: `No se puede cambiar de "${estadoActual}" a "${estatusLimpio}". Transición no permitida.`
                });
            }

            // CANCELADO desde PENDIENTE o ICG no requiere rol Autorizador
            const cancelacionLibre = estatusLimpio === 'CANCELADO' && ['PENDIENTE', 'ICG', ESTATUS_APROBACION_PSICOTROPICOS].includes(estadoActual);
            const requiereAutorizador = estatusLimpio === 'AUTORIZADO' ||
                (estatusLimpio === 'CANCELADO' && !cancelacionLibre);
            if (requiereAutorizador && !puedeAutorizar) {
                return abortar({
                    success: false,
                    message: 'No tienes permiso para realizar esta transición. Se requiere el rol Autorizador.'
                });
            }

            // Verificar límite de líneas antes de cualquier avance en el flujo de autorización
            const maxLineasAuth = getDbConfig().maxLineasPorPedido ?? 0;
            if (maxLineasAuth > 0 && reservaStock) {
                const cntRes = await req()
                    .input('ORDERID_CNT', mssql.VarChar(50), orderId)
                    .query(`SELECT COUNT(*) AS TOTAL FROM ${esquema}.LINEA_PED WITH (NOLOCK)
                            WHERE ORDERID = @ORDERID_CNT OR ORDERID LIKE @ORDERID_CNT + '-%'`);
                const totalLineas = Number(cntRes.recordset[0].TOTAL);
                if (totalLineas > maxLineasAuth) {
                    return abortar({
                        success: false,
                        message: `Este pedido tiene ${totalLineas} líneas, superando el límite de ${maxLineasAuth}. Divídalo antes de autorizar.`
                    });
                }
            }

            // PENDIENTE POR AUTORIZACION: bloqueante — es el punto de reserva; sin stock no avanza.
            // AUTORIZADO: si falta stock se autorizan solo las unidades disponibles (las líneas se recortan).
            let fallasStock: { codarticulo: number; descripcion: string; cantPedida: number; stockDisponible: number }[] = [];
            const recortes: string[] = [];
            let lineasPedido: any[] = [];
            if (reservaStock) {
                const lineasRes = await req()
                    .input('ORDERID_LINEAS', mssql.VarChar(50), orderId)
                    .query(`SELECT LINEAID, CODARTICULO, PRODUCTCOUNT, PRECIOUNITARIO, ISNULL(PORCENTAJEIVA, 0) AS PORCENTAJEIVA
                            FROM ${esquema}.LINEA_PED WITH (NOLOCK) WHERE ORDERID = @ORDERID_LINEAS ORDER BY LINEAID`);
                lineasPedido = lineasRes.recordset;
                const { insuficiente } = await PedidosServices.checkStockLineas(
                    lineasPedido.map((l: any) => ({ codarticulo: Number(l.CODARTICULO), cantidad: Number(l.PRODUCTCOUNT) })),
                    orderId, src
                );
                fallasStock = insuficiente.map(i => ({
                    codarticulo: i.codarticulo, descripcion: i.descripcion, cantPedida: i.cantidad_pedida, stockDisponible: i.disponible,
                }));
            }

            if (fallasStock.length > 0 && estatusLimpio === 'PENDIENTE POR AUTORIZACION') {
                await abortar(null);
                await PedidosServices.registrarFallas(orderId, fallasStock);
                return {
                    success: false,
                    message: `Stock insuficiente para: ${fallasStock.map(f => `${f.descripcion} (necesita ${f.cantPedida}, disponible ${Math.max(0, f.stockDisponible)})`).join('; ')}`,
                    fallasStock,
                };
            }

            const parcial = fallasStock.length > 0 && estatusLimpio === 'AUTORIZADO';
            await PedidosServices.auditarPedido(orderId, parcial ? 'AUTORIZACION_PARCIAL' : 'CAMBIO_ESTATUS', codusuario, usuario, src, parcial);

            if (parcial) {
                // Repartir lo disponible entre las líneas de cada artículo en falta (en orden de línea)
                const disponible = new Map<number, number>(fallasStock.map(f => [f.codarticulo, Math.max(0, Math.floor(f.stockDisponible))]));
                let quedan = 0;
                for (const l of lineasPedido) {
                    const cod = Number(l.CODARTICULO);
                    const pedida = Number(l.PRODUCTCOUNT);
                    if (!disponible.has(cod)) { quedan++; continue; }
                    const nueva = Math.min(pedida, disponible.get(cod)!);
                    disponible.set(cod, disponible.get(cod)! - nueva);
                    recortes.push(`art. ${cod}: ${pedida} → ${nueva}`);
                    if (nueva === 0) {
                        await req().input('LID', mssql.Int, l.LINEAID).query(`DELETE FROM ${esquema}.LINEA_PED WHERE LINEAID = @LID`);
                    } else {
                        quedan++;
                        await req()
                            .input('LID', mssql.Int, l.LINEAID)
                            .input('CANT', mssql.Int, nueva)
                            .input('MIVA', mssql.Float, Number(l.PRECIOUNITARIO) * nueva * Number(l.PORCENTAJEIVA) / 100)
                            .query(`UPDATE ${esquema}.LINEA_PED SET PRODUCTCOUNT = @CANT, MONTOIVA = @MIVA WHERE LINEAID = @LID`);
                    }
                }
                if (quedan === 0) {
                    await abortar(null);
                    await PedidosServices.registrarFallas(orderId, fallasStock);
                    return { success: false, message: 'Ninguno de los artículos del pedido tiene stock disponible: no se puede autorizar.', fallasStock };
                }
                await req()
                    .input('OID_TOT', mssql.VarChar(50), orderId)
                    .query(`UPDATE ${esquema}.CABECERA_PED
                            SET TOTALPRECIO = (SELECT ISNULL(SUM(PRODUCTCOUNT * PRECIOUNITARIO), 0) FROM ${esquema}.LINEA_PED WHERE ORDERID = @OID_TOT)
                            WHERE ORDERID = @OID_TOT`);
            }

            const result = await req()
                .input('ORDERID', mssql.VarChar(50), orderId)
                .input('ESTATUS', mssql.VarChar(50), estatusLimpio)
                .query(`
                    UPDATE ${esquema}.CABECERA_PED
                    SET ESTATUS = @ESTATUS
                    WHERE ORDERID = @ORDERID
                `);

            if (Number(result.rowsAffected[0]) === 0) {
                return abortar({
                    success: false,
                    message: 'No se pudo actualizar el estatus. El pedido no existe en el sistema.'
                });
            }

            if (tx) { await tx.commit(); tx = null; }

            if (fallasStock.length > 0) await PedidosServices.registrarFallas(orderId, fallasStock);

            const partesDetalle: string[] = [];
            if (anomaliasConfirmadas) partesDetalle.push(`Anomalías confirmadas al autorizar: ${anomaliasConfirmadas}`);
            if (recortes.length) partesDetalle.push(`Autorizado parcialmente por stock: ${recortes.join('; ')}`);
            await PedidosServices.registrarLog(orderId, estadoActual, estatusLimpio, codusuario, usuario, partesDetalle.join(' | ') || undefined);

            return {
                success: true,
                message: `El estatus del pedido se actualizó a ${estatusLimpio} de forma satisfactoria`,
                ...(recortes.length ? { warning: `Se autorizaron solo las unidades disponibles: ${recortes.join('; ')}` } : {}),
            };

        } catch (error) {
            if (tx) { try { await tx.rollback(); } catch { /* ya revertida */ } }
            console.error(`Error al actualizar el estatus del pedido ${orderId}: `, error);
            return {
                success: false,
                message: error instanceof Error && error.message.startsWith('Otra operación')
                    ? error.message
                    : 'Hubo un fallo al actualizar el estatus en la base de datos',
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

            const lineasPsico = await pool.request()
                .input('OID_PSI', mssql.VarChar(50), orderId)
                .query(`SELECT CODARTICULO, PRODUCTCOUNT AS CANTIDAD FROM ${esquema}.LINEA_PED WITH (NOLOCK) WHERE ORDERID = @OID_PSI`);
            const lineasCheck = lineasPsico.recordset.map((r: any) => ({ codarticulo: Number(r.CODARTICULO), cantidad: Number(r.CANTIDAD) }));
            const { insuficiente } = await PedidosServices.checkStockLineas(lineasCheck, orderId);
            if (insuficiente.length > 0) {
                const detalle = insuficiente.map(i => `${i.descripcion} (pedido: ${i.cantidad_pedida}, disponible: ${i.disponible})`).join('; ');
                return { success: false, message: `Stock insuficiente para: ${detalle}` };
            }

            await PedidosServices.auditarPedido(orderId, 'APROBACION_PSICOTROPICO', codusuario, usuario, pool, false);

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

    // Faltante de hoy si lo hay (stock menos lo reservado por otros pedidos); si no, las fallas históricas registradas
    static async getDiferenciasPedido(orderId: string): Promise<{
        codarticulo: number; descripcion: string; cantPedida: number;
        stockDisponible: number; cantFaltante: number; fecha: Date | null;
    }[]> {
        const pool = await connectDb();
        const linRes = await pool.request()
            .input('OID', mssql.VarChar(50), orderId)
            .query(`SELECT CODARTICULO, PRODUCTCOUNT FROM ${esquema}.LINEA_PED WITH(NOLOCK) WHERE ORDERID = @OID`);
        const { insuficiente } = await PedidosServices.checkStockLineas(
            linRes.recordset.map((r: any) => ({ codarticulo: Number(r.CODARTICULO), cantidad: Number(r.PRODUCTCOUNT) })),
            orderId
        );
        if (insuficiente.length) {
            return insuficiente.map(i => {
                const disponible = Math.max(0, i.disponible);
                return {
                    codarticulo: i.codarticulo, descripcion: i.descripcion, cantPedida: i.cantidad_pedida,
                    stockDisponible: disponible, cantFaltante: i.cantidad_pedida - disponible, fecha: null,
                };
            });
        }

        const fallasRes = await pool.request()
            .input('OID_F', mssql.VarChar(50), orderId)
            .query(`
                SELECT F.CODARTICULO, ISNULL(NULLIF(F.DESCRIPCION, CAST(F.CODARTICULO AS NVARCHAR(20))), A.DESCRIPCION) AS DESCRIPCION,
                       F.CANT_PEDIDA, F.STOCK_DISPONIBLE, F.FECHA
                FROM ${esquema}.APP_PEDIDO_FALLAS F WITH(NOLOCK)
                LEFT JOIN ARTICULOS A WITH(NOLOCK) ON A.CODARTICULO = F.CODARTICULO
                WHERE F.ORDERID = @OID_F
                ORDER BY F.CODARTICULO
            `);
        return fallasRes.recordset.map((r: any) => ({
            codarticulo: Number(r.CODARTICULO),
            descripcion: r.DESCRIPCION ?? String(r.CODARTICULO),
            cantPedida: Number(r.CANT_PEDIDA),
            stockDisponible: Math.max(0, Number(r.STOCK_DISPONIBLE)),
            cantFaltante: Math.max(0, Number(r.CANT_PEDIDA) - Math.max(0, Number(r.STOCK_DISPONIBLE))),
            fecha: r.FECHA,
        }));
    }

    static async getStockFaltantes(orderId: string): Promise<{ codarticulo: number; descripcion: string; cantPedida: number; stockDisponible: number }[]> {
        const pool = await connectDb();
        const lineasRes = await pool.request()
            .input('ORDERID_LINEAS', mssql.VarChar(50), orderId)
            .query(`SELECT CODARTICULO, PRODUCTCOUNT AS CANTIDAD FROM ${esquema}.LINEA_PED WITH (NOLOCK) WHERE ORDERID = @ORDERID_LINEAS`);
        const { insuficiente } = await PedidosServices.checkStockLineas(
            lineasRes.recordset.map((l: any) => ({ codarticulo: Number(l.CODARTICULO), cantidad: Number(l.CANTIDAD) })),
            orderId
        );
        const faltantes = insuficiente.map(i => ({
            codarticulo: i.codarticulo, descripcion: i.descripcion, cantPedida: i.cantidad_pedida, stockDisponible: Math.max(0, i.disponible),
        }));
        // Si no hay faltantes actuales pero el pedido tiene fallas históricas, devolverlas
        // para que el modal de advertencia igualmente aparezca al autorizar
        if (faltantes.length === 0) {
            const histRes = await pool.request()
                .input('OID_HIST', mssql.VarChar(50), orderId)
                .query(`SELECT CODARTICULO, DESCRIPCION, CANT_PEDIDA, STOCK_DISPONIBLE
                        FROM ${esquema}.APP_PEDIDO_FALLAS WITH(NOLOCK) WHERE ORDERID = @OID_HIST`);
            for (const r of histRes.recordset) {
                faltantes.push({
                    codarticulo:    Number(r.CODARTICULO),
                    descripcion:    r.DESCRIPCION ?? String(r.CODARTICULO),
                    cantPedida:     Number(r.CANT_PEDIDA),
                    stockDisponible: Number(r.STOCK_DISPONIBLE),
                });
            }
        }
        return faltantes;
    }

    private static async auditarPedido(
        orderId: string,
        accion: string,
        codusuario: number | undefined,
        usuario: string | undefined,
        requestSource: mssql.ConnectionPool | mssql.Transaction,
        incluirLineas: boolean
    ): Promise<void> {
        // ponytail: as any needed — mssql overloads don't accept ConnectionPool|Transaction union
        const mkReq = () => new mssql.Request(requestSource as any);
        const audRes = await mkReq()
            .input('ORDERID',    mssql.VarChar(50),   orderId)
            .input('ACCION',     mssql.VarChar(50),   accion)
            .input('CODUSUARIO', mssql.Int,           codusuario ?? null)
            .input('USUARIO',    mssql.VarChar(100),  usuario ?? null)
            .query(`
                INSERT INTO ${esquema}.APP_PEDIDO_AUDITORIA (ORDERID, ACCION, CODUSUARIO, USUARIO)
                VALUES (@ORDERID, @ACCION, @CODUSUARIO, @USUARIO);
                SELECT SCOPE_IDENTITY() AS AUD_ID
            `);
        const audId = Number(audRes.recordset[0].AUD_ID);

        await mkReq()
            .input('AUD_ID',  mssql.Int,         audId)
            .input('ORDERID', mssql.VarChar(50), orderId)
            .query(`
                INSERT INTO ${esquema}.APP_PEDIDO_AUDITORIA_CAB
                    (AUDITORIA_ID, ORDERID, CLIENTEID, FECHA, ESTATUS, CODVENDEDOR, TOTALPRECIO, OBSERVACIONES, PROMO_NOMBRE)
                SELECT @AUD_ID, ORDERID, CLIENTEID, FECHA, ESTATUS, CODVENDEDOR, TOTALPRECIO,
                       ISNULL(OBSERVACIONES, ''), ISNULL(PROMO_NOMBRE, '')
                FROM ${esquema}.CABECERA_PED WITH (NOLOCK) WHERE ORDERID = @ORDERID
            `);

        if (incluirLineas) {
            await mkReq()
                .input('AUD_ID',  mssql.Int,         audId)
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`
                    INSERT INTO ${esquema}.APP_PEDIDO_AUDITORIA_LIN
                        (AUDITORIA_ID, ORDERID, CODARTICULO, REFERENCIA, CODALMACEN, IDTARIFAV, PRODUCTCOUNT,
                         PRECIOUNITARIO, DESCUENTO1, DESCUENTO2, DESCUENTO3, DESCUENTO4, PRECIOBRUTO, PORCENTAJEIVA, MONTOIVA)
                    SELECT @AUD_ID, ORDERID, CODARTICULO, REFERENCIA, CODALMACEN, IDTARIFAV, PRODUCTCOUNT,
                           PRECIOUNITARIO, DESCUENTO1, DESCUENTO2, DESCUENTO3, DESCUENTO4, PRECIOBRUTO, PORCENTAJEIVA, MONTOIVA
                    FROM ${esquema}.LINEA_PED WITH (NOLOCK) WHERE ORDERID = @ORDERID
                `);
        }
    }

    static async registrarFallas(orderId: string, fallas: { codarticulo: number; descripcion: string; cantPedida: number; stockDisponible: number }[]): Promise<void> {
        if (!fallas.length) return;
        const pool = await connectDb();
        await pool.request()
            .input('OID_DEL', mssql.VarChar(50), orderId)
            .query(`DELETE FROM ${esquema}.APP_PEDIDO_FALLAS WHERE ORDERID = @OID_DEL`);
        const tabla = new mssql.Table(`${esquema}.APP_PEDIDO_FALLAS`);
        tabla.create = false;
        tabla.columns.add('ORDERID',          mssql.NVarChar(50),  { nullable: false });
        tabla.columns.add('CODARTICULO',      mssql.Int,            { nullable: false });
        tabla.columns.add('DESCRIPCION',      mssql.NVarChar(255),  { nullable: true  });
        tabla.columns.add('CANT_PEDIDA',      mssql.Int,            { nullable: false });
        tabla.columns.add('STOCK_DISPONIBLE', mssql.Int,            { nullable: false });
        for (const f of fallas) {
            tabla.rows.add(orderId, f.codarticulo, f.descripcion ?? null, f.cantPedida, f.stockDisponible);
        }
        await pool.request().bulk(tabla);
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

            const lineasSan = await pool.request()
                .input('OID_SAN', mssql.VarChar(50), orderId)
                .query(`SELECT CODARTICULO, PRODUCTCOUNT AS CANTIDAD FROM ${esquema}.LINEA_PED WITH (NOLOCK) WHERE ORDERID = @OID_SAN`);
            const lineasCheckSan = lineasSan.recordset.map((r: any) => ({ codarticulo: Number(r.CODARTICULO), cantidad: Number(r.CANTIDAD) }));
            const { insuficiente: insufSan } = await PedidosServices.checkStockLineas(lineasCheckSan, orderId);
            if (insufSan.length > 0) {
                const detalle = insufSan.map(i => `${i.descripcion} (pedido: ${i.cantidad_pedida}, disponible: ${i.disponible})`).join('; ');
                return { success: false, message: `Stock insuficiente para: ${detalle}` };
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