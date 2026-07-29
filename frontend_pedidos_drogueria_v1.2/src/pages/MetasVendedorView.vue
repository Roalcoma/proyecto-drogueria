<template>
  <v-container fluid class="metas-dashboard pa-4">

    <!-- ── Header ── -->
    <div class="dash-header mb-4">
      <div class="d-flex justify-space-between align-center flex-wrap gap-3">
        <div>
          <div class="dash-title">Metas de Vendedores</div>
          <div class="dash-subtitle">Progreso, rankings y gestión de metas mensuales</div>
        </div>
        <div class="d-flex gap-2 align-center">
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
            style="width:140px"
            @update:model-value="recargar"
          />
        </div>
      </div>
    </div>

    <!-- ── Tabs ── -->
    <v-tabs v-model="tab" color="primary" class="dash-tabs mb-1">
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

        <!-- KPI cards -->
        <v-row class="mb-4" dense>
          <v-col cols="12" sm="6" md="3">
            <div class="kpi-card kpi-primary">
              <div class="kpi-icon-wrap"><v-icon size="20" color="white">mdi-account-group</v-icon></div>
              <div class="kpi-number">{{ progreso.length }}</div>
              <div class="kpi-label">Vendedores con meta</div>
            </div>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <div class="kpi-card kpi-success">
              <div class="kpi-icon-wrap"><v-icon size="20" color="white">mdi-percent-circle</v-icon></div>
              <div class="kpi-number">{{ promedioGeneral }}%</div>
              <div class="kpi-label">Cumplimiento promedio</div>
            </div>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <div class="kpi-card kpi-accent">
              <div class="kpi-icon-wrap"><v-icon size="20" color="white">mdi-currency-usd</v-icon></div>
              <div class="kpi-number kpi-money">$ {{ fmt(totalVendido) }}</div>
              <div class="kpi-label">Total vendido</div>
            </div>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <div class="kpi-card kpi-muted">
              <div class="kpi-icon-wrap kpi-icon-dark"><v-icon size="20" color="white">mdi-target</v-icon></div>
              <div class="kpi-number kpi-money kpi-dark">$ {{ fmt(totalMeta) }}</div>
              <div class="kpi-label">Total meta del mes</div>
            </div>
          </v-col>
        </v-row>

        <!-- Tarjetas de progreso por vendedor -->
        <v-row v-if="cargandoProgreso">
          <v-col v-for="i in 4" :key="i" cols="12">
            <v-skeleton-loader type="list-item-two-line" />
          </v-col>
        </v-row>

        <v-row v-else-if="progreso.length === 0">
          <v-col cols="12">
            <v-alert type="info" variant="tonal">No hay metas cargadas para este período.</v-alert>
          </v-col>
        </v-row>

        <div v-else class="progress-list">
          <div
            v-for="(item, idx) in progresoOrdenado"
            :key="item.ID"
            class="progress-card"
            :class="borderColorClass(pct(item))"
          >
            <!-- rank + nombre + chip -->
            <div class="d-flex align-center gap-3">
              <span class="rank-badge" :class="rankClass(idx)">{{ idx + 1 }}</span>
              <div class="flex-grow-1">
                <div class="d-flex align-center gap-2 flex-wrap">
                  <span class="prog-name">{{ item.NOMVENDEDOR }}</span>
                  <v-chip v-if="item.CUMPLIDA" color="success" size="x-small" variant="flat">✓ Cumplida</v-chip>
                </div>
                <div class="prog-sub">Cód. {{ item.CODVENDEDOR }} · {{ pedidoLabel(item) }} pedido(s)</div>
              </div>
              <div class="text-right">
                <div class="prog-pct" :class="pctColorClass(pct(item))">{{ pct(item) }}%</div>
                <div class="prog-falta" v-if="pct(item) < 100">
                  Falta&nbsp;<span class="mono">$ {{ fmt(Math.max(0, item.META - ventaModo(item))) }}</span>
                </div>
                <div class="prog-sobre text-success" v-else>
                  +$ {{ fmt(ventaModo(item) - item.META) }}
                </div>
              </div>
            </div>

            <!-- barra -->
            <div class="prog-bar-row mt-2">
              <div class="d-flex justify-space-between text-caption mb-1">
                <span class="mono font-weight-medium">$ {{ fmt(ventaModo(item)) }}</span>
                <span class="prog-meta">Meta&nbsp;<span class="mono">$ {{ fmt(item.META) }}</span></span>
              </div>
              <v-progress-linear
                :model-value="Math.min(pct(item), 100)"
                :color="colorPct(pct(item))"
                bg-color="#E9EEF6"
                height="8"
                rounded
              />
            </div>
          </div>
        </div>

      </v-tabs-window-item>

      <!-- ══════════════ TAB RANKINGS ══════════════ -->
      <v-tabs-window-item value="rankings">
        <v-row v-if="progreso.length === 0" class="mt-2">
          <v-col><v-alert type="info" variant="tonal">No hay metas cargadas para este período.</v-alert></v-col>
        </v-row>

        <v-row v-else>
          <!-- Podio top 3 -->
          <v-col cols="12">
            <div class="section-label mb-3">
              <v-icon start size="16">mdi-trophy</v-icon> Podio — % de meta alcanzada
            </div>
            <div class="podium-row mb-6">
              <!-- 2do lugar -->
              <div v-if="top3[1]" class="podium-slot podium-2">
                <div class="podium-avatar podium-silver">
                  <v-icon size="22" color="white">mdi-medal</v-icon>
                </div>
                <div class="podium-name">{{ top3[1].NOMVENDEDOR }}</div>
                <div class="podium-pct">{{ pct(top3[1]) }}%</div>
                <div class="podium-bar" style="height:60px;background:#CBD5E1" />
              </div>
              <!-- 1er lugar -->
              <div v-if="top3[0]" class="podium-slot podium-1">
                <div class="podium-crown">
                  <v-icon size="18" color="#D97706">mdi-crown</v-icon>
                </div>
                <div class="podium-avatar podium-gold">
                  <v-icon size="28" color="white">mdi-trophy</v-icon>
                </div>
                <div class="podium-name font-weight-bold">{{ top3[0].NOMVENDEDOR }}</div>
                <div class="podium-pct podium-pct-gold">{{ pct(top3[0]) }}%</div>
                <div class="podium-bar" style="height:90px;background:#D97706" />
              </div>
              <!-- 3er lugar -->
              <div v-if="top3[2]" class="podium-slot podium-3">
                <div class="podium-avatar podium-bronze">
                  <v-icon size="18" color="white">mdi-medal-outline</v-icon>
                </div>
                <div class="podium-name">{{ top3[2].NOMVENDEDOR }}</div>
                <div class="podium-pct">{{ pct(top3[2]) }}%</div>
                <div class="podium-bar" style="height:42px;background:#B45309" />
              </div>
            </div>
          </v-col>

          <!-- Ranking por % -->
          <v-col cols="12" md="6">
            <div class="rank-card">
              <div class="rank-card-title">
                <v-icon size="15" color="#1E40AF">mdi-percent</v-icon>
                Ranking por % de meta
              </div>
              <div
                v-for="(item, i) in rankingPct"
                :key="item.ID"
                class="rank-row"
              >
                <span class="rank-num" :class="rankClass(i)">{{ i+1 }}</span>
                <div class="flex-grow-1">
                  <div class="rank-vend">{{ item.NOMVENDEDOR }}</div>
                  <div class="rank-detail mono">$ {{ fmt(ventaModo(item)) }} / $ {{ fmt(item.META) }}</div>
                </div>
                <v-chip :color="colorPct(pct(item))" size="x-small" variant="flat">{{ pct(item) }}%</v-chip>
              </div>
            </div>
          </v-col>

          <!-- Ranking por monto -->
          <v-col cols="12" md="6">
            <div class="rank-card">
              <div class="rank-card-title">
                <v-icon size="15" color="#059669">mdi-currency-usd</v-icon>
                Ranking por monto vendido
              </div>
              <div
                v-for="(item, i) in rankingMonto"
                :key="item.ID"
                class="rank-row"
              >
                <span class="rank-num" :class="rankClass(i)">{{ i+1 }}</span>
                <div class="flex-grow-1">
                  <div class="rank-vend">{{ item.NOMVENDEDOR }}</div>
                  <div class="rank-detail">{{ pedidoLabel(item) }} pedido(s)</div>
                </div>
                <span class="mono font-weight-bold" style="color:#059669">$ {{ fmt(ventaModo(item)) }}</span>
              </div>
            </div>
          </v-col>

          <!-- Ranking por pedidos -->
          <v-col cols="12" md="6">
            <div class="rank-card">
              <div class="rank-card-title">
                <v-icon size="15" color="#D97706">mdi-cart-arrow-right</v-icon>
                Ranking por cantidad de pedidos
              </div>
              <div
                v-for="(item, i) in rankingPedidos"
                :key="item.ID"
                class="rank-row"
              >
                <span class="rank-num" :class="rankClass(i)">{{ i+1 }}</span>
                <div class="flex-grow-1">
                  <div class="rank-vend">{{ item.NOMVENDEDOR }}</div>
                  <div class="rank-detail mono">$ {{ fmt(ventaModo(item)) }} vendido</div>
                </div>
                <v-chip color="warning" size="x-small" variant="flat">{{ pedidoLabel(item) }} ped.</v-chip>
              </div>
            </div>
          </v-col>

          <!-- Distancia a la meta -->
          <v-col cols="12" md="6">
            <div class="rank-card">
              <div class="rank-card-title">
                <v-icon size="15" color="#DC2626">mdi-flag-checkered</v-icon>
                Distancia a la meta
              </div>
              <div
                v-for="item in rankingDistancia"
                :key="item.ID"
                class="rank-row"
              >
                <div class="flex-grow-1">
                  <div class="rank-vend">{{ item.NOMVENDEDOR }}</div>
                  <div class="rank-detail">
                    {{ item.META > ventaModo(item) ? `Falta $ ${fmt(item.META - ventaModo(item))}` : 'Meta superada' }}
                  </div>
                </div>
                <v-chip :color="item.META <= ventaModo(item) ? 'success' : 'error'" size="x-small" variant="flat">
                  {{ item.META <= ventaModo(item) ? '✓' : `$ ${fmt(item.META - ventaModo(item))}` }}
                </v-chip>
              </div>
            </div>
          </v-col>
        </v-row>
      </v-tabs-window-item>

      <!-- ══════════════ TAB GESTIÓN ══════════════ -->
      <v-tabs-window-item value="gestion">
        <!-- Toolbar -->
        <div class="gestion-toolbar mb-4">
          <div class="d-flex align-center gap-3 flex-wrap">
            <v-icon color="#1E40AF" size="18">mdi-filter-variant</v-icon>
            <v-autocomplete
              v-model="filtroVendedor"
              :items="vendedores"
              :item-title="v => `${v.CODVENDEDOR} — ${v.NOMVENDEDOR}`"
              item-value="CODVENDEDOR"
              :custom-filter="(_, query, item) => {
                const q = query.toLowerCase();
                return String(item.raw.CODVENDEDOR).includes(q) || item.raw.NOMVENDEDOR.toLowerCase().includes(q);
              }"
              label="Filtrar por vendedor"
              density="compact"
              variant="outlined"
              hide-details
              clearable
              style="max-width:320px"
              @update:model-value="cargarMetas"
            />
            <v-spacer />
            <v-btn color="primary" variant="flat" prepend-icon="mdi-plus" @click="abrirNueva">
              Nueva Meta
            </v-btn>
          </div>
        </div>

        <!-- Tabla -->
        <div class="gestion-table-wrap">
          <v-data-table
            :headers="headers"
            :items="metas"
            :loading="cargandoMetas"
            density="comfortable"
            no-data-text="No hay metas registradas para este período"
            items-per-page-text="Por página"
            class="gestion-table"
          >
            <template #item.NOMVENDEDOR="{ item }">
              <span class="gestion-vend-name">{{ item.NOMVENDEDOR }}</span>
              <span class="gestion-vend-cod"> · {{ item.CODVENDEDOR }}</span>
            </template>
            <template #item.MES="{ item }">{{ meses.find(m => m.valor === item.MES)?.label ?? item.MES }}</template>
            <template #item.META="{ item }">
              <span class="mono font-weight-medium">$ {{ fmt(item.META) }}</span>
            </template>
            <template #item.CUMPLIDA="{ item }">
              <v-chip
                :color="item.CUMPLIDA ? 'success' : 'default'"
                :variant="item.CUMPLIDA ? 'flat' : 'outlined'"
                size="small"
                :loading="toggling === item.ID"
                style="cursor:pointer"
                @click="toggleCumplida(item)"
              >
                <v-icon start size="14">{{ item.CUMPLIDA ? 'mdi-check-circle' : 'mdi-circle-outline' }}</v-icon>
                {{ item.CUMPLIDA ? 'Cumplida' : 'Pendiente' }}
              </v-chip>
            </template>
            <template #item.acciones="{ item }">
              <v-btn icon="mdi-pencil" variant="text" size="small" density="compact" @click="abrirEdicion(item)" />
              <v-btn icon="mdi-delete" variant="text" size="small" density="compact" color="error" @click="confirmarEliminar(item)" />
            </template>
          </v-data-table>
        </div>
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
const toggling       = ref<number | null>(null);
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
function borderColorClass(p: number): string {
  if (p >= 100) return 'border-success';
  if (p >= 75)  return 'border-warning';
  if (p >= 50)  return 'border-orange';
  return 'border-error';
}
function pctColorClass(p: number): string {
  if (p >= 100) return 'pct-success';
  if (p >= 75)  return 'pct-warning';
  if (p >= 50)  return 'pct-orange';
  return 'pct-error';
}
function rankClass(i: number): string {
  if (i === 0) return 'rank-gold';
  if (i === 1) return 'rank-silver';
  if (i === 2) return 'rank-bronze';
  return '';
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
async function toggleCumplida(item: any) {
  toggling.value = item.ID;
  try {
    const nueva = !item.CUMPLIDA;
    await axios.patch(`${API}/${item.ID}/cumplida`, { cumplida: nueva });
    item.CUMPLIDA = nueva;
    mostrarSnack(nueva ? 'Meta marcada como cumplida' : 'Meta desmarcada');
  } catch { mostrarSnack('Error al actualizar la meta', 'error'); }
  finally { toggling.value = null; }
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

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Fira+Sans:wght@400;500;600;700&display=swap');

/* ── Design tokens ── */
.metas-dashboard {
  --c-primary:  #1E40AF;
  --c-accent:   #D97706;
  --c-success:  #059669;
  --c-warning:  #D97706;
  --c-danger:   #DC2626;
  --c-orange:   #EA580C;
  --c-muted:    #E9EEF6;
  --c-bg:       #F8FAFC;
  --c-border:   #E2E8F0;
  --c-text:     #0F172A;
  --c-sub:      #64748B;
  font-family: 'Fira Sans', 'Segoe UI', sans-serif;
}

/* ── Header ── */
.dash-header {
  border-left: 4px solid var(--c-primary);
  padding-left: 12px;
}
.dash-title {
  font-family: 'Fira Sans', sans-serif;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--c-primary);
  letter-spacing: -0.01em;
  line-height: 1.2;
}
.dash-subtitle {
  font-size: 0.8rem;
  color: var(--c-sub);
  margin-top: 2px;
}

/* ── KPI cards ── */
.kpi-card {
  border-radius: 10px;
  padding: 14px 16px;
  position: relative;
  overflow: hidden;
  transition: transform 150ms ease, box-shadow 150ms ease;
  cursor: default;
}
.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.12);
}
.kpi-primary { background: var(--c-primary); }
.kpi-success { background: var(--c-success); }
.kpi-accent  { background: var(--c-accent);  }
.kpi-muted   { background: #334155;          }

.kpi-icon-wrap {
  position: absolute;
  top: 12px;
  right: 14px;
  opacity: 0.6;
}
.kpi-number {
  font-family: 'Fira Code', monospace;
  font-size: 2rem;
  font-weight: 600;
  color: white;
  line-height: 1.1;
  margin-top: 20px;
}
.kpi-money { font-size: 1.35rem; }
.kpi-label {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.75);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-top: 4px;
}

/* ── Progress list ── */
.progress-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.progress-card {
  background: white;
  border: 1px solid var(--c-border);
  border-left-width: 4px;
  border-radius: 8px;
  padding: 12px 16px;
  transition: background 150ms, box-shadow 150ms;
}
.progress-card:hover {
  background: var(--c-bg);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.border-success { border-left-color: var(--c-success) !important; }
.border-warning { border-left-color: var(--c-warning) !important; }
.border-orange  { border-left-color: var(--c-orange)  !important; }
.border-error   { border-left-color: var(--c-danger)  !important; }

.rank-badge {
  font-family: 'Fira Code', monospace;
  font-size: 1.4rem;
  font-weight: 700;
  color: #CBD5E1;
  min-width: 36px;
  text-align: center;
  flex-shrink: 0;
}
.rank-gold   { color: #D97706; }
.rank-silver { color: #64748B; }
.rank-bronze { color: #B45309; }

.prog-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--c-text);
}
.prog-sub {
  font-size: 0.75rem;
  color: var(--c-sub);
  margin-top: 1px;
}
.prog-pct {
  font-family: 'Fira Code', monospace;
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1;
}
.pct-success { color: var(--c-success); }
.pct-warning { color: var(--c-warning); }
.pct-orange  { color: var(--c-orange);  }
.pct-error   { color: var(--c-danger);  }

.prog-falta, .prog-sobre {
  font-size: 0.7rem;
  color: var(--c-sub);
  white-space: nowrap;
}
.prog-sobre { color: var(--c-success) !important; }
.prog-meta {
  font-size: 0.75rem;
  color: var(--c-sub);
}
.prog-bar-row { padding-top: 4px; }

/* ── Section label ── */
.section-label {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--c-sub);
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── Podium ── */
.podium-row {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 8px;
}
.podium-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 0 0 120px;
}
.podium-1 { flex-basis: 140px; }

.podium-crown {
  margin-bottom: 4px;
}
.podium-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}
.podium-1 .podium-avatar { width: 64px; height: 64px; }
.podium-gold   { background: #D97706; }
.podium-silver { background: #94A3B8; }
.podium-bronze { background: #B45309; }

.podium-name {
  font-size: 0.8rem;
  font-weight: 600;
  text-align: center;
  color: var(--c-text);
  line-height: 1.3;
}
.podium-pct {
  font-family: 'Fira Code', monospace;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--c-sub);
  margin: 2px 0 6px;
}
.podium-pct-gold { color: #D97706; }
.podium-bar {
  width: 100%;
  border-radius: 4px 4px 0 0;
}

/* ── Ranking cards ── */
.rank-card {
  border: 1px solid var(--c-border);
  border-radius: 10px;
  overflow: hidden;
  background: white;
}
.rank-card-title {
  padding: 10px 14px;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--c-sub);
  background: var(--c-bg);
  border-bottom: 1px solid var(--c-border);
  display: flex;
  align-items: center;
  gap: 6px;
}
.rank-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  border-bottom: 1px solid #F1F5F9;
  transition: background 150ms;
}
.rank-row:last-child { border-bottom: none; }
.rank-row:hover { background: var(--c-bg); }

.rank-num {
  font-family: 'Fira Code', monospace;
  font-size: 1rem;
  font-weight: 700;
  color: #CBD5E1;
  min-width: 24px;
  text-align: center;
}
.rank-vend {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--c-text);
}
.rank-detail {
  font-size: 0.72rem;
  color: var(--c-sub);
}

/* ── Gestión tab ── */
.gestion-toolbar {
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: 10px;
  padding: 12px 16px;
}
.gestion-table-wrap {
  border: 1px solid var(--c-border);
  border-radius: 10px;
  overflow: hidden;
}
.gestion-table :deep(thead tr th) {
  font-family: 'Fira Sans', sans-serif;
  font-size: 0.72rem !important;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--c-sub) !important;
  background: var(--c-bg) !important;
  border-bottom: 1px solid var(--c-border) !important;
}
.gestion-table :deep(tbody tr:hover td) {
  background: var(--c-bg);
}
.gestion-table :deep(tbody tr td) {
  border-bottom: 1px solid #F1F5F9 !important;
  font-size: 0.85rem;
}
.gestion-vend-name {
  font-weight: 600;
  color: var(--c-text);
}
.gestion-vend-cod {
  font-family: 'Fira Code', monospace;
  font-size: 0.75rem;
  color: var(--c-sub);
}
.gestion-cumplida-label {
  font-size: 0.78rem;
  font-weight: 500;
}

/* ── Misc ── */
.mono {
  font-family: 'Fira Code', monospace;
}
</style>
