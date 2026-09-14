import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { PromoEspecialController } from '../controllers/promoEspecial.controller';

const promoEspecialRouter = Router();

promoEspecialRouter.get('/vigentes', authMiddleware,                  PromoEspecialController.getVigentes);
promoEspecialRouter.get('/',         authMiddleware, adminMiddleware,  PromoEspecialController.getAll);
promoEspecialRouter.post('/',        authMiddleware, adminMiddleware,  PromoEspecialController.create);
promoEspecialRouter.put('/:id',      authMiddleware, adminMiddleware,  PromoEspecialController.update);
promoEspecialRouter.delete('/:id',   authMiddleware, adminMiddleware,  PromoEspecialController.remove);

export default promoEspecialRouter;
