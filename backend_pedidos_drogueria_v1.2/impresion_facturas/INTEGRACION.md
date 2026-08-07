# Generador de facturas PDF — integración con cobranza-app

Este paquete contiene el generador de PDFs (`formato-drogueria`) usado por `cobranza-app`
para la opción "Ver Factura" (click derecho sobre una factura en la tabla).

## Archivos

- `main.py` — lógica principal: lee la factura de la BD (SQL Server) y arma el PDF.
- `generate_for_web.py` — wrapper que main.py usa para el modo "web" (recibe serie/numero/database por argv, imprime JSON con la ruta del PDF generado en stdout).
- `generate_for_web.spec` — spec de PyInstaller para compilar `generate_for_web.exe`.
- `requirements.txt` — dependencias Python.
- `logonuevo.png` — logo usado en el PDF.
- `settings.cfg` — credenciales de conexión a la BD (cifradas en formato "Custom Hex", las descifra `main.py`).

## Cómo lo llama cobranza-app (Node/Express)

No forma parte de este paquete — se incluye aquí solo como referencia de cómo se invoca el `.exe`.

**Backend (`server.js`):**
```js
app.get('/api/ver-factura/:serie/:numero', requireAuth, (req, res) => {
    const { serie, numero } = req.params;
    const database = req.session.user.empresa.database;
    const exePath = path.join(__dirname, 'generate_for_web.exe');
    const py = spawn(exePath, [serie, numero, database]);
    let stdout = '', stderr = '';
    py.stdout.on('data', d => stdout += d);
    py.stderr.on('data', d => stderr += d);
    py.on('close', code => {
        const result = JSON.parse(stdout.trim().split('\n').pop());
        // result.path -> ruta del PDF generado, se transmite como respuesta
        // y se borra el archivo temporal al terminar de enviarlo.
    });
});
```

**Frontend (`script.js`):** al hacer click derecho sobre una fila de factura se muestra un menú
contextual; el botón "Ver Factura" llama a `verFactura()`, que extrae serie/número de la fila
y abre `/api/ver-factura/{serie}/{numero}` en una pestaña nueva (el navegador renderiza el PDF
que devuelve el endpoint).

## Nota sobre `settings.cfg`

Contiene credenciales reales de conexión a la base de datos de Droguería. Trátalo como secreto —
no lo subas a ningún repo público ni lo compartas más allá de este uso puntual.
