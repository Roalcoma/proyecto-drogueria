# Changelog — APP Pedidos Droguería Intercontinental

Todos los cambios notables del proyecto, del más reciente al más antiguo.

---

## [1.2.8] — 2026-07-30

### Agregado
- **Rutero Admin (permiso bit 65536):** nuevo permiso `RUTERO_ADMIN` que habilita operaciones avanzadas en el módulo Rutero
  - Borrar facturas de ruteros en estado EN_RUTA o ENTREGADO
  - Cambiar fecha de entrega por factura individual
  - Cambiar fecha de entrega para todo el rutero de una sola vez (botón "Cambiar fecha (todo)")
  - Chip "Rutero Admin" visible en el encabezado del módulo cuando el usuario tiene el permiso
- **Filtros de fecha en Rutero:** campos Desde/Hasta en las pestañas Ruteros Activos e Historial
- **Bloqueo de confirmación sin EN_RUTA:** los botones "Confirmar selec.", "Confirmar todo" y el check individual quedan deshabilitados si el rutero no está en estado En Viaje; tooltip explica el motivo
- **Artículos condicionados (NODTOAPLICABLE) sin descuentos:**
  - Carrito: no aplica descuentos (corrige bug de sessionStorage stale)
  - Excel catálogo: columna descuento en 0% para artículos condicionados
  - Artículos NI (DIASPROTECCION > 0) marcados en morado en el Excel

### Corregido
- Prevención de facturas duplicadas en ruteros concurrentes

---

## [1.2.7] — 2026-07-27 al 2026-07-29

### Agregado
- **Módulo de Metas de Vendedores:** dashboard con progreso, rankings y gestión; sincronización con `[RIP].[METAS_VENDEDORES]`; metas en dólares; selector de vendedor por código o nombre; rediseño con auto-sync CUMPLIDA
- **Sistema de rollback:** backup automático antes de cada actualización; restauración desde la UI de administración
- **Modal Changelog** en el panel de admin con historial del proyecto (datos estáticos en frontend)
- **Selector de vendedor** en edición de pedidos
- **Total sin cancelados** en control de estatus
- **Serie y número de factura** en control de estatus + filtro por N° factura
- **Selector de formato PDF** en control de estatus
- **Campo de IP** para datos de conexión de clientes FTP
- **Modal para editar cantidad** al hacer click en el número en edición de pedidos
- Aplicar promociones por fecha en FTP

### Corregido
- Calcular acceso total de permisos dinámicamente desde MODULOS (no hardcodeado a 32767)
- Límite de VISIBILIDAD ampliado a INT máximo para soportar más de 15 módulos
- Persistir estado FTP al iniciar/detener desde la UI
- Pedidos FTP ahora aplican D1 cliente y promos slot 2/3
- Resolver timeout en filtro por N° factura (pre-lookup en dos pasos)

---

## [1.2.6] — 2026-07-20 al 2026-07-27

### Agregado
- **FTP completo:** servidor FTP embebido con gestión de usuarios, ciclo automático de inventario+facturas, Excel con D1%/D2%, módulo FTP_SERVIDOR en BackOffice; carga masiva de usuarios desde Excel
- **Nuevo layout Excel catálogo:** banner, leyenda de colores, columna Proveedor opcional, fix GARANTIACOMPRA; colores por tipo de artículo (condicionado, NI, IVA, zebra)
- **Reclamos:** artículos por factura vía ALBVENTACAB/ALBVENTALIN; logo Droguería en PDF; separación por tipo en FTP
- **Promociones por proveedor/marca** con escala agregada
- **PDF Control de Ruteros** en sesión de picking
- Zona horaria configurable desde administración
- Total seleccionados y filtro estatus múltiple en seguimiento de órdenes

### Corregido
- ORDERID FTP usa prefijo F (en lugar de FP) para respetar longitud máxima
- Pedidos FTP usan precio del sistema, no el del archivo
- Corrección de desfase de 4 horas en fechas/horas del aplicativo
- Filtro de fecha enviaba un día menos por conversión UTC de mssql.Date
- Binding de selección de tabla en Vuetify 4 (`v-model:selected` → `v-model + return-object`)

---

## [1.2.5] — 2026-07-14 al 2026-07-19

### Agregado
- **Icompras reliability:** errores de importación visibles en UI; resolución por CODARTICULO directo; consolidar líneas duplicadas sumando cantidades; audit trail completo
- **White-label branding:** logo y colores configurables desde administración
- **Picking generalizado por sesión:** escaneo global sin ID de rutero previo; bloqueo exclusivo por usuario; audio al completar picking; modal facturas pendientes
- **Permiso DESCUENTO_LINEA (bit 512):** descuentos en línea independientes del rol admin
- **Permiso AUTORIZADOR:** edición de pedidos psicotrópicos desde pantalla de aprobación
- **Auditoría de rutero** con logging de acciones; PDF con dirección completa
- **Restricciones de slots D2/D3** en promociones; D4 solo manual
- **Código de aprobación editable;** riesgo en moneda CXC; condición en edición
- **D3 editable** en pestaña de clientes
- **Historial en Rutero** (pestaña con ruteros ENTREGADO)
- Selector de fecha en confirmación masiva de rutero + selección individual de facturas
- Importación automática de pedidos desde servidor FTP con separación por tipo (P/NI/SD/normal)
- PDF en pestaña, filtro por usuario en estatus
- Restricción de artículos con condición en edición de pedidos normales
- Persistir tamaño de página por sesión en todas las tablas

### Corregido
- Bloqueo de BD eliminado (NOLOCK en lecturas + guard de scan concurrente)
- Índices faltantes en tablas APP_*
- Icompras usa el vendedor del cliente desde CLIENTESCAMPOSLIBRES
- Visibilidad respeta bitmask exacto; login con fondo del branding
- Límite de body JSON subido a 5mb para soportar logos en base64
- Timeout de inactividad de sesión subido a 7 horas
- iCompras: zona horaria America/Caracas; .done solo tras aprobación confirmada
- Riesgo en USD usando cotización VED

---

## [1.2.4] — 2026-07-10 al 2026-07-13

### Agregado
- **Rutero de Entrega completo:** picking por código de barras, sesión por usuario, estado EN_RUTA, filtros, fecha de entrega, PDF con cajas y logo; pestaña Documentos; agregar facturas manual desde oficina
- Paginación corregida ('All' en todos los servicios)
- Marca y filtro de facturado en pedidos vía ALBVENTACAB
- Revertir estado EMPACADO

### Corregido
- Rutero: excluir facturas EN_RUTA del listado de disponibles
- Rutero: limpiar facturas al cambiar de zona para evitar asignación cruzada
- Rutero: regex para parsear barcode con cualquier separador del scanner

---

## [1.2.3] — 2026-07-01 al 2026-07-09

### Agregado
- **Módulo Rutero de Entrega** (base): búsqueda por zona, pestañas Oficina/Chofer, PDF con logo, confirmación de entrega numerada; tablas APP_RUTEROS en BD separada
- **Ecommerce/iCompras:** integración en Control de Estatus; split de pedidos en grupos P/NI/SD/normal; separación psicotrópicos
- **Módulo de impresión de facturas en lote**
- **Pedidos psicotrópicos:** dos formatos PDF, footer farmacéutico, filtros, aprobación
- Promo con nombre (PROMO_NOMBRE en CABECERA_PED); toggle "sin desc." en PDF
- Catálogo: buscar por nombre comercial; limpiar cliente; barcode en búsqueda
- Stock configurable por almacén
- Visor de conteo para pedidos OK con PDF extendido

### Corregido
- Uso de CLIENTESENVIO.DIRECCION1 como dirección de envío en todos los PDFs
- PDF de pedido muestra solo la fecha sin hora
- PDFs comprimidos (logo en base64 más liviano)

---

## [1.2.2] — 2026-06-15 al 2026-06-30

### Agregado
- **Sistema de permisos por bitmask** (VISIBILIDAD) con panel en BackOffice
- **Carrito con IVA** por artículo; PDF y BD
- **Catálogo segmentos** por D1 de clientes + vendedores sin filtro ACTIVO; tarifa base configurable
- **Control de Estatus:** filtros, vendedor, estado ICG, contador de pedidos, total USD
- Descuento manual en edición + eliminar línea + cancelar pedido PENDIENTE
- Promociones: múltiples grupos incluir/excluir, exclusión de artículos, escala agregada
- Actualización automática con backup y NSSM

### Corregido
- NODTOAPLICABLE es BIT (comparar con 1, no 'T')
- Catálogo: todos los artículos sin filtrar por stock en segmentos
- Redondeo de precios a 2 decimales en LINEA_PED

---

## [1.2.1] — 2026-06-01 al 2026-06-14

### Agregado
- **Autenticación** desde DROGUERIA..VENDEDORES; puertos 9000/9010; chip AUTORIZADOR
- **Actualizador** vía GitHub API (sin git) + adm-zip con logging detallado
- **Descuento global** de cliente desde CLIENTESCAMPOSLIBRES.D1
- Lote y fecha de vencimiento en PDFs

---

## [1.2.0] — Initial commit

Base del proyecto: Pedidos Droguería Intercontinental v1.2 con módulos de Catálogo, Carrito, Control de Estatus, Edición de Pedidos y BackOffice.
