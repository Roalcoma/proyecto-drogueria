<template>
  <v-container fluid class="pa-6 bg-background">

    <div class="d-flex align-center mb-4">
      <v-icon color="primary" size="32" class="mr-3">mdi-shopping</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black" style="color:#164E63;">Pedidos Ecommerce</h1>
        <span class="text-caption text-medium-emphasis">Pedidos importados desde la integración local</span>
      </div>
      <v-spacer />
      <template v-if="tab === 'pedidos'">
        <v-text-field
          v-model="busqueda"
          placeholder="Buscar pedido, cliente, RIF..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width:280px;"
          class="mr-3"
          @keyup.enter="cargar"
        />
        <v-btn color="primary" variant="tonal" prepend-icon="mdi-refresh" :loading="cargando" @click="cargar">
          Actualizar
        </v-btn>
      </template>
      <template v-else>
        <v-text-field
          v-model="busquedaAud"
          placeholder="Buscar archivo, evento, mensaje..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width:280px;"
          class="mr-3"
          @keyup.enter="cargarAuditoria"
        />
        <v-btn color="primary" variant="tonal" prepend-icon="mdi-refresh" :loading="cargandoAud" @click="cargarAuditoria">
          Actualizar
        </v-btn>
      </template>
    </div>

    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="pedidos" prepend-icon="mdi-cart-outline">Pedidos</v-tab>
      <v-tab value="auditoria" prepend-icon="mdi-clipboard-list-outline">Auditoría</v-tab>
    </v-tabs>

    <v-card v-show="tab === 'pedidos'" rounded="xl" elevation="2">
      <v-data-table-server
        :headers="headers"
        :items="pedidos"
        :items-length="total"
        :loading="cargando"
        @update:options="cargarPagina"
        :items-per-page-options="[10, 25, 50, 100, 200]"
        hover
        class="bg-white"
      >
        <template v-slot:item.NUMERO_PEDIDO="{ item }">
          <span class="font-weight-black text-primary">#{{ item.NUMERO_PEDIDO }}</span>
        </template>

        <template v-slot:item.FECHA="{ item }">
          {{ item.FECHA ? new Date(item.FECHA).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }) : '---' }}
        </template>

        <template v-slot:item.TOTAL="{ item }">
          <MontoDisplay
            :usd="carritoStore.tasa > 0 ? Number(item.TOTAL) / carritoStore.tasa : 0"
            :bs="Number(item.TOTAL)"
            :tasa="carritoStore.tasa"
            main-class="font-weight-bold"
            align-end
          />
        </template>

        <template v-slot:item.PROCESADO="{ item }">
          <v-chip v-if="item.PROCESADO" color="success" size="small" variant="flat" class="font-weight-bold">
            EC-{{ item.NUMERO_PEDIDO }}
          </v-chip>
          <v-tooltip v-else-if="item.MENSAJE_ERROR" :text="item.MENSAJE_ERROR" location="top" max-width="400">
            <template v-slot:activator="{ props }">
              <v-chip v-bind="props" color="error" size="small" variant="flat" class="font-weight-bold" prepend-icon="mdi-alert-circle">
                Error
              </v-chip>
            </template>
          </v-tooltip>
          <v-chip v-else color="warning" size="small" variant="flat" class="font-weight-bold">
            Pendiente
          </v-chip>
        </template>

        <template v-slot:item.acciones="{ item }">
          <v-btn icon="mdi-eye-outline" size="small" variant="text" color="primary" @click="verLineas(item)" />
          <v-btn
            v-if="!item.PROCESADO"
            icon="mdi-check-circle-outline"
            size="small"
            variant="text"
            color="success"
            :loading="aprobando === item.ID"
            @click="aprobar(item)"
          />
        </template>
      </v-data-table-server>
    </v-card>

    <v-card v-show="tab === 'auditoria'" rounded="xl" elevation="2">
      <v-data-table-server
        :headers="headersAud"
        :items="auditoria"
        :items-length="totalAud"
        :loading="cargandoAud"
        @update:options="cargarPaginaAuditoria"
        :items-per-page-options="[25, 50, 100]"
        hover
        class="bg-white"
      >
        <template v-slot:item.EVENTO="{ item }">
          <v-chip :color="EVENTO_COLOR[item.EVENTO] ?? 'default'" size="small" variant="flat" class="font-weight-bold">
            {{ EVENTO_LABEL[item.EVENTO] ?? item.EVENTO }}
          </v-chip>
        </template>
        <template v-slot:item.FECHA="{ item }">
          {{ item.FECHA ? new Date(item.FECHA).toLocaleString('es-VE', { timeZone: 'America/Caracas' }) : '---' }}
        </template>
        <template v-slot:item.ARCHIVO="{ item }">
          <span class="text-caption font-weight-medium">{{ item.ARCHIVO }}</span>
        </template>
      </v-data-table-server>
    </v-card>

    <!-- Modal detalle de líneas -->
    <v-dialog v-model="modalLineas.mostrar" max-width="800">
      <v-card rounded="xl">
        <v-card-title class="bg-primary text-white font-weight-bold d-flex justify-space-between align-center pa-4">
          <span><v-icon start>mdi-cart-outline</v-icon> Pedido #{{ modalLineas.pedido?.NUMERO_PEDIDO }} — {{ modalLineas.pedido?.NOMBRE_CLIENTE }}</span>
          <v-btn icon="mdi-close" variant="text" color="white" @click="modalLineas.mostrar = false" />
        </v-card-title>
        <v-card-text class="pa-4">
          <v-alert v-if="modalLineas.pedido?.MENSAJE_ERROR" type="error" variant="tonal" density="compact" class="mb-4" prepend-icon="mdi-alert-circle">
            <strong>Error de importación:</strong> {{ modalLineas.pedido.MENSAJE_ERROR }}
          </v-alert>
          <div class="mb-4 d-flex flex-wrap gap-4">
            <div><span class="text-caption text-grey">RIF:</span> <strong>{{ modalLineas.pedido?.RIF }}</strong></div>
            <div><span class="text-caption text-grey">Estatus:</span> <strong>{{ modalLineas.pedido?.ESTATUS }}</strong></div>
            <div class="d-flex align-center gap-1"><span class="text-caption text-grey">Total:</span>
              <MontoDisplay
                :usd="carritoStore.tasa > 0 ? Number(modalLineas.pedido?.TOTAL || 0) / carritoStore.tasa : 0"
                :bs="Number(modalLineas.pedido?.TOTAL || 0)"
                :tasa="carritoStore.tasa"
                main-class="font-weight-bold text-body-2"
              />
            </div>
          </div>
          <v-data-table :headers="headersLineas" :items="modalLineas.lineas" :loading="modalLineas.cargando" density="compact">
            <template v-slot:item.PRECIO_UNITARIO="{ item }">
              <MontoDisplay
                :usd="carritoStore.tasa > 0 ? Number(item.PRECIO_UNITARIO) / carritoStore.tasa : 0"
                :bs="Number(item.PRECIO_UNITARIO)"
                :tasa="carritoStore.tasa"
                align-end
              />
            </template>
            <template v-slot:item.subtotal="{ item }">
              <MontoDisplay
                :usd="carritoStore.tasa > 0 ? (Number(item.PRECIO_UNITARIO) * Number(item.CANTIDAD)) / carritoStore.tasa : 0"
                :bs="Number(item.PRECIO_UNITARIO) * Number(item.CANTIDAD)"
                :tasa="carritoStore.tasa"
                align-end
              />
            </template>
          </v-data-table>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" rounded="pill">{{ snack.text }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import axios from 'axios';
import { useCarritoStore } from '../stores/useCarritoStore';
import MontoDisplay from '../components/MontoDisplay.vue';

const carritoStore = useCarritoStore();
const API = `${import.meta.env.VITE_API_URL}/ecommerce`;

const tab = ref('pedidos');

const busqueda = ref('');
const pedidos  = ref<any[]>([]);
const total    = ref(0);
const cargando = ref(false);
const pagina   = ref(1);
const porPagina = ref(10);
const snack    = ref({ show: false, text: '', color: 'success' });
const aprobando = ref<number | null>(null);

// Auditoría
const busquedaAud  = ref('');
const auditoria    = ref<any[]>([]);
const totalAud     = ref(0);
const cargandoAud  = ref(false);
const paginaAud    = ref(1);
const porPaginaAud = ref(25);

const EVENTO_COLOR: Record<string, string> = {
  APROBADO:         'success',
  YA_APROBADO:      'info',
  DUPLICADO:        'warning',
  CARRERA:          'warning',
  PARSE_ERROR:      'error',
  ERROR_APROBACION: 'error',
  ERROR_CRITICO:    'error',
};
const EVENTO_LABEL: Record<string, string> = {
  APROBADO:         'Aprobado',
  YA_APROBADO:      'Ya procesado',
  DUPLICADO:        'Duplicado',
  CARRERA:          'Cond. carrera',
  PARSE_ERROR:      'Error parseo',
  ERROR_APROBACION: 'Error aprobación',
  ERROR_CRITICO:    'Error crítico',
};

const headers = [
  { title: 'N° Pedido',  key: 'NUMERO_PEDIDO' },
  { title: 'Cliente',    key: 'NOMBRE_CLIENTE' },
  { title: 'RIF',        key: 'RIF',         sortable: false },
  { title: 'Fecha',      key: 'FECHA' },
  { title: 'Estatus',    key: 'ESTATUS',     sortable: false },
  { title: 'Total',      key: 'TOTAL',       align: 'end' as const },
  { title: 'Estado',     key: 'PROCESADO',   sortable: false },
  { title: '',           key: 'acciones',    sortable: false },
];

const headersLineas = [
  { title: 'Código',      key: 'COD_ARTICULO' },
  { title: 'Descripción', key: 'DESCRIPCION' },
  { title: 'Cant.',       key: 'CANTIDAD', align: 'center' as const },
  { title: 'Precio',      key: 'PRECIO_UNITARIO', align: 'end' as const },
  { title: 'Subtotal',    key: 'subtotal',         align: 'end' as const, sortable: false },
];

const headersAud = [
  { title: 'Archivo',  key: 'ARCHIVO',  sortable: false },
  { title: 'Fecha',    key: 'FECHA' },
  { title: 'Evento',   key: 'EVENTO',   sortable: false },
  { title: 'Pedido',   key: 'ORDERID',  sortable: false },
  { title: 'Mensaje',  key: 'MENSAJE',  sortable: false },
];

const modalLineas = ref({ mostrar: false, pedido: null as any, lineas: [] as any[], cargando: false });

const cargar = async () => {
  cargando.value = true;
  try {
    const res = await axios.get(`${API}/pedidos`, {
      params: { search: busqueda.value, page: pagina.value, limit: porPagina.value }
    });
    if (res.data.success) { pedidos.value = res.data.data; total.value = res.data.total; }
  } catch { mostrarSnack('Error al cargar pedidos', 'error'); }
  finally { cargando.value = false; }
};

const cargarPagina = (opt: any) => {
  pagina.value = opt.page;
  porPagina.value = opt.itemsPerPage;
  cargar();
};

const verLineas = async (item: any) => {
  modalLineas.value = { mostrar: true, pedido: item, lineas: [], cargando: true };
  try {
    const res = await axios.get(`${API}/pedidos/${item.ID}/lineas`);
    if (res.data.success) modalLineas.value.lineas = res.data.data;
  } catch { mostrarSnack('Error al cargar líneas', 'error'); }
  finally { modalLineas.value.cargando = false; }
};

const aprobar = async (item: any) => {
  aprobando.value = item.ID;
  try {
    const res = await axios.post(`${API}/pedidos/${item.ID}/aprobar`);
    if (res.data.success) {
      item.PROCESADO = true;
      mostrarSnack(res.data.message, 'success');
    } else {
      mostrarSnack(res.data.message, 'error');
    }
  } catch (e: any) {
    mostrarSnack(e.response?.data?.message ?? 'Error al aprobar', 'error');
  } finally {
    aprobando.value = null;
  }
};

const mostrarSnack = (text: string, color = 'success') => { snack.value = { show: true, text, color }; };

const cargarAuditoria = async () => {
  cargandoAud.value = true;
  try {
    const res = await axios.get(`${API}/auditoria`, {
      params: { search: busquedaAud.value, page: paginaAud.value, limit: porPaginaAud.value }
    });
    if (res.data.success) { auditoria.value = res.data.data; totalAud.value = res.data.total; }
  } catch { mostrarSnack('Error al cargar auditoría', 'error'); }
  finally { cargandoAud.value = false; }
};

const cargarPaginaAuditoria = (opt: any) => {
  paginaAud.value = opt.page;
  porPaginaAud.value = opt.itemsPerPage;
  cargarAuditoria();
};

watch(tab, (val) => { if (val === 'auditoria' && !auditoria.value.length) cargarAuditoria(); });

</script>
