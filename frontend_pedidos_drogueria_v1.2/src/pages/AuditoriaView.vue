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
      <v-tab value="pedidos"  prepend-icon="mdi-cart">Pedidos</v-tab>
      <v-tab value="rutero"   prepend-icon="mdi-truck-delivery">Rutero</v-tab>
      <v-tab value="grupos"   prepend-icon="mdi-account-group">Grupos / Clientes</v-tab>
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
            <template v-slot:item.diff_accion="{ item }">
              <v-btn v-if="item.EST_NUEVO === 'EDITADO' && item.SNAPSHOT_ANTES" icon="mdi-compare" size="x-small" variant="tonal" color="orange" title="Ver cambios del pedido" @click="abrirDiff(item)" />
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

      <!-- ── TAB GRUPOS / CLIENTES ── -->
      <v-window-item value="grupos">
        <v-card rounded="xl" elevation="1" class="mb-4 pa-4">
          <div class="d-flex gap-3 align-end flex-wrap">
            <div style="min-width:240px">
              <div class="text-caption text-grey mb-1">Buscar (usuario, detalle)</div>
              <v-text-field v-model="filtroBuscarGrupos" placeholder="Buscar..." variant="outlined" density="compact" hide-details clearable prepend-inner-icon="mdi-magnify" @keyup.enter="cargar" />
            </div>
            <v-btn color="primary" variant="tonal" @click="cargar">Buscar</v-btn>
            <v-btn v-if="filtroBuscarGrupos" variant="text" color="grey" @click="limpiarGrupos">Limpiar</v-btn>
          </div>
        </v-card>
        <v-card rounded="xl" elevation="2">
          <v-data-table-server
            :headers="headersGrupos"
            :items="registrosGrupos"
            :items-length="totalGrupos"
            :loading="cargando"
            v-model:items-per-page="itemsPerPage"
            @update:options="onOptions"
            :items-per-page-options="[10, 25, 50, 100, 200]"
          >
            <template v-slot:item.FECHA="{ item }">
              <span class="text-caption">{{ new Date(item.FECHA).toLocaleString('es-VE', { timeZone: brandingStore.zonaHoraria }) }}</span>
            </template>
            <template v-slot:item.ACCION="{ item }">
              <v-chip :color="colorAccionGrupo(item.ACCION)" size="x-small" variant="tonal">{{ item.ACCION }}</v-chip>
            </template>
            <template v-slot:item.NOMBREGRUPO="{ item }">
              <span class="text-caption font-weight-medium">{{ item.NOMBREGRUPO || `Grupo #${item.IDGRUPO}` }}</span>
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
  
    <!-- Modal diff de edición de pedido -->
    <v-dialog v-model="modalDiff.mostrar" max-width="900">
      <v-card rounded="xl">
        <v-card-title class="pa-4 d-flex align-center gap-3">
          <v-icon color="orange">mdi-compare</v-icon>
          Cambios en pedido {{ modalDiff.orderid }}
          <v-spacer />
          <v-chip
            :color="modalDiff.totalDespues < modalDiff.totalAntes ? 'error' : modalDiff.totalDespues > modalDiff.totalAntes ? 'success' : 'grey'"
            variant="tonal" size="small">
            Total: {{ fmt(modalDiff.totalAntes) }} → {{ fmt(modalDiff.totalDespues) }}
          </v-chip>
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-0" style="max-height:520px;overflow-y:auto;">
          <v-table density="compact">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Artículo</th>
                <th>Descripción</th>
                <th class="text-right">Cant. antes</th>
                <th class="text-right">Cant. después</th>
                <th class="text-right">Precio antes</th>
                <th class="text-right">Precio después</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in modalDiff.filas" :key="f.cod"
                  :style="f.estado === 'IGUAL' ? 'opacity:0.45' : ''">
                <td>
                  <v-chip :color="colorDiff(f.estado)" size="x-small" variant="tonal" label>{{ f.estado }}</v-chip>
                </td>
                <td class="text-caption font-weight-medium">{{ f.cod }}</td>
                <td class="text-caption" style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ f.ref }}</td>
                <td class="text-caption text-right">{{ f.qtyAntes ?? '—' }}</td>
                <td class="text-caption text-right" :class="f.qtyDespues !== f.qtyAntes && f.qtyDespues != null ? 'font-weight-bold' : ''">{{ f.qtyDespues ?? '—' }}</td>
                <td class="text-caption text-right">{{ fmt(f.precioAntes) }}</td>
                <td class="text-caption text-right" :class="f.alertaPrecio ? 'text-error font-weight-bold' : (f.precioDespues !== f.precioAntes && f.precioDespues != null ? 'font-weight-bold' : '')">
                  {{ fmt(f.precioDespues) }}
                  <v-icon v-if="f.alertaPrecio" size="14" color="error">mdi-alert</v-icon>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
        <v-card-actions class="pa-4">
          <span class="text-caption text-grey">
            {{ modalDiff.filas.filter(f => f.estado !== 'IGUAL').length }} cambio(s) detectado(s)
          </span>
          <v-spacer />
          <v-btn variant="text" @click="modalDiff.mostrar = false">Cerrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
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

// Grupos / Clientes
const registrosGrupos    = ref<any[]>([]);
const totalGrupos        = ref(0);
const filtroBuscarGrupos = ref('');

const headersPedidos = [
  { title: 'Fecha',           key: 'FECHA',        sortable: false },
  { title: 'N° Orden',        key: 'ORDERID',      sortable: false },
  { title: 'Estado anterior', key: 'EST_ANTERIOR',  sortable: false },
  { title: 'Estado nuevo',    key: 'EST_NUEVO',     sortable: false },
  { title: 'Usuario',         key: 'USUARIO',       sortable: false },
  { title: 'Detalles',        key: 'DETALLES',      sortable: false },
  { title: '',                key: 'diff_accion',   sortable: false },
];

// Modal diff edición
type LineaSnap = { cod: number; ref: string; qty: number; precio: number; d1: number; d2: number; d3: number; d4: number; bruto: number };
type FilaDiff  = { cod: number; ref: string; estado: 'ELIMINADO' | 'AGREGADO' | 'MODIFICADO' | 'IGUAL'; qtyAntes: number | null; qtyDespues: number | null; precioAntes: number | null; precioDespues: number | null; alertaPrecio: boolean };
const modalDiff = ref<{ mostrar: boolean; orderid: string; totalAntes: number; totalDespues: number; filas: FilaDiff[] }>({ mostrar: false, orderid: '', totalAntes: 0, totalDespues: 0, filas: [] });

const abrirDiff = (item: any) => {
  if (!item.SNAPSHOT_ANTES || !item.SNAPSHOT_DESPUES) return;
  const snapA: { total: number; lineas: LineaSnap[] } = JSON.parse(item.SNAPSHOT_ANTES);
  const snapD: { total: number; lineas: LineaSnap[] } = JSON.parse(item.SNAPSHOT_DESPUES);
  const antesMap  = new Map(snapA.lineas.map(l => [l.cod, l]));
  const despuesMap = new Map(snapD.lineas.map(l => [l.cod, l]));
  const filas: FilaDiff[] = [];
  for (const [cod, la] of antesMap) {
    const ld = despuesMap.get(cod);
    if (!ld) {
      filas.push({ cod, ref: la.ref, estado: 'ELIMINADO', qtyAntes: la.qty, qtyDespues: null, precioAntes: la.precio, precioDespues: null, alertaPrecio: false });
    } else {
      const cambia = la.qty !== ld.qty || Math.abs(la.precio - ld.precio) > 0.001 || la.d1 !== ld.d1 || la.d2 !== ld.d2 || la.d3 !== ld.d3 || la.d4 !== ld.d4;
      filas.push({ cod, ref: la.ref || ld.ref, estado: cambia ? 'MODIFICADO' : 'IGUAL', qtyAntes: la.qty, qtyDespues: ld.qty, precioAntes: la.precio, precioDespues: ld.precio, alertaPrecio: ld.precio === 0 && la.precio > 0 });
    }
  }
  for (const [cod, ld] of despuesMap) {
    if (!antesMap.has(cod))
      filas.push({ cod, ref: ld.ref, estado: 'AGREGADO', qtyAntes: null, qtyDespues: ld.qty, precioAntes: null, precioDespues: ld.precio, alertaPrecio: ld.precio === 0 });
  }
  filas.sort((a, b) => {
    const ord: Record<string, number> = { ELIMINADO: 0, MODIFICADO: 1, AGREGADO: 2, IGUAL: 3 };
    return (ord[a.estado] ?? 9) - (ord[b.estado] ?? 9);
  });
  modalDiff.value = { mostrar: true, orderid: item.ORDERID, totalAntes: snapA.total, totalDespues: snapD.total, filas };
};

const colorDiff = (e: string) => ({ ELIMINADO: 'error', AGREGADO: 'success', MODIFICADO: 'warning', IGUAL: 'grey' } as Record<string, string>)[e] ?? 'grey';
const fmt = (n: number | null) => n == null ? '—' : n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

const headersGrupos = [
  { title: 'Fecha',   key: 'FECHA',       sortable: false },
  { title: 'Acción',  key: 'ACCION',      sortable: false },
  { title: 'Grupo',   key: 'NOMBREGRUPO', sortable: false },
  { title: 'Usuario', key: 'USUARIO',     sortable: false },
  { title: 'Detalles',key: 'DETALLES',    sortable: false },
];

const colorAccionGrupo = (accion: string) => {
  const map: Record<string, string> = {
    'CREAR_GRUPO': 'green', 'EDITAR_GRUPO': 'blue', 'IMPORTAR_EXCEL': 'teal',
    'AGREGAR_CLIENTE': 'cyan', 'QUITAR_CLIENTE': 'orange', 'ELIMINAR_GRUPO': 'red',
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
    } else if (tab.value === 'rutero') {
      const res = await axios.get(`${API}/rutero/auditoria`, {
        params: { buscar: filtroBuscarRutero.value || undefined, page: pagina.value, limit: itemsPerPage.value },
      });
      if (res.data.success) { registrosRutero.value = res.data.data; totalRutero.value = res.data.total; }
    } else {
      const res = await axios.get(`${API}/promociones/grupos-clientes/auditoria`, {
        params: { buscar: filtroBuscarGrupos.value || undefined, page: pagina.value, limit: itemsPerPage.value },
      });
      if (res.data.success) { registrosGrupos.value = res.data.data; totalGrupos.value = res.data.total; }
    }
  } finally {
    cargando.value = false;
  }
};

const limpiarPedidos = () => { filtroOrder.value = ''; filtroUsuario.value = ''; cargar(); };
const limpiarRutero  = () => { filtroBuscarRutero.value = ''; cargar(); };
const limpiarGrupos  = () => { filtroBuscarGrupos.value = ''; cargar(); };

const onOptions = (opt: any) => { pagina.value = opt.page; itemsPerPage.value = opt.itemsPerPage; cargar(); };

watch(tab, () => { pagina.value = 1; cargar(); });
</script>
