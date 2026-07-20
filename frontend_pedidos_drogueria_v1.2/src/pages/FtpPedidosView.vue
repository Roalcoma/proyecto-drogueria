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
      <v-tab v-if="authStore.esAdmin" value="config"    prepend-icon="mdi-cog-outline">Configuración</v-tab>
      <v-tab v-if="authStore.esAdmin" value="servidor"  prepend-icon="mdi-server-network">Servidor FTP</v-tab>
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

    <!-- Tab Servidor FTP embebido (solo admin) -->
    <template v-if="authStore.esAdmin && tab === 'servidor'">

      <!-- Estado + control -->
      <v-card rounded="xl" elevation="2" class="pa-6 mb-4">
        <div class="d-flex align-center mb-4">
          <div class="text-subtitle-1 font-weight-bold">
            <v-icon start color="primary">mdi-server-network</v-icon>
            Estado del servidor
          </div>
          <v-spacer />
          <v-chip :color="servidorActivo ? 'success' : 'default'" variant="flat" class="mr-3">
            <v-icon start>{{ servidorActivo ? 'mdi-check-circle' : 'mdi-circle-off-outline' }}</v-icon>
            {{ servidorActivo ? 'Activo' : 'Inactivo' }}
          </v-chip>
          <v-btn v-if="!servidorActivo" color="success" variant="tonal" prepend-icon="mdi-play" :loading="accionServidor" @click="iniciarServidor">
            Iniciar
          </v-btn>
          <v-btn v-else color="error" variant="tonal" prepend-icon="mdi-stop" :loading="accionServidor" @click="detenerServidor">
            Detener
          </v-btn>
        </div>

        <v-alert v-if="servidorActivo" type="info" variant="tonal" density="compact" class="mb-0">
          Puerto FTP activo: <strong>{{ cfgServidor.puerto }}</strong>.
          Los clientes deben conectarse a la IP del servidor en ese puerto.
          Puertos pasivos: <strong>{{ cfgServidor.pasivoMin }}–{{ cfgServidor.pasivoMax }}</strong>.
        </v-alert>
      </v-card>

      <!-- Configuración de red -->
      <v-card rounded="xl" elevation="2" class="pa-6 mb-4">
        <div class="text-subtitle-1 font-weight-bold mb-4">
          <v-icon start color="primary">mdi-cog-outline</v-icon>
          Configuración de red
        </div>
        <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
          Después de cambiar la configuración, <strong>detén y vuelve a iniciar</strong> el servidor para aplicar los cambios.
          Puertos menores a 1024 pueden requerir permisos de administrador en el sistema operativo.
        </v-alert>
        <v-row>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model.number="cfgServidor.puerto"
              label="Puerto FTP"
              type="number"
              variant="outlined"
              density="compact"
              hint="Default: 21 (requiere admin en Linux/Windows)"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model.number="cfgServidor.pasivoMin"
              label="Puerto pasivo mínimo"
              type="number"
              variant="outlined"
              density="compact"
              hint="Rango para modo pasivo (PASV)"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model.number="cfgServidor.pasivoMax"
              label="Puerto pasivo máximo"
              type="number"
              variant="outlined"
              density="compact"
              hint="Abre estos puertos en el firewall/router"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="8">
            <v-text-field
              v-model="cfgServidor.ipExterna"
              label="IP externa (NAT)"
              variant="outlined"
              density="compact"
              placeholder="Ej: 201.248.10.50"
              hint="IP pública o dominio del servidor. Vacío = auto-detect (solo red local)"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="4" class="d-flex align-center">
            <v-btn color="primary" :loading="guardandoCfgSrv" @click="guardarCfgServidor" block>
              Guardar configuración
            </v-btn>
          </v-col>
        </v-row>
      </v-card>

      <!-- Gestión de usuarios -->
      <v-card rounded="xl" elevation="2" class="pa-6">
        <div class="d-flex align-center mb-4">
          <div class="text-subtitle-1 font-weight-bold">
            <v-icon start color="primary">mdi-account-multiple</v-icon>
            Usuarios FTP
          </div>
          <v-spacer />
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-account-plus" @click="abrirDialogNuevoUsuario">
            Nuevo usuario
          </v-btn>
        </div>

        <v-data-table
          :headers="headersUsuarios"
          :items="usuarios"
          :loading="cargandoUsuarios"
          hover
          class="bg-white"
          no-data-text="No hay usuarios FTP configurados"
        >
          <template v-slot:item.ACTIVO="{ item }">
            <v-chip :color="item.ACTIVO === 'T' ? 'success' : 'default'" size="small" variant="flat">
              {{ item.ACTIVO === 'T' ? 'Activo' : 'Inactivo' }}
            </v-chip>
          </template>
          <template v-slot:item.FECHA_CREACION="{ item }">
            {{ item.FECHA_CREACION ? new Date(item.FECHA_CREACION).toLocaleDateString('es-VE', { timeZone: brandingStore.zonaHoraria }) : '—' }}
          </template>
          <template v-slot:item.acciones="{ item }">
            <v-btn icon size="small" variant="text" :color="item.ACTIVO === 'T' ? 'warning' : 'success'"
              :title="item.ACTIVO === 'T' ? 'Desactivar' : 'Activar'"
              @click="toggleUsuario(item)">
              <v-icon>{{ item.ACTIVO === 'T' ? 'mdi-account-off' : 'mdi-account-check' }}</v-icon>
            </v-btn>
            <v-btn icon size="small" variant="text" color="info" title="Cambiar contraseña" @click="abrirDialogPassword(item)">
              <v-icon>mdi-key</v-icon>
            </v-btn>
            <v-btn icon size="small" variant="text" color="error" title="Eliminar" @click="confirmarEliminar(item)">
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </template>
        </v-data-table>
      </v-card>
    </template>

    <!-- Dialog: Nuevo usuario FTP -->
    <v-dialog v-model="dialogNuevoUsuario" max-width="420" persistent>
      <v-card rounded="xl">
        <v-card-title class="text-h6 font-weight-bold pa-5 pb-2">
          <v-icon start color="primary">mdi-account-plus</v-icon>
          Nuevo usuario FTP
        </v-card-title>
        <v-card-text class="pa-5 pt-2">
          <v-text-field v-model="nuevoUsuario.usuario"   label="Usuario"          variant="outlined" density="compact" class="mb-3" hide-details />
          <v-text-field v-model="nuevoUsuario.password"  label="Contraseña"       variant="outlined" density="compact" class="mb-3" hide-details
            :type="mostrarPassNuevo ? 'text' : 'password'"
            :append-inner-icon="mostrarPassNuevo ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="mostrarPassNuevo = !mostrarPassNuevo" />
          <v-text-field v-model="nuevoUsuario.codCliente" label="Cód. Cliente (opcional)" variant="outlined" density="compact" hide-details
            hint="Número de cliente — define el directorio home del usuario" persistent-hint />
        </v-card-text>
        <v-card-actions class="pa-5 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialogNuevoUsuario = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="guardandoUsuario" @click="crearUsuario">Crear</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: Cambiar contraseña -->
    <v-dialog v-model="dialogPassword" max-width="380" persistent>
      <v-card rounded="xl">
        <v-card-title class="text-h6 font-weight-bold pa-5 pb-2">
          <v-icon start color="info">mdi-key</v-icon>
          Cambiar contraseña
        </v-card-title>
        <v-card-text class="pa-5 pt-2">
          <p class="text-body-2 mb-3">Usuario: <strong>{{ usuarioSeleccionado?.USUARIO }}</strong></p>
          <v-text-field v-model="nuevaPassword" label="Nueva contraseña" variant="outlined" density="compact" hide-details
            :type="mostrarPassEditar ? 'text' : 'password'"
            :append-inner-icon="mostrarPassEditar ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="mostrarPassEditar = !mostrarPassEditar" />
        </v-card-text>
        <v-card-actions class="pa-5 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialogPassword = false">Cancelar</v-btn>
          <v-btn color="info" variant="flat" :loading="guardandoPassword" @click="cambiarPassword">Guardar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: Confirmar eliminar -->
    <v-dialog v-model="dialogEliminar" max-width="360">
      <v-card rounded="xl">
        <v-card-title class="text-h6 font-weight-bold pa-5 pb-2">Eliminar usuario</v-card-title>
        <v-card-text class="pa-5 pt-0">
          ¿Eliminar el usuario FTP <strong>{{ usuarioSeleccionado?.USUARIO }}</strong>? Esta acción no se puede deshacer.
        </v-card-text>
        <v-card-actions class="pa-5 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialogEliminar = false">Cancelar</v-btn>
          <v-btn color="error" variant="flat" :loading="eliminandoUsuario" @click="eliminarUsuario">Eliminar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" rounded="pill">{{ snack.text }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
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

// Estado del servidor
const servidorActivo    = ref(false);
const accionServidor    = ref(false);
const guardandoCfgSrv   = ref(false);
const cfgServidor       = ref({ puerto: 21, pasivoMin: 40000, pasivoMax: 40100, ipExterna: '', ftpHabilitado: false });

// Usuarios FTP
const usuarios          = ref<any[]>([]);
const cargandoUsuarios  = ref(false);
const dialogNuevoUsuario = ref(false);
const nuevoUsuario      = ref({ usuario: '', password: '', codCliente: '' });
const mostrarPassNuevo  = ref(false);
const guardandoUsuario  = ref(false);
const dialogPassword    = ref(false);
const nuevaPassword     = ref('');
const mostrarPassEditar = ref(false);
const guardandoPassword = ref(false);
const dialogEliminar    = ref(false);
const eliminandoUsuario = ref(false);
const usuarioSeleccionado = ref<any>(null);

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

const headersUsuarios = [
  { title: 'Usuario',    key: 'USUARIO',        sortable: false },
  { title: 'Cliente',    key: 'COD_CLIENTE',     sortable: false },
  { title: 'Estado',     key: 'ACTIVO',          sortable: false },
  { title: 'Creado',     key: 'FECHA_CREACION',  sortable: false },
  { title: 'Acciones',   key: 'acciones',        sortable: false },
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

// ── Servidor FTP ──────────────────────────────────────────────────────────────

const cargarEstadoServidor = async () => {
  try {
    const res = await axios.get(`${API}/servidor/estado`);
    if (res.data.success) {
      servidorActivo.value = res.data.activo;
      cfgServidor.value = {
        puerto:       res.data.puerto,
        pasivoMin:    res.data.pasivoMin,
        pasivoMax:    res.data.pasivoMax,
        ipExterna:    res.data.ipExterna ?? '',
        ftpHabilitado: res.data.ftpHabilitado ?? false,
      };
    }
  } catch {}
};

const guardarCfgServidor = async () => {
  guardandoCfgSrv.value = true;
  try {
    await axios.post(`${API}/servidor/config`, cfgServidor.value);
    mostrarSnack('Configuración guardada. Reinicia el servidor para aplicar.', 'success');
  } catch { mostrarSnack('Error al guardar configuración', 'error'); }
  finally { guardandoCfgSrv.value = false; }
};

const iniciarServidor = async () => {
  accionServidor.value = true;
  try {
    const res = await axios.post(`${API}/servidor/iniciar`);
    mostrarSnack(res.data.message, res.data.success ? 'success' : 'error');
    await cargarEstadoServidor();
  } catch (e: any) {
    mostrarSnack(e?.response?.data?.message ?? 'Error al iniciar servidor', 'error');
  } finally { accionServidor.value = false; }
};

const detenerServidor = async () => {
  accionServidor.value = true;
  try {
    const res = await axios.post(`${API}/servidor/detener`);
    mostrarSnack(res.data.message, res.data.success ? 'success' : 'error');
    await cargarEstadoServidor();
  } catch { mostrarSnack('Error al detener servidor', 'error'); }
  finally { accionServidor.value = false; }
};

// ── Usuarios FTP ──────────────────────────────────────────────────────────────

const cargarUsuarios = async () => {
  cargandoUsuarios.value = true;
  try {
    const res = await axios.get(`${API}/usuarios`);
    if (res.data.success) usuarios.value = res.data.data;
  } catch { mostrarSnack('Error al cargar usuarios FTP', 'error'); }
  finally { cargandoUsuarios.value = false; }
};

const abrirDialogNuevoUsuario = () => {
  nuevoUsuario.value = { usuario: '', password: '', codCliente: '' };
  mostrarPassNuevo.value = false;
  dialogNuevoUsuario.value = true;
};

const crearUsuario = async () => {
  if (!nuevoUsuario.value.usuario || !nuevoUsuario.value.password) {
    mostrarSnack('Usuario y contraseña son requeridos', 'warning');
    return;
  }
  guardandoUsuario.value = true;
  try {
    const res = await axios.post(`${API}/usuarios`, nuevoUsuario.value);
    mostrarSnack(res.data.message, 'success');
    dialogNuevoUsuario.value = false;
    await cargarUsuarios();
  } catch (e: any) {
    mostrarSnack(e?.response?.data?.message ?? 'Error al crear usuario', 'error');
  } finally { guardandoUsuario.value = false; }
};

const toggleUsuario = async (item: any) => {
  try {
    await axios.patch(`${API}/usuarios/${item.ID}/toggle`);
    await cargarUsuarios();
  } catch { mostrarSnack('Error al cambiar estado', 'error'); }
};

const abrirDialogPassword = (item: any) => {
  usuarioSeleccionado.value = item;
  nuevaPassword.value = '';
  mostrarPassEditar.value = false;
  dialogPassword.value = true;
};

const cambiarPassword = async () => {
  if (!nuevaPassword.value) { mostrarSnack('La contraseña no puede estar vacía', 'warning'); return; }
  guardandoPassword.value = true;
  try {
    await axios.patch(`${API}/usuarios/${usuarioSeleccionado.value.ID}/password`, { password: nuevaPassword.value });
    mostrarSnack('Contraseña actualizada', 'success');
    dialogPassword.value = false;
  } catch { mostrarSnack('Error al cambiar contraseña', 'error'); }
  finally { guardandoPassword.value = false; }
};

const confirmarEliminar = (item: any) => {
  usuarioSeleccionado.value = item;
  dialogEliminar.value = true;
};

const eliminarUsuario = async () => {
  eliminandoUsuario.value = true;
  try {
    await axios.delete(`${API}/usuarios/${usuarioSeleccionado.value.ID}`);
    mostrarSnack('Usuario eliminado', 'success');
    dialogEliminar.value = false;
    await cargarUsuarios();
  } catch { mostrarSnack('Error al eliminar usuario', 'error'); }
  finally { eliminandoUsuario.value = false; }
};

// Cargar datos del tab cuando el admin lo visita
watch(tab, async (val) => {
  if (val === 'servidor' && authStore.esAdmin) {
    await Promise.all([cargarEstadoServidor(), cargarUsuarios()]);
  }
});

onMounted(async () => {
  await cargarAuditoria();
  if (authStore.esAdmin) {
    await cargarConfig();
    await cargarEstadoServidor();
  }
});
</script>
