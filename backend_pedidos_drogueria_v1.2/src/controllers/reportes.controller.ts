import { Request, Response } from 'express';
import { ReportesService } from '../services/reportes.service';

export class ReportesController {
    static async getTopClientesPorVendedor(req: Request, res: Response): Promise<void> {
        const { desde, hasta, codcliente } = req.query;
        if (!desde || !hasta) {
            res.status(400).json({ success: false, message: 'Parámetros desde y hasta son requeridos' });
            return;
        }
        try {
            const data = await ReportesService.getTopClientesPorVendedor(
                String(desde), String(hasta), Number(codcliente || 0)
            );
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: String(error) });
        }
    }

    static async getComisionesCobranzas(req: Request, res: Response): Promise<void> {
        const { desde, hasta, comision } = req.query;
        if (!desde || !hasta) {
            res.status(400).json({ success: false, message: 'Parámetros desde y hasta son requeridos' });
            return;
        }
        try {
            const data = await ReportesService.getComisionesCobranzas(
                String(desde), String(hasta), Number(comision ?? 1.0)
            );
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: String(error) });
        }
    }

    static async getTransferencias(req: Request, res: Response): Promise<void> {
        const { desde, hasta, codarticulo } = req.query;
        if (!desde || !hasta) {
            res.status(400).json({ success: false, message: 'Parámetros desde y hasta son requeridos' });
            return;
        }
        try {
            const data = await ReportesService.getTransferencias(
                String(desde), String(hasta), Number(codarticulo || 0)
            );
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: String(error) });
        }
    }
}
