import { Router } from "express";
import { PedidosControllers } from "../controllers/pedidos.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const pedidosRouter = Router()

pedidosRouter.post('/reservar-numero', PedidosControllers.reservarNumero)

pedidosRouter.post('/', authMiddleware, PedidosControllers.postPedidos)

pedidosRouter.get('/', PedidosControllers.getPedidos)

pedidosRouter.put('/', authMiddleware, PedidosControllers.updatePedido)

pedidosRouter.delete('/', authMiddleware, PedidosControllers.deletePedido)

pedidosRouter.put('/status', authMiddleware, PedidosControllers.updatePedidoStatus)

pedidosRouter.put('/aprobar-psicotropico', authMiddleware, PedidosControllers.aprobarPsicotropico)
pedidosRouter.put('/marcar-sanidad',        authMiddleware, PedidosControllers.marcarSanidad)

pedidosRouter.put('/codigo-aprobacion', authMiddleware, PedidosControllers.actualizarCodigoAprobacion)

pedidosRouter.post('/check-stock-lineas', authMiddleware, PedidosControllers.checkStockLineas)

pedidosRouter.get('/conteo', PedidosControllers.getConteo)

pedidosRouter.get('/auditoria', authMiddleware, PedidosControllers.getAuditoria)

pedidosRouter.post('/fusionar', authMiddleware, PedidosControllers.fusionarPedidos)

pedidosRouter.get('/:orderId/anomalias',    authMiddleware, PedidosControllers.getAnomaliasPedido)
pedidosRouter.get('/:orderId/diferencias', authMiddleware, PedidosControllers.getDiferenciasPedido)
pedidosRouter.post('/:orderId/fallas',     authMiddleware, PedidosControllers.guardarFallas)

export default pedidosRouter