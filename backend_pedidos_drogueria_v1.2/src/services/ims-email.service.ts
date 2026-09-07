import nodemailer from 'nodemailer';
import cron from 'node-cron';
import mssql from 'mssql';
import { connectDb } from '../db/db.conection';
import { generarImsExcel } from '../controllers/ims.controller';

const ESQ = process.env.DB_ESQUEMA || 'dbo';

export interface ImsEmailConfig {
    habilitado:     boolean;
    smtpHost:       string;
    smtpPort:       number;
    smtpUser:       string;
    smtpPass:       string;
    smtpTls:        boolean;
    fromName:       string;
    destinatarios:  string;
    frecuencia:     'semanal' | 'mensual';
    diaSemana:      number;
    diaMes:         number;
    hora:           number;
    minuto:         number;
}

const DEFAULT: ImsEmailConfig = {
    habilitado:    false,
    smtpHost:      '',
    smtpPort:      587,
    smtpUser:      '',
    smtpPass:      '',
    smtpTls:       true,
    fromName:      'Sistema Droguería',
    destinatarios: '',
    frecuencia:    'semanal',
    diaSemana:     1,
    diaMes:        1,
    hora:          8,
    minuto:        0,
};

function rangoAnterior(frecuencia: 'semanal' | 'mensual'): { desde: string; hasta: string } {
    const hoy = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    if (frecuencia === 'semanal') {
        const hasta = new Date(hoy);
        hasta.setDate(hoy.getDate() - 1);
        const desde = new Date(hasta);
        desde.setDate(hasta.getDate() - 6);
        return { desde: fmt(desde), hasta: fmt(hasta) };
    }
    // mensual: mes anterior completo
    const primerDiaMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const hasta = new Date(primerDiaMesActual);
    hasta.setDate(0); // último día del mes anterior
    const desde = new Date(hasta.getFullYear(), hasta.getMonth(), 1);
    return { desde: fmt(desde), hasta: fmt(hasta) };
}

export class ImsEmailService {
    private static scheduler: ReturnType<typeof cron.schedule> | null = null;

    static async initTablas() {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_IMS_EMAIL_CONFIG')
                CREATE TABLE ${ESQ}.APP_IMS_EMAIL_CONFIG (
                    ID            INT          PRIMARY KEY DEFAULT 1,
                    HABILITADO    CHAR(1)      NOT NULL DEFAULT 'F',
                    SMTP_HOST     NVARCHAR(200) NOT NULL DEFAULT '',
                    SMTP_PORT     INT          NOT NULL DEFAULT 587,
                    SMTP_USER     NVARCHAR(200) NOT NULL DEFAULT '',
                    SMTP_PASS     NVARCHAR(500) NOT NULL DEFAULT '',
                    SMTP_TLS      CHAR(1)      NOT NULL DEFAULT 'T',
                    FROM_NAME     NVARCHAR(200) NOT NULL DEFAULT 'Sistema Droguería',
                    DESTINATARIOS NVARCHAR(1000) NOT NULL DEFAULT '',
                    FRECUENCIA    NVARCHAR(20) NOT NULL DEFAULT 'semanal',
                    DIA_SEMANA    INT          NOT NULL DEFAULT 1,
                    DIA_MES       INT          NOT NULL DEFAULT 1,
                    HORA          INT          NOT NULL DEFAULT 8,
                    MINUTO        INT          NOT NULL DEFAULT 0,
                    CONSTRAINT CK_IMS_EMAIL_ID CHECK (ID=1)
                )
            `);
            console.log('[IMS-EMAIL] Tabla verificada/creada');
        } catch (e: any) { console.error('[IMS-EMAIL] initTablas:', e.message); }
    }

    static async getConfig(): Promise<ImsEmailConfig> {
        const pool = await connectDb();
        const r = (await pool.request().query(
            `SELECT * FROM ${ESQ}.APP_IMS_EMAIL_CONFIG WITH(NOLOCK) WHERE ID=1`
        )).recordset[0];
        if (!r) return { ...DEFAULT };
        return {
            habilitado:    r.HABILITADO === 'T',
            smtpHost:      r.SMTP_HOST,
            smtpPort:      r.SMTP_PORT,
            smtpUser:      r.SMTP_USER,
            smtpPass:      r.SMTP_PASS,
            smtpTls:       r.SMTP_TLS === 'T',
            fromName:      r.FROM_NAME,
            destinatarios: r.DESTINATARIOS,
            frecuencia:    r.FRECUENCIA as 'semanal' | 'mensual',
            diaSemana:     r.DIA_SEMANA,
            diaMes:        r.DIA_MES,
            hora:          r.HORA,
            minuto:        r.MINUTO,
        };
    }

    static async saveConfig(cfg: ImsEmailConfig) {
        const pool = await connectDb();
        await pool.request()
            .input('H',   mssql.Char(1),         cfg.habilitado ? 'T' : 'F')
            .input('SH',  mssql.NVarChar(200),   cfg.smtpHost)
            .input('SP',  mssql.Int,              cfg.smtpPort)
            .input('SU',  mssql.NVarChar(200),   cfg.smtpUser)
            .input('SW',  mssql.NVarChar(500),   cfg.smtpPass)
            .input('ST',  mssql.Char(1),          cfg.smtpTls ? 'T' : 'F')
            .input('FN',  mssql.NVarChar(200),   cfg.fromName)
            .input('DE',  mssql.NVarChar(1000),  cfg.destinatarios)
            .input('FR',  mssql.NVarChar(20),    cfg.frecuencia)
            .input('DS',  mssql.Int,              cfg.diaSemana)
            .input('DM',  mssql.Int,              cfg.diaMes)
            .input('HR',  mssql.Int,              cfg.hora)
            .input('MN',  mssql.Int,              cfg.minuto)
            .query(`
                IF EXISTS (SELECT 1 FROM ${ESQ}.APP_IMS_EMAIL_CONFIG WHERE ID=1)
                    UPDATE ${ESQ}.APP_IMS_EMAIL_CONFIG SET
                        HABILITADO=@H, SMTP_HOST=@SH, SMTP_PORT=@SP, SMTP_USER=@SU,
                        SMTP_PASS=@SW, SMTP_TLS=@ST, FROM_NAME=@FN, DESTINATARIOS=@DE,
                        FRECUENCIA=@FR, DIA_SEMANA=@DS, DIA_MES=@DM, HORA=@HR, MINUTO=@MN
                    WHERE ID=1
                ELSE
                    INSERT INTO ${ESQ}.APP_IMS_EMAIL_CONFIG
                        (ID,HABILITADO,SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASS,SMTP_TLS,
                         FROM_NAME,DESTINATARIOS,FRECUENCIA,DIA_SEMANA,DIA_MES,HORA,MINUTO)
                    VALUES (1,@H,@SH,@SP,@SU,@SW,@ST,@FN,@DE,@FR,@DS,@DM,@HR,@MN)
            `);

        ImsEmailService.detener();
        if (cfg.habilitado) ImsEmailService.iniciar(cfg);
    }

    static iniciar(cfg: ImsEmailConfig) {
        const expr = cfg.frecuencia === 'semanal'
            ? `${cfg.minuto} ${cfg.hora} * * ${cfg.diaSemana}`
            : `${cfg.minuto} ${cfg.hora} ${cfg.diaMes} * *`;

        if (!cron.validate(expr)) {
            console.error('[IMS-EMAIL] Expresión cron inválida:', expr);
            return;
        }
        ImsEmailService.scheduler = cron.schedule(expr, () => {
            ImsEmailService.enviar(cfg).catch(e => console.error('[IMS-EMAIL] Error en envío:', e.message));
        });
        console.log(`[IMS-EMAIL] Scheduler iniciado (${expr})`);
    }

    static detener() {
        if (ImsEmailService.scheduler) {
            ImsEmailService.scheduler.stop();
            ImsEmailService.scheduler = null;
            console.log('[IMS-EMAIL] Scheduler detenido');
        }
    }

    static schedulerActivo() { return !!ImsEmailService.scheduler; }

    static async enviar(cfg: ImsEmailConfig): Promise<void> {
        const { desde, hasta } = rangoAnterior(cfg.frecuencia);
        const pool = await connectDb();
        const buffer = await generarImsExcel(pool, desde, hasta);

        const destinatarios = cfg.destinatarios.split(',').map(s => s.trim()).filter(Boolean);
        if (!destinatarios.length) { console.warn('[IMS-EMAIL] Sin destinatarios configurados'); return; }

        const transporter = nodemailer.createTransport({
            host:   cfg.smtpHost,
            port:   cfg.smtpPort,
            secure: cfg.smtpTls,
            auth:   { user: cfg.smtpUser, pass: cfg.smtpPass },
        });

        const desdeFmt = `${desde.slice(0,4)}-${desde.slice(4,6)}-${desde.slice(6,8)}`;
        const hastaFmt = `${hasta.slice(0,4)}-${hasta.slice(4,6)}-${hasta.slice(6,8)}`;

        await transporter.sendMail({
            from:    `"${cfg.fromName}" <${cfg.smtpUser}>`,
            to:      destinatarios.join(', '),
            subject: `Reporte IMS ${desdeFmt} al ${hastaFmt}`,
            text:    `Adjunto el reporte IMS del período ${desdeFmt} al ${hastaFmt}.`,
            attachments: [{
                filename:    `IMS ${desde} al ${hasta}.xlsx`,
                content:     buffer,
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }],
        });
        console.log(`[IMS-EMAIL] Reporte enviado a ${destinatarios.join(', ')}`);
    }

    static async enviarAhora(): Promise<void> {
        const cfg = await ImsEmailService.getConfig();
        await ImsEmailService.enviar(cfg);
    }
}
