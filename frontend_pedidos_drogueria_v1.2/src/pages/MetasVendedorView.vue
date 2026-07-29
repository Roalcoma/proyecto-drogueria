<template>
  <v-container fluid>
    <v-row class="mb-2" align="center">
      <v-col>
        <div class="text-h6 font-weight-bold">Metas de Vendedores</div>
        <div class="text-caption text-medium-emphasis">Carga y seguimiento de metas mensuales</div>
      </v-col>
      <v-col cols="auto">
        <v-btn color="primary" prepend-icon="mdi-plus" @click="abrirNueva">Nueva Meta</v-btn>
      </v-col>
    </v-row>

    <!-- Filtros -->
    <v-card class="mb-4" variant="outlined">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" sm="4">
            <v-select
              v-model="filtroAnio"
              :items="aniosDisponibles"
              label="Año"
              density="compact"
              variant="outlined"
              clearable
              @update:model-value="cargarMetas"
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-select
              v-model="filtroMes"
              :items="meses"
              item-title="label"
              item-value="valor"
              label="Mes"
              density="compact"
              variant="outlined"
              clearable
              @update:model-value="cargarMetas"
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-select
              v-model="filtroVendedor"
              :items="vendedores"
              item-title="NOMVENDEDOR"
              item-value="CODVENDEDOR"
              label="Vendedor"
              density="compact"
              variant="outlined"
              clearable
              @update:model-value="cargarMetas"
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Tabla -->
    <v-card variant="outlined">
      <v-data-table
        :headers="headers"
        :items="metas"
        :loading="cargando"
        density="compact"
        no-data-text="No hay metas registradas"
        items-per-page-text="Por página"
      >
        <template #item.MES="{ item }">
          {{ meses.find(m => m.valor === item.MES)?.label ?? item.MES }}
        </template>
        <template #item.META="{ item }">
          {{ formatMonto(item.META) }}
        </template>
        <template #item.CUMPLIDA="{ item }">
          <v-chip
            :color="item.CUMPLIDA ? 'success' : 'default'"
            size="x-small"
            variant="flat"
          >
            {{ item.CUMPLIDA ? 'Sí' : 'No' }}
          </v-chip>
        </template>
        <template #item.acciones="{ item }">
          <v-btn
            icon="mdi-pencil"
            variant="text"
            size="small"
            density="compact"
            @click="abrirEdicion(item)"
          />
          <v-btn
            icon="mdi-delete"
            variant="text"
            size="small"
            density="compact"
            color="error"
            @click="confirmarEliminar(item)"
          />
        </template>
      </v-data-table>
    </v-card>

    <!-- Dialog crear/editar -->
    <v-dialog v-model="dialog" max-width="480" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold pa-4">
          {{ editando ? 'Editar Meta' : 'Nueva Meta' }}
        </v-card-title>
        <v-card-text class="pt-0">
          <v-row dense>
            <v-col cols="12">
              <v-select
                v-model="form.codVendedor"
                :items="vendedores"
                item-title="NOMVENDEDOR"
                item-value="CODVENDEDOR"
                label="Vendedor *"
                variant="outlined"
                density="compact"
                :disabled="editando"
              />
            </v-col>
            <v-col cols="6">
              <v-select
                v-model="form.anio"
                :items="aniosDisponibles"
                label="Año *"
                variant="outlined"
                density="compact"
                :disabled="editando"
              />
            </v-col>
            <v-col cols="6">
              <v-select
                v-model="form.mes"
                :items="meses"
                item-title="label"
                item-value="valor"
                label="Mes *"
                variant="outlined"
                density="compact"
                :disabled="editando"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                v-model.number="form.meta"
                label="Meta (Bs.) *"
                variant="outlined"
                density="compact"
                type="number"
                min="0"
                prefix="Bs."
              />
            </v-col>
            <v-col v-if="editando" cols="12">
              <v-switch
                v-model="form.cumplida"
                label="¿Meta cumplida?"
                color="success"
                density="compact"
                hide-details
              />
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
        <v-card-text class="pt-4">¿Eliminar la meta de <strong>{{ itemAEliminar?.NOMVENDEDOR }}</strong> para {{ meses.find(m => m.valor === itemAEliminar?.MES)?.label }} {{ itemAEliminar?.ANIO }}?</v-card-text>
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
import { ref, onMounted } from 'vue';
import axios from 'axios';

const API = `${import.meta.env.VITE_API_URL}/metas-vendedor`;

const meses = [
  { valor: 1, label: 'Enero' }, { valor: 2, label: 'Febrero' }, { valor: 3, label: 'Marzo' },
  { valor: 4, label: 'Abril' }, { valor: 5, label: 'Mayo' },    { valor: 6, label: 'Junio' },
  { valor: 7, label: 'Julio' }, { valor: 8, label: 'Agosto' },  { valor: 9, label: 'Septiembre' },
  { valor: 10, label: 'Octubre' }, { valor: 11, label: 'Noviembre' }, { valor: 12, label: 'Diciembre' },
];

const anioActual = new Date().getFullYear();
const aniosDisponibles = Array.from({ length: 5 }, (_, i) => anioActual - 1 + i);

const headers = [
  { title: 'Vendedor',  key: 'NOMVENDEDOR', sortable: true },
  { title: 'Año',       key: 'ANIO',        sortable: true, width: '80px' },
  { title: 'Mes',       key: 'MES',         sortable: true, width: '110px' },
  { title: 'Meta',      key: 'META',        sortable: true, width: '140px' },
  { title: 'Cumplida',  key: 'CUMPLIDA',    sortable: true, width: '90px' },
  { title: '',          key: 'acciones',    sortable: false, width: '80px' },
];

const vendedores = ref<{ CODVENDEDOR: number; NOMVENDEDOR: string }[]>([]);
const metas      = ref<any[]>([]);
const cargando   = ref(false);
const guardando  = ref(false);
const dialog     = ref(false);
const editando   = ref(false);
const dialogEliminar = ref(false);
const itemAEliminar  = ref<any>(null);

const filtroAnio     = ref<number | null>(anioActual);
const filtroMes      = ref<number | null>(null);
const filtroVendedor = ref<number | null>(null);

const form = ref({ codVendedor: null as number | null, anio: anioActual, mes: null as number | null, meta: 0, cumplida: false, id: null as number | null });
const snack = ref({ show: false, text: '', color: 'success' });

function mostrarSnack(text: string, color = 'success') {
  snack.value = { show: true, text, color };
}

function formatMonto(v: number) {
  return new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

async function cargarVendedores() {
  const res = await axios.get(`${API}/vendedores`);
  vendedores.value = res.data.data;
}

async function cargarMetas() {
  cargando.value = true;
  try {
    const params: any = {};
    if (filtroAnio.value)     params.anio        = filtroAnio.value;
    if (filtroMes.value)      params.mes         = filtroMes.value;
    if (filtroVendedor.value) params.codVendedor = filtroVendedor.value;
    const res = await axios.get(API, { params });
    metas.value = res.data.data;
  } finally {
    cargando.value = false;
  }
}

function abrirNueva() {
  editando.value = false;
  form.value = { codVendedor: null, anio: anioActual, mes: null, meta: 0, cumplida: false, id: null };
  dialog.value = true;
}

function abrirEdicion(item: any) {
  editando.value = true;
  form.value = { codVendedor: item.CODVENDEDOR, anio: item.ANIO, mes: item.MES, meta: item.META, cumplida: !!item.CUMPLIDA, id: item.ID };
  dialog.value = true;
}

async function guardar() {
  if (!form.value.codVendedor || !form.value.anio || !form.value.mes || form.value.meta == null) {
    mostrarSnack('Completá todos los campos requeridos', 'warning');
    return;
  }
  guardando.value = true;
  try {
    await axios.post(API, {
      codVendedor: form.value.codVendedor,
      anio:        form.value.anio,
      mes:         form.value.mes,
      meta:        form.value.meta,
    });
    if (editando.value && form.value.id) {
      await axios.patch(`${API}/${form.value.id}/cumplida`, { cumplida: form.value.cumplida });
    }
    dialog.value = false;
    mostrarSnack('Meta guardada correctamente');
    await cargarMetas();
  } catch {
    mostrarSnack('Error al guardar la meta', 'error');
  } finally {
    guardando.value = false;
  }
}

function confirmarEliminar(item: any) {
  itemAEliminar.value = item;
  dialogEliminar.value = true;
}

async function eliminar() {
  await axios.delete(`${API}/${itemAEliminar.value.ID}`);
  dialogEliminar.value = false;
  mostrarSnack('Meta eliminada');
  await cargarMetas();
}

onMounted(async () => {
  await cargarVendedores();
  await cargarMetas();
});
</script>
