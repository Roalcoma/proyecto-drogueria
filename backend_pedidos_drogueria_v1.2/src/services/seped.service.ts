import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as mssql from 'mssql';
import { load as $load } from 'cheerio';
import { connectDb } from '../db/db.conection';

const ESQ = 'dbo';
const LOG_BUFFER_SIZE = 500;
const logBuffer: string[] = [];
export const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(50);

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

function emit(level: LogLevel, msg: string) {
    const line = `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] [${level}] ${msg}`;
    logBuffer.push(line);
    if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
    logEmitter.emit('line', line);
    (level === 'ERROR' ? console.error : console.log)('[SEPED]', msg);
}

export interface SepedConfig {
    habilitado:            boolean;
    intervaloSeg:          number;
    baseUrl:               string;
    loginPath:             string;
    listingPath:           string;
    editPathTemplate:      string;
    acceptPathTemplate:    string;
    orderRowSelector:      string;
    orderIdSelector:       string;
    orderClientSelector:   string;
    orderTotalSelector:    string;
    username:              string;
    password:              string;
    acceptThreshold:       number;
    maxRetries:            number;
    backoffBase:           number;
    noOpWindows:           string;
    dryRun:                boolean;
    ignoreSnapshotCheck:   boolean;
    snapshotDir:           string;
}

interface Order { id: string; client: string; total: number; }

// ── No-op windows ────────────────────────────────────────────────────────────
function parseNoOpWindows(raw: string): Array<[number, number]> {
    return raw.split(',').map(s => s.trim()).filter(Boolean).flatMap(part => {
        try {
            const [a, b] = part.split('-');
            const [h0, m0] = a.split(':').map(Number);
            const [h1, m1] = b.split(':').map(Number);
            return [[h0 * 60 + m0, h1 * 60 + m1] as [number, number]];
        } catch { emit('WARN', `Ventana no-op inválida: ${part}`); return []; }
    });
}

function isInNoOp(windows: Array<[number, number]>): boolean {
    if (!windows.length) return false;
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    return windows.some(([s, e]) => s <= e ? now >= s && now < e : now >= s || now < e);
}

// ── HTTP session (Node 18 built-in fetch + cookie jar) ───────────────────────
class HttpSession {
    private jar: Map<string, string> = new Map();

    private absorb(res: Response) {
        const raw = (res as any).headers.getSetCookie?.() as string[] | undefined;
        const fallback = res.headers.get('set-cookie');
        const all: string[] = raw?.length ? raw : fallback ? [fallback] : [];
        for (const h of all) {
            const [kv] = h.split(';');
            const eq = kv.indexOf('=');
            if (eq > 0) this.jar.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
        }
    }

    private cookieHdr() { return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }

    async get(url: string): Promise<{ html: string; status: number }> {
        const res = await fetch(url, {
            headers: { Cookie: this.cookieHdr(), 'User-Agent': 'Mozilla/5.0' },
            redirect: 'follow',
        });
        this.absorb(res);
        return { html: await res.text(), status: res.status };
    }

    async post(url: string, form: Record<string, string>, referer?: string): Promise<{ html: string; status: number }> {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Cookie: this.cookieHdr(),
                'User-Agent': 'Mozilla/5.0',
                ...(referer ? { Referer: referer } : {}),
            },
            body: new URLSearchParams(form).toString(),
            redirect: 'follow',
        });
        this.absorb(res);
        return { html: await res.text(), status: res.status };
    }
}

// ── HTML helpers ─────────────────────────────────────────────────────────────
function extractCsrf(html: string): string | null {
    const $ = $load(html);
    return $('meta[name="csrf-token"]').attr('content')
        ?? ($('input[name="_token"]').val() as string | undefined)
        ?? null;
}

function parseListing(html: string, cfg: SepedConfig): Order[] {
    const $ = $load(html);
    const orders: Order[] = [];
    $(cfg.orderRowSelector).each((_, el) => {
        const id = $(el).find(cfg.orderIdSelector).text().trim()
                || $(el).find(cfg.orderIdSelector).attr('href')?.match(/(\d+)/)?.[1] || '';
        const client = $(el).find(cfg.orderClientSelector).text().trim();
        const raw    = $(el).find(cfg.orderTotalSelector).text().replace(/[^0-9.,]/g, '').replace(',', '.');
        const total  = parseFloat(raw) || 0;
        if (id) orders.push({ id, client, total });
    });
    return orders;
}

function decideAcceptance(orders: Order[], threshold: number) {
    if (threshold <= 0) return { toAccept: orders, toHold: [] as Order[] };
    const groups = new Map<string, Order[]>();
    for (const o of orders) { const g = groups.get(o.client) ?? []; g.push(o); groups.set(o.client, g); }
    const toAccept: Order[] = [], toHold: Order[] = [];
    for (const group of groups.values())
        (group.some(o => o.total >= threshold) ? toAccept : toHold).push(...group);
    return { toAccept, toHold };
}

// ── Snapshots ────────────────────────────────────────────────────────────────
function hashHtml(html: string): string {
    return crypto.createHash('sha256').update(html).digest('hex');
}
function prevHash(dir: string, name: string): string | null {
    try { return fs.readFileSync(path.join(dir, `${name}.hash`), 'utf8').trim(); } catch { return null; }
}
function saveSnap(dir: string, name: string, html: string) {
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '');
    fs.writeFileSync(path.join(dir, `${name}_${ts}.html`), html, 'utf8');
    fs.writeFileSync(path.join(dir, `${name}_latest.html`), html, 'utf8');
    fs.writeFileSync(path.join(dir, `${name}.hash`), hashHtml(html), 'utf8');
}

// ── Audit ────────────────────────────────────────────────────────────────────
async function audit(orderId: string, client: string, action: string, status: string, detalle = '') {
    try {
        const pool = await connectDb();
        await pool.request()
            .input('O', mssql.NVarChar(100), orderId)
            .input('C', mssql.NVarChar(200), client)
            .input('A', mssql.NVarChar(50),  action)
            .input('S', mssql.NVarChar(50),  status)
            .input('D', mssql.NVarChar(500), detalle)
            .query(`INSERT INTO ${ESQ}.APP_SEPED_AUDITORIA (ORDERID,CLIENT,ACTION,STATUS,DETALLE,FECHA)
                    VALUES (@O,@C,@A,@S,@D,GETUTCDATE())`);
    } catch (e: any) { emit('ERROR', `audit DB: ${e.message}`); }
}

// ── Service ──────────────────────────────────────────────────────────────────
export class SepedService {
    private static scheduler: NodeJS.Timeout | null = null;

    static async initTablas() {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='APP_SEPED_CONFIG')
                    CREATE TABLE ${ESQ}.APP_SEPED_CONFIG (
                        ID                    INT PRIMARY KEY DEFAULT 1,
                        HABILITADO            CHAR(1)        NOT NULL DEFAULT 'F',
                        INTERVALO_SEG         INT            NOT NULL DEFAULT 60,
                        BASE_URL              NVARCHAR(500)  NOT NULL DEFAULT '',
                        LOGIN_PATH            NVARCHAR(200)  NOT NULL DEFAULT '/login',
                        LISTING_PATH          NVARCHAR(200)  NOT NULL DEFAULT '',
                        EDIT_PATH_TEMPLATE    NVARCHAR(200)  NOT NULL DEFAULT '',
                        ACCEPT_PATH_TEMPLATE  NVARCHAR(200)  NOT NULL DEFAULT '',
                        ORDER_ROW_SELECTOR    NVARCHAR(300)  NOT NULL DEFAULT 'tr',
                        ORDER_ID_SELECTOR     NVARCHAR(300)  NOT NULL DEFAULT 'td:first-child',
                        ORDER_CLIENT_SELECTOR NVARCHAR(300)  NOT NULL DEFAULT 'td:nth-child(2)',
                        ORDER_TOTAL_SELECTOR  NVARCHAR(300)  NOT NULL DEFAULT 'td:last-child',
                        USERNAME              NVARCHAR(200)  NOT NULL DEFAULT '',
                        PASSWORD              NVARCHAR(200)  NOT NULL DEFAULT '',
                        ACCEPT_THRESHOLD      FLOAT          NOT NULL DEFAULT 0,
                        MAX_RETRIES           INT            NOT NULL DEFAULT 3,
                        BACKOFF_BASE          INT            NOT NULL DEFAULT 2,
                        NO_OP_WINDOWS         NVARCHAR(500)  NOT NULL DEFAULT '',
                        DRY_RUN               CHAR(1)        NOT NULL DEFAULT 'F',
                        IGNORE_SNAPSHOT_CHECK CHAR(1)        NOT NULL DEFAULT 'F',
                        SNAPSHOT_DIR          NVARCHAR(500)  NOT NULL DEFAULT 'seped_snapshots',
                        CONSTRAINT CK_SEPED_CFG_ID CHECK (ID=1)
                    );
                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='APP_SEPED_AUDITORIA')
                    CREATE TABLE ${ESQ}.APP_SEPED_AUDITORIA (
                        ID      INT IDENTITY PRIMARY KEY,
                        ORDERID NVARCHAR(100) NOT NULL,
                        CLIENT  NVARCHAR(200) NULL,
                        ACTION  NVARCHAR(50)  NOT NULL,
                        STATUS  NVARCHAR(50)  NOT NULL,
                        DETALLE NVARCHAR(500) NULL,
                        FECHA   DATETIME      NOT NULL DEFAULT GETUTCDATE()
                    );
            `);
            emit('INFO', 'Tablas verificadas/creadas');
        } catch (e: any) { emit('ERROR', `initTablas: ${e.message}`); }
    }

    static async getConfig(): Promise<SepedConfig> {
        const pool = await connectDb();
        const r = (await pool.request().query(
            `SELECT * FROM ${ESQ}.APP_SEPED_CONFIG WITH(NOLOCK) WHERE ID=1`
        )).recordset[0];
        if (!r) return {
            habilitado: false, intervaloSeg: 60, baseUrl: '', loginPath: '/login',
            listingPath: '', editPathTemplate: '', acceptPathTemplate: '',
            orderRowSelector: 'tr', orderIdSelector: 'td:first-child',
            orderClientSelector: 'td:nth-child(2)', orderTotalSelector: 'td:last-child',
            username: '', password: '', acceptThreshold: 0,
            maxRetries: 3, backoffBase: 2, noOpWindows: '',
            dryRun: false, ignoreSnapshotCheck: false, snapshotDir: 'seped_snapshots',
        };
        return {
            habilitado:          r.HABILITADO === 'T',
            intervaloSeg:        r.INTERVALO_SEG,
            baseUrl:             r.BASE_URL,
            loginPath:           r.LOGIN_PATH,
            listingPath:         r.LISTING_PATH,
            editPathTemplate:    r.EDIT_PATH_TEMPLATE,
            acceptPathTemplate:  r.ACCEPT_PATH_TEMPLATE,
            orderRowSelector:    r.ORDER_ROW_SELECTOR,
            orderIdSelector:     r.ORDER_ID_SELECTOR,
            orderClientSelector: r.ORDER_CLIENT_SELECTOR,
            orderTotalSelector:  r.ORDER_TOTAL_SELECTOR,
            username:            r.USERNAME,
            password:            r.PASSWORD,
            acceptThreshold:     r.ACCEPT_THRESHOLD,
            maxRetries:          r.MAX_RETRIES,
            backoffBase:         r.BACKOFF_BASE,
            noOpWindows:         r.NO_OP_WINDOWS,
            dryRun:              r.DRY_RUN === 'T',
            ignoreSnapshotCheck: r.IGNORE_SNAPSHOT_CHECK === 'T',
            snapshotDir:         r.SNAPSHOT_DIR,
        };
    }

    static async saveConfig(cfg: SepedConfig) {
        const pool = await connectDb();
        const q = pool.request()
            .input('H',   mssql.Char(1),        cfg.habilitado ? 'T' : 'F')
            .input('I',   mssql.Int,             cfg.intervaloSeg)
            .input('BU',  mssql.NVarChar(500),   cfg.baseUrl)
            .input('LP',  mssql.NVarChar(200),   cfg.loginPath)
            .input('LST', mssql.NVarChar(200),   cfg.listingPath)
            .input('EPT', mssql.NVarChar(200),   cfg.editPathTemplate)
            .input('APT', mssql.NVarChar(200),   cfg.acceptPathTemplate)
            .input('R1',  mssql.NVarChar(300),   cfg.orderRowSelector)
            .input('R2',  mssql.NVarChar(300),   cfg.orderIdSelector)
            .input('R3',  mssql.NVarChar(300),   cfg.orderClientSelector)
            .input('R4',  mssql.NVarChar(300),   cfg.orderTotalSelector)
            .input('UN',  mssql.NVarChar(200),   cfg.username)
            .input('PW',  mssql.NVarChar(200),   cfg.password)
            .input('AT',  mssql.Float,            cfg.acceptThreshold)
            .input('MR',  mssql.Int,              cfg.maxRetries)
            .input('BB',  mssql.Int,              cfg.backoffBase)
            .input('NOP', mssql.NVarChar(500),   cfg.noOpWindows)
            .input('DR',  mssql.Char(1),          cfg.dryRun ? 'T' : 'F')
            .input('ISC', mssql.Char(1),          cfg.ignoreSnapshotCheck ? 'T' : 'F')
            .input('SD',  mssql.NVarChar(500),   cfg.snapshotDir);
        await q.query(`
            IF EXISTS (SELECT 1 FROM ${ESQ}.APP_SEPED_CONFIG WHERE ID=1)
                UPDATE ${ESQ}.APP_SEPED_CONFIG SET
                    HABILITADO=@H, INTERVALO_SEG=@I, BASE_URL=@BU, LOGIN_PATH=@LP,
                    LISTING_PATH=@LST, EDIT_PATH_TEMPLATE=@EPT, ACCEPT_PATH_TEMPLATE=@APT,
                    ORDER_ROW_SELECTOR=@R1, ORDER_ID_SELECTOR=@R2,
                    ORDER_CLIENT_SELECTOR=@R3, ORDER_TOTAL_SELECTOR=@R4,
                    USERNAME=@UN, PASSWORD=@PW, ACCEPT_THRESHOLD=@AT,
                    MAX_RETRIES=@MR, BACKOFF_BASE=@BB, NO_OP_WINDOWS=@NOP,
                    DRY_RUN=@DR, IGNORE_SNAPSHOT_CHECK=@ISC, SNAPSHOT_DIR=@SD
                WHERE ID=1
            ELSE
                INSERT INTO ${ESQ}.APP_SEPED_CONFIG
                    (ID,HABILITADO,INTERVALO_SEG,BASE_URL,LOGIN_PATH,LISTING_PATH,
                     EDIT_PATH_TEMPLATE,ACCEPT_PATH_TEMPLATE,ORDER_ROW_SELECTOR,ORDER_ID_SELECTOR,
                     ORDER_CLIENT_SELECTOR,ORDER_TOTAL_SELECTOR,USERNAME,PASSWORD,ACCEPT_THRESHOLD,
                     MAX_RETRIES,BACKOFF_BASE,NO_OP_WINDOWS,DRY_RUN,IGNORE_SNAPSHOT_CHECK,SNAPSHOT_DIR)
                VALUES (1,@H,@I,@BU,@LP,@LST,@EPT,@APT,@R1,@R2,@R3,@R4,@UN,@PW,@AT,@MR,@BB,@NOP,@DR,@ISC,@SD)
        `);
        if (SepedService.scheduler) {
            SepedService.detenerScheduler();
            if (cfg.habilitado) SepedService.iniciarScheduler(cfg);
        } else if (cfg.habilitado) {
            SepedService.iniciarScheduler(cfg);
        }
    }

    static schedulerActivo() { return !!SepedService.scheduler; }

    static iniciarScheduler(cfg: SepedConfig) {
        SepedService.detenerScheduler();
        emit('INFO', `Scheduler iniciado (intervalo=${cfg.intervaloSeg}s, dry_run=${cfg.dryRun})`);
        SepedService.scheduler = setInterval(
            () => SepedService._ciclo(cfg).catch((e: any) => emit('ERROR', e.message)),
            cfg.intervaloSeg * 1000,
        );
        setImmediate(() => SepedService._ciclo(cfg).catch((e: any) => emit('ERROR', e.message)));
    }

    static detenerScheduler() {
        if (SepedService.scheduler) {
            clearInterval(SepedService.scheduler);
            SepedService.scheduler = null;
            emit('INFO', 'Scheduler detenido');
        }
    }

    static async triggerCiclo() {
        const cfg = await SepedService.getConfig();
        setImmediate(() => SepedService._ciclo(cfg).catch((e: any) => emit('ERROR', e.message)));
        return { message: 'Ciclo iniciado manualmente' };
    }

    static getLogBuffer() { return [...logBuffer]; }

    static async getAuditoria(limit = 100) {
        const pool = await connectDb();
        return (await pool.request().query(
            `SELECT TOP ${limit} * FROM ${ESQ}.APP_SEPED_AUDITORIA WITH(NOLOCK) ORDER BY FECHA DESC`
        )).recordset;
    }

    // ── ciclo ─────────────────────────────────────────────────────────────────
    private static async _ciclo(cfg: SepedConfig) {
        if (isInNoOp(parseNoOpWindows(cfg.noOpWindows))) {
            emit('INFO', 'En ventana no-op; saltando ciclo');
            return;
        }
        if (!cfg.baseUrl || !cfg.listingPath) {
            emit('WARN', 'BASE_URL o LISTING_PATH no configurados');
            return;
        }

        const sess = new HttpSession();
        emit('INFO', 'Iniciando login...');
        const { html: loginPage } = await sess.get(cfg.baseUrl.replace(/\/$/, '') + cfg.loginPath);
        const csrf = extractCsrf(loginPage);
        const { status: loginStatus } = await sess.post(
            cfg.baseUrl.replace(/\/$/, '') + cfg.loginPath,
            { _token: csrf ?? '', email: cfg.username, password: cfg.password },
        );
        if (loginStatus >= 400) { emit('ERROR', `Login falló: status ${loginStatus}`); return; }
        emit('INFO', `Login OK (status ${loginStatus})`);

        const listingUrl = cfg.baseUrl.replace(/\/$/, '') + cfg.listingPath;
        const { html: listingHtml } = await sess.get(listingUrl);

        if (!cfg.ignoreSnapshotCheck) {
            const ph = prevHash(cfg.snapshotDir, 'listing');
            const ch = hashHtml(listingHtml);
            if (ph && ph !== ch) {
                emit('WARN', 'Página de listado cambió; abortando ciclo y guardando snapshot');
                saveSnap(cfg.snapshotDir, 'listing', listingHtml);
                return;
            }
            saveSnap(cfg.snapshotDir, 'listing', listingHtml);
        }

        const orders = parseListing(listingHtml, cfg);
        emit('INFO', `Pedidos encontrados: ${orders.length}`);
        const { toAccept, toHold } = decideAcceptance(orders, cfg.acceptThreshold);
        emit('INFO', `A aceptar: ${toAccept.length} | En espera: ${toHold.length}`);

        for (const o of toAccept) {
            try {
                const editUrl = cfg.baseUrl.replace(/\/$/, '') + cfg.editPathTemplate.replace('{id}', o.id);
                const { html: editHtml } = await sess.get(editUrl);
                if (!cfg.ignoreSnapshotCheck) {
                    const ph = prevHash(cfg.snapshotDir, `edit_${o.id}`);
                    const ch = hashHtml(editHtml);
                    if (ph && ph !== ch) {
                        emit('WARN', `Página de edición de ${o.id} cambió; saltando`);
                        saveSnap(cfg.snapshotDir, `edit_${o.id}`, editHtml);
                        await audit(o.id, o.client, 'accept', 'skipped_front_changed');
                        continue;
                    }
                    saveSnap(cfg.snapshotDir, `edit_${o.id}`, editHtml);
                }
                const csrfEdit = extractCsrf(editHtml) ?? csrf ?? '';
                const ok = await SepedService._acceptOrder(sess, o.id, csrfEdit, cfg, editUrl);
                await audit(o.id, o.client, 'accept', ok ? 'success' : 'failed');
            } catch (e: any) {
                emit('ERROR', `Pedido ${o.id}: ${e.message}`);
                await audit(o.id, o.client, 'accept', 'error', e.message);
            }
        }
        for (const o of toHold) await audit(o.id, o.client, 'hold', 'pending');
        emit('INFO', `Ciclo completado — aceptados: ${toAccept.length}, retenidos: ${toHold.length}`);
    }

    private static async _acceptOrder(
        sess: HttpSession, orderId: string, csrf: string, cfg: SepedConfig, referer?: string,
    ): Promise<boolean> {
        const url = cfg.baseUrl.replace(/\/$/, '')
            + (cfg.acceptPathTemplate || cfg.editPathTemplate).replace('{id}', orderId);
        if (cfg.dryRun) { emit('INFO', `DRY_RUN: omitiría aceptar ${orderId}`); return true; }

        for (let i = 0; i < cfg.maxRetries; i++) {
            try {
                const { status } = await sess.post(url,
                    { _method: 'PATCH', _token: csrf, status: 'PRE-APROBADO', observacion: 'AUTO' },
                    referer);
                if (status >= 200 && status < 300) { emit('INFO', `Pedido ${orderId} aceptado (${status})`); return true; }
                if (status >= 500) {
                    const w = cfg.backoffBase * (2 ** i);
                    emit('WARN', `Error servidor ${status} para ${orderId}; reintento en ${w}s`);
                    await new Promise(r => setTimeout(r, w * 1000));
                } else { emit('ERROR', `No se pudo aceptar ${orderId}: status ${status}`); return false; }
            } catch (e: any) {
                const w = cfg.backoffBase * (2 ** i);
                emit('WARN', `Excepción ${orderId}: ${e.message}; reintento en ${w}s`);
                await new Promise(r => setTimeout(r, w * 1000));
            }
        }
        emit('ERROR', `Reintentos agotados para ${orderId}`);
        return false;
    }
}
