import { Request, Response } from 'express';
import { mssql, connectDb } from '../db/db.conection';
import { getDbConfig } from '../services/dbconfig.service';
import { AuditService } from '../services/audit.service';
import { RequestConUsuario } from '../middleware/auth.middleware';

const uid = (req: RequestConUsuario) => (req as any).usuario?.id     ?? null;
const usr = (req: RequestConUsuario) => (req as any).usuario?.usuario ?? null;

const ESQ = 'dbo';

export class DescuentoArticuloController {

    static async getArticulos(req: Request, res: Response): Promise<void> {
        const page      = Math.max(1, parseInt(req.query['page']  as string) || 1);
        const limit     = Math.min(200, Math.max(1, parseInt(req.query['limit'] as string) || 50));
        const offset    = (page - 1) * limit;
        const buscar    = (req.query['buscar']    as string || '').trim();
        const proveedor = (req.query['proveedor'] as string || '').trim();
        const soloCon   = req.query['soloCon']   === '1';
        const soloStock = req.query['soloStock'] === '1';

        // M5: separar búsqueda numérica — permite index seek en CODARTICULO sin CAST
        const buscarNumero = buscar && /^\d+$/.test(buscar) ? parseInt(buscar) : null;

        const conditions: string[] = [];
        if (buscar) {
            if (buscarNumero !== null) {
                conditions.push("(A.CODARTICULO = @COD_NUM OR A.DESCRIPCION LIKE @BUSCAR)");
            } else {
                conditions.push("A.DESCRIPCION LIKE @BUSCAR");
            }
        }
        if (proveedor) conditions.push("PR.NOMPROVEEDOR LIKE @PROV");
        if (soloCon)   conditions.push("ISNULL(ACL.DTOARTICULO, 0) > 0");
        if (soloStock) conditions.push("ISNULL(ST.STOCK, 0) > 0");
        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

        try {
            const { tarifaBaseCatalogo, codAlmacen } = getDbConfig();
            const pool = await connectDb();

            const buildR = () => {
                const r = pool.request()
                    .input('TARIFA',  mssql.Int,         tarifaBaseCatalogo)
                    .input('ALMACEN', mssql.VarChar(10), codAlmacen);
                if (buscar)               r.input('BUSCAR',   mssql.NVarChar(200), `%${buscar}%`);
                if (buscarNumero !== null) r.input('COD_NUM',  mssql.Int, buscarNumero);
                if (proveedor)            r.input('PROV',     mssql.NVarChar(200), `%${proveedor}%`);
                return r;
            };

            const stockJoin = `LEFT JOIN (
                SELECT CODARTICULO, SUM(STOCK) AS STOCK
                FROM ${ESQ}.STOCKS WITH(NOLOCK) WHERE CODALMACEN = @ALMACEN
                GROUP BY CODARTICULO
            ) ST ON ST.CODARTICULO = A.CODARTICULO`;

            const joins = `
                LEFT JOIN ${ESQ}.ARTICULOSCAMPOSLIBRES ACL WITH(NOLOCK) ON ACL.CODARTICULO = A.CODARTICULO
                LEFT JOIN ${ESQ}.PRECIOSVENTA PV WITH(NOLOCK)
                    ON PV.CODARTICULO = A.CODARTICULO AND PV.IDTARIFAV = @TARIFA AND PV.COLOR = '.' AND PV.TALLA = '.'
                LEFT JOIN ${ESQ}.PROVEEDORES PR WITH(NOLOCK) ON PR.CODPROVEEDOR = ACL.CODPROVEEDORICG
                ${stockJoin}`;

            // M4: COUNT con JOINs mínimos — solo los que participan en condiciones activas
            const countJoins: string[] = [
                `LEFT JOIN ${ESQ}.ARTICULOSCAMPOSLIBRES ACL WITH(NOLOCK) ON ACL.CODARTICULO = A.CODARTICULO`
            ];
            if (proveedor) countJoins.push(`LEFT JOIN ${ESQ}.PROVEEDORES PR WITH(NOLOCK) ON PR.CODPROVEEDOR = ACL.CODPROVEEDORICG`);
            if (soloStock) countJoins.push(stockJoin);

            const [dataRes, countRes] = await Promise.all([
                buildR()
                    .input('OFFSET', mssql.Int, offset)
                    .input('LIMIT',  mssql.Int, limit)
                    .query(`
                        SELECT A.CODARTICULO,
                               A.DESCRIPCION,
                               ISNULL(PR.NOMPROVEEDOR, '') AS PROVEEDOR,
                               ISNULL(ACL.DTOARTICULO, 0) AS DTOARTICULO,
                               ISNULL(PV.PNETO, 0)        AS PRECIO,
                               CAST(ISNULL(PV.PNETO, 0) * (1.0 - ISNULL(ACL.DTOARTICULO, 0) / 100.0) AS DECIMAL(18,2)) AS PRECIO_FINAL,
                               ISNULL(ST.STOCK, 0)        AS STOCK
                        FROM ${ESQ}.ARTICULOS A WITH(NOLOCK)
                        ${joins}
                        ${where}
                        ORDER BY A.DESCRIPCION
                        OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
                    `),
                buildR().query(`
                    SELECT COUNT(*) AS TOTAL
                    FROM ${ESQ}.ARTICULOS A WITH(NOLOCK)
                    ${countJoins.join('\n')}
                    ${where}
                `),
            ]);

            res.json({ success: true, data: dataRes.recordset, total: countRes.recordset[0].TOTAL });
        } catch (e: any) {
            console.error('[descuento-articulo] getArticulos:', e);
            // A3: no exponer detalles internos de MSSQL al cliente
            res.status(500).json({ success: false, message: 'Error al obtener artículos' });
        }
    }

    static async updateDescuento(req: RequestConUsuario, res: Response): Promise<void> {
        const codarticulo = parseInt(req.params['codarticulo'] as string);
        const dto = Number(req.body.dtoArticulo ?? 0);

        // A1: isNaN(dto) — campo vacío produce NaN que pasaba la validación de rango
        // M3: Number.isInteger — columna DTOARTICULO es INT en BD, rechazar decimales
        if (isNaN(codarticulo) || isNaN(dto) || !Number.isInteger(dto) || dto < 0 || dto > 100) {
            res.status(400).json({ success: false, message: 'El descuento debe ser un número entero entre 0 y 100' });
            return;
        }

        try {
            const pool = await connectDb();

            // Leer valor anterior para auditoría
            const anterior = await pool.request()
                .input('COD', mssql.Int, codarticulo)
                .query(`SELECT ISNULL(ACL.DTOARTICULO, 0) AS DTO_ANTES, A.DESCRIPCION
                        FROM ${ESQ}.ARTICULOS A WITH(NOLOCK)
                        LEFT JOIN ${ESQ}.ARTICULOSCAMPOSLIBRES ACL WITH(NOLOCK) ON ACL.CODARTICULO = A.CODARTICULO
                        WHERE A.CODARTICULO = @COD`);
            const dtaAntes = anterior.recordset[0]?.DTO_ANTES ?? 0;
            const descripcion: string = anterior.recordset[0]?.DESCRIPCION ?? String(codarticulo);

            // M2: MERGE atómico con HOLDLOCK — previene race condition en INSERT concurrente
            await pool.request()
                .input('COD', mssql.Int, codarticulo)
                .input('DTO', mssql.Int, dto)
                .query(`
                    MERGE ${ESQ}.ARTICULOSCAMPOSLIBRES WITH(HOLDLOCK) AS target
                    USING (SELECT @COD AS CODARTICULO, @DTO AS DTOARTICULO) AS src
                      ON target.CODARTICULO = src.CODARTICULO
                    WHEN MATCHED THEN
                      UPDATE SET DTOARTICULO = src.DTOARTICULO
                    WHEN NOT MATCHED THEN
                      INSERT (CODARTICULO, DTOARTICULO) VALUES (src.CODARTICULO, src.DTOARTICULO);
                `);

            await AuditService.log(
                'DESCUENTO_ARTICULO', 'ACTUALIZAR',
                codarticulo, descripcion,
                uid(req), usr(req),
                { dto_antes: dtaAntes, dto_despues: dto }
            );

            res.json({ success: true });
        } catch (e: any) {
            console.error('[descuento-articulo] updateDescuento:', e);
            // A3: no exponer detalles internos al cliente
            res.status(500).json({ success: false, message: 'Error al guardar descuento' });
        }
    }
}
