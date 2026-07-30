import { Request, Response } from "express";
import { MetasService } from "../services/metas.service";

export class MetasController {

    static async getZonas(req: Request, res: Response): Promise<void> {
        const { anio, mes } = req.query;
        if (!anio || !mes) { res.status(400).json({ success: false, message: 'anio y mes requeridos' }); return; }
        try {
            const data = await MetasService.getZonas(Number(anio), Number(mes));
            res.json({ success: true, data });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Error al obtener zonas' });
        }
    }

    static async getVendedoresByZona(req: Request, res: Response): Promise<void> {
        const codruta = Number(req.params['codruta']);
        const { anio, mes } = req.query;
        if (!anio || !mes) { res.status(400).json({ success: false, message: 'anio y mes requeridos' }); return; }
        try {
            const result = await MetasService.getVendedoresByZona(codruta, Number(anio), Number(mes));
            res.json({ success: true, ...result });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Error al obtener vendedores de la zona' });
        }
    }

    static async setMetaZona(req: Request, res: Response): Promise<void> {
        const codruta = Number(req.params['codruta']);
        const { anio, mes, meta } = req.body;
        if (!anio || !mes || meta == null) {
            res.status(400).json({ success: false, message: 'anio, mes y meta son requeridos' }); return;
        }
        try {
            await MetasService.setMetaZona(codruta, Number(anio), Number(mes), Number(meta));
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Error al guardar meta de zona' });
        }
    }

    static async getVendedores(_req: Request, res: Response): Promise<void> {
        try {
            const data = await MetasService.getVendedores();
            res.json({ success: true, data });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Error al obtener vendedores' });
        }
    }

    static async getMetas(req: Request, res: Response): Promise<void> {
        const { anio, mes, codVendedor } = req.query;
        try {
            const data = await MetasService.getMetas(
                anio        ? Number(anio)        : undefined,
                mes         ? Number(mes)         : undefined,
                codVendedor ? Number(codVendedor) : undefined
            );
            res.json({ success: true, data });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Error al obtener metas' });
        }
    }

    static async getProgresoVendedor(req: Request, res: Response): Promise<void> {
        const { anio, mes } = req.query;
        if (!anio || !mes) { res.status(400).json({ success: false, message: 'anio y mes requeridos' }); return; }
        try {
            const data = await MetasService.getProgresoVendedor(Number(anio), Number(mes));
            res.json({ success: true, data });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Error al obtener progreso por vendedor' });
        }
    }

    static async getProgreso(req: Request, res: Response): Promise<void> {
        const { anio, mes } = req.query;
        if (!anio || !mes) { res.status(400).json({ success: false, message: 'anio y mes requeridos' }); return; }
        try {
            const data = await MetasService.getProgreso(Number(anio), Number(mes));
            res.json({ success: true, data });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Error al obtener progreso' });
        }
    }

    static async upsert(req: Request, res: Response): Promise<void> {
        const { codVendedor, anio, mes, meta } = req.body;
        if (!codVendedor || !anio || !mes || meta == null) {
            res.status(400).json({ success: false, message: 'codVendedor, anio, mes y meta son requeridos' });
            return;
        }
        try {
            await MetasService.upsert(Number(codVendedor), Number(anio), Number(mes), Number(meta));
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Error al guardar la meta' });
        }
    }

    static async setCumplida(req: Request, res: Response): Promise<void> {
        const id = parseInt(req.params['id'] as string);
        const { cumplida } = req.body;
        try {
            await MetasService.setCumplida(id, Boolean(cumplida));
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Error al actualizar la meta' });
        }
    }

    static async eliminar(req: Request, res: Response): Promise<void> {
        const id = parseInt(req.params['id'] as string);
        try {
            await MetasService.eliminar(id);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Error al eliminar la meta' });
        }
    }
}
