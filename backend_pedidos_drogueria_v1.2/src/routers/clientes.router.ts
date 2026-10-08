import { Router } from "express";
import { ClientesController } from "../controllers/clientes.controller";
import { authMiddleware, requiereBits } from "../middleware/auth.middleware";

const clientesRouter = Router()
const gestionClientes = requiereBits(64);

clientesRouter.use(authMiddleware)

clientesRouter.get('/paginado',       ClientesController.getClientesPaginado)
clientesRouter.get('/estado-cuenta',  ClientesController.getEstadoCuenta)
clientesRouter.patch('/:codCliente/descuento', gestionClientes, ClientesController.actualizarDescuentoGlobal)
clientesRouter.patch('/:codCliente/d3',        gestionClientes, ClientesController.actualizarD3)
clientesRouter.get('/', ClientesController.getClientes)
clientesRouter.get('/riesgo', ClientesController.getRiesgo)
clientesRouter.post('/riesgo-masivo', ClientesController.getRiesgoMasivo)

export default clientesRouter
