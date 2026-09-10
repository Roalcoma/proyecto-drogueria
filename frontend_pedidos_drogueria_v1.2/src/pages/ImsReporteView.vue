<template>
  <v-container fluid class="pa-6 bg-background">

    <div v-if="descargando" class="ims-spinner-overlay">
      <v-progress-circular indeterminate color="success" size="64" width="5" />
      <span class="text-white text-body-1 font-weight-medium mt-4">Generando reporte…</span>
    </div>

    <!-- Encabezado de página -->
    <div class="d-flex align-center mb-5">
      <v-icon color="success" size="32" class="mr-3">mdi-file-excel</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black" style="color:#164E63;">Reporte IMS</h1>
        <span class="text-caption text-medium-emphasis">Descarga manual y envío automático del reporte de ventas IMS</span>
      </div>
    </div>

    <!-- Descarga manual -->
    <v-card rounded="xl" elevation="2" class="pa-6 mb-4">
      <div class="d-flex align-center mb-4">
        <div class="text-subtitle-1 font-weight-bold">
          <v-icon start color="success">mdi-download</v-icon>
          Descarga manual
        </div>
      </div>
      <p class="text-body-2 text-medium-emphasis mb-4">
        Seleccioná el rango de fechas para generar el reporte con las hojas de Clientes, Productos y Ventas.
      </p>
      <v-row>
        <v-col cols="12" sm="4">
          <v-text-field v-model="desde" label="Desde" type="date" variant="outlined" density="compact" :max="hasta || undefined" />
        </v-col>
        <v-col cols="12" sm="4">
          <v-text-field v-model="hasta" label="Hasta" type="date" variant="outlined" density="compact" :min="desde || undefined" />
        </v-col>
        <v-col cols="12" sm="4" class="d-flex align-center">
          <v-btn color="success" variant="elevated" :loading="descargando" :disabled="!desde || !hasta"
            prepend-icon="mdi-microsoft-excel" block @click="descargar">
            Descargar Excel
          </v-btn>
        </v-col>
      </v-row>
      <v-alert v-if="error" type="error" density="compact" rounded="lg" class="mt-2">{{ error }}</v-alert>
    </v-card>

    <!-- Envío automático -->
    <v-card rounded="xl" elevation="2" class="pa-6">
      <div class="d-flex align-center mb-4">
        <div class="text-subtitle-1 font-weight-bold">
          <v-icon start color="primary">mdi-email-sync-outline</v-icon>
          Envío automático por correo
        </div>
        <v-spacer />
        <v-chip :color="emailCfg.schedulerActivo ? 'success' : 'default'" variant="flat" class="mr-3">
          <v-icon start>{{ emailCfg.schedulerActivo ? 'mdi-check-circle' : 'mdi-circle-off-outline' }}</v-icon>
          {{ emailCfg.schedulerActivo ? 'Activo' : 'Inactivo' }}
        </v-chip>
      </div>

      <v-switch v-model="emailCfg.habilitado" label="Habilitar envío automático" color="primary" hide-details density="compact" class="mb-5" />

      <!-- SMTP -->
      <div class="text-subtitle-2 font-weight-bold mb-3">
        <v-icon start color="primary" size="18">mdi-server-outline</v-icon>
        Configuración SMTP
      </div>
      <v-row>
        <v-col cols="12" sm="6">
          <v-text-field v-model="emailCfg.smtpHost" label="Servidor SMTP" variant="outlined" density="compact"
            placeholder="smtp.gmail.com" hide-details="auto" />
        </v-col>
        <v-col cols="12" sm="3">
          <v-text-field v-model.number="emailCfg.smtpPort" label="Puerto" variant="outlined" density="compact"
            type="number" hide-details="auto" />
        </v-col>
        <v-col cols="12" sm="3" class="d-flex align-center">
          <v-switch v-model="emailCfg.smtpTls" label="TLS/SSL" color="primary" density="compact" hide-details />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field v-model="emailCfg.smtpUser" label="Usuario / Email remitente" variant="outlined" density="compact" hide-details="auto" />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field v-model="emailCfg.smtpPass" label="Contraseña" variant="outlined" density="compact"
            type="password" hide-details="auto" />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field v-model="emailCfg.fromName" label="Nombre remitente" variant="outlined" density="compact" hide-details="auto" />
        </v-col>
      </v-row>

      <v-divider class="my-5" />

      <!-- Destinatarios y frecuencia -->
      <div class="text-subtitle-2 font-weight-bold mb-3">
        <v-icon start color="primary" size="18">mdi-calendar-clock</v-icon>
        Destinatarios y frecuencia
      </div>
      <v-row>
        <v-col cols="12">
          <v-text-field v-model="emailCfg.destinatarios" label="Destinatarios (separados por coma)"
            variant="outlined" density="compact" placeholder="correo1@empresa.com, correo2@empresa.com"
            prepend-inner-icon="mdi-email-multiple-outline" hide-details="auto" />
        </v-col>
        <v-col cols="12" sm="4">
          <v-select v-model="emailCfg.frecuencia" :items="frecuencias" label="Frecuencia"
            variant="outlined" density="compact" hide-details="auto" />
        </v-col>
        <v-col v-if="emailCfg.frecuencia === 'semanal'" cols="12" sm="4">
          <v-select v-model.number="emailCfg.diaSemana" :items="diasSemana" item-title="label" item-value="value"
            label="Día de envío" variant="outlined" density="compact" hide-details="auto" />
        </v-col>
        <v-col v-if="emailCfg.frecuencia === 'mensual'" cols="12" sm="4">
          <v-text-field v-model.number="emailCfg.diaMes" label="Día del mes" type="number" min="1" max="28"
            variant="outlined" density="compact" hide-details="auto" />
        </v-col>
        <v-col cols="6" sm="2">
          <v-text-field v-model.number="emailCfg.hora" label="Hora" type="number" min="0" max="23"
            variant="outlined" density="compact" hide-details="auto" />
        </v-col>
        <v-col cols="6" sm="2">
          <v-text-field v-model.number="emailCfg.minuto" label="Minuto" type="number" min="0" max="59"
            variant="outlined" density="compact" hide-details="auto" />
        </v-col>
      </v-row>

      <v-alert v-if="emailError" type="error" density="compact" rounded="lg" class="mt-4">{{ emailError }}</v-alert>
      <v-alert v-if="emailOk" type="success" density="compact" rounded="lg" class="mt-4">{{ emailOk }}</v-alert>

      <div class="d-flex justify-space-between mt-5">
        <v-btn variant="tonal" color="primary" :loading="enviando" prepend-icon="mdi-send-outline" @click="enviarAhora">
          Enviar ahora
        </v-btn>
        <v-btn color="primary" variant="elevated" :loading="guardando" prepend-icon="mdi-content-save-outline" @click="guardarEmailCfg">
          Guardar configuración
        </v-btn>
      </div>
    </v-card>

  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;

// ── Descarga manual ───────────────────────────────────────────────────────────
const desde       = ref('');
const hasta       = ref('');
const descargando = ref(false);
const error       = ref('');

async function descargar() {
  error.value = '';
  descargando.value = true;
  try {
    const fmt = (d: string) => d.replace(/-/g, '');
    const res = await axios.get(`${API}/ims/reporte`, {
      params: { desde: fmt(desde.value), hasta: fmt(hasta.value) },
      responseType: 'blob',
    });
    const url  = URL.createObjectURL(res.data);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `IMS ${desde.value} al ${hasta.value}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err: any) {
    const text = await err.response?.data?.text?.();
    try { error.value = JSON.parse(text ?? '{}').message ?? 'Error al generar el reporte'; }
    catch { error.value = 'Error al generar el reporte'; }
  } finally {
    descargando.value = false;
  }
}

// ── Configuración de email ────────────────────────────────────────────────────
const emailCfg = ref({
  habilitado: false, smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '',
  smtpTls: true, fromName: 'Sistema Droguería', destinatarios: '',
  frecuencia: 'semanal', diaSemana: 1, diaMes: 1, hora: 8, minuto: 0,
  schedulerActivo: false,
});
const guardando  = ref(false);
const enviando   = ref(false);
const emailError = ref('');
const emailOk    = ref('');

const frecuencias = [
  { title: 'Semanal', value: 'semanal' },
  { title: 'Mensual', value: 'mensual' },
];
const diasSemana = [
  { label: 'Domingo',  value: 0 },
  { label: 'Lunes',    value: 1 },
  { label: 'Martes',   value: 2 },
  { label: 'Miércoles',value: 3 },
  { label: 'Jueves',   value: 4 },
  { label: 'Viernes',  value: 5 },
  { label: 'Sábado',   value: 6 },
];

onMounted(async () => {
  try {
    const { data } = await axios.get(`${API}/ims/email-config`);
    if (data.success) Object.assign(emailCfg.value, data.data, { schedulerActivo: data.schedulerActivo });
  } catch { /* sin permisos o error, dejar defaults */ }
});

async function guardarEmailCfg() {
  emailError.value = ''; emailOk.value = '';
  guardando.value = true;
  try {
    const { data } = await axios.post(`${API}/ims/email-config`, emailCfg.value);
    emailCfg.value.schedulerActivo = data.schedulerActivo;
    emailOk.value = 'Configuración guardada correctamente';
    setTimeout(() => emailOk.value = '', 3000);
  } catch (e: any) {
    emailError.value = e.response?.data?.message ?? 'Error al guardar';
  } finally {
    guardando.value = false;
  }
}

async function enviarAhora() {
  emailError.value = ''; emailOk.value = '';
  enviando.value = true;
  try {
    await axios.post(`${API}/ims/email-enviar`);
    emailOk.value = 'Reporte enviado correctamente';
    setTimeout(() => emailOk.value = '', 4000);
  } catch (e: any) {
    emailError.value = e.response?.data?.message ?? 'Error al enviar';
  } finally {
    enviando.value = false;
  }
}
</script>

<style scoped>
.ims-spinner-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
</style>
