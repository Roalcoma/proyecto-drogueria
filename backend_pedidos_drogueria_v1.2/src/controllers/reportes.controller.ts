import { Request, Response } from 'express';
import { ReportesService } from '../services/reportes.service';

export class ReportesController {
    static async getProveedores(_req: Request, res: Response): Promise<void> {
        try {
            const data = await ReportesService.getProveedores();
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: String(error) });
        }
    }

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

    static async getFallas(req: Request, res: Response): Promise<void> {
        const { desde, hasta } = req.query;
        if (!desde || !hasta) {
            res.status(400).json({ success: false, message: 'Parámetros desde y hasta son requeridos' });
            return;
        }
        try {
            const data = await ReportesService.getFallas(String(desde), String(hasta));
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: String(error) });
        }
    }

    static async getCobros(req: Request, res: Response): Promise<void> {
        const { desde, hasta } = req.query;
        if (!desde || !hasta) {
            res.status(400).json({ success: false, message: 'Parámetros desde y hasta son requeridos' });
            return;
        }
        try {
            const data = await ReportesService.getCobros(String(desde), String(hasta));
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: String(error) });
        }
    }

    static async getTransferencias(req: Request, res: Response): Promise<void> {
        const { desde, hasta, codarticulo, codproveedor, codusuario } = req.query;
        if (!desde || !hasta) {
            res.status(400).json({ success: false, message: 'Parámetros desde y hasta son requeridos' });
            return;
        }
        try {
            const data = await ReportesService.getTransferencias(
                String(desde), String(hasta),
                Number(codarticulo  || 0),
                Number(codproveedor || 0),
                Number(codusuario   || 0)
            );
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: String(error) });
        }
    }
}
