import { connectDb, mssql } from '../db/db.conection';

export class ReportesService {
    static async getTopClientesPorVendedor(desde: string, hasta: string, codcliente: number): Promise<any[]> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('DESDE',      mssql.Date, desde)
            .input('HASTA',      mssql.Date, hasta)
            .input('CODCLIENTE', mssql.Int,  codcliente || 0)
            .execute('[RIP].[TOP_CLIENTES_POR_VENDEDOR]');
        return res.recordset;
    }

    static async getComisionesCobranzas(desde: string, hasta: string, comisionMarketing: number): Promise<any[]> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('DESDE',              mssql.Date,  desde)
            .input('HASTA',              mssql.Date,  hasta)
            .input('COMISION_MARKETING', mssql.Float, comisionMarketing)
            .query(`
                SELECT DISTINCT
                    CCL.CODVENDEDOR                                              AS VENDEDOR,
                    V.NOMVENDEDOR                                                AS NOMBRE,
                    SUM(X.IMPORTE_USD)                                           AS MONTO_USD,
                    SUM(X2.IMPORTE_VED)                                          AS MONTO,
                    SUM(X.IMPORTE_USD  * (@COMISION_MARKETING / 100))            AS COMISION_USD,
                    SUM(X2.IMPORTE_VED * (@COMISION_MARKETING / 100))            AS COMISION_VED
                FROM TESORERIA T
                INNER JOIN FACTURASVENTA FV
                    ON FV.NUMSERIE = T.SERIE AND FV.NUMFACTURA = T.NUMERO AND FV.N = T.N
                INNER JOIN FACTURASVENTACAMPOSLIBRES FVCL
                    ON FVCL.NUMSERIE = FV.NUMSERIE AND FVCL.NUMFACTURA = FV.NUMFACTURA AND FVCL.N = FV.N
                OUTER APPLY (
                    SELECT TOP (1) DT2.*
                    FROM DEX_TESORERIATEMP DT2
                    WHERE DT2.SERIE COLLATE MODERN_SPANISH_CI_AS = T.SERIE
                      AND DT2.NUMERO = T.NUMERO
                      AND DT2.N COLLATE MODERN_SPANISH_CI_AS = T.N
                      AND DT2.REFERENCIA = T.COMENTARIOVISIBLE
                    ORDER BY ABS(DATEDIFF(SECOND, DT2.FECHAPROCESADO, T.FECHAMODIFICADO))
                ) DT
                OUTER APPLY (
                    SELECT TOP (1) ANTICIPO = ANT.SUDOCUMENTO
                    FROM TESORERIA ANT
                    WHERE T.COMENTARIO LIKE 'ANTICIPO/VALE ZABD%'
                      AND ANT.SERIE  = 'ZABD'
                      AND ANT.NUMERO = TRY_CAST(SUBSTRING(T.COMENTARIO, CHARINDEX('ZABD*', T.COMENTARIO) + 5, 20) AS INT)
                      AND ANT.CODIGOINTERNO = T.CODIGOINTERNO
                      AND ISNULL(ANT.SUDOCUMENTO, '') <> ''
                ) AN
                LEFT JOIN FPAGOCLIENTE FPC ON FPC.CODCLIENTE   = FV.CODCLIENTE
                LEFT JOIN FORMASPAGO   FPG ON FPG.CODFORMAPAGO = FPC.CODFORMAPAGO
                LEFT JOIN VENCIMFPAGO  VFP ON VFP.CODFORMAPAGO = FPC.CODFORMAPAGO
                INNER JOIN CLIENTESCAMPOSLIBRES CCL ON CCL.CODCLIENTE = FV.CODCLIENTE
                INNER JOIN CLIENTES             C   ON C.CODCLIENTE   = CCL.CODCLIENTE
                INNER JOIN VENDEDORES           V   ON V.CODVENDEDOR  = CCL.CODVENDEDOR
                CROSS APPLY (SELECT FECHA_BASE = COALESCE(FVCL.FECHARECIBIDO, FV.FECHA)) FB
                CROSS APPLY (
                    SELECT
                        DIAS_CREDITO = VFP.DIAS,
                        VENCIMIENTO  = ISNULL(DATEADD(DAY, VFP.DIAS + 2, FB.FECHA_BASE), T.FECHAVENCIMIENTO),
                        IMPORTE_USD  = T.IMPORTE * T.FACTORMONEDA,
                        FACTOR_VED   = CASE WHEN T.CODMONEDA = 1 THEN 1
                                            ELSE T.FACTORMONEDA * DBO.F_GET_COTIZACION(T.FECHASALDADO, 1)
                                       END,
                        EN_PLAZO     = CASE
                                           WHEN ISNULL(DT.FECHACOBRO, T.FECHASALDADO) >
                                                ISNULL(DATEADD(DAY, VFP.DIAS + 2, FB.FECHA_BASE), T.FECHAVENCIMIENTO)
                                           THEN 0 ELSE 1
                                       END
                ) X
                CROSS APPLY (SELECT IMPORTE_VED = T.IMPORTE * X.FACTOR_VED) X2
                WHERE T.ORIGEN = 'C'
                  AND T.ESTADO = 'S'
                  AND T.SERIE IN ('ZAVF', 'ZAVI')
                  AND T.FECHATRASPASO >= @DESDE
                  AND T.FECHATRASPASO <  DATEADD(DAY, 1, @HASTA)
                  AND (DT.SERIE IS NOT NULL OR T.COMENTARIO LIKE 'ANTICIPO/VALE ZABD%')
                  AND CCL.CODVENDEDOR <> 2
                GROUP BY CCL.CODVENDEDOR, V.NOMVENDEDOR
            `);
        return res.recordset;
    }

    static async getTransferencias(desde: string, hasta: string, codarticulo: number): Promise<any[]> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('DESDE',       mssql.Date, desde)
            .input('HASTA',       mssql.Date, hasta)
            .input('CODARTICULO', mssql.Int,  codarticulo || null)
            .query(`
                SELECT
                    AVC.FECHA                                        AS FECHA,
                    TD.DESCRIPCION                                   AS TIPO,
                    CONCAT(FV.NUMSERIE, ' - ', FV.NUMFACTURA)        AS DOCUMENTO,
                    AVL.DESCRIPCION                                  AS DESCRIPCION,
                    AVL.UNIDADESTOTAL                                AS UNIDADES,
                    C.NOMBRECLIENTE                                  AS CLIENTE_PROVEEDOR,
                    AVL.PRECIO                                       AS MONTO_UNITARIO,
                    AVL.TOTAL                                        AS TOTAL
                FROM ALBVENTACAB AVC
                INNER JOIN ALBVENTALIN  AVL ON AVL.NUMSERIE = AVC.NUMSERIE AND AVL.NUMALBARAN = AVC.NUMALBARAN AND AVL.N = AVC.N
                INNER JOIN FACTURASVENTA FV  ON FV.NUMSERIE  = AVC.NUMSERIEFAC AND FV.NUMFACTURA = AVC.NUMFAC AND FV.N = AVC.NFAC
                INNER JOIN TIPOSDOC     TD  ON TD.TIPODOC   = FV.TIPODOC
                LEFT  JOIN CLIENTES     C   ON C.CODCLIENTE  = AVC.CODCLIENTE
                WHERE (AVL.CODARTICULO = @CODARTICULO OR ISNULL(@CODARTICULO, 0) = 0)
                  AND AVL.UNIDADESTOTAL <> 0
                  AND AVC.FECHA BETWEEN @DESDE AND @HASTA
                ORDER BY AVL.DESCRIPCION, FV.FECHA
            `);
        return res.recordset;
    }
}
