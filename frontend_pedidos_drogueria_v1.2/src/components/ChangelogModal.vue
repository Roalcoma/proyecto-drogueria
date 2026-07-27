<template>
  <v-dialog v-model="open" max-width="720" scrollable>
    <v-card rounded="xl">

      <!-- Header -->
      <v-card-title class="d-flex align-center pa-5 pb-3">
        <v-icon color="primary" class="mr-2">mdi-history</v-icon>
        <span class="text-h6 font-weight-bold" style="color:#164E63;">Historial de versiones</span>
        <v-spacer />
        <v-chip color="primary" variant="elevated" size="small" class="mr-3">v{{ APP_VERSION }}</v-chip>
        <v-btn icon="mdi-close" variant="text" size="small" @click="open = false" />
      </v-card-title>
      <v-divider />

      <!-- Filtros -->
      <div class="px-5 pt-3 pb-2 d-flex flex-wrap gap-2 align-center">
        <!-- Versiones -->
        <v-chip
          v-for="v in VERSIONES" :key="v.version"
          :color="filtroVersion === v.version ? 'primary' : 'default'"
          :variant="filtroVersion === v.version ? 'elevated' : 'tonal'"
          size="small" class="font-weight-medium cursor-pointer"
          @click="filtroVersion = filtroVersion === v.version ? null : v.version"
        >
          v{{ v.version }}
        </v-chip>
        <v-divider vertical class="mx-1" style="height:24px;" />
        <!-- Tipos -->
        <v-chip
          v-for="t in TIPOS" :key="t.key"
          :color="filtroTipo === t.key ? t.color : 'default'"
          :variant="filtroTipo === t.key ? 'elevated' : 'tonal'"
          :prepend-icon="t.icon"
          size="small" class="cursor-pointer"
          @click="filtroTipo = filtroTipo === t.key ? null : t.key"
        >
          {{ t.label }}
        </v-chip>
        <v-spacer />
        <v-btn v-if="filtroVersion || filtroTipo" variant="text" size="x-small" @click="filtroVersion = null; filtroTipo = null">
          Limpiar filtros
        </v-btn>
      </div>
      <v-divider />

      <!-- Lista de commits -->
      <v-card-text class="pa-0" style="max-height: 500px; overflow-y: auto;">

        <div v-if="cargando" class="d-flex justify-center align-center py-10">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <div v-else-if="error" class="text-center text-error py-8">
          <v-icon size="36" class="mb-2">mdi-alert-circle</v-icon>
          <div>{{ error }}</div>
        </div>

        <template v-else>
          <div v-for="(grupo, gIdx) in commitsFiltrados" :key="grupo.version">
            <!-- Encabezado de versión -->
            <div class="d-flex align-center px-5 py-2 sticky-header">
              <v-chip
                :color="grupo.version === APP_VERSION ? 'primary' : 'grey'"
                variant="tonal" size="small" class="font-weight-bold mr-2"
              >
                v{{ grupo.version }}
              </v-chip>
              <v-chip v-if="grupo.version === APP_VERSION" color="success" size="x-small" variant="tonal" class="mr-2">actual</v-chip>
              <span class="text-caption text-medium-emphasis">{{ grupo.fecha }}</span>
              <v-chip size="x-small" variant="tonal" color="grey" class="ml-2">{{ grupo.commits.length }} commits</v-chip>
            </div>
            <v-divider />

            <!-- Commits de esta versión -->
            <div
              v-for="c in grupo.commits" :key="c.hash"
              class="d-flex align-start px-5 py-2 commit-row"
            >
              <v-chip
                :color="tipoColor(c.tipo)" variant="tonal" size="x-small"
                :prepend-icon="tipoIcono(c.tipo)"
                class="mr-3 flex-shrink-0 mt-0_5 font-weight-medium"
                style="min-width:80px; justify-content:center;"
              >
                {{ tipoLabel(c.tipo) }}
              </v-chip>
              <span class="text-body-2 flex-grow-1" style="line-height:1.5;">{{ c.texto }}</span>
              <a
                :href="`https://github.com/Roalcoma/proyecto-drogueria/commit/${c.hash}`"
                target="_blank" rel="noopener"
                class="text-caption text-medium-emphasis ml-3 flex-shrink-0 font-weight-medium"
                style="font-family:monospace; text-decoration:none;"
                :title="c.hash"
              >{{ c.hash }}</a>
              <span class="text-caption text-disabled ml-2 flex-shrink-0">{{ c.date }}</span>
            </div>

            <v-divider v-if="gIdx < commitsFiltrados.length - 1" />
          </div>

          <div v-if="commitsFiltrados.length === 0" class="text-center text-medium-emphasis py-8">
            Sin resultados para el filtro seleccionado.
          </div>
        </template>
      </v-card-text>

    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import axios from 'axios';
import { VERSIONES, APP_VERSION } from '../data/changelog';

const open = defineModel<boolean>({ default: false });

const API = import.meta.env.VITE_API_URL;

interface Commit { hash: string; date: string; tipo: string; texto: string; }
const commits   = ref<Commit[]>([]);
const cargando  = ref(false);
const error     = ref('');
const filtroVersion = ref<string | null>(null);
const filtroTipo    = ref<string | null>(null);

const TIPOS = [
  { key: 'feat',    label: 'Nuevo',   color: 'primary', icon: 'mdi-plus-circle'   },
  { key: 'fix',     label: 'Fix',     color: 'error',   icon: 'mdi-wrench'         },
  { key: 'improve', label: 'Mejora',  color: 'success', icon: 'mdi-arrow-up-circle'},
  { key: 'other',   label: 'Otro',    color: 'grey',    icon: 'mdi-circle-outline' },
];

const tipoColor = (t: string) => TIPOS.find(x => x.key === t)?.color ?? 'grey';
const tipoIcono = (t: string) => TIPOS.find(x => x.key === t)?.icon ?? 'mdi-circle-outline';
const tipoLabel = (t: string) => TIPOS.find(x => x.key === t)?.label ?? t;

// Asigna versión a cada commit por rango de fechas
const versionDeCommit = (date: string): string => {
  for (const v of VERSIONES) {
    if (date >= v.desde) return v.version;
  }
  return VERSIONES[VERSIONES.length - 1].version;
};

// Agrupa commits por versión, respetando filtros
const commitsFiltrados = computed(() => {
  const base = commits.value.filter(c => {
    if (filtroTipo.value && normalTipo(c.tipo) !== filtroTipo.value) return false;
    return true;
  });

  return VERSIONES
    .filter(v => !filtroVersion.value || v.version === filtroVersion.value)
    .map(v => ({
      version: v.version,
      fecha: v.fecha,
      commits: base.filter(c => versionDeCommit(c.date) === v.version),
    }))
    .filter(g => g.commits.length > 0);
});

// Normaliza tipos similares: refactor/improve → 'improve', rest → 'other'
const normalTipo = (t: string) => {
  if (['feat'].includes(t))                return 'feat';
  if (['fix'].includes(t))                 return 'fix';
  if (['improve', 'refactor'].includes(t)) return 'improve';
  return 'other';
};

const cargar = async () => {
  if (commits.value.length > 0) return;
  cargando.value = true;
  error.value = '';
  try {
    const res = await axios.get(`${API}/changelog`);
    commits.value = res.data.data.map((c: any) => ({
      ...c,
      tipo: normalTipo(c.tipo),
    }));
  } catch {
    error.value = 'No se pudo cargar el historial de git.';
  } finally {
    cargando.value = false;
  }
};

watch(open, v => { if (v) cargar(); });
</script>

<style scoped>
.sticky-header {
  position: sticky;
  top: 0;
  background: rgb(var(--v-theme-surface));
  z-index: 1;
}
.commit-row:hover {
  background: rgba(var(--v-theme-primary), 0.04);
}
.mt-0_5 { margin-top: 2px; }
</style>
