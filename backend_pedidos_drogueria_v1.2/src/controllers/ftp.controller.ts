import { Request, Response } from 'express';
import { FtpService } from '../services/ftp.service';
import { getDbConfig, guardarDbConfig } from '../services/dbconfig.service';

export class FtpController {

    // ── Ruta de escaneo ───────────────────────────────────────────────────────

    static async getConfig(req: Request, res: Response): Promise<void> {
        const ruta = await FtpService.getConfig();
        res.json({ success: true, ruta });
    }

    static async setConfig(req: Request, res: Response): Promise<void> {
        const { ruta } = req.body;
        await FtpService.setConfig(String(ruta ?? ''));
        res.json({ success: true, message: 'Ruta FTP actualizada' });
    }

    static async escanear(_req: Request, res: Response): Promise<void> {
        const result = await FtpService.triggerEscaneo();
        res.json({ success: true, message: result.message });
    }

    static async getAuditoria(req: Request, res: Response): Promise<void> {
        const { search, page, limit } = req.query;
        const result = await FtpService.getAuditoria(
            (search as string) || '',
            Number(page) || 1,
            Number(limit) || 25
        );
        res.json({ success: true, ...result });
    }

    // ── Servidor FTP embebido ─────────────────────────────────────────────────

    static getServidorEstado(_req: Request, res: Response): void {
        const cfg    = getDbConfig();
        const estado = FtpService.getEstadoServidor();
        res.json({
            success: true,
            activo:      estado.activo,
            puerto:      cfg.ftpPuerto,
            pasivoMin:   cfg.ftpPasivoMin,
            pasivoMax:   cfg.ftpPasivoMax,
            ipExterna:   cfg.ftpIpExterna,
            ftpHabilitado: cfg.ftpHabilitado,
        });
    }

    static async guardarServidorConfig(req: Request, res: Response): Promise<void> {
        const { puerto, pasivoMin, pasivoMax, ipExterna, ftpHabilitado } = req.body;
        guardarDbConfig({
            ftpPuerto:    Number(puerto    ?? 21),
            ftpPasivoMin: Number(pasivoMin ?? 40000),
            ftpPasivoMax: Number(pasivoMax ?? 40100),
            ftpIpExterna: String(ipExterna ?? ''),
            ftpHabilitado: ftpHabilitado === true,
        } as any);
        res.json({ success: true, message: 'Configuración del servidor FTP guardada' });
    }

    static async iniciarServidor(_req: Request, res: Response): Promise<void> {
        const result = await FtpService.iniciarServidor();
        res.json({ success: result.ok, message: result.message });
    }

    static async detenerServidor(_req: Request, res: Response): Promise<void> {
        const result = await FtpService.detenerServidor();
        res.json({ success: result.ok, message: result.message });
    }

    // ── Usuarios FTP ──────────────────────────────────────────────────────────

    static async getUsuarios(_req: Request, res: Response): Promise<void> {
        const data = await FtpService.getUsuarios();
        res.json({ success: true, data });
    }

    static async crearUsuario(req: Request, res: Response): Promise<void> {
        const { usuario, password, codCliente } = req.body;
        if (!usuario || !password) {
            res.status(400).json({ success: false, message: 'usuario y password son requeridos' });
            return;
        }
        try {
            await FtpService.crearUsuario(String(usuario), String(password), String(codCliente ?? ''));
            res.json({ success: true, message: 'Usuario FTP creado' });
        } catch (err: any) {
            const isDup = String(err.message ?? '').includes('UQ_FTP_USUARIO') || String(err.message ?? '').includes('Violation of UNIQUE');
            res.status(isDup ? 409 : 500).json({ success: false, message: isDup ? 'El usuario ya existe' : (err.message ?? 'Error al crear usuario') });
        }
    }

    static async eliminarUsuario(req: Request, res: Response): Promise<void> {
        await FtpService.eliminarUsuario(Number(req.params.id));
        res.json({ success: true, message: 'Usuario eliminado' });
    }

    static async toggleUsuario(req: Request, res: Response): Promise<void> {
        await FtpService.toggleUsuario(Number(req.params.id));
        res.json({ success: true, message: 'Estado actualizado' });
    }

    static async cambiarPassword(req: Request, res: Response): Promise<void> {
        const { password } = req.body;
        if (!password) { res.status(400).json({ success: false, message: 'password requerido' }); return; }
        await FtpService.cambiarPassword(Number(req.params.id), String(password));
        res.json({ success: true, message: 'Contraseña actualizada' });
    }

    static async ejecutarCiclo(_req: Request, res: Response): Promise<void> {
        const result = await FtpService.triggerCiclo();
        res.json({ success: true, message: result.message });
    }

    static async importarUsuarios(req: Request, res: Response): Promise<void> {
        const { filas } = req.body;
        if (!Array.isArray(filas) || filas.length === 0) {
            res.status(400).json({ success: false, message: 'Sin filas para importar' });
            return;
        }
        const resultados = await FtpService.importarUsuarios(filas);
        res.json({ success: true, resultados });
    }
}
