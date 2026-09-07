import { Router } from 'express';
import { ImsController } from '../controllers/ims.controller';
import { authMiddleware, imsMiddleware, adminMiddleware } from '../middleware/auth.middleware';

const imsRouter = Router();

imsRouter.get('/reporte',      authMiddleware, imsMiddleware,   ImsController.descargarReporte);
imsRouter.get('/auditoria',    authMiddleware, adminMiddleware, ImsController.getAuditoria);
imsRouter.get('/email-config', authMiddleware, adminMiddleware, ImsController.getEmailConfig);
imsRouter.post('/email-config',authMiddleware, adminMiddleware, ImsController.saveEmailConfig);
imsRouter.post('/email-enviar',authMiddleware, adminMiddleware, ImsController.enviarAhora);

export default imsRouter;
