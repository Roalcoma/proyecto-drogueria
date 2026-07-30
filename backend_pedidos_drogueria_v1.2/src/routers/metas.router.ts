import { Router } from "express";
import { MetasController } from "../controllers/metas.controller";

const metasRouter = Router();

metasRouter.get('/zonas',                          MetasController.getZonas);
metasRouter.get('/zonas/:codruta/vendedores',      MetasController.getVendedoresByZona);
metasRouter.post('/zonas/:codruta',                MetasController.setMetaZona);
metasRouter.delete('/zonas/:codruta',              MetasController.deleteMetaZona);
metasRouter.get('/vendedores',                     MetasController.getVendedores);
metasRouter.get('/progreso',                       MetasController.getProgreso);
metasRouter.get('/progreso-vendedor',              MetasController.getProgresoVendedor);
metasRouter.get('/',                               MetasController.getMetas);
metasRouter.post('/',                              MetasController.upsert);
metasRouter.patch('/:id/cumplida',                 MetasController.setCumplida);
metasRouter.delete('/:id',                         MetasController.eliminar);

export default metasRouter;
