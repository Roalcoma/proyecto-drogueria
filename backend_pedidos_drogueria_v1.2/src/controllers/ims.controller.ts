import { Response } from 'express';
import * as XLSX from 'xlsx';
import mssql from 'mssql';
import { connectDb } from '../db/db.conection';
import { RequestConUsuario } from '../middleware/auth.middleware';

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
                            ON FV.NUMSERIE = AVC.NUMSERIEFAC AND FV.NUMFACTURA = AVC.NUMFAC AND FV.N = AVC.NFAC
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

            const wb = XLSX.utils.book_new();

            const wsClientes = XLSX.utils.json_to_sheet(clientesRes.recordset,
                { header: ['Codigo', 'Nombre', 'Direccion', 'Ciudad', 'RIF'] });
            XLSX.utils.book_append_sheet(wb, wsClientes, 'Clientes');

            const wsProductos = XLSX.utils.json_to_sheet(productosRes.recordset,
                { header: ['CodProducto', 'Presentacion', 'Laboratorio', 'USD', 'EAN'] });
            XLSX.utils.book_append_sheet(wb, wsProductos, 'Productos');

            const wsVentas = XLSX.utils.json_to_sheet(ventasRes.recordset,
                { header: ['CodProdcuto', 'CodCliente', 'Unidades', 'USD', 'FECHA'] });
            XLSX.utils.book_append_sheet(wb, wsVentas, 'Ventas');

            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

            const filename = `IMS ${desde} al ${hasta}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(buffer);
        } catch (err: any) {
            console.error('[IMS] Error generando reporte:', err);
            res.status(500).json({ success: false, message: err.message ?? 'Error generando reporte' });
        }
    }
}
