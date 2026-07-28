import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { exec } from 'child_process';
import { getDbConfig } from './dbconfig.service';

const ROOT        = path.resolve(process.cwd(), '..'); // raíz del repo
const ZIP_URL     = 'https://github.com/Roalcoma/proyecto-drogueria/archive/refs/heads/main.zip';
const ZIP_TMP     = path.join(ROOT, '_update_tmp.zip');
const EXTRACT_TMP = path.join(ROOT, '_update_tmp');
const BACKUPS_DIR = path.join(ROOT, '_backups');
const RESTORE_TMP = path.join(ROOT, '_restore_tmp');

// Rutas que nunca se tocan al copiar (forward slashes para comparación consistente en Windows)
const PROTEGIDOS = [
    'node_modules',
    'dist',
    '.env',
    '.env.production',
    'config/connections.json',
    '_update_tmp.zip',
    '_update_tmp',
    '_backups',
    '_restore_tmp',
    '.git',
];

function descargarZip(url: string, destino: string, redireccionesRestantes = 5): Promise<void> {
    return new Promise((resolve, reject) => {
        if (redireccionesRestantes === 0) return reject(new Error('Demasiadas redirecciones'));

        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { headers: { 'User-Agent': 'pedidos-drogueria-updater' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                return descargarZip(res.headers.location!, destino, redireccionesRestantes - 1)
                    .then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} al descargar ZIP`));
            }
            const file = fs.createWriteStream(destino);
            res.pipe(file);
            file.on('finish', () => file.close(() => resolve()));
            file.on('error', reject);
        }).on('error', reject);
    });
}

function copiarRecursivo(origen: string, destino: string, rutaRelativa = '') {
    const entradas = fs.readdirSync(origen);
    for (const entrada of entradas) {
        const relativa = rutaRelativa ? `${rutaRelativa}/${entrada}` : entrada;
        // Saltar protegidos
        if (PROTEGIDOS.some(p => relativa === p || relativa.startsWith(p + '/'))) continue;

        const src = path.join(origen, entrada);
        const dst = path.join(destino, entrada);
        const stat = fs.statSync(src);

        if (stat.isDirectory()) {
            fs.mkdirSync(dst, { recursive: true });
            copiarRecursivo(src, dst, relativa);
        } else {
            fs.copyFileSync(src, dst);
        }
    }
}

function limpiar() {
    try { fs.rmSync(ZIP_TMP,     { force: true }); } catch {}
    try { fs.rmSync(EXTRACT_TMP, { recursive: true, force: true }); } catch {}
}

function run(cmd: string, cwd: string): Promise<string> {
    const env = {
        ...process.env,
        PATH: [process.env.PATH, 'C:\\Program Files\\Git\\cmd'].filter(Boolean).join(';'),
    };
    return new Promise((resolve) => {
        exec(cmd, { cwd, env }, (_err, stdout, stderr) => resolve((stdout + stderr).trim()));
    });
}

export interface ResultadoActualizacion {
    success:           boolean;
    descarga:          string;
    archivosCopiados:  number;
    reiniciando:       boolean;
    mensaje:           string;
    log:               string[];
}

export interface InfoBackup {
    filename: string;
    fecha:    string;
    version:  string;
    tamaño:   number;
}

export interface ResultadoRollback {
    success: boolean;
    mensaje: string;
    log:     string[];
}

function ts() { return new Date().toISOString().slice(11, 23); } // HH:MM:SS.mmm

function protegido(rel: string) {
    return PROTEGIDOS.some(p => rel === p || rel.startsWith(p + '/'));
}

function leerVersionActual(): string {
    try {
        const p = path.join(ROOT, 'frontend_pedidos_drogueria_v1.2', 'src', 'data', 'changelog.ts');
        const m = fs.readFileSync(p, 'utf-8').match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
        return m ? m[1] : '?';
    } catch { return '?'; }
}

function crearBackup() {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    const version = leerVersionActual();
    const iso     = new Date().toISOString();
    const stamp   = iso.slice(0, 10).replace(/-/g, '') + '_' + iso.slice(11, 19).replace(/:/g, '');
    const destino = path.join(BACKUPS_DIR, `backup_${stamp}_v${version}.zip`);

    const zip = new AdmZip();
    const agregar = (dir: string, dirRel = '') => {
        for (const entry of fs.readdirSync(dir)) {
            const relRuta = dirRel ? `${dirRel}/${entry}` : entry;
            if (protegido(relRuta)) continue;
            const full = path.join(dir, entry);
            if (fs.statSync(full).isDirectory()) {
                agregar(full, relRuta);
            } else {
                zip.addLocalFile(full, dirRel);
            }
        }
    };
    agregar(ROOT);
    zip.writeZip(destino);

    // Conservar solo los últimos 5
    const todos = fs.readdirSync(BACKUPS_DIR)
        .filter(f => f.startsWith('backup_') && f.endsWith('.zip'))
        .sort();
    if (todos.length > 5) {
        todos.slice(0, todos.length - 5).forEach(f =>
            fs.rmSync(path.join(BACKUPS_DIR, f), { force: true })
        );
    }
}

export function listarBackups(): InfoBackup[] {
    if (!fs.existsSync(BACKUPS_DIR)) return [];
    return fs.readdirSync(BACKUPS_DIR)
        .filter(f => f.startsWith('backup_') && f.endsWith('.zip'))
        .sort().reverse().slice(0, 5)
        .map(filename => {
            const m = filename.match(/^backup_(\d{8})_(\d{6})_v(.+)\.zip$/);
            let fecha = '', version = '?';
            if (m) {
                const [, d, t, v] = m;
                fecha   = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}`;
                version = v;
            }
            const tamaño = fs.statSync(path.join(BACKUPS_DIR, filename)).size;
            return { filename, fecha, version, tamaño };
        });
}

export async function ejecutarRollback(filename: string): Promise<ResultadoRollback> {
    const log: string[] = [];
    const paso = (msg: string) => { log.push(`[${ts()}] ${msg}`); console.log('[Rollback]', msg); };

    if (!filename || !filename.startsWith('backup_') || !filename.endsWith('.zip')
        || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        return { success: false, mensaje: 'Nombre de backup inválido', log };
    }

    const backupPath = path.join(BACKUPS_DIR, filename);
    if (!fs.existsSync(backupPath)) {
        return { success: false, mensaje: `Backup no encontrado: ${filename}`, log };
    }

    paso(`Iniciando rollback: ${filename}`);
    try { fs.rmSync(RESTORE_TMP, { recursive: true, force: true }); } catch {}

    try {
        paso('Extrayendo backup...');
        fs.mkdirSync(RESTORE_TMP, { recursive: true });
        new AdmZip(backupPath).extractAllTo(RESTORE_TMP, true);
        paso('Backup extraído.');
    } catch (err: any) {
        return { success: false, mensaje: `Error al extraer backup: ${err.message}`, log };
    }

    let archivosCopiados = 0;
    try {
        paso('Restaurando archivos...');
        const copiar = (origen: string, destino: string, rel = '') => {
            for (const entrada of fs.readdirSync(origen)) {
                const relRuta = rel ? `${rel}/${entrada}` : entrada;
                if (protegido(relRuta)) continue;
                const src = path.join(origen, entrada);
                const dst = path.join(destino, entrada);
                if (fs.statSync(src).isDirectory()) {
                    fs.mkdirSync(dst, { recursive: true });
                    copiar(src, dst, relRuta);
                } else {
                    fs.copyFileSync(src, dst);
                    archivosCopiados++;
                }
            }
        };
        copiar(RESTORE_TMP, ROOT);
        paso(`${archivosCopiados} archivos restaurados.`);
    } catch (err: any) {
        try { fs.rmSync(RESTORE_TMP, { recursive: true, force: true }); } catch {}
        return { success: false, mensaje: `Error al restaurar: ${err.message}`, log };
    }

    try { fs.rmSync(RESTORE_TMP, { recursive: true, force: true }); } catch {}
    paso('Temporales eliminados.');

    const cfg = getDbConfig() as any;
    const servicioBackend  = (cfg.nssmServicioBackend  || '').trim();
    const servicioFrontend = (cfg.nssmServicioFrontend || '').trim();

    if (servicioBackend || servicioFrontend) {
        paso('Programando reinicio NSSM en 2.5s...');
        setTimeout(async () => {
            if (servicioBackend) {
                const out = await run(`nssm restart "${servicioBackend}"`, ROOT).catch((e: any) => e.message);
                console.log('[Rollback][NSSM backend]', out);
            }
            if (servicioFrontend) {
                const out = await run(`nssm restart "${servicioFrontend}"`, ROOT).catch((e: any) => e.message);
                console.log('[Rollback][NSSM frontend]', out);
            }
        }, 2500);
        return { success: true, mensaje: `Rollback completado: ${archivosCopiados} archivos restaurados. Reiniciando servicios.`, log };
    }

    return { success: true, mensaje: `Rollback completado: ${archivosCopiados} archivos restaurados. Reinicia el backend manualmente.`, log };
}

export async function ejecutarActualizacion(): Promise<ResultadoActualizacion> {
    const log: string[] = [];
    const paso = (msg: string) => { log.push(`[${ts()}] ${msg}`); console.log('[Actualizador]', msg); };

    paso(`Iniciando actualización desde ${ZIP_URL}`);
    paso(`Directorio raíz: ${ROOT}`);
    paso(`ZIP temporal: ${ZIP_TMP}`);

    limpiar();
    paso('Archivos temporales anteriores limpiados.');

    // Backup de la versión actual antes de actualizar
    try {
        paso('Creando backup de la versión actual...');
        crearBackup();
        paso('Backup creado correctamente.');
    } catch (err: any) {
        paso(`ADVERTENCIA: No se pudo crear backup: ${err.message}. Continuando de todas formas.`);
    }

    // 1. Descargar ZIP
    try {
        paso('Conectando a GitHub para descargar ZIP...');
        await descargarZip(ZIP_URL, ZIP_TMP);
        const tamaño = fs.statSync(ZIP_TMP).size;
        paso(`ZIP descargado correctamente (${(tamaño / 1024).toFixed(1)} KB).`);
    } catch (err: any) {
        paso(`ERROR en descarga: ${err.message}`);
        paso('Causas comunes: sin acceso a internet, firewall bloqueando GitHub, repo privado sin token.');
        limpiar();
        return { success: false, descarga: ZIP_URL, archivosCopiados: 0, reiniciando: false, mensaje: `Falló la descarga: ${err.message}`, log };
    }

    // 2. Extraer ZIP
    try {
        paso('Extrayendo ZIP...');
        fs.mkdirSync(EXTRACT_TMP, { recursive: true });
        const zip = new AdmZip(ZIP_TMP);
        zip.extractAllTo(EXTRACT_TMP, true);
        const [subDir] = fs.readdirSync(EXTRACT_TMP);
        paso(`ZIP extraído. Subcarpeta raíz en el ZIP: "${subDir}".`);
        var origenReal = path.join(EXTRACT_TMP, subDir);
    } catch (err: any) {
        paso(`ERROR al extraer ZIP: ${err.message}`);
        limpiar();
        return { success: false, descarga: ZIP_URL, archivosCopiados: 0, reiniciando: false, mensaje: `Falló la extracción: ${err.message}`, log };
    }

    // 3. Copiar archivos
    let archivosCopiados = 0;
    try {
        paso('Copiando archivos al proyecto (respetando protegidos)...');
        const copiarContando = (origen: string, destino: string, rel = '') => {
            for (const entrada of fs.readdirSync(origen)) {
                const relativa = rel ? `${rel}/${entrada}` : entrada;
                if (PROTEGIDOS.some(p => relativa === p || relativa.startsWith(p + '/'))) continue;
                const src = path.join(origen, entrada);
                const dst = path.join(destino, entrada);
                if (fs.statSync(src).isDirectory()) {
                    fs.mkdirSync(dst, { recursive: true });
                    copiarContando(src, dst, relativa);
                } else {
                    fs.copyFileSync(src, dst);
                    archivosCopiados++;
                }
            }
        };
        copiarContando(origenReal, ROOT);
        paso(`${archivosCopiados} archivos copiados correctamente.`);
    } catch (err: any) {
        paso(`ERROR al copiar archivos: ${err.message}`);
        paso('Puede ser un problema de permisos sobre la carpeta del proyecto.');
        limpiar();
        return { success: false, descarga: ZIP_URL, archivosCopiados, reiniciando: false, mensaje: `Falló la copia: ${err.message}`, log };
    }

    // 4. Limpiar temporales
    limpiar();
    paso('Temporales eliminados.');

    // 5. Reiniciar con NSSM
    const cfg = getDbConfig() as any;
    const servicioBackend  = (cfg.nssmServicioBackend  || '').trim();
    const servicioFrontend = (cfg.nssmServicioFrontend || '').trim();

    if (!servicioBackend && !servicioFrontend) {
        paso('No hay servicios NSSM configurados — reinicio manual requerido.');
        return { success: true, descarga: ZIP_URL, archivosCopiados, reiniciando: false, mensaje: `${archivosCopiados} archivos actualizados. Reinicia el backend manualmente.`, log };
    }

    paso(`Programando reinicio NSSM en 2.5s — backend: "${servicioBackend}", frontend: "${servicioFrontend}".`);
    setTimeout(async () => {
        if (servicioBackend) {
            const out = await run(`nssm restart "${servicioBackend}"`, ROOT).catch((e: any) => e.message);
            console.log('[Actualizador][NSSM backend]', out);
        }
        if (servicioFrontend) {
            const out = await run(`nssm restart "${servicioFrontend}"`, ROOT).catch((e: any) => e.message);
            console.log('[Actualizador][NSSM frontend]', out);
        }
    }, 2500);

    return { success: true, descarga: ZIP_URL, archivosCopiados, reiniciando: true, mensaje: `${archivosCopiados} archivos actualizados. Reiniciando servicios NSSM en ~3 segundos.`, log };
}
