<template>
  <v-container fluid class="pa-4">

    <!-- Header + filtros globales -->
    <v-row align="center" class="mb-4">
      <v-col>
        <div class="text-h6 font-weight-bold">Metas de Vendedores</div>
        <div class="text-caption text-medium-emphasis">Progreso, rankings y gestión de metas mensuales</div>
      </v-col>
      <v-col cols="auto" class="d-flex gap-2 align-center">
        <v-select
          v-model="filtroAnio"
          :items="aniosDisponibles"
          label="Año"
          density="compact"
          variant="outlined"
          hide-details
          style="width:100px"
          @update:model-value="recargar"
        />
        <v-select
          v-model="filtroMes"
          :items="meses"
          item-title="label"
          item-value="valor"
          label="Mes"
          density="compact"
          variant="outlined"
          hide-details
          style="width:130px"
          @update:model-value="recargar"
        />
      </v-col>
    </v-row>

    <!-- Tabs -->
    <v-tabs v-model="tab" color="primary" class="mb-1">
      <v-tab value="progreso" prepend-icon="mdi-chart-line">Progreso</v-tab>
      <v-tab value="rankings" prepend-icon="mdi-trophy">Rankings</v-tab>
      <v-tab value="gestion"  prepend-icon="mdi-table-edit">Gestión</v-tab>
    </v-tabs>
    <v-divider class="mb-4" />

    <v-tabs-window v-model="tab">

      <!-- ══════════════ TAB PROGRESO ══════════════ -->
      <v-tabs-window-item value="progreso">

        <!-- Toggle modo -->
        <v-row class="mb-3" align="center">
          <v-col cols="auto">
            <v-btn-toggle v-model="modo" mandatory density="compact" color="primary" variant="outlined">
              <v-btn value="total" prepend-icon="mdi-cart-check">Todo (sin cancelados)</v-btn>
              <v-btn value="facturado" prepend-icon="mdi-receipt-text-check">Solo facturado</v-btn>
            </v-btn-toggle>
          </v-col>
          <v-spacer />
          <v-col cols="auto">
            <v-btn variant="text" size="small" prepend-icon="mdi-refresh" :loading="cargandoProgreso" @click="cargarProgreso">Actualizar</v-btn>
          </v-col>
        </v-row>

        <!-- KPI chips -->
        <v-row class="mb-4" dense>
          <v-col cols="12" sm="6" md="3">
            <v-card variant="tonal" color="primary" rounded="lg" class="pa-3">
              <div class="text-caption text-medium-emphasis">Vendedores con meta</div>
              <div class="text-h5 font-weight-bold">{{ progreso.length }}</div>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-card variant="tonal" color="success" rounded="lg" class="pa-3">
              <div class="text-caption text-medium-emphasis">Cumplimiento promedio</div>
              <div class="text-h5 font-weight-bold">{{ promedioGeneral }}%</div>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-card variant="tonal" color="warning" rounded="lg" class="pa-3">
              <div class="text-caption text-medium-emphasis">Total vendido</div>
              <div class="text-h5 font-weight-bold">$ {{ fmt(totalVendido) }}</div>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-card variant="tonal" color="deep-orange" rounded="lg" class="pa-3">
              <div class="text-caption text-medium-emphasis">Total meta del mes</div>
              <div class="text-h5 font-weight-bold">$ {{ fmt(totalMeta) }}</div>
            </v-card>
          </v-col>
        </v-row>

        <!-- Tarjetas de progreso por vendedor -->
        <v-row v-if="cargandoProgreso">
          <v-col v-for="i in 3" :key="i" cols="12">
            <v-skeleton-loader type="card" />
          </v-col>
        </v-row>

        <v-row v-else-if="progreso.length === 0">
          <v-col cols="12">
            <v-alert type="info" variant="tonal">No hay metas cargadas para este período.</v-alert>
          </v-col>
        </v-row>

        <v-row v-else dense>
          <v-col v-for="item in progresoOrdenado" :key="item.ID" cols="12">
            <v-card variant="outlined" rounded="lg" class="pa-4">
              <v-row align="center" no-gutters>
                <!-- Posición + nombre -->
                <v-col cols="12" sm="4">
                  <div class="d-flex align-center gap-3">
                    <v-avatar :color="colorPct(pct(item))" size="38">
                      <span class="text-caption font-weight-bold white--text">{{ pct(item) }}%</span>
                    </v-avatar>
                    <div>
                      <div class="font-weight-bold">{{ item.NOMVENDEDOR }}</div>
                      <div class="text-caption text-medium-emphasis">Cód. {{ item.CODVENDEDOR }} · {{ pedidoLabel(item) }}</div>
                    </div>
                    <v-chip v-if="item.CUMPLIDA" color="success" size="x-small" variant="flat" class="ml-1">✓ Cumplida</v-chip>
                  </div>
                </v-col>

                <!-- Barra de progreso -->
                <v-col cols="12" sm="5" class="px-4">
                  <div class="d-flex justify-space-between text-caption mb-1">
                    <span>$ {{ fmt(ventaModo(item)) }}</span>
                    <span class="text-medium-emphasis">Meta: $ {{ fmt(item.META) }}</span>
                  </div>
                  <v-progress-linear
                    :model-value="Math.min(pct(item), 100)"
                    :color="colorPct(pct(item))"
                    bg-color="grey-lighten-3"
                    height="12"
                    rounded
                  />
                  <div v-if="pct(item) > 100" class="text-caption text-success mt-1">
                    +$ {{ fmt(ventaModo(item) - item.META) }} sobre la meta
                  </div>
                </v-col>

                <!-- Números -->
                <v-col cols="12" sm="3" class="text-right">
                  <div class="text-h6 font-weight-bold" :class="`text-${colorPct(pct(item))}`">{{ pct(item) }}%</div>
                  <div class="text-caption text-medium-emphasis">
                    Falta: $ {{ fmt(Math.max(0, item.META - ventaModo(item))) }}
                  </div>
                </v-col>
              </v-row>
            </v-card>
          </v-col>
        </v-row>
      </v-tabs-window-item>

      <!-- ══════════════ TAB RANKINGS ══════════════ -->
      <v-tabs-window-item value="rankings">
        <v-row v-if="progreso.length === 0" class="mt-2">
          <v-col><v-alert type="info" variant="tonal">No hay metas cargadas para este período.</v-alert></v-col>
        </v-row>

        <v-row v-else>
          <!-- Podio top 3 por % meta -->
          <v-col cols="12">
            <div class="text-subtitle-1 font-weight-bold mb-3">
              <v-icon start>mdi-trophy</v-icon> Podio — % de meta alcanzada
            </div>
            <v-row justify="center" align="end" class="mb-6" dense>
              <!-- 2do lugar -->
              <v-col cols="4" sm="3" class="text-center" v-if="top3[1]">
                <v-avatar color="blue-grey" size="52" class="mb-2">
                  <v-icon size="28" color="white">mdi-medal</v-icon>
                </v-avatar>
                <div class="text-body-2 font-weight-medium">{{ top3[1].NOMVENDEDOR }}</div>
                <div class="text-caption text-medium-emphasis">{{ pct(top3[1]) }}%</div>
                <div class="mt-2 rounded-t-lg" :style="`background:var(--v-theme-primary);opacity:.5;height:60px`" />
              </v-col>
              <!-- 1er lugar -->
              <v-col cols="4" sm="3" class="text-center" v-if="top3[0]">
                <v-avatar color="amber-darken-2" size="64" class="mb-2">
                  <v-icon size="36" color="white">mdi-crown</v-icon>
                </v-avatar>
                <div class="text-body-1 font-weight-bold">{{ top3[0].NOMVENDEDOR }}</div>
                <div class="text-caption">{{ pct(top3[0]) }}%</div>
                <div class="mt-2 rounded-t-lg" style="background:#F59E0B;height:90px" />
              </v-col>
              <!-- 3er lugar -->
              <v-col cols="4" sm="3" class="text-center" v-if="top3[2]">
                <v-avatar color="orange-darken-1" size="44" class="mb-2">
                  <v-icon size="24" color="white">mdi-medal-outline</v-icon>
                </v-avatar>
                <div class="text-body-2 font-weight-medium">{{ top3[2].NOMVENDEDOR }}</div>
                <div class="text-caption text-medium-emphasis">{{ pct(top3[2]) }}%</div>
                <div class="mt-2 rounded-t-lg" :style="`background:var(--v-theme-primary);opacity:.35;height:45px`" />
              </v-col>
            </v-row>
          </v-col>

          <!-- Ranking completo por % meta -->
          <v-col cols="12" md="6">
            <v-card variant="outlined" rounded="lg">
              <v-card-title class="text-subtitle-2 pa-3 pb-0">
                <v-icon start size="18" color="primary">mdi-percent</v-icon>
                Ranking por % de meta
              </v-card-title>
              <v-list density="compact">
                <v-list-item
                  v-for="(item, i) in rankingPct"
                  :key="item.ID"
                  :subtitle="`$ ${fmt(ventaModo(item))} / $ ${fmt(item.META)}`"
                >
                  <template #prepend>
                    <span class="text-h6 font-weight-black mr-3 text-medium-emphasis" style="min-width:28px">{{ i+1 }}</span>
                  </template>
                  <template #title>
                    <span class="font-weight-medium">{{ item.NOMVENDEDOR }}</span>
                  </template>
                  <template #append>
                    <v-chip :color="colorPct(pct(item))" size="x-small" variant="flat">{{ pct(item) }}%</v-chip>
                  </template>
                </v-list-item>
              </v-list>
            </v-card>
          </v-col>

          <!-- Ranking por venta absoluta -->
          <v-col cols="12" md="6">
            <v-card variant="outlined" rounded="lg">
              <v-card-title class="text-subtitle-2 pa-3 pb-0">
                <v-icon start size="18" color="success">mdi-currency-usd</v-icon>
                Ranking por monto vendido
              </v-card-title>
              <v-list density="compact">
                <v-list-item
                  v-for="(item, i) in rankingMonto"
                  :key="item.ID"
                  :subtitle="`${pedidoLabel(item)} pedido(s)`"
                >
                  <template #prepend>
                    <span class="text-h6 font-weight-black mr-3 text-medium-emphasis" style="min-width:28px">{{ i+1 }}</span>
                  </template>
                  <template #title>
                    <span class="font-weight-medium">{{ item.NOMVENDEDOR }}</span>
                  </template>
                  <template #append>
                    <span class="text-body-2 font-weight-bold text-success">$ {{ fmt(ventaModo(item)) }}</span>
                  </template>
                </v-list-item>
              </v-list>
            </v-card>
          </v-col>

          <!-- Ranking por número de pedidos -->
          <v-col cols="12" md="6">
            <v-card variant="outlined" rounded="lg">
              <v-card-title class="text-subtitle-2 pa-3 pb-0">
                <v-icon start size="18" color="deep-orange">mdi-cart-arrow-right</v-icon>
                Ranking por cantidad de pedidos
              </v-card-title>
              <v-list density="compact">
                <v-list-item
                  v-for="(item, i) in rankingPedidos"
                  :key="item.ID"
                  :subtitle="`$ ${fmt(ventaModo(item))} vendido`"
                >
                  <template #prepend>
                    <span class="text-h6 font-weight-black mr-3 text-medium-emphasis" style="min-width:28px">{{ i+1 }}</span>
                  </template>
                  <template #title>
                    <span class="font-weight-medium">{{ item.NOMVENDEDOR }}</span>
                  </template>
                  <template #append>
                    <v-chip color="deep-orange" size="x-small" variant="flat">{{ pedidoLabel(item) }} ped.</v-chip>
                  </template>
                </v-list-item>
              </v-list>
            </v-card>
          </v-col>

          <!-- Tabla sin meta (si hay vendedores sin meta ese mes) -->
          <v-col cols="12" md="6">
            <v-card variant="outlined" rounded="lg">
              <v-card-title class="text-subtitle-2 pa-3 pb-0">
                <v-icon start size="18" color="warning">mdi-alert-circle-outline</v-icon>
                Distancia a la meta
              </v-card-title>
              <v-list density="compact">
                <v-list-item
                  v-for="item in rankingDistancia"
                  :key="item.ID"
                  :subtitle="item.META > ventaModo(item) ? `Falta $ ${fmt(item.META - ventaModo(item))}` : 'Meta superada'"
                >
                  <template #title>
                    <span class="font-weight-medium">{{ item.NOMVENDEDOR }}</span>
                  </template>
                  <template #append>
                    <v-chip :color="item.META <= ventaModo(item) ? 'success' : 'warning'" size="x-small" variant="flat">
                      {{ item.META <= ventaModo(item) ? '✓' : `$ ${fmt(item.META - ventaModo(item))}` }}
                    </v-chip>
                  </template>
                </v-list-item>
              </v-list>
            </v-card>
          </v-col>
        </v-row>
      </v-tabs-window-item>

      <!-- ══════════════ TAB GESTIÓN ══════════════ -->
      <v-tabs-window-item value="gestion">
        <v-row class="mb-3" align="center">
          <v-col>
            <v-row dense>
              <v-col cols="12" sm="4">
                <v-select
                  v-model="filtroVendedor"
                  :items="vendedores"
                  :item-title="v => `${v.CODVENDEDOR} — ${v.NOMVENDEDOR}`"
                  item-value="CODVENDEDOR"
                  label="Vendedor"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  @update:model-value="cargarMetas"
                />
              </v-col>
            </v-row>
          </v-col>
          <v-col cols="auto">
            <v-btn color="primary" prepend-icon="mdi-plus" @click="abrirNueva">Nueva Meta</v-btn>
          </v-col>
        </v-row>

        <v-card variant="outlined">
          <v-data-table
            :headers="headers"
            :items="metas"
            :loading="cargandoMetas"
            density="compact"
            no-data-text="No hay metas registradas"
            items-per-page-text="Por página"
          >
            <template #item.MES="{ item }">{{ meses.find(m => m.valor === item.MES)?.label ?? item.MES }}</template>
            <template #item.META="{ item }">$ {{ fmt(item.META) }}</template>
            <template #item.CUMPLIDA="{ item }">
              <v-chip :color="item.CUMPLIDA ? 'success' : 'default'" size="x-small" variant="flat">
                {{ item.CUMPLIDA ? 'Sí' : 'No' }}
              </v-chip>
            </template>
            <template #item.acciones="{ item }">
              <v-btn icon="mdi-pencil" variant="text" size="small" density="compact" @click="abrirEdicion(item)" />
              <v-btn icon="mdi-delete" variant="text" size="small" density="compact" color="error" @click="confirmarEliminar(item)" />
            </template>
          </v-data-table>
        </v-card>
      </v-tabs-window-item>
    </v-tabs-window>

    <!-- Dialog crear/editar -->
    <v-dialog v-model="dialog" max-width="480" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold pa-4">{{ editando ? 'Editar Meta' : 'Nueva Meta' }}</v-card-title>
        <v-card-text class="pt-0">
          <v-row dense>
            <v-col cols="12">
              <v-autocomplete
                v-model="form.codVendedor"
                :items="vendedores"
                :item-title="v => `${v.CODVENDEDOR} — ${v.NOMVENDEDOR}`"
                item-value="CODVENDEDOR"
                :custom-filter="(_, query, item) => {
                  const q = query.toLowerCase();
                  return String(item.raw.CODVENDEDOR).includes(q) || item.raw.NOMVENDEDOR.toLowerCase().includes(q);
                }"
                label="Vendedor *"
                variant="outlined"
                density="compact"
                :disabled="editando"
                clearable
              />
            </v-col>
            <v-col cols="6">
              <v-select v-model="form.anio" :items="aniosDisponibles" label="Año *" variant="outlined" density="compact" :disabled="editando" />
            </v-col>
            <v-col cols="6">
              <v-select v-model="form.mes" :items="meses" item-title="label" item-value="valor" label="Mes *" variant="outlined" density="compact" :disabled="editando" />
            </v-col>
            <v-col cols="12">
              <v-text-field v-model.number="form.meta" label="Meta ($) *" variant="outlined" density="compact" type="number" min="0" prefix="$" />
            </v-col>
            <v-col v-if="editando" cols="12">
              <v-switch v-model="form.cumplida" label="¿Meta cumplida?" color="success" density="compact" hide-details />
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="guardando" @click="guardar">Guardar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Confirm eliminar -->
    <v-dialog v-model="dialogEliminar" max-width="360">
      <v-card>
        <v-card-text class="pt-4">
          ¿Eliminar la meta de <strong>{{ itemAEliminar?.NOMVENDEDOR }}</strong> para
          {{ meses.find(m => m.valor === itemAEliminar?.MES)?.label }} {{ itemAEliminar?.ANIO }}?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialogEliminar = false">Cancelar</v-btn>
          <v-btn color="error" variant="flat" @click="eliminar">Eliminar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" :timeout="3000">{{ snack.text }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';

const API = `${import.meta.env.VITE_API_URL}/metas-vendedor`;

const meses = [
  { valor: 1, label: 'Enero' },   { valor: 2, label: 'Febrero' },  { valor: 3, label: 'Marzo' },
  { valor: 4, label: 'Abril' },   { valor: 5, label: 'Mayo' },      { valor: 6, label: 'Junio' },
  { valor: 7, label: 'Julio' },   { valor: 8, label: 'Agosto' },    { valor: 9, label: 'Septiembre' },
  { valor: 10, label: 'Octubre' },{ valor: 11, label: 'Noviembre' },{ valor: 12, label: 'Diciembre' },
];
const anioActual = new Date().getFullYear();
const mesActual  = new Date().getMonth() + 1;
const aniosDisponibles = Array.from({ length: 5 }, (_, i) => anioActual - 1 + i);

// ── Estado global ──
const tab          = ref('progreso');
const filtroAnio   = ref(anioActual);
const filtroMes    = ref(mesActual);
const modo         = ref<'total' | 'facturado'>('total');

// ── Progreso ──
const progreso         = ref<any[]>([]);
const cargandoProgreso = ref(false);

// ── Gestión ──
const vendedores     = ref<{ CODVENDEDOR: number; NOMVENDEDOR: string }[]>([]);
const metas          = ref<any[]>([]);
const cargandoMetas  = ref(false);
const filtroVendedor = ref<number | null>(null);

// ── Dialogs ──
const dialog        = ref(false);
const editando      = ref(false);
const dialogEliminar = ref(false);
const itemAEliminar  = ref<any>(null);
const guardando      = ref(false);
const form = ref({ codVendedor: null as number | null, anio: anioActual, mes: mesActual, meta: 0, cumplida: false, id: null as number | null });
const snack = ref({ show: false, text: '', color: 'success' });

const headers = [
  { title: 'Vendedor', key: 'NOMVENDEDOR', sortable: true },
  { title: 'Año',      key: 'ANIO',        sortable: true, width: '80px' },
  { title: 'Mes',      key: 'MES',         sortable: true, width: '120px' },
  { title: 'Meta',     key: 'META',        sortable: true, width: '140px' },
  { title: 'Cumplida', key: 'CUMPLIDA',    sortable: true, width: '90px' },
  { title: '',         key: 'acciones',    sortable: false, width: '80px' },
];

// ── Helpers ──
function fmt(v: number) {
  return new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
}
function mostrarSnack(text: string, color = 'success') { snack.value = { show: true, text, color }; }

function ventaModo(item: any): number {
  return modo.value === 'facturado' ? Number(item.VENTA_FACTURADO) : Number(item.VENTA_TOTAL);
}
function pedidoLabel(item: any): number {
  return modo.value === 'facturado' ? Number(item.NUM_FACTURADO) : Number(item.NUM_PEDIDOS);
}
function pct(item: any): number {
  const m = Number(item.META);
  if (!m) return 0;
  return Math.round((ventaModo(item) / m) * 100);
}
function colorPct(p: number): string {
  if (p >= 100) return 'success';
  if (p >= 75)  return 'warning';
  if (p >= 50)  return 'orange';
  return 'error';
}

// ── Computed para progreso ──
const progresoOrdenado = computed(() => [...progreso.value].sort((a, b) => pct(b) - pct(a)));
const totalMeta        = computed(() => progreso.value.reduce((s, i) => s + Number(i.META), 0));
const totalVendido     = computed(() => progreso.value.reduce((s, i) => s + ventaModo(i), 0));
const promedioGeneral  = computed(() => {
  if (!progreso.value.length) return 0;
  return Math.round(progreso.value.reduce((s, i) => s + pct(i), 0) / progreso.value.length);
});

// ── Computed para rankings ──
const rankingPct       = computed(() => [...progreso.value].sort((a, b) => pct(b) - pct(a)));
const rankingMonto     = computed(() => [...progreso.value].sort((a, b) => ventaModo(b) - ventaModo(a)));
const rankingPedidos   = computed(() => [...progreso.value].sort((a, b) => pedidoLabel(b) - pedidoLabel(a)));
const rankingDistancia = computed(() => [...progreso.value].sort((a, b) => (a.META - ventaModo(a)) - (b.META - ventaModo(b))));
const top3             = computed(() => rankingPct.value.slice(0, 3));

// ── Data loaders ──
async function cargarProgreso() {
  cargandoProgreso.value = true;
  try {
    const res = await axios.get(`${API}/progreso`, { params: { anio: filtroAnio.value, mes: filtroMes.value } });
    progreso.value = res.data.data;
  } catch { mostrarSnack('Error al obtener el progreso', 'error'); }
  finally { cargandoProgreso.value = false; }
}

async function cargarVendedores() {
  const res = await axios.get(`${API}/vendedores`);
  vendedores.value = res.data.data;
}

async function cargarMetas() {
  cargandoMetas.value = true;
  try {
    const params: any = { anio: filtroAnio.value, mes: filtroMes.value };
    if (filtroVendedor.value) params.codVendedor = filtroVendedor.value;
    const res = await axios.get(API, { params });
    metas.value = res.data.data;
  } finally { cargandoMetas.value = false; }
}

async function recargar() {
  await Promise.all([cargarProgreso(), cargarMetas()]);
}

// ── CRUD ──
function abrirNueva() {
  editando.value = false;
  form.value = { codVendedor: null, anio: filtroAnio.value, mes: filtroMes.value, meta: 0, cumplida: false, id: null };
  dialog.value = true;
}
function abrirEdicion(item: any) {
  editando.value = true;
  form.value = { codVendedor: item.CODVENDEDOR, anio: item.ANIO, mes: item.MES, meta: item.META, cumplida: !!item.CUMPLIDA, id: item.ID };
  dialog.value = true;
}
async function guardar() {
  if (!form.value.codVendedor || !form.value.anio || !form.value.mes || form.value.meta == null) {
    mostrarSnack('Completá todos los campos requeridos', 'warning'); return;
  }
  guardando.value = true;
  try {
    await axios.post(API, { codVendedor: form.value.codVendedor, anio: form.value.anio, mes: form.value.mes, meta: form.value.meta });
    if (editando.value && form.value.id) await axios.patch(`${API}/${form.value.id}/cumplida`, { cumplida: form.value.cumplida });
    dialog.value = false;
    mostrarSnack('Meta guardada correctamente');
    await recargar();
  } catch { mostrarSnack('Error al guardar la meta', 'error'); }
  finally { guardando.value = false; }
}
function confirmarEliminar(item: any) { itemAEliminar.value = item; dialogEliminar.value = true; }
async function eliminar() {
  await axios.delete(`${API}/${itemAEliminar.value.ID}`);
  dialogEliminar.value = false;
  mostrarSnack('Meta eliminada');
  await recargar();
}

onMounted(async () => {
  await cargarVendedores();
  await recargar();
});
</script>
