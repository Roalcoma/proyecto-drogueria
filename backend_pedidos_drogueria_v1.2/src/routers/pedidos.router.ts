import { Router } from "express";
import { PedidosControllers } from "../controllers/pedidos.controller";
import { authMiddleware, requiereBits, BITS } from "../middleware/auth.middleware";

const pedidosRouter = Router()

pedidosRouter.use(authMiddleware)

pedidosRouter.post('/reservar-numero', PedidosControllers.reservarNumero)

pedidosRouter.post('/', PedidosControllers.postPedidos)

pedidosRouter.get('/', PedidosControllers.getPedidos)

pedidosRouter.put('/', PedidosControllers.updatePedido)

pedidosRouter.delete('/', requiereBits(BITS.ESTATUS), PedidosControllers.deletePedido)

pedidosRouter.put('/status', PedidosControllers.updatePedidoStatus)

pedidosRouter.put('/aprobar-psicotropico', requiereBits(BITS.APROBACION_PSICO), PedidosControllers.aprobarPsicotropico)
pedidosRouter.put('/marcar-sanidad',        requiereBits(BITS.APROBACION_PSICO), PedidosControllers.marcarSanidad)

pedidosRouter.put('/codigo-aprobacion', requiereBits(BITS.APROBACION_PSICO), PedidosControllers.actualizarCodigoAprobacion)

pedidosRouter.post('/check-stock-lineas', PedidosControllers.checkStockLineas)

pedidosRouter.get('/conteo', PedidosControllers.getConteo)

pedidosRouter.get('/auditoria', PedidosControllers.getAuditoria)

pedidosRouter.post('/fusionar', requiereBits(BITS.ESTATUS), PedidosControllers.fusionarPedidos)

pedidosRouter.get('/:orderId/anomalias',    PedidosControllers.getAnomaliasPedido)
pedidosRouter.get('/:orderId/diferencias', PedidosControllers.getDiferenciasPedido)
pedidosRouter.get('/:orderId/faltantes',   PedidosControllers.getStockFaltantes)
pedidosRouter.post('/:orderId/fallas',     PedidosControllers.guardarFallas)

export default pedidosRouter
