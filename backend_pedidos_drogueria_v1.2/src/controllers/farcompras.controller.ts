import { Request, Response } from 'express';
import { FarcomprasService } from '../services/farcompras.service';

export class FarcomprasController {
    static async getConfig(_req: Request, res: Response): Promise<void> {
        try {
            const data = await FarcomprasService.getConfig();
            res.json({ success: true, data, schedulerActivo: FarcomprasService.schedulerActivo() });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    static async saveConfig(req: Request, res: Response): Promise<void> {
        const { rutaBase, habilitado, intervaloSeg, usuarioFtp } = req.body;
        try {
            await FarcomprasService.saveConfig({
                rutaBase:     String(rutaBase     ?? ''),
                habilitado:   !!habilitado,
                intervaloSeg: Number(intervaloSeg ?? 300),
                usuarioFtp:   String(usuarioFtp   ?? ''),
            });
            res.json({ success: true, message: 'Configuración guardada', schedulerActivo: FarcomprasService.schedulerActivo() });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    static async ejecutarCiclo(_req: Request, res: Response): Promise<void> {
        try {
            const result = await FarcomprasService.triggerCiclo();
            res.json({ success: true, ...result });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    static async getAuditoria(req: Request, res: Response): Promise<void> {
        try {
            const limite = Math.min(500, parseInt((req.query['limite'] as string) ?? '100'));
            const data   = await FarcomprasService.getAuditoria(limite);
            res.json({ success: true, data });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    static getEstado(_req: Request, res: Response): void {
        res.json({ success: true, schedulerActivo: FarcomprasService.schedulerActivo() });
    }
}
