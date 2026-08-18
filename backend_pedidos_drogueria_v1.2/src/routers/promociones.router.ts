import { Router } from "express";
import multer from "multer";
import { PromocionesController } from "../controllers/promociones.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const promocionesRouter = Router();

promocionesRouter.get('/vigentes', PromocionesController.getVigentes);
promocionesRouter.get('/campos-disponibles', PromocionesController.getCamposDisponibles);
promocionesRouter.get('/proveedores', PromocionesController.getProveedores);
promocionesRouter.get('/marcas', PromocionesController.getMarcas);

promocionesRouter.get('/grupos-articulos', PromocionesController.getGruposArticulos);
promocionesRouter.post('/grupos-articulos', PromocionesController.crearGrupoArticulos);
promocionesRouter.put('/grupos-articulos/:id', PromocionesController.actualizarGrupoArticulos);
promocionesRouter.get('/grupos-articulos/:id/condiciones', PromocionesController.getCondicionesGrupoArticulos);
promocionesRouter.get('/grupos-articulos/:id/articulos', PromocionesController.getArticulosDeGrupo);
promocionesRouter.post('/grupos-articulos/:id/articulos', PromocionesController.agregarArticuloAGrupo);
promocionesRouter.delete('/grupos-articulos/:id/articulos/:codArticulo', PromocionesController.quitarArticuloDeGrupo);
promocionesRouter.post('/grupos-articulos/:id/importar-excel', upload.single('archivo'), PromocionesController.importarArticulosExcel);

promocionesRouter.get('/grupos-clientes/auditoria', authMiddleware, PromocionesController.getAuditoriaGrupos);
promocionesRouter.post('/grupos-clientes/previsualizar-grupos-excel', upload.single('archivo'), PromocionesController.previsualizarGruposExcel);
promocionesRouter.post('/grupos-clientes/previsualizar-clientes-lote', upload.single('archivo'), PromocionesController.previsualizarClientesLoteExcel);
promocionesRouter.post('/grupos-clientes/crear-lote', authMiddleware, PromocionesController.crearLoteGrupos);
promocionesRouter.post('/grupos-clientes/importar-clientes-lote', authMiddleware, upload.single('archivo'), PromocionesController.importarClientesLoteExcel);
promocionesRouter.get('/grupos-clientes', PromocionesController.getGruposClientes);
promocionesRouter.post('/grupos-clientes', authMiddleware, PromocionesController.crearGrupoClientes);
promocionesRouter.put('/grupos-clientes/:id', authMiddleware, PromocionesController.actualizarGrupoClientes);
promocionesRouter.delete('/grupos-clientes/:id', authMiddleware, PromocionesController.eliminarGrupoClientes);
promocionesRouter.get('/grupos-clientes/:id/condiciones', PromocionesController.getCondicionesGrupoClientes);
promocionesRouter.get('/grupos-clientes/:id/clientes', PromocionesController.getClientesDeGrupo);
promocionesRouter.post('/grupos-clientes/:id/clientes', authMiddleware, PromocionesController.agregarClienteAGrupo);
promocionesRouter.delete('/grupos-clientes/:id/clientes/:codCliente', authMiddleware, PromocionesController.quitarClienteDeGrupo);
promocionesRouter.post('/grupos-clientes/:id/importar-excel', authMiddleware, upload.single('archivo'), PromocionesController.importarClientesExcel);

promocionesRouter.get('/', PromocionesController.getPromociones);
promocionesRouter.post('/', PromocionesController.crearPromocion);
promocionesRouter.put('/:id', PromocionesController.actualizarPromocion);
promocionesRouter.patch('/:id/activo', PromocionesController.cambiarActivoPromocion);

export default promocionesRouter;
