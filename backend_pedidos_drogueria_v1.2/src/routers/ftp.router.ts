import { Router } from 'express';
import { FtpController } from '../controllers/ftp.controller';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware';

const ftpRouter = Router();

ftpRouter.use(authMiddleware);

ftpRouter.get('/config',     adminMiddleware, FtpController.getConfig);
ftpRouter.put('/config',     adminMiddleware, FtpController.setConfig);
ftpRouter.post('/escanear',  adminMiddleware, FtpController.escanear);
ftpRouter.get('/auditoria',  FtpController.getAuditoria);

export default ftpRouter;
