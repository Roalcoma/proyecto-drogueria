# Graph Report - Pedidos_Drogueria  (2026-09-15)

## Corpus Check
- 201 files · ~210,263 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 2, .hash 1, .spec 1)

## Summary
- 2174 nodes · 3884 edges · 108 communities (86 shown, 21 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 49 edges (avg confidence: 0.85)
- Token cost: 650 input · 180 output

## Community Hubs (Navigation)
- FtpServidorView.vue
- BackOfficeView.vue
- RuteroView.vue
- PromocionesView.vue
- FtpService
- RequestConUsuario
- ClientesAdminView.vue
- RechequeoView.vue
- getDbConfig
- PedidosEstatusView.vue
- AprobacionPsicotropicosView.vue
- src/index.ts
- MetasVendedorView.vue
- PedidosEdicionView.vue
- SistemaController
- FacturasImpresionView.vue
- ReclamosView.vue
- CatalogoView.vue
- main.py
- PromocionesController
- seped.service.ts
- App.vue
- AuditoriaView.vue
- PedidosServices
- CarritoView.vue
- EcommerceView.vue
- backend_pedidos_drogueria_v1.2/package.json
- MetasService
- FacturasControllers
- RechequeoService
- EcommerceService
- FtpPedidosView.vue
- ims-email.service.ts
- frontend_pedidos_drogueria_v1.2/package.json
- notify
- mostrarSnack
- dependencies
- IComprasService
- mostrarSnack
- DescuentoArticuloView.vue
- pedidoPDF.ts
- ProductsService
- connectDb
- Pedidos Droguería Intercontinental — Changelog
- ChangelogModal.vue
- lanzarAviso
- ClientesController
- PromoEspecialService
- compilerOptions
- lanzarAviso
- ReclamosService
- ImsReporteView.vue
- devDependencies
- lanzarNotificacion
- .log
- .getVigentes
- dependencies
- devDependencies
- mostrarSnack
- Integración PDF Facturas — Documentación
- auth.service.ts
- useCarritoStore.ts
- tsconfig.app.json
- compilerOptions
- promociones.service.ts
- vue
- pct
- guardarDetalle
- mostrarSnack
- login.controller.ts
- branding.service.ts
- lanzarNotificacion
- escanearCajaGlobal
- Vue 3 + Vite + Vuetify + TypeScript Stack
- scripts
- useBrandingStore
- confirmarTomar
- scripts
- setup-supervisor.ts
- icompras.service.ts
- Lista de Precios
- calcularPrecioConDescuentos
- cargarFtpUsuarios
- actualizarEstatusBD
- guardarPromo
- dbMode.middleware.ts
- Banner Lista de Precios
- overrides
- cargarEstadoServidor
- cargarPedido
- cargarEstadoPicking
- cargarHistorial
- cargarRuteros
- frontend_pedidos_drogueria_v1.2/tsconfig.json
- SEPED Listing Snapshot (debug/latest variants)
- SEPED Listing Snapshots (Login Page — Unauthenticated)
- Vue.js Logo (PNG)
- cargarClientes
- ejecutarCicloSeped
- pedidoLabel
- errorFusion
- abrirMiembros
- abrirNuevaPromo
- cargarAuditoria
- cargarSesionPicking
- Drogueria Intercontinental C.A. Logo
- Frontend Pedidos — src/styles README

## God Nodes (most connected - your core abstractions)
1. `connectDb()` - 228 edges
2. `RequestConUsuario` - 56 edges
3. `getDbConfig()` - 51 edges
4. `PromocionesService` - 47 edges
5. `express` - 43 edges
6. `PromocionesController` - 33 edges
7. `vue` - 32 edges
8. `FtpService` - 30 edges
9. `RuteroService` - 27 edges
10. `connectRuteroDB()` - 26 edges

## Surprising Connections (you probably didn't know these)
- `SEPED Login Page Snapshot` --conceptually_related_to--> `Pedidos Droguería Intercontinental — Changelog`  [INFERRED]
  backend_pedidos_drogueria_v1.2/data/snapshots/listing_2026-09-04T214024331Z.html → CHANGELOG.md
- `SEPED Listing Snapshot (debug/latest variants)` --semantically_similar_to--> `SEPED Listing API Snapshot (timestamped)`  [INFERRED] [semantically similar]
  backend_pedidos_drogueria_v1.2/data/snapshots/listing_debug.html → backend_pedidos_drogueria_v1.2/data/snapshots/listing_2026-09-07T145054818Z.html
- `main.py — PDF Invoice Generator (SQL Server → PDF)` --references--> `pymssql — Python SQL Server Connector`  [INFERRED]
  backend_pedidos_drogueria_v1.2/impresion_facturas/INTEGRACION.md → backend_pedidos_drogueria_v1.2/impresion_facturas/requirements.txt
- `main.py — PDF Invoice Generator (SQL Server → PDF)` --references--> `reportlab — PDF Generation Library`  [INFERRED]
  backend_pedidos_drogueria_v1.2/impresion_facturas/INTEGRACION.md → backend_pedidos_drogueria_v1.2/impresion_facturas/requirements.txt
- `Drogueria Intercontinental C.A. Logo (Current)` --semantically_similar_to--> `Drogueria Intercontinental C.A. Logo (Old)`  [INFERRED] [semantically similar]
  frontend_pedidos_drogueria_v1.2/src/assets/drogueria_logo.png → frontend_pedidos_drogueria_v1.2/src/assets/drogueria_logo_old.png

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **PDF Invoice Integration Flow (Python + Node spawn)** — cobranza_app_frontend_ver_factura, cobranza_app_ver_factura_endpoint, impresion_facturas_generate_for_web_exe, impresion_facturas_main_py, impresion_facturas_settings_cfg [EXTRACTED 1.00]
- **Frontend Pedidos Vue 3 Setup Documentation** — frontend_pedidos_drogueria_agents_md, frontend_pedidos_drogueria_readme, frontend_pedidos_drogueria_index_html, frontend_pedidos_drogueria_plugins_readme, frontend_pedidos_drogueria_styles_readme [INFERRED 0.95]

## Communities (108 total, 21 thin omitted)

### Community 0 - "FtpServidorView.vue"
Cohesion: 0.03
Nodes (61): accionServidor, auditoria, authStore, brandingStore, buscarUsuario, cargandoAudit, cargandoFcAudit, cargandoSepedAuditoria (+53 more)

### Community 1 - "BackOfficeView.vue"
Cohesion: 0.03
Nodes (55): actualizando, Backup, backups, bitsDescripcion, brandingLogoPreview, brandingPreview, brandingStore, busquedaUsuario (+47 more)

### Community 2 - "RuteroView.vue"
Cohesion: 0.03
Nodes (66): agregandoPicking, authStore, barcodeGlobalRef, barcodeInputRef, buscandoDoc, buscandoManual, cargando, cargandoHist (+58 more)

### Community 3 - "PromocionesView.vue"
Cohesion: 0.03
Nodes (58): auditDetalle, auditEntidades, auditFiltroEntidad, auditPagina, auditPerPage, auditRows, auditTotal, aviso (+50 more)

### Community 4 - "FtpService"
Cohesion: 0.06
Nodes (6): FarcomprasController, FtpController, guardarDbConfig(), FarcomprasService, FtpService, getLocalIp()

### Community 5 - "RequestConUsuario"
Cohesion: 0.06
Nodes (7): AuthController, RuteroController, connectRuteroDB(), RequestConUsuario, esAdmin(), parsearVisibilidad(), RuteroService

### Community 6 - "ClientesAdminView.vue"
Cohesion: 0.03
Nodes (48): aviso, busquedaCliente, busquedaClienteAgregar, busquedaGrupo, camposClientes, cargandoClientes, cargandoGrupos, cargandoMiembros (+40 more)

### Community 7 - "RechequeoView.vue"
Cohesion: 0.04
Nodes (51): activeCab, albaranes, albDetalle, albFiltros, albLineas, albPage, albRatioUSD, albSeleccionado (+43 more)

### Community 8 - "getDbConfig"
Cohesion: 0.09
Nodes (26): config, DescuentoArticuloController, attachPoolErrorHandler(), buildBase(), buildConfig(), closeDb(), mssql, probarConexion() (+18 more)

### Community 9 - "PedidosEstatusView.vue"
Cohesion: 0.04
Nodes (42): Anomalia, authStore, cargandoPreciosCatalogo, carritoStore, conteoModal, dialogCodigo, dialogCopiaPrecios, dialogEliminar (+34 more)

### Community 10 - "AprobacionPsicotropicosView.vue"
Cohesion: 0.05
Nodes (44): agregarProducto(), aprobando, aprobar(), authStore, aviso, brandingStore, buscarPsicoDialog, busquedaPsico (+36 more)

### Community 11 - "src/index.ts"
Cohesion: 0.12
Nodes (23): app, adminMiddleware(), authMiddleware(), ftpUsuariosMiddleware(), imsMiddleware(), auditRouter, authRouter, clientesRouter (+15 more)

### Community 12 - "MetasVendedorView.vue"
Cohesion: 0.04
Nodes (41): anioActual, aniosDisponibles, cargandoProgreso, cargandoProgresoVendedor, cargandoVendedoresZona, cargandoZonas, dialog, dialogDetalleZona (+33 more)

### Community 13 - "PedidosEdicionView.vue"
Cohesion: 0.04
Nodes (36): agregandoProducto, algunosMarcados, authStore, bulkD3, bulkD4, buscandoProducto, busquedaId, busquedaProducto (+28 more)

### Community 14 - "SistemaController"
Cohesion: 0.07
Nodes (22): SistemaController, reconectarDb(), BACKUPS_DIR, crearBackup(), descargarZip(), ejecutarActualizacion(), ejecutarRollback(), EXTRACT_TMP (+14 more)

### Community 15 - "FacturasImpresionView.vue"
Cohesion: 0.06
Nodes (38): abToBase64(), asignando, asignarNoControl(), buscarFacturas(), cargando, cola, ColaItem, colaOk (+30 more)

### Community 16 - "ReclamosView.vue"
Cohesion: 0.06
Nodes (40): agregarLinea(), aplicarFactura(), argumentos, _artTimers, authStore, aviso, busqueda, busquedaCliente (+32 more)

### Community 17 - "CatalogoView.vue"
Cohesion: 0.06
Nodes (38): aviso, buscarDesdeBoton(), busquedaCliente, busquedaProducto, calcularPrecioFinalDolar(), cargandoClientes, cargandoProductos, cargarProductosDesdeTabla() (+30 more)

### Community 18 - "main.py"
Cohesion: 0.08
Nodes (28): main_web(), cargar_configuracion(), Database, desencriptar_clave(), escribir_log(), extraer_datos_de_xml(), fmt_2(), fmt_2_neg() (+20 more)

### Community 20 - "seped.service.ts"
Cohesion: 0.10
Nodes (21): SepedController, audit(), decideAcceptance(), DEFAULT_CFG, emit(), extractCsrf(), hashHtml(), isInNoOp() (+13 more)

### Community 21 - "App.vue"
Cohesion: 0.07
Nodes (29): applyBrandingTheme(), authStore, brandingStore, carritoStore, drawer, errorTasa, promocionesStore, router (+21 more)

### Community 22 - "AuditoriaView.vue"
Cohesion: 0.06
Nodes (29): brandingStore, cargando, cargar(), FilaDiff, filtroBuscarGrupos, filtroBuscarRutero, filtroOrder, filtroUsuario (+21 more)

### Community 23 - "PedidosServices"
Cohesion: 0.10
Nodes (3): PedidosControllers, buildEstatusClause(), PedidosServices

### Community 24 - "CarritoView.vue"
Cohesion: 0.09
Nodes (27): abrirModalEdicion(), actualizarCantidad(), authStore, calcularPrecioConDescuento(), carritoStore, enviando, exportarPDF(), getStockDisponible() (+19 more)

### Community 25 - "EcommerceView.vue"
Cohesion: 0.08
Nodes (30): aprobando, aprobar(), auditoria, brandingStore, busqueda, busquedaAud, cargando, cargandoAud (+22 more)

### Community 26 - "backend_pedidos_drogueria_v1.2/package.json"
Cohesion: 0.07
Nodes (27): author, description, xlsx, keywords, license, main, name, version (+19 more)

### Community 27 - "MetasService"
Cohesion: 0.11
Nodes (3): MetasController, metasRouter, MetasService

### Community 28 - "FacturasControllers"
Cohesion: 0.11
Nodes (7): FacturasControllers, facturasRouter, CONFIG_PATH, FacturasConfig, FacturasService, loadConfig(), saveConfig()

### Community 30 - "EcommerceService"
Cohesion: 0.12
Nodes (4): main(), main(), EcommerceController, EcommerceService

### Community 31 - "FtpPedidosView.vue"
Cohesion: 0.10
Nodes (22): auditoria, authStore, brandingStore, busqueda, cargando, cargarAuditoria(), cargarPagina(), escaneando (+14 more)

### Community 32 - "ims-email.service.ts"
Cohesion: 0.13
Nodes (9): aplicarCabecera(), generarImsExcel(), ImsController, DEFAULT, ImsEmailConfig, ImsEmailService, rangoAnterior(), node-cron (+1 more)

### Community 33 - "frontend_pedidos_drogueria_v1.2/package.json"
Cohesion: 0.09
Nodes (21): exceljs, @types/node, typescript, xlsx, name, private, type, version (+13 more)

### Community 34 - "notify"
Cohesion: 0.15
Nodes (23): abrirPanelRutero(), actualizarFechaFactura(), actualizarFechaRutero(), agregarAPicking(), agregarDocManual(), agregarFacturaManual(), buscar(), cargarFacturasRutero() (+15 more)

### Community 35 - "mostrarSnack"
Cohesion: 0.13
Nodes (21): cambiarPassword(), cargarAuditoria(), cargarFcAuditoria(), cargarSepedAuditoria(), cargarUsuarios(), copiarConexion(), copiarFormato(), crearUsuario() (+13 more)

### Community 36 - "dependencies"
Cohesion: 0.10
Nodes (20): dependencies, adm-zip, basic-ftp, bcryptjs, cheerio, cors, dotenv, exceljs (+12 more)

### Community 38 - "mostrarSnack"
Cohesion: 0.12
Nodes (19): cargarUsuarios(), ejecutarInicializarBD(), ejecutarRollbackFn(), escanearAhora(), guardarBranding(), guardarClave(), guardarClaveAdminFn(), guardarCodAlmacen() (+11 more)

### Community 39 - "DescuentoArticuloView.vue"
Cohesion: 0.13
Nodes (16): articulos, bsFormatter, buscar(), cargando, cargar(), filtros, guardando, guardar() (+8 more)

### Community 40 - "pedidoPDF.ts"
Cohesion: 0.15
Nodes (16): imprimirPDF(), imprimirPDFMultiple(), FacturaPDFData, FacturaPDFHeader, FacturaPDFItem, compressImageForPDF(), ConteoPDFData, FormatoPDF (+8 more)

### Community 41 - "ProductsService"
Cohesion: 0.18
Nodes (3): ProductsController, productsRouter, ProductsService

### Community 43 - "Pedidos Droguería Intercontinental — Changelog"
Cohesion: 0.21
Nodes (17): Módulo BackOffice, Módulo FTP Servidor, Módulo iCompras / Ecommerce, Módulo Metas de Vendedores, Módulo Rutero de Entrega, Pedidos Droguería Intercontinental — Changelog, Sistema de Permisos Bitmask (VISIBILIDAD), Version 1.2.0 (Initial commit) (+9 more)

### Community 44 - "ChangelogModal.vue"
Cohesion: 0.15
Nodes (12): commitsFiltrados, filtroTipo, filtroVersion, normalTipo(), open, TIPOS, versionDeCommit(), APP_VERSION (+4 more)

### Community 45 - "lanzarAviso"
Cohesion: 0.16
Nodes (17): abrirMiembros(), agregarMiembro(), cargarGrupos(), cargarMiembros(), cargarPaginaGrupos(), cargarPaginaMiembros(), ejecutarCrearLote(), ejecutarImportarClientesLote() (+9 more)

### Community 47 - "PromoEspecialService"
Cohesion: 0.22
Nodes (5): PromoEspecialController, uid(), usr(), localHoy(), PromoEspecialService

### Community 48 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, noImplicitAny, outDir, resolveJsonModule (+7 more)

### Community 49 - "lanzarAviso"
Cohesion: 0.17
Nodes (16): abrirNuevaPE(), agregarMiembro(), buscarArticulosParaAgregar(), cargarGrupos(), cargarMiembros(), cargarPaginaGrupos(), cargarPaginaMiembros(), cargarPromoEspeciales() (+8 more)

### Community 50 - "ReclamosService"
Cohesion: 0.19
Nodes (3): ReclamosController, reclamosRouter, ReclamosService

### Community 51 - "ImsReporteView.vue"
Cohesion: 0.13
Nodes (11): descargando, desde, diasSemana, emailCfg, emailError, emailOk, enviando, error (+3 more)

### Community 52 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, ts-node-dev, @types/adm-zip, @types/bcryptjs, @types/cors, @types/express, @types/jsonwebtoken, @types/morgan (+6 more)

### Community 53 - "lanzarNotificacion"
Cohesion: 0.15
Nodes (14): aplicarFiltros(), cargarPagina(), cargarRiesgosMasivos(), confirmarCopiaPrecios(), ejecutarFusion(), eliminarPedido(), formatearFecha(), guardarCodigo() (+6 more)

### Community 56 - "dependencies"
Cohesion: 0.15
Nodes (13): dependencies, axios, exceljs, @fontsource/roboto, jspdf, jspdf-autotable, @mdi/font, pinia (+5 more)

### Community 57 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, npm-run-all2, sass-embedded, serve, @tsconfig/node22, @types/node, typescript, unplugin-fonts (+5 more)

### Community 58 - "mostrarSnack"
Cohesion: 0.31
Nodes (13): abrirDetalleZona(), cargarProgreso(), cargarProgresoVendedor(), cargarVendedoresZona(), cargarZonas(), dividirIgualitariamente(), eliminarMetaZona(), fmt() (+5 more)

### Community 59 - "Integración PDF Facturas — Documentación"
Cohesion: 0.23
Nodes (12): Integración PDF Facturas — Documentación, Python Invoice Printing Dependencies, cobranza-app Frontend verFactura() — Context Menu PDF Viewer, cobranza-app /api/ver-factura Endpoint (Node/Express), PDF Invoice Generation Integration (Python + Node spawn), generate_for_web.exe — PyInstaller Compiled Executable, generate_for_web.py — Web Mode Wrapper, main.py — PDF Invoice Generator (SQL Server → PDF) (+4 more)

### Community 60 - "auth.service.ts"
Cohesion: 0.21
Nodes (6): encriptacion, AuthService, ModuloPermiso, MODULOS_SISTEMA, UsuarioAuth, jsonwebtoken

### Community 61 - "useCarritoStore.ts"
Cohesion: 0.27
Nodes (9): useAppStore, ArticuloCarrito, Cliente, Producto, useCarritoStore, PromocionAplicada, PromocionVigente, usePromocionesStore (+1 more)

### Community 62 - "tsconfig.app.json"
Cohesion: 0.17
Nodes (11): compilerOptions, baseUrl, composite, paths, tsBuildInfoFile, exclude, extends, include (+3 more)

### Community 63 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, module, moduleResolution, noEmit, tsBuildInfoFile, types, extends (+2 more)

### Community 64 - "promociones.service.ts"
Cohesion: 0.20
Nodes (8): CampoDef, CAMPOS_ARTICULOS, CAMPOS_CLIENTES, CondicionInput, EscalaInput, OPERADORES_NUMERO, OPERADORES_TEXTO, PromocionAplicada

### Community 65 - "vue"
Cohesion: 0.25
Nodes (5): *.vue, bsVal, props, app, vue

### Community 66 - "pct"
Cohesion: 0.25
Nodes (8): pct(), progresoOrdenado, promedioGeneral, rankingDistancia, rankingMonto, rankingPct, totalVendido, ventaModo()

### Community 67 - "guardarDetalle"
Cohesion: 0.25
Nodes (8): actualizarConteo(), actualizarFechaVenc(), actualizarLote(), cargarLineasSilencioso(), detenerPolling(), guardarDetalle(), iniciarPolling(), procesarScan()

### Community 68 - "mostrarSnack"
Cohesion: 0.29
Nodes (8): buscarAlbaranes(), cargarListas(), confirmarCerrar(), fmt(), generarPdfAlbaran(), mostrarSnack(), seleccionarAlbaran(), verDetalleCerrado()

### Community 69 - "login.controller.ts"
Cohesion: 0.33
Nodes (3): loginController, loginRouter, loginServices

### Community 70 - "branding.service.ts"
Cohesion: 0.33
Nodes (4): Branding, BRANDING_PATH, BrandingService, DEFAULTS

### Community 71 - "lanzarNotificacion"
Cohesion: 0.33
Nodes (7): buscarProductos(), cargarLista(), guardarCambios(), lanzarNotificacion(), onTableOptions(), seleccionarProducto(), volver()

### Community 72 - "escanearCajaGlobal"
Cohesion: 0.43
Nodes (7): confirmarEnRutaConClave(), escanearCajaGlobal(), hablar(), hablarRapido(), iniciarViajeSession(), ruteroPickingCompleto(), verificarPickingCompleto()

### Community 73 - "Vue 3 + Vite + Vuetify + TypeScript Stack"
Cohesion: 0.33
Nodes (6): Pinia + Vue Router (Enabled Features), Vue 3 + Vite + Vuetify + TypeScript Stack, Frontend Pedidos — AGENTS.md Project Rules, APP Pedidos — index.html SPA Entry Point, Frontend Pedidos — src/plugins README, frontend-pedidos-drogueria README

### Community 74 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build-only, dev, preview, start, type-check

### Community 75 - "useBrandingStore"
Cohesion: 0.40
Nodes (6): build, crearRuteroDocumentos(), generarControlRuterosPDF(), generarPDF(), imprimirRutero(), useBrandingStore

### Community 76 - "confirmarTomar"
Cohesion: 0.47
Nodes (6): cargarDetalle(), cargarMisConteos(), confirmarTomar(), esMismoPedido(), seleccionarCab(), seleccionarMiPedido()

### Community 77 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, start, test

### Community 78 - "setup-supervisor.ts"
Cohesion: 0.40
Nodes (3): config, iConstantes, dotenv

### Community 79 - "icompras.service.ts"
Cohesion: 0.40
Nodes (3): HTTP_HEADERS, IComprasConfig, PedidoRemoto

### Community 80 - "Lista de Precios"
Cohesion: 0.40
Nodes (5): Banner Lista de Precios, Category Tags (Nuevo, Condicionado, IVA, Monto Factura), Columna PEDIDO, Drogueria Intercontinental, Lista de Precios

### Community 81 - "calcularPrecioConDescuentos"
Cohesion: 0.40
Nodes (5): agregarDescuento(), aplicarBulkDescuentos(), calcularPrecioConDescuentos(), descuentosDeLinea(), quitarDescuento()

### Community 82 - "cargarFtpUsuarios"
Cohesion: 0.50
Nodes (4): cargarFtpUsuarios(), crearFtpUsuario(), eliminarFtpUsuario(), toggleFtpUsuario()

### Community 83 - "actualizarEstatusBD"
Cohesion: 0.50
Nodes (4): actualizarEstatusBD(), confirmarConAnomalias(), ejecutarCambioEstatus(), transicionesPermitidas()

### Community 84 - "guardarPromo"
Cohesion: 0.50
Nodes (4): cargarPaginaPromos(), cargarPromociones(), guardarPromo(), refrescarPromocionesGlobal()

### Community 86 - "Banner Lista de Precios"
Cohesion: 0.67
Nodes (3): Drogueria Intercontinental C.A., Banner Lista de Precios, Lista de Precios - Concepto

### Community 87 - "overrides"
Cohesion: 0.67
Nodes (3): overrides, unplugin-fonts, vite

### Community 88 - "cargarEstadoServidor"
Cohesion: 0.67
Nodes (3): cargarEstadoServidor(), detenerServidor(), iniciarServidor()

### Community 89 - "cargarPedido"
Cohesion: 0.67
Nodes (3): cargarPedido(), cargarVendedores(), seleccionarPedido()

### Community 90 - "cargarEstadoPicking"
Cohesion: 0.67
Nodes (3): abrirPicking(), cargarEstadoPicking(), escanearCaja()

### Community 91 - "cargarHistorial"
Cohesion: 0.67
Nodes (3): buscarHistorial(), cargarHistorial(), limpiarFiltrosHist()

### Community 92 - "cargarRuteros"
Cohesion: 0.67
Nodes (3): buscarRuteros(), cargarRuteros(), limpiarFiltrosRuteros()

### Community 94 - "SEPED Listing Snapshot (debug/latest variants)"
Cohesion: 1.00
Nodes (3): SEPED Listing Snapshot (debug/latest variants), SEPED Listing API Snapshot (timestamped), SEPED Drogueria Intercontinental — External Supplier System

## Knowledge Gaps
- **901 isolated node(s):** `name`, `version`, `description`, `main`, `test` (+896 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1053 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vue` connect `vue` to `FtpServidorView.vue`, `BackOfficeView.vue`, `RuteroView.vue`, `PromocionesView.vue`, `ClientesAdminView.vue`, `RechequeoView.vue`, `PedidosEstatusView.vue`, `AprobacionPsicotropicosView.vue`, `MetasVendedorView.vue`, `PedidosEdicionView.vue`, `FacturasImpresionView.vue`, `ReclamosView.vue`, `CatalogoView.vue`, `App.vue`, `AuditoriaView.vue`, `CarritoView.vue`, `EcommerceView.vue`, `FtpPedidosView.vue`, `frontend_pedidos_drogueria_v1.2/package.json`, `DescuentoArticuloView.vue`, `ChangelogModal.vue`, `ImsReporteView.vue`, `useCarritoStore.ts`?**
  _High betweenness centrality (0.278) - this node is a cross-community bridge._
- **Why does `axios` connect `App.vue` to `FtpServidorView.vue`, `BackOfficeView.vue`, `RuteroView.vue`, `PromocionesView.vue`, `ClientesAdminView.vue`, `RechequeoView.vue`, `PedidosEstatusView.vue`, `AprobacionPsicotropicosView.vue`, `MetasVendedorView.vue`, `PedidosEdicionView.vue`, `FacturasImpresionView.vue`, `ReclamosView.vue`, `CatalogoView.vue`, `AuditoriaView.vue`, `CarritoView.vue`, `EcommerceView.vue`, `FtpPedidosView.vue`, `frontend_pedidos_drogueria_v1.2/package.json`, `DescuentoArticuloView.vue`, `ImsReporteView.vue`, `useCarritoStore.ts`?**
  _High betweenness centrality (0.253) - this node is a cross-community bridge._
- **Why does `express` connect `src/index.ts` to `login.controller.ts`, `getDbConfig`, `ProductsService`, `FacturasControllers`, `ClientesController`, `icompras.service.ts`, `ReclamosService`, `seped.service.ts`, `dbMode.middleware.ts`, `backend_pedidos_drogueria_v1.2/package.json`, `MetasService`, `auth.service.ts`?**
  _High betweenness centrality (0.198) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _901 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `FtpServidorView.vue` be split into smaller, more focused modules?**
  _Cohesion score 0.025974025974025976 - nodes in this community are weakly interconnected._
- **Should `BackOfficeView.vue` be split into smaller, more focused modules?**
  _Cohesion score 0.02631578947368421 - nodes in this community are weakly interconnected._
- **Should `RuteroView.vue` be split into smaller, more focused modules?**
  _Cohesion score 0.0273972602739726 - nodes in this community are weakly interconnected._