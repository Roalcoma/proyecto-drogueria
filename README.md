# APP Pedidos — Droguería Intercontinental

Sistema web de toma, control y autorización de pedidos para la droguería, montado sobre la base de datos del ERP **ICG**. Concentra en un solo flujo los pedidos que hacen los vendedores desde la app y los que llegan solos por e-commerce, iCompras, FTP, Farcompras y Seped, controla el stock disponible y deja todo auditado.

> Versión actual: ver `APP_VERSION` en [`frontend_pedidos_drogueria_v1.2/src/data/changelog.ts`](frontend_pedidos_drogueria_v1.2/src/data/changelog.ts).
> Documentación técnica completa (endpoints, base de datos, reglas de negocio): [`docs/DOCUMENTACION.md`](docs/DOCUMENTACION.md).

## Funcionalidades

- **Catálogo y carrito** con precios por tarifa, descuentos en cascada (D1–D4), IVA, promociones y stock en tiempo real.
- **Control de Estatus**: reserva de stock bloqueante, autorización (incluso parcial), fusión, cancelación, PDF, fallas y auditoría completa.
- **Psicotrópicos** en pedido separado con aprobación sanitaria.
- **Promociones** con escalas y grupos de artículos/clientes (importación desde Excel), promociones especiales y descuento por artículo.
- **Integraciones automáticas**: carpeta e-commerce, iCompras, servidor FTP por cliente, Farcompras, bot del portal Seped.
- **Rutero de entrega** con picking por código de barras.
- **Metas de vendedores**, **reclamos**, **compras/rechequeo**, **reportería** y **reporte IMS** por correo.
- **Stock libre y alertas de sobregiro** causadas desde ICG.
- **Impresión de facturas** en lote (generador Python).
- **Administración**: usuarios y permisos por bitmask, conexión a BD, modo pruebas, branding, actualizador desde GitHub con rollback.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Vue 3, Vuetify 4, Pinia, Vue Router, Vite, TypeScript |
| Backend | Node.js 22, Express 5, TypeScript, `mssql` |
| Base de datos | SQL Server (la del ERP ICG) |
| Automatización web | Playwright (Chromium) para Seped |
| Impresión de facturas | Python 3 + PyInstaller |
| Servicio en Windows | NSSM |

```
Navegador ──► Backend Node.js (Express 5, puerto 9010)
                │  ├─ API REST
                │  └─ frontend compilado (frontend_pedidos_drogueria_v1.2/dist)
                ├─► SQL Server — base ICG + tablas propias APP_*
                ├─► SQL Server — base Rutero
                └─► E-commerce, FTP, Farcompras, iCompras, Seped, IMS por correo, monitor de stock
```

## Requisitos

- **Node.js 22** y npm.
- **SQL Server** con la base de ICG y un usuario con lectura/escritura y permiso para crear tablas (la app crea sus tablas `APP_*` al arrancar).
- **Windows** en el servidor (impresión de facturas, NSSM y reinicio automático lo asumen).
- **NSSM** si se instala como servicio.
- **Python 3** solo para ejecutar el generador de facturas sin el `.exe`.
- **Chromium de Playwright** solo si se usa Seped: `npx playwright install chromium`.

## Instalación

```bash
git clone https://github.com/Roalcoma/proyecto-drogueria.git
cd proyecto-drogueria/backend_pedidos_drogueria_v1.2
npm install
cd ../frontend_pedidos_drogueria_v1.2
npm install
```

## Configuración

### Backend — `backend_pedidos_drogueria_v1.2/config/connections.json`

Configuración principal; tiene prioridad sobre `.env` y se edita desde **Administración → Base de datos**. **No se sube al repositorio.**

```json
{
  "server": "localhost",
  "port": 1433,
  "user": "usuario_sql",
  "password": "cambiar",
  "dbName": "DROGUERIA",
  "dbGeneralName": "general_drogueria",
  "dbRutero": "DROGUERIA_RUTERO",
  "dbPruebas": "",
  "esquema": "dbo",
  "codAlmacen": "ALM",
  "tarifaBaseCatalogo": 1,
  "dptoPsicotropicos": 9,
  "maxLineasPorPedido": 10,
  "clavePickingAdmin": "cambiar",
  "zonaHoraria": "America/Caracas",
  "ftpHabilitado": false,
  "ftpPuerto": 21,
  "ftpPasivoMin": 40000,
  "ftpPasivoMax": 40100,
  "ftpIpExterna": "",
  "nssmServicioBackend": "",
  "nssmServicioFrontend": ""
}
```

| Clave | Para qué sirve |
|---|---|
| `codAlmacen` | Almacén de ICG del que se toma y reserva el stock. |
| `tarifaBaseCatalogo` | Tarifa de `PRECIOSVENTA` de la que salen los precios base. |
| `dptoPsicotropicos` | Sección de `ARTICULOS` que identifica psicotrópicos. |
| `maxLineasPorPedido` | Límite de líneas; los pedidos más largos se parten con sufijo `-1`, `-2`… |
| `dbPruebas` | Base usada en *modo pruebas* (vacía = producción). |
| `clavePickingAdmin` | Clave para iniciar viaje en el rutero. |
| `nssmServicioBackend` / `nssmServicioFrontend` | Servicios NSSM que reinicia el actualizador. |

### Backend — `backend_pedidos_drogueria_v1.2/.env`

```env
PORT=9010
JWT_SECRET=una_clave_larga_y_aleatoria
JWT_EXPIRES_IN=8h

# Solo si no existe config/connections.json
DB_SERVER=localhost
DB_PORT=1433
DB_USER=usuario_sql
DB_PASSWORD=cambiar
DB_NAME=DROGUERIA
DB_PRUEBAS=
DB_RUTERO=DROGUERIA_RUTERO
DB_GENERAL_NAME=general_drogueria
DB_ESQUEMA=dbo

# Monedas para cotización y conversión a USD
MONEDA_COTIZACION=1
USD=1
VED=2

# Opcional: ruta alternativa del frontend compilado
# FRONTEND_DIST=../frontend_pedidos_drogueria_v1.2/dist
```

> Configurar siempre un `JWT_SECRET` propio: si falta, el backend usa uno por defecto inseguro.

### Frontend — `frontend_pedidos_drogueria_v1.2/.env`

```env
# Desarrollo: URL del backend. En producción (.env.production) va vacía: mismo origen.
VITE_API_URL=http://localhost:9010
```

Al primer arranque el backend crea las tablas `APP_*` que falten; no hace falta correr scripts SQL.

## Ejecución

| Entorno | Backend | Frontend |
|---|---|---|
| Desarrollo | `npm run dev` (nodemon + ts-node) | `npm run dev` (Vite) |
| Producción | `npm run build` y `npm start` (`node dist/index.js`) | `npm run build-only`; el backend sirve `dist/` |

> `npm run build` del frontend corre un type-check estricto que hoy falla por errores heredados; `build-only` genera el paquete igual.

### ⚠️ Probar en local con una copia de producción

La copia trae **activas** las integraciones reales (carpeta e-commerce, Seped con credenciales verdaderas, correo IMS). Antes de arrancar, desactivarlas en la copia:

```sql
UPDATE APP_ECOMMERCE_CONFIG  SET RUTA = '';
UPDATE APP_SEPED_CONFIG      SET HABILITADO = 'F';
UPDATE APP_FARCOMPRAS_CONFIG SET HABILITADO = 'F';
UPDATE APP_ICOMPRAS_CONFIG   SET HABILITADO = 'F';
UPDATE APP_IMS_EMAIL_CONFIG  SET HABILITADO = 'F';
```

## Despliegue

### Servicio Windows con NSSM

Ejecutar el código **compilado** (menos memoria, sin reinicios por cambios de archivos):

```
nssm install PedidosBackend "C:\Program Files\nodejs\node.exe" "dist\index.js"
nssm set PedidosBackend AppDirectory "C:\ruta\backend_pedidos_drogueria_v1.2"
nssm set PedidosBackend AppKillProcessTree 1
```

Cargar el nombre del servicio en `nssmServicioBackend` para que el actualizador pueda reiniciarlo.

### Actualizador integrado (Administración → "Actualizar Aplicativo desde GitHub")

1. Respalda la versión instalada en `_backups/` (últimos 5).
2. Descarga `main` de GitHub como ZIP.
3. Copia los archivos sin tocar `.env`, `config/connections.json`, `node_modules`, `.git` ni los respaldos.
4. Reinicia los servicios NSSM.

- **No compila el backend**: si el servicio corre `dist/index.js`, ejecutar `npm run build` antes de reiniciar.
- El frontend compilado viaja en el repositorio.
- Con dependencias nuevas, correr `npm install` en el servidor.
- **Volver atrás**: Administración → "Restaurar versión anterior".
- Después de actualizar, refrescar con **Ctrl+F5**.

## Estructura

```
├── backend_pedidos_drogueria_v1.2/
│   ├── src/
│   │   ├── index.ts           # Arranque: rutas, tablas, procesos automáticos, cierre ordenado
│   │   ├── routers/           # Rutas y permisos de cada endpoint
│   │   ├── controllers/       # Validación de entrada y respuesta HTTP
│   │   ├── services/          # Lógica de negocio y SQL
│   │   ├── middleware/        # JWT y permisos por módulo
│   │   └── db/                # Conexiones (producción / pruebas / rutero)
│   ├── config/                # connections.json — NO se sube
│   ├── impresion_facturas/    # Generador de PDF de facturas (Python)
│   └── scripts/               # Diagnóstico y mantenimiento
├── frontend_pedidos_drogueria_v1.2/
│   ├── src/
│   │   ├── pages/             # Una vista por módulo
│   │   ├── stores/            # Sesión, carrito, promociones, branding
│   │   ├── router/            # Rutas y control de acceso
│   │   └── data/changelog.ts  # Versión y novedades de la app
│   └── dist/                  # Compilado (se versiona; lo sirve el backend)
├── docs/DOCUMENTACION.md      # Documentación técnica
├── CLAUDE.md                  # Guía para agentes de IA
└── CHANGELOG.md               # Historial antiguo (el vigente está en changelog.ts)
```

## Seguridad

- Nunca subir `config/connections.json`, `.env` ni `impresion_facturas/settings.cfg` (están en `.gitignore`).
- Precios, descuentos, totales y permisos los decide el servidor.
- La configuración de integraciones guarda credenciales en la base (`APP_SEPED_CONFIG`, `APP_IMS_EMAIL_CONFIG`): restringir el acceso a esas tablas.

## Convenciones de desarrollo

- Cada cambio actualiza `changelog.ts` (`APP_VERSION`, `VERSIONES`, `COMMITS`).
- Commits con formato `tipo(versión o área): descripción`, ej. `fix(v1.2.43): ...`.
- Recompilar el frontend (`npm run build-only`) antes de subir si cambió algo del frontend.
- Lecturas de ICG con `WITH (NOLOCK)`; operaciones que reservan stock dentro de una transacción con `PedidosServices.bloquearStock`.
