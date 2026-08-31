import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import mssql from 'mssql';
import { connectDb } from '../db/db.conection';
import { RequestConUsuario } from '../middleware/auth.middleware';

const esquema = process.env.DB_ESQUEMA || 'dbo';

// Colores del formato IMS original
const HEADER_BG   = '2E75B6';  // azul accent1
const HEADER_FONT = 'FFFFFF';  // blanco

function aplicarCabecera(ws: ExcelJS.Worksheet, cols: { header: string; key: string; width: number; numFmt?: string }[]) {
    ws.columns = cols.map(c => ({
        header: c.header, key: c.key, width: c.width,
        ...(c.numFmt ? { style: { numFmt: c.numFmt } } : {}),
    }));
    const headerRow = ws.getRow(1);
    headerRow.eachCell(cell => {
        cell.font      = { bold: true, color: { argb: HEADER_FONT }, name: 'Calibri', size: 11 };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border    = {
            bottom: { style: 'thin', color: { argb: '1F4E79' } },
        };
    });
    headerRow.height = 18;
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
}

export class ImsController {

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_IMS_LOG')
                CREATE TABLE ${esquema}.APP_IMS_LOG (
                    ID         INT IDENTITY(1,1) PRIMARY KEY,
                    CODUSUARIO INT            NULL,
                    USUARIO    NVARCHAR(100)  NOT NULL,
                    DESDE      VARCHAR(8)     NOT NULL,
                    HASTA      VARCHAR(8)     NOT NULL,
                    FECHA      DATETIME       NOT NULL DEFAULT GETDATE()
                )
            `);
        } catch (err) {
            console.error('[IMS] initTablas error:', err);
        }
    }

    static async getAuditoria(req: Request, res: Response): Promise<void> {
        const page  = Math.max(1, parseInt(req.query['page']  as string) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query['limit'] as string) || 50));
        const offset = (page - 1) * limit;
        try {
            const pool = await connectDb();
            const [data, count] = await Promise.all([
                pool.request()
                    .input('LIMIT',  mssql.Int, limit)
                    .input('OFFSET', mssql.Int, offset)
                    .query(`SELECT ID, CODUSUARIO, USUARIO, DESDE, HASTA, FECHA
                            FROM ${esquema}.APP_IMS_LOG WITH (NOLOCK)
                            ORDER BY FECHA DESC
                            OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY`),
                pool.request().query(`SELECT COUNT(*) AS TOTAL FROM ${esquema}.APP_IMS_LOG WITH (NOLOCK)`),
            ]);
            res.json({ success: true, data: data.recordset, total: count.recordset[0].TOTAL });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    static async descargarReporte(req: RequestConUsuario, res: Response): Promise<void> {
        const { desde, hasta } = req.query as { desde?: string; hasta?: string };

        if (!desde || !hasta || !/^\d{8}$/.test(desde) || !/^\d{8}$/.test(hasta)) {
            res.status(400).json({ success: false, message: 'Parámetros desde y hasta requeridos (YYYYMMDD)' });
            return;
        }

        try {
            const pool = await connectDb();

            const [clientesRes, productosRes, ventasRes] = await Promise.all([
                pool.request().query(`
                    SELECT
                        CL.CODCLIENTE,
                        CL.NOMBRECLIENTE,
                        CASE WHEN ISNULL(CE.DIRECCION1, '') = '' THEN CL.DIRECCION1 ELSE CE.DIRECCION1 END DIRECCION,
                        COALESCE(NULLIF(CE.PROVINCIA, ''), CL.PROVINCIA) ESTADO,
                        CL.NIF20 RIF
                    FROM CLIENTES CL WITH(NOLOCK)
                    INNER JOIN CLIENTESCAMPOSLIBRES CCL WITH(NOLOCK) ON CCL.CODCLIENTE = CL.CODCLIENTE
                    INNER JOIN CLIENTESENVIO CE WITH(NOLOCK) ON CE.CODCLIENTE = CL.CODCLIENTE AND CE.CODENVIO = 0
                    WHERE UPPER(CL.NIF20) NOT LIKE 'V%'
                      AND CL.CODCLIENTE NOT IN (3971, 3972)
                `),
                pool.request().query(`
                    SELECT
                        ART.CODARTICULO,
                        ARCL.DESCRIPCIONLARGA DESCRIPCION,
                        M.DESCRIPCION LABORATORIO,
                        ISNULL(PV.PNETO, 0) PRECIO,
                        ART.REFPROVEEDOR _CODBARRAS
                    FROM ARTICULOS ART WITH(NOLOCK)
                    LEFT JOIN ARTICULOSCAMPOSLIBRES ARCL WITH(NOLOCK) ON ARCL.CODARTICULO = ART.CODARTICULO
                    LEFT JOIN PRECIOSVENTA PV WITH(NOLOCK) ON PV.CODARTICULO = ART.CODARTICULO AND PV.COLOR = '.' AND PV.TALLA = '.' AND PV.IDTARIFAV = 1
                    LEFT JOIN MARCA M WITH(NOLOCK) ON M.CODMARCA = ART.MARCA
                    WHERE ART.DPTO = 1
                      AND (ART.DESCATALOGADO = 'F' OR ART.DESCATALOGADO IS NULL)

                    UNION ALL

                    SELECT
                        CONCAT(1, Codigo),
                        Descripcion COLLATE Modern_Spanish_CI_AS,
                        Marca       COLLATE Modern_Spanish_CI_AS,
                        ROUND(Precio / dbo.F_GET_COTIZACION(GETDATE(), 1), 3),
                        CodBarras   COLLATE Modern_Spanish_CI_AS
                    FROM ListadoMaestroProteoFaltantes WITH (NOLOCK)
                `),
                pool.request().input('DESDE', desde).input('HASTA', hasta).query(`
                        SELECT
                            ART.CODARTICULO,
                            CASE WHEN (CL.NIF20 LIKE 'V%' OR CL.NIF20 LIKE 'G%') THEN 1 ELSE CL.CODCLIENTE END AS CODCLIENTE,
                            SUM(AVL.UNIDADESTOTAL) AS UNIDADES,
                            SUM(AVL.TOTAL) AS TOTAL_LINEA,
                            CAST(FV.FECHA AS DATE) AS FECHA
                        FROM FACTURASVENTA FV WITH(NOLOCK)
                        INNER JOIN ALBVENTACAB AVC WITH(NOLOCK) ON AVC.NUMSERIEFAC = FV.NUMSERIE AND AVC.NUMFAC = FV.NUMFACTURA AND AVC.NFAC = FV.N
                        INNER JOIN ALBVENTALIN AVL WITH(NOLOCK) ON AVL.NUMSERIE = AVC.NUMSERIE AND AVL.NUMALBARAN = AVC.NUMALBARAN AND AVL.N = AVC.N
                        INNER JOIN CLIENTES CL WITH(NOLOCK) ON CL.CODCLIENTE = FV.CODCLIENTE
                        INNER JOIN CLIENTESCAMPOSLIBRES CCL WITH(NOLOCK) ON CCL.CODCLIENTE = CL.CODCLIENTE
                        INNER JOIN ARTICULOS ART WITH(NOLOCK) ON ART.CODARTICULO = AVL.CODARTICULO
                        WHERE FV.FECHA BETWEEN @DESDE AND @HASTA
                          AND CL.CODCLIENTE <> 2
                          AND AVL.TOTAL > 0
                          AND ART.DPTO = 1
                        GROUP BY
                            ART.CODARTICULO, FV.FECHA,
                            CASE WHEN (CL.NIF20 LIKE 'V%' OR CL.NIF20 LIKE 'G%') THEN 1 ELSE CL.CODCLIENTE END
                        ORDER BY ART.CODARTICULO
                    `),
            ]);

            const wb = new ExcelJS.Workbook();
            wb.creator  = 'Pedidos Droguería';
            wb.created  = new Date();

            const FMT_DEC2 = '#,##0.00';

            // ── Clientes ──────────────────────────────────────────────────────
            const wsC = wb.addWorksheet('Clientes', { properties: { tabColor: { argb: '2E75B6' } } });
            aplicarCabecera(wsC, [
                { header: 'Codigo',    key: 'CODCLIENTE',   width: 9  },
                { header: 'Nombre',    key: 'NOMBRECLIENTE', width: 54 },
                { header: 'Direccion', key: 'DIRECCION',    width: 78 },
                { header: 'Estado',    key: 'ESTADO',       width: 18 },
                { header: 'RIF',       key: 'RIF',          width: 14 },
            ]);
            clientesRes.recordset.forEach(r => wsC.addRow(r));

            // ── Productos ─────────────────────────────────────────────────────
            const wsP = wb.addWorksheet('Productos', { properties: { tabColor: { argb: '2E75B6' } } });
            aplicarCabecera(wsP, [
                { header: 'CodProducto',  key: 'CODARTICULO',  width: 13 },
                { header: 'Descripcion',  key: 'DESCRIPCION',  width: 82 },
                { header: 'Laboratorio',  key: 'LABORATORIO',  width: 30 },
                { header: 'Precio',       key: 'PRECIO',       width: 9,  numFmt: FMT_DEC2 },
                { header: 'EAN',          key: '_CODBARRAS',   width: 18 },
            ]);
            productosRes.recordset.forEach(r => {
                wsP.addRow({ ...r, PRECIO: Number(r.PRECIO) });
            });

            // ── Ventas ────────────────────────────────────────────────────────
            const wsV = wb.addWorksheet('Ventas', { properties: { tabColor: { argb: '2E75B6' } } });
            aplicarCabecera(wsV, [
                { header: 'CodProducto', key: 'CODARTICULO', width: 13 },
                { header: 'CodCliente',  key: 'CODCLIENTE',  width: 11 },
                { header: 'Unidades',    key: 'UNIDADES',    width: 10, numFmt: FMT_DEC2 },
                { header: 'Total',       key: 'TOTAL_LINEA', width: 12, numFmt: FMT_DEC2 },
                { header: 'Fecha',       key: 'FECHA',       width: 12 },
            ]);

            ventasRes.recordset.forEach(r => {
                wsV.addRow({ ...r, UNIDADES: Number(r.UNIDADES), TOTAL_LINEA: Number(r.TOTAL_LINEA) });
            });

            // Auditoría: registrar descarga
            pool.request()
                .input('CODUSUARIO', mssql.Int,         req.usuario?.id   ?? null)
                .input('USUARIO',    mssql.NVarChar(100), req.usuario?.usuario ?? 'desconocido')
                .input('DESDE',      mssql.VarChar(8),   desde)
                .input('HASTA',      mssql.VarChar(8),   hasta)
                .query(`INSERT INTO ${esquema}.APP_IMS_LOG (CODUSUARIO, USUARIO, DESDE, HASTA) VALUES (@CODUSUARIO, @USUARIO, @DESDE, @HASTA)`)
                .catch(e => console.error('[IMS] log error:', e));

            const filename = `IMS ${desde} al ${hasta}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            await wb.xlsx.write(res);
            res.end();
        } catch (err: any) {
            console.error('[IMS] Error generando reporte:', err);
            if (!res.headersSent)
                res.status(500).json({ success: false, message: err.message ?? 'Error generando reporte' });
        }
    }
}
