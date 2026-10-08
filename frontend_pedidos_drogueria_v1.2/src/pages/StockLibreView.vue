<template>
  <v-container fluid class="pa-6 bg-background h-100">

    <v-card elevation="1" class="rounded-xl mb-4">
      <v-card-text class="d-flex align-center flex-wrap gap-3 pa-4">
        <v-avatar color="primary" size="46" class="flex-shrink-0">
          <v-icon size="24" color="white">mdi-warehouse</v-icon>
        </v-avatar>
        <div class="flex-grow-1">
          <h1 class="text-h6 font-weight-bold">Stock libre y alertas</h1>
          <span class="text-caption text-medium-emphasis">
            Consultá cuánto se puede mover en ICG sin dejar pedidos sin stock
          </span>
        </div>
        <v-chip v-if="resumen.sobregirados > 0" color="error" variant="flat" size="small" class="font-weight-bold">
          {{ resumen.sobregirados }} artículo(s) sobregirado(s)
        </v-chip>
      </v-card-text>
      <v-divider />
      <v-tabs v-model="tab" color="primary" density="comfortable">
        <v-tab value="libre" prepend-icon="mdi-package-variant-closed-check">Stock libre</v-tab>
        <v-tab value="alertas" prepend-icon="mdi-alert-octagon-outline">
          Alertas de sobregiro
          <v-badge v-if="alertasActivas > 0" :content="alertasActivas" color="error" inline class="ml-1" />
        </v-tab>
      </v-tabs>
    </v-card>

    <!-- ── Stock libre ─────────────────────────────────────────────── -->
    <template v-if="tab === 'libre'">
      <v-alert type="info" variant="tonal" density="compact" class="mb-4 rounded-lg">
        <strong>Libre para mover</strong> = stock en {{ almacen }} (ICG) − unidades reservadas por pedidos de la app
        (pendientes por autorizar, en aprobación, autorizados, empacados).
        Antes de un traspaso, venta directa o consumo en ICG, no saques más que lo libre.
      </v-alert>
      <v-card rounded="xl" elevation="2">
        <v-card-text class="d-flex align-center flex-wrap gap-3 pa-4">
          <v-text-field
            v-model="buscar"
            label="Código o descripción"
            prepend-inner-icon="mdi-magnify"
            variant="outlined" density="compact" hide-details clearable
            style="min-width:220px; max-width:320px; flex:1"
            @keyup.enter="recargarLibre"
            @click:clear="() => { buscar = ''; recargarLibre(); }"
          />
          <v-btn
            :variant="soloReservados ? 'flat' : 'outlined'"
            :color="soloReservados ? 'primary' : 'default'"
            size="small" rounded="pill" style="height:36px"
            :prepend-icon="soloReservados ? 'mdi-check' : 'mdi-lock-outline'"
            @click="soloReservados = !soloReservados; recargarLibre()"
          >
            Solo con reservas
          </v-btn>
          <v-spacer />
          <v-btn color="primary" variant="elevated" prepend-icon="mdi-magnify" :loading="cargandoLibre" @click="recargarLibre">
            Buscar
          </v-btn>
        </v-card-text>
        <v-divider />
        <v-data-table-server
          :headers="headersLibre"
          :items="articulos"
          :items-length="totalLibre"
          :loading="cargandoLibre"
          v-model:items-per-page="limitLibre"
          :page="pageLibre"
          :items-per-page-options="[25, 50, 100]"
          density="comfortable"
          @update:options="onOptionsLibre"
        >
          <template v-slot:item.CODARTICULO="{ item }">
            <span class="text-caption text-medium-emphasis">{{ item.CODARTICULO }}</span>
          </template>
          <template v-slot:item.STOCK="{ item }">{{ fmt(item.STOCK) }}</template>
          <template v-slot:item.RESERVADO="{ item }">
            <v-btn v-if="item.PEDIDOS > 0" variant="text" size="small" color="blue-darken-2" @click="verPedidos(item)">
              {{ fmt(item.RESERVADO) }} <span class="text-caption ml-1">({{ item.PEDIDOS }} ped.)</span>
            </v-btn>
            <span v-else class="text-medium-emphasis">0</span>
          </template>
          <template v-slot:item.LIBRE="{ item }">
            <v-chip :color="item.LIBRE < 0 ? 'error' : item.LIBRE === 0 ? 'orange-darken-2' : 'success'"
                    variant="flat" size="small" class="font-weight-bold" style="min-width:64px; justify-content:center">
              {{ fmt(item.LIBRE) }}
            </v-chip>
          </template>
        </v-data-table-server>
      </v-card>
    </template>

    <!-- ── Alertas ─────────────────────────────────────────────────── -->
    <template v-else>
      <v-card rounded="xl" elevation="2">
        <v-card-text class="d-flex align-center flex-wrap gap-3 pa-4">
          <span class="text-body-2 text-medium-emphasis">
            Se revisa automáticamente cada 5 minutos. Una alerta indica que lo reservado por la app superó el stock de ICG:
            se listan los pedidos afectados y los movimientos de ICG de las últimas 24 h que sacaron stock.
          </span>
          <v-spacer />
          <v-btn
            :variant="soloActivas ? 'flat' : 'outlined'"
            :color="soloActivas ? 'error' : 'default'"
            size="small" rounded="pill" style="height:36px"
            :prepend-icon="soloActivas ? 'mdi-check' : 'mdi-history'"
            @click="soloActivas = !soloActivas; cargarAlertas()"
          >
            {{ soloActivas ? 'Solo activas' : 'Todas (historial)' }}
          </v-btn>
          <v-btn color="primary" variant="elevated" prepend-icon="mdi-refresh" :loading="revisando" @click="revisarAhora">
            Revisar ahora
          </v-btn>
        </v-card-text>
        <v-divider />
        <v-data-table
          :headers="headersAlertas"
          :items="alertas"
          :loading="cargandoAlertas"
          density="comfortable"
          :items-per-page="50"
        >
          <template v-slot:no-data>
            <div class="py-8 text-center text-medium-emphasis">
              <v-icon size="40" color="success" class="mb-2">mdi-check-circle-outline</v-icon>
              <div>Sin alertas{{ soloActivas ? ' activas' : '' }}</div>
            </div>
          </template>
          <template v-slot:item.FECHA_DETECCION="{ item }">{{ fecha(item.FECHA_DETECCION) }}</template>
          <template v-slot:item.DESCRIPCION="{ item }">
            <div class="text-body-2">{{ item.DESCRIPCION }}</div>
            <div class="text-caption text-medium-emphasis">cod {{ item.CODARTICULO }}</div>
          </template>
          <template v-slot:item.DEFICIT="{ item }">
            <span class="font-weight-bold text-error">-{{ fmt(item.DEFICIT) }}</span>
            <div v-if="item.DEFICIT_MAXIMO > item.DEFICIT" class="text-caption text-medium-emphasis">máx. -{{ fmt(item.DEFICIT_MAXIMO) }}</div>
          </template>
          <template v-slot:item.RESUELTA="{ item }">
            <v-chip v-if="!item.RESUELTA" color="error" size="small" variant="flat">Activa</v-chip>
            <v-chip v-else color="success" size="small" variant="tonal">Resuelta {{ fecha(item.FECHA_RESOLUCION) }}</v-chip>
          </template>
          <template v-slot:item.ORIGEN="{ item }">
            <span v-if="!item.MOVIMIENTOS.length" class="text-caption text-medium-emphasis">Sin movimientos de ICG en 24 h</span>
            <div v-for="(m, i) in item.MOVIMIENTOS.slice(0, 3)" :key="i" class="text-caption">
              <strong>{{ m.TIPO }}</strong> {{ m.DOCUMENTO }} · {{ fmt(m.UNIDADES) }} u.{{ m.DESTINO ? ` → ${m.DESTINO}` : '' }} · {{ hora(m.MOMENTO) }}
            </div>
            <div v-if="item.MOVIMIENTOS.length > 3" class="text-caption text-medium-emphasis">+{{ item.MOVIMIENTOS.length - 3 }} más</div>
          </template>
          <template v-slot:item.acciones="{ item }">
            <v-btn icon="mdi-text-box-search-outline" variant="text" size="small" color="blue-darken-2" @click="detalle = item" />
          </template>
        </v-data-table>
      </v-card>
    </template>

    <!-- Pedidos que reservan un artículo -->
    <v-dialog v-model="dialogPedidos.mostrar" max-width="720">
      <v-card rounded="xl">
        <v-card-title class="pa-4 text-h6">Pedidos que reservan {{ dialogPedidos.descripcion }}</v-card-title>
        <v-divider />
        <v-card-text class="pa-0">
          <tabla-pedidos :pedidos="dialogPedidos.pedidos" :cargando="dialogPedidos.cargando" />
        </v-card-text>
        <v-card-actions class="pa-4"><v-spacer /><v-btn variant="text" @click="dialogPedidos.mostrar = false">Cerrar</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Detalle de alerta -->
    <v-dialog :model-value="!!detalle" max-width="820" @update:model-value="v => { if (!v) detalle = null; }">
      <v-card v-if="detalle" rounded="xl">
        <v-card-title class="pa-4">
          <div class="text-h6">{{ detalle.DESCRIPCION }}</div>
          <div class="text-caption text-medium-emphasis">
            Stock {{ fmt(detalle.STOCK) }} · reservado {{ fmt(detalle.RESERVADO) }} · déficit {{ fmt(detalle.DEFICIT) }} ·
            detectada {{ fecha(detalle.FECHA_DETECCION) }}
          </div>
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <div class="text-subtitle-2 mb-2">Movimientos de ICG que sacaron stock (24 h previas a la detección)</div>
          <v-table density="compact" class="mb-4">
            <thead><tr><th>Tipo</th><th>Documento</th><th class="text-right">Unidades</th><th>Destino / cliente</th><th>Momento</th></tr></thead>
            <tbody>
              <tr v-if="!detalle.MOVIMIENTOS.length"><td colspan="5" class="text-medium-emphasis text-caption">Ninguno registrado</td></tr>
              <tr v-for="(m, i) in detalle.MOVIMIENTOS" :key="i">
                <td>{{ m.TIPO }}</td><td>{{ m.DOCUMENTO }}</td><td class="text-right">{{ fmt(m.UNIDADES) }}</td>
                <td>{{ m.DESTINO || m.CLIENTE || '—' }}</td><td>{{ fecha(m.MOMENTO) }}</td>
              </tr>
            </tbody>
          </v-table>
          <div class="text-subtitle-2 mb-2">Pedidos con stock reservado {{ detalle.RESUELTA ? '(al momento de la última revisión)' : '' }}</div>
          <tabla-pedidos :pedidos="detalle.PEDIDOS" :cargando="false" />
        </v-card-text>
        <v-card-actions class="pa-4"><v-spacer /><v-btn variant="text" @click="detalle = null">Cerrar</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.mostrar" :color="snack.color" timeout="3500" location="bottom end">{{ snack.texto }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, h, defineComponent, type PropType } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import { VTable } from 'vuetify/components';

const API = `${import.meta.env.VITE_API_URL}/api/stock`;
const route = useRoute();
const almacen = 'ZAV';

const fmtNum = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 });
const fmt = (v: number) => fmtNum.format(Number(v) || 0);
const fecha = (v: string | null) => v ? new Date(v).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const hora = (v: string | null) => v ? new Date(v).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

const snack = ref({ mostrar: false, texto: '', color: 'success' });
const avisar = (texto: string, color = 'success') => { snack.value = { mostrar: true, texto, color }; };

const tab = ref<'libre' | 'alertas'>(route.query['tab'] === 'alertas' ? 'alertas' : 'libre');

// ── Stock libre ──
const buscar = ref('');
const soloReservados = ref(true);
const articulos = ref<any[]>([]);
const totalLibre = ref(0);
const pageLibre = ref(1);
const limitLibre = ref(50);
const cargandoLibre = ref(false);
const resumen = ref({ sobregirados: 0 });

const headersLibre = [
  { title: 'Código', key: 'CODARTICULO', width: 90, sortable: false },
  { title: 'Descripción', key: 'DESCRIPCION', sortable: false },
  { title: `Stock ${almacen} (ICG)`, key: 'STOCK', align: 'end' as const, sortable: false },
  { title: 'Reservado app', key: 'RESERVADO', align: 'end' as const, sortable: false },
  { title: 'Libre para mover', key: 'LIBRE', align: 'center' as const, sortable: false },
];

const cargarLibre = async () => {
  cargandoLibre.value = true;
  try {
    const r = await axios.get(`${API}/libre`, {
      params: { buscar: buscar.value || undefined, soloReservados: soloReservados.value ? '1' : undefined, page: pageLibre.value, limit: limitLibre.value },
    });
    articulos.value = r.data.data;
    totalLibre.value = r.data.total;
    resumen.value.sobregirados = r.data.sobregirados;
  } catch (e: any) {
    avisar(e.response?.data?.message || 'Error al cargar el stock', 'error');
  } finally {
    cargandoLibre.value = false;
  }
};
const recargarLibre = () => { pageLibre.value = 1; cargarLibre(); };
const onOptionsLibre = ({ page, itemsPerPage }: any) => { pageLibre.value = page; limitLibre.value = itemsPerPage; cargarLibre(); };

const dialogPedidos = ref({ mostrar: false, descripcion: '', pedidos: [] as any[], cargando: false });
const verPedidos = async (item: any) => {
  dialogPedidos.value = { mostrar: true, descripcion: item.DESCRIPCION, pedidos: [], cargando: true };
  try {
    const r = await axios.get(`${API}/libre/${item.CODARTICULO}/pedidos`);
    dialogPedidos.value.pedidos = r.data.data;
  } catch {
    avisar('No se pudieron cargar los pedidos', 'error');
  } finally {
    dialogPedidos.value.cargando = false;
  }
};

// ── Alertas ──
const alertas = ref<any[]>([]);
const alertasActivas = ref(0);
const soloActivas = ref(true);
const cargandoAlertas = ref(false);
const revisando = ref(false);
const detalle = ref<any | null>(null);

const headersAlertas = [
  { title: 'Detectada', key: 'FECHA_DETECCION', width: 140, sortable: false },
  { title: 'Artículo', key: 'DESCRIPCION', sortable: false },
  { title: 'Stock', key: 'STOCK', align: 'end' as const, sortable: false },
  { title: 'Reservado', key: 'RESERVADO', align: 'end' as const, sortable: false },
  { title: 'Déficit', key: 'DEFICIT', align: 'end' as const, sortable: false },
  { title: 'Origen probable (ICG)', key: 'ORIGEN', sortable: false },
  { title: 'Estado', key: 'RESUELTA', sortable: false },
  { title: '', key: 'acciones', width: 50, sortable: false },
];

const cargarAlertas = async () => {
  cargandoAlertas.value = true;
  try {
    const r = await axios.get(`${API}/alertas`, { params: { activas: soloActivas.value ? '1' : undefined, limit: 200 } });
    alertas.value = r.data.data;
    alertasActivas.value = r.data.activas;
  } catch (e: any) {
    avisar(e.response?.data?.message || 'Error al cargar alertas', 'error');
  } finally {
    cargandoAlertas.value = false;
  }
};

const revisarAhora = async () => {
  revisando.value = true;
  try {
    const r = await axios.post(`${API}/alertas/revisar`);
    const { nuevas, resueltas } = r.data.resultado;
    avisar(`Revisión hecha: ${nuevas} nueva(s), ${resueltas} resuelta(s)`, nuevas ? 'warning' : 'success');
    await Promise.all([cargarAlertas(), cargarLibre()]);
  } catch (e: any) {
    avisar(e.response?.data?.message || 'Error al revisar', 'error');
  } finally {
    revisando.value = false;
  }
};

onMounted(cargarAlertas);

// Tabla de pedidos reutilizada en los dos diálogos
const TablaPedidos = defineComponent({
  props: { pedidos: { type: Array as PropType<any[]>, required: true }, cargando: Boolean },
  setup(props) {
    return () => props.cargando
      ? h('div', { class: 'pa-6 text-center' }, 'Cargando…')
      : h(VTable, { density: 'compact' }, () => [
          h('thead', h('tr', ['Pedido', 'Estatus', 'Cliente', 'Fecha', 'Cantidad'].map((t, i) =>
            h('th', { class: i === 4 ? 'text-right' : 'text-left' }, t)))),
          h('tbody', props.pedidos.length
            ? props.pedidos.map((p: any) => h('tr', [
                h('td', { class: 'font-weight-medium' }, p.ORDERID),
                h('td', p.ESTATUS),
                h('td', `${p.CLIENTEID} ${p.CLIENTE ?? ''}`),
                h('td', p.FECHA),
                h('td', { class: 'text-right' }, fmt(p.CANTIDAD)),
              ]))
            : [h('tr', h('td', { colspan: 5, class: 'text-medium-emphasis pa-4' }, 'Ningún pedido reserva este artículo'))]),
        ]);
  },
});
</script>
