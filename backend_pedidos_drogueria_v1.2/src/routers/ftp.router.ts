import { Router } from 'express';
import { FtpController } from '../controllers/ftp.controller';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware';

const ftpRouter = Router();

ftpRouter.use(authMiddleware);

// Ruta de escaneo
ftpRouter.get('/config',    adminMiddleware, FtpController.getConfig);
ftpRouter.put('/config',    adminMiddleware, FtpController.setConfig);
ftpRouter.post('/escanear', adminMiddleware, FtpController.escanear);
ftpRouter.get('/auditoria', FtpController.getAuditoria);

// Servidor FTP embebido
ftpRouter.get('/servidor/estado',     FtpController.getServidorEstado);
ftpRouter.post('/servidor/config',    adminMiddleware, FtpController.guardarServidorConfig);
ftpRouter.post('/servidor/iniciar',   adminMiddleware, FtpController.iniciarServidor);
ftpRouter.post('/servidor/detener',   adminMiddleware, FtpController.detenerServidor);

// Usuarios FTP
ftpRouter.get('/usuarios',                    adminMiddleware, FtpController.getUsuarios);
ftpRouter.post('/usuarios',                   adminMiddleware, FtpController.crearUsuario);
ftpRouter.delete('/usuarios/:id',             adminMiddleware, FtpController.eliminarUsuario);
ftpRouter.patch('/usuarios/:id/toggle',       adminMiddleware, FtpController.toggleUsuario);
ftpRouter.patch('/usuarios/:id/password',     adminMiddleware, FtpController.cambiarPassword);

// Ciclo manual (inventario + facturas + pedidos)
ftpRouter.post('/ciclo', adminMiddleware, FtpController.ejecutarCiclo);

export default ftpRouter;
