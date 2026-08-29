import { Request, Response } from 'express';
import { RequestConUsuario } from '../middleware/auth.middleware';
import { RechequeoService } from '../services/rechequeo.service';

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
        const { idcab, codarticulo, unidades } = req.body;
        if (!idcab || !codarticulo || unidades == null) {
            res.status(400).json({ success: false, message: 'Faltan parámetros' });
            return;
        }
        try {
            await RechequeoService.upsertDetalle(parseInt(idcab), codarticulo, Number(unidades));
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
