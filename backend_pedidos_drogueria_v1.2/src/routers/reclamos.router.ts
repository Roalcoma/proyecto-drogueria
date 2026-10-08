import { Router } from "express";
import { ReclamosController } from "../controllers/reclamos.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const reclamosRouter = Router();
reclamosRouter.use(authMiddleware);

reclamosRouter.get('/',                         ReclamosController.getReclamos);
reclamosRouter.post('/',                        ReclamosController.crear);
reclamosRouter.get('/facturas/:codCliente',                           ReclamosController.getFacturasDeCliente);
reclamosRouter.get('/facturas/:numSerie/:numFactura/articulos',        ReclamosController.getArticulosDeFactura);
reclamosRouter.get('/:id',                                            ReclamosController.getById);

export default reclamosRouter;
