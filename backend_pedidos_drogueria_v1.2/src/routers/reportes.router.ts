import { Router } from 'express';
import { ReportesController } from '../controllers/reportes.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const reportesRouter = Router();

reportesRouter.get('/top-clientes-por-vendedor', authMiddleware, ReportesController.getTopClientesPorVendedor);
reportesRouter.get('/transferencias',            authMiddleware, ReportesController.getTransferencias);
reportesRouter.get('/comisiones-cobranzas',      authMiddleware, ReportesController.getComisionesCobranzas);

export default reportesRouter;
