import { Response } from 'express';
import { RequestConUsuario } from '../middleware/auth.middleware';
import { PromoEspecialService } from '../services/promoEspecial.service';
import { AuditService } from '../services/audit.service';

const ENTIDAD = 'PROMO_ESPECIAL';

const uid  = (req: RequestConUsuario) => req.usuario?.id   ?? null;
const usr  = (req: RequestConUsuario) => req.usuario?.usuario ?? null;

export class PromoEspecialController {

    static async getAll(req: RequestConUsuario, res: Response): Promise<void> {
        try {
            res.json({ success: true, data: await PromoEspecialService.getAll() });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    static async getVigentes(_req: RequestConUsuario, res: Response): Promise<void> {
        try {
            res.json({ success: true, data: await PromoEspecialService.getVigentes() });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    static async create(req: RequestConUsuario, res: Response): Promise<void> {
        try {
            const id = await PromoEspecialService.create(req.body);
            await AuditService.log(ENTIDAD, 'CREAR', id, req.body.nombre ?? '', uid(req), usr(req), req.body);
            res.json({ success: true, id });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    static async update(req: RequestConUsuario, res: Response): Promise<void> {
        try {
            const id = parseInt(String(req.params['id']));
            const antes = await PromoEspecialService.getById(id);
            await PromoEspecialService.update(id, req.body);
            await AuditService.log(ENTIDAD, 'ACTUALIZAR', id, req.body.nombre ?? String(id), uid(req), usr(req),
                { antes, despues: req.body });
            res.json({ success: true });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }

    static async remove(req: RequestConUsuario, res: Response): Promise<void> {
        try {
            const id = parseInt(String(req.params['id']));
            const antes = await PromoEspecialService.getById(id);
            await PromoEspecialService.remove(id);
            await AuditService.log(ENTIDAD, 'ELIMINAR', id, antes?.NOMBRE ?? String(id), uid(req), usr(req), { antes });
            res.json({ success: true });
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message });
        }
    }
}
