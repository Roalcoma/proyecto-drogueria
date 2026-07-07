<template>
  <v-container fluid class="pa-4">

    <!-- Encabezado -->
    <div class="d-flex align-center justify-space-between mb-4">
      <div class="d-flex align-center gap-3">
        <v-icon color="blue-darken-3" size="28">mdi-printer</v-icon>
        <div>
          <div class="text-h6 font-weight-bold">Impresión de Facturas</div>
          <div class="text-caption text-medium-emphasis">Selección por lote, asignación de N° de control y cola de impresión</div>
        </div>
      </div>
      <v-btn variant="tonal" color="grey" prepend-icon="mdi-cog-outline" @click="configDialog = true">
        Configurar ruta
      </v-btn>
    </div>

    <v-row>
      <!-- ── Panel izquierdo: filtros + lista ── -->
      <v-col cols="12" md="8">
        <v-card variant="outlined" class="mb-4">
          <v-card-title class="text-subtitle-2 pa-3 pb-1">Filtros de búsqueda</v-card-title>
          <v-card-text class="pa-3 pt-2">
            <v-row dense>
              <v-col cols="12" sm="3">
                <v-select v-model="filtros.serie" :items="seriesDisponibles" label="Serie"
                  clearable density="compact" variant="outlined" />
              </v-col>
              <v-col cols="12" sm="3">
                <v-text-field v-model.number="filtros.desde" label="N° Factura desde"
                  type="number" density="compact" variant="outlined" clearable />
              </v-col>
              <v-col cols="12" sm="3">
                <v-text-field v-model.number="filtros.hasta" label="N° Factura hasta"
                  type="number" density="compact" variant="outlined" clearable />
              </v-col>
              <v-col cols="12" sm="3">
                <v-text-field v-model="filtros.cliente" label="Cliente (nombre/cod)"
                  density="compact" variant="outlined" clearable prepend-inner-icon="mdi-magnify" />
              </v-col>
              <v-col cols="12" sm="4">
                <v-select v-model="filtros.ruta" :items="rutasItems" label="Ruta"
                  item-title="label" item-value="value" clearable density="compact" variant="outlined" />
              </v-col>
              <v-col cols="12" sm="8" class="d-flex align-center gap-2">
                <v-btn color="blue-darken-3" prepend-icon="mdi-magnify" :loading="cargando"
                  @click="buscarFacturas">Buscar</v-btn>
                <v-btn variant="text" @click="limpiarFiltros">Limpiar</v-btn>
                <span v-if="total > 0" class="text-caption text-medium-emphasis ml-2">
                  {{ total }} facturas encontradas
                </span>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <!-- Tabla de resultados -->
        <v-card variant="outlined">
          <v-card-title class="text-subtitle-2 pa-3 pb-0 d-flex align-center justify-space-between">
            <span>Facturas</span>
            <div class="d-flex align-center gap-2">
              <v-btn v-if="seleccionadas.length > 0" size="small" variant="tonal" color="red"
                prepend-icon="mdi-close" @click="seleccionadas = []">
                Deseleccionar ({{ seleccionadas.length }})
              </v-btn>
              <v-btn size="small" variant="tonal" color="blue-darken-2"
                prepend-icon="mdi-check-all" :disabled="facturas.length === 0"
                @click="seleccionarTodas">
                Seleccionar todas
              </v-btn>
            </div>
          </v-card-title>

          <v-data-table
            v-model="seleccionadas"
            :headers="headers"
            :items="facturas"
            :loading="cargando"
            item-value="key"
            show-select
            density="compact"
            :items-per-page="50"
            class="text-body-2"
          >
            <template #item.FECHA="{ item }">{{ item.FECHA }}</template>
            <template #item.NOCONTROL="{ item }">
              <v-chip v-if="item.NOCONTROL" size="x-small" color="green-darken-2" variant="flat">
                {{ item.NOCONTROL }}
              </v-chip>
              <span v-else class="text-medium-emphasis text-caption">—</span>
            </template>
            <template #item.TOTALNETO="{ item }">
              <span class="font-weight-medium">${{ Number(item.TOTALNETO).toFixed(2) }}</span>
            </template>
          </v-data-table>
        </v-card>
      </v-col>

      <!-- ── Panel derecho: acciones ── -->
      <v-col cols="12" md="4">

        <!-- Asignación de NOCONTROL -->
        <v-card variant="outlined" class="mb-4">
          <v-card-title class="text-subtitle-2 pa-3 pb-1 d-flex align-center gap-2">
            <v-icon color="orange-darken-2" size="18">mdi-numeric</v-icon>
            Asignar N° de Control
          </v-card-title>
          <v-card-text class="pa-3 pt-1">
            <div v-if="seleccionadas.length === 0" class="text-caption text-medium-emphasis mb-2">
              Selecciona facturas en la tabla para asignar números de control.
            </div>
            <div v-else class="text-caption mb-2">
              <strong>{{ seleccionadas.length }}</strong> facturas seleccionadas.
            </div>
            <v-text-field v-model="nocontrolDesde" label="N° Control inicial"
              placeholder="Ej: 00-215826" density="compact" variant="outlined"
              :hint="nocontrolHint" :error-messages="nocontrolError"
              persistent-hint class="mb-2" />
            <v-btn block color="orange-darken-2" prepend-icon="mdi-content-save"
              :disabled="seleccionadas.length === 0 || !nocontrolDesde"
              :loading="asignando" @click="asignarNoControl">
              Asignar N° de Control
            </v-btn>
          </v-card-text>
        </v-card>

        <!-- Cola de impresión -->
        <v-card variant="outlined">
          <v-card-title class="text-subtitle-2 pa-3 pb-1 d-flex align-center justify-space-between">
            <div class="d-flex align-center gap-2">
              <v-icon color="blue-darken-3" size="18">mdi-printer-check</v-icon>
              Cola de impresión
            </div>
            <v-btn v-if="cola.length > 0" size="x-small" variant="text" color="red"
              @click="cola = []">Limpiar</v-btn>
          </v-card-title>
          <v-card-text class="pa-3 pt-1">
            <div class="d-flex gap-2 mb-3">
              <v-btn block color="blue-darken-3" prepend-icon="mdi-file-pdf-box"
                :disabled="seleccionadas.length === 0" :loading="generando"
                @click="generarLote">
                Generar PDFs ({{ seleccionadas.length }})
              </v-btn>
            </div>

            <v-progress-linear v-if="generando" :model-value="progresoGen"
              color="blue-darken-3" rounded height="6" class="mb-2" />

            <div v-if="cola.length === 0 && !generando" class="text-caption text-medium-emphasis text-center py-3">
              Sin PDFs generados. Selecciona facturas y pulsa "Generar PDFs".
            </div>

            <v-list v-else density="compact" lines="one">
              <v-list-item v-for="item in cola" :key="item.key" class="px-0">
                <template #prepend>
                  <v-icon :color="item.error ? 'red' : 'green-darken-2'" size="16">
                    {{ item.error ? 'mdi-alert-circle' : 'mdi-check-circle' }}
                  </v-icon>
                </template>
                <v-list-item-title class="text-caption">
                  {{ item.label }}
                  <span v-if="item.nocontrol" class="text-medium-emphasis ml-1">(N°C: {{ item.nocontrol }})</span>
                </v-list-item-title>
                <template #append>
                  <div class="d-flex gap-1">
                    <v-btn v-if="item.blobUrl" icon size="x-small" variant="text" color="blue-darken-2"
                      :href="item.blobUrl" :download="item.filename" title="Descargar">
                      <v-icon size="14">mdi-download</v-icon>
                    </v-btn>
                    <v-btn v-if="item.blobUrl" icon size="x-small" variant="text" color="green-darken-2"
                      @click="imprimirItem(item)" title="Imprimir">
                      <v-icon size="14">mdi-printer</v-icon>
                    </v-btn>
                  </div>
                </template>
              </v-list-item>
            </v-list>

            <div v-if="cola.some(c => c.blobUrl)" class="mt-3 d-flex flex-column gap-2">
              <v-btn block color="blue-darken-3" variant="tonal" prepend-icon="mdi-printer-multiple"
                :loading="imprimiendoTodo" @click="imprimirTodo">
                {{ imprimiendoTodo ? `Imprimiendo (${imprimirIdx + 1}/${colaOk.length})…` : 'Imprimir todo' }}
              </v-btn>
              <v-btn block color="indigo-darken-2" variant="tonal" prepend-icon="mdi-download-multiple"
                @click="descargarTodo">
                Descargar todo ({{ colaOk.length }})
              </v-btn>
              <v-btn v-if="rutaSalida" block color="teal-darken-2" variant="tonal"
                prepend-icon="mdi-folder-arrow-down" :loading="guardando" @click="guardarEnRuta">
                Guardar en {{ rutaSalida }}
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Diálogo de configuración de ruta -->
    <v-dialog v-model="configDialog" max-width="480">
      <v-card>
        <v-card-title class="pa-4 pb-2">Ruta de salida de PDFs</v-card-title>
        <v-card-text class="pa-4 pt-2">
          <v-text-field v-model="rutaSalidaEdit" label="Ruta de carpeta"
            placeholder="Ej: C:\Facturas\PDFs" density="compact" variant="outlined"
            hint="Ruta en el servidor donde se guardarán los PDFs generados."
            persistent-hint prepend-inner-icon="mdi-folder" />
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="configDialog = false">Cancelar</v-btn>
          <v-btn color="blue-darken-3" variant="flat" :loading="guardandoConfig"
            @click="guardarConfig">Guardar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Snackbar -->
    <v-snackbar v-model="snack.show" :color="snack.color" :timeout="3500" location="bottom right">
      {{ snack.text }}
    </v-snackbar>

    <!-- iframe oculto para impresión -->
    <iframe ref="printFrame" style="display:none; width:0; height:0; border:none;" />

  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { generarFacturaPDF } from '../utils/facturasPDF';

// Convierte ArrayBuffer → base64 sin explotar el call stack
function abToBase64(ab: ArrayBuffer): string {
  const bytes = new Uint8Array(ab);
  let b64 = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    b64 += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(b64);
}

const API = `${import.meta.env.VITE_API_URL}/facturas`;

// ── Estado ─────────────────────────────────────────────────────────────────
const facturas      = ref<any[]>([]);
const seleccionadas = ref<string[]>([]);
const total         = ref(0);
const cargando      = ref(false);
const asignando       = ref(false);
const generando       = ref(false);
const guardando       = ref(false);
const guardandoConfig = ref(false);
const imprimiendoTodo = ref(false);
const imprimirIdx     = ref(0);
const progresoGen     = ref(0);
const printFrame      = ref<HTMLIFrameElement | null>(null);

const seriesDisponibles = ref<string[]>([]);
const rutasItems        = ref<{ label: string; value: string }[]>([]);
const rutaSalida        = ref('');

const filtros = ref({
  serie: null as string | null,
  desde: null as number | null,
  hasta: null as number | null,
  cliente: '',
  ruta: null as string | null,
});
const nocontrolDesde = ref('');

// Parsea "00-215826" → { prefix: "00-", num: 215826 } | null
function parseNoControl(s: string) {
  const m = s.trim().match(/^(.*?)(\d+)$/);
  return m ? { prefix: m[1], num: parseInt(m[2], 10) } : null;
}

const nocontrolHint = computed(() => {
  if (!seleccionadas.value.length || !nocontrolDesde.value) return '';
  const p = parseNoControl(nocontrolDesde.value);
  if (!p) return '';
  const end = p.num + seleccionadas.value.length - 1;
  return `Asignará del ${nocontrolDesde.value} al ${p.prefix}${end}`;
});

const nocontrolError = computed(() => {
  if (!nocontrolDesde.value) return '';
  return parseNoControl(nocontrolDesde.value) ? '' : 'Formato inválido. Ej: 00-215826';
});

interface ColaItem {
  key: string; label: string; filename: string;
  blobUrl?: string; nocontrol?: string | null; error?: string;
}

const colaOk = computed(() => cola.value.filter(c => c.blobUrl));
const cola = ref<ColaItem[]>([]);

const configDialog   = ref(false);
const rutaSalidaEdit = ref('');

const snack = ref({ show: false, text: '', color: 'success' });
const toast = (text: string, color = 'success') => {
  snack.value = { show: true, text, color };
};

// ── Headers tabla ───────────────────────────────────────────────────────────
const headers = [
  { title: 'Serie',    key: 'NUMSERIE',     width: 70  },
  { title: 'N° Fac',  key: 'NUMFACTURA',   width: 80  },
  { title: 'Fecha',   key: 'FECHA',         width: 100 },
  { title: 'Cliente', key: 'NOMBRECLIENTE', minWidth: 140 },
  { title: 'Ruta',    key: 'RUTA',          width: 80  },
  { title: 'N° Control', key: 'NOCONTROL', width: 100  },
  { title: 'Total $', key: 'TOTALNETO',     width: 90  },
];

// ── Init ───────────────────────────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([cargarSeries(), cargarRutas(), cargarConfig()]);
});

async function cargarSeries() {
  try {
    const { data } = await axios.get(`${API}/series`);
    seriesDisponibles.value = data.data ?? [];
  } catch { /* ignore */ }
}

async function cargarRutas() {
  try {
    const { data } = await axios.get(`${API}/rutas`);
    rutasItems.value = (data.data ?? []).map((r: any) => ({
      label: `${r.codruta} - ${r.descripcion}`, value: r.codruta,
    }));
  } catch { /* ignore */ }
}

async function cargarConfig() {
  try {
    const { data } = await axios.get(`${API}/config`);
    rutaSalida.value     = data.data?.rutaSalida ?? '';
    rutaSalidaEdit.value = rutaSalida.value;
  } catch { /* ignore */ }
}

// ── Búsqueda ────────────────────────────────────────────────────────────────
async function buscarFacturas() {
  cargando.value = true;
  seleccionadas.value = [];
  try {
    const params: any = {};
    if (filtros.value.serie)   params.serie   = filtros.value.serie;
    if (filtros.value.desde)   params.desde   = filtros.value.desde;
    if (filtros.value.hasta)   params.hasta   = filtros.value.hasta;
    if (filtros.value.cliente) params.cliente = filtros.value.cliente;
    if (filtros.value.ruta)    params.ruta    = filtros.value.ruta;
    const { data } = await axios.get(`${API}/`, { params });
    facturas.value = (data.data ?? []).map((f: any) => ({
      ...f,
      key: `${f.NUMSERIE}_${f.NUMFACTURA}`,
    }));
    total.value = data.total ?? facturas.value.length;
  } catch {
    toast('Error al buscar facturas', 'error');
  } finally {
    cargando.value = false;
  }
}

function limpiarFiltros() {
  filtros.value = { serie: null, desde: null, hasta: null, cliente: '', ruta: null };
  facturas.value = [];
  seleccionadas.value = [];
  total.value = 0;
}

function seleccionarTodas() {
  seleccionadas.value = facturas.value.map(f => f.key);
}

// ── Asignar NOCONTROL ────────────────────────────────────────────────────────
async function asignarNoControl() {
  if (!seleccionadas.value.length || !nocontrolDesde.value) return;
  if (!parseNoControl(nocontrolDesde.value)) {
    toast('Formato de N° de control inválido. Ej: 00-215826', 'error');
    return;
  }
  asignando.value = true;
  try {
    const lote = seleccionadas.value.map(key => {
      const [ns, nf] = key.split('_');
      return { numserie: ns, numfactura: Number(nf) };
    });
    const { data } = await axios.put(`${API}/nocontrol`, {
      facturas: lote, desdeNoControl: nocontrolDesde.value,
    });
    if (data.success) {
      toast(`N° de control asignado a ${lote.length} facturas`);
      data.data.forEach((r: any) => {
        const idx = facturas.value.findIndex(f => f.NUMSERIE === r.numserie && f.NUMFACTURA === r.numfactura);
        if (idx >= 0) facturas.value[idx].NOCONTROL = r.nocontrol;
      });
    } else {
      toast(data.message ?? 'Error al asignar N° de control', 'error');
    }
  } catch {
    toast('Error al asignar N° de control', 'error');
  } finally {
    asignando.value = false;
  }
}

// ── Generar PDFs ─────────────────────────────────────────────────────────────
async function generarLote() {
  if (!seleccionadas.value.length) return;
  generando.value = true;
  progresoGen.value = 0;
  cola.value = [];

  const lote = seleccionadas.value.map(key => {
    const [ns, nf] = key.split('_');
    const fac = facturas.value.find(f => f.key === key);
    return { numserie: ns, numfactura: Number(nf), nocontrol: fac?.NOCONTROL ?? null };
  });

  for (let i = 0; i < lote.length; i++) {
    const { numserie, numfactura, nocontrol } = lote[i];
    const label    = `${numserie}-${numfactura}`;
    const filename = `Factura_${numserie}_${numfactura}.pdf`;

    try {
      const { data } = await axios.get(`${API}/detalle`, {
        params: { numserie, numfactura },
      });

      if (!data.success) throw new Error(data.message);

      const blob = await generarFacturaPDF({
        numserie, numfactura,
        nocontrol: nocontrol ?? data.data.nocontrol,
        header: data.data.header,
        items: data.data.items,
      });
      const blobUrl = URL.createObjectURL(blob);
      cola.value.push({ key: `${numserie}_${numfactura}`, label, filename, blobUrl, nocontrol });
    } catch (e: any) {
      cola.value.push({ key: `${numserie}_${numfactura}`, label, filename, error: e.message ?? 'Error' });
    }

    progresoGen.value = Math.round(((i + 1) / lote.length) * 100);
  }

  generando.value = false;
  const ok = cola.value.filter(c => c.blobUrl).length;
  toast(`${ok} de ${lote.length} PDFs generados`, ok === lote.length ? 'success' : 'warning');
}

// ── Imprimir ─────────────────────────────────────────────────────────────────
// Carga la URL en el iframe oculto y dispara el diálogo de impresión.
// El iframe funciona con blob:// de PDFs en Chromium/Edge; en Firefox puede
// abrir en pestaña nueva. Es la única forma sin popup-blocker para el "todo".
function imprimirConIframe(blobUrl: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = printFrame.value;
    if (!frame) { window.open(blobUrl, '_blank'); resolve(); return; }

    const cleanup = () => {
      frame.onload = null;
      resolve();
    };

    frame.onload = () => {
      try { frame.contentWindow?.print(); } catch { window.open(blobUrl, '_blank'); }
      // Esperar a que el diálogo de impresión cierre antes del siguiente
      setTimeout(cleanup, 1800);
    };

    frame.src = blobUrl;
  });
}

function imprimirItem(item: ColaItem) {
  if (!item.blobUrl) return;
  imprimirConIframe(item.blobUrl);
}

async function imprimirTodo() {
  const items = colaOk.value;
  if (!items.length) return;
  imprimiendoTodo.value = true;
  for (let i = 0; i < items.length; i++) {
    imprimirIdx.value = i;
    await imprimirConIframe(items[i].blobUrl!);
  }
  imprimiendoTodo.value = false;
  toast(`${items.length} facturas enviadas a impresora`);
}

// ── Descargar todo ───────────────────────────────────────────────────────────
async function descargarTodo() {
  for (const item of colaOk.value) {
    const a = document.createElement('a');
    a.href = item.blobUrl!;
    a.download = item.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    await new Promise(r => setTimeout(r, 250));
  }
}

// ── Guardar en ruta del servidor ─────────────────────────────────────────────
async function guardarEnRuta() {
  guardando.value = true;
  let ok = 0;
  for (const item of colaOk.value) {
    try {
      const resp = await fetch(item.blobUrl!);
      const ab   = await resp.arrayBuffer();
      const b64  = abToBase64(ab);   // chunked, no stack overflow
      const [ns, nf] = item.key.split('_');
      await axios.post(`${API}/guardar-pdf`, {
        numserie: ns, numfactura: Number(nf), pdfBase64: b64,
      });
      ok++;
    } catch { /* continúa con el siguiente */ }
  }
  guardando.value = false;
  toast(`${ok} de ${colaOk.value.length} PDFs guardados en ${rutaSalida.value}`);
}

// ── Config ────────────────────────────────────────────────────────────────────
async function guardarConfig() {
  guardandoConfig.value = true;
  try {
    await axios.put(`${API}/config`, { rutaSalida: rutaSalidaEdit.value });
    rutaSalida.value = rutaSalidaEdit.value;
    configDialog.value = false;
    toast('Ruta de salida guardada');
  } catch {
    toast('Error al guardar configuración', 'error');
  } finally {
    guardandoConfig.value = false;
  }
}
</script>
