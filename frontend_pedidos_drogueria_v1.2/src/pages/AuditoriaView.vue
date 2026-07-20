<template>
  <v-container fluid class="pa-6 bg-background h-100">
    <div class="d-flex align-center mb-6">
      <v-icon color="primary" size="32" class="mr-3">mdi-clipboard-text-clock</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black" style="color:#164E63;">Auditoría</h1>
        <span class="text-caption text-medium-emphasis">Historial de acciones por módulo</span>
      </div>
      <v-spacer />
      <v-btn prepend-icon="mdi-refresh" variant="tonal" color="primary" :loading="cargando" @click="cargar">Refrescar</v-btn>
    </div>

    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="pedidos" prepend-icon="mdi-cart">Pedidos</v-tab>
      <v-tab value="rutero"  prepend-icon="mdi-truck-delivery">Rutero</v-tab>
    </v-tabs>

    <!-- ── TAB PEDIDOS ── -->
    <v-window v-model="tab">
      <v-window-item value="pedidos">
        <v-card rounded="xl" elevation="1" class="mb-4 pa-4">
          <div class="d-flex gap-3 align-end flex-wrap">
            <div style="min-width:180px">
              <div class="text-caption text-grey mb-1">N° de Orden</div>
              <v-text-field v-model="filtroOrder" placeholder="Buscar..." variant="outlined" density="compact" hide-details clearable prepend-inner-icon="mdi-pound" @keyup.enter="cargar" />
            </div>
            <div style="min-width:180px">
              <div class="text-caption text-grey mb-1">Usuario</div>
              <v-text-field v-model="filtroUsuario" placeholder="Buscar..." variant="outlined" density="compact" hide-details clearable prepend-inner-icon="mdi-account" @keyup.enter="cargar" />
            </div>
            <v-btn color="primary" variant="tonal" @click="cargar">Buscar</v-btn>
            <v-btn v-if="filtroOrder || filtroUsuario" variant="text" color="grey" @click="limpiarPedidos">Limpiar</v-btn>
          </div>
        </v-card>

        <v-card rounded="xl" elevation="2">
          <v-data-table-server
            :headers="headersPedidos"
            :items="registrosPedidos"
            :items-length="totalPedidos"
            :loading="cargando"
            v-model:items-per-page="itemsPerPage"
            @update:options="onOptions"
            :items-per-page-options="[10, 25, 50, 100, 200]"
          >
            <template v-slot:item.FECHA="{ item }">
              <span class="text-caption">{{ new Date(item.FECHA).toLocaleString('es-VE', { timeZone: brandingStore.zonaHoraria }) }}</span>
            </template>
            <template v-slot:item.EST_ANTERIOR="{ item }">
              <v-chip v-if="item.EST_ANTERIOR" :color="colorEstatus(item.EST_ANTERIOR)" size="x-small" variant="tonal">{{ item.EST_ANTERIOR }}</v-chip>
              <span v-else class="text-caption text-grey">—</span>
            </template>
            <template v-slot:item.EST_NUEVO="{ item }">
              <v-chip :color="colorEstatus(item.EST_NUEVO)" size="x-small" variant="flat" class="font-weight-bold">{{ item.EST_NUEVO }}</v-chip>
            </template>
            <template v-slot:item.USUARIO="{ item }">
              <span class="text-caption">{{ item.USUARIO ?? '—' }}</span>
            </template>
            <template v-slot:item.DETALLES="{ item }">
              <span class="text-caption text-grey">{{ item.DETALLES ?? '' }}</span>
            </template>
          </v-data-table-server>
        </v-card>
      </v-window-item>

      <!-- ── TAB RUTERO ── -->
      <v-window-item value="rutero">
        <v-card rounded="xl" elevation="1" class="mb-4 pa-4">
          <div class="d-flex gap-3 align-end flex-wrap">
            <div style="min-width:240px">
              <div class="text-caption text-grey mb-1">Buscar (usuario, rutero, acción)</div>
              <v-text-field v-model="filtroBuscarRutero" placeholder="Buscar..." variant="outlined" density="compact" hide-details clearable prepend-inner-icon="mdi-magnify" @keyup.enter="cargar" />
            </div>
            <v-btn color="primary" variant="tonal" @click="cargar">Buscar</v-btn>
            <v-btn v-if="filtroBuscarRutero" variant="text" color="grey" @click="limpiarRutero">Limpiar</v-btn>
          </div>
        </v-card>

        <v-card rounded="xl" elevation="2">
          <v-data-table-server
            :headers="headersRutero"
            :items="registrosRutero"
            :items-length="totalRutero"
            :loading="cargando"
            v-model:items-per-page="itemsPerPage"
            @update:options="onOptions"
            :items-per-page-options="[10, 25, 50, 100, 200]"
          >
            <template v-slot:item.FECHA="{ item }">
              <span class="text-caption">{{ new Date(item.FECHA).toLocaleString('es-VE', { timeZone: brandingStore.zonaHoraria }) }}</span>
            </template>
            <template v-slot:item.ACCION="{ item }">
              <v-chip :color="colorAccion(item.ACCION)" size="x-small" variant="tonal">{{ item.ACCION }}</v-chip>
            </template>
            <template v-slot:item.NUMERO_RUTERO="{ item }">
              <span class="text-caption font-weight-medium">{{ item.NUMERO_RUTERO || '—' }}</span>
            </template>
            <template v-slot:item.USUARIO="{ item }">
              <span class="text-caption">{{ item.USUARIO ?? '—' }}</span>
            </template>
            <template v-slot:item.DETALLES="{ item }">
              <span class="text-caption text-grey">{{ item.DETALLES ?? '' }}</span>
            </template>
          </v-data-table-server>
        </v-card>
      </v-window-item>
    </v-window>
  </v-container>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import axios from 'axios';
import { usePageSize } from '../utils/usePageSize';
import { useBrandingStore } from '../stores/useBrandingStore';

const API = import.meta.env.VITE_API_URL;
const brandingStore = useBrandingStore();

const tab          = ref('pedidos');
const cargando     = ref(false);
const itemsPerPage = usePageSize('auditoria', 25);
const pagina       = ref(1);

// Pedidos
const registrosPedidos = ref<any[]>([]);
const totalPedidos     = ref(0);
const filtroOrder      = ref('');
const filtroUsuario    = ref('');

// Rutero
const registrosRutero    = ref<any[]>([]);
const totalRutero        = ref(0);
const filtroBuscarRutero = ref('');

const headersPedidos = [
  { title: 'Fecha',           key: 'FECHA',        sortable: false },
  { title: 'N° Orden',        key: 'ORDERID',      sortable: false },
  { title: 'Estado anterior', key: 'EST_ANTERIOR',  sortable: false },
  { title: 'Estado nuevo',    key: 'EST_NUEVO',     sortable: false },
  { title: 'Usuario',         key: 'USUARIO',       sortable: false },
  { title: 'Detalles',        key: 'DETALLES',      sortable: false },
];

const headersRutero = [
  { title: 'Fecha',   key: 'FECHA',         sortable: false },
  { title: 'Acción',  key: 'ACCION',        sortable: false },
  { title: 'Rutero',  key: 'NUMERO_RUTERO', sortable: false },
  { title: 'Usuario', key: 'USUARIO',       sortable: false },
  { title: 'Detalles',key: 'DETALLES',      sortable: false },
];

const colorEstatus = (est: string) => {
  const map: Record<string, string> = {
    'PENDIENTE': 'blue-grey', 'PENDIENTE POR AUTORIZACION': 'orange',
    'APROBACION PSICOTROPICOS': 'purple', 'AUTORIZADO': 'cyan',
    'EMPACADO': 'teal', 'FINALIZADO': 'green', 'CANCELADO': 'red',
  };
  return map[est] ?? 'grey';
};

const colorAccion = (accion: string) => {
  const map: Record<string, string> = {
    'CREAR': 'green', 'INICIAR_PICKING': 'blue', 'LIBERAR_PICKING': 'orange',
    'CONFIRMAR_FACTURA': 'teal', 'CONFIRMAR_RUTERO': 'green-darken-2',
    'QUITAR_FACTURA': 'red', 'INICIAR_VIAJE': 'purple',
  };
  return map[accion] ?? 'grey';
};

const cargar = async () => {
  cargando.value = true;
  try {
    if (tab.value === 'pedidos') {
      const res = await axios.get(`${API}/pedidos/auditoria`, {
        params: { orderId: filtroOrder.value || undefined, usuario: filtroUsuario.value || undefined, page: pagina.value, limit: itemsPerPage.value },
      });
      if (res.data.success) { registrosPedidos.value = res.data.data; totalPedidos.value = res.data.total; }
    } else {
      const res = await axios.get(`${API}/rutero/auditoria`, {
        params: { buscar: filtroBuscarRutero.value || undefined, page: pagina.value, limit: itemsPerPage.value },
      });
      if (res.data.success) { registrosRutero.value = res.data.data; totalRutero.value = res.data.total; }
    }
  } finally {
    cargando.value = false;
  }
};

const limpiarPedidos = () => { filtroOrder.value = ''; filtroUsuario.value = ''; cargar(); };
const limpiarRutero  = () => { filtroBuscarRutero.value = ''; cargar(); };

const onOptions = (opt: any) => { pagina.value = opt.page; itemsPerPage.value = opt.itemsPerPage; cargar(); };

watch(tab, () => { pagina.value = 1; cargar(); });
</script>
