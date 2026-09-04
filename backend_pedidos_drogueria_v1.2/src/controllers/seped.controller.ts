import { Request, Response } from 'express';
import { SepedService, logEmitter } from '../services/seped.service';

export class SepedController {
    static async getConfig(_req: Request, res: Response) {
        try {
            const data = await SepedService.getConfig();
            res.json({ success: true, data, schedulerActivo: SepedService.schedulerActivo() });
        } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
    }

    static async saveConfig(req: Request, res: Response) {
        try {
            const b = req.body;
            await SepedService.saveConfig({
                habilitado:           !!b.habilitado,
                intervaloSeg:         Number(b.intervaloSeg ?? 60),
                baseUrl:              String(b.baseUrl ?? ''),
                loginPath:            String(b.loginPath ?? '/login'),
                listingPath:          String(b.listingPath ?? ''),
                editPathTemplate:     String(b.editPathTemplate ?? ''),
                acceptPathTemplate:   String(b.acceptPathTemplate ?? ''),
                orderRowSelector:     String(b.orderRowSelector ?? 'tr'),
                orderIdSelector:      String(b.orderIdSelector ?? 'td:first-child'),
                orderClientSelector:  String(b.orderClientSelector ?? 'td:nth-child(2)'),
                orderTotalSelector:   String(b.orderTotalSelector ?? 'td:last-child'),
                username:             String(b.username ?? ''),
                password:             String(b.password ?? ''),
                acceptThreshold:      Number(b.acceptThreshold ?? 0),
                maxRetries:           Number(b.maxRetries ?? 3),
                backoffBase:          Number(b.backoffBase ?? 2),
                noOpWindows:          String(b.noOpWindows ?? ''),
                dryRun:               !!b.dryRun,
                ignoreSnapshotCheck:  !!b.ignoreSnapshotCheck,
                snapshotDir:          String(b.snapshotDir ?? 'seped_snapshots'),
            });
            res.json({ success: true, schedulerActivo: SepedService.schedulerActivo() });
        } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
    }

    static async ejecutarCiclo(_req: Request, res: Response) {
        try {
            const result = await SepedService.triggerCiclo();
            res.json({ success: true, ...result });
        } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
    }

    static async getAuditoria(req: Request, res: Response) {
        try {
            const limit = Math.min(500, parseInt((req.query['limite'] as string) ?? '100'));
            res.json({ success: true, data: await SepedService.getAuditoria(limit) });
        } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
    }

    static getEstado(_req: Request, res: Response) {
        res.json({ success: true, schedulerActivo: SepedService.schedulerActivo() });
    }

    // SSE: stream logs in real time; sends log buffer on connect then live events
    static streamLogs(req: Request, res: Response) {
        res.setHeader('Content-Type',  'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection',    'keep-alive');
        res.flushHeaders();

        // Replay buffer
        for (const line of SepedService.getLogBuffer())
            res.write(`data: ${JSON.stringify(line)}\n\n`);

        const onLine = (line: string) => res.write(`data: ${JSON.stringify(line)}\n\n`);
        logEmitter.on('line', onLine);
        req.on('close', () => logEmitter.off('line', onLine));
    }
}
