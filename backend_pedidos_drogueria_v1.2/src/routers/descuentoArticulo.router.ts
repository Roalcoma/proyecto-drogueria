import { Router } from 'express';
import { DescuentoArticuloController } from '../controllers/descuentoArticulo.controller';
import { authMiddleware, requiereBits } from '../middleware/auth.middleware';

const descuentoArticuloRouter = Router();
descuentoArticuloRouter.use(authMiddleware);

descuentoArticuloRouter.get('/',                    DescuentoArticuloController.getArticulos);
descuentoArticuloRouter.patch('/:codarticulo',      requiereBits(1048576), DescuentoArticuloController.updateDescuento);

export default descuentoArticuloRouter;
