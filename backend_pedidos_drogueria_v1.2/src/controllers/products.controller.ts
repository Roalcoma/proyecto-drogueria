import { Request, Response } from "express";
import { ProductsService } from "../services/products.service";

export class ProductsController {
    static async getProducts(req: Request, res: Response): Promise<void> {
        try {
            // Atrapamos el nuevo parámetro 'stock_status' del frontend
            let { articulo, page, limit, stock_status, solo_controlados } = req.query;

            const paginaActual = Number(page) || 1;
            const limiteItems = Number(limit) || 10;
            const status = (stock_status as string) || 'todos';
            const soloCtrl = solo_controlados === 'true';

            // 1. Contamos el Gran Total aplicando el filtro de stock
            const totalRegistros = await ProductsService.getTotalProductsCount(articulo as string, status, soloCtrl);

            // 2. Traemos solo los 10 de la página aplicando el filtro de stock
            const products = await ProductsService.getProducts(articulo as string, paginaActual, limiteItems, status, soloCtrl);

            // 3. Llenamos el arreglo con sus stocks y precios (tu código original)
            for (const product of products) {
                const codarticulo = product.CODARTICULO;
                const stocks = await ProductsService.getStocks(codarticulo);
                product.stocks = stocks;
                const prices = await ProductsService.getPrices(codarticulo, 0);
                product.prices = prices;
            }

            // 4. Respondemos a Vuetify
            res.status(200).json({
                success: true,
                data: products,
                page: paginaActual,
                limit: limiteItems,
                total: totalRegistros 
            });
        } catch (error) {
            console.error('Error en el controlador getProducts:', error);
            res.status(500).json({ success: false, message: 'Error interno del servidor' });
        }
    }

    static async getStock(req: Request, res: Response): Promise<void> {
        try {
            let { codarticulo } = req.query

            if(!codarticulo) {
                codarticulo = '0'
            }

            const stocks = await ProductsService.getStocks(Number(codarticulo))

            res.status(200).json({
                success: true,
                stocks: stocks
            })
        } catch (error) {
            console.error('Error al obtener los stocks: ', error)
            res.status(500).json({
                success: false,
                message: 'Error al obtener stocks',
                error: error instanceof Error ? error.message : 'Error desconocido'
            })
        }
    }

    static async getSegmentosDescuento(_req: Request, res: Response): Promise<void> {
        try {
            const descuentos = await ProductsService.getSegmentosDescuento();
            res.json({ success: true, descuentos });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener segmentos', detail: error instanceof Error ? error.message : String(error) });
        }
    }

    static async getCatalogoSegmentos(_req: Request, res: Response): Promise<void> {
        try {
            const rows = await ProductsService.getCatalogoSegmentos();
            res.status(200).json({ success: true, data: rows });
        } catch (error) {
            console.error('[getCatalogoSegmentos]', error);
            res.status(500).json({ success: false, message: 'Error al obtener catálogo', detail: error instanceof Error ? error.message : String(error) });
        }
    }

    static async getPrices(req: Request, res:Response): Promise<void> {
        try {
            let { codarticulo, tarifa } = req.query

            if(!codarticulo || !tarifa) {
                codarticulo = '0'
                tarifa = '0'
            }

            const prices = await ProductsService.getPrices(Number(codarticulo), Number(tarifa))

            res.status(200).json({
                success: true,
                prices: prices,
                
            })
        } catch (error) {
            console.error('Error al obtener los precios: ', error)
            res.status(500).json({
                success: false,
                message: 'Error al obtener precios',
                error: error instanceof Error ? error.message : 'Error desconocido'
            })
        }
    }
}
