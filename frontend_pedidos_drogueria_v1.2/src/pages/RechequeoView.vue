<template>
  <v-container fluid class="pa-4" style="height:calc(100vh - 64px);overflow:hidden">
    <v-row style="height:100%">

      <!-- ── Panel izquierdo ─────────────────────────────────────────────── -->
      <v-col cols="12" md="4" lg="3" style="height:100%;display:flex;flex-direction:column">
        <v-card rounded="xl" elevation="2" style="flex:1;display:flex;flex-direction:column;overflow:hidden">
          <v-card-title class="d-flex align-center gap-2 pa-4 pb-2">
            <v-icon color="primary">mdi-clipboard-list-outline</v-icon>
            <span class="text-subtitle-1 font-weight-bold">Rechequeo de Compras</span>
          </v-card-title>
          <v-divider />

          <div style="flex:1;overflow-y:auto">
            <!-- Mis pedidos -->
            <div class="px-2 pt-2">
              <div class="d-flex align-center gap-2 px-2 py-1">
                <v-icon size="16" color="primary">mdi-lock</v-icon>
                <span class="text-caption font-weight-bold text-primary">MIS PEDIDOS</span>
                <v-chip size="x-small" color="primary">{{ misPedidos.length }}</v-chip>
                <v-progress-circular v-if="cargandoMios" size="14" width="2" indeterminate color="primary" class="ms-auto" />
              </div>

              <div v-if="!misPedidos.length && !cargandoMios" class="text-caption text-medium-emphasis pa-2">
                No tenés pedidos tomados
              </div>

              <v-list-item
                v-for="p in misPedidos"
                :key="`mio-${p.NUMSERIE}-${p.NUMPEDIDO}-${p.N}`"
                :active="esMismoPedido(p, pedidoActual)"
                active-color="primary"
                rounded="lg"
                density="compact"
                @click="seleccionarMiPedido(p)"
                class="mb-1"
              >
                <v-list-item-title class="text-body-2 font-weight-medium">
                  {{ p.NUMSERIE }}-{{ p.NUMPEDIDO }}-{{ p.N }}
                </v-list-item-title>
                <v-list-item-subtitle class="text-caption text-truncate">
                  {{ p.PROVEEDOR || 'Sin proveedor' }}
                </v-list-item-subtitle>
                <template #append>
                  <v-chip size="x-small" color="warning" variant="tonal">
                    {{ p.TOTAL_PENDIENTES }}
                  </v-chip>
                </template>
              </v-list-item>
            </div>

            <v-divider class="my-2" />

            <!-- Disponibles -->
            <div class="px-2 pb-2">
              <div class="d-flex align-center gap-2 px-2 py-1">
                <v-icon size="16" color="secondary">mdi-clipboard-text-outline</v-icon>
                <span class="text-caption font-weight-bold text-secondary">DISPONIBLES</span>
                <v-chip size="x-small" color="secondary">{{ disponibles.length }}</v-chip>
                <v-progress-circular v-if="cargandoDisp" size="14" width="2" indeterminate color="secondary" class="ms-auto" />
              </div>

              <div v-if="!disponibles.length && !cargandoDisp" class="text-caption text-medium-emphasis pa-2">
                No hay pedidos disponibles
              </div>

              <v-list-item
                v-for="p in disponibles"
                :key="`disp-${p.NUMSERIE}-${p.NUMPEDIDO}-${p.N}`"
                rounded="lg"
                density="compact"
                @click="abrirDialogTomar(p)"
                class="mb-1"
              >
                <v-list-item-title class="text-body-2">
                  {{ p.NUMSERIE }}-{{ p.NUMPEDIDO }}-{{ p.N }}
                </v-list-item-title>
                <v-list-item-subtitle class="text-caption text-truncate">
                  {{ p.PROVEEDOR || 'Sin proveedor' }}
                </v-list-item-subtitle>
                <template #append>
                  <div class="d-flex align-center gap-1">
                    <v-chip size="x-small" color="warning" variant="tonal">{{ p.TOTAL_PENDIENTES }}</v-chip>
                    <v-btn size="x-small" color="primary" variant="tonal" icon="mdi-hand-pointing-right" />
                  </div>
                </template>
              </v-list-item>
            </div>

            <v-divider class="my-2" />

            <!-- Cerrados -->
            <div class="px-2 pb-2">
              <div class="d-flex align-center gap-2 px-2 py-1">
                <v-icon size="16" color="success">mdi-check-circle-outline</v-icon>
                <span class="text-caption font-weight-bold text-success">CERRADOS</span>
                <v-chip size="x-small" color="success">{{ cerrados.length }}</v-chip>
              </div>

              <div v-if="!cerrados.length" class="text-caption text-medium-emphasis pa-2">
                Sin pedidos cerrados
              </div>

              <v-list-item
                v-for="c in cerrados"
                :key="`cerr-${c.ID}`"
                rounded="lg"
                density="compact"
                @click="verDetalleCerrado(c)"
                class="mb-1"
              >
                <v-list-item-title class="text-body-2">
                  {{ c.NUMSERIE }}-{{ c.NUMPEDIDO }}-{{ c.N }}
                </v-list-item-title>
                <v-list-item-subtitle class="text-caption text-truncate">
                  {{ c.PROVEEDOR || 'Sin proveedor' }} · {{ c.IDFACTURA }}
                </v-list-item-subtitle>
                <template #append>
                  <v-chip size="x-small" color="success" variant="tonal">
                    {{ c.TOTAL_CONTADAS }}
                  </v-chip>
                </template>
              </v-list-item>
            </div>
          </div>
        </v-card>
      </v-col>

      <!-- ── Panel derecho ──────────────────────────────────────────────── -->
      <v-col cols="12" md="8" lg="9" style="height:100%;overflow-y:auto">
        <div v-if="!pedidoActual" class="d-flex align-center justify-center" style="height:100%">
          <div class="text-center text-medium-emphasis">
            <v-icon size="64" color="grey-lighten-1">mdi-clipboard-search-outline</v-icon>
            <p class="mt-3">Tomá un pedido de la lista para comenzar</p>
          </div>
        </div>

        <template v-else>
          <!-- Encabezado del pedido -->
          <v-card rounded="xl" elevation="2" class="mb-4">
            <v-card-text class="pa-4">
              <v-row align="start" dense>
                <v-col>
                  <span class="text-h6 font-weight-bold">
                    Pedido {{ pedidoActual.NUMSERIE }}-{{ pedidoActual.NUMPEDIDO }}-{{ pedidoActual.N }}
                  </span>
                  <div class="d-flex align-center gap-2 mt-1 flex-wrap">
                    <v-chip size="small" color="secondary" variant="tonal" prepend-icon="mdi-domain">
                      {{ pedidoActual.PROVEEDOR || 'Sin proveedor' }}
                    </v-chip>
                    <v-chip size="small" variant="tonal" prepend-icon="mdi-calendar">
                      {{ pedidoActual.FECHAPEDIDO }}
                    </v-chip>
                    <v-chip size="small" color="warning" prepend-icon="mdi-clock-outline">
                      {{ pedidoActual.TOTAL_PENDIENTES }} pendientes
                    </v-chip>
                  </div>

                  <!-- Mis identificadores -->
                  <div class="d-flex align-center gap-1 flex-wrap mt-2">
                    <span class="text-caption text-medium-emphasis me-1">Mis IDs:</span>
                    <v-chip
                      v-for="cab in myCabs"
                      :key="cab.ID"
                      size="small"
                      :color="activeCab?.ID === cab.ID ? 'primary' : 'default'"
                      :variant="activeCab?.ID === cab.ID ? 'elevated' : 'tonal'"
                      prepend-icon="mdi-file-document-outline"
                      @click="seleccionarCab(cab)"
                      style="cursor:pointer"
                    >
                      {{ cab.IDFACTURA }}
                    </v-chip>
                    <v-btn
                      size="x-small"
                      color="primary"
                      variant="text"
                      prepend-icon="mdi-plus"
                      @click="abrirDialogTomarActual"
                    >
                      Agregar
                    </v-btn>
                  </div>

                  <!-- Otros usuarios -->
                  <div v-if="otrosCabs.length" class="d-flex align-center gap-1 flex-wrap mt-1">
                    <span class="text-caption text-medium-emphasis me-1">Otros:</span>
                    <v-chip
                      v-for="cab in otrosCabs"
                      :key="cab.ID"
                      size="x-small"
                      color="secondary"
                      variant="tonal"
                    >
                      <v-icon start size="12">mdi-account</v-icon>
                      {{ cab.USUARIO }}: {{ cab.IDFACTURA }}
                    </v-chip>
                  </div>
                </v-col>
                <v-col cols="auto">
                  <v-btn
                    color="error"
                    variant="tonal"
                    prepend-icon="mdi-lock-check"
                    :loading="cerrando"
                    @click="abrirDialogCerrar"
                  >
                    Cerrar pedido
                  </v-btn>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>

          <!-- Artículos -->
          <v-card rounded="xl" elevation="2">
            <v-card-title class="d-flex align-center flex-wrap gap-2 pa-4">
              <span class="text-subtitle-1 font-weight-bold">Artículos</span>
              <v-chip v-if="pollingActivo" size="x-small" color="success" variant="tonal" prepend-icon="mdi-sync">
                en vivo
              </v-chip>
              <v-text-field
                v-model="inputScan"
                placeholder="Escanear código…"
                variant="outlined"
                density="compact"
                hide-details
                prepend-inner-icon="mdi-barcode-scan"
                clearable
                style="min-width:200px;max-width:280px"
                @keyup.enter="procesarScan(inputScan)"
                ref="inputScanRef"
              />
              <v-spacer />
              <v-chip v-if="lineasConDiferencia > 0" size="small" color="error" prepend-icon="mdi-alert-circle">
                {{ lineasConDiferencia }} con diferencia
              </v-chip>
              <v-chip v-else-if="lineas.length" size="small" color="success" prepend-icon="mdi-check-circle">
                Sin diferencias
              </v-chip>
            </v-card-title>
            <v-divider />
            <v-progress-linear v-if="cargandoDetalle" indeterminate color="primary" />

            <v-data-table
              :headers="headers"
              :items="lineasConConteo"
              density="compact"
              :items-per-page="500"
              hide-default-footer
              class="rechequeo-tabla"
              :row-props="({ item }) => String(item.CODARTICULO) === ultimoScan ? { class: 'fila-escaneada' } : {}"
            >
              <template #item.POR_MI="{ item }">
                <v-text-field
                  :model-value="item.POR_MI"
                  type="number"
                  min="0"
                  variant="underlined"
                  density="compact"
                  hide-details
                  style="width:80px"
                  @update:model-value="(v: any) => actualizarConteo(item.CODARTICULO, v)"
                />
              </template>

              <template #item.CONTADAS_TOTAL="{ item }">
                <span :class="item.CONTADAS_TOTAL > 0 ? 'text-success font-weight-medium' : ''">
                  {{ item.CONTADAS_TOTAL }}
                </span>
              </template>

              <template #item.DIFERENCIA="{ item }">
                <v-chip
                  size="x-small"
                  :color="item.DIFERENCIA === 0 ? 'success' : item.DIFERENCIA > 0 ? 'warning' : 'error'"
                  variant="tonal"
                >
                  {{ item.DIFERENCIA > 0 ? '+' : '' }}{{ item.DIFERENCIA }}
                </v-chip>
              </template>
            </v-data-table>
          </v-card>
        </template>
      </v-col>
    </v-row>

    <!-- ── Dialog: Tomar conteo ──────────────────────────────────────────── -->
    <v-dialog v-model="dialogTomar" max-width="480" persistent>
      <v-card rounded="xl">
        <v-card-title class="pa-5 pb-2">
          <v-icon color="primary" class="me-2">mdi-hand-pointing-right</v-icon>
          {{ pedidoActual && esMismoPedido(pedidoParaTomar, pedidoActual) ? 'Agregar identificador' : 'Tomar conteo' }}
        </v-card-title>
        <v-card-text class="pa-5 pt-2">
          <p class="text-body-2 mb-1">
            <strong>{{ pedidoParaTomar?.NUMSERIE }}-{{ pedidoParaTomar?.NUMPEDIDO }}-{{ pedidoParaTomar?.N }}</strong>
            · {{ pedidoParaTomar?.PROVEEDOR }}
          </p>
          <p class="text-caption text-medium-emphasis mb-4">
            Ingresá el identificador de la factura/nota de entrega del proveedor.
          </p>
          <v-text-field
            v-model="identificadorTomar"
            label="Identificador (ej: FAC-00123, NE-456)"
            variant="outlined"
            density="compact"
            hide-details
            autofocus
            @keyup.enter="confirmarTomar"
          />
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialogTomar = false">Cancelar</v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            :loading="tomando"
            :disabled="!identificadorTomar.trim()"
            @click="confirmarTomar"
          >
            Confirmar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Dialog: Cerrar conteo ─────────────────────────────────────────── -->
    <v-dialog v-model="dialogCerrar" max-width="440">
      <v-card rounded="xl">
        <v-card-title class="pa-5 pb-2">
          <v-icon :color="lineasConDiferencia > 0 ? 'warning' : 'success'" class="me-2">
            {{ lineasConDiferencia > 0 ? 'mdi-alert' : 'mdi-check-circle' }}
          </v-icon>
          Cerrar conteo
        </v-card-title>
        <v-card-text class="pa-5 pt-2">
          <v-alert v-if="lineasConDiferencia > 0" type="warning" variant="tonal" rounded="lg" class="mb-3">
            Hay <strong>{{ lineasConDiferencia }} artículo{{ lineasConDiferencia > 1 ? 's' : '' }}</strong>
            con diferencia entre lo pedido y lo contado.
            ¿Querés cerrar de todas formas?
          </v-alert>
          <p v-else class="text-body-2">
            No hay diferencias. El conteo quedará registrado y el pedido se liberará.
          </p>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialogCerrar = false">Cancelar</v-btn>
          <v-btn
            :color="lineasConDiferencia > 0 ? 'warning' : 'success'"
            variant="elevated"
            :loading="cerrando"
            @click="confirmarCerrar"
          >
            {{ lineasConDiferencia > 0 ? 'Cerrar de todas formas' : 'Cerrar' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Dialog: Detalle cerrado ──────────────────────────────────────── -->
    <v-dialog v-model="dialogDetalleCerrado" max-width="700">
      <v-card rounded="xl">
        <v-card-title class="pa-5 pb-2 d-flex align-center gap-2">
          <v-icon color="success">mdi-check-circle</v-icon>
          Pedido cerrado {{ cerradoActual?.NUMSERIE }}-{{ cerradoActual?.NUMPEDIDO }}-{{ cerradoActual?.N }}
        </v-card-title>
        <v-card-subtitle class="px-5 pb-2">
          {{ cerradoActual?.PROVEEDOR }} · {{ cerradoActual?.IDFACTURA }} · {{ cerradoActual?.USUARIO }} · {{ cerradoActual?.FECHA?.slice(0,10) }}
        </v-card-subtitle>
        <v-divider />
        <v-card-text class="pa-0">
          <v-data-table
            :headers="headersCerrado"
            :items="detalleCerrado"
            density="compact"
            :items-per-page="200"
            hide-default-footer
          />
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="dialogDetalleCerrado = false">Cerrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.visible" :color="snackbar.color" :timeout="3500" location="bottom right">
      {{ snackbar.text }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import axios from 'axios';
import { useAuthStore } from '../stores/useAuthStore';

const API = import.meta.env.VITE_API_URL;
const authStore = useAuthStore();

// ── State ────────────────────────────────────────────────────────────────────
const misPedidos      = ref<any[]>([]);
const disponibles     = ref<any[]>([]);
const cerrados        = ref<any[]>([]);
const cargandoMios    = ref(false);
const cargandoDisp    = ref(false);
const cargandoDetalle = ref(false);

const pedidoActual = ref<any | null>(null);
const lineas       = ref<any[]>([]);
const cabeceras    = ref<any[]>([]);
const activeCab    = ref<any | null>(null);
const misConteos   = ref<Record<string, number>>({});

// Dialogs
const dialogTomar        = ref(false);
const pedidoParaTomar    = ref<any | null>(null);
const identificadorTomar = ref('');
const tomando            = ref(false);

const dialogCerrar          = ref(false);
const cerrando              = ref(false);
const dialogDetalleCerrado  = ref(false);
const cerradoActual         = ref<any | null>(null);
const detalleCerrado        = ref<any[]>([]);

// Scanner
const inputScan    = ref('');
const inputScanRef = ref<any>(null);
const ultimoScan   = ref<string | null>(null);
let scanHighlightTimer: ReturnType<typeof setTimeout> | null = null;

const snackbar = ref({ visible: false, text: '', color: 'success' });

let pollingTimer: ReturnType<typeof setInterval> | null = null;
const pollingActivo = ref(false);

// ── Headers ──────────────────────────────────────────────────────────────────
const headersCerrado = [
  { title: 'Código',     key: 'CODARTICULO',      width: 90 },
  { title: 'Descripción',key: 'DESCRIPCION',      sortable: false },
  { title: 'Contadas',   key: 'UNIDADES_CONTADAS', width: 90, align: 'end' as const },
  { title: 'Precio',     key: 'PRECIO',            width: 90, align: 'end' as const },
];

const headers = [
  { title: 'Código',      key: 'CODARTICULO',   width: 100 },
  { title: 'Descripción', key: 'DESCRIPCION',   sortable: false },
  { title: 'Pedidas',     key: 'PEDIDAS',        width: 80,  align: 'end' as const },
  { title: 'Recibidas',  key: 'RECIBIDAS',      width: 85,  align: 'end' as const },
  { title: 'Pendientes', key: 'PENDIENTES',     width: 90,  align: 'end' as const },
  { title: 'Por mí',      key: 'POR_MI',         width: 110, align: 'end' as const, sortable: false },
  { title: 'Total',       key: 'CONTADAS_TOTAL', width: 75,  align: 'end' as const },
  { title: 'Diferencia',  key: 'DIFERENCIA',     width: 95,  align: 'center' as const },
];

// ── Computed ──────────────────────────────────────────────────────────────────
const myCabs = computed(() =>
  cabeceras.value.filter(c => c.USUARIO === authStore.usuario?.usuario)
);

const otrosCabs = computed(() =>
  cabeceras.value.filter(c => c.USUARIO !== authStore.usuario?.usuario)
);

const lineasConConteo = computed(() =>
  lineas.value.map(l => {
    const yo    = misConteos.value[String(l.CODARTICULO)] ?? 0;
    const total = Number(l.CONTADAS_TOTAL) || 0;
    return { ...l, POR_MI: yo, DIFERENCIA: total - l.PENDIENTES };
  })
);

const lineasConDiferencia = computed(() =>
  lineasConConteo.value.filter(l => l.DIFERENCIA !== 0).length
);

const refProveedorMap = computed(() => {
  const m: Record<string, string> = {};
  for (const l of lineas.value) {
    if (l.REFPROVEEDOR?.trim()) m[l.REFPROVEEDOR.trim()] = String(l.CODARTICULO);
  }
  return m;
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function esMismoPedido(a: any, b: any | null) {
  return b && a && a.NUMSERIE === b.NUMSERIE && a.NUMPEDIDO === b.NUMPEDIDO && a.N === b.N;
}
function mostrarSnack(text: string, color = 'success') {
  snackbar.value = { visible: true, text, color };
}

// ── Polling ───────────────────────────────────────────────────────────────────
function iniciarPolling() {
  detenerPolling();
  pollingActivo.value = true;
  pollingTimer = setInterval(cargarLineasSilencioso, 8000);
}
function detenerPolling() {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
  pollingActivo.value = false;
}

// ── Carga de listas ───────────────────────────────────────────────────────────
async function cargarListas() {
  cargandoMios.value = true;
  cargandoDisp.value = true;
  try {
    const [rMios, rDisp, rCerr] = await Promise.all([
      axios.get(`${API}/rechequeo/mios`),
      axios.get(`${API}/rechequeo/disponibles`),
      axios.get(`${API}/rechequeo/cerrados`),
    ]);
    misPedidos.value  = rMios.data.data;
    disponibles.value = rDisp.data.data;
    cerrados.value    = rCerr.data.data;
  } catch {
    mostrarSnack('Error cargando listas', 'error');
  } finally {
    cargandoMios.value = false;
    cargandoDisp.value = false;
  }
}

async function verDetalleCerrado(c: any) {
  cerradoActual.value      = c;
  detalleCerrado.value     = [];
  dialogDetalleCerrado.value = true;
  try {
    const r = await axios.get(`${API}/rechequeo/cerrados/${c.ID}/detalle`);
    detalleCerrado.value = r.data.data;
  } catch {
    mostrarSnack('Error cargando detalle', 'error');
  }
}

// ── Seleccionar mi pedido ─────────────────────────────────────────────────────
async function seleccionarMiPedido(p: any) {
  pedidoActual.value = p;
  activeCab.value    = null;
  misConteos.value   = {};
  ultimoScan.value   = null;
  iniciarPolling();
  await cargarDetalle();
}

async function cargarDetalle() {
  if (!pedidoActual.value) return;
  const { NUMSERIE, NUMPEDIDO, N } = pedidoActual.value;
  cargandoDetalle.value = true;
  try {
    const r = await axios.get(`${API}/rechequeo/pedidos/${NUMSERIE}/${NUMPEDIDO}/${N}`);
    lineas.value     = r.data.lineas;
    cabeceras.value  = r.data.cabeceras ?? [];
    // Set activeCab to first of mine if not already set
    if (!activeCab.value) {
      const primera = myCabs.value[0] ?? null;
      activeCab.value = primera;
      if (primera) await cargarMisConteos(primera.ID);
    }
  } catch {
    mostrarSnack('Error cargando artículos', 'error');
  } finally {
    cargandoDetalle.value = false;
  }
}

async function cargarLineasSilencioso() {
  if (!pedidoActual.value) return;
  const { NUMSERIE, NUMPEDIDO, N } = pedidoActual.value;
  try {
    const r = await axios.get(`${API}/rechequeo/pedidos/${NUMSERIE}/${NUMPEDIDO}/${N}`);
    lineas.value    = r.data.lineas;
    cabeceras.value = r.data.cabeceras ?? [];
  } catch { /* silent */ }
}

async function cargarMisConteos(idcab: number) {
  try {
    const r = await axios.get(`${API}/rechequeo/cabecera/${idcab}/detalles`);
    const mapa: Record<string, number> = {};
    for (const d of r.data.data) mapa[String(d.CODARTICULO)] = Number(d.UNIDADES_CONTADAS);
    misConteos.value = mapa;
  } catch { /* silent */ }
}

async function seleccionarCab(cab: any) {
  activeCab.value = cab;
  misConteos.value = {};
  await cargarMisConteos(cab.ID);
}

// ── Tomar conteo ──────────────────────────────────────────────────────────────
function abrirDialogTomar(p: any) {
  pedidoParaTomar.value    = p;
  identificadorTomar.value = '';
  dialogTomar.value        = true;
}

function abrirDialogTomarActual() {
  if (!pedidoActual.value) return;
  pedidoParaTomar.value    = pedidoActual.value;
  identificadorTomar.value = '';
  dialogTomar.value        = true;
}

async function confirmarTomar() {
  const fac = identificadorTomar.value.trim();
  if (!fac || !pedidoParaTomar.value) return;
  tomando.value = true;
  try {
    const p = pedidoParaTomar.value;
    const r = await axios.post(`${API}/rechequeo/tomar`, {
      numserie: p.NUMSERIE, numpedido: p.NUMPEDIDO, n: p.N, idfactura: fac,
    });
    const newId: number = r.data.id;
    dialogTomar.value = false;
    await cargarListas();

    const miP = misPedidos.value.find((x: any) => esMismoPedido(x, p));
    if (miP) {
      // If already viewing this pedido, just reload detail and switch to new cab
      if (esMismoPedido(pedidoActual.value, p)) {
        await cargarDetalle();
        const nueva = cabeceras.value.find((c: any) => c.ID === newId);
        if (nueva) await seleccionarCab(nueva);
      } else {
        await seleccionarMiPedido(miP);
        const nueva = cabeceras.value.find((c: any) => c.ID === newId);
        if (nueva) await seleccionarCab(nueva);
      }
    }
  } catch (err: any) {
    const msg = err.response?.data?.message ?? 'Error al tomar el pedido';
    mostrarSnack(msg, 'error');
  } finally {
    tomando.value = false;
  }
}

// ── Cerrar conteo ─────────────────────────────────────────────────────────────
function abrirDialogCerrar() {
  dialogCerrar.value = true;
}

async function confirmarCerrar() {
  if (!pedidoActual.value) return;
  cerrando.value = true;
  try {
    await axios.post(`${API}/rechequeo/cerrar`, {
      numserie:   pedidoActual.value.NUMSERIE,
      numpedido:  pedidoActual.value.NUMPEDIDO,
      n:          pedidoActual.value.N,
    });
    dialogCerrar.value = false;
    pedidoActual.value = null;
    activeCab.value    = null;
    cabeceras.value    = [];
    misConteos.value   = {};
    lineas.value       = [];
    detenerPolling();
    await cargarListas();
    mostrarSnack('Conteo cerrado correctamente', 'success');
  } catch (err: any) {
    mostrarSnack(err.response?.data?.message ?? 'Error cerrando conteo', 'error');
  } finally {
    cerrando.value = false;
  }
}

// ── Conteo con debounce ───────────────────────────────────────────────────────
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function actualizarConteo(codarticulo: string, valorRaw: any) {
  if (!activeCab.value) return;
  const unidades = Number(valorRaw) || 0;
  misConteos.value[String(codarticulo)] = unidades;

  clearTimeout(debounceTimers[codarticulo]);
  debounceTimers[codarticulo] = setTimeout(async () => {
    try {
      await axios.post(`${API}/rechequeo/conteo`, { idcab: activeCab.value?.ID, codarticulo, unidades });
      await cargarLineasSilencioso();
    } catch {
      mostrarSnack('Error guardando conteo', 'error');
    }
  }, 600);
}

// ── Scanner ───────────────────────────────────────────────────────────────────
function procesarScan(valor: string) {
  inputScan.value = '';
  const codigo = valor.trim();
  if (!codigo) return;
  const cod = refProveedorMap.value[codigo];
  if (!cod) { mostrarSnack(`No encontrado: ${codigo}`, 'error'); return; }
  const actual = misConteos.value[cod] ?? 0;
  actualizarConteo(cod, actual + 1);
  ultimoScan.value = cod;
  if (scanHighlightTimer) clearTimeout(scanHighlightTimer);
  scanHighlightTimer = setTimeout(() => { ultimoScan.value = null; }, 4000);
  nextTick(() => inputScanRef.value?.focus());
}

onMounted(cargarListas);
onUnmounted(detenerPolling);
</script>

<style scoped>
.rechequeo-tabla :deep(td) { font-size: 0.8125rem; }
.rechequeo-tabla :deep(.v-data-table__td) { padding: 4px 8px; }
.rechequeo-tabla :deep(.fila-escaneada td) {
  background-color: rgba(255, 160, 0, 0.18) !important;
  transition: background-color 0.3s;
}
</style>
