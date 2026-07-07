import { Router } from 'express';
import { FacturasControllers } from '../controllers/facturas.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const facturasRouter = Router();
facturasRouter.use(authMiddleware);

facturasRouter.get('/series',   FacturasControllers.getSeries);
facturasRouter.get('/rutas',    FacturasControllers.getRutas);
facturasRouter.get('/config',   FacturasControllers.getConfig);
facturasRouter.put('/config',   FacturasControllers.setConfig);
facturasRouter.post('/guardar-pdf', FacturasControllers.guardarPDF);
facturasRouter.get('/detalle',  FacturasControllers.getFacturaDetalle);
facturasRouter.put('/nocontrol', FacturasControllers.asignarNoControl);
facturasRouter.get('/',         FacturasControllers.getFacturas);

export default facturasRouter;
