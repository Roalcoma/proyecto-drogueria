<template>
  <v-container fluid class="pa-6 bg-background">

    <div class="d-flex align-center mb-6">
      <v-icon color="primary" size="32" class="mr-3">mdi-server-network</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black" style="color:#164E63;">Servidor FTP</h1>
        <span class="text-caption text-medium-emphasis">Administración del servidor FTP embebido para recepción de pedidos</span>
      </div>
    </div>

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

      <div class="d-flex align-center mb-4 gap-3">
        <v-switch
          v-model="cfgServidor.ftpHabilitado"
          label="Iniciar automáticamente al reiniciar el servidor"
          color="primary"
          hide-details
          density="compact"
        />
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
        <v-btn variant="tonal" color="teal-darken-1" prepend-icon="mdi-file-excel-outline" class="mr-2" @click="descargarPlantilla">
          Plantilla
        </v-btn>
        <v-btn variant="tonal" color="green-darken-2" prepend-icon="mdi-file-import-outline" class="mr-2"
          :loading="importandoExcel" @click="seleccionarExcel">
          Importar Excel
        </v-btn>
        <input ref="inputImportRef" type="file" accept=".xlsx,.xls" style="display:none" @change="importarExcel" />
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

    <!-- Dialog: Nuevo usuario FTP -->
    <v-dialog v-model="dialogNuevoUsuario" max-width="420" persistent>
      <v-card rounded="xl">
        <v-card-title class="text-h6 font-weight-bold pa-5 pb-2">
          <v-icon start color="primary">mdi-account-plus</v-icon>
          Nuevo usuario FTP
        </v-card-title>
        <v-card-text class="pa-5 pt-2">
          <v-text-field v-model="nuevoUsuario.usuario"    label="Usuario"     variant="outlined" density="compact" class="mb-3" hide-details />
          <v-text-field v-model="nuevoUsuario.password"   label="Contraseña"  variant="outlined" density="compact" class="mb-3" hide-details
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

    <!-- Dialog: Resultados de importación -->
    <v-dialog v-model="dialogResultados" max-width="560" scrollable>
      <v-card rounded="xl">
        <v-card-title class="pa-5 pb-2 d-flex align-center">
          <v-icon start color="green-darken-2">mdi-file-import-outline</v-icon>
          Resultado de importación
          <v-spacer />
          <v-chip size="small" color="success" variant="tonal" class="mr-1">
            {{ resultadosImport.filter(r => r.ok).length }} ok
          </v-chip>
          <v-chip size="small" color="error" variant="tonal">
            {{ resultadosImport.filter(r => !r.ok).length }} error
          </v-chip>
        </v-card-title>
        <v-card-text class="pa-4">
          <v-table density="compact">
            <thead>
              <tr>
                <th>Fila</th><th>Usuario</th><th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in resultadosImport" :key="r.fila">
                <td class="text-caption">{{ r.fila }}</td>
                <td>{{ r.usuario }}</td>
                <td>
                  <v-chip v-if="r.ok" size="x-small" color="success" variant="flat">Creado</v-chip>
                  <v-tooltip v-else location="top" :text="r.error">
                    <template #activator="{ props }">
                      <v-chip v-bind="props" size="x-small" color="error" variant="flat">Error</v-chip>
                    </template>
                  </v-tooltip>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="flat" color="primary" @click="dialogResultados = false">Cerrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" rounded="pill">{{ snack.text }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import axios from 'axios';
import { useBrandingStore } from '../stores/useBrandingStore';

const brandingStore = useBrandingStore();
const API = `${import.meta.env.VITE_API_URL}/ftp`;

const snack = ref({ show: false, text: '', color: 'success' });
const mostrarSnack = (text: string, color = 'success') => { snack.value = { show: true, text, color }; };

// Estado del servidor
const servidorActivo  = ref(false);
const accionServidor  = ref(false);
const guardandoCfgSrv = ref(false);
const cfgServidor     = ref({ puerto: 21, pasivoMin: 40000, pasivoMax: 40100, ipExterna: '', ftpHabilitado: false });

// Usuarios FTP
const usuarios           = ref<any[]>([]);
const cargandoUsuarios   = ref(false);
const dialogNuevoUsuario = ref(false);
const nuevoUsuario       = ref({ usuario: '', password: '', codCliente: '' });
const mostrarPassNuevo   = ref(false);
const guardandoUsuario   = ref(false);
const dialogPassword     = ref(false);
const nuevaPassword      = ref('');
const mostrarPassEditar  = ref(false);
const guardandoPassword  = ref(false);
const dialogEliminar     = ref(false);
const eliminandoUsuario  = ref(false);
const usuarioSeleccionado = ref<any>(null);

const headersUsuarios = [
  { title: 'Usuario',  key: 'USUARIO',       sortable: false },
  { title: 'Cliente',  key: 'COD_CLIENTE',    sortable: false },
  { title: 'Estado',   key: 'ACTIVO',         sortable: false },
  { title: 'Creado',   key: 'FECHA_CREACION', sortable: false },
  { title: 'Acciones', key: 'acciones',       sortable: false },
];

// ── Servidor ──────────────────────────────────────────────────────────────────

const cargarEstadoServidor = async () => {
  try {
    const res = await axios.get(`${API}/servidor/estado`);
    if (res.data.success) {
      servidorActivo.value = res.data.activo;
      cfgServidor.value = {
        puerto:        res.data.puerto,
        pasivoMin:     res.data.pasivoMin,
        pasivoMax:     res.data.pasivoMax,
        ipExterna:     res.data.ipExterna ?? '',
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

// ── Usuarios ──────────────────────────────────────────────────────────────────

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

// ── Importación masiva por Excel ──────────────────────────────────────────────

const inputImportRef    = ref<HTMLInputElement | null>(null);
const importandoExcel   = ref(false);
const dialogResultados  = ref(false);
const resultadosImport  = ref<{ fila: number; usuario: string; ok: boolean; error?: string }[]>([]);

const seleccionarExcel = () => inputImportRef.value?.click();

const descargarPlantilla = async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Usuarios FTP');
  ws.columns = [
    { header: 'CODCLIENTE', key: 'CODCLIENTE', width: 15 },
    { header: 'USUARIO',    key: 'USUARIO',    width: 22 },
    { header: 'CLAVE',      key: 'CLAVE',      width: 22 },
  ];
  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF164E63' } };
  ws.addRow({ CODCLIENTE: '1234', USUARIO: 'cliente1234', CLAVE: 'clave123' });
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = 'plantilla_usuarios_ftp.xlsx';
  a.click();
};

const importarExcel = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  importandoExcel.value = true;
  try {
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, { type: 'array' });
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    if (!rows.length) { mostrarSnack('El archivo no tiene datos', 'warning'); return; }
    const filas = rows.map((r: any) => ({
      codCliente: String(r.CODCLIENTE ?? '').trim(),
      usuario:    String(r.USUARIO    ?? '').trim(),
      password:   String(r.CLAVE      ?? '').trim(),
    })).filter(f => f.usuario);
    if (!filas.length) { mostrarSnack('No se encontraron filas válidas (verifica encabezados: CODCLIENTE, USUARIO, CLAVE)', 'warning'); return; }
    const res = await axios.post(`${API}/usuarios/importar`, { filas });
    resultadosImport.value = res.data.resultados;
    dialogResultados.value = true;
    await cargarUsuarios();
  } catch (err: any) {
    mostrarSnack(err?.response?.data?.message ?? 'Error al importar', 'error');
  } finally {
    importandoExcel.value = false;
    if (inputImportRef.value) inputImportRef.value.value = '';
  }
};

onMounted(async () => {
  await Promise.all([cargarEstadoServidor(), cargarUsuarios()]);
});
</script>
