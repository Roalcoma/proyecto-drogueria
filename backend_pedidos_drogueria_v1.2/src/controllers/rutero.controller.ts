import { Request, Response } from 'express';
import { RuteroService } from '../services/rutero.service';

export class RuteroController {

    static async getZonas(_req: Request, res: Response): Promise<void> {
        try {
            const zonas = await RuteroService.getZonas();
            res.json({ success: true, data: zonas });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener zonas', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async getFacturas(req: Request, res: Response): Promise<void> {
        const zona = (req.query.zona as string || '').trim();
        if (!zona) { res.status(400).json({ success: false, message: 'zona requerida' }); return; }
        try {
            const data = await RuteroService.getFacturas(zona);
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener facturas', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async marcarEntregado(req: Request, res: Response): Promise<void> {
        const { numserie, numfactura, n } = req.body;
        if (!numserie || !numfactura) { res.status(400).json({ success: false, message: 'numserie y numfactura requeridos' }); return; }
        try {
            await RuteroService.marcarEntregado(String(numserie), Number(numfactura), Number(n ?? 1));
            res.json({ success: true, message: 'Factura marcada como entregada' });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al marcar entrega', error: error instanceof Error ? error.message : String(error) });
        }
    }
}
