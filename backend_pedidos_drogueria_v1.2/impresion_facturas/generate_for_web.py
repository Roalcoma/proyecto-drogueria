import sys
import os
import json
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__ if not getattr(sys, 'frozen', False) else sys.executable)))

import main
from main import Database, GeneradorFactura, tipo_documento, CONFIG

main.escribir_log = lambda msg: None

# Sobreescribir credenciales si el proceso padre las pasa por env vars
import os as _os
_db = main.CONFIG['database']
if _os.environ.get('DB_SERVER'):   _db['server']   = _os.environ['DB_SERVER']
if _os.environ.get('DB_USER'):     _db['user']      = _os.environ['DB_USER']
if _os.environ.get('DB_PASSWORD'): _db['password']  = _os.environ['DB_PASSWORD']
if _os.environ.get('DB_DATABASE'): _db['database']  = _os.environ['DB_DATABASE']
if _os.environ.get('DB_PORT'):     _db['port']      = int(_os.environ['DB_PORT'])

def main_web():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Uso: generate_for_web SERIE NUMERO [DATABASE]"}))
        return

    serie = sys.argv[1].strip()
    numero = sys.argv[2].strip()
    database = sys.argv[3].strip() if len(sys.argv) > 3 else None

    if database:
        CONFIG['database']['database'] = database

    tipo = tipo_documento(serie)
    if not tipo:
        print(json.dumps({"error": f"Serie '{serie}' no reconocida"}))
        return

    db = Database()
    db._skip_sleep = True

    try:
        if tipo == 'NC':
            header, items = db.get_datos_nota(serie, numero)
            titulo = 'Nota de Crédito'
        elif tipo == 'ND':
            header, items = db.get_datos_debito(serie, numero)
            titulo = 'Nota de Débito'
        else:
            header, items = db.get_datos_factura(serie, numero)
            titulo = 'Factura'
    except Exception as e:
        print(json.dumps({"error": f"Error BD: {str(e)}"}))
        return

    if not header:
        print(json.dumps({"error": f"No se encontró el documento {serie}-{numero}"}))
        return

    header['TipoDoc'] = titulo
    archivo = os.path.join(tempfile.gettempdir(), f"web_{serie}_{numero}.pdf")

    try:
        pdf = GeneradorFactura(archivo)
        pdf.dibujar_encabezado(header)
        pdf.dibujar_tabla(items, modo_nc=(tipo == 'NC'))
        pdf.dibujar_pie(header, modo_nc=(tipo == 'NC'))
        pdf.guardar()
    except Exception as e:
        print(json.dumps({"error": f"Error generando PDF: {str(e)}"}))
        return

    print(json.dumps({"path": archivo}))

if __name__ == "__main__":
    main_web()
