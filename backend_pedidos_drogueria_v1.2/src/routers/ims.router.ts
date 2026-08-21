import { Router } from 'express';
import { ImsController } from '../controllers/ims.controller';
import { authMiddleware, imsMiddleware } from '../middleware/auth.middleware';

const imsRouter = Router();

imsRouter.get('/reporte', authMiddleware, imsMiddleware, ImsController.descargarReporte);

export default imsRouter;
