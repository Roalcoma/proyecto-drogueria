import { Request, Response } from 'express';
import mssql from 'mssql';
import { RequestConUsuario } from '../middleware/auth.middleware';
import { RechequeoService } from '../services/rechequeo.service';
import { connectDb } from '../db/db.conection';

const ESQ = process.env.DB_ESQUEMA || 'dbo';

export class RechequeoController {

    static async getPedidosDisponibles(_req: Request, res: Response): Promise<void> {
        try {
            const data = await RechequeoService.getPedidosDisponibles();
            res.json({ success: true, data });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    static async getMisPedidos(req: RequestConUsuario, res: Response): Promise<void> {
        try {
            const usuario = req.usuario?.usuario ?? '';
            const data = await RechequeoService.getMisPedidos(usuario);
            res.json({ success: true, data });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    static async getDetallePedido(req: Request, res: Response): Promise<void> {
        const numserie  = req.params['numserie']  as string;
        const numpedido = req.params['numpedido'] as string;
        const n         = req.params['n']         as string;
        try {
            const [lineas, cabeceras] = await Promise.all([
                RechequeoService.getDetallePedido(numserie, parseInt(numpedido), n),
                RechequeoService.getCabeceras(numserie, parseInt(numpedido), n),
            ]);
            res.json({ success: true, lineas, cabeceras });
        } catch (err: any) {
            console.error('[Rechequeo] getDetallePedido:', err.message);
            res.status(500).json({ success: false, message: err.message });
        }
    }

    static async tomarConteo(req: RequestConUsuario, res: Response): Promise<void> {
        const { numserie, numpedido, n, idfactura } = req.body;
        if (!numserie || !numpedido || !n || !idfactura?.trim()) {
            res.status(400).json({ success: false, message: 'Faltan parámetros' });
            return;
        }
        try {
            const id = await RechequeoService.tomarConteo(
                numserie, parseInt(numpedido), n, idfactura.trim(),
                req.usuario?.id ?? null, req.usuario?.usuario ?? 'desconocido'
            );
            res.json({ success: true, id });
        } catch (err: any) {
            res.status(409).json({ success: false, message: err.message });
        }
    }

    static async guardarConteo(req: Request, res: Response): Promise<void> {
        const { idcab, codarticulo, unidades, lote, fechaVencimiento } = req.body;
        if (!idcab || !codarticulo || unidades == null) {
            res.status(400).json({ success: false, message: 'Faltan parámetros' });
            return;
        }
        try {
            await RechequeoService.upsertDetalle(
                parseInt(idcab), codarticulo, Number(unidades),
                lote?.trim() || undefined,
                fechaVencimiento || undefined
            );
            res.json({ success: true });
        } catch (err: any) {
            console.error('[Rechequeo] guardarConteo:', err.message);
            res.status(500).json({ success: false, message: err.message });
        }
    }

    static async getDetallesCabecera(req: Request, res: Response): Promise<void> {
        const idcab = parseInt(req.params['idcab'] as string ?? '0');
        try {
            const data = await RechequeoService.getDetallesCabecera(idcab);
            res.json({ success: true, data });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    // ── Albaranes de Compra ───────────────────────────────────────────────────

    static async getAlbaranes(req: Request, res: Response): Promise<void> {
        const page  = Math.max(1, parseInt(req.query['page']  as string) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query['limit'] as string) || 50));
        const offset = (page - 1) * limit;
        const { desde, hasta, proveedor, estatus, numalbaran } = req.query as Record<string, string>;

        const conditions: string[] = ["CAB.NUMSERIE = 'ZACA'"];
        if (desde)      conditions.push("CONVERT(DATE, CAB.FECHAALBARAN) >= @DESDE");
        if (hasta)      conditions.push("CONVERT(DATE, CAB.FECHAALBARAN) <= @HASTA");
        if (proveedor)  conditions.push("P.NOMPROVEEDOR LIKE @PROV");
        if (estatus)    conditions.push("CAST(CAB.IDESTADO AS VARCHAR(50)) = @ESTATUS");
        if (numalbaran) conditions.push("CAB.NUMALBARAN = @NUMALBARAN");
        const where = 'WHERE ' + conditions.join(' AND ');

        const buildReq = async () => {
            const pool = await connectDb();
            const r = pool.request();
            if (desde)      r.input('DESDE',     mssql.VarChar(10),   desde);
            if (hasta)      r.input('HASTA',     mssql.VarChar(10),   hasta);
            if (proveedor)  r.input('PROV',      mssql.NVarChar(100), `%${proveedor}%`);
            if (estatus)    r.input('ESTATUS',   mssql.NVarChar(50),  estatus);
            if (numalbaran) r.input('NUMALBARAN', mssql.Int,           parseInt(numalbaran));
            return r;
        };

        try {
            const r1 = await buildReq();
            r1.input('OFFSET', mssql.Int, offset).input('LIMIT', mssql.Int, limit);
            const data = await r1.query(`
                SELECT CAB.NUMSERIE, CAB.NUMALBARAN,
                    CAST(CAB.IDESTADO AS VARCHAR(10)) AS ESTATUS,
                    ISNULL(CONVERT(VARCHAR(10), CAB.FECHAALBARAN, 23), '') AS FECHA,
                    ISNULL(CAB.CODPROVEEDOR, 0) AS CODPROVEEDOR,
                    ISNULL(P.NOMPROVEEDOR, '') AS NOMPROVEEDOR,
                    ISNULL(CAB.TOTALNETO, 0) AS TOTAL
                FROM ${ESQ}.ALBCOMPRACAB CAB WITH(NOLOCK)
                LEFT JOIN ${ESQ}.PROVEEDORES P WITH(NOLOCK) ON P.CODPROVEEDOR = CAB.CODPROVEEDOR
                ${where}
                ORDER BY CAB.FECHAALBARAN DESC, CAB.NUMALBARAN DESC
                OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
            `);

            const r2 = await buildReq();
            const count = await r2.query(`
                SELECT COUNT(*) AS TOTAL
                FROM ${ESQ}.ALBCOMPRACAB CAB WITH(NOLOCK)
                LEFT JOIN ${ESQ}.PROVEEDORES P WITH(NOLOCK) ON P.CODPROVEEDOR = CAB.CODPROVEEDOR
                ${where}
            `);

            res.json({ success: true, data: data.recordset, total: count.recordset[0].TOTAL });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    static async getAlbaran(req: Request, res: Response): Promise<void> {
        const { numserie, numalbaran } = req.params as Record<string, string>;
        try {
            const pool = await connectDb();
            const [cabRes, linRes] = await Promise.all([
                pool.request()
                    .input('NUMSERIE',   mssql.NVarChar(10), numserie)
                    .input('NUMALBARAN', mssql.Int, parseInt(numalbaran))
                    .query(`
                        SELECT CAB.NUMSERIE, CAB.NUMALBARAN,
                            CAST(CAB.IDESTADO AS VARCHAR(10)) AS ESTATUS,
                            ISNULL(CONVERT(VARCHAR(10), CAB.FECHAALBARAN,   23), '') AS FECHA,
                            ISNULL(CONVERT(VARCHAR(10), CAB.FECHAMODIFICADO, 23), '') AS FECHAACTUALIZADO,
                            ISNULL(CONVERT(VARCHAR(10), CAB.FECHAENTRADA,    23), '') AS FECHAVENCIMIENTO,
                            ISNULL(CAB.CODPROVEEDOR, 0) AS CODPROVEEDOR,
                            ISNULL(P.NOMPROVEEDOR, '') AS NOMPROVEEDOR,
                            ISNULL(
                                (SELECT TOP 1 RTRIM(L.CODALMACEN)
                                 FROM ${ESQ}.ALBCOMPRALIN L WITH(NOLOCK)
                                 WHERE L.NUMSERIE=CAB.NUMSERIE AND L.NUMALBARAN=CAB.NUMALBARAN
                                   AND L.CODALMACEN IS NOT NULL AND L.CODALMACEN <> ''), ''
                            ) AS CODALMACEN,
                            '' AS OBSERVACION,
                            ISNULL(CAB.NBULTOS, 0) AS PESONETO,
                            ISNULL(
                                (SELECT SUM(L.UNID1)
                                 FROM ${ESQ}.ALBCOMPRALIN L WITH(NOLOCK)
                                 WHERE L.NUMSERIE=CAB.NUMSERIE AND L.NUMALBARAN=CAB.NUMALBARAN
                                   AND L.UNID1 > 0), 0
                            ) AS UNIDADES,
                            ISNULL(CAB.FACTORMONEDA, 0) AS TASA,
                            ISNULL(CAB.NBULTOS, 0) AS TASAUNIDADES,
                            ISNULL(CAB.TOTALBRUTO,     0) AS BASEIMPONIBLE,
                            ISNULL(CAB.TOTALIMPUESTOS, 0) AS TOTALIVA,
                            ISNULL(CAB.TOTALNETO,      0) AS TOTAL,
                            ISNULL(CAB.TOTALBRUTO - CAB.TOTALBRUTO, 0) AS EXENTO,
                            0  AS RETIVA,
                            0  AS ISLR,
                            ISNULL(CAB.TOTALNETO,    0) AS NETOCXP,
                            ISNULL(CAB.DTOCOMERCIAL, 0) AS DTOCOMERCIAL,
                            CAST(DBO.F_GET_COTIZACION(GETDATE(), 1) AS DECIMAL(18,4)) AS COTIZACION
                        FROM ${ESQ}.ALBCOMPRACAB CAB WITH(NOLOCK)
                        LEFT JOIN ${ESQ}.PROVEEDORES P WITH(NOLOCK) ON P.CODPROVEEDOR = CAB.CODPROVEEDOR
                        WHERE CAB.NUMSERIE = @NUMSERIE AND CAB.NUMALBARAN = @NUMALBARAN
                    `),
                pool.request()
                    .input('NUMSERIE',   mssql.NVarChar(10), numserie)
                    .input('NUMALBARAN', mssql.Int, parseInt(numalbaran))
                    .query(`
                        SELECT
                            ACL.CODARTICULO,
                            ACL.DESCRIPCION,
                            ISNULL(PV.PNETO, 0) AS PVENTA,
                            ISNULL(ARL.CODBARRAS, '') AS LOTE,
                            ISNULL(ARL.GARANTIACOMPRA, '') AS FECHAVENCE,
                            ACL.UNIDADESTOTAL AS CANTIDAD,
                            ISNULL(ROUND(
                                ((PV.PNETO - RIP.F_GET_COTIZACION_RIP(ACL.PRECIO, ACC.FECHAALBARAN, ACC.FACTORMONEDA, ACC.CODMONEDA, 2)) / CASE WHEN ISNULL(PV.PNETO, 0) = 0 THEN 1 ELSE ISNULL(PV.PNETO, 1) END) * 100
                            , 2), 0) AS MARGEN,
                            RIP.F_GET_COTIZACION_RIP(ACL.PRECIO, ACC.FECHAALBARAN, ACC.FACTORMONEDA, ACC.CODMONEDA, 2) AS COSTO,
                            RIP.F_GET_COTIZACION_RIP(ACL.TOTAL,  ACC.FECHAALBARAN, ACC.FACTORMONEDA, ACC.CODMONEDA, 2) AS IMPORTE
                        FROM ${ESQ}.ALBCOMPRACAB ACC WITH(NOLOCK)
                        INNER JOIN ${ESQ}.ALBCOMPRALIN ACL WITH(NOLOCK)
                            ON ACC.NUMSERIE = ACL.NUMSERIE AND ACC.NUMALBARAN = ACL.NUMALBARAN AND ACC.N = ACL.N
                        LEFT JOIN ${ESQ}.ARTICULOSLIN ARL WITH(NOLOCK)
                            ON ARL.CODARTICULO = ACL.CODARTICULO AND ARL.COLOR = ACL.COLOR AND ARL.TALLA = ACL.TALLA
                        LEFT JOIN ${ESQ}.PRECIOSVENTA PV WITH(NOLOCK)
                            ON PV.CODARTICULO = ACL.CODARTICULO AND PV.COLOR = '.' AND PV.TALLA = '.' AND PV.IDTARIFAV = 1
                        WHERE ACC.NUMSERIE = @NUMSERIE AND ACC.NUMALBARAN = @NUMALBARAN
                          AND ACL.UNIDADESTOTAL > 0
                        ORDER BY ACL.NUMLIN
                    `),
            ]);

            if (!cabRes.recordset.length) {
                res.status(404).json({ success: false, message: 'Albarán no encontrado' });
                return;
            }
            res.json({ success: true, cabecera: cabRes.recordset[0], lineas: linRes.recordset });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    static async getPedidosCerrados(_req: Request, res: Response): Promise<void> {
        try {
            const data = await RechequeoService.getPedidosCerrados();
            res.json({ success: true, data });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    static async getDetalleCerrado(req: Request, res: Response): Promise<void> {
        const idcab = parseInt(req.params['idcab'] as string ?? '0');
        try {
            const data = await RechequeoService.getDetalleCerrado(idcab);
            res.json({ success: true, data });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    static async cerrarConteo(req: RequestConUsuario, res: Response): Promise<void> {
        const { numserie, numpedido, n } = req.body;
        if (!numserie || numpedido == null || !n) {
            res.status(400).json({ success: false, message: 'Faltan parámetros' });
            return;
        }
        const usuario = req.usuario?.usuario ?? '';
        try {
            await RechequeoService.cerrarConteo(numserie, parseInt(numpedido), n, usuario);
            res.json({ success: true });
        } catch (err: any) {
            console.error('[Rechequeo] cerrarConteo:', err.message);
            res.status(500).json({ success: false, message: err.message });
        }
    }
}
