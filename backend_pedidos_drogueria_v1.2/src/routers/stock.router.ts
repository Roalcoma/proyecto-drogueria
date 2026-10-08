import { Router, Request, Response } from "express";
import { authMiddleware, requiereBits, BITS } from "../middleware/auth.middleware";
import { StockMonitorService } from "../services/stockMonitor.service";

const stockRouter = Router();
stockRouter.use(authMiddleware, requiereBits(BITS.STOCK_LIBRE, BITS.ESTATUS));

const responder = (fn: (req: Request) => Promise<any>) => async (req: Request, res: Response) => {
    try {
        res.json({ success: true, ...(await fn(req)) });
    } catch (e: any) {
        console.error('[Stock]', e);
        res.status(500).json({ success: false, message: e.message ?? String(e) });
    }
};

stockRouter.get('/libre', responder(req => StockMonitorService.getStockLibre(
    String(req.query['buscar'] ?? ''),
    req.query['soloReservados'] === '1',
    Number(req.query['page']) || 1,
    Number(req.query['limit']) || 50,
)));

stockRouter.get('/libre/:codarticulo/pedidos', responder(async req => ({
    data: await StockMonitorService.pedidosQueReservan(Number(req.params['codarticulo'])),
})));

stockRouter.get('/alertas', responder(req => StockMonitorService.getAlertas(
    req.query['activas'] === '1',
    Number(req.query['page']) || 1,
    Number(req.query['limit']) || 50,
)));

stockRouter.post('/alertas/revisar', responder(async () => ({ resultado: await StockMonitorService.revisar() })));

export default stockRouter;
