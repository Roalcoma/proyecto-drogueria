import { Response } from 'express';
import ExcelJS from 'exceljs';
import mssql from 'mssql';
import { connectDb } from '../db/db.conection';
import { RequestConUsuario } from '../middleware/auth.middleware';

// Colores del formato IMS original
const HEADER_BG   = '2E75B6';  // azul accent1
const HEADER_FONT = 'FFFFFF';  // blanco

function aplicarCabecera(ws: ExcelJS.Worksheet, cols: { header: string; key: string; width: number }[]) {
    ws.columns = cols.map(c => ({ header: c.header, key: c.key, width: c.width }));
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
    static async descargarReporte(req: RequestConUsuario, res: Response): Promise<void> {
        const { desde, hasta } = req.query as { desde?: string; hasta?: string };

        if (!desde || !hasta || !/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
            res.status(400).json({ success: false, message: 'Parámetros desde y hasta requeridos (YYYY-MM-DD)' });
            return;
        }

        try {
            const pool = await connectDb();

            const [clientesRes, productosRes, ventasRes] = await Promise.all([
                pool.request().query(`
                    SELECT CLI.CODCLIENTE Codigo, CLI.NOMBRECLIENTE Nombre,
                           CLI.DIRECCION1 Direccion, CLI.PROVINCIA Ciudad, CLI.NIF20 RIF
                    FROM CLIENTES CLI WITH(NOLOCK)
                    WHERE CLI.CODCLIENTE NOT IN (0,2)
                      AND CLI.DESCATALOGADO = 'F'
                      AND CLI.NIF20 LIKE 'J%'
                    ORDER BY CLI.CODCLIENTE
                `),
                pool.request().query(`
                    SELECT ART.CODARTICULO CodProducto,
                           COALESCE(NULLIF(LTRIM(RTRIM(ACL.DESCRIPCIONLARGA)),''), ART.DESCRIPCION)
                               COLLATE Latin1_General_CS_AI Presentacion,
                           M.DESCRIPCION Laboratorio,
                           FORMAT(ISNULL(PV.PNETO,0),'n','es-PA') USD,
                           ART.REFPROVEEDOR EAN
                    FROM ARTICULOS ART WITH(NOLOCK)
                    INNER JOIN ARTICULOSCAMPOSLIBRES ACL WITH(NOLOCK) ON ACL.CODARTICULO = ART.CODARTICULO
                    LEFT  JOIN MARCA M WITH(NOLOCK) ON M.CODMARCA = ART.MARCA
                    LEFT  JOIN PRECIOSVENTA PV WITH(NOLOCK)
                        ON PV.CODARTICULO = ART.CODARTICULO AND PV.IDTARIFAV = 1 AND PV.TALLA = '.'
                    WHERE ART.TIPOARTICULO = 'A'
                      AND LTRIM(RTRIM(ISNULL(ART.DESCRIPCION,''))) <> ''
                      AND ART.USASTOCKS = 'T'
                `),
                pool.request()
                    .input('DESDE', mssql.Date, desde)
                    .input('HASTA', mssql.Date, hasta)
                    .query(`
                        SELECT ART.CODARTICULO CodProdcuto,
                               CASE WHEN CL.NIF20 LIKE 'J%' THEN FV.CODCLIENTE ELSE 2928 END CodCliente,
                               SUM(AVL.UNIDADESTOTAL) Unidades,
                               FORMAT(SUM(AVL.TOTAL),'n','es-PA') USD,
                               FORMAT(FV.FECHA,'yyyy-MM-dd') FECHA
                        FROM FACTURASVENTA FV WITH(NOLOCK)
                        INNER JOIN ALBVENTACAB AVC WITH(NOLOCK)
                            ON FV.NUMSERIE COLLATE DATABASE_DEFAULT = AVC.NUMSERIEFAC
                           AND FV.NUMFACTURA = AVC.NUMFAC AND FV.N = AVC.NFAC
                        INNER JOIN ALBVENTALIN AVL WITH(NOLOCK)
                            ON AVC.NUMSERIE = AVL.NUMSERIE AND AVC.NUMALBARAN = AVL.NUMALBARAN AND AVC.N = AVL.N
                        INNER JOIN ARTICULOS ART WITH(NOLOCK) ON AVL.CODARTICULO = ART.CODARTICULO
                        LEFT  JOIN CLIENTES CL WITH(NOLOCK) ON CL.CODCLIENTE = FV.CODCLIENTE
                        WHERE FV.FECHA BETWEEN @DESDE AND @HASTA
                          AND ART.TIPOARTICULO = 'A'
                          AND ART.USASTOCKS = 'T'
                        GROUP BY ART.CODARTICULO, FV.CODCLIENTE, FV.FECHA, CL.NIF20
                        ORDER BY FV.FECHA, FV.CODCLIENTE, ART.CODARTICULO
                    `),
            ]);

            const wb = new ExcelJS.Workbook();
            wb.creator  = 'Pedidos Droguería';
            wb.created  = new Date();

            // ── Clientes ──────────────────────────────────────────────────────
            const wsC = wb.addWorksheet('Clientes', { properties: { tabColor: { argb: '2E75B6' } } });
            aplicarCabecera(wsC, [
                { header: 'Codigo',    key: 'Codigo',    width: 9  },
                { header: 'Nombre',    key: 'Nombre',    width: 54 },
                { header: 'Direccion', key: 'Direccion', width: 78 },
                { header: 'Ciudad',    key: 'Ciudad',    width: 18 },
                { header: 'RIF',       key: 'RIF',       width: 14 },
            ]);
            clientesRes.recordset.forEach(r => wsC.addRow(r));

            // ── Productos ─────────────────────────────────────────────────────
            const wsP = wb.addWorksheet('Productos', { properties: { tabColor: { argb: '2E75B6' } } });
            aplicarCabecera(wsP, [
                { header: 'CodProducto',  key: 'CodProducto',  width: 13 },
                { header: 'Presentacion', key: 'Presentacion', width: 82 },
                { header: 'Laboratorio',  key: 'Laboratorio',  width: 30 },
                { header: 'USD',          key: 'USD',          width: 9  },
                { header: 'EAN',          key: 'EAN',          width: 18 },
            ]);
            productosRes.recordset.forEach(r => wsP.addRow(r));

            // ── Ventas ────────────────────────────────────────────────────────
            const wsV = wb.addWorksheet('Ventas', { properties: { tabColor: { argb: '2E75B6' } } });
            aplicarCabecera(wsV, [
                { header: 'CodProdcuto', key: 'CodProdcuto', width: 13 },
                { header: 'CodCliente',  key: 'CodCliente',  width: 11 },
                { header: 'Unidades',    key: 'Unidades',    width: 10 },
                { header: 'USD',         key: 'USD',         width: 10 },
                { header: 'FECHA',       key: 'FECHA',       width: 12 },
            ]);
            ventasRes.recordset.forEach(r => wsV.addRow(r));

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
