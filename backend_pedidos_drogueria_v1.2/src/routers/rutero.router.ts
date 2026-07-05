import { Router } from 'express';
import { RuteroController } from '../controllers/rutero.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const ruteroRouter = Router();

ruteroRouter.get('/zonas',            authMiddleware, RuteroController.getZonas);
ruteroRouter.get('/facturas',         authMiddleware, RuteroController.getFacturas);
ruteroRouter.put('/marcar-entregado', authMiddleware, RuteroController.marcarEntregado);

export default ruteroRouter;
