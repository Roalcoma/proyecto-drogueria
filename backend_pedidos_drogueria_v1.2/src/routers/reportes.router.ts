import { Router } from 'express';
import { ReportesController } from '../controllers/reportes.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const reportesRouter = Router();

reportesRouter.get('/proveedores',               authMiddleware, ReportesController.getProveedores);
reportesRouter.get('/top-clientes-por-vendedor', authMiddleware, ReportesController.getTopClientesPorVendedor);
reportesRouter.get('/transferencias',            authMiddleware, ReportesController.getTransferencias);
reportesRouter.get('/cobros',                    authMiddleware, ReportesController.getCobros);
reportesRouter.get('/fallas',                    authMiddleware, ReportesController.getFallas);

export default reportesRouter;
