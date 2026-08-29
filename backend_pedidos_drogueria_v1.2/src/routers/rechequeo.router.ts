import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { RechequeoController } from '../controllers/rechequeo.controller';

const rechequeoRouter = Router();

rechequeoRouter.get('/disponibles',                        authMiddleware, RechequeoController.getPedidosDisponibles);
rechequeoRouter.get('/mios',                               authMiddleware, RechequeoController.getMisPedidos);
rechequeoRouter.get('/pedidos/:numserie/:numpedido/:n',    authMiddleware, RechequeoController.getDetallePedido);
rechequeoRouter.get('/cabecera/:idcab/detalles',           authMiddleware, RechequeoController.getDetallesCabecera);
rechequeoRouter.post('/tomar',                             authMiddleware, RechequeoController.tomarConteo);
rechequeoRouter.post('/conteo',                            authMiddleware, RechequeoController.guardarConteo);
rechequeoRouter.post('/cerrar',                            authMiddleware, RechequeoController.cerrarConteo);
rechequeoRouter.get('/cerrados',                           authMiddleware, RechequeoController.getPedidosCerrados);
rechequeoRouter.get('/cerrados/:idcab/detalle',            authMiddleware, RechequeoController.getDetalleCerrado);

export default rechequeoRouter;
