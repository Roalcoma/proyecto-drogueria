import { Router } from 'express';
import { FtpController } from '../controllers/ftp.controller';
import { authMiddleware, adminMiddleware, ftpUsuariosMiddleware } from '../middleware/auth.middleware';

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

// Usuarios FTP — admin o permiso de gestión FTP (bit 131072)
ftpRouter.get('/usuarios',                    ftpUsuariosMiddleware, FtpController.getUsuarios);
ftpRouter.post('/usuarios',                   ftpUsuariosMiddleware, FtpController.crearUsuario);
ftpRouter.delete('/usuarios/:id',             ftpUsuariosMiddleware, FtpController.eliminarUsuario);
ftpRouter.patch('/usuarios/:id/toggle',       ftpUsuariosMiddleware, FtpController.toggleUsuario);
ftpRouter.patch('/usuarios/:id/password',     ftpUsuariosMiddleware, FtpController.cambiarPassword);
ftpRouter.post('/usuarios/importar',           ftpUsuariosMiddleware, FtpController.importarUsuarios);
ftpRouter.post('/usuarios/sincronizar-claves', ftpUsuariosMiddleware, FtpController.sincronizarClaves);

// Ciclo manual (inventario + facturas + pedidos)
ftpRouter.post('/ciclo', adminMiddleware, FtpController.ejecutarCiclo);

export default ftpRouter;
