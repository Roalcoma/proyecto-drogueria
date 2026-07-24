<template>
  <v-container fluid class="pa-6 bg-background h-100">
    <div class="d-flex align-center mb-6">
      <v-icon color="primary" size="32" class="mr-3">mdi-comment-alert</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black" style="color: #164E63;">Reclamos</h1>
        <span class="text-caption text-medium-emphasis">Registro de reclamos de clientes</span>
      </div>
    </div>

    <v-row>
      <!-- ── Formulario ── -->
      <v-col cols="12" md="5">
        <v-card rounded="xl" elevation="2" class="pa-4">
          <div class="text-subtitle-1 font-weight-bold mb-4">Nuevo Reclamo</div>

          <!-- Cliente -->
          <v-text-field
            :model-value="clienteSeleccionado ? `${clienteSeleccionado.CODCLIENTE} - ${clienteSeleccionado.NOMBRECLIENTE}` : ''"
            label="Cliente" placeholder="Click para buscar..." variant="outlined" density="comfortable"
            readonly prepend-inner-icon="mdi-account-box" class="mb-3" @click="modalCliente = true">
            <template v-slot:append-inner>
              <v-btn color="primary" variant="elevated" size="small" @click.stop="modalCliente = true">
                <v-icon size="18">mdi-magnify</v-icon>
              </v-btn>
            </template>
          </v-text-field>

          <!-- Observaciones -->
          <v-textarea v-model="observaciones" label="Observaciones" variant="outlined"
            density="comfortable" rows="2" class="mb-3"
            placeholder="Cliente indica que..." />

          <!-- Argumentos -->
          <v-textarea v-model="argumentos" label="Argumentos / Resolución solicitada" variant="outlined"
            density="comfortable" rows="2" class="mb-3"
            placeholder="Quiere reposición del producto..." />

          <!-- Líneas de artículos -->
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-body-2 font-weight-bold">Artículos reclamados</span>
            <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-plus" @click="agregarLinea">
              Agregar línea
            </v-btn>
          </div>

          <div v-if="lineas.length === 0" class="text-caption text-grey text-center py-2 mb-3">
            Sin líneas. Agrega al menos un artículo.
          </div>

          <div v-for="(linea, idx) in lineas" :key="idx"
            class="mb-3 pa-3 rounded-lg" style="border: 1px solid rgba(0,0,0,.12)">
            <div class="d-flex justify-space-between align-center mb-2">
              <span class="text-caption font-weight-bold text-medium-emphasis">Línea {{ idx + 1 }}</span>
              <v-btn icon="mdi-close" size="x-small" variant="text" color="error" @click="quitarLinea(idx)" />
            </div>

            <!-- Factura de la línea -->
            <v-select
              v-model="linea.facturaObj"
              :items="opcionesFactura"
              item-title="texto"
              item-value="valor"
              label="Factura relacionada"
              variant="outlined" density="compact"
              :disabled="!clienteSeleccionado"
              return-object
              class="mb-2"
              @update:model-value="(v: any) => aplicarFactura(linea, v)"
            />

            <!-- Búsqueda de artículo -->
            <v-autocomplete
              v-model="linea._artSel"
              :items="linea._arts"
              :item-title="(a: any) => `${a.CODARTICULO} — ${a.DESCRIPCION}`"
              item-value="CODARTICULO"
              label="Artículo"
              variant="outlined" density="compact"
              :no-filter="!linea._fromFactura"
              return-object clearable
              :placeholder="linea._fromFactura ? 'Filtra por código o nombre...' : 'Escribe código o nombre...'"
              class="mb-2"
              @update:search="(q: string) => buscarArticulo(linea, q, idx)"
              @update:model-value="(v: any) => aplicarArticulo(linea, v)"
            />

            <v-row dense>
              <v-col cols="5">
                <v-text-field v-model.number="linea.cantidad" label="Cant." variant="outlined"
                  density="compact" type="number" min="1" />
              </v-col>
              <v-col cols="7">
                <v-text-field v-model="linea.motivo" label="Motivo" variant="outlined"
                  density="compact" placeholder="FALTANTE" />
              </v-col>
            </v-row>
          </div>

          <v-btn
            block color="primary" size="large" variant="elevated"
            :loading="guardando"
            :disabled="!clienteSeleccionado || (!observaciones.trim() && lineas.length === 0)"
            @click="guardarReclamo">
            Guardar Reclamo
          </v-btn>
        </v-card>
      </v-col>

      <!-- ── Listado ── -->
      <v-col cols="12" md="7">
        <v-card rounded="xl" elevation="2">
          <v-card-title class="pa-4">
            <v-text-field v-model="busqueda" label="Buscar por cliente o texto"
              prepend-inner-icon="mdi-magnify" variant="outlined" density="compact"
              hide-details clearable @keyup.enter="cargarReclamos" />
          </v-card-title>
          <v-divider />
          <v-data-table-server
            :headers="headers" :items="reclamos" :items-length="totalReclamos"
            :loading="cargando" v-model:items-per-page="itemsPerPage"
            @update:options="cargarPagina"
            :items-per-page-options="[10, 25, 50, 100]">

            <template v-slot:item.FECHACREACION="{ item }">
              {{ new Date(item.FECHACREACION).toLocaleDateString('es-VE') }}
            </template>
            <template v-slot:item.cliente_concat="{ item }">
              <span class="font-weight-medium">{{ item.CODCLIENTE }}</span>
              <span class="text-grey ml-1">— {{ item.NOMBRECLIENTE }}</span>
            </template>
            <template v-slot:item.RECLAMO="{ item }">
              <div style="max-width: 240px; white-space: normal;">{{ item.RECLAMO }}</div>
            </template>
            <template v-slot:item.NUM_LINEAS="{ item }">
              <v-chip size="x-small" :color="item.NUM_LINEAS > 0 ? 'primary' : 'grey'">
                {{ item.NUM_LINEAS }}
              </v-chip>
            </template>
            <template v-slot:item.acciones="{ item }">
              <v-btn icon size="small" variant="text" color="primary"
                :loading="pdfCargando === item.ID"
                @click="descargarPdf(item.ID)">
                <v-icon>mdi-file-pdf-box</v-icon>
                <v-tooltip activator="parent">Descargar PDF</v-tooltip>
              </v-btn>
            </template>
          </v-data-table-server>
        </v-card>
      </v-col>
    </v-row>

    <!-- Modal búsqueda cliente -->
    <v-dialog v-model="modalCliente" max-width="700">
      <v-card class="rounded-lg">
        <v-card-title class="bg-primary text-on-primary font-weight-bold d-flex justify-space-between align-center">
          <span><v-icon start>mdi-account-search</v-icon> Seleccionar Cliente</span>
          <v-btn icon="mdi-close" variant="text" color="white" @click="modalCliente = false" />
        </v-card-title>
        <v-card-text class="pt-6">
          <v-text-field v-model="busquedaCliente" label="Escribe CIF o Nombre..." variant="outlined"
            append-inner-icon="mdi-magnify" @keyup.enter="buscarClientes" class="mb-4" autofocus />
          <v-data-table :headers="headersClientes" :items="clientesEncontrados"
            :loading="cargandoClientes" items-per-page="5">
            <template v-slot:item.cliente_concat="{ item }">
              <span class="font-weight-medium">{{ item.CODCLIENTE }}</span>
              <span class="text-grey ml-1">— {{ item.NOMBRECLIENTE }}</span>
            </template>
            <template v-slot:item.acciones="{ item }">
              <v-btn color="success" size="small" @click="seleccionarCliente(item)">Seleccionar</v-btn>
            </template>
          </v-data-table>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="aviso.mostrar" :color="aviso.color" timeout="3000">{{ aviso.texto }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { usePageSize } from '../utils/usePageSize';
import { useAuthStore } from '../stores/useAuthStore';

const API       = import.meta.env.VITE_API_URL;
const authStore = useAuthStore();
const aviso = ref({ mostrar: false, texto: '', color: 'success' });
const lanzarAviso = (texto: string, color = 'success') => aviso.value = { mostrar: true, texto, color };

// ── Tipos ──────────────────────────────────────────────────────────────────
interface LineaForm {
  facturaObj:   any;
  numSerie:     string | null;
  numFactura:   number | null;
  numPedido:    number | null;
  fechaFac:     string | null;
  codarticulo:  string;
  descripcion:  string;
  cantidad:     number;
  motivo:       string;
  _artSel:      any;
  _arts:        any[];
  _fromFactura: boolean;
}

const nuevaLinea = (): LineaForm => ({
  facturaObj: null, numSerie: null, numFactura: null, numPedido: null,
  fechaFac: null, codarticulo: '', descripcion: '', cantidad: 1, motivo: '',
  _artSel: null, _arts: [], _fromFactura: false,
});

// ── Formulario ──────────────────────────────────────────────────────────────
const clienteSeleccionado = ref<any>(null);
const observaciones = ref('');
const argumentos    = ref('');
const lineas        = ref<LineaForm[]>([]);
const guardando     = ref(false);

const agregarLinea = () => lineas.value.push(nuevaLinea());
const quitarLinea  = (idx: number) => lineas.value.splice(idx, 1);

// ── Búsqueda de artículo ────────────────────────────────────────────────────
const _artTimers: Record<number, ReturnType<typeof setTimeout>> = {};
const buscarArticulo = (linea: LineaForm, q: string, idx: number) => {
  if (linea._fromFactura) return; // articles already loaded from invoice
  clearTimeout(_artTimers[idx]);
  if (!q || q.length < 2) { linea._arts = []; return; }
  _artTimers[idx] = setTimeout(async () => {
    try {
      const res = await axios.get(`${API}/products/get-products`, {
        params: { articulo: q, page: 1, limit: 15 },
      });
      linea._arts = res.data.data ?? res.data.products ?? [];
    } catch {}
  }, 350);
};

const aplicarArticulo = (linea: LineaForm, art: any) => {
  if (!art) { linea.codarticulo = ''; linea.descripcion = ''; return; }
  linea.codarticulo = String(art.CODARTICULO ?? '');
  linea.descripcion = art.DESCRIPCION ?? '';
  if (art.NUMPEDIDO) linea.numPedido = parseInt(art.NUMPEDIDO) || null;
  if (art.CANTIDAD)  linea.cantidad  = Number(art.CANTIDAD) || 1;
};

const aplicarFactura = async (linea: LineaForm, fObj: any) => {
  // reset article state whenever factura changes
  linea._artSel     = null;
  linea._arts       = [];
  linea._fromFactura = false;
  linea.codarticulo = '';
  linea.descripcion = '';

  if (!fObj?.valor?.numSerie) {
    linea.numSerie = null; linea.numFactura = null;
    linea.numPedido = null; linea.fechaFac = null;
    return;
  }
  const v = fObj.valor;
  linea.numSerie   = v.numSerie   ?? null;
  linea.numFactura = v.numFactura ?? null;
  linea.numPedido  = v.numPedido  ?? null;
  linea.fechaFac   = v.fecha      ?? null;

  // Load the invoice's articles from the backend
  try {
    const res = await axios.get(`${API}/reclamos/facturas/${v.numSerie}/${v.numFactura}/articulos`);
    linea._arts = res.data.success ? res.data.data : [];
    linea._fromFactura = linea._arts.length > 0;
    if (linea._arts.length === 0) lanzarAviso('La factura no tiene artículos registrados', 'warning');
  } catch { lanzarAviso('Error al cargar artículos de la factura', 'error'); }
};

// ── Facturas del cliente ────────────────────────────────────────────────────
interface FacturaOpcion { texto: string; valor: any; }
const opcionesFactura   = ref<FacturaOpcion[]>([{ texto: 'Sin factura', valor: {} }]);
const cargandoFacturas  = ref(false);

const cargarFacturasCliente = async (codCliente: number) => {
  cargandoFacturas.value = true;
  try {
    const res = await axios.get(`${API}/reclamos/facturas/${codCliente}`);
    const facturas = res.data.success ? res.data.data : [];
    opcionesFactura.value = [
      { texto: 'Sin factura', valor: {} },
      ...facturas.map((f: any) => ({
        texto: `${f.NUMSERIE}-${String(f.NUMFACTURA).padStart(8,'0')} — ${new Date(f.FECHA).toLocaleDateString('es-VE')}`,
        valor: {
          numSerie:   f.NUMSERIE,
          numFactura: f.NUMFACTURA,
          numPedido:  f.NUMPEDIDO ?? null,
          fecha:      f.FECHA ? new Date(f.FECHA).toISOString().split('T')[0] : null,
        },
      })),
    ];
  } finally { cargandoFacturas.value = false; }
};

const guardarReclamo = async () => {
  if (!clienteSeleccionado.value) return;
  guardando.value = true;
  try {
    await axios.post(`${API}/reclamos`, {
      codCliente:    clienteSeleccionado.value.CODCLIENTE,
      observaciones: observaciones.value.trim() || null,
      argumentos:    argumentos.value.trim() || null,
      usuario:       authStore.usuario?.usuario ?? null,
      lineas:       lineas.value.map(l => ({
        numSerie:    l.numSerie,
        numFactura:  l.numFactura,
        numPedido:   l.numPedido,
        fechaFac:    l.fechaFac,
        codarticulo: l.codarticulo.trim(),
        descripcion: l.descripcion.trim(),
        cantidad:    l.cantidad,
        motivo:      l.motivo.trim() || null,
      })),
    });
    lanzarAviso('Reclamo guardado correctamente');
    resetForm();
    cargarReclamos();
  } catch {
    lanzarAviso('Error al guardar el reclamo', 'error');
  } finally { guardando.value = false; }
};

const resetForm = () => {
  clienteSeleccionado.value = null;
  observaciones.value = '';
  argumentos.value    = '';
  lineas.value        = [];
  opcionesFactura.value = [{ texto: 'Sin factura', valor: {} }];
};

// ── Búsqueda de cliente ─────────────────────────────────────────────────────
const modalCliente       = ref(false);
const busquedaCliente    = ref('');
const clientesEncontrados = ref<any[]>([]);
const cargandoClientes   = ref(false);
const headersClientes = [
  { title: 'Cliente',  key: 'cliente_concat', sortable: false },
  { title: 'CIF/ID',   key: 'ID' },
  { title: 'Acción',   key: 'acciones', align: 'end' as const },
];

const buscarClientes = async () => {
  if (!busquedaCliente.value) return;
  cargandoClientes.value = true;
  try {
    const res = await axios.get(`${API}/clientes`, { params: { cif: busquedaCliente.value } });
    if (res.data.success) clientesEncontrados.value = res.data.clientes;
  } finally { cargandoClientes.value = false; }
};

const seleccionarCliente = (cliente: any) => {
  clienteSeleccionado.value = cliente;
  modalCliente.value = false;
  lineas.value = [];
  cargarFacturasCliente(cliente.CODCLIENTE);
};

// ── Listado ─────────────────────────────────────────────────────────────────
const busqueda      = ref('');
const reclamos      = ref<any[]>([]);
const totalReclamos = ref(0);
const cargando      = ref(false);
const itemsPerPage  = usePageSize('reclamos');
const pagina        = ref(1);
const pdfCargando   = ref<number | null>(null);

const headers = [
  { title: 'ID',       key: 'ID',             width: '60px' },
  { title: 'Fecha',    key: 'FECHACREACION',   width: '90px' },
  { title: 'Cliente',  key: 'cliente_concat',  sortable: false },
  { title: 'Líneas',   key: 'NUM_LINEAS',      width: '70px', sortable: false },
  { title: 'Observaciones', key: 'RECLAMO',   sortable: false },
  { title: 'PDF',      key: 'acciones',        sortable: false, width: '60px' },
];

const cargarReclamos = async () => {
  cargando.value = true;
  try {
    const res = await axios.get(`${API}/reclamos`, {
      params: { search: busqueda.value, page: pagina.value, limit: itemsPerPage.value },
    });
    if (res.data.success) { reclamos.value = res.data.data; totalReclamos.value = res.data.total; }
  } finally { cargando.value = false; }
};

const cargarPagina = (opt: any) => {
  pagina.value = opt.page;
  itemsPerPage.value = opt.itemsPerPage;
  cargarReclamos();
};

// ── PDF ──────────────────────────────────────────────────────────────────────
const descargarPdf = async (id: number) => {
  pdfCargando.value = id;
  try {
    const res = await axios.get(`${API}/reclamos/${id}`);
    if (!res.data.success) { lanzarAviso('No se pudo obtener el reclamo', 'error'); return; }
    generarPdf(res.data.reclamo, res.data.lineas);
  } catch {
    lanzarAviso('Error al generar el PDF', 'error');
  } finally { pdfCargando.value = null; }
};

const pad = (n: number | string, len = 8) => String(n ?? '').padStart(len, '0');
const fmtFecha = (d: string | Date | null) => {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('es-VE', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const generarPdf = (rec: any, lineas: any[]) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W   = doc.internal.pageSize.getWidth();   // 210
  const lm  = 12;  // left margin
  const rm  = 12;  // right margin
  const cw  = W - lm - rm;                        // content width = 186

  // ── EMPRESA (header) ──────────────────────────────────────────────────────
  const empresa = {
    nombre:    'DROGUERIA INTERCONTINENTAL, C.A.',
    rif:       'J501590192',
    direccion: 'AV CRUZ PERAZA LOCAL GALPON NRO 02 SECTOR LA CARBONERA MATURIN MONAGAS ZONA POSTAL 6201',
  };

  // Caja izquierda del logo (placeholder azul)
  doc.setFillColor(0, 102, 153);
  doc.rect(lm, 8, 28, 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('DROGUERIA', lm + 14, 14, { align: 'center' });
  doc.text('INTERCONTINENTAL', lm + 14, 18, { align: 'center' });

  // Nombre empresa (centro)
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(empresa.nombre, lm + 32, 14, { maxWidth: 105 });

  // RIF (derecha)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`RIF: ${empresa.rif}`, W - rm, 14, { align: 'right' });

  // Dirección bajo el nombre empresa
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(empresa.direccion, lm + 32, 20, { maxWidth: 105 });

  // Línea separadora
  doc.setDrawColor(0, 102, 153);
  doc.setLineWidth(0.8);
  doc.line(lm, 27, W - rm, 27);

  // ── TÍTULO: Reclamo Nro / Fecha ──────────────────────────────────────────
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bolditalic');
  doc.setTextColor(0, 0, 0);
  doc.text(`Reclamo Nro. ${pad(rec.ID)}`, lm, 35);
  const fechaStr = fmtFecha(rec.FECHACREACION);
  doc.text(`Fecha: ${fechaStr}`, W - rm, 35, { align: 'right' });

  // ── INFO CLIENTE ─────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  let y = 43;
  const lb = (label: string, value: string, x2?: number) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, lm, y);
    doc.setFont('helvetica', 'normal');
    const lw = doc.getTextWidth(label) + 2;
    doc.text(value, lm + lw, y, { maxWidth: (x2 ?? cw) - lw });
  };

  lb('Cliente:', `(${rec.CODCLIENTE}) ${rec.NOMBRECLIENTE}`);
  // Teléfono en la misma línea (derecha)
  if (rec.TELEFONO) {
    doc.setFont('helvetica', 'bold');
    doc.text('Telefono:', W - rm - 55, y);
    doc.setFont('helvetica', 'normal');
    doc.text(rec.TELEFONO, W - rm - 55 + doc.getTextWidth('Telefono:') + 2, y);
  }
  y += 5;

  lb('Direccion:', rec.DIRECCION || '', cw - 30);
  y += 5;

  const zona = rec.NOMBRERUTA
    ? `${rec.CODZONA} (${rec.NOMBRERUTA})`
    : rec.CODZONA || '';
  lb('Zona:', zona);
  y += 5;

  lb('Estatus FC:', rec.ESTATUS === 'PENDIENTE' ? 'Factura Activa' : rec.ESTATUS);
  y += 5;

  lb('Reparto:', '');
  y += 4;

  // ── TABLA DE ARTÍCULOS ───────────────────────────────────────────────────
  const body: any[] = [];

  for (const l of lineas) {
    const facCell = [
      l.NUMFACTURA ? `Fac:${pad(l.NUMFACTURA)}` : '',
      l.NUMPEDIDO  ? `Ped:${pad(l.NUMPEDIDO)}`  : '',
    ].filter(Boolean).join('\n');

    const desc = [l.DESCRIPCION, l.MOTIVO ? `(${l.MOTIVO})` : ''].filter(Boolean).join(' ');
    body.push([
      fmtFecha(l.FECHA_FAC),
      facCell,
      l.CODARTICULO || '',
      l.CANTIDAD,
      desc,
    ]);
  }

  // Filas especiales (colspan manual con cells)
  const celda = (content: string, opts: any = {}) => ({ content, ...opts });
  const labelStyle = { fontStyle: 'bold', fillColor: [240, 240, 240] as [number, number, number] };

  body.push([
    celda('Observaciones', labelStyle),
    celda(rec.OBSERVACIONES || '', { colSpan: 4 }),
  ]);
  body.push([
    celda('Argumentos', labelStyle),
    celda(rec.ARGUMENTOS || '', { colSpan: 4 }),
  ]);
  body.push([
    celda('Usuario:', labelStyle),
    celda(rec.USUARIO || '', { colSpan: 4 }),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Factura', 'Código', 'Cant.', 'Descripción']],
    body,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 102, 153],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 28 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: cw - 22 - 28 - 18 - 14 },
    },
    margin: { left: lm, right: rm },
  });

  let finalY: number = (doc as any).lastAutoTable.finalY + 8;

  // ── NOTA ─────────────────────────────────────────────────────────────────
  if (finalY > 240) { doc.addPage(); finalY = 15; }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const nota = 'Nota: Toda devolución debe venir bien embalada. La empresa no se hace responsable por productos que lleguen en mal estado.';
  const notaLines = doc.splitTextToSize(nota, cw);
  doc.text(notaLines, lm, finalY);
  finalY += notaLines.length * 5 + 4;

  // ── INDICACIONES ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('INDICACIONES:', lm, finalY); finalY += 5;
  doc.text('a. Notificar mediante vía telefónica al asesor de venta.', lm + 3, finalY); finalY += 4;
  doc.text('b. Realizar llenado de formato de reclamos y devoluciones:', lm + 3, finalY); finalY += 5;

  const items = [
    'Nombre del Cliente',
    'Código otorgado por la droguería.',
    'Número de factura asociada a la mercancía recibida.',
    'Nombre de producto y descripción.',
    'Número de lote.',
    'Fecha de vencimiento.',
    'Fecha de recepción del pedido.',
    'Cantidad enviada.',
    'Motivo de devolución.',
    'Número de bultos.',
  ];
  for (const item of items) {
    // checkbox ☑
    doc.setFillColor(0, 102, 153);
    doc.rect(lm + 6, finalY - 3, 3.5, 3.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6);
    doc.text('✓', lm + 6.5, finalY - 0.2);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.text(item, lm + 12, finalY);
    finalY += 4.5;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('c. Enviar formato PDF al asesor de venta', lm + 3, finalY); finalY += 10;

  // ── FIRMAS ────────────────────────────────────────────────────────────────
  const firmaY = Math.min(finalY + 5, 270);
  doc.setLineWidth(0.3);
  doc.setDrawColor(0);

  // Firma 1
  doc.line(lm, firmaY, lm + 65, firmaY);
  doc.setFontSize(8);
  doc.text('ENTREGADO POR (CLIENTE):', lm, firmaY + 4);

  // Firma 2
  doc.line(W - rm - 65, firmaY, W - rm, firmaY);
  doc.text('ENTREGADO POR (CHOFER):', W - rm - 65, firmaY + 4);

  // Firma 3 (centrada)
  const f3x = (W - 65) / 2;
  doc.line(f3x, firmaY + 16, f3x + 65, firmaY + 16);
  doc.text('ANALISTA DE RECLAMOS:', f3x, firmaY + 20);

  doc.save(`Reclamo-${pad(rec.ID)}.pdf`);
};
</script>
