import { Router, Request, Response } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';

const auditRouter = Router();

auditRouter.get('/promos', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const page   = Number(req.query['page'])    || 1;
        const limit  = Number(req.query['limit'])   || 25;
        const entidad = req.query['entidad'] as string | undefined;
        const result = await AuditService.getAll({ entidad, page, limit });
        res.json({ success: true, ...result });
    } catch (e: any) {
        res.status(500).json({ success: false, message: e.message });
    }
});

export default auditRouter;
