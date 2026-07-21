<template>
  <v-container fluid class="pa-6 bg-background">

    <div class="d-flex align-center mb-4">
      <v-icon color="primary" size="32" class="mr-3">mdi-folder-network</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black" style="color:#164E63;">Pedidos FTP</h1>
        <span class="text-caption text-medium-emphasis">Importación automática de pedidos desde el servidor FTP</span>
      </div>
      <v-spacer />
      <template v-if="tab === 'auditoria'">
        <v-text-field
          v-model="busqueda"
          placeholder="Buscar archivo, cliente, pedido..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width:280px;"
          class="mr-3"
          @keyup.enter="cargarAuditoria"
        />
        <v-btn color="primary" variant="tonal" prepend-icon="mdi-refresh" :loading="cargando" @click="cargarAuditoria">
          Actualizar
        </v-btn>
      </template>
      <template v-if="tab === 'config' && authStore.esAdmin">
        <v-btn color="success" variant="tonal" prepend-icon="mdi-play-circle" :loading="escaneando" @click="escanearAhora">
          Escanear ahora
        </v-btn>
      </template>
    </div>

    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="auditoria" prepend-icon="mdi-clipboard-list-outline">Auditoría</v-tab>
      <v-tab v-if="authStore.esAdmin" value="config" prepend-icon="mdi-cog-outline">Configuración</v-tab>
    </v-tabs>

    <!-- Tab Auditoría -->
    <v-card v-show="tab === 'auditoria'" rounded="xl" elevation="2">
      <v-data-table-server
        :headers="headersAud"
        :items="auditoria"
        :items-length="totalAud"
        :loading="cargando"
        v-model:items-per-page="porPagina"
        @update:options="cargarPagina"
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
          {{ item.FECHA ? new Date(item.FECHA).toLocaleString('es-VE', { timeZone: brandingStore.zonaHoraria }) : '---' }}
        </template>
        <template v-slot:item.ARCHIVO="{ item }">
          <span class="text-caption font-weight-medium">{{ item.ARCHIVO }}</span>
        </template>
        <template v-slot:item.ORDERID="{ item }">
          <span class="font-weight-bold text-primary">{{ item.ORDERID ?? '—' }}</span>
        </template>
      </v-data-table-server>
    </v-card>

    <!-- Tab Configuración (solo admin) -->
    <v-card v-if="authStore.esAdmin && tab === 'config'" rounded="xl" elevation="2" class="pa-6">
      <div class="text-subtitle-1 font-weight-bold mb-4">
        <v-icon start color="primary">mdi-folder-network-outline</v-icon>
        Ruta del servidor FTP
      </div>
      <v-alert type="info" variant="tonal" density="compact" class="mb-4">
        Ruta local al directorio raíz del FTP (ej: <code>/srv/ftp</code>). El backend debe tener acceso de lectura/escritura a esta ruta.
        El escaneo se ejecuta automáticamente cada <strong>10 minutos</strong>.
      </v-alert>
      <v-row>
        <v-col cols="12" md="8">
          <v-text-field
            v-model="rutaFtp"
            label="Ruta del directorio FTP"
            placeholder="/srv/ftp"
            variant="outlined"
            density="compact"
            prepend-inner-icon="mdi-folder-outline"
            hide-details
          />
        </v-col>
        <v-col cols="12" md="4" class="d-flex align-center">
          <v-btn color="primary" :loading="guardando" @click="guardarConfig" block>
            Guardar ruta
          </v-btn>
        </v-col>
      </v-row>

      <v-divider class="my-6" />

      <div class="text-subtitle-1 font-weight-bold mb-2">
        <v-icon start color="secondary">mdi-information-outline</v-icon>
        Formato esperado de archivos
      </div>
      <v-card variant="outlined" class="pa-4 text-body-2" style="font-family: monospace; white-space: pre-line;">{{ formatoInfo }}</v-card>
    </v-card>

    <v-snackbar v-model="snack.show" :color="snack.color" rounded="pill">{{ snack.text }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from '../stores/useAuthStore';
import { useBrandingStore } from '../stores/useBrandingStore';
import { usePageSize } from '../utils/usePageSize';

const authStore     = useAuthStore();
const brandingStore = useBrandingStore();
const API = `${import.meta.env.VITE_API_URL}/ftp`;

const tab      = ref('auditoria');
const busqueda = ref('');
const auditoria = ref<any[]>([]);
const totalAud  = ref(0);
const cargando  = ref(false);
const pagina    = ref(1);
const porPagina = usePageSize('ftp-auditoria', 25);
const snack     = ref({ show: false, text: '', color: 'success' });

// Config ruta FTP
const rutaFtp   = ref('');
const guardando = ref(false);
const escaneando = ref(false);

const EVENTO_COLOR: Record<string, string> = {
  PROCESADO:              'success',
  YA_PROCESADO:           'info',
  CLIENTE_NO_ENCONTRADO:  'warning',
  PARSE_ERROR:            'error',
  ERROR_INSERCION:        'error',
  ERROR_CRITICO:          'error',
};
const EVENTO_LABEL: Record<string, string> = {
  PROCESADO:              'Procesado',
  YA_PROCESADO:           'Ya procesado',
  CLIENTE_NO_ENCONTRADO:  'Cliente no encontrado',
  PARSE_ERROR:            'Error de parseo',
  ERROR_INSERCION:        'Error inserción',
  ERROR_CRITICO:          'Error crítico',
};

const headersAud = [
  { title: 'Archivo',  key: 'ARCHIVO',  sortable: false },
  { title: 'Fecha',    key: 'FECHA' },
  { title: 'Evento',   key: 'EVENTO',   sortable: false },
  { title: 'Cliente',  key: 'COD_CLI',  sortable: false },
  { title: 'Pedido(s)', key: 'ORDERID', sortable: false },
  { title: 'Mensaje',  key: 'MENSAJE',  sortable: false },
];

const formatoInfo = `Directorio raíz FTP:
  /srv/ftp/
    c{CODCLIENTE}/
      Pedidos/
        {CODCLIENTE}P{NRO_PEDIDO}.txt   ← se procesa
        {CODCLIENTE}P{NRO_PEDIDO}.bak   ← ya procesado

Contenido del archivo (separado por ;):
  CODARTICULO;DESCRIPCION;CANTIDAD;PRECIO_TOTAL
  Ejemplo:
  00668;CREMA GENTAMICINA 30GR;10;73.70
  05066;ABRETIA 10MG X 10 CAPS;5;91.15`;

const mostrarSnack = (text: string, color = 'success') => { snack.value = { show: true, text, color }; };

// ── Auditoría ─────────────────────────────────────────────────────────────────

const cargarAuditoria = async () => {
  cargando.value = true;
  try {
    const res = await axios.get(`${API}/auditoria`, {
      params: { search: busqueda.value, page: pagina.value, limit: porPagina.value }
    });
    if (res.data.success) { auditoria.value = res.data.data; totalAud.value = res.data.total; }
  } catch { mostrarSnack('Error al cargar auditoría', 'error'); }
  finally { cargando.value = false; }
};

const cargarPagina = (opt: any) => {
  pagina.value = opt.page;
  porPagina.value = opt.itemsPerPage;
  cargarAuditoria();
};

// ── Configuración de ruta ─────────────────────────────────────────────────────

const cargarConfig = async () => {
  try {
    const res = await axios.get(`${API}/config`);
    if (res.data.success) rutaFtp.value = res.data.ruta;
  } catch {}
};

const guardarConfig = async () => {
  guardando.value = true;
  try {
    const res = await axios.put(`${API}/config`, { ruta: rutaFtp.value });
    mostrarSnack(res.data.success ? 'Ruta guardada correctamente' : (res.data.message ?? 'Error'), res.data.success ? 'success' : 'error');
  } catch { mostrarSnack('Error al guardar la ruta', 'error'); }
  finally { guardando.value = false; }
};

const escanearAhora = async () => {
  escaneando.value = true;
  try {
    const res = await axios.post(`${API}/escanear`);
    mostrarSnack(res.data.message ?? 'Escaneo iniciado', 'info');
    setTimeout(cargarAuditoria, 3000);
  } catch { mostrarSnack('Error al iniciar escaneo', 'error'); }
  finally { escaneando.value = false; }
};

onMounted(async () => {
  await cargarAuditoria();
  if (authStore.esAdmin) await cargarConfig();
});
</script>
