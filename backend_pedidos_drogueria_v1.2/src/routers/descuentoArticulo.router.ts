import { Router } from 'express';
import { DescuentoArticuloController } from '../controllers/descuentoArticulo.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const descuentoArticuloRouter = Router();
descuentoArticuloRouter.use(authMiddleware);

descuentoArticuloRouter.get('/',                    DescuentoArticuloController.getArticulos);
descuentoArticuloRouter.patch('/:codarticulo',      DescuentoArticuloController.updateDescuento);

export default descuentoArticuloRouter;
