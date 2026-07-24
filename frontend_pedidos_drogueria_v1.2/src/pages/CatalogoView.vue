<template>
  <v-container fluid class="pa-6 bg-background h-100">
    
    <v-row>
      <v-col cols="12">
        <v-card elevation="1" class="rounded-lg border-0">
          <v-card-text class="d-flex align-center flex-wrap gap-4 pa-4">
            
            <div class="d-flex align-center mr-6">
              <v-avatar color="primary" size="48" class="mr-3 text-white elevation-2">
                <v-icon size="28">mdi-cart-arrow-down</v-icon>
              </v-avatar>
              <div>
                <h1 class="text-h5 font-weight-bold mb-0" style="line-height: 1; color: #164E63;">Catálogo</h1>
                <span class="text-caption text-medium-emphasis">Tasa: Bs. {{ carritoStore.tasa }}</span>
              </div>
            </div>

            <v-divider vertical class="mx-2 d-none d-md-block" style="height: 40px;"></v-divider>

            <div class="d-flex align-center flex-grow-1" style="max-width: 400px;">
              <v-text-field
                :model-value="carritoStore.clienteSeleccionado ? `${carritoStore.clienteSeleccionado.CODCLIENTE} - ${carritoStore.clienteSeleccionado.NOMBRECOMERCIAL || carritoStore.clienteSeleccionado.NOMBRECLIENTE}` : ''"
                label="Cliente / Farmacia"
                placeholder="Click para buscar..."
                variant="solo-filled"
                bg-color="grey-lighten-3"
                readonly
                prepend-inner-icon="mdi-account-box"
                hide-details
                density="comfortable"
                class="flex-grow-1"
                @click="modalCliente.mostrar = true"
              >
                <template v-slot:append-inner>
                  <v-btn
                    v-if="carritoStore.clienteSeleccionado"
                    icon="mdi-close"
                    variant="text"
                    size="small"
                    color="grey-darken-1"
                    @click.stop="carritoStore.clienteSeleccionado = null"
                  />
                  <v-btn color="primary" variant="elevated" size="small" @click="modalCliente.mostrar = true">
                    <v-icon size="18">mdi-magnify</v-icon>
                  </v-btn>
                </template>
              </v-text-field>
              
              <v-chip 
                v-if="carritoStore.clienteSeleccionado && Number(carritoStore.clienteSeleccionado.DESCUENTO) > 0"
                color="orange-darken-3" 
                variant="flat" 
                class="ml-2 font-weight-black"
                size="large"
              >
                <v-icon start size="18">mdi-sale</v-icon>
                {{ carritoStore.clienteSeleccionado.DESCUENTO }}% GLOBAL
              </v-chip>
            </div>
            
            <v-spacer></v-spacer>

            <v-btn
              prepend-icon="mdi-file-excel"
              color="green-darken-2"
              variant="flat"
              class="rounded-pill px-6"
              @click="modalExcel.mostrar = true"
            >
              Pedido Rápido (Excel)
            </v-btn>

            <v-select
              v-model="filtroStock"
              :items="opcionesStock"
              item-title="texto"
              item-value="valor"
              label="Disponibilidad"
              variant="outlined"
              color="primary"
              density="comfortable"
              hide-details
              style="max-width: 180px;"
              @update:model-value="buscarDesdeBoton"
              prepend-inner-icon="mdi-package-variant"
            ></v-select>
            
            <v-text-field
              v-model="busquedaProducto"
              @keyup.enter="buscarDesdeBoton"
              prepend-inner-icon="mdi-pill"
              label="Buscar medicamento..."
              variant="outlined"
              color="primary"
              density="comfortable"
              hide-details
              class="flex-grow-1"
              style="max-width: 350px;"
            >
              <template v-slot:append-inner>
                <v-btn color="primary" variant="text" size="small" class="font-weight-bold" @click="buscarDesdeBoton">
                  BUSCAR
                </v-btn>
              </template>
            </v-text-field>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-card elevation="1" class="rounded-lg border-0 overflow-hidden">
          <v-data-table-server
            :headers="headersProductos"
            :items="productos"
            :items-length="totalProductos"
            :loading="cargandoProductos"
            v-model:items-per-page="catalogoPageSize"
            @update:options="cargarProductosDesdeTabla"
            hover
            class="bg-white"
          >
            <template v-slot:headers="{ columns }">
              <tr>
                <th v-for="col in columns" :key="col.key ?? undefined" class="bg-surface-variant font-weight-bold text-uppercase text-caption pa-4" style="color: #164E63;">
                  {{ col.title }}
                </th>
              </tr>
            </template>

            <template v-slot:item.DESCRIPCION="{ item }">
              <div class="d-flex align-center py-2">
                <div class="mr-2">
                  <div class="font-weight-bold text-subtitle-2" style="color: #164E63;">{{ item.DESCRIPCION }}</div>
                  <div class="text-caption text-grey">Cod: {{ item.CODARTICULO }}</div>
                </div>
                <v-chip v-if="item.ES_PSICOTROPICO === 'T'" color="purple-darken-2" size="x-small" variant="flat" class="font-weight-black ml-2">
                  <v-icon start size="12">mdi-alert-decagram</v-icon> CONTROLADO
                </v-chip>
              </div>
            </template>

            <template v-slot:item.precio="{ item }">
              <div class="d-flex flex-column align-end py-1">
                <div v-if="tieneDescuentos(item)" class="d-flex align-center mb-n1">
                  <span class="text-caption text-grey text-decoration-line-through">$ {{ obtenerPrecioDolar(item).toFixed(2) }}</span>
                </div>
                <MontoDisplay :usd="calcularPrecioFinalDolar(item)" :tasa="carritoStore.tasa" main-class="text-secondary font-weight-black text-subtitle-1" align-end />
                <span v-if="Number(item.PORCENTAJEIVA) > 0" class="text-caption text-blue-darken-2">IVA {{ item.PORCENTAJEIVA }}% incl.</span>
              </div>
            </template>

            <template v-slot:item.stock="{ item }">
              <v-chip :color="getStockTotal(item) > 0 ? 'success' : 'error'" variant="flat" size="small" class="font-weight-bold">
                {{ getStockTotal(item) }} u.
              </v-chip>
            </template>

            <template v-slot:item.acciones="{ item }">
              <v-btn color="primary" variant="elevated" size="small" class="rounded-pill px-4" @click="prepararAgregar(item)" :disabled="getStockTotal(item) <= 0">
                <v-icon left size="18" class="mr-1">mdi-plus-thick</v-icon> Agregar
              </v-btn>
            </template>
          </v-data-table-server>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="modalCliente.mostrar" max-width="700">
      <v-card class="rounded-lg">
        <v-card-title class="bg-primary text-on-primary font-weight-bold d-flex justify-space-between align-center">
          <span><v-icon start>mdi-account-search</v-icon> Seleccionar Cliente</span>
          <v-btn icon="mdi-close" variant="text" color="white" @click="modalCliente.mostrar = false"></v-btn>
        </v-card-title>
        <v-card-text class="pt-6">
          <v-text-field v-model="busquedaCliente" label="Escribe CIF o Nombre..." variant="outlined" append-inner-icon="mdi-magnify" @keyup.enter="buscarClientesManualmente" class="mb-4" autofocus></v-text-field>
          <v-data-table :headers="headersClientes" :items="clientes" :loading="cargandoClientes" items-per-page="5">
            <template v-slot:item.cliente_concat="{ item }">
              <span class="font-weight-medium">{{ item.CODCLIENTE }}</span>
              <span class="text-grey ml-1">— {{ item.NOMBRECOMERCIAL || item.NOMBRECLIENTE }}</span>
            </template>
            <template v-slot:item.acciones="{ item }">
              <v-btn color="success" size="small" @click="seleccionarCliente(item)">Seleccionar</v-btn>
            </template>
          </v-data-table>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="modalCantidad.mostrar" max-width="400">
      <v-card class="rounded-lg">
        <v-card-title class="bg-primary text-white font-weight-bold">Cantidad</v-card-title>
        <v-card-text class="pt-6">
          <p class="font-weight-bold mb-4">{{ modalCantidad.producto?.DESCRIPCION }}</p>
          <v-text-field v-model.number="modalCantidad.cantidad" type="number" label="Unidades" variant="outlined" min="1" :max="modalCantidad.stockMaximo" autofocus @keyup.enter="confirmarAgregar"></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="error" variant="text" @click="modalCantidad.mostrar = false">Cancelar</v-btn>
          <v-btn color="primary" variant="elevated" @click="confirmarAgregar">Aceptar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="modalExcel.mostrar" max-width="620">
      <v-card class="rounded-lg">
        <v-card-title class="bg-green-darken-2 text-white font-weight-bold d-flex align-center pa-4">
          <v-icon class="mr-2">mdi-file-excel</v-icon> Pedido Masivo desde Excel
        </v-card-title>
        <v-card-text class="pa-6">

          <!-- Cargar pedido -->
          <div class="mb-6">
            <h3 class="text-subtitle-1 font-weight-bold mb-2">Cargar Pedido</h3>
            <p class="text-body-2 text-grey-darken-1 mb-3">
              Sube un Excel con columnas <strong>REFERENCIA</strong> y <strong>CANTIDAD</strong>. El resto de las columnas son ignoradas.
            </p>
            <v-file-input v-model="modalExcel.archivo" label="Seleccionar archivo (.xlsx)" variant="outlined" density="comfortable" prepend-icon="mdi-upload" accept=".xlsx, .xls" hide-details @update:model-value="importarArticulosExcel"></v-file-input>
          </div>

          <v-divider class="mb-6"></v-divider>

          <!-- Descargar catálogo por segmento -->
          <div>
            <h3 class="text-subtitle-1 font-weight-bold mb-1">Descargar Catálogo por Segmento</h3>
            <p class="text-body-2 text-grey-darken-1 mb-3">
              Genera un Excel con una hoja por tarifa. Solo incluye productos con stock disponible.
            </p>
            <v-select
              v-model="modalExcel.segmentosSeleccionados"
              :items="segmentosDisponibles"
              item-title="nombre"
              item-value="id"
              label="Segmentos a incluir"
              variant="outlined"
              density="compact"
              multiple
              chips
              hide-details
              class="mb-3"
            ></v-select>
            <v-checkbox v-model="modalExcel.conProveedor" label="Incluir columna PROVEEDOR" density="compact" hide-details class="mb-2" />
            <v-btn block color="green-darken-1" variant="tonal" prepend-icon="mdi-download" :loading="modalExcel.descargando" @click="exportarCatalogoSegmentos">
              Descargar Catálogo por Segmento
            </v-btn>
          </div>

        </v-card-text>
        <v-card-actions class="pa-4 bg-grey-lighten-4">
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="modalExcel.mostrar = false">Cerrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="aviso.mostrar" :color="aviso.color" timeout="3000">
      {{ aviso.texto }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';
import { usePageSize } from '../utils/usePageSize';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { useBrandingStore } from '../stores/useBrandingStore';
import { useCarritoStore } from '../stores/useCarritoStore';
import MontoDisplay from '../components/MontoDisplay.vue';

const carritoStore = useCarritoStore();

const filtroStock = ref('todos');
const opcionesStock = [
  { texto: 'Todos', valor: 'todos' },
  { texto: 'Con Stock', valor: 'con_stock' },
  { texto: 'Sin Stock', valor: 'sin_stock' }
];

// CLIENTES (RESTAURADO)
const modalCliente = ref({ mostrar: false });
const clientes = ref<any[]>([]);
const cargandoClientes = ref(false);
const busquedaCliente = ref('');
const headersClientes = [
  { title: 'Cliente', key: 'cliente_concat', sortable: false },
  { title: 'CIF/ID', key: 'ID' },
  { title: 'Acción', key: 'acciones', align: 'end' as const },
];

// PRODUCTOS
const productos = ref<any[]>([]);
const cargandoProductos = ref(false);
const busquedaProducto = ref('');
const totalProductos = ref(0);
const catalogoPageSize = usePageSize('catalogo');
const opcionesTabla = ref({ page: 1, itemsPerPage: catalogoPageSize.value });
const headersProductos = [
  { title: 'Código', key: 'CODARTICULO' },
  { title: 'Referencia', key: 'REFPROVEEDOR' },
  { title: 'Descripción', key: 'DESCRIPCION' },
  { title: 'Precio (USD)', key: 'precio', align: 'end' as const },
  { title: 'Stock', key: 'stock', align: 'center' as const },
  { title: 'Acción', key: 'acciones', align: 'center' as const, sortable: false },
];

const modalCantidad = ref({ mostrar: false, producto: null as any, cantidad: 1, stockMaximo: 0 });
const aviso = ref({ mostrar: false, texto: '', color: 'success' });

// EXCEL — segmentos dinámicos desde D1 de clientes
const segmentosDisponibles = ref<{ id: number; nombre: string }[]>([]);
const modalExcel = ref({
  mostrar: false,
  descargando: false,
  archivo: null as any,
  segmentosSeleccionados: [] as number[],
  conProveedor: false,
});

const cargarSegmentos = async () => {
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/products/segmentos-descuento`);
    if (res.data.success) {
      segmentosDisponibles.value = res.data.descuentos.map((d: number) => ({ id: d, nombre: d === 0 ? 'Sin descuento' : `Descuento ${d}%` }));
      modalExcel.value.segmentosSeleccionados = res.data.descuentos;
    }
  } catch (e) { console.error('Error al cargar segmentos', e); }
};

onMounted(cargarSegmentos);

// --- MÉTODOS CLIENTES (RESTAURADOS) ---
const buscarClientesManualmente = async () => {
  if (!busquedaCliente.value) return;
  cargandoClientes.value = true;
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/clientes?cif=${busquedaCliente.value}`);
    if (res.data.success) clientes.value = res.data.clientes;
  } catch (e) { console.error(e); } finally { cargandoClientes.value = false; }
};

const seleccionarCliente = (cliente: any) => {
  carritoStore.clienteSeleccionado = cliente;
  carritoStore.actualizarDescuentosPorCliente();
  modalCliente.value.mostrar = false;
  lanzarAviso(`Cliente seleccionado: ${cliente.CODCLIENTE} - ${cliente.NOMBRECOMERCIAL || cliente.NOMBRECLIENTE}`, "success");
};

// Colores de leyenda (orden de prioridad: condicionado > nuevo > IVA > normal)
const COLOR_CONDICIONADO = 'FF81C784'; // verde
const COLOR_IVA          = 'FFFFD54F'; // amarillo
const COLOR_ZEBRA        = 'FFE3F2FD'; // azul muy claro (filas pares normales)

const getColorFila = (p: any): string | null => {
  if (p.NODTOAPLICABLE)     return COLOR_CONDICIONADO;
  if (p.PORCENTAJEIVA > 0)  return COLOR_IVA;
  return null;
};

// --- MÉTODOS EXCEL ---
const exportarCatalogoSegmentos = async () => {
  const descuentos = modalExcel.value.segmentosSeleccionados;
  if (!descuentos.length) { lanzarAviso('Selecciona al menos un segmento', 'warning'); return; }
  modalExcel.value.descargando = true;
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/products/catalogo-segmentos`);
    if (!res.data.success) throw new Error('Sin datos');

    const productos: any[] = res.data.data;
    if (!productos.length) { lanzarAviso('No hay artículos con precio en la tarifa base', 'warning'); return; }

    const bannerBuffer = await fetch('/banner_lista_precios.png').then(r => r.arrayBuffer());
    const FORMATO_DOLAR = '"$"#,##0.00';
    const FILA_HEADER = 6;
    const FILA_SUB    = 7;
    const FILA_INICIO = 8;
    const COLOR_HEADER = '1F4E79';
    const COLOR_SUB    = '2E75B6';
    const COLOR_TEXTO  = 'FFFFFF';
    const fecha = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: useBrandingStore().zonaHoraria });
    const conProveedor = modalExcel.value.conProveedor;
    const wb = new ExcelJS.Workbook();

    // Columnas: Codigo | Cod/Barras | Descripción | PORTALPRV | Oferta 1 | Oferta 2 | Precio F | Existen | Fecha/Lote | Unidades | Monto | [Proveedor] | Marca | Categoría | Oferta activa desde | P.Activo
    const COL_PORTALPRV = 4;  // D
    const COL_PRECIO    = 7;  // G
    const COL_FECHA     = 9;  // I
    const COL_UNIDADES  = 10; // J
    const COL_MONTO     = 11; // K
    const NCOLS = conProveedor ? 16 : 15;

    const colWidths = conProveedor
      ? [12, 14, 50, 13, 10, 10, 13, 9, 14, 10, 14, 22, 18, 22, 20, 30]
      : [12, 14, 50, 13, 10, 10, 13, 9, 14, 10, 14, 18, 22, 20, 30];

    const buildHeaders = () => {
      const h = ['Codigo', 'Cod/Barras', 'Descripción', 'PORTALPRV', 'Oferta 1', 'Oferta 2', 'Precio F',
        'Existen', 'Fecha/Lote', 'Unidades', 'Monto'];
      if (conProveedor) h.push('Proveedor');
      h.push('Marca', 'Categoría', 'Oferta activa desde', 'P.Activo');
      return h;
    };

    const buildRow = (p: any, dto: number) => {
      const d2  = p.D2_PORCENTAJE ?? 0;
      const base = Number(p.PRECIO_BASE);
      const precioFinal = base * (1 - dto / 100) * (1 - d2 / 100);
      const g = p.GARANTIACOMPRA;
      const garantia = g instanceof Date ? g : (g ? new Date(g) : '');
      const r: any[] = [
        p.CODARTICULO ?? '', p.REFPROVEEDOR ?? '', p.DESCRIPCION ?? '',
        base, dto, d2, precioFinal,
        p.STOCK_DISP ?? 0, garantia, 0, '',
      ];
      if (conProveedor) r.push(p.PROVEEDOR ?? '');
      r.push(p.MARCA ?? '', p.SECCION ?? '', '', p.PRINCIPIOACTIVO ?? '');
      return r;
    };

    const aplicarEstiloCelda = (cell: any, bg: string, bold = true, size = 9) => {
      cell.font = { bold, color: { argb: COLOR_TEXTO }, size };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FFFFFF' } },
        left:   { style: 'thin', color: { argb: 'FFFFFF' } },
        bottom: { style: 'thin', color: { argb: 'FFFFFF' } },
        right:  { style: 'thin', color: { argb: 'FFFFFF' } },
      };
    };

    const lastCol = String.fromCharCode(64 + NCOLS);
    const bannerId = wb.addImage({ buffer: bannerBuffer, extension: 'png' });

    descuentos.forEach(dto => {
      const ws = wb.addWorksheet(dto === 0 ? 'Precios' : `Dto ${dto}%`);
      ws.columns = colWidths.map(w => ({ width: w }));

      // Banner cabecera (filas 1-4, ancho completo) — 1600×201px → ~150pt alto total
      ws.addImage(bannerId, { tl: { col: 0, row: 0 }, br: { col: NCOLS, row: 4 } });
      for (let r = 1; r <= 4; r++) ws.getRow(r).height = 37.5;

      // Fila 5: fecha + segmento (texto pequeño bajo el banner)
      ws.mergeCells(5, 1, 5, NCOLS);
      const infoCell = ws.getCell(5, 1);
      infoCell.value = dto === 0 ? `Lista de precios — ${fecha}` : `Descuento ${dto}% — ${fecha}`;
      infoCell.font = { italic: true, size: 9, color: { argb: '555555' } };
      infoCell.alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getRow(5).height = 14;

      // Encabezados (fila 6)
      ws.getRow(FILA_HEADER).height = 30;
      buildHeaders().forEach((h, idx) => {
        const cell = ws.getCell(FILA_HEADER, idx + 1);
        cell.value = h;
        aplicarEstiloCelda(cell, COLOR_HEADER, true, 9);
      });

      // Sub-etiquetas (fila 7)
      ws.getRow(FILA_SUB).height = 16;
      for (let c = 1; c <= NCOLS; c++) {
        const cell = ws.getCell(FILA_SUB, c);
        cell.value = c === COL_UNIDADES ? 'Pedido' : c === COL_MONTO ? 'Total' : '';
        aplicarEstiloCelda(cell, COLOR_SUB, false, 8);
      }

      ws.autoFilter = `A${FILA_HEADER}:${lastCol}${FILA_HEADER}`;

      // Datos con colores por tipo
      productos.forEach((p, i) => {
        const rowNum = FILA_INICIO + i;
        const row = ws.getRow(rowNum);

        row.values = buildRow(p, dto);
        row.getCell(COL_PORTALPRV).numFmt = FORMATO_DOLAR;
        row.getCell(COL_PRECIO).numFmt    = FORMATO_DOLAR;
        if (p.GARANTIACOMPRA) row.getCell(COL_FECHA).numFmt = 'dd/mm/yyyy';
        row.getCell(COL_UNIDADES).numFmt  = '#,##0';
        row.getCell(COL_MONTO).value      = { formula: `G${rowNum}*J${rowNum}` };
        row.getCell(COL_MONTO).numFmt     = FORMATO_DOLAR;

        const colorFila = getColorFila(p);
        const fillColor = colorFila ?? (i % 2 === 1 ? COLOR_ZEBRA : null);
        if (fillColor) {
          for (let c = 1; c <= NCOLS; c++)
            row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
        }
      });

      ws.views = [{ state: 'frozen', xSplit: 0, ySplit: FILA_INICIO - 1, topLeftCell: `A${FILA_INICIO}` }];
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Drogueria_Intercontinental_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    lanzarAviso(`Catálogo generado con ${descuentos.length} segmento(s)`, 'success');
  } catch (e) {
    console.error(e);
    lanzarAviso('Error al generar catálogo', 'error');
  } finally {
    modalExcel.value.descargando = false;
  }
};

const importarArticulosExcel = async (fileOrFiles: File | File[] | null) => {
  const file = Array.isArray(fileOrFiles) ? fileOrFiles[0] : fileOrFiles;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e: any) => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const jsonData: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { range: 5 });
    const getCantidad = (row: any) => Number(row['Unidades'] ?? row['CANTIDAD'] ?? row['Cantidad'] ?? 0);
    const getRef     = (row: any) => row['Cod/Barras'] || row['Codigo'] || row['REFERENCIA'] || row['Referencia'] || row['referencia'];
    const itemsParaCargar = jsonData.filter(row => getCantidad(row) > 0);

    if (itemsParaCargar.length === 0) { lanzarAviso("No hay cantidades en el archivo", "warning"); return; }
    lanzarAviso(`Cargando ${itemsParaCargar.length} productos...`, "info");

    let agregados = 0;
    for (const item of itemsParaCargar) {
      try {
        const ref = getRef(item);
        const res = await axios.get(`${import.meta.env.VITE_API_URL}/products/get-products?articulo=${encodeURIComponent(ref)}`);
        if (res.data.success && res.data.data.length > 0) {
          const pBD = res.data.data[0];
          const stock = getStockTotal(pBD);
          if (stock > 0) {
            carritoStore.agregarArticulo(pBD, Math.min(getCantidad(item), stock));
            agregados++;
          }
        }
      } catch (err) { console.error(err); }
    }
    lanzarAviso(`¡Éxito! ${agregados} artículos añadidos.`, "success");
    modalExcel.value.mostrar = false;
  };
  reader.readAsArrayBuffer(file);
};

// --- RESTO DE FUNCIONES ---
const obtenerPrecioDolar = (item: any): number => (item.prices && item.prices.length > 0) ? parseFloat(item.prices[0].PNETO) : 0;
const tieneDescuentos = (_item: any): boolean => (Number(carritoStore.clienteSeleccionado?.DESCUENTO) || 0) > 0;
const calcularPrecioFinalDolar = (item: any): number => {
  let p = obtenerPrecioDolar(item);
  const dc  = Number(carritoStore.clienteSeleccionado?.DESCUENTO) || 0;
  if (dc > 0) p -= (p * (dc / 100));
  return p;
};
const getStockTotal = (p: any) => p.stocks?.reduce((t: number, s: any) => t + s.STOCK, 0) || 0;
const lanzarAviso = (texto: string, color: string) => aviso.value = { mostrar: true, texto, color };
const buscarDesdeBoton = () => { opcionesTabla.value.page = 1; ejecutarBusquedaProductos(); };
const cargarProductosDesdeTabla = (opt: any) => { opcionesTabla.value = opt; catalogoPageSize.value = opt.itemsPerPage; ejecutarBusquedaProductos(); };
const ejecutarBusquedaProductos = async () => {
  cargandoProductos.value = true;
  try {
    const p = new URLSearchParams({ page: opcionesTabla.value.page.toString(), limit: opcionesTabla.value.itemsPerPage.toString(), stock_status: filtroStock.value });
    if (busquedaProducto.value) p.append('articulo', busquedaProducto.value);
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/products/get-products?${p.toString()}`);
    if (res.data.success) { productos.value = res.data.data; totalProductos.value = res.data.total || 0; }
  } catch (e) { console.error(e); } finally { cargandoProductos.value = false; }
};
const prepararAgregar = (p: any) => { modalCantidad.value = { mostrar: true, producto: p, cantidad: 1, stockMaximo: getStockTotal(p) }; };
const confirmarAgregar = () => {
  const { producto, cantidad, stockMaximo } = modalCantidad.value;
  if (cantidad < 1) return;
  if (stockMaximo > 0 && cantidad > stockMaximo) {
    lanzarAviso(`Stock insuficiente. Solo hay ${stockMaximo} unidades disponibles.`, 'error');
    return;
  }
  carritoStore.agregarArticulo(producto, cantidad);
  modalCantidad.value.mostrar = false;
  lanzarAviso('Agregado al carrito', 'success');
};
</script>

<style scoped>
.gap-4 { gap: 16px; }
</style>