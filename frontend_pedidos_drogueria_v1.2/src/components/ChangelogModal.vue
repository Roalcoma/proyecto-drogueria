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
        <template>
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
import { ref, computed } from 'vue';
import { VERSIONES, COMMITS, APP_VERSION } from '../data/changelog';

const open = defineModel<boolean>({ default: false });

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

const normalTipo = (t: string) => {
  if (t === 'feat')                        return 'feat';
  if (t === 'fix')                         return 'fix';
  if (t === 'improve' || t === 'refactor') return 'improve';
  return 'other';
};

const versionDeCommit = (date: string): string => {
  for (const v of VERSIONES) {
    if (date >= v.desde) return v.version;
  }
  return VERSIONES[VERSIONES.length - 1].version;
};

const commitsFiltrados = computed(() => {
  const base = COMMITS.filter(c =>
    !filtroTipo.value || normalTipo(c.tipo) === filtroTipo.value
  );
  return VERSIONES
    .filter(v => !filtroVersion.value || v.version === filtroVersion.value)
    .map(v => ({
      version: v.version,
      fecha: v.fecha,
      commits: base.filter(c => versionDeCommit(c.date) === v.version),
    }))
    .filter(g => g.commits.length > 0);
});

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
