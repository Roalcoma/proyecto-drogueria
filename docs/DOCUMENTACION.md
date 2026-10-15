# Documentación técnica — APP Pedidos Droguería Intercontinental

> Versión documentada: **1.2.43** (`APP_VERSION` en `frontend_pedidos_drogueria_v1.2/src/data/changelog.ts`).
> Repositorio: `Roalcoma/proyecto-drogueria`, rama `main`.

## Índice

1. [Propósito y contexto de negocio](#1-propósito-y-contexto-de-negocio)
2. [Arquitectura y flujo de datos](#2-arquitectura-y-flujo-de-datos)
3. [Stack](#3-stack)
4. [Estructura de carpetas](#4-estructura-de-carpetas)
5. [Backend: módulos principales](#5-backend-módulos-principales)
6. [Endpoints](#6-endpoints)
7. [Frontend: pantallas](#7-frontend-pantallas)
8. [Permisos (VISIBILIDAD)](#8-permisos-visibilidad)
9. [Flujo de un pedido y reglas de stock](#9-flujo-de-un-pedido-y-reglas-de-stock)
10. [Cálculo de montos](#10-cálculo-de-montos)
11. [Base de datos](#11-base-de-datos)
12. [Integraciones externas](#12-integraciones-externas)
13. [Procesos automáticos (jobs)](#13-procesos-automáticos-jobs)
14. [Configuración](#14-configuración)
15. [Instalación, ejecución, compilación y despliegue](#15-instalación-ejecución-compilación-y-despliegue)
16. [Actualizador y rollback](#16-actualizador-y-rollback)
17. [Solución de problemas](#17-solución-de-problemas)
18. [Problemas conocidos y deuda técnica](#18-problemas-conocidos-y-deuda-técnica)

---

## 1. Propósito y contexto de negocio

Aplicación web interna de la **Droguería Intercontinental** (distribuidora farmacéutica, Venezuela) para tomar, controlar y autorizar pedidos de venta. Trabaja directamente sobre la base SQL Server del ERP **ICG** (FrontRest/ManagerPro):

- Los **vendedores** arman pedidos desde un catálogo con precios, descuentos y stock en tiempo real.
- Los pedidos que llegan **solos** (e-commerce, iCompras, servidor FTP por cliente, Farcompras, portal Seped) entran al mismo flujo.
- **Control de Estatus** reserva stock, autoriza, separa psicotrópicos (aprobación sanitaria) y deja todo auditado.
- Los pedidos aprobados quedan en `CABECERA_PED` / `LINEA_PED`, de donde un **proceso externo** los importa a ICG como documentos de venta (estatus `ICG`).
- Módulos de soporte: promociones, metas de vendedores, rutero de entrega (picking por código de barras), reclamos, compras/rechequeo, reportes (IMS, reportería), stock libre y alertas de sobregiro, impresión de facturas.

## 2. Arquitectura y flujo de datos

```
Navegador (Vue 3 SPA)
   │  axios + JWT (Authorization: Bearer) + cabecera opcional X-Modo-Pruebas
   ▼
Backend Node.js / Express 5 (puerto 9010)  ── sirve también frontend_pedidos_drogueria_v1.2/dist
   │
   ├─► SQL Server · base ICG (p.ej. DROGUERIA) ── tablas ICG + tablas propias APP_*
   ├─► SQL Server · base de pruebas (dbPruebas) cuando el usuario activa "modo pruebas"
   ├─► SQL Server · base Rutero (dbRutero) ── APP_RUTEROS*
   ├─► Esquema [RIP] (misma instancia) ── METAS_VENDEDORES, SP CXC_INDEXADAS
   │
   ├─► Carpeta (de red) e-commerce ── .txt de pedidos (también los que deja iCompras)
   ├─► Servidor FTP embebido (ftp-srv) ── c{codcliente}/Pedidos y /Facturas
   ├─► Carpeta Farcompras ── inventario.txt, clientes.txt, pedidos
   ├─► API HTTP iCompras ── descarga de pedidos
   ├─► Portal web Seped ── bot Playwright/Chromium que acepta pedidos
   ├─► SMTP ── envío programado del reporte IMS (nodemailer + node-cron)
   ├─► Python/PyInstaller (impresion_facturas) ── PDF de facturas
   └─► GitHub (ZIP de main) ── actualizador integrado + NSSM
```

- **Capas del backend**: `routers/` (rutas + middleware de permisos) → `controllers/` (validación y respuesta HTTP) → `services/` (lógica de negocio y SQL con `mssql`).
- **Selección de base**: `dbModeMiddleware` lee la cabecera `X-Modo-Pruebas: true` y guarda el modo en un `AsyncLocalStorage`; `connectDb()` devuelve el pool de producción o de pruebas según ese contexto. Mantiene un pool por base (prod / pruebas / rutero) y lo recrea si se cae.
- **Arranque** (`src/index.ts`): fija `TZ=America/Caracas`, monta rutas, sirve el SPA, y en el callback de `listen` crea/migra todas las tablas `APP_*` (`initTablas()` de cada servicio) y arranca los procesos automáticos. Si el puerto está ocupado, el proceso termina (`exit(1)`) para que NSSM reintente y no queden `node.exe` fantasma.
- **Cierre ordenado** con `SIGINT/SIGTERM/SIGBREAK`: cierra el servidor HTTP y los pools (timeout de 5 s).

## 3. Stack

| Capa | Tecnología |
|---|---|
| Frontend | Vue 3.5 (Composition API), Vuetify 4, Pinia 3, Vue Router 5, Vite 8, TypeScript 5.9, axios, jsPDF + autotable, ExcelJS, xlsx |
| Backend | Node.js 22, Express 5, TypeScript, `mssql` 12, `jsonwebtoken`, `multer`, `exceljs`/`xlsx`, `ftp-srv`, `basic-ftp`, `node-cron`, `nodemailer`, `playwright`, `cheerio`, `adm-zip`, `morgan` |
| Base de datos | SQL Server (la del ERP ICG) |
| Impresión de facturas | Python 3 (`impresion_facturas/`), compilado a `.exe` con PyInstaller |
| Servicio Windows | NSSM |

## 4. Estructura de carpetas

```
Pedidos_Drogueria/
├── backend_pedidos_drogueria_v1.2/
│   ├── src/
│   │   ├── index.ts                 # Arranque, rutas, SPA estático, schedulers, cierre
│   │   ├── routers/                 # 22 routers (uno por área) + permisos por endpoint
│   │   ├── controllers/             # 22 controllers
│   │   ├── services/                # Lógica y SQL (pedidos.service.ts es el núcleo, ~1900 líneas)
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts   # authMiddleware, adminMiddleware, requiereBits, BITS
│   │   │   └── encriptacion.ts      # Cifrado reversible de claves de VENDEDORES (formato ICG)
│   │   └── db/
│   │       ├── db.conection.ts      # Pools prod / pruebas / rutero
│   │       ├── dbMode.middleware.ts # X-Modo-Pruebas → AsyncLocalStorage
│   │       ├── db.general.conection.ts + init.general.sql   # Legado (base general_drogueria), sin uso
│   ├── config/                      # connections.json y facturas_config.json (NO se versionan)
│   ├── data/snapshots/              # HTML capturados por el bot Seped (detección de cambios del portal)
│   ├── impresion_facturas/          # Generador de PDF de facturas (Python) + INTEGRACION.md
│   └── scripts/                     # Scripts sueltos de diagnóstico (ts-node)
├── frontend_pedidos_drogueria_v1.2/
│   ├── src/
│   │   ├── pages/                   # 22 vistas (una por módulo)
│   │   ├── components/              # ChangelogModal, MontoDisplay
│   │   ├── stores/                  # useAuthStore, useCarritoStore, usePromocionesStore, useBrandingStore
│   │   ├── router/index.ts          # Rutas + guardia por módulos del usuario
│   │   ├── utils/                   # pedidoPDF, facturasPDF, pdfImageHelper, usePageSize
│   │   └── data/changelog.ts        # APP_VERSION, VERSIONES y COMMITS que muestra la app
│   └── dist/                        # Compilado — SE VERSIONA (lo sirve el backend y lo instala el actualizador)
├── graphify-out/                    # Grafo de conocimiento local (no versionado)
├── CHANGELOG.md                     # Historial antiguo (1.2.0–1.2.8)
├── ejemplo_articulos.xlsx, ejemplo_clientes.xlsx   # Plantillas de importación a grupos de promociones
└── _backups/, _restore_tmp/         # Generados por el actualizador (no versionados)
```

## 5. Backend: módulos principales

| Servicio | Responsabilidad |
|---|---|
| `pedidos.service.ts` | Núcleo: crear/editar pedidos, recálculo de montos en servidor, partición por tipo (P / SD / NI / PE-) y por `maxLineasPorPedido`, cambio de estatus, reserva de stock con `sp_getapplock` (`bloquearStock`), autorización parcial, fusión, fallas, auditoría, conteo. |
| `products.service.ts` | Catálogo, precios por tarifa, stock por almacén, segmentos de descuento por D1. |
| `clientes.service.ts` | Clientes paginados, riesgo (en moneda de CxC, convertido a USD), estado de cuenta (`[RIP].[CXC_INDEXADAS]`), D1/D3 en `CLIENTESCAMPOSLIBRES`. |
| `promociones.service.ts` | Promociones con escalas, grupos de artículos/clientes (incluir/excluir, condiciones, importación Excel), slots D2/D3. |
| `promoEspecial.service.ts` | Promociones especiales (pedidos `PE-`). |
| `auth.service.ts` | Login contra `VENDEDORES`, JWT, módulos por bitmask, gestión de usuarios. |
| `ecommerce.service.ts` | Importación de `.txt` desde carpeta, auditoría, aprobación. |
| `ftp.service.ts` | Servidor FTP embebido, usuarios por cliente, ciclo de inventario/facturas, importación de pedidos `F…`. |
| `farcompras.service.ts` | Publica inventario y clientes; importa pedidos `FC…`. |
| `icompras.service.ts` | Cliente HTTP de iCompras: descarga pedidos y los deja como `.txt` en la carpeta de e-commerce. |
| `seped.service.ts` | Bot Playwright del portal Seped (login, listado, aceptación con umbral, reintentos, ventanas sin operación, dry run, snapshots). |
| `ims-email.service.ts` / `ims.controller.ts` | Reporte IMS en Excel (clientes, productos, ventas en USD) y envío programado por SMTP. |
| `stockMonitor.service.ts` | Stock libre y detección de sobregiros causados desde ICG (`APP_ALERTAS_STOCK`). |
| `rutero.service.ts` | Ruteros de entrega en base aparte, picking por código de barras, sesión de picking, confirmación y fecha de entrega (sincroniza `FACTURASVENTACAMPOSLIBRES.FECHARECIBIDO`). |
| `facturas.service.ts` + controller | Listado de facturas, configuración, número de control, PDF vía Python. |
| `rechequeo.service.ts` | Compras: conteo/rechequeo de pedidos y albaranes de compra. |
| `reclamos.service.ts` | Reclamos de clientes por factura. |
| `metas.service.ts` | Metas de vendedores por zona, progreso, sincronización con `[RIP].[METAS_VENDEDORES]`. |
| `reportes.service.ts` | Reportería: proveedores, top clientes por vendedor, transferencias, cobros, fallas. |
| `actualizador.service.ts` | Actualización desde GitHub, backups, rollback, reinicio NSSM. |
| `dbconfig.service.ts` | Lee/guarda `config/connections.json` (con fallback a `.env`). |
| `branding.service.ts` | Logo y colores (white-label). |
| `exchange.service.ts` | Cotización de moneda (tasa). |
| `audit.service.ts` | Auditoría de promociones. |

## 6. Endpoints

Todas las rutas requieren `Authorization: Bearer <token>` salvo las marcadas como **públicas**. `admin` = usuario con bit 16. `bits(n)` = requiere el bit `n` (o admin). El token también se acepta como `?token=` (para EventSource/SSE).

### Generales (`src/index.ts`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/status` | Salud de la API (**pública**). |
| POST | `/api/eventos` | Endpoint vacío, responde `OK` (**pública**). |
| GET | `/api/changelog` | `git log` del repo, clasificado por tipo de commit (**pública**). |
| GET | `/api/branding` | Logo, colores y zona horaria (**pública**). |
| PUT | `/api/branding` | Guarda branding (admin). |
| GET | `/api/tasa` | Cotización de moneda (**pública**). |
| GET | `/{*path}` | Sirve el SPA (`index.html`). |

### `/auth`

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/login` | Login con clave (**pública**). Devuelve JWT y módulos. |
| GET | `/auth/me` | Usuario de la sesión. |
| GET | `/auth/modulos` | Catálogo de módulos/bits. |
| GET | `/auth/usuarios` | Lista de usuarios (admin). |
| PATCH | `/auth/usuarios/:id/visibilidad` | Cambia permisos (admin). |
| PATCH | `/auth/usuarios/:id/password` | Cambia clave (admin). |
| PATCH | `/auth/usuarios/:id/codvendedor` | Cambia código de vendedor (admin). |
| PATCH | `/auth/usuarios/:id/activo` | Activa/desactiva (admin). |

### `/pedidos`

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/pedidos/reservar-numero` | Reserva número de pedido (`APP_PEDIDO_SEQ`). |
| POST | `/pedidos` | Crea pedido(s) desde el carrito (recalcula montos y parte por tipo). |
| GET | `/pedidos` | Lista con filtros. |
| PUT | `/pedidos` | Edita un pedido. |
| DELETE | `/pedidos` | Elimina (solo `PENDIENTE`) — bits(4). |
| PUT | `/pedidos/status` | Cambia estatus (reserva stock, autoriza, cancela). |
| PUT | `/pedidos/aprobar-psicotropico` | Aprobación sanitaria — bits(128). |
| PUT | `/pedidos/marcar-sanidad` | Marca en Sanidad — bits(128). |
| PUT | `/pedidos/codigo-aprobacion` | Código de aprobación — bits(128). |
| POST | `/pedidos/check-stock-lineas` | Valida stock de líneas. |
| GET | `/pedidos/conteo` | Conteo por estatus. |
| GET | `/pedidos/auditoria` | Auditoría de pedidos. |
| POST | `/pedidos/fusionar` | Fusiona pedidos — bits(4). |
| GET | `/pedidos/:orderId/anomalias` | Anomalías del pedido. |
| GET | `/pedidos/:orderId/diferencias` | Diferencias contra ICG. |
| GET | `/pedidos/:orderId/faltantes` | Faltantes de stock. |
| POST | `/pedidos/:orderId/fallas` | Registra fallas. |

### `/products`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/products/get-products` | Catálogo. |
| GET | `/products/get-stocks` | Stock. |
| GET | `/products/get-prices` | Precios. |
| GET | `/products/segmentos-descuento` | Segmentos por D1. |
| GET | `/products/catalogo-segmentos` | Catálogo por segmento. |
| GET | `/products/precios-catalogo` | Precios en lote. |

### `/clientes`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/clientes` | Búsqueda de clientes. |
| GET | `/clientes/paginado` | Paginado. |
| GET | `/clientes/estado-cuenta` | Estado de cuenta. |
| GET | `/clientes/riesgo` | Riesgo de un cliente. |
| POST | `/clientes/riesgo-masivo` | Riesgo de varios clientes. |
| PATCH | `/clientes/:codCliente/descuento` | D1 del cliente — gestión de clientes. |
| PATCH | `/clientes/:codCliente/d3` | D3 del cliente — gestión de clientes. |

### `/api/promociones`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/vigentes`, `/campos-disponibles`, `/proveedores`, `/marcas`, `/buscar-articulos` | Consultas de apoyo. |
| GET/POST | `/grupos-articulos` | Lista / crea grupo (crear requiere bits(32)). |
| PUT | `/grupos-articulos/:id` | Actualiza grupo — bits(32). |
| GET | `/grupos-articulos/:id/condiciones`, `/grupos-articulos/:id/articulos` | Detalle del grupo. |
| POST/DELETE | `/grupos-articulos/:id/articulos[/:codArticulo]` | Agrega/quita artículo — bits(32). |
| POST | `/grupos-articulos/:id/importar-excel` | Importa artículos desde Excel (multipart `archivo`) — bits(32). |
| GET | `/grupos-clientes/auditoria` | Auditoría de grupos. |
| POST | `/grupos-clientes/previsualizar-grupos-excel`, `/previsualizar-clientes-lote`, `/crear-lote`, `/importar-clientes-lote` | Carga masiva de grupos de clientes. |
| GET/POST | `/grupos-clientes` | Lista / crea. |
| PUT/DELETE | `/grupos-clientes/:id` | Actualiza / elimina. |
| GET | `/grupos-clientes/:id/condiciones`, `/grupos-clientes/:id/clientes` | Detalle. |
| POST/DELETE | `/grupos-clientes/:id/clientes[/:codCliente]` | Agrega/quita cliente. |
| POST | `/grupos-clientes/:id/importar-excel` | Importa clientes desde Excel. |
| GET/POST | `/` | Lista / crea promoción (crear: bits(32)). |
| PUT | `/:id` | Actualiza — bits(32). |
| PATCH | `/:id/activo` | Activa/desactiva — bits(32). |

### `/api/promo-especial`, `/api/descuento-articulo`, `/api/audit`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/promo-especial/vigentes` | Promos especiales vigentes. |
| GET/POST | `/api/promo-especial` | Lista / crea (admin). |
| PUT/DELETE | `/api/promo-especial/:id` | Actualiza / elimina (admin). |
| GET | `/api/descuento-articulo` | Artículos con descuento. |
| PATCH | `/api/descuento-articulo/:codarticulo` | Guarda `DTOARTICULO` en `ARTICULOSCAMPOSLIBRES` — bits(1048576). |
| GET | `/api/audit/promos` | Auditoría de promociones (admin). |

### `/api/stock` (bits 8388608 o 4)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/stock/libre` | Stock libre (ICG − reservado). |
| GET | `/api/stock/libre/:codarticulo/pedidos` | Pedidos que reservan y movimientos recientes del artículo. |
| GET | `/api/stock/alertas` | Alertas de sobregiro. |
| POST | `/api/stock/alertas/revisar` | Ejecuta el monitor ahora. |

### `/ecommerce`

| Método | Ruta | Descripción |
|---|---|---|
| GET/PUT | `/ecommerce/config` | Ruta de la carpeta (admin). |
| POST | `/ecommerce/escanear` | Escaneo inmediato (admin). |
| GET | `/ecommerce/pedidos`, `/ecommerce/pedidos/:id/lineas` | Pedidos importados. |
| PATCH | `/ecommerce/pedidos/:id/procesado` | Marca procesado. |
| POST | `/ecommerce/pedidos/:id/aprobar` | Aprueba. |
| GET | `/ecommerce/auditoria` | Auditoría. |

### `/ftp` (incluye iCompras y Farcompras)

| Método | Ruta | Descripción |
|---|---|---|
| GET/PUT | `/ftp/config` | Configuración (admin). |
| POST | `/ftp/escanear` | Escaneo inmediato (admin). |
| GET | `/ftp/auditoria` | Auditoría. |
| GET | `/ftp/servidor/estado` | Estado del servidor FTP. |
| POST | `/ftp/servidor/config`, `/ftp/servidor/iniciar`, `/ftp/servidor/detener` | Control del servidor (admin). |
| GET/POST | `/ftp/usuarios` | Usuarios FTP (bit 131072). |
| DELETE | `/ftp/usuarios/:id` | Elimina. |
| PATCH | `/ftp/usuarios/:id/toggle`, `/ftp/usuarios/:id/password` | Activa / cambia clave. |
| POST | `/ftp/usuarios/importar`, `/ftp/usuarios/sincronizar-claves` | Carga masiva. |
| POST | `/ftp/ciclo` | Ciclo inventario + facturas (admin). |
| GET/PUT | `/ftp/icompras/config` | Config iCompras (admin). |
| GET | `/ftp/icompras/estado`, `/ftp/icompras/auditoria` | Estado y auditoría. |
| POST | `/ftp/icompras/ciclo`, `/ftp/icompras/reprocesar` | Ciclo manual / reprocesar pedido (admin). |
| GET/PUT | `/ftp/farcompras/config` | Config Farcompras (admin). |
| GET | `/ftp/farcompras/estado`, `/ftp/farcompras/auditoria` | Estado y auditoría. |
| POST | `/ftp/farcompras/ciclo` | Ciclo manual (admin). |

### `/seped` (todo admin)

| Método | Ruta | Descripción |
|---|---|---|
| GET/PUT | `/seped/config` | Configuración del bot. |
| POST | `/seped/ciclo` | Ejecuta un ciclo. |
| GET | `/seped/auditoria`, `/seped/estado` | Auditoría y estado. |
| GET | `/seped/logs` | Stream SSE de logs. |

### `/facturas`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/facturas`, `/facturas/series`, `/facturas/rutas`, `/facturas/detalle` | Consultas. |
| GET/PUT | `/facturas/config` | `config/facturas_config.json`. |
| POST | `/facturas/guardar-pdf` | Guarda PDF. |
| GET | `/facturas/imprimir-formato` | Genera PDF con `impresion_facturas` (exe o python). |
| PUT | `/facturas/nocontrol` | Asigna número de control (`FACTURASVENTACAMPOSLIBRES`). |

### `/rutero`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/rutero/zonas`, `/rutero/facturas`, `/rutero/buscar-factura` | Facturas disponibles por zona. |
| POST | `/rutero/crear` | Crea rutero. |
| GET | `/rutero/ruteros`, `/rutero/ruteros/:id/facturas` | Ruteros y sus facturas. |
| GET | `/rutero/ruteros/picking/sesion`, `/rutero/ruteros/picking/registro` | Sesión de picking del usuario. |
| POST | `/rutero/ruteros/picking/escanear`, `/rutero/ruteros/picking/iniciar-viaje` | Picking global e inicio de viaje (pide clave de picking admin). |
| GET | `/rutero/ruteros/:id/picking` | Estado del picking. |
| POST | `/rutero/ruteros/:id/picking/iniciar`, `/liberar`, `/rutero/ruteros/:id/escanear` | Picking por rutero. |
| PUT | `/rutero/ruteros/:id/confirmar`, `/rutero/confirmar-factura` | Confirma entrega. |
| DELETE | `/rutero/ruteros/:id/facturas` | Quita factura. |
| PUT | `/rutero/ruteros/:id/fecha`, `/rutero/ruteros/:id/facturas/fecha` | Fecha de entrega. |
| GET | `/rutero/auditoria` | Auditoría. |

### `/rechequeo`, `/api/reclamos`, `/api/reportes`, `/api/metas-vendedor`, `/ims`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/rechequeo/disponibles`, `/mios`, `/pedidos/:numserie/:numpedido/:n`, `/cabecera/:idcab/detalles`, `/cerrados`, `/cerrados/:idcab/detalle`, `/albaranes`, `/albaranes/:numserie/:numalbaran` | Consultas de compras. |
| POST | `/rechequeo/tomar`, `/conteo`, `/cerrar` | Ciclo de conteo. |
| GET/POST | `/api/reclamos` | Lista / crea reclamo. |
| GET | `/api/reclamos/:id`, `/facturas/:codCliente`, `/facturas/:numSerie/:numFactura/articulos` | Detalle y facturas. |
| GET | `/api/reportes/proveedores`, `/top-clientes-por-vendedor`, `/transferencias`, `/cobros`, `/fallas` | Reportería. |
| GET | `/api/metas-vendedor`, `/zonas`, `/zonas/:codruta/vendedores`, `/vendedores`, `/progreso`, `/progreso-vendedor` | Metas y progreso. |
| POST/DELETE | `/api/metas-vendedor/zonas/:codruta` | Meta por zona (bit 32768). |
| POST | `/api/metas-vendedor` | Crea/actualiza meta (bit 32768). |
| PATCH/DELETE | `/api/metas-vendedor/:id/cumplida`, `/api/metas-vendedor/:id` | (bit 32768). |
| GET | `/ims/reporte` | Descarga Excel IMS (bit 262144). |
| GET | `/ims/auditoria`, `/ims/email-config` | (admin). |
| POST | `/ims/email-config`, `/ims/email-enviar` | Guarda config SMTP / envía ahora (admin). |

### `/sistema` (admin salvo indicación)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/sistema/inicializar-bd` | Crea tablas `APP_*`. |
| GET | `/sistema/db-config` | Config de conexión (clave enmascarada). |
| POST | `/sistema/db-config/probar`, `/sistema/db-config/guardar` | Prueba y guarda `connections.json`. |
| POST | `/sistema/actualizar` | Actualiza desde GitHub. |
| GET | `/sistema/backups` | Respaldos disponibles. |
| POST | `/sistema/rollback` | Restaura un respaldo. |
| GET/POST | `/sistema/seq-pedidos` | Secuencia de pedidos. |
| GET/POST | `/sistema/psicotropicos`, `/tarifa-catalogo`, `/cod-almacen`, `/clave-picking-admin` | Parámetros. |
| GET/POST | `/sistema/max-lineas`, `/sistema/zona-horaria` | GET con cualquier sesión; POST admin. |

## 7. Frontend: pantallas

Rutas en `src/router/index.ts`. La guardia exige sesión y que la ruta esté en los módulos del usuario; si no, redirige al primer módulo permitido.

| Ruta | Vista | Módulo |
|---|---|---|
| `/login` | `LoginView` | Login (pública). Solo pide clave. |
| `/` | `CatalogoView` | Catálogo con precios, descuentos, stock; exporta Excel. |
| `/carrito` | `CarritoView` | Carrito con IVA, promociones y envío del pedido. |
| `/pedidos-estatus` | `PedidosEstatusView` | Control de Estatus: filtros, reserva, autorización, fusión, PDF, fallas. |
| `/pedidos-edicion` | `PedidosEdicionView` | Edición de pedidos. |
| `/backoffice` | `BackOfficeView` | Administración: usuarios, BD, parámetros, actualizador, branding, integraciones, changelog. |
| `/promociones` | `PromocionesView` | Promociones y grupos. |
| `/gestion-clientes` | `ClientesAdminView` | Clientes, D1/D3, riesgo. |
| `/aprobacion-psicotropicos` | `AprobacionPsicotropicosView` | Aprobación sanitaria. |
| `/reclamos` | `ReclamosView` | Reclamos. |
| `/auditoria` | `AuditoriaView` | Auditoría. |
| `/rutero` | `RuteroView` | Rutero de entrega y picking. |
| `/ftp-pedidos` | `FtpPedidosView` | Pedidos FTP / e-commerce / iCompras / Farcompras. |
| `/ftp-servidor` | `FtpServidorView` | Servidor y usuarios FTP. |
| `/metas-vendedor` | `MetasVendedorView` | Metas. |
| `/ims-reporte` | `ImsReporteView` | Reporte IMS. |
| `/rechequeo` | `RechequeoView` | Compras / rechequeo. |
| `/descuento-articulo` | `DescuentoArticuloView` | Descuento por artículo. |
| `/reporteria` | `ReportesView` | Reportería. |
| `/stock-libre` | `StockLibreView` | Stock libre y alertas. |

`EcommerceView` y `FacturasImpresionView` existen como vistas pero se integran dentro de otras pantallas.

Stores: `useAuthStore` (token en almacenamiento, cabeceras axios `Authorization` y `X-Modo-Pruebas`, interceptor 401), `useCarritoStore`, `usePromocionesStore`, `useBrandingStore`.

## 8. Permisos (VISIBILIDAD)

Bitmask entero en `VENDEDORES.VISIBILIDAD` (definido en `MODULOS_SISTEMA`, `auth.service.ts`). Bit 16 = Administración = acceso total. Se validan en backend con `requiereBits`/middlewares. Tras cambiar permisos el usuario debe volver a iniciar sesión (el JWT lleva la visibilidad).

| Bit | Código | Módulo |
|---|---|---|
| 1 | CATALOGO | Catálogo |
| 2 | CARRITO | Carrito |
| 4 | ESTATUS | Control de Estatus (fusionar, eliminar) |
| 8 | EDICION | Edición de pedidos |
| 16 | BACKOFFICE | Administración (total) |
| 32 | PROMOCIONES | Promociones |
| 64 | CLIENTES | Gestión de clientes |
| 128 | APROBACION_PSICO | Aprobación psicotrópicos |
| 256 | RECLAMOS | Reclamos |
| 512 | DESCUENTO_LINEA | D4 manual |
| 1024 | AUDITORIA | Auditoría |
| 2048 | AUTORIZADOR | Autorizar / cancelar |
| 4096 | RUTERO | Rutero de entrega |
| 8192 | FTP_PEDIDOS | Pedidos FTP |
| 16384 | FTP_SERVIDOR | Servidor FTP |
| 32768 | METAS_VENDEDOR | Metas |
| 65536 | RUTERO_ADMIN | Rutero admin |
| 131072 | FTP_USUARIOS | Usuarios FTP |
| 262144 | IMS_REPORTE | Reporte IMS |
| 524288 | RECHEQUEO | Compras |
| 1048576 | DTO_ARTICULO | Descuento por artículo |
| 2097152 | CANCELAR_SANIDAD | Cancelar desde Sanidad |
| 4194304 | REPORTERIA | Reportería |
| 8388608 | STOCK_LIBRE | Stock libre y alertas |

## 9. Flujo de un pedido y reglas de stock

```
                 ┌──────────────► CANCELADO
PENDIENTE ───► PENDIENTE POR AUTORIZACION ───► AUTORIZADO ───► EMPACADO / OK ───► ICG (facturado)
   ▲
APROBACION PSICOTROPICOS ──► SANIDAD ──┘ (aprobación sanitaria → PENDIENTE POR AUTORIZACION)
```

| Estatus | ¿Reserva stock? | Quién lo mueve |
|---|---|---|
| `PENDIENTE` | No | Se crea así (vendedor, e-commerce, FTP, Farcompras) |
| `PENDIENTE POR AUTORIZACION` | Sí | Control de Estatus |
| `APROBACION PSICOTROPICOS`, `SANIDAD` | Sí | Quien tiene bit 128 |
| `AUTORIZADO`, `EMPACADO`, `OK` | Sí | Autorizador |
| `ICG`, `FINALIZADO` | No (ya descontado en ICG) | Proceso externo de importación a ICG |
| `CANCELADO` | No | Según permisos |

Reglas:

- **Stock disponible** = `STOCKS` del almacén `codAlmacen` − unidades de pedidos en estatus que reservan. Se valida **sumando por artículo**.
- `PENDIENTE → PENDIENTE POR AUTORIZACION` es el punto de reserva y es **bloqueante**. No se autoriza directo desde `PENDIENTE`.
- Reservas serializadas con `sp_getapplock 'PEDIDOS_RESERVA_STOCK'` dentro de la transacción (`PedidosServices.bloquearStock`).
- **Autorización parcial**: si al autorizar falta stock, se autorizan solo las unidades disponibles, se recalcula y el faltante queda en `APP_PEDIDO_FALLAS`.
- Solo se **eliminan** pedidos `PENDIENTE`; los demás se cancelan.
- Partición: psicotrópicos (sección `dptoPsicotropicos`) en pedido aparte con sufijo `P`; sin descuento `SD`; artículos nuevos `NI` (`DIASPROTECCION > 0`); promoción especial `PE-`; y pedidos con más de `maxLineasPorPedido` líneas se parten con sufijos `-1`, `-2`…
- Prefijos de origen: `EC-` e-commerce/iCompras, `F` FTP, `FC` Farcompras.
- **Monitor de sobregiro** (cada 5 min): si lo reservado supera el stock de ICG (porque bajó desde ICG), registra la alerta con pedidos afectados y documentos ICG de las 24 h previas; se resuelve sola al normalizarse.

## 10. Cálculo de montos

El servidor **recalcula** siempre; lo que manda el navegador es solo propuesta.

- **Precio base**: `PRECIOSVENTA.PNETO` de la tarifa `tarifaBaseCatalogo`. Al editar se respeta el precio original de cada línea; al copiar, el del pedido original.
- **Descuentos** D1–D4 en % (0–99,99) en cascada: D1 cliente (`CLIENTESCAMPOSLIBRES.D1`), D2/D3 promociones y descuento por artículo/cliente, D4 manual (bit 512). Artículos `NODTOAPLICABLE = 1` (BIT) siempre 0 %.
- **Precio unitario** = base × (1−D1) × (1−D2) × (1−D3) × (1−D4), redondeado a 2 decimales.
- **IVA** según `ARTICULOS.TIPOIMPUESTO` → `IMPUESTOS.IVA`; `MONTOIVA` = precio × cantidad × %IVA.
- **TOTALPRECIO** de cabecera = Σ precio × cantidad, **sin IVA**.
- Riesgo de cliente y reporte IMS se convierten a USD con la cotización (`MONEDA_COTIZACION`, `USD`, `VED`).

## 11. Base de datos

### Tablas ICG — lectura

`ARTICULOS`, `ARTICULOSCAMPOSLIBRES`, `ARTICULOSLIN`, `STOCKS`, `PRECIOSVENTA`, `IMPUESTOS`, `CLIENTES`, `CLIENTESCAMPOSLIBRES`, `CLIENTESENVIO`, `VENDEDORES`, `TESORERIA`, `FACTURASVENTA`, `FACTURASVENTACAMPOSLIBRES`, `ALBVENTACAB`, `ALBVENTALIN`, `PEDVENTACAB`, `MOVIMENTS`, `MARCA`, `SECCIONES`, entre otras. Todas las lecturas usan `WITH (NOLOCK)`.

### Tablas ICG / externas — escritura

| Tabla | Qué escribe |
|---|---|
| `CABECERA_PED`, `LINEA_PED` | Pedidos de la app (los importa ICG después). |
| `VENDEDORES` | `VISIBILIDAD` (permisos), claves, código de vendedor, activo. Al arrancar agrega la columna `VISIBILIDAD` si falta. |
| `CLIENTESCAMPOSLIBRES` | `D1` y `D3` del cliente (inserta la fila si no existe). |
| `ARTICULOSCAMPOSLIBRES` | `DTOARTICULO` (MERGE). |
| `FACTURASVENTACAMPOSLIBRES` | `FECHARECIBIDO` (rutero) y número de control (facturas). |
| `[RIP].[METAS_VENDEDORES]` | Sincronización de metas (MERGE). |

SP usado: `[RIP].[CXC_INDEXADAS]` (estado de cuenta).

### Tablas propias `APP_*` (se crean solas al arrancar)

| Tabla | Contenido |
|---|---|
| `APP_PEDIDO_LOG` | Historial de estatus y ediciones |
| `APP_PEDIDO_AUDITORIA`, `_CAB`, `_LIN` | Foto del pedido antes de cada cambio |
| `APP_FUSION_LOG`, `APP_FUSION_SNAPSHOT_*` | Foto de pedidos antes de fusionar |
| `APP_CABECERA_PED_ELIMINADOS`, `APP_LINEA_PED_ELIMINADOS` | Pedidos eliminados |
| `APP_PEDIDO_FALLAS` | Faltantes de stock |
| `APP_ALERTAS_STOCK` | Sobregiros |
| `APP_PEDIDO_SEQ` | Numeración |
| `APP_PROMOCIONES`, `APP_PROMOCIONES_ESCALAS`, `APP_PEDIDO_PROMOCIONES` | Promociones |
| `APP_GRUPOS_ARTICULOS*`, `APP_GRUPOS_CLIENTES*` (+ `_CONDICIONES`) | Grupos |
| `APP_ECOMMERCE_CONFIG`, `_PEDIDOS`, `_LINEAS`, `_AUDITORIA` | E-commerce |
| `APP_FTP_USUARIOS`, `APP_FTP_LINEAS`, `APP_FTP_AUDITORIA`, `APP_FTP_CONFIG` | FTP |
| `APP_FARCOMPRAS_CONFIG`, `_PEDIDOS`, `_LINEAS` | Farcompras |
| `APP_ICOMPRAS_CONFIG`, `APP_ICOMPRAS_PEDIDOS` | iCompras |
| `APP_SEPED_CONFIG` (+ auditoría) | Seped (incluye usuario/clave del portal) |
| `APP_IMS_*` (incl. `APP_IMS_EMAIL_CONFIG`) | Reporte IMS y SMTP |
| `APP_METAS_*`, `APP_RECLAMOS*`, `APP_RECHEQUEO*` | Metas, reclamos, compras |
| `APP_RUTEROS`, `APP_RUTEROS_DETALLE`, `APP_RUTEROS_CAJAS` | Rutero (en la base `dbRutero`) |

Los esquemas se migran de forma **aditiva** (`IF NOT EXISTS … CREATE/ALTER`), por eso un rollback de código no rompe la base.

`src/db/init.general.sql` y `db.general.conection.ts` (base `general_drogueria`, tablas `PED_USUARIOS`, `PED_MODULOS`) son **legado sin uso**: el login actual va contra `VENDEDORES`.

## 12. Integraciones externas

| Integración | Mecanismo | Detalle |
|---|---|---|
| **E-commerce** | Carpeta (puede ser de red) | Lee `.txt`, crea pedidos `EC-…` con precios del sistema, recorta a stock. Transaccional por archivo. |
| **iCompras** | HTTP JSON (`urlBase`, `codisb`) | Descarga pedidos recibidos, los marca como tomados y los escribe como `.txt` en `rutaPedidos` (carpeta e-commerce). Zona horaria Caracas; `.done` solo tras aprobación confirmada. |
| **Servidor FTP** | `ftp-srv` embebido | Usuario por cliente con carpetas `c{codigo}/Pedidos` y `/Facturas`; publica `inventario.txt` con precios/descuentos del cliente; importa pedidos `F…`. Puertos pasivos configurables. |
| **Farcompras** | Carpeta | Publica `inventario.txt` y `clientes.txt`, importa pedidos `FC…` con D1 y promoción publicada. |
| **Seped** | Playwright (Chromium headless) | Inicia sesión en el portal, lee la tabla de pedidos `POR-APROBAR`, acepta según umbral; reintentos con backoff; ventanas sin operación; *dry run*; guarda snapshots HTML en `data/snapshots` para detectar cambios del portal. |
| **Correo (IMS)** | SMTP con nodemailer | Envío programado (cron semanal/mensual) del Excel IMS. |
| **Impresión de facturas** | Proceso hijo | `impresion_facturas/dist/generate_for_web.exe` (o `python generate_for_web.py`) con serie/número/base; credenciales en `settings.cfg` (cifrado, no versionado). Ver `impresion_facturas/INTEGRACION.md`. Se mata el árbol si se cuelga. |
| **GitHub** | HTTPS | Descarga del ZIP de `main` para el actualizador. |
| **NSSM** | `nssm restart` | Reinicio de servicios tras actualizar. |

> ⚠️ Una copia de la base de producción trae estas integraciones **activas**. Antes de arrancar en local:
>
> ```sql
> UPDATE APP_ECOMMERCE_CONFIG  SET RUTA = '';
> UPDATE APP_SEPED_CONFIG      SET HABILITADO = 'F';
> UPDATE APP_FARCOMPRAS_CONFIG SET HABILITADO = 'F';
> UPDATE APP_ICOMPRAS_CONFIG   SET HABILITADO = 'F';
> UPDATE APP_IMS_EMAIL_CONFIG  SET HABILITADO = 'F';
> ```

## 13. Procesos automáticos (jobs)

Todos arrancan en el callback de `listen` (`src/index.ts`).

| Proceso | Frecuencia | Implementación |
|---|---|---|
| Escaneo e-commerce | 30 s | `setInterval(EcommerceService.escanearCarpeta)` |
| Escaneo FTP (pedidos) | 10 min (+ disparo 3 s tras subida) | `setInterval(FtpService.escanearCarpeta)` |
| Ciclo FTP inventario/facturas | 10 min | `FtpService.cicloTimer` |
| iCompras | `INTERVALO_SEG` (def. 60 s) | `IComprasService.iniciarScheduler` si está habilitado |
| Farcompras | Configurable | `FarcomprasService.iniciarScheduler` si está habilitado y hay `rutaBase` |
| Seped | `intervaloSeg` (def. 60 s), sin solapar ciclos | `SepedService.iniciarScheduler` |
| Reporte IMS por correo | Cron semanal o mensual | `ImsEmailService.iniciar` (node-cron) |
| Monitor de stock | 5 min | `StockMonitorService.iniciar` |
| Servidor FTP | Continuo | `FtpService.iniciarServidor` si `ftpHabilitado` |

## 14. Configuración

### Backend — `config/connections.json` (prioridad sobre `.env`; editable desde Administración → Base de datos)

| Clave | Para qué sirve |
|---|---|
| `server`, `port`, `user`, `password` | Conexión SQL Server. |
| `dbName` | Base ICG de producción. |
| `dbPruebas` | Base usada en *modo pruebas* (vacía = producción). |
| `dbRutero` | Base de ruteros. |
| `dbGeneralName` | Base legado `general_drogueria` (sin uso real). |
| `esquema` | Esquema SQL (def. `dbo`). |
| `codAlmacen` | Almacén ICG del stock. |
| `tarifaBaseCatalogo` | Tarifa de `PRECIOSVENTA` para precios base. |
| `dptoPsicotropicos` | Sección de artículos psicotrópicos. |
| `maxLineasPorPedido` | Máximo de líneas por pedido antes de partirlo. |
| `clavePickingAdmin` | Clave para iniciar viaje en el rutero. |
| `zonaHoraria` | Zona horaria de la app. |
| `ftpHabilitado`, `ftpPuerto`, `ftpPasivoMin`, `ftpPasivoMax`, `ftpIpExterna` | Servidor FTP embebido. |
| `nssmServicioBackend`, `nssmServicioFrontend` | Servicios NSSM que reinicia el actualizador. |

`config/facturas_config.json`: parámetros de impresión de facturas (gestionado por `/facturas/config`).

### Backend — `.env`

| Variable | Para qué sirve |
|---|---|
| `PORT` | Puerto HTTP (def. 9010). |
| `JWT_SECRET` | Firma de sesiones. **Obligatoria**. |
| `JWT_EXPIRES_IN` | Duración del token (def. `8h`). |
| `DB_SERVER`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PRUEBAS`, `DB_RUTERO`, `DB_GENERAL_NAME`, `DB_ESQUEMA` | Fallback si no existe `connections.json`. `DB_ESQUEMA` además lo leen varios servicios directamente. |
| `MONEDA_COTIZACION`, `USD`, `VED` | Códigos de moneda para cotización y conversión. |
| `FRONTEND_DIST` | Ruta alternativa del frontend compilado. |

### Configuración guardada en base de datos

`APP_ECOMMERCE_CONFIG`, `APP_FTP_CONFIG`, `APP_ICOMPRAS_CONFIG`, `APP_FARCOMPRAS_CONFIG`, `APP_SEPED_CONFIG`, `APP_IMS_EMAIL_CONFIG` (se editan desde la app).

### Frontend

| Variable | Para qué sirve |
|---|---|
| `VITE_API_URL` | URL del backend. En producción va **vacía** (mismo origen). En desarrollo, p. ej. `http://localhost:9010`. |

## 15. Instalación, ejecución, compilación y despliegue

```bash
git clone https://github.com/Roalcoma/proyecto-drogueria.git
cd proyecto-drogueria/backend_pedidos_drogueria_v1.2 && npm install
cd ../frontend_pedidos_drogueria_v1.2 && npm install
```

1. Crear `backend_pedidos_drogueria_v1.2/config/connections.json` (o `.env`) y `JWT_SECRET`.
2. Frontend: `.env` con `VITE_API_URL` para desarrollo; `.env.production` queda vacío.
3. Opcional: `npx playwright install chromium` (Seped); Python 3 + `requirements.txt` o el `.exe` compilado para facturas.

| Tarea | Comando |
|---|---|
| Backend desarrollo | `cd backend_pedidos_drogueria_v1.2 && npm run dev` (nodemon + ts-node) |
| Backend compilar | `npm run build` (tsc → `dist/`) |
| Backend producción | `npm start` (`node dist/index.js`) |
| Frontend desarrollo | `cd frontend_pedidos_drogueria_v1.2 && npm run dev` |
| Frontend compilar | `npm run build-only` (sin type-check) |
| Frontend con type-check | `npm run build` (falla por errores heredados) |
| Generador facturas `.exe` | `pyinstaller generate_for_web.spec` en `impresion_facturas/` |

**Producción (Windows + NSSM)**: el backend sirve el `dist` del frontend en el mismo puerto.

```
nssm install PedidosBackend "C:\Program Files\nodejs\node.exe" "dist\index.js"
nssm set PedidosBackend AppDirectory "C:\ruta\backend_pedidos_drogueria_v1.2"
nssm set PedidosBackend AppKillProcessTree 1
```

## 16. Actualizador y rollback

Administración → "Actualizar Aplicativo desde GitHub" (`actualizador.service.ts`):

1. Respaldo de la versión instalada en `_backups/` (quedan los últimos 5).
2. Descarga `main` como ZIP (timeout 90 s, sigue redirecciones).
3. Copia sin tocar `node_modules`, `dist` (raíz), `.env`, `.env.production`, `config/connections.json`, `.git` ni los temporales/respaldos.
4. Reinicia los servicios NSSM con un `.cmd` desacoplado del árbol de procesos.

- **No compila el backend**: si el servicio corre `dist/index.js`, ejecutar `npm run build` antes de reiniciar.
- El `dist` del frontend viaja en el repo.
- Dependencias nuevas → `npm install` manual en el servidor.
- Rollback: Administración → "Restaurar versión anterior".
- Tras actualizar, los usuarios deben refrescar con Ctrl+F5.

## 17. Solución de problemas

- **Procesos `node.exe` acumulados**: corregido en 1.2.42 (la instancia sin puerto termina). Limpieza: `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`.
- **Chromium huérfanos** (`chrome-headless-shell.exe`): restos de versiones antiguas; detener el servicio y `Stop-Process -Name chrome-headless-shell -Force`.
- **El backend no arrancó tras actualizar**: revisar NSSM y compilar (`npm run build`).
- **"No se puede cambiar de PENDIENTE a AUTORIZADO"**: intencional, hay que pasar por *PENDIENTE POR AUTORIZACION*.
- **Grupo no aparece en Promociones**: desde 1.2.43 se cargan todos y se puede buscar.

## 18. Problemas conocidos y deuda técnica

- **Login solo por clave**: `/auth/login` busca en `VENDEDORES` por `NEWPASSENTRADA` cifrado sin pedir usuario; dos vendedores con la misma clave colisionan y el primero gana.
- **Cifrado reversible** (`middleware/encriptacion.ts`): las claves usan el ofuscado de ICG (desplazamiento con constantes), no un hash.
- **Secretos por defecto**: `JWT_SECRET` cae a un valor fijo del código si falta en `.env`; `clavePickingAdmin` tiene un valor por defecto fijo; ambos deben configurarse siempre.
- `getDbConfigPublica` devuelve `clavePickingAdmin` en claro al frontend (solo admin).
- **Permisos incompletos en backend**: `/rechequeo`, `/api/reclamos`, `/api/reportes`, `/rutero` (incluidas acciones de Rutero Admin) y la mayoría de rutas `/api/promociones/grupos-clientes/*` solo exigen sesión, no el bit del módulo.
- `GET /api/changelog` es público y ejecuta `git log` en el servidor.
- Token aceptado por query string (`?token=`) en todas las rutas, no solo SSE: puede quedar en logs (`morgan`).
- Credenciales de Seped y SMTP guardadas en claro en `APP_SEPED_CONFIG` / `APP_IMS_EMAIL_CONFIG`.
- `data/snapshots/` (HTML del portal Seped) está versionado en git y crece con cada captura.
- `npm run build` del frontend falla por errores de tipos heredados (se usa `build-only`).
- Servicios muy grandes (`pedidos.service.ts` ~1900 líneas, `promociones.service.ts` ~1500, `ftp.service.ts` ~1200) sin pruebas automáticas (`npm test` es un placeholder).
- Código legado sin uso: `db.general.conection.ts`, `init.general.sql`, `login.router.ts`/`login.controller.ts` (no montado), scripts en `scripts/` que apuntan a tablas antiguas (`usuarios`).
- `nodemon` y `@types/multer` están en `dependencies` en lugar de `devDependencies`.
- `CHANGELOG.md` está desactualizado (llega a 1.2.8); el historial vigente está en `changelog.ts`.
- El `README.md` dentro de `frontend_pedidos_drogueria_v1.2/` y `AGENTS.md` son plantillas de Vuetify.
