import { Router } from 'express';
import { SepedController } from '../controllers/seped.controller';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware, adminMiddleware);

router.get  ('/config',    SepedController.getConfig);
router.put  ('/config',    SepedController.saveConfig);
router.post ('/ciclo',     SepedController.ejecutarCiclo);
router.get  ('/auditoria', SepedController.getAuditoria);
router.get  ('/estado',    SepedController.getEstado);
router.get  ('/logs',      SepedController.streamLogs);

export default router;
