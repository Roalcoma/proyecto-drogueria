import os
import time
import sys
import shutil
import pymssql
import json
from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
import xml.etree.ElementTree as ET
import re
import configparser
import tkinter as tk
from tkinter import messagebox

def _ve(s):
    """Convierte separadores US→VE: 1,234.5678 → 1.234,5678"""
    return s.replace(',', '\x00').replace('.', ',').replace('\x00', '.')

def fmt_raw(x):
    if x is None:
        return "0,00"
    return _ve(f"{float(x):,.2f}")

def fmt_raw_neg(x):
    if x is None or float(x) == 0:
        return "0,00"
    v = float(x)
    return _ve(f"-{abs(v):,.2f}") if v > 0 else _ve(f"{v:,.2f}")

def fmt_4(x):
    if x is None:
        return "0,0000"
    return _ve(f"{float(x):,.4f}")

def fmt_4_neg(x):
    if x is None or float(x) == 0:
        return "0,0000"
    v = float(x)
    return _ve(f"-{abs(v):,.4f}") if v > 0 else _ve(f"{v:,.4f}")

def fmt_auto(x):
    """2 decimales si los últimos 2 son 00; 4 decimales en cualquier otro caso."""
    if x is None:
        return "0,00"
    v = float(x)
    s = f"{v:,.4f}"
    ip, dp = s.rsplit('.', 1)
    if dp[2:] == '00':
        return _ve(f"{ip}.{dp[:2]}")
    return _ve(s)

def fmt_auto_neg(x):
    if x is None or float(x) == 0:
        return "0,00"
    v = float(x)
    return f"-{fmt_auto(abs(v))}" if v > 0 else fmt_auto(v)

def fmt_pct_int(x):
    """Porcentaje entero sin decimales."""
    if x is None:
        return "0"
    return str(int(float(x)))

def fmt_vence(v):
    """Convierte YYYY-MM-DD a MM/YYYY; devuelve '-' si no hay fecha."""
    s = str(v or '-').split(' ')[0]
    parts = s.split('-')
    if len(parts) == 3 and parts[0].isdigit():
        return f"{parts[1]}/{parts[0]}"
    return '-'

def fmt_2(x):
    """2 decimales — para totales del pie."""
    if x is None:
        return "0,00"
    return _ve(f"{float(x):,.2f}")

def fmt_2_neg(x):
    """2 decimales negativo — para totales del pie en NC."""
    if x is None or float(x) == 0:
        return "0,00"
    v = float(x)
    return _ve(f"-{v:,.2f}") if v > 0 else _ve(f"{v:,.2f}")

# VALORES POR DEFECTO (Vacíos por seguridad - se deben llenar en settings.cfg)
CONFIG = {
    'database': {
        'server': '', 'user': '', 'password': '', 'database': ''
    },
    'empresa': {
        'direccion': '', 'sicm': '', 'ruta': '-'
    }
}

def desencriptar_clave(s_encriptado):
    s_return = ""
    i_constantes = [78, 79, 82, 77, 65, 76, 75, 69, 89, 78, 79, 82, 77, 65, 76, 75, 69, 89, 78, 79, 82, 77, 65, 76, 75, 69, 89, 78, 79, 82, 77, 65, 76, 75, 69, 89, 78]
    j = 0
    try:
        for i in range(0, len(s_encriptado), 2):
            hex_pair = s_encriptado[i:i+2]
            s_return += chr(int(hex_pair, 16) - i_constantes[j])
            j += 1
        return s_return
    except Exception as e:
        print(f"Error en desencriptación: {e}")
        return s_encriptado

def cargar_configuracion():
    global CONFIG
    exe_dir = os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else __file__)
    ruta_config = os.path.join(exe_dir, 'settings.cfg')
    
    if os.path.exists(ruta_config):
        try:
            config_parser = configparser.ConfigParser()
            config_parser.read(ruta_config)
            
            if 'database' in config_parser:
                conf_db = dict(config_parser['database'])
                # Aplicamos tu función de desencriptación a la contraseña
                pwd_hex = conf_db.get('password', '')
                if pwd_hex:
                    conf_db['password'] = desencriptar_clave(pwd_hex)
                
                CONFIG['database'].update(conf_db)
            
            if 'empresa' in config_parser:
                CONFIG['empresa'].update(dict(config_parser['empresa']))
                
            print(f"Configuración cargada (Seguridad: Custom Hex)")
        except Exception as e:
            print(f"Error cargando settings.cfg: {e}")

# Cargar al iniciar
cargar_configuracion()

def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

class Database:
    _skip_sleep = False  # ponytail: batch mode sets True to skip the ICG commit-wait

    def get_datos_factura(self, numserie, numerofac):
        if not self._skip_sleep:
            print(f"Esperando 5 segundos para que la factura se registre en DB...")
            time.sleep(3)

        # Totales del pie directamente de FACTURASVENTA (se corre primero para decidir qué query usar)
        sql_totales = f"""
        SELECT TOP 1 TOTALBRUTO, TOTALIMPUESTOS, TOTALNETO
        FROM FACTURASVENTA WITH(NOLOCK)
        WHERE NUMSERIE = '{numserie}' AND NUMFACTURA = '{numerofac}'
        """

        # Query SIN IVA (productos exentos)
        sql_sin_iva = f"""
SELECT DISTINCT
    AVC.NUMSERIE AS SERIEALBARAN,
    AVC.NUMALBARAN AS NUMEROALBARAN,
    AVC.NUMSERIEFAC,
    AVC.NUMFAC,
    VENTA.SUPEDIDO AS PEDIDO,
    CAST(FACVE.FECHA AS DATE) AS FECHA,
    ALIN.CODBARRAS AS LOTE,
    TRY_CAST(TESO.FECHAVENCIMIENTO AS DATE) AS FECHA_VENCIMIETO_PEDIDO,
    TRY_CAST(ALIN.GARANTIACOMPRA AS DATE) AS FECHA_VENCIMIETO_ARTICULO,
    (
        SELECT COUNT(*)
        FROM BULTOS_CONTEO AS B WITH(NOLOCK)
        INNER JOIN PEDIDOS_CONTEOS AS PC WITH(NOLOCK) ON PC.IDCONTEO = B.IDCONTEO
        WHERE PC.IDPEDIDO = VENTA.SUPEDIDO COLLATE DATABASE_DEFAULT
    ) AS BULTOS,
    ISNULL(CLI.CIF, CLI.NIF20) AS RIF_CLIENTE,
    CLI.NOMBRECLIENTE,
    CLI.CODCLIENTE,
    ISNULL(CLI.DIRECCION1, CLI.DIRECCION2) AS DIRECCION_CLIENTE,
    V.NOMVENDEDOR,
    CO.COTIZACION,
    ART.CODARTICULO,
    ART.DESCRIPCION,
    LIP.PRECIOUNITARIO AS PRECIOUNI_USD,
    VENTA.UNIDADESTOTAL AS CANTIDAD_PRODUCTOS,
    LIP.TOTALLINEA AS TOTAL_USD,
    LIP.DESCUENTO1, LIP.DESCUENTO2, LIP.DESCUENTO3, LIP.DESCUENTO4,
    AVC.TOTALBRUTO AS TOTBRUTO, AVC.TOTALIMPUESTOS AS TOTIMPUESTOS, AVC.TOTALNETO AS TOTNETO, AVC.TOTALCOSTE AS TOTALCOSTE,
    CAST(AVC.TOTALCOSTEIVA * CO.COTIZACION AS DECIMAL(16,2)) AS IVA_BS,
    CAST(LIP.PRECIOUNITARIO * CO.COTIZACION AS DECIMAL(16,2)) AS PRECIOUNI_BS,
    CAST(LIP.TOTALLINEA * CO.COTIZACION AS DECIMAL(16,2)) AS TOTAL_BS,
    LIP.PRECIOBRUTO AS PVP,
    AVC.NUMFAC NUMERO_FACTURA,
    CCAM.TIPO AS FORMA_PAGO,
    CONCAT(CCAM.ZONA COLLATE DATABASE_DEFAULT, ' - ', RUTAS.DESCRIPCION COLLATE DATABASE_DEFAULT) AS RUTA,
    FORM.DESCRIPCION AS FORMA_PAGO_DESC,
    VENTA.IVA AS IVA_ARTICULO,
    CCAM.SICM,
    C.OBSERVACIONES AS PSICOTROPICO,
    VENTA.TOTAL AS VENTA_TOTAL,
    VENTA.UNIDADESTOTAL AS VENTA_UNIDADES,
    AVC.CODENVIO,
    CLIEV.DIRECCION1 AS DIRECCION_ENVIO
FROM ALBVENTACAB AS AVC WITH(NOLOCK)
    INNER JOIN FACTURASVENTA AS FACVE WITH(NOLOCK) ON FACVE.NUMSERIE = AVC.NUMSERIEFAC AND FACVE.NUMFACTURA = AVC.NUMFAC
    INNER JOIN ALBVENTALIN AS VENTA WITH(NOLOCK) ON VENTA.NUMSERIE = AVC.NUMSERIE AND VENTA.NUMALBARAN = AVC.NUMALBARAN
    LEFT JOIN CABECERA_PED AS C WITH(NOLOCK) ON C.ORDERID = VENTA.SUPEDIDO COLLATE DATABASE_DEFAULT
    INNER JOIN CLIENTES AS CLI WITH(NOLOCK) ON CLI.CODCLIENTE = C.CLIENTEID
    INNER JOIN VENDEDORES AS V WITH(NOLOCK) ON V.CODVENDEDOR = C.CODVENDEDOR
    INNER JOIN COTIZACIONES AS CO WITH(NOLOCK) ON CO.FECHA = CAST(FACVE.FECHA AS DATE)
    LEFT JOIN LINEA_PED AS LIP WITH(NOLOCK) ON LIP.ORDERID = VENTA.SUPEDIDO COLLATE DATABASE_DEFAULT AND LIP.CODARTICULO = VENTA.CODARTICULO
    INNER JOIN ARTICULOS AS ART WITH(NOLOCK) ON ART.CODARTICULO = VENTA.CODARTICULO
    INNER JOIN CLIENTESCAMPOSLIBRES AS CCAM WITH(NOLOCK) ON CCAM.CODCLIENTE = CLI.CODCLIENTE
    INNER JOIN TESORERIA AS TESO WITH(NOLOCK) ON TESO.SERIE = AVC.NUMSERIEFAC AND TESO.NUMERO = AVC.NUMFAC
    INNER JOIN FORMASPAGO AS FORM WITH(NOLOCK) ON FORM.CODFORMAPAGO = TESO.CODFORMAPAGO
    INNER JOIN CLIENTESENVIO AS CLIEV WITH(NOLOCK) ON CLIEV.CODCLIENTE = CLI.CODCLIENTE AND CLIEV.CODENVIO = AVC.CODENVIO
    OUTER APPLY (
        SELECT TOP 1 CODBARRAS,
            COALESCE(TRY_CONVERT(DATE, GARANTIACOMPRA, 103), TRY_CONVERT(DATE, GARANTIACOMPRA, 23)) AS GARANTIACOMPRA
        FROM ARTICULOSLIN WITH(NOLOCK)
        WHERE CODARTICULO = ART.CODARTICULO
        AND COALESCE(TRY_CONVERT(DATE, GARANTIACOMPRA, 103), TRY_CONVERT(DATE, GARANTIACOMPRA, 23)) IS NOT NULL
        ORDER BY COALESCE(TRY_CONVERT(DATE, GARANTIACOMPRA, 103), TRY_CONVERT(DATE, GARANTIACOMPRA, 23)) DESC
    ) AS ALIN
    INNER JOIN PRECIOSVENTA AS PRE WITH(NOLOCK) ON PRE.CODARTICULO = ART.CODARTICULO
    INNER JOIN IMPUESTOS AS IMP WITH(NOLOCK) ON IMP.TIPOIVA = VENTA.TIPOIMPUESTO
    INNER JOIN RUTAS AS RUTAS WITH(NOLOCK) ON RUTAS.CODRUTA = CCAM.ZONA COLLATE DATABASE_DEFAULT
WHERE AVC.NUMSERIEFAC = '{numserie}' AND AVC.NUMFAC = '{numerofac}' AND VENTA.UNIDADESTOTAL <> 0
        """

        # Query CON IVA (productos gravados)
        sql_con_iva = f"""
SELECT DISTINCT
    AVC.NUMSERIE AS SERIEALBARAN,
    AVC.NUMALBARAN AS NUMEROALBARAN,
    AVC.NUMSERIEFAC,
    AVC.NUMFAC,
    VENTA.SUPEDIDO AS PEDIDO,
    CAST(FACVE.FECHA AS DATE) AS FECHA,
    ALIN.CODBARRAS AS LOTE,
    TRY_CAST(TESO.FECHAVENCIMIENTO AS DATE) AS FECHA_VENCIMIETO_PEDIDO,
    TRY_CAST(ALIN.GARANTIACOMPRA AS DATE) AS FECHA_VENCIMIETO_ARTICULO,
    (
        SELECT COUNT(*)
        FROM BULTOS_CONTEO AS B WITH(NOLOCK)
        INNER JOIN PEDIDOS_CONTEOS AS PC WITH(NOLOCK) ON PC.IDCONTEO = B.IDCONTEO
        WHERE PC.IDPEDIDO = VENTA.SUPEDIDO COLLATE DATABASE_DEFAULT
    ) AS BULTOS,
    ISNULL(CLI.CIF, CLI.NIF20) AS RIF_CLIENTE,
    CLI.NOMBRECLIENTE,
    CLI.CODCLIENTE,
    ISNULL(CLI.DIRECCION1, CLI.DIRECCION2) AS DIRECCION_CLIENTE,
    V.NOMVENDEDOR,
    DBO.F_GET_COTIZACION(FACVE.FECHA, 1) AS COTIZACION,
    ART.CODARTICULO,
    ART.DESCRIPCION,
    LIP.PRECIOUNITARIO AS PRECIOUNI_USD,
    VENTA.UNIDADESTOTAL AS CANTIDAD_PRODUCTOS,
    LIP.TOTALLINEA AS TOTAL_USD,
    LIP.DESCUENTO1, LIP.DESCUENTO2, LIP.DESCUENTO3, LIP.DESCUENTO4,
    AVC.TOTALBRUTO AS TOTBRUTO, AVC.TOTALIMPUESTOS AS TOTIMPUESTOS,
    AVC.TOTALNETO AS TOTNETO,
    AVC.TOTALCOSTE AS TOTALCOSTE,
    VENTA.TOTAL / VENTA.UNIDADESTOTAL * DBO.F_GET_COTIZACION(AVC.FECHA, 1) AS PRECIO_BS_DTO,
    CAST((VENTA.TOTAL * (1 + (VENTA.IVA / 100.0))) * DBO.F_GET_COTIZACION(AVC.FECHA, 1) AS DECIMAL(16,2)) AS TOTAL_BS,
    LIP.PRECIOBRUTO AS PVP,
    AVC.NUMFAC NUMERO_FACTURA,
    CCAM.TIPO AS FORMA_PAGO,
    CONCAT(CCAM.ZONA COLLATE DATABASE_DEFAULT, ' - ', RUTAS.DESCRIPCION COLLATE DATABASE_DEFAULT) AS RUTA,
    FORM.DESCRIPCION AS FORMA_PAGO_DESC,
    VENTA.IVA AS IVA_ARTICULO,
    VENTA.TOTAL AS VENTA_TOTAL,
    CCAM.SICM,
    C.OBSERVACIONES AS PSICOTROPICO,
    AVC.CODENVIO,
    CLIEV.DIRECCION1 AS DIRECCION_ENVIO
FROM ALBVENTACAB AS AVC WITH(NOLOCK)
    INNER JOIN FACTURASVENTA AS FACVE WITH(NOLOCK) ON FACVE.NUMSERIE = AVC.NUMSERIEFAC AND FACVE.NUMFACTURA = AVC.NUMFAC
    INNER JOIN ALBVENTALIN AS VENTA WITH(NOLOCK) ON VENTA.NUMSERIE = AVC.NUMSERIE AND VENTA.NUMALBARAN = AVC.NUMALBARAN
    LEFT JOIN CABECERA_PED AS C WITH(NOLOCK) ON C.ORDERID = VENTA.SUPEDIDO COLLATE DATABASE_DEFAULT
    INNER JOIN CLIENTES AS CLI WITH(NOLOCK) ON CLI.CODCLIENTE = C.CLIENTEID
    INNER JOIN VENDEDORES AS V WITH(NOLOCK) ON V.CODVENDEDOR = C.CODVENDEDOR
    LEFT JOIN LINEA_PED AS LIP WITH(NOLOCK) ON LIP.ORDERID = VENTA.SUPEDIDO COLLATE DATABASE_DEFAULT AND LIP.CODARTICULO = VENTA.CODARTICULO
    INNER JOIN ARTICULOS AS ART WITH(NOLOCK) ON ART.CODARTICULO = VENTA.CODARTICULO
    INNER JOIN CLIENTESCAMPOSLIBRES AS CCAM WITH(NOLOCK) ON CCAM.CODCLIENTE = CLI.CODCLIENTE
    INNER JOIN TESORERIA AS TESO WITH(NOLOCK) ON TESO.SERIE = AVC.NUMSERIEFAC AND TESO.NUMERO = AVC.NUMFAC
    INNER JOIN FORMASPAGO AS FORM WITH(NOLOCK) ON FORM.CODFORMAPAGO = TESO.CODFORMAPAGO
    INNER JOIN CLIENTESENVIO AS CLIEV WITH(NOLOCK) ON CLIEV.CODCLIENTE = CLI.CODCLIENTE AND CLIEV.CODENVIO = AVC.CODENVIO
    OUTER APPLY (
        SELECT TOP 1 CODBARRAS,
            COALESCE(TRY_CONVERT(DATE, GARANTIACOMPRA, 103), TRY_CONVERT(DATE, GARANTIACOMPRA, 23)) AS GARANTIACOMPRA
        FROM ARTICULOSLIN WITH(NOLOCK)
        WHERE CODARTICULO = ART.CODARTICULO
        AND COALESCE(TRY_CONVERT(DATE, GARANTIACOMPRA, 103), TRY_CONVERT(DATE, GARANTIACOMPRA, 23)) IS NOT NULL
        ORDER BY COALESCE(TRY_CONVERT(DATE, GARANTIACOMPRA, 103), TRY_CONVERT(DATE, GARANTIACOMPRA, 23)) DESC
    ) AS ALIN
    INNER JOIN IMPUESTOS AS IMP WITH(NOLOCK) ON IMP.TIPOIVA = VENTA.TIPOIMPUESTO
    INNER JOIN RUTAS AS RUTAS WITH(NOLOCK) ON RUTAS.CODRUTA = CCAM.ZONA COLLATE DATABASE_DEFAULT
WHERE AVC.NUMSERIEFAC = '{numserie}' AND AVC.NUMFAC = '{numerofac}' AND VENTA.UNIDADESTOTAL <> 0
        """

        try:
            conn = pymssql.connect(**CONFIG['database'])
            cursor = conn.cursor(as_dict=True)
            # Primero los totales para decidir qué query usar
            cursor.execute(sql_totales)
            fac_totales = cursor.fetchone()
            tiene_iva = fac_totales and float(fac_totales['TOTALIMPUESTOS'] or 0) > 0
            escribir_log(f"Factura {numserie}/{numerofac} - tiene_iva={tiene_iva}")
            cursor.execute(sql_con_iva if tiene_iva else sql_sin_iva)
            rows = cursor.fetchall()
            conn.close()
            escribir_log(f"get_datos_factura: {len(rows)} filas para {numserie}/{numerofac}")
            if not rows: return None, None

            p = rows[0]
            fmt_num = fmt_auto
            fmt_num3 = fmt_auto
            def fmt_fecha(f):
                s = str(f or '').split(' ')[0]
                partes = s.split('-')
                return f"{partes[2]}/{partes[1]}/{partes[0]}" if len(partes) == 3 else s

            total_unidades = sum(r['CANTIDAD_PRODUCTOS'] for r in rows)
            tasa = float(p['COTIZACION'])

            items = []
            base_imponible_ref = 0.0
            base_exenta_ref = 0.0
            for r in rows:
                cant = float(r['CANTIDAD_PRODUCTOS'] or 0)
                pvp_usd = float(r['PVP'] or 0)
                iva_pct = float(r['IVA_ARTICULO'] or 0) / 100

                d1 = float(r['DESCUENTO1'] or 0) / 100
                d2 = float(r['DESCUENTO2'] or 0) / 100
                d3 = float(r['DESCUENTO3'] or 0) / 100
                d4 = float(r['DESCUENTO4'] or 0) / 100
                # Precio real facturado: viene de VENTA.TOTAL (ALBVENTALIN), no se recalcula
                # desde PVP x descuento porque el PVP puede haber cambiado desde la venta original
                sub_linea_usd = float(r['VENTA_TOTAL'] or 0)
                prec_u_usd = (sub_linea_usd / cant) if cant else 0.0
                iva_linea_usd = sub_linea_usd * iva_pct if tiene_iva else 0.0
                neto_linea_usd = sub_linea_usd + iva_linea_usd

                if iva_pct > 0 and tiene_iva:
                    base_imponible_ref += sub_linea_usd
                else:
                    base_exenta_ref += sub_linea_usd

                items.append({
                    'Desc': r['DESCRIPCION'] + (' (E)' if iva_pct == 0 else ''), 'Cant': int(r['CANTIDAD_PRODUCTOS']),
                    'Lote': r.get('LOTE') or '-',
                    'Vence': fmt_vence(r.get('FECHA_VENCIMIETO_ARTICULO')),
                    'PVP': fmt_num(pvp_usd),
                    'PVPBs': _ve(f"{pvp_usd * tasa:,.4f}"),
                    'D1': fmt_pct_int(r['DESCUENTO1']), 'D2': fmt_pct_int(r['DESCUENTO2']),
                    'D3': fmt_pct_int(r['DESCUENTO3']), 'D4': fmt_pct_int(r['DESCUENTO4']),
                    'Prec$': fmt_num(prec_u_usd),
                    'PrecBs': fmt_num(prec_u_usd * tasa),
                    'Sub$': fmt_num(sub_linea_usd),
                    'SubTotalBs': fmt_num(sub_linea_usd * tasa),
                    'Neto': fmt_num(neto_linea_usd),
                    'NetoBs': fmt_num(neto_linea_usd * tasa),
                    'IVA_P': f"{int(float(r['IVA_ARTICULO'] or 0))}%"
                })

            # Totales calculados desde las líneas (sin redondeos intermedios)
            sub_ref = base_imponible_ref + base_exenta_ref
            iva_ref = base_imponible_ref * 0.16
            neto_ref = sub_ref + iva_ref

            # Bs = USD × tasa, sin redondeos intermedios
            sub_bs = sub_ref * tasa
            iva_bs = iva_ref * tasa
            neto_bs = neto_ref * tasa
            base_imponible_bs = base_imponible_ref * tasa
            base_exenta_bs = base_exenta_ref * tasa

            desc_ref = 0.0
            desc_bs = 0.0

            header = {
                'Pedido': p.get('PEDIDO', ''), 'FacturaNo': str(p.get('NUMERO_FACTURA', '')),
                'Fecha': fmt_fecha(p.get('FECHA', '')),
                'FechaVencimiento': fmt_fecha(p.get('FECHA_VENCIMIETO_PEDIDO', '')),
                'RazonSocial': p.get('NOMBRECLIENTE', ''),
                'DireccionEnvio': p.get('DIRECCION_CLIENTE', ''),
                'DirDespacho': p.get('DIRECCION_ENVIO', ''),
                'Vendedor': p.get('NOMVENDEDOR', ''), 'TasaVal': tasa, 'TasaStr': fmt_auto(tasa),
                'CondicionPago': p.get('FORMA_PAGO', 'CONTADO'), 'RIF': p.get('RIF_CLIENTE', ''),
                'CodCliente': p.get('CODCLIENTE', ''),
                'Unidades': total_unidades,
                'Bultos': p.get('BULTOS') if p.get('BULTOS') is not None else '-',
                'SubTotalRef': fmt_auto(sub_ref),
                'BaseExentaRef': fmt_auto(base_exenta_ref),
                'BaseImponibleRef': fmt_auto(base_imponible_ref),
                'IVA_Ref': fmt_auto(iva_ref),
                'DescRef': fmt_auto(desc_ref),
                'NetoRef': fmt_auto(neto_ref),
                'SubTotalBs': fmt_auto(sub_bs),
                'BaseExentaBs': fmt_auto(base_exenta_bs),
                'BaseImponibleBs': fmt_auto(base_imponible_bs),
                'IVA_Bs': fmt_auto(iva_bs),
                'DescBs': fmt_auto(desc_bs),
                'NetoBs': fmt_auto(neto_bs),
                'Direccion': CONFIG['empresa']['direccion'],
                'SICM': str(p.get('SICM')).strip() if p.get('SICM') is not None and str(p.get('SICM')).strip() != '' else '-',
                'Ruta': p.get('RUTA') or '-',
                'Psicotropico': str(p.get('PSICOTROPICO') or '').strip()
            }
            return header, items
        except Exception as e:
            escribir_log(f"ERROR get_datos_factura: {e}")
            return None, None

    def get_datos_nota(self, numserie, numerofac):
        if not self._skip_sleep:
            print(f"Esperando 5 segundos para que el documento se registre en DB...")
            time.sleep(3)
        sql_query = f"""
WITH ConsultaBase AS (
    SELECT DISTINCT
        CAST(ALB2.FECHA AS DATE) AS FECHA_EMISION,
        ALB2.NUMFAC AS NUMFAC_REAL,
        VENTA.NUMSERIE AS SERIE_ALBARAN,
        VENTA.NUMALBARAN AS NUMERO_ALBARAN,
        VENTA.SUPEDIDO AS PEDIDO,
        VENTA.DESCRIPCION AS DESCRIPCION_ARTICULO,
        VENTA.UNIDADESTOTAL AS CANTIDAD_ARTICULOS,
        ALIN.CODBARRAS AS LOTE_ARTICULO,
        TRY_CAST(ALIN.GARANTIACOMPRA AS DATE) AS FECHA_VENCIMIETO_ARTICULO,
        '-' + CAST(VENTA.PRECIO AS VARCHAR(10)) AS PRECIO_UNITARIO,
        CAST(IMP.IVA AS VARCHAR(10)) + '%' AS PORCENTAJE_IVA,
        IMP.IVA AS IVA_NUMERICO,
        VENTA.TOTAL AS SUBTOTAL,
        DBO.F_GET_COTIZACION(CAST(COALESCE(FACV_ORIG.FECHA, ALB2.FECHA) AS DATE), 1) AS TASA,
        CLI.CODCLIENTE AS CODCLIENTE,
        CLI.NOMBRECLIENTE AS NOMBRECLIENTE,
        ISNULL(CLI.DIRECCION1, CLI.DIRECCION2) AS DIRECCION_CLIENTE,
        ISNULL(CLI.CIF, CLI.NIF20) AS RIF_CLIENTE,
        V.NOMVENDEDOR AS NOMBREVENDEDOR,
        CCAM.TIPO AS FORMA_PAGO,
        CONCAT(CCAM.ZONA COLLATE DATABASE_DEFAULT, ' - ' ,RUTAS.DESCRIPCION COLLATE DATABASE_DEFAULT) AS RUTA_DESCRIPCION,
        CCAM.SICM,
        FORM.DESCRIPCION AS FORMA_PAGO_DESC,
        VENTA.ABONODE_NUMSERIE,
        VENTA.ABONODE_NUMALBARAN,
        COALESCE(
            CAST(CAMP.FACAFECTA AS VARCHAR) COLLATE DATABASE_DEFAULT,
            CAST(ALBV3.NUMFAC AS VARCHAR) COLLATE DATABASE_DEFAULT,
            CASE WHEN TESO.SUDOCUMENTO LIKE '%-%NC'
                THEN SUBSTRING(TESO.SUDOCUMENTO, CHARINDEX('-', TESO.SUDOCUMENTO) + 1, LEN(TESO.SUDOCUMENTO) - CHARINDEX('-', TESO.SUDOCUMENTO) - 2)
                ELSE NULL
            END COLLATE DATABASE_DEFAULT
        ) AS FACTURA_AFECTADA,
        CLIEV.DIRECCION1 AS DIRECCION_ENVIO,
        ART.DPTO AS DPTO
    FROM ALBVENTALIN AS VENTA WITH(NOLOCK)
    LEFT JOIN PEDVENTACAB AS PED WITH(NOLOCK) ON PED.SUPEDIDO = VENTA.SUPEDIDO
    LEFT JOIN ALBVENTACAB AS ALB WITH(NOLOCK) ON ALB.NUMSERIE = VENTA.ABONODE_NUMSERIE AND ALB.NUMALBARAN = VENTA.ABONODE_NUMALBARAN
    LEFT JOIN LINEA_PED AS LIN WITH(NOLOCK) ON LIN.ORDERID = PED.SUPEDIDO COLLATE DATABASE_DEFAULT
    LEFT JOIN ARTICULOS AS ART WITH(NOLOCK) ON ART.CODARTICULO = VENTA.CODARTICULO
    LEFT JOIN IMPUESTOS AS IMP WITH(NOLOCK) ON IMP.TIPOIVA = VENTA.TIPOIMPUESTO
    LEFT JOIN ALBVENTACAB AS ALB2 WITH(NOLOCK) ON ALB2.NUMSERIEFAC = VENTA.NUMSERIE AND ALB2.NUMALBARAN = VENTA.NUMALBARAN
    LEFT JOIN FACTURASVENTA AS FACV WITH(NOLOCK) ON FACV.NUMSERIE = VENTA.NUMSERIE AND FACV.NUMFACTURA = ALB2.NUMFAC
    LEFT JOIN CLIENTES AS CLI WITH(NOLOCK) ON CLI.CODCLIENTE = FACV.CODCLIENTE
    LEFT JOIN CABECERA_PED AS CAB WITH(NOLOCK) ON CAB.ORDERID = VENTA.SUPEDIDO COLLATE DATABASE_DEFAULT
    LEFT JOIN VENDEDORES AS V WITH(NOLOCK) ON V.CODVENDEDOR = CAB.CODVENDEDOR
    LEFT JOIN CLIENTESCAMPOSLIBRES AS CCAM WITH(NOLOCK) ON CCAM.CODCLIENTE = CLI.CODCLIENTE
    LEFT JOIN RUTAS AS RUTAS WITH(NOLOCK) ON RUTAS.CODRUTA = CCAM.ZONA COLLATE DATABASE_DEFAULT
    LEFT JOIN TESORERIA AS TESO WITH(NOLOCK) ON TESO.SERIE = ALB2.NUMSERIEFAC AND TESO.NUMERO = ALB2.NUMFAC
    LEFT JOIN FORMASPAGO AS FORM WITH(NOLOCK) ON FORM.CODFORMAPAGO = TESO.CODFORMAPAGO
    LEFT JOIN ALBVENTACAB AS ALBV3 WITH(NOLOCK) ON ALBV3.NUMSERIE = VENTA.ABONODE_NUMSERIE AND ALBV3.NUMALBARAN = VENTA.ABONODE_NUMALBARAN
    LEFT JOIN FACTURASVENTA AS FACV_ORIG WITH(NOLOCK) ON FACV_ORIG.NUMSERIE = ALBV3.NUMSERIEFAC AND FACV_ORIG.NUMFACTURA = ALBV3.NUMFAC
    LEFT JOIN CLIENTESENVIO AS CLIEV WITH(NOLOCK) ON CLIEV.CODCLIENTE = CLI.CODCLIENTE
    LEFT JOIN FACTURASVENTACAMPOSLIBRES AS CAMP WITH(NOLOCK) ON CAMP.NUMSERIE = VENTA.NUMSERIE AND CAMP.NUMFACTURA = ALB2.NUMFAC
    OUTER APPLY (
        SELECT TOP 1
            CODBARRAS,
            COALESCE(TRY_CONVERT(DATE, GARANTIACOMPRA, 103), TRY_CONVERT(DATE, GARANTIACOMPRA, 23)) AS GARANTIACOMPRA
        FROM ARTICULOSLIN WITH(NOLOCK)
        WHERE CODARTICULO = ART.CODARTICULO
          AND COALESCE(TRY_CONVERT(DATE, GARANTIACOMPRA, 103), TRY_CONVERT(DATE, GARANTIACOMPRA, 23)) IS NOT NULL
        ORDER BY COALESCE(TRY_CONVERT(DATE, GARANTIACOMPRA, 103), TRY_CONVERT(DATE, GARANTIACOMPRA, 23)) DESC
    ) AS ALIN
    WHERE VENTA.NUMSERIE = '{numserie}'
      AND ALB2.NUMFAC = {numerofac}
      AND VENTA.UNIDADESTOTAL <> 0
)
SELECT
    FECHA_EMISION,
    NUMFAC_REAL,
    SERIE_ALBARAN, NUMERO_ALBARAN, PEDIDO,
    DESCRIPCION_ARTICULO, CANTIDAD_ARTICULOS,
    LOTE_ARTICULO, FECHA_VENCIMIETO_ARTICULO,
    PRECIO_UNITARIO, PORCENTAJE_IVA, IVA_NUMERICO,
    SUBTOTAL, TASA,
    '-' + CAST(SUM(CASE WHEN IVA_NUMERICO = 0 THEN ABS(SUBTOTAL) ELSE 0 END) OVER() AS VARCHAR(20)) AS BASE_EXENTA,
    '-' + CAST(SUM(CASE WHEN IVA_NUMERICO <> 0 THEN ABS(SUBTOTAL) ELSE 0 END) OVER() AS VARCHAR(20)) AS BASE_IMPONIBLE,
    '-' + CAST(SUM(ABS(SUBTOTAL)) OVER() AS VARCHAR(20)) AS TOTAL_SUMA_SUBTOTAL,
    CODCLIENTE, NOMBRECLIENTE, DIRECCION_CLIENTE, RIF_CLIENTE,
    NOMBREVENDEDOR, FORMA_PAGO, FORMA_PAGO_DESC, RUTA_DESCRIPCION,
    SICM, ABONODE_NUMSERIE, ABONODE_NUMALBARAN, FACTURA_AFECTADA,
    DIRECCION_ENVIO, DPTO
FROM ConsultaBase;
        """
        try:
            conn = pymssql.connect(**CONFIG['database'])
            cursor = conn.cursor(as_dict=True)
            cursor.execute(sql_query)
            rows = cursor.fetchall()
            conn.close()
            if not rows: return None, None

            p = rows[0]
            tasa = float(p['TASA'] or 1)

            dptos = [r.get('DPTO') for r in rows]
            es_financiera = bool(dptos) and all(d == 3 for d in dptos)
            # Financieras: montos ya vienen en Bs desde la BD, no convertir
            tasa_mult = 1.0 if es_financiera else tasa

            total_unidades = sum(abs(int(r['CANTIDAD_ARTICULOS'] or 0)) for r in rows)
            sub_ref     = abs(float(p['TOTAL_SUMA_SUBTOTAL'] or 0))
            base_exenta_ref    = abs(float(p['BASE_EXENTA'] or 0))
            base_imponible_ref = abs(float(p['BASE_IMPONIBLE'] or 0))
            iva_ref     = sum(abs(float(r['SUBTOTAL'] or 0)) * float(r['IVA_NUMERICO'] or 0) / 100 for r in rows)
            neto_ref    = sub_ref + iva_ref
            desc_ref    = 0.0

            sub_bs             = sub_ref * tasa_mult
            base_exenta_bs     = base_exenta_ref * tasa_mult
            base_imponible_bs  = base_imponible_ref * tasa_mult
            iva_bs             = iva_ref * tasa_mult
            neto_bs            = neto_ref * tasa_mult
            desc_bs            = 0.0

            neg = fmt_auto_neg

            header = {
                'Pedido': p.get('PEDIDO', ''), 'FacturaNo': str(p.get('NUMFAC_REAL', '')),
                'Fecha': '/'.join(str(p.get('FECHA_EMISION', '')).split(' ')[0].split('-')[::-1]) if p.get('FECHA_EMISION') else '',
                'RazonSocial': p.get('NOMBRECLIENTE') or '',
                'DireccionEnvio': p.get('DIRECCION_CLIENTE') or '',
                'DirDespacho': p.get('DIRECCION_ENVIO') or '',
                'Vendedor': p.get('NOMBREVENDEDOR') or '', 'TasaVal': tasa, 'TasaStr': fmt_auto(tasa),
                'CondicionPago': p.get('FORMA_PAGO') or 'CONTADO', 'RIF': p.get('RIF_CLIENTE') or '',
                'CodCliente': p.get('CODCLIENTE') or '',
                'Unidades': total_unidades,
                'Bultos': '-',
                'FacturaAfectada': str(p.get('FACTURA_AFECTADA') or ''),
                'SubTotalRef': fmt_auto(sub_ref), 'BaseExentaRef': fmt_auto(base_exenta_ref),
                'BaseImponibleRef': fmt_auto(base_imponible_ref), 'IVA_Ref': fmt_auto(iva_ref),
                'DescRef': fmt_auto(desc_ref), 'NetoRef': fmt_auto(neto_ref),
                'SubTotalBs': fmt_auto(sub_bs), 'BaseExentaBs': fmt_auto(base_exenta_bs),
                'BaseImponibleBs': fmt_auto(base_imponible_bs), 'IVA_Bs': fmt_auto(iva_bs),
                'DescBs': fmt_auto(desc_bs), 'NetoBs': fmt_auto(neto_bs),
                'Direccion': CONFIG['empresa']['direccion'],
                'SICM': p.get('SICM') or CONFIG['empresa']['sicm'],
                'Ruta': p.get('RUTA_DESCRIPCION') or '-',
                'TipoDoc': 'Nota de Crédito',
            }

            items = []
            for r in rows:
                sub_usd  = abs(float(r['SUBTOTAL'] or 0))
                iva_pct  = float(r['IVA_NUMERICO'] or 0) / 100
                neto_usd = sub_usd * (1 + iva_pct)
                cant     = abs(int(r['CANTIDAD_ARTICULOS'] or 0))
                prec_usd = sub_usd / cant if cant else 0
                items.append({
                    'Desc':  r.get('DESCRIPCION_ARTICULO', ''),
                    'Cant':  cant,
                    'Lote':  r.get('LOTE_ARTICULO') or '-',
                    'Vence': fmt_vence(r.get('FECHA_VENCIMIETO_ARTICULO')),
                    'Prec$': fmt_auto(prec_usd),
                    'PrecBs': fmt_auto(prec_usd * tasa_mult),
                    'Sub$':  fmt_auto(sub_usd),
                    'SubTotalBs': fmt_auto(sub_usd * tasa_mult),
                    'Neto':  fmt_auto(neto_usd),
                    'NetoBs': fmt_auto(neto_usd * tasa_mult),
                    'IVA_P': r.get('PORCENTAJE_IVA') or '0%',
                })
            header['es_financiera'] = es_financiera
            return header, items
        except Exception as e:
            print(f"Error: {e}")
            return None, None

    def get_datos_debito(self, numserie, numerofac):
        if not self._skip_sleep:
            print(f"Esperando 5 segundos para que el documento se registre en DB...")
            time.sleep(3)
        sql_query = f"""
SELECT DISTINCT
  FACV.NUMSERIE,
  FACV.NUMFACTURA,
  CAST(FACV.FECHA AS DATE) AS FECHA,
  CLI.CODCLIENTE,
  CLI.NOMBRECLIENTE,
  ISNULL(CLI.NIF20, CLI.CIF) AS RIF_CLI,
  ISNULL(CLI.TELEFONO1, CLI.TELEFONO2) AS TELEFONO_CLI,
  ISNULL(CLI.DIRECCION1, CLI.DIRECCION2) AS DIRECCION_CLI,
  CCAM.ZONA AS RUTA,
  CCAM.TIPO AS FORMA_PAGO_CLI,
  FACV.TOTALBRUTO,
  FACV.TOTALIMPUESTOS,
  FACV.TOTALNETO,
  COTI.COTIZACION,
  ART.CODARTICULO,
  'DIFERENCIAL CAMBIARIO' AS DESCRIPCION_ART,
  ALB.PRECIO AS PRECIOUNI_USD,
  1 AS CANTIDAD_PRODUCTOS,
  CAST(ALB.PRECIO * ALB.UNID1 AS DECIMAL(16,2)) AS TOTAL_USD,
  FACV.TOTALNETO AS PRECIOUNI_BS,
  FACV.TOTALNETO AS TOTAL_BS,
  FC.FACAFECTA AS FACTURA_AFECTADA
FROM FACTURASVENTA AS FACV
INNER JOIN CLIENTES AS CLI WITH(NOLOCK) ON CLI.CODCLIENTE = FACV.CODCLIENTE
INNER JOIN TESORERIA AS TESO WITH(NOLOCK) ON TESO.SERIE = FACV.NUMSERIE AND TESO.NUMERO = FACV.NUMFACTURA
INNER JOIN CLIENTESCAMPOSLIBRES AS CCAM WITH(NOLOCK) ON CCAM.CODCLIENTE = CLI.CODCLIENTE
INNER JOIN COTIZACIONES AS COTI WITH(NOLOCK) ON COTI.FECHA = CAST(FACV.FECHA AS DATE)
LEFT JOIN ALBVENTALIN AS ALB WITH(NOLOCK) ON ALB.NUMSERIE = FACV.NUMSERIE AND ALB.NUMALBARAN = FACV.NUMFACTURA
LEFT JOIN ARTICULOS AS ART WITH(NOLOCK) ON ART.CODARTICULO = ALB.CODARTICULO
LEFT JOIN PRECIOSVENTA AS PRE WITH(NOLOCK) ON PRE.CODARTICULO = ART.CODARTICULO
LEFT JOIN FACTURASVENTACAMPOSLIBRES AS FC WITH(NOLOCK) ON FC.NUMSERIE = FACV.NUMSERIE AND FC.NUMFACTURA = FACV.NUMFACTURA
WHERE FACV.NUMSERIE = '{numserie}' AND FACV.NUMFACTURA = {numerofac}
        """
        try:
            conn = pymssql.connect(**CONFIG['database'])
            cursor = conn.cursor(as_dict=True)
            cursor.execute(sql_query)
            rows = cursor.fetchall()
            conn.close()
            if not rows: return None, None

            p = rows[0]
            fmt_num = fmt_auto
            tasa = float(p['COTIZACION'])

            # Todos los montos vienen en Bs directamente
            sub_bs  = float(p['TOTALBRUTO']    or 0)
            iva_bs  = float(p['TOTALIMPUESTOS'] or 0)
            neto_bs = float(p['TOTALNETO']      or 0)

            header = {
                'Pedido': '', 'FacturaNo': str(p.get('NUMFACTURA', '')),
                'Fecha': '/'.join(str(p.get('FECHA', '')).split(' ')[0].split('-')[::-1]),
                'FechaVencimiento': '',
                'FacturaAfectada': str(p.get('FACTURA_AFECTADA') or ''),
                'RazonSocial': p.get('NOMBRECLIENTE', ''),
                'DireccionEnvio': p.get('DIRECCION_CLI', ''),
                'DirDespacho': '',
                'Vendedor': '', 'TasaVal': tasa, 'TasaStr': fmt_auto(tasa),
                'CondicionPago': p.get('FORMA_PAGO_CLI', 'CONTADO'),
                'RIF': p.get('RIF_CLI', ''),
                'CodCliente': p.get('CODCLIENTE', ''),
                'Unidades': len(rows),
                'Bultos': '-',
                'SubTotalRef':      fmt_auto(sub_bs),
                'BaseExentaRef':    fmt_auto(0),
                'BaseImponibleRef': fmt_auto(sub_bs),
                'IVA_Ref':          fmt_auto(iva_bs),
                'DescRef':          fmt_auto(0),
                'NetoRef':          fmt_auto(neto_bs),
                'SubTotalBs':       fmt_auto(sub_bs),
                'BaseExentaBs':     fmt_auto(0),
                'BaseImponibleBs':  fmt_auto(sub_bs),
                'IVA_Bs':           fmt_auto(iva_bs),
                'DescBs':           fmt_auto(0),
                'NetoBs':           fmt_auto(neto_bs),
                'Direccion': CONFIG['empresa']['direccion'],
                'SICM': CONFIG['empresa']['sicm'],
                'Ruta': p.get('RUTA') or '-'
            }

            items = []
            for r in rows:
                prec_bs      = float(r['PRECIOUNI_BS'] or 0)
                sub_linea_bs = float(r['TOTAL_BS']     or 0)
                items.append({
                    'Desc':       r.get('DESCRIPCION_ART') or 'DIFERENCIAL CAMBIARIO',
                    'Cant':       1,
                    'Lote':       '-',
                    'Vence':      '-',
                    'PVP':        fmt_num(0), 'PVPBs': fmt_num(0),
                    'D1': '0', 'D2': '0', 'D3': '0', 'D4': '0',
                    'Prec$':      fmt_num(prec_bs),
                    'PrecBs':     fmt_num(prec_bs),
                    'Sub$':       fmt_num(sub_linea_bs),
                    'SubTotalBs': fmt_num(sub_linea_bs),
                    'Neto':       fmt_num(neto_bs),
                    'NetoBs':     fmt_num(neto_bs),
                    'IVA_P':      '16%'
                })
            return header, items
        except Exception as e:
            print(f"Error: {e}")
            return None, None

SERIES_NC = {'ZACN', 'ZAVN'}
SERIES_ND = {'ZACE', 'ZAVQ'}
SERIES_FAC = {'ZAVF'}

def tipo_documento(serie):
    if serie in SERIES_NC:
        return 'NC'
    if serie in SERIES_ND:
        return 'ND'
    if serie in SERIES_FAC:
        return 'FAC'
    return None

class GeneradorFactura:
    def __init__(self, filename):
        self.filename = filename
        self.c = canvas.Canvas(self.filename, pagesize=LETTER)
        self.width, self.height = LETTER

    def dibujar_encabezado(self, data):
        # Punto de inicio vertical
        y_top = self.height - 0.803*inch
        line_h = 11 # Separación entre líneas
        
        y_datos = y_top - line_h*1.5 
        
        # Columna Izquierda — Y dinámico para acomodar líneas variables
        x_derecha = self.width - 2.65*inch
        max_ancho = (x_derecha - 8) - 0.4*inch
        y_izq = y_datos

        self.c.setFont("Helvetica-Bold", 7)
        cliente_txt = f"CLIENTE: {data['RazonSocial']}"
        while cliente_txt and self.c.stringWidth(cliente_txt, "Helvetica-Bold", 7) > max_ancho:
            cliente_txt = cliente_txt[:-1]
        self.c.drawString(0.4*inch, y_izq, cliente_txt)
        y_izq -= line_h

        self.c.setFont("Helvetica-Bold", 7.5)
        self.c.drawString(0.4*inch, y_izq, f"RIF: {data['RIF']}")
        y_izq -= line_h

        def _draw_addr(label, texto):
            nonlocal y_izq
            self.c.setFont("Helvetica-Bold", 6.5)
            self.c.drawString(0.4*inch, y_izq, label)
            x_cont = 0.4*inch + self.c.stringWidth(label, "Helvetica-Bold", 6.5)
            self.c.setFont("Helvetica", 6.5)
            max_l1 = (x_derecha - 8) - x_cont
            max_l2 = (x_derecha - 8) - 0.4*inch
            if self.c.stringWidth(texto, "Helvetica", 6.5) <= max_l1:
                self.c.drawString(x_cont, y_izq, texto)
                y_izq -= line_h
            else:
                palabras = texto.split(' ')
                l1 = ''
                i = 0
                while i < len(palabras):
                    t = (l1 + ' ' + palabras[i]).strip()
                    if self.c.stringWidth(t, "Helvetica", 6.5) <= max_l1:
                        l1 = t; i += 1
                    else:
                        break
                l2 = ' '.join(palabras[i:])
                while l2 and self.c.stringWidth(l2, "Helvetica", 6.5) > max_l2:
                    l2 = l2[:-1]
                self.c.drawString(x_cont, y_izq, l1)
                y_izq -= line_h
                self.c.drawString(0.4*inch, y_izq, l2)
                y_izq -= line_h

        _draw_addr("Dirección Fiscal: ", str(data.get('DireccionEnvio', '')))
        dir_despacho = str(data.get('DirDespacho', '') or '')
        _draw_addr("Dirección Envío: ", dir_despacho)

        # Guardar psicotropico (observacion) para dibujarlo debajo de la tabla
        self.psicotropico = str(data.get('Psicotropico', '') or '').strip()

        # Columna Derecha (posiciones fijas)
        self.c.setFont("Helvetica-Bold", 9.5)
        titulo = data.get('TipoDoc', 'Factura')
        if titulo == 'Nota de Crédito':
            titulo_txt = f"Nota de Crédito N.º {data['FacturaNo']}"
        else:
            titulo_txt = f"{titulo} #: {data['FacturaNo']}"
        self.c.drawString(x_derecha, y_datos, titulo_txt)

        self.c.setFont("Helvetica-Bold", 7.5)
        self.c.drawString(x_derecha, y_datos - line_h, f"Fecha Emisión: {data['Fecha']}")
        if data.get('FacturaAfectada'):
            self.c.drawString(x_derecha, y_datos - line_h*2, f"Fac. Afectada: {data['FacturaAfectada']}")
        else:
            self.c.drawString(x_derecha, y_datos - line_h*2, f"Fecha Vencimiento: {data.get('FechaVencimiento', data['Fecha'])}")
        _in = '  (M)' if str(data.get('Pedido', '')).upper().endswith('NI') else '  (I)'
        self.c.drawString(x_derecha, y_datos - line_h*3, f"Condic. Pago: {data['CondicionPago']}{_in}")
        self.c.drawString(x_derecha, y_datos - line_h*4, f"Código de Cliente: {data.get('CodCliente', '')}")

        # Última fila (Vendedor) — debe quedar al menos tan abajo como la fila 5 de la derecha
        self.c.setFont("Helvetica", 6.5)
        y_inferior = min(y_izq, y_datos - line_h*4.0)
        if data.get('es_financiera'):
            texto_izq = f"Vendedor: {data['Vendedor']}     SICM: {data['SICM']}     Ruta: "
        else:
            texto_izq = f"Vendedor: {data['Vendedor']}     PEDIDO: {data['Pedido']}     SICM: {data['SICM']}     Ruta: "
        self.c.drawString(0.4*inch, y_inferior, texto_izq)
        x_ruta = 0.4*inch + self.c.stringWidth(texto_izq, "Helvetica", 6.5)
        ruta_txt = str(data['Ruta'])
        max_ruta_width = (x_derecha - 6) - x_ruta
        while ruta_txt and self.c.stringWidth(ruta_txt, "Helvetica", 6.5) > max_ruta_width:
            ruta_txt = ruta_txt[:-1]
        self.c.drawString(x_ruta, y_inferior, ruta_txt)
        self.header_bottom = y_inferior

    def dibujar_tabla(self, items, modo_nc=False, modo_nd=False, modo_nc_fin=False, semibold=False):
        y = getattr(self, 'header_bottom', self.height - 2.5*inch) - 18
        self.c.line(0.35*inch, y+10, self.width-0.35*inch, y+10)
        self.c.setFont("Helvetica-Bold", 7)
        if modo_nc_fin:
            self.c.drawString(0.4*inch,         y, "Descripcion")
            self.c.drawCentredString(5.50*inch, y, "Cant.")
            self.c.drawRightString(7.10*inch,   y, "Precio Uni Bs")
            self.c.drawRightString(8.10*inch,   y, "Neto")
        elif modo_nd:
            self.c.drawString(0.4*inch, y, "Descripcion")
            self.c.drawCentredString(3.20*inch, y, "Cant.")
            self.c.drawRightString(5.30*inch, y, "Precio Bs")
            self.c.drawRightString(6.80*inch, y, "SubTotal Bs")
            self.c.drawRightString(8.10*inch, y, "Neto Bs")
        elif modo_nc:
            self.c.drawString(0.4*inch, y, "Descripcion")
            self.c.drawCentredString(3.25*inch, y, "Cant.")
            self.c.drawString(3.40*inch, y, "Lote")
            self.c.drawString(3.90*inch, y, "Vence")
            self.c.drawRightString(5.10*inch, y, "Precio Bs")
            self.c.drawRightString(6.20*inch, y, "SubTotal Bs")
            self.c.drawString(6.84*inch, y, "IVA %")
            self.c.drawRightString(8.10*inch, y, "Neto Bs")
        else:
            self.c.drawString(0.4*inch, y, "Descripcion")
            self.c.drawCentredString(2.49*inch, y, "Cant.")
            self.c.drawString(2.64*inch, y, "Lote")
            self.c.drawString(3.01*inch, y, "Vence")
            self.c.drawRightString(3.73*inch, y, "PVP")
            self.c.drawString(3.79*inch, y, "D/1")
            self.c.drawString(3.99*inch, y, "D/2")
            self.c.drawString(4.20*inch, y, "D/3")
            self.c.drawString(4.41*inch, y, "D/4")
            self.c.drawRightString(5.01*inch, y, "Prec $")
            self.c.drawRightString(5.55*inch, y, "Precio Bs")
            self.c.drawRightString(6.10*inch, y, "SubTotal $")
            self.c.drawRightString(6.72*inch, y, "SubTotal Bs")
            self.c.drawString(6.78*inch, y, "IVA %")
            self.c.drawRightString(7.57*inch, y, "Neto $")
            self.c.drawRightString(8.11*inch, y, "Neto Bs")
        self.c.line(0.35*inch, y-4, self.width-0.35*inch, y-4)
        y -= 15
        self.c.setFont("Helvetica", 5.7)
        if modo_nc_fin:
            max_desc_width = 4.6*inch
            max_lote_width = 0.01*inch
        elif modo_nd:
            max_desc_width = 2.7*inch
            max_lote_width = 0.01*inch
        elif modo_nc:
            max_desc_width = 2.8*inch
            max_lote_width = 0.45*inch
        else:
            max_desc_width = 2.8*inch - 0.4*inch
            max_lote_width = 0.34*inch
        offsets = (0, 0.2) if semibold else (0,)
        for item in items:
            desc = str(item['Desc'])
            while self.c.stringWidth(desc, "Helvetica", 6.0) > max_desc_width and desc:
                desc = desc[:-1]
            lote = str(item['Lote'])
            while self.c.stringWidth(lote, "Helvetica", 6.0) > max_lote_width and lote:
                lote = lote[:-1]
            iva_txt = "0% - (E)" if str(item['IVA_P']).strip() == "0%" else item['IVA_P']
            for ox in offsets:
                self.c.drawString(0.4*inch + ox, y, desc)
                if modo_nc_fin:
                    self.c.drawCentredString(5.50*inch + ox, y, str(item['Cant']))
                    self.c.drawRightString(7.10*inch + ox,   y, item['PrecBs'])
                    self.c.drawRightString(8.10*inch + ox,   y, item['SubTotalBs'])
                elif modo_nd:
                    self.c.drawCentredString(3.20*inch + ox, y, str(item['Cant']))
                    self.c.drawRightString(5.30*inch + ox, y, item['PrecBs'])
                    self.c.drawRightString(6.80*inch + ox, y, item['SubTotalBs'])
                    self.c.drawRightString(8.10*inch + ox, y, item['NetoBs'])
                elif modo_nc:
                    self.c.drawCentredString(3.25*inch + ox, y, str(item['Cant']))
                    self.c.drawString(3.40*inch + ox, y, lote)
                    self.c.drawString(3.90*inch + ox, y, item['Vence'])
                    self.c.drawRightString(5.10*inch + ox, y, item['PrecBs'])
                    self.c.drawRightString(6.20*inch + ox, y, item['SubTotalBs'])
                    self.c.drawString(6.84*inch + ox, y, iva_txt)
                    self.c.drawRightString(8.10*inch + ox, y, item['NetoBs'])
                else:
                    self.c.drawCentredString(2.49*inch + ox, y, str(item['Cant']))
                    self.c.drawString(2.64*inch + ox, y, lote)
                    self.c.drawString(3.01*inch + ox, y, item['Vence'])
                    self.c.drawRightString(3.73*inch + ox, y, item['PVPBs'])
                    self.c.drawString(3.79*inch + ox, y, item['D1'])
                    self.c.drawString(3.99*inch + ox, y, item['D2'])
                    self.c.drawString(4.20*inch + ox, y, item['D3'])
                    self.c.drawString(4.41*inch + ox, y, item['D4'])
                    self.c.drawRightString(5.01*inch + ox, y, item['Prec$'])
                    self.c.drawRightString(5.55*inch + ox, y, item['PrecBs'])
                    self.c.drawRightString(6.10*inch + ox, y, item['Sub$'])
                    self.c.drawRightString(6.72*inch + ox, y, item['SubTotalBs'])
                    self.c.drawString(6.78*inch + ox, y, iva_txt)
                    self.c.drawRightString(7.57*inch + ox, y, item['Neto'])
                    self.c.drawRightString(8.11*inch + ox, y, item['NetoBs'])
            y -= 10.5

        # Debajo de todos los articulos, centrado: #SACS solo si hay observacion
        psico = getattr(self, 'psicotropico', '')
        if psico and psico.strip().lower() not in ('', 'none', 'null'):
            y -= 6
            self.c.setFont("Helvetica-Bold", 7)
            self.c.drawCentredString(self.width/2, y, f"#SACS: {psico.strip()}")

    def dibujar_pie(self, totals, modo_nc=False):
        y_pie = 2.1*inch
        self.c.rect(0.4*inch, y_pie, 3.3*inch, 0.45*inch)
        self.c.setFont("Helvetica-Bold", 7)
        self.c.drawString(0.45*inch, y_pie + 0.3*inch, "INTERCONTINENTAL")
        self.c.setFont("Helvetica", 6)
        sicm_empresa = CONFIG['empresa'].get('sicm') or '41087'
        self.c.drawString(0.45*inch, y_pie + 0.1*inch, f"SICM {sicm_empresa}")
        self.c.setFont("Helvetica-Bold", 9)
        self.c.drawString(1.55*inch, y_pie + 0.2*inch, f"Unidades: {int(totals['Unidades'])}")
        self.c.drawString(2.75*inch, y_pie + 0.2*inch, f"Tasa: {totals['TasaStr']}")
        self.c.rect(4.9*inch, y_pie - 0.55*inch, 3.2*inch, 1.0*inch)
        labels_bs = ["Sub-Total Bs", "Base Exenta Bs", "Base Imponible Bs", "Total IVA (16%) Bs", "Total a pagar Bs"]
        vals_bs = [totals['SubTotalBs'], totals['BaseExentaBs'], totals['BaseImponibleBs'], totals['IVA_Bs'], totals['NetoBs']]
        curr_y = y_pie + 0.3*inch
        if modo_nc:
            for i in range(5):
                lbl_font, val_font = (7.5, 9.5) if "Total a" in labels_bs[i] else (7.5, 8.5)
                self.c.setFont("Helvetica-Bold", lbl_font)
                self.c.drawString(4.93*inch, curr_y, labels_bs[i])
                self.c.setFont("Helvetica-Bold", val_font)
                self.c.drawRightString(8.0*inch, curr_y, vals_bs[i])
                curr_y -= 13.5
        else:
            self.c.line(6.4*inch, y_pie - 0.55*inch, 6.4*inch, y_pie + 0.45*inch)
            labels_ref = ["Sub-Total Ref", "Base Exenta Ref", "Base Imponible Ref", "Total IVA (16%) Ref", "Total a pagar Ref"]
            vals_ref = [totals['SubTotalRef'], totals['BaseExentaRef'], totals['BaseImponibleRef'], totals['IVA_Ref'], totals['NetoRef']]
            for i in range(5):
                lbl_font, val_font = (6.5, 8.5) if "Total a" in labels_ref[i] else (6.5, 7.5)
                self.c.setFont("Helvetica-Bold", lbl_font)
                self.c.drawString(4.93*inch, curr_y, labels_ref[i])
                self.c.drawString(6.45*inch, curr_y, labels_bs[i])
                self.c.setFont("Helvetica-Bold", val_font)
                self.c.drawRightString(6.35*inch, curr_y, vals_ref[i])
                self.c.drawRightString(8.0*inch, curr_y, vals_bs[i])
                curr_y -= 13.5

    def guardar(self):
        self.c.save()

def escribir_log(mensaje):
    exe_dir = os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else __file__)
    ruta_log = os.path.join(exe_dir, 'debug.log')
    with open(ruta_log, 'a', encoding='utf-8') as f:
        f.write(f"[{__import__('datetime').datetime.now()}] {mensaje}\n")

def extraer_datos_de_xml(ruta_archivo):
    """ Busca tipodoc, serie y numero dentro de un archivo xml """
    try:
        tree = ET.parse(ruta_archivo)
        root = tree.getroot()

        with open(ruta_archivo, 'r', encoding='utf-8', errors='ignore') as f:
            escribir_log(f"XML recibido:\n{f.read()}")

        tipodoc = root.find('.//tipodoc')
        if tipodoc is None:
            tipodoc = root.find('tipodoc')

        serie = root.find('.//serie')
        if serie is None:
            serie = root.find('serie')

        numero = root.find('.//numero')
        if numero is None:
            numero = root.find('numero')

        escribir_log(f"tipodoc={tipodoc.text if tipodoc is not None else 'None'} | serie={serie.text if serie is not None else 'None'} | numero={numero.text if numero is not None else 'None'}")

        if tipodoc is None or tipodoc.text != 'FACVENTA':
            sys.exit(0)

        if serie is None or numero is None:
            sys.exit(0)

        return serie.text.strip(), numero.text.strip(), None
    except Exception as e:
        escribir_log(f"Excepcion: {e}")
        sys.exit(0)

    
if __name__ == "__main__":
    serie = None
    numero = None
    
    # Obtener el directorio donde se encuentra el .exe o el script
    exe_dir = os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else __file__)
    ruta_automatica = os.path.join(exe_dir, 'DatosFactura.xml')

    # 1. Intentar por argumento de línea de comandos (drag & drop)
    if len(sys.argv) > 1:
        ruta = sys.argv[1]
        nombre_archivo = os.path.basename(ruta)
        
        if nombre_archivo.lower() == 'datosfactura.xml':
            print(f"Procesando archivo: {ruta}")
            serie, numero, error_msg = extraer_datos_de_xml(ruta)
            if not serie or not numero:
                sys.exit()
        else: 
            root = tk.Tk()
            root.withdraw()
            messagebox.showerror("Error", f"El archivo debe llamarse 'DatosFactura.xml'. (Recibido: {nombre_archivo})")
            sys.exit()

            
    # 2. Si no hay argumentos, intentar buscar automáticamente en la misma carpeta
    if not serie or not numero:
        if os.path.exists(ruta_automatica):
            print(f"Archivo detectado automáticamente: {ruta_automatica}")
            serie, numero, error_msg = extraer_datos_de_xml(ruta_automatica)
            if not serie or not numero:
                sys.exit()



    # 3. Si sigue sin datos, ya no preguntamos por consola (se cerrará)

    if not serie or not numero:
        sys.exit()

        
    db = Database()
    tipo = tipo_documento(serie)

    if tipo == 'NC':
        header, items = db.get_datos_nota(serie, numero)
        titulo = 'Nota de Crédito'
    elif tipo == 'ND':
        header, items = db.get_datos_debito(serie, numero)
        titulo = 'Nota de Débito'
    elif tipo == 'FAC':
        header, items = db.get_datos_factura(serie, numero)
        titulo = 'Factura'
    else:
        escribir_log(f"Serie '{serie}' no reconocida, se ignora.")
        sys.exit(0)

    if header:
        header['TipoDoc'] = titulo
        import tempfile
        archivo = os.path.join(tempfile.gettempdir(), f"{titulo.replace(' ', '_')}_{serie}_{numero}.pdf")

        es_fin = tipo == 'NC' and header.get('es_financiera', False)
        pdf = GeneradorFactura(archivo)
        pdf.dibujar_encabezado(header)
        pdf.dibujar_tabla(items, modo_nc=(tipo == 'NC' and not es_fin), modo_nd=(tipo == 'ND' and not es_fin), modo_nc_fin=es_fin)
        pdf.dibujar_pie(header, modo_nc=(tipo in ('NC', 'ND')))
        pdf.guardar()

        # Copiar PDF a carpeta compartida
        carpetas_destino = {
            'FAC': r'J:\PDF_SISTEMA\FACTURAS',
            'NC':  r'J:\PDF_SISTEMA\NOTAS DE CREDITO',
        }
        carpeta = carpetas_destino.get(tipo)
        if carpeta:
            try:
                os.makedirs(carpeta, exist_ok=True)
                shutil.copy2(archivo, os.path.join(carpeta, os.path.basename(archivo)))
            except Exception as e:
                escribir_log(f"Error copiando PDF a carpeta compartida: {e}")

        try:
            os.startfile(archivo)
        except Exception:
            pass
    else:
        if tipo == 'FAC':
            root = tk.Tk()
            root.withdraw()
            messagebox.showerror("Error", f"No se encontró el documento {serie}-{numero} en la base de datos.")
        else:
            escribir_log(f"Documento {serie}-{numero} (tipo={tipo}) no encontrado - ignorado silenciosamente.")
