import { Request, Response } from 'express';
import { IComprasService } from '../services/icompras.service';

export class IComprasController {
    static async getConfig(_req: Request, res: Response): Promise<void> {
        try {
            const data = await IComprasService.getConfig();
            res.json({ success: true, data, schedulerActivo: IComprasService.schedulerActivo() });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    static async saveConfig(req: Request, res: Response): Promise<void> {
        const { urlBase, codisb, intervaloSeg, habilitado, rutaPedidos } = req.body;
        try {
            await IComprasService.saveConfig({
                urlBase:      String(urlBase      ?? ''),
                codisb:       String(codisb       ?? ''),
                intervaloSeg: Number(intervaloSeg  ?? 60),
                habilitado:   !!habilitado,
                rutaPedidos:  String(rutaPedidos  ?? ''),
            });
            res.json({ success: true, message: 'Configuración guardada', schedulerActivo: IComprasService.schedulerActivo() });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    static async ejecutarCiclo(_req: Request, res: Response): Promise<void> {
        try {
            const result = await IComprasService.ejecutarCiclo();
            res.json({ success: true, ...result });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    static async reprocesarPedido(req: Request, res: Response): Promise<void> {
        const { id } = req.body;
        if (!id) { res.status(400).json({ success: false, message: 'Falta el ID del pedido' }); return; }
        try {
            await IComprasService.reprocesarPedido(String(id));
            res.json({ success: true, message: `Pedido ${id} reprocesado` });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    static async getAuditoria(req: Request, res: Response): Promise<void> {
        try {
            const limite = Math.min(500, parseInt((req.query['limite'] as string) ?? '100'));
            const data   = await IComprasService.getAuditoria(limite);
            res.json({ success: true, data });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    static getEstado(_req: Request, res: Response): void {
        res.json({ success: true, schedulerActivo: IComprasService.schedulerActivo() });
    }
}
