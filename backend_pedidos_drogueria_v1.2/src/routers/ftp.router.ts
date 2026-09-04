import { Router } from 'express';
import { FtpController } from '../controllers/ftp.controller';
import { IComprasController } from '../controllers/icompras.controller';
import { FarcomprasController } from '../controllers/farcompras.controller';
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

// ICompras
ftpRouter.get('/icompras/config',      adminMiddleware, IComprasController.getConfig);
ftpRouter.put('/icompras/config',      adminMiddleware, IComprasController.saveConfig);
ftpRouter.get('/icompras/estado',      IComprasController.getEstado);
ftpRouter.post('/icompras/ciclo',      adminMiddleware, IComprasController.ejecutarCiclo);
ftpRouter.post('/icompras/reprocesar', adminMiddleware, IComprasController.reprocesarPedido);
ftpRouter.get('/icompras/auditoria',   IComprasController.getAuditoria);

// Farcompras
ftpRouter.get('/farcompras/config',    adminMiddleware, FarcomprasController.getConfig);
ftpRouter.put('/farcompras/config',    adminMiddleware, FarcomprasController.saveConfig);
ftpRouter.get('/farcompras/estado',    FarcomprasController.getEstado);
ftpRouter.post('/farcompras/ciclo',    adminMiddleware, FarcomprasController.ejecutarCiclo);
ftpRouter.get('/farcompras/auditoria', FarcomprasController.getAuditoria);

export default ftpRouter;
