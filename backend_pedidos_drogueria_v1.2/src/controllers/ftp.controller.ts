import { Request, Response } from 'express';
import { FtpService } from '../services/ftp.service';

export class FtpController {

    static async getConfig(req: Request, res: Response): Promise<void> {
        const ruta = await FtpService.getConfig();
        res.json({ success: true, ruta });
    }

    static async setConfig(req: Request, res: Response): Promise<void> {
        const { ruta } = req.body;
        await FtpService.setConfig(String(ruta ?? ''));
        res.json({ success: true, message: 'Ruta FTP actualizada' });
    }

    static async escanear(_req: Request, res: Response): Promise<void> {
        const result = await FtpService.triggerEscaneo();
        res.json({ success: true, message: result.message });
    }

    static async getAuditoria(req: Request, res: Response): Promise<void> {
        const { search, page, limit } = req.query;
        const result = await FtpService.getAuditoria(
            (search as string) || '',
            Number(page) || 1,
            Number(limit) || 25
        );
        res.json({ success: true, ...result });
    }
}
