import { Request, Response } from "express";
import { ReclamosService } from "../services/reclamos.service";

export class ReclamosController {

    static async crear(req: Request, res: Response): Promise<void> {
        const { codCliente, observaciones, argumentos, usuario, lineas } = req.body;
        if (!codCliente) {
            res.status(400).json({ success: false, message: 'Cliente requerido' });
            return;
        }
        try {
            const id = await ReclamosService.crear(
                Number(codCliente),
                observaciones?.trim() || null,
                argumentos?.trim()    || null,
                usuario?.trim()       || null,
                Array.isArray(lineas) ? lineas : []
            );
            res.status(201).json({ success: true, id });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al guardar el reclamo', error: error instanceof Error ? error.message : 'Error desconocido' });
        }
    }

    static async getReclamos(req: Request, res: Response): Promise<void> {
        const { search, page, limit } = req.query;
        const result = await ReclamosService.getReclamos((search as string) || '', Number(page) || 1, Number(limit) || 10);
        res.status(200).json({ success: true, ...result });
    }

    static async getById(req: Request, res: Response): Promise<void> {
        const id = parseInt(req.params['id'] as string);
        if (!id) { res.status(400).json({ success: false, message: 'ID inválido' }); return; }
        try {
            const data = await ReclamosService.getById(id);
            if (!data) { res.status(404).json({ success: false, message: 'Reclamo no encontrado' }); return; }
            res.status(200).json({ success: true, ...data });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener el reclamo', error: error instanceof Error ? error.message : 'Error desconocido' });
        }
    }

    static async getFacturasDeCliente(req: Request, res: Response): Promise<void> {
        const codCliente = parseInt(req.params['codCliente'] as string);
        const data = await ReclamosService.getFacturasDeCliente(codCliente);
        res.status(200).json({ success: true, data });
    }

    static async getArticulosDeFactura(req: Request, res: Response): Promise<void> {
        const numSerie   = req.params['numSerie'] as string;
        const numFactura = req.params['numFactura'] as string;
        const nf = parseInt(numFactura);
        if (!numSerie || !nf) { res.status(400).json({ success: false, message: 'Parámetros inválidos' }); return; }
        try {
            const data = await ReclamosService.getArticulosDeFactura(numSerie, nf);
            res.status(200).json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener artículos', error: error instanceof Error ? error.message : 'Error desconocido' });
        }
    }
}
