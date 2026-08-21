<template>
  <v-overlay v-if="descargando" model-value class="align-center justify-center" persistent>
    <div class="d-flex flex-column align-center gap-4">
      <v-progress-circular indeterminate color="success" size="64" width="5" />
      <span class="text-white text-body-1 font-weight-medium">Generando reporte…</span>
    </div>
  </v-overlay>

  <v-container max-width="560" class="py-8">
    <v-card rounded="xl" elevation="2">
      <v-card-title class="d-flex align-center gap-2 pa-5">
        <v-icon color="success" size="28">mdi-file-excel</v-icon>
        <span class="text-h6 font-weight-bold">Reporte IMS</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-5">
        <p class="text-body-2 text-medium-emphasis mb-5">
          Seleccioná el rango de fechas para generar el reporte con las hojas de Clientes, Productos y Ventas.
        </p>
        <v-row dense>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="desde"
              label="Desde"
              type="date"
              variant="outlined"
              density="compact"
              :max="hasta || undefined"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="hasta"
              label="Hasta"
              type="date"
              variant="outlined"
              density="compact"
              :min="desde || undefined"
            />
          </v-col>
        </v-row>
        <v-alert v-if="error" type="error" density="compact" rounded="lg" class="mt-2">{{ error }}</v-alert>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-5">
        <v-spacer />
        <v-btn
          color="success"
          variant="elevated"
          :loading="descargando"
          :disabled="!desde || !hasta"
          prepend-icon="mdi-download"
          @click="descargar"
        >
          Descargar Excel
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';

const desde      = ref('');
const hasta      = ref('');
const descargando = ref(false);
const error      = ref('');

async function descargar() {
  error.value = '';
  descargando.value = true;
  try {
    const fmt = (d: string) => d.replace(/-/g, '');
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/ims/reporte`, {
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
</script>
