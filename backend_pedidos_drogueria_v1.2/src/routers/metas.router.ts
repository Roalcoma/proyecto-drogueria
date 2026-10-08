import { Router } from "express";
import { MetasController } from "../controllers/metas.controller";
import { authMiddleware, requiereBits, BITS } from "../middleware/auth.middleware";

const metasRouter = Router();
const gestionMetas = requiereBits(BITS.METAS_VENDEDOR);

metasRouter.use(authMiddleware);

metasRouter.get('/zonas',                          MetasController.getZonas);
metasRouter.get('/zonas/:codruta/vendedores',      MetasController.getVendedoresByZona);
metasRouter.post('/zonas/:codruta',                gestionMetas, MetasController.setMetaZona);
metasRouter.delete('/zonas/:codruta',              gestionMetas, MetasController.deleteMetaZona);
metasRouter.get('/vendedores',                     MetasController.getVendedores);
metasRouter.get('/progreso',                       MetasController.getProgreso);
metasRouter.get('/progreso-vendedor',              MetasController.getProgresoVendedor);
metasRouter.get('/',                               MetasController.getMetas);
metasRouter.post('/',                              gestionMetas, MetasController.upsert);
metasRouter.patch('/:id/cumplida',                 gestionMetas, MetasController.setCumplida);
metasRouter.delete('/:id',                         gestionMetas, MetasController.eliminar);

export default metasRouter;
