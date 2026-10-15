# APP Pedidos — Droguería Intercontinental

Sistema web de toma, control y autorización de pedidos para la droguería, montado sobre la base de datos del ERP **ICG**. Concentra en un solo flujo los pedidos que hacen los vendedores desde la app y los que llegan solos por e-commerce, FTP, Farcompras y Seped, controla el stock disponible y deja todo auditado.

> Versión actual: ver `APP_VERSION` en [`frontend_pedidos_drogueria_v1.2/src/data/changelog.ts`](frontend_pedidos_drogueria_v1.2/src/data/changelog.ts). El historial de cambios visible en la app sale de ese mismo archivo.

---

## Índice

1. [Arquitectura](#arquitectura)
2. [Estructura del repositorio](#estructura-del-repositorio)
3. [Requisitos](#requisitos)
4. [Instalación y configuración](#instalación-y-configuración)
5. [Ejecución](#ejecución)
6. [Puesta en producción y actualizaciones](#puesta-en-producción-y-actualizaciones)
7. [Flujo de un pedido y reglas de stock](#flujo-de-un-pedido-y-reglas-de-stock)
8. [Montos: cómo se calcula un pedido](#montos-cómo-se-calcula-un-pedido)
9. [Integraciones y procesos automáticos](#integraciones-y-procesos-automáticos)
10. [Módulos y permisos](#módulos-y-permisos)
11. [Base de datos](#base-de-datos)
12. [API](#api)
13. [Seguridad](#seguridad)
14. [Solución de problemas](#solución-de-problemas)
15. [Convenciones de desarrollo](#convenciones-de-desarrollo)

---

## Arquitectura

```
Navegador ──► Backend Node.js (Express 5, puerto 9010)
                │  ├─ sirve la API REST
                │  └─ sirve el frontend compilado (frontend/dist)
                │
                ├─► SQL Server — base del ERP ICG (ej. DROGUERIA)
                │      tablas de ICG (ARTICULOS, STOCKS, CLIENTES, ...) + tablas propias APP_*
                ├─► SQL Server — base del Rutero (DROGUERIA_RUTERO)
                └─► Procesos automáticos: e-commerce, FTP, Farcompras, iCompras, Seped,
                    reporte IMS por correo, monitor de sobregiros de stock
```

| Capa | Tecnología |
|---|---|
| Frontend | Vue 3 + Composition API, Vuetify, Pinia, Vite, TypeScript |
| Backend | Node.js 22, Express 5, TypeScript, `mssql` |
| Base de datos | SQL Server (la del ERP ICG) |
| Automatización web | Playwright (Chromium) para Seped |
| Impresión de facturas | Script Python (`impresion_facturas/`) compilado a `.exe` con PyInstaller |
| Servicio en Windows | NSSM |

En producción **un solo proceso** sirve la API y el frontend: el backend publica `frontend_pedidos_drogueria_v1.2/dist`, por eso el frontend compilado se versiona en el repositorio.

---

## Estructura del repositorio

```
├── backend_pedidos_drogueria_v1.2/
│   ├── src/
│   │   ├── index.ts              # Arranque: rutas, tablas, procesos automáticos, cierre ordenado
│   │   ├── routers/              # Definición de rutas y permisos de cada endpoint
│   │   ├── controllers/          # Validación de entrada y respuesta HTTP
│   │   ├── services/             # Lógica de negocio y SQL
│   │   ├── middleware/           # Autenticación (JWT) y permisos por módulo
│   │   └── db/                   # Conexión a SQL Server (producción / pruebas / rutero)
│   ├── config/connections.json   # Configuración local — NO se sube (ver abajo)
│   ├── impresion_facturas/       # Generador de PDF de facturas (Python)
│   ├── scripts/                  # Scripts sueltos de diagnóstico y mantenimiento
│   └── .env                      # Variables de entorno — NO se sube
├── frontend_pedidos_drogueria_v1.2/
│   ├── src/
│   │   ├── pages/                # Una vista por módulo (Catálogo, Carrito, Control de Estatus, ...)
│   │   ├── stores/               # Estado global (sesión, carrito, promociones)
│   │   ├── router/               # Rutas y control de acceso por módulo
│   │   └── data/changelog.ts     # Versión y novedades que muestra la app
│   └── dist/                     # Frontend compilado (se versiona, lo sirve el backend)
├── CHANGELOG.md                  # Historial antiguo (el vigente está en changelog.ts)
└── README.md
```

---

## Requisitos

- **Node.js 22** y npm.
- **SQL Server** con la base de ICG y un usuario con permiso de lectura/escritura y de crear tablas (la app crea sus tablas `APP_*` al arrancar).
- **Windows** en el servidor (la impresión de facturas, NSSM y el reinicio automático asumen Windows).
- **NSSM** si se instala como servicio.
- **Python 3** solo si se quiere ejecutar el generador de facturas sin el `.exe` compilado.
- **Chromium de Playwright** solo si se usa la integración Seped: `npx playwright install chromium`.

---

## Instalación y configuración

```bash
git clone https://github.com/Roalcoma/proyecto-drogueria.git
cd proyecto-drogueria/backend_pedidos_drogueria_v1.2
npm install
cd ../frontend_pedidos_drogueria_v1.2
npm install
```

### 1. Backend — `config/connections.json`

Es la configuración principal. Tiene prioridad sobre `.env` y se puede editar desde **Administración → Base de datos** dentro de la app. **Nunca se sube al repositorio.**

```json
{
  "server": "localhost",
  "port": 1433,
  "user": "usuario_sql",
  "password": "********",
  "dbName": "DROGUERIA",
  "dbGeneralName": "general_drogueria",
  "dbRutero": "DROGUERIA_RUTERO",
  "dbPruebas": "",
  "esquema": "dbo",
  "codAlmacen": "ZAV",
  "tarifaBaseCatalogo": 1,
  "dptoPsicotropicos": 9,
  "maxLineasPorPedido": 10,
  "clavePickingAdmin": "********",
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
| `codAlmacen` | Almacén de ICG del que se toma y se reserva el stock. |
| `tarifaBaseCatalogo` | Tarifa de `PRECIOSVENTA` de la que salen los precios base. |
| `dptoPsicotropicos` | Sección de `ARTICULOS` que identifica psicotrópicos (van a aprobación sanitaria). |
| `maxLineasPorPedido` | Límite de líneas por pedido; los más largos se parten en varios pedidos con sufijo `-1`, `-2`... |
| `dbPruebas` | Base usada cuando el usuario activa *modo pruebas*. Si está vacía, usa la de producción. |
| `nssmServicioBackend` / `nssmServicioFrontend` | Nombres de los servicios NSSM que el actualizador reinicia. Vacíos = reinicio manual. |

### 2. Backend — `.env`

| Variable | Uso |
|---|---|
| `PORT` | Puerto HTTP (por defecto 9010). |
| `JWT_SECRET` | Clave para firmar las sesiones. **Obligatoria y secreta**; si falta se usa una por defecto insegura. |
| `JWT_EXPIRES_IN` | Duración de la sesión (ej. `8h`). |
| `DB_SERVER`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_GENERAL_NAME`, `DB_PRUEBAS` | Alternativa a `connections.json` si ese archivo no existe. |
| `MONEDA_COTIZACION`, `USD`, `VED` | Códigos de moneda usados para convertir importes y riesgo de clientes. |

### 3. Frontend — `.env` / `.env.production`

| Variable | Uso |
|---|---|
| `VITE_API_URL` | URL del backend. En producción va **vacía**: el frontend lo sirve el propio backend y usa el mismo origen. En desarrollo, ej. `http://localhost:9010`. |

### 4. Primer arranque

Al iniciar, el backend verifica y crea solo las tablas `APP_*` que falten. No hace falta correr scripts SQL.

---

## Ejecución

| Entorno | Backend | Frontend |
|---|---|---|
| Desarrollo | `npm run dev` (nodemon + ts-node, recarga al guardar) | `npm run dev` (Vite) o usar el `dist` servido por el backend |
| Producción | `npm run build` y luego `npm start` (`node dist/index.js`) | `npm run build-only` y subir el `dist` |

```bash
# Backend en desarrollo
cd backend_pedidos_drogueria_v1.2 && npm run dev

# Compilar el frontend para que lo sirva el backend
cd frontend_pedidos_drogueria_v1.2 && npm run build-only
```

> `npm run build` del frontend corre además un chequeo estricto de tipos que hoy tiene errores heredados en archivos no relacionados; `build-only` genera el paquete igual.

### ⚠️ Probar en local con una copia de la base de producción

Una copia de producción trae **configuradas las integraciones reales**: la carpeta de red de e-commerce, el portal Seped con credenciales verdaderas (acepta pedidos de verdad) y el correo del reporte IMS. Si se arranca el backend completo contra esa copia, **consume archivos y actúa sobre sistemas de producción**. Antes de arrancar en local, apagarlas en la copia:

```sql
UPDATE APP_ECOMMERCE_CONFIG  SET RUTA = '';
UPDATE APP_SEPED_CONFIG      SET HABILITADO = 'F';
UPDATE APP_FARCOMPRAS_CONFIG SET HABILITADO = 'F';
UPDATE APP_ICOMPRAS_CONFIG   SET HABILITADO = 'F';
UPDATE APP_IMS_EMAIL_CONFIG  SET HABILITADO = 'F';
```

---

## Puesta en producción y actualizaciones

### Servicio Windows con NSSM

Recomendado: ejecutar el código **compilado**, no nodemon/ts-node (usa bastante menos memoria y no se reinicia solo cuando cambian archivos).

```
nssm install PedidosBackend "C:\Program Files\nodejs\node.exe" "dist\index.js"
nssm set PedidosBackend AppDirectory "C:\ruta\backend_pedidos_drogueria_v1.2"
nssm set PedidosBackend AppKillProcessTree 1
```

Cargar el nombre del servicio en `nssmServicioBackend` (connections.json) para que el actualizador pueda reiniciarlo.

### Actualizador integrado (Administración → "Actualizar Aplicativo desde GitHub")

1. Hace un **respaldo** de la versión instalada en `_backups/` (se guardan los últimos 5).
2. Descarga `main` de GitHub como ZIP.
3. Copia los archivos **sin tocar** `.env`, `config/connections.json`, `node_modules`, `.git` ni los respaldos.
4. Reinicia los servicios NSSM desde un script independiente (sobrevive al cierre del propio backend).

Notas:
- El actualizador **no compila el backend**. Si el servicio corre `node dist/index.js`, ejecutar `npm run build` en el backend antes de reiniciar.
- El frontend compilado viaja en el repositorio: no hay que compilar nada del frontend en el servidor.
- Si se agregan dependencias nuevas, correr `npm install` en el servidor.
- **Volver atrás:** Administración → "Restaurar versión anterior" permite volver a cualquiera de los últimos 5 respaldos. Las tablas que agregan las versiones nuevas son solo aditivas, así que volver atrás no rompe la base.
- Después de actualizar, los usuarios deben refrescar con **Ctrl+F5**.

---

## Flujo de un pedido y reglas de stock

### Estatus

```
                 ┌──────────────► CANCELADO
PENDIENTE ───► PENDIENTE POR AUTORIZACION ───► AUTORIZADO ───► EMPACADO / OK ───► ICG (facturado)
   ▲
APROBACION PSICOTROPICOS ──► SANIDAD ──┘ (aprobación sanitaria → PENDIENTE POR AUTORIZACION)
```

| Estatus | ¿Reserva stock? | Quién lo mueve |
|---|---|---|
| `PENDIENTE` | No | Se crea así (vendedor, e-commerce, FTP, Farcompras) |
| `PENDIENTE POR AUTORIZACION` | **Sí** | Cualquier usuario de Control de Estatus |
| `APROBACION PSICOTROPICOS`, `SANIDAD` | **Sí** | Pedidos con psicotrópicos; aprueba quien tiene *Aprobación Psicotrópicos* |
| `AUTORIZADO`, `EMPACADO`, `OK` | **Sí** | Autorizador |
| `ICG`, `FINALIZADO` | No (ya descontado en ICG) | Proceso externo de importación a ICG |
| `CANCELADO` | No | Según permisos |

### Reglas

- **Stock disponible** = stock del almacén (`STOCKS`, `codAlmacen`) − unidades de todos los pedidos en estatus que reservan.
- **PENDIENTE → PENDIENTE POR AUTORIZACION es el punto de reserva y es bloqueante**: si no hay stock, no avanza.
- **No se puede autorizar directo desde PENDIENTE**: siempre pasa antes por *PENDIENTE POR AUTORIZACION*.
- **Autorización parcial**: si al autorizar falta stock (porque bajó en ICG después de reservarse), se autorizan **solo las unidades disponibles**; las líneas se recortan, se recalcula el total y el faltante queda registrado como falla.
- Las reservas se hacen **de a una** (bloqueo `sp_getapplock`): dos usuarios no pueden reservar el mismo stock al mismo tiempo.
- La validación **suma por artículo**: el mismo código en varias líneas cuenta junto.
- Solo se **eliminan** pedidos en `PENDIENTE`; los demás se cancelan.
- Los psicotrópicos van siempre en un pedido separado (sufijo `P`) que pasa por aprobación sanitaria.

### Fallas y alertas

- **Fallas** (`APP_PEDIDO_FALLAS`): faltantes de stock registrados al intentar avanzar un pedido. Las filas con falla se marcan en amarillo en Control de Estatus; el botón de inventario muestra el faltante de ese momento o el histórico.
- **Alertas de sobregiro** (`APP_ALERTAS_STOCK`): un monitor revisa cada 5 minutos si lo reservado supera el stock de ICG. Como la app ya no deja reservar sin stock, un sobregiro significa que el stock **bajó desde ICG** (traspasos, albaranes directos, consumos). La alerta registra los pedidos afectados y los documentos de ICG de las 24 h previas, y se marca resuelta cuando se normaliza. Se consulta en **Stock libre y alertas**.

---

## Montos: cómo se calcula un pedido

**El servidor recalcula los montos de cada pedido; los valores que manda el navegador solo se toman como propuesta.**

- **Precio base**: `PRECIOSVENTA.PNETO` de la tarifa configurada. Al **editar** se respeta el precio que ya tenía cada línea, y al **copiar** un pedido, el del pedido original. En cualquier otro caso se usa la tarifa vigente y se avisa del ajuste.
- **Descuentos** D1–D4 en porcentaje (0 a 99,99), aplicados en cascada:
  - **D1**: descuento global del cliente (`CLIENTESCAMPOSLIBRES.D1`).
  - **D2 / D3**: promociones y descuento por artículo o cliente.
  - **D4**: descuento manual en línea; requiere el permiso *Descuentos en línea*.
  - Los artículos marcados "sin descuento" (`NODTOAPLICABLE`) quedan siempre en 0 %.
- **Precio unitario** = base × (1−D1) × (1−D2) × (1−D3) × (1−D4).
- **IVA** por artículo según `ARTICULOS.TIPOIMPUESTO` → `IMPUESTOS.IVA`; `MONTOIVA` = precio × cantidad × %IVA.
- **TOTALPRECIO** de la cabecera = suma de precio × cantidad, **sin IVA**.

---

## Integraciones y procesos automáticos

Todos arrancan con el backend. Se configuran y se activan/desactivan desde la app.

| Proceso | Qué hace | Frecuencia | Configuración |
|---|---|---|---|
| **E-commerce** | Lee archivos `.txt` de pedidos de una carpeta (de red), crea pedidos `EC-...` con precios del sistema y recorta a stock disponible. | 30 s | `APP_ECOMMERCE_CONFIG` |
| **FTP** | Servidor FTP por cliente (`c{codigo}/Pedidos`, `/Facturas`). Publica `inventario.txt` con precios y descuentos del cliente e importa pedidos `F...`. | 10 min | `connections.json` (`ftp*`), `APP_FTP_CONFIG` |
| **Farcompras** | Publica `inventario.txt` y `clientes.txt` e importa pedidos `FC...` aplicando el D1 del cliente y la promoción publicada. | Configurable | `APP_FARCOMPRAS_CONFIG` |
| **iCompras** | Descarga del portal iCompras los pedidos recibidos, los marca como tomados y los deja como `.txt` en la carpeta de e-commerce, que es la que después los importa. | Configurable | `APP_ICOMPRAS_CONFIG` |
| **Seped** | Bot con Chromium (Playwright) que entra al portal Seped y acepta pedidos según reglas. Tiene modo *dry run*. | Configurable (60 s) | `APP_SEPED_CONFIG` |
| **Reporte IMS** | Excel de clientes, productos y ventas (convertidas a USD); descarga manual y envío por correo programado. | Semanal o mensual | `APP_IMS_EMAIL_CONFIG` |
| **Monitor de stock** | Detecta sobregiros causados desde ICG y los registra. | 5 min | — |

Las importaciones son **transaccionales**: un archivo se procesa completo o no se procesa, y el siguiente ciclo lo reintenta. Separan los pedidos por tipo (psicotrópicos `P`, sin descuento `SD`, nuevos `NI`, promoción especial `PE-`) y registran como falla lo que no se pudo servir por stock.

---

## Módulos y permisos

El acceso se controla con un número de bits en `VENDEDORES.VISIBILIDAD`. Se asigna desde **Administración → Usuarios**. El usuario con *Administración* tiene acceso total. Los permisos se validan **en el backend**, no solo en la pantalla.

| Bit | Módulo / permiso |
|---|---|
| 1 | Catálogo |
| 2 | Carrito |
| 4 | Control de Estatus (también: fusionar y eliminar pedidos) |
| 8 | Edición de Pedidos |
| 16 | Administración (acceso total) |
| 32 | Promociones (crear y modificar promociones y grupos de artículos) |
| 64 | Gestión de Clientes (incluye descuento D1/D3 del cliente) |
| 128 | Aprobación de Psicotrópicos (aprobar, Sanidad, código de aprobación) |
| 256 | Reclamos |
| 512 | Descuentos en línea (D4 manual) |
| 1024 | Auditoría |
| 2048 | Autorizador (autorizar y cancelar pedidos) |
| 4096 | Rutero de entrega |
| 8192 | Pedidos FTP |
| 16384 | Servidor FTP |
| 32768 | Metas de vendedores |
| 65536 | Rutero Admin |
| 131072 | Gestión de usuarios FTP |
| 262144 | Reporte IMS |
| 524288 | Compras (rechequeo) |
| 1048576 | Descuento por artículo |
| 2097152 | Cancelar desde Sanidad |
| 4194304 | Reportería |
| 8388608 | Stock libre y alertas |

Después de cambiar los permisos de un usuario, este debe volver a iniciar sesión.

---

## Base de datos

### Tablas de ICG que usa la app

Lectura: `ARTICULOS`, `ARTICULOSCAMPOSLIBRES`, `ARTICULOSLIN`, `STOCKS`, `PRECIOSVENTA`, `IMPUESTOS`, `CLIENTES`, `CLIENTESCAMPOSLIBRES`, `VENDEDORES`, `TESORERIA`, `FACTURASVENTA`, `ALBVENTACAB/LIN`, `PEDVENTACAB`, `MOVIMENTS`, `MARCA`, `SECCIONES`, entre otras.

Escritura: `CABECERA_PED` y `LINEA_PED` (pedidos de la app, que luego importa ICG) y `VENDEDORES.VISIBILIDAD` (permisos).

**La app no modifica nada más de ICG** (ni stock, ni documentos, ni estructura).

### Tablas propias (`APP_*`, se crean solas)

| Tabla | Contenido |
|---|---|
| `APP_PEDIDO_LOG` | Historial de cambios de estatus y ediciones de cada pedido |
| `APP_PEDIDO_AUDITORIA`, `_CAB`, `_LIN` | Foto del pedido antes de cada edición, cambio de estatus o aprobación |
| `APP_FUSION_LOG`, `APP_FUSION_SNAPSHOT_*` | Foto completa de los pedidos antes de fusionarlos |
| `APP_CABECERA_PED_ELIMINADOS`, `APP_LINEA_PED_ELIMINADOS` | Pedidos eliminados |
| `APP_PEDIDO_FALLAS` | Faltantes de stock registrados |
| `APP_ALERTAS_STOCK` | Sobregiros detectados por el monitor |
| `APP_PEDIDO_SEQ` | Numeración de pedidos |
| `APP_PROMOCIONES*`, `APP_GRUPOS_ARTICULOS*`, `APP_GRUPOS_CLIENTES*`, `APP_PEDIDO_PROMOCIONES` | Promociones, grupos y promociones aplicadas |
| `APP_ECOMMERCE_*`, `APP_FTP_*`, `APP_FARCOMPRAS_*`, `APP_ICOMPRAS_*`, `APP_SEPED_*` | Configuración y auditoría de cada integración |
| `APP_IMS_*`, `APP_METAS_*`, `APP_RECLAMOS*`, `APP_RECHEQUEO*` | Reporte IMS, metas, reclamos y compras |

Convención: las lecturas usan `WITH (NOLOCK)` para no bloquear a ICG.

---

## API

Todas las rutas exigen sesión (`Authorization: Bearer <token>`) salvo `/auth/login`, `/api/status`, `/api/branding`, `/api/tasa` y `/api/changelog`.

| Prefijo | Área |
|---|---|
| `/auth` | Login, usuarios y permisos |
| `/pedidos` | Pedidos: crear, editar, estatus, fusión, fallas, auditoría |
| `/products` | Catálogo, precios y stock |
| `/clientes` | Clientes, riesgo y estado de cuenta |
| `/api/promociones`, `/api/promo-especial`, `/api/descuento-articulo` | Promociones y descuentos |
| `/api/stock` | Stock libre y alertas de sobregiro |
| `/ecommerce`, `/ftp`, `/seped` | Integraciones (incluye iCompras y Farcompras bajo `/ftp`) |
| `/facturas`, `/rutero`, `/rechequeo` | Facturas, rutas de entrega, compras |
| `/ims`, `/api/reportes`, `/api/metas-vendedor`, `/api/reclamos`, `/api/audit` | Reportes, metas, reclamos, auditoría |
| `/sistema` | Configuración, actualizador, respaldos (solo Administración) |

---

## Seguridad

- **Nunca subir al repositorio**: `backend_pedidos_drogueria_v1.2/config/connections.json`, `.env` e `impresion_facturas/settings.cfg`. Están en `.gitignore`.
- Configurar un `JWT_SECRET` propio y largo.
- Los precios, descuentos y totales los decide el servidor; los permisos se validan en el backend.
- La configuración de integraciones guarda credenciales en la base (`APP_SEPED_CONFIG`, `APP_IMS_EMAIL_CONFIG`): restringir el acceso a esas tablas.

---

## Solución de problemas

### Se acumulan procesos `node.exe` y se llena la memoria

Corregido en la versión 1.2.42: una instancia que no consigue el puerto ahora se cierra sola. Para limpiar restos de versiones anteriores, detener el servicio y revisar:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Select-Object ProcessId, ParentProcessId, CreationDate, @{n='MB';e={[math]::Round($_.WorkingSetSize/1MB)}}, CommandLine |
  Format-Table -AutoSize -Wrap
```

### Quedan procesos de Chromium abiertos

Seped abre un navegador por ciclo (4 procesos) y lo cierra al terminar; los ciclos no se solapan. Si aparecen muchos `chrome-headless-shell.exe` con fechas viejas, son restos de versiones anteriores:

```powershell
Get-CimInstance Win32_Process -Filter "Name='chrome-headless-shell.exe'" | Select-Object ProcessId, CreationDate
Stop-Process -Name chrome-headless-shell -Force   # con el servicio detenido
```

### Después de actualizar, el backend no arrancó

Revisar en NSSM que el servicio esté iniciado. Si el servicio ejecuta `node dist/index.js`, compilar antes con `npm run build`. Las tablas nuevas se crean al arrancar; sin reinicio, algunos cambios de estatus pueden fallar.

### "No se puede cambiar de PENDIENTE a AUTORIZADO"

Es intencional: primero se pasa a *PENDIENTE POR AUTORIZACION*, que es donde se reserva el stock.

### Un grupo de clientes o artículos no aparece en Promociones

Desde la versión 1.2.43 se cargan todos los grupos y se puede escribir para buscar. Antes solo aparecían los primeros 200 por orden alfabético.

---

## Convenciones de desarrollo

- **Cada cambio actualiza** [`changelog.ts`](frontend_pedidos_drogueria_v1.2/src/data/changelog.ts): subir `APP_VERSION` y agregar la entrada en `VERSIONES` y en `COMMITS`.
- **Commits** con el formato `tipo(versión o área): descripción`, ej. `fix(v1.2.43): ...`, `feat(stock): ...`.
- **Recompilar el frontend** (`npm run build-only`) antes de subir si cambió algo del frontend, porque el `dist` se versiona y es lo que instala el actualizador.
- **Lecturas de ICG** siempre con `WITH (NOLOCK)`; cualquier operación que reserve stock, dentro de una transacción con `PedidosServices.bloquearStock`.
- **Lógica nueva de stock o montos**, siempre en el servidor.
