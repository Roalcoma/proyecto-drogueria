import { Request, Response } from 'express';
import { FacturasService } from '../services/facturas.service';

export class FacturasControllers {

    static async getConfig(req: Request, res: Response) {
        return res.json(FacturasService.getConfig());
    }

    static async setConfig(req: Request, res: Response) {
        const { rutaSalida } = req.body;
        return res.json(FacturasService.setConfig({ rutaSalida }));
    }

    static async guardarPDF(req: Request, res: Response) {
        try {
            const { numserie, numfactura, pdfBase64 } = req.body;
            if (!numserie || !numfactura || !pdfBase64)
                return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
            return res.json(FacturasService.guardarPDF(numserie, Number(numfactura), pdfBase64));
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error al guardar PDF' });
        }
    }

    static async getFacturas(req: Request, res: Response) {
        try {
            const { serie, desde, hasta, cliente, ruta, page, limit } = req.query;
            const result = await FacturasService.getFacturas({
                serie:   serie   as string | undefined,
                desde:   desde   ? Number(desde)  : undefined,
                hasta:   hasta   ? Number(hasta)  : undefined,
                cliente: cliente as string | undefined,
                ruta:    ruta    as string | undefined,
                page:    page    ? Number(page)   : 1,
                limit:   limit   ? Number(limit)  : 100,
            });
            return res.json(result);
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error al obtener facturas' });
        }
    }

    static async getFacturaDetalle(req: Request, res: Response) {
        try {
            const { numserie, numfactura } = req.query;
            if (!numserie || !numfactura)
                return res.status(400).json({ success: false, message: 'numserie y numfactura requeridos' });
            const result = await FacturasService.getFacturaDetalle(numserie as string, Number(numfactura));
            return res.status(result.success ? 200 : 404).json(result);
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error al obtener detalle de factura' });
        }
    }

    static async asignarNoControl(req: Request, res: Response) {
        try {
            const { facturas, desdeNoControl } = req.body;
            if (!Array.isArray(facturas) || !desdeNoControl)
                return res.status(400).json({ success: false, message: 'facturas[] y desdeNoControl requeridos' });
            const result = await FacturasService.asignarNoControl(facturas, String(desdeNoControl));
            return res.status(result.success ? 200 : 400).json(result);
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error al asignar NOCONTROL' });
        }
    }

    static async getSeries(req: Request, res: Response) {
        try {
            return res.json(await FacturasService.getSeries());
        } catch {
            return res.status(500).json({ success: false, message: 'Error al obtener series' });
        }
    }

    static async getRutas(req: Request, res: Response) {
        try {
            return res.json(await FacturasService.getRutas());
        } catch {
            return res.status(500).json({ success: false, message: 'Error al obtener rutas' });
        }
    }
}
