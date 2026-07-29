import { Router } from "express";
import { MetasController } from "../controllers/metas.controller";

const metasRouter = Router();

metasRouter.get('/vendedores', MetasController.getVendedores);
metasRouter.get('/progreso',   MetasController.getProgreso);
metasRouter.get('/',           MetasController.getMetas);
metasRouter.post('/',          MetasController.upsert);
metasRouter.patch('/:id/cumplida', MetasController.setCumplida);
metasRouter.delete('/:id',    MetasController.eliminar);

export default metasRouter;
