import { Router } from "express";
import multer from "multer";
import { PromocionesController } from "../controllers/promociones.controller";
import { authMiddleware, requiereBits, BITS } from "../middleware/auth.middleware";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const promocionesRouter = Router();
const gestionPromos = requiereBits(BITS.PROMOCIONES);

promocionesRouter.use(authMiddleware);

promocionesRouter.get('/vigentes', PromocionesController.getVigentes);
promocionesRouter.get('/campos-disponibles', PromocionesController.getCamposDisponibles);
promocionesRouter.get('/proveedores', PromocionesController.getProveedores);
promocionesRouter.get('/marcas', PromocionesController.getMarcas);

promocionesRouter.get('/buscar-articulos', PromocionesController.buscarArticulos);
promocionesRouter.get('/grupos-articulos', PromocionesController.getGruposArticulos);
promocionesRouter.post('/grupos-articulos', gestionPromos, PromocionesController.crearGrupoArticulos);
promocionesRouter.put('/grupos-articulos/:id', gestionPromos, PromocionesController.actualizarGrupoArticulos);
promocionesRouter.get('/grupos-articulos/:id/condiciones', PromocionesController.getCondicionesGrupoArticulos);
promocionesRouter.get('/grupos-articulos/:id/articulos', PromocionesController.getArticulosDeGrupo);
promocionesRouter.post('/grupos-articulos/:id/articulos', gestionPromos, PromocionesController.agregarArticuloAGrupo);
promocionesRouter.delete('/grupos-articulos/:id/articulos/:codArticulo', gestionPromos, PromocionesController.quitarArticuloDeGrupo);
promocionesRouter.post('/grupos-articulos/:id/importar-excel', gestionPromos, upload.single('archivo'), PromocionesController.importarArticulosExcel);

promocionesRouter.get('/grupos-clientes/auditoria', PromocionesController.getAuditoriaGrupos);
promocionesRouter.post('/grupos-clientes/previsualizar-grupos-excel', upload.single('archivo'), PromocionesController.previsualizarGruposExcel);
promocionesRouter.post('/grupos-clientes/previsualizar-clientes-lote', upload.single('archivo'), PromocionesController.previsualizarClientesLoteExcel);
promocionesRouter.post('/grupos-clientes/crear-lote', PromocionesController.crearLoteGrupos);
promocionesRouter.post('/grupos-clientes/importar-clientes-lote', upload.single('archivo'), PromocionesController.importarClientesLoteExcel);
promocionesRouter.get('/grupos-clientes', PromocionesController.getGruposClientes);
promocionesRouter.post('/grupos-clientes', PromocionesController.crearGrupoClientes);
promocionesRouter.put('/grupos-clientes/:id', PromocionesController.actualizarGrupoClientes);
promocionesRouter.delete('/grupos-clientes/:id', PromocionesController.eliminarGrupoClientes);
promocionesRouter.get('/grupos-clientes/:id/condiciones', PromocionesController.getCondicionesGrupoClientes);
promocionesRouter.get('/grupos-clientes/:id/clientes', PromocionesController.getClientesDeGrupo);
promocionesRouter.post('/grupos-clientes/:id/clientes', PromocionesController.agregarClienteAGrupo);
promocionesRouter.delete('/grupos-clientes/:id/clientes/:codCliente', PromocionesController.quitarClienteDeGrupo);
promocionesRouter.post('/grupos-clientes/:id/importar-excel', upload.single('archivo'), PromocionesController.importarClientesExcel);

promocionesRouter.get('/', PromocionesController.getPromociones);
promocionesRouter.post('/', gestionPromos, PromocionesController.crearPromocion);
promocionesRouter.put('/:id', gestionPromos, PromocionesController.actualizarPromocion);
promocionesRouter.patch('/:id/activo', gestionPromos, PromocionesController.cambiarActivoPromocion);

export default promocionesRouter;
