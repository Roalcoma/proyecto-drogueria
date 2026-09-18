<template>
  <v-container fluid class="pa-6 bg-background h-100">

    <!-- ===================================================
         VISTA: LISTADO DE REPORTES
    ==================================================== -->
    <template v-if="vista === 'lista'">
      <div class="d-flex align-center mb-6">
        <v-icon color="primary" size="32" class="mr-3">mdi-chart-bar</v-icon>
        <div>
          <h1 class="text-h5 font-weight-black" style="color: #164E63;">Reportería</h1>
          <span class="text-caption text-medium-emphasis">Informes y estadísticas</span>
        </div>
      </div>

      <v-text-field v-model="busqueda" placeholder="Buscar reporte..." prepend-inner-icon="mdi-magnify"
        variant="outlined" density="compact" clearable hide-details class="mb-6" style="max-width:400px" />

      <v-row>
        <v-col v-for="r in reportesFiltrados" :key="r.id" cols="12" sm="6" md="4" lg="3">
          <v-card rounded="xl" elevation="2" class="reporte-card h-100" @click="abrirFiltros(r)">
            <v-card-text class="d-flex flex-column align-center pa-6 text-center">
              <v-avatar size="64" :color="r.color + '-lighten-4'" class="mb-4">
                <v-icon :color="r.color" size="32">{{ r.icono }}</v-icon>
              </v-avatar>
              <div class="text-subtitle-1 font-weight-bold mb-1">{{ r.nombre }}</div>
              <div class="text-caption text-medium-emphasis">{{ r.desc }}</div>
            </v-card-text>
            <v-card-actions class="pa-4 pt-0 justify-center">
              <v-btn :color="r.color" variant="tonal" size="small" prepend-icon="mdi-play">Generar</v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
        <v-col v-if="!reportesFiltrados.length" cols="12">
          <div class="text-center text-medium-emphasis pa-10">
            <v-icon size="48" class="mb-3">mdi-magnify-close</v-icon>
            <p>No se encontraron reportes para "{{ busqueda }}".</p>
          </div>
        </v-col>
      </v-row>
    </template>

    <!-- ===================================================
         VISTA: RESULTADO DEL REPORTE
    ==================================================== -->
    <template v-else-if="vista === 'reporte' && reporteActivo">
      <div class="d-flex align-center mb-5 gap-3 flex-wrap">
        <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="volverLista">Reportes</v-btn>
        <v-divider vertical class="mx-1" style="height:24px" />
        <v-icon :color="reporteActivo.color" class="mr-1">{{ reporteActivo.icono }}</v-icon>
        <span class="text-h6 font-weight-bold">{{ reporteActivo.nombre }}</span>
        <v-chip v-if="resumenFiltros" size="small" color="primary" variant="tonal" class="ml-2">
          {{ resumenFiltros }}
        </v-chip>
        <v-spacer />
        <v-btn variant="outlined" prepend-icon="mdi-filter-variant" size="small" @click="abrirFiltros(reporteActivo)">
          Cambiar filtros
        </v-btn>
      </div>

      <v-card rounded="xl" elevation="2">
        <div v-if="cargando" class="pa-10 text-center">
          <v-progress-circular indeterminate color="primary" size="48" />
          <p class="mt-4 text-medium-emphasis">Generando reporte...</p>
        </div>

        <div v-else-if="!filas.length" class="pa-10 text-center text-medium-emphasis">
          <v-icon size="52" class="mb-3">mdi-table-off</v-icon>
          <p>Sin resultados para el período seleccionado.</p>
        </div>

        <template v-else>
          <div class="px-4 py-2 d-flex align-center gap-4 bg-grey-lighten-5">
            <v-switch v-model="mostrarUnidades" label="Mostrar unidades" density="compact"
              hide-details color="primary" class="flex-grow-0" />
            <v-chip size="x-small" color="blue-grey" variant="tonal" prepend-icon="mdi-drag">
              Arrastra encabezados para reordenar
            </v-chip>
            <span class="text-caption text-medium-emphasis ml-auto">
              {{ filas.length }} registros
              <template v-if="totalPaginas > 1"> · página {{ pagina }}/{{ totalPaginas }}</template>
            </span>
          </div>

          <div style="overflow-x:auto; overflow-y:auto; max-height:calc(100vh - 280px)">
            <table class="reporte-tabla">
              <thead>
                <tr>
                  <th
                    v-for="(col, idx) in columnasMostradas" :key="col.key"
                    :class="['th-drag', col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '']"
                    :style="dragOverIdx === idx ? 'background:#dbeafe;outline:2px dashed #3b82f6;' : ''"
                    draggable="true"
                    @dragstart="dragIdx = idx"
                    @dragover.prevent="dragOverIdx = idx"
                    @dragleave="dragOverIdx = -1"
                    @drop.prevent="moverColumna(idx)"
                    @dragend="dragIdx = -1; dragOverIdx = -1"
                    @click="toggleSort(col.key)"
                  >
                    <span>{{ col.title }}</span>
                    <v-icon v-if="sortKey === col.key" size="12" class="ml-1">
                      {{ sortDir === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down' }}
                    </v-icon>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in filasPaginadas" :key="i">
                  <td
                    v-for="col in columnasMostradas" :key="col.key"
                    :class="col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''"
                  >
                    <template v-if="col.type === 'vendedor'">
                      <span class="text-caption text-grey-darken-1 mr-1">{{ row.CODVENDEDOR }}</span>{{ row.VENDEDOR || '—' }}
                    </template>
                    <template v-else-if="col.type === 'fecha'">
                      {{ row[col.key] ? fmtFecha(row[col.key]) : '—' }}
                    </template>
                    <template v-else-if="col.type === 'mes' || col.type === 'total'">
                      <span :class="!row[col.key] ? 'text-grey-lighten-1' : ''">{{ row[col.key] ? fmtUSD(row[col.key]) : '—' }}</span>
                    </template>
                    <template v-else-if="col.type === 'und'">
                      <span :class="!row[col.key] ? 'text-grey-lighten-1' : ''">{{ row[col.key] ? fmtInt(row[col.key]) : '—' }}</span>
                    </template>
                    <template v-else>{{ row[col.key] ?? '—' }}</template>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="fila-total">
                  <td v-for="(col, idx) in columnasMostradas" :key="'t_'+col.key"
                    :class="col.align === 'right' ? 'text-right font-weight-bold' : ''">
                    <template v-if="idx === 0">TOTAL</template>
                    <template v-else-if="col.type === 'mes' || col.type === 'total'">{{ fmtUSD(totales[col.key]) }}</template>
                    <template v-else-if="col.type === 'und'">{{ fmtInt(totales[col.key]) }}</template>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div v-if="totalPaginas > 1" class="d-flex align-center justify-center gap-2 pa-3 bg-grey-lighten-5 border-t">
            <v-btn icon="mdi-chevron-double-left"  size="small" variant="text" :disabled="pagina === 1"           @click="pagina = 1" />
            <v-btn icon="mdi-chevron-left"          size="small" variant="text" :disabled="pagina === 1"           @click="pagina--" />
            <span class="text-caption px-2">
              {{ (pagina - 1) * porPagina + 1 }}–{{ Math.min(pagina * porPagina, filasOrdenadas.length) }}
              de {{ filasOrdenadas.length }}
            </span>
            <v-btn icon="mdi-chevron-right"         size="small" variant="text" :disabled="pagina === totalPaginas" @click="pagina++" />
            <v-btn icon="mdi-chevron-double-right"  size="small" variant="text" :disabled="pagina === totalPaginas" @click="pagina = totalPaginas" />
            <v-select v-model="porPagina" :items="[100,200,500,1000]" density="compact" hide-details
              variant="outlined" style="max-width:90px" @update:model-value="pagina = 1" />
          </div>
        </template>
      </v-card>
    </template>

    <!-- ===================================================
         MODAL DE FILTROS
    ==================================================== -->
    <v-dialog v-model="modalFiltros.mostrar" max-width="460" persistent>
      <v-card v-if="modalFiltros.reporte" rounded="xl">
        <v-card-title class="pa-5 pb-2 d-flex align-center gap-3">
          <v-icon :color="modalFiltros.reporte.color">{{ modalFiltros.reporte.icono }}</v-icon>
          <span>{{ modalFiltros.reporte.nombre }}</span>
        </v-card-title>
        <v-card-subtitle class="px-5 pb-1 text-medium-emphasis">
          Selecciona los filtros para generar el reporte
        </v-card-subtitle>
        <v-divider class="mt-2" />

        <v-card-text v-if="modalFiltros.reporte.id === 'top-clientes-vendedor'" class="pa-5">
          <v-row dense>
            <v-col cols="6">
              <v-text-field v-model="f.desde" type="date" label="Desde *" variant="outlined"
                density="comfortable" hide-details="auto" />
            </v-col>
            <v-col cols="6">
              <v-text-field v-model="f.hasta" type="date" label="Hasta *" variant="outlined"
                density="comfortable" hide-details="auto" />
            </v-col>
            <v-col cols="12" class="mt-3">
              <v-text-field v-model="f.codcliente" type="number" min="0"
                label="Código de cliente (0 = todos)" variant="outlined"
                density="comfortable" hide-details prepend-inner-icon="mdi-account-search" />
            </v-col>
          </v-row>
        </v-card-text>

        <v-card-text v-else-if="modalFiltros.reporte.id === 'comisiones-cobranzas'" class="pa-5">
          <v-row dense>
            <v-col cols="6">
              <v-text-field v-model="f.desde" type="date" label="Desde *" variant="outlined"
                density="comfortable" hide-details="auto" />
            </v-col>
            <v-col cols="6">
              <v-text-field v-model="f.hasta" type="date" label="Hasta *" variant="outlined"
                density="comfortable" hide-details="auto" />
            </v-col>
            <v-col cols="12" class="mt-3">
              <v-text-field v-model.number="f.comision" type="number" min="0" step="0.1"
                label="% Comisión Marketing" variant="outlined"
                density="comfortable" hide-details prepend-inner-icon="mdi-percent" suffix="%" />
            </v-col>
          </v-row>
        </v-card-text>

        <v-card-text v-else-if="modalFiltros.reporte.id === 'transferencias'" class="pa-5">
          <v-row dense>
            <v-col cols="6">
              <v-text-field v-model="f.desde" type="date" label="Desde *" variant="outlined"
                density="comfortable" hide-details="auto" />
            </v-col>
            <v-col cols="6">
              <v-text-field v-model="f.hasta" type="date" label="Hasta *" variant="outlined"
                density="comfortable" hide-details="auto" />
            </v-col>
            <v-col cols="12" class="mt-3">
              <v-text-field v-model="f.codarticulo" type="number" min="0"
                label="Código de artículo (0 = todos)" variant="outlined"
                density="comfortable" hide-details prepend-inner-icon="mdi-barcode-scan" />
            </v-col>
          </v-row>
        </v-card-text>

        <v-card-actions class="pa-5 pt-2">
          <v-btn variant="text" @click="modalFiltros.mostrar = false">Cancelar</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="elevated" :loading="cargando"
            prepend-icon="mdi-play" @click="ejecutarReporte">
            Generar reporte
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="aviso.mostrar" :color="aviso.color" timeout="4000">{{ aviso.texto }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;
const aviso = ref({ mostrar: false, texto: '', color: 'error' });
const lanzarAviso = (texto: string, color = 'error') => aviso.value = { mostrar: true, texto, color };

// ── Catálogo de reportes ──────────────────────────────────────────────────
const REPORTES = [
  { id: 'top-clientes-vendedor', nombre: 'Record del cliente',
    desc: 'Ventas mensuales por cliente y vendedor en un período',
    icono: 'mdi-account-star', color: 'primary' },
  { id: 'transferencias', nombre: 'Reporte de Transferencias',
    desc: 'Movimientos de albaranes por artículo y período',
    icono: 'mdi-swap-horizontal', color: 'teal' },
  { id: 'comisiones-cobranzas', nombre: 'Comisiones Cobranzas',
    desc: 'Comisión por vendedor sobre cobros realizados en el período',
    icono: 'mdi-cash-multiple', color: 'green' },
];

// ── Navegación ────────────────────────────────────────────────────────────
const vista         = ref<'lista' | 'reporte'>('lista');
const reporteActivo = ref<typeof REPORTES[0] | null>(null);
const busqueda      = ref('');

const reportesFiltrados = computed(() => {
  const q = busqueda.value.toLowerCase().trim();
  return q ? REPORTES.filter(r => r.nombre.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q)) : REPORTES;
});

const modalFiltros = ref<{ mostrar: boolean; reporte: typeof REPORTES[0] | null }>({ mostrar: false, reporte: null });
const abrirFiltros = (r: typeof REPORTES[0]) => { modalFiltros.value = { mostrar: true, reporte: r }; };
const volverLista  = () => { vista.value = 'lista'; filas.value = []; reporteActivo.value = null; };

// ── Filtros ───────────────────────────────────────────────────────────────
const hoy = new Date();
const f = ref({ desde: `${hoy.getFullYear()}-01-01`, hasta: hoy.toISOString().slice(0, 10), codcliente: 0, codarticulo: 0, comision: 1.0 });

const resumenFiltros = computed(() => {
  if (!reporteActivo.value) return '';
  const cod = Number(f.value.codcliente);
  return `${f.value.desde} → ${f.value.hasta}${cod ? ` · Cliente ${cod}` : ''}`;
});

// ── Definición de columnas ────────────────────────────────────────────────
interface Col { key: string; title: string; align: 'left' | 'center' | 'right'; type: 'vendedor'|'texto'|'num'|'mes'|'und'|'total'|'fecha'; isUnd: boolean }

const MES_RE  = /^[A-Z]{3}_\d{4}$/;
const UND_RE  = /^[A-Z]{3}_\d{4}_UND$/;

const columnas = ref<Col[]>([]);

const COLS_COMISIONES_COBRANZAS: Col[] = [
  { key: 'VENDEDOR',     title: 'Cód. Vendedor', align: 'center', type: 'num',   isUnd: false },
  { key: 'NOMBRE',       title: 'Nombre',        align: 'left',   type: 'texto', isUnd: false },
  { key: 'MONTO_USD',    title: 'Monto USD',     align: 'right',  type: 'total', isUnd: false },
  { key: 'MONTO',        title: 'Monto',         align: 'right',  type: 'total', isUnd: false },
  { key: 'COMISION_USD', title: 'Comisión USD',  align: 'right',  type: 'total', isUnd: false },
  { key: 'COMISION_VED', title: 'Comisión Gs.',  align: 'right',  type: 'total', isUnd: false },
];

const COLS_TRANSFERENCIAS: Col[] = [
  { key: 'FECHA',            title: 'Fecha',          align: 'center', type: 'fecha',  isUnd: false },
  { key: 'TIPO',             title: 'Tipo',           align: 'left',   type: 'texto',  isUnd: false },
  { key: 'DOCUMENTO',        title: 'Documento',      align: 'left',   type: 'texto',  isUnd: false },
  { key: 'DESCRIPCION',      title: 'Descripción',    align: 'left',   type: 'texto',  isUnd: false },
  { key: 'UNIDADES',         title: 'Unidades',       align: 'right',  type: 'und',    isUnd: false },
  { key: 'CLIENTE_PROVEEDOR',title: 'Cliente',        align: 'left',   type: 'texto',  isUnd: false },
  { key: 'MONTO_UNITARIO',   title: 'Monto Unit.',    align: 'right',  type: 'total',  isUnd: false },
  { key: 'TOTAL',            title: 'Total',          align: 'right',  type: 'total',  isUnd: false },
];

const initColumnas = (reporteId: string) => {
  if (!filas.value.length) { columnas.value = []; return; }

  if (reporteId === 'comisiones-cobranzas') {
    columnas.value = [...COLS_COMISIONES_COBRANZAS];
    return;
  }
  if (reporteId === 'transferencias') {
    columnas.value = [...COLS_TRANSFERENCIAS];
    return;
  }

  // top-clientes-vendedor: columnas dinámicas del pivot
  const row0 = filas.value[0];
  const cols: Col[] = [
    { key: 'VENDEDOR',         title: 'Vendedor',     align: 'left',   type: 'vendedor', isUnd: false },
    { key: 'CODCLIENTE',       title: 'Cód. Cliente', align: 'center', type: 'num',      isUnd: false },
    { key: 'CLIENTE',          title: 'Cliente',      align: 'left',   type: 'texto',    isUnd: false },
    { key: 'COMERCIAL',        title: 'Comercial',    align: 'left',   type: 'texto',    isUnd: false },
  ];
  for (const k of Object.keys(row0)) {
    if (MES_RE.test(k))  cols.push({ key: k, title: k, align: 'right', type: 'mes', isUnd: false });
    if (UND_RE.test(k))  cols.push({ key: k, title: k, align: 'right', type: 'und', isUnd: true  });
  }
  cols.push(
    { key: 'TOTAL_USD',        title: 'Total USD',    align: 'right',  type: 'total', isUnd: false },
    { key: 'UNIDADES_TOTALES', title: 'Total UND',    align: 'right',  type: 'und',   isUnd: true  },
  );
  columnas.value = cols;
};

const mostrarUnidades = ref(false);
const columnasMostradas = computed(() => columnas.value.filter(c => !c.isUnd || mostrarUnidades.value));

// ── Drag & drop para reordenar columnas ───────────────────────────────────
const dragIdx     = ref(-1);
const dragOverIdx = ref(-1);

const moverColumna = (toIdx: number) => {
  const fromIdx = dragIdx.value;
  if (fromIdx < 0 || fromIdx === toIdx) { dragIdx.value = -1; dragOverIdx.value = -1; return; }
  const visible  = columnasMostradas.value;
  const fromKey  = visible[fromIdx].key;
  const toKey    = visible[toIdx].key;
  const cols     = [...columnas.value];
  const fi       = cols.findIndex(c => c.key === fromKey);
  const ti       = cols.findIndex(c => c.key === toKey);
  const [moved]  = cols.splice(fi, 1);
  cols.splice(ti, 0, moved);
  columnas.value = cols;
  dragIdx.value  = -1;
  dragOverIdx.value = -1;
};

// ── Ordenamiento por columna ──────────────────────────────────────────────
const sortKey = ref('');
const sortDir = ref<'asc'|'desc'>('asc');

const toggleSort = (key: string) => {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  else { sortKey.value = key; sortDir.value = 'asc'; }
  pagina.value = 1;
};

const filas     = ref<any[]>([]);
const pagina    = ref(1);
const porPagina = ref(200);

const totalPaginas   = computed(() => Math.max(1, Math.ceil(filasOrdenadas.value.length / porPagina.value)));
const filasPaginadas = computed(() => {
  const start = (pagina.value - 1) * porPagina.value;
  return filasOrdenadas.value.slice(start, start + porPagina.value);
});

const filasOrdenadas = computed(() => {
  if (!sortKey.value) return filas.value;
  const key = sortKey.value;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  return [...filas.value].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return dir;
    if (bv == null) return -dir;
    return typeof av === 'number'
      ? (av - bv) * dir
      : String(av).localeCompare(String(bv)) * dir;
  });
});

const totales = computed<Record<string, number>>(() => {
  const acc: Record<string, number> = {};
  for (const row of filas.value)
    for (const k of Object.keys(row))
      if (typeof row[k] === 'number') acc[k] = (acc[k] ?? 0) + row[k];
  return acc;
});

// ── Ejecutar reporte ──────────────────────────────────────────────────────
const cargando = ref(false);

const ejecutarReporte = async () => {
  const r = modalFiltros.value.reporte;
  if (!r) return;
  if (!f.value.desde || !f.value.hasta) { lanzarAviso('Selecciona rango de fechas'); return; }
  cargando.value = true;
  filas.value    = [];
  try {
    if (r.id === 'top-clientes-vendedor') {
      const res = await axios.get(`${API}/api/reportes/top-clientes-por-vendedor`, {
        params: { desde: f.value.desde, hasta: f.value.hasta, codcliente: f.value.codcliente || 0 },
      });
      if (!res.data.success) throw new Error(res.data.message);
      filas.value = res.data.data;
    } else if (r.id === 'comisiones-cobranzas') {
      const res = await axios.get(`${API}/api/reportes/comisiones-cobranzas`, {
        params: { desde: f.value.desde, hasta: f.value.hasta, comision: f.value.comision ?? 1.0 },
      });
      if (!res.data.success) throw new Error(res.data.message);
      filas.value = res.data.data;
    } else if (r.id === 'transferencias') {
      const res = await axios.get(`${API}/api/reportes/transferencias`, {
        params: { desde: f.value.desde, hasta: f.value.hasta, codarticulo: f.value.codarticulo || 0 },
      });
      if (!res.data.success) throw new Error(res.data.message);
      filas.value = res.data.data;
    }
    initColumnas(r.id);
    sortKey.value = '';
    pagina.value  = 1;
    reporteActivo.value = r;
    modalFiltros.value.mostrar = false;
    vista.value = 'reporte';
  } catch (e: any) {
    lanzarAviso(e?.response?.data?.message ?? String(e));
  } finally {
    cargando.value = false;
  }
};

// ── Formatters ────────────────────────────────────────────────────────────
const fmtUSD   = (v: any) => v == null ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt   = (v: any) => v == null ? '—' : Number(v).toLocaleString('en-US');
const fmtFecha = (v: any) => { if (!v) return '—'; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
</script>

<style scoped>
.reporte-card { cursor:pointer; transition:transform .15s, box-shadow .15s; }
.reporte-card:hover { transform:translateY(-3px); box-shadow:0 6px 20px rgba(0,0,0,.12) !important; }

.reporte-tabla { width:100%; border-collapse:collapse; font-size:.8rem; }
.reporte-tabla th, .reporte-tabla td { padding:6px 10px; border-bottom:1px solid rgba(0,0,0,.07); white-space:nowrap; }

.th-drag {
  background:#f5f7fa;
  font-weight:700; font-size:.72rem;
  text-transform:uppercase; letter-spacing:.03em;
  position:sticky; top:0; z-index:1;
  cursor:grab; user-select:none;
  transition:background .1s;
}
.th-drag:hover { background:#e2e8f0; }
.th-drag:active { cursor:grabbing; }

.reporte-tabla tbody tr:hover { background:rgba(0,0,0,.03); }
.fila-total td { background:#e8f4fd; border-top:2px solid #90caf9; padding:8px 10px; }
</style>
