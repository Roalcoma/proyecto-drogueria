<template>
  <v-container fluid class="pa-6 bg-background h-100">

    <!-- Encabezado + Filtros -->
    <v-card elevation="1" class="rounded-xl mb-4">
      <!-- Título -->
      <v-card-text class="d-flex align-center gap-3 pa-4 module-header">
        <v-avatar color="primary" size="46" class="module-avatar flex-shrink-0">
          <v-icon size="24" color="white">mdi-label-percent-outline</v-icon>
        </v-avatar>
        <div class="flex-grow-1">
          <h1 class="text-h6 font-weight-bold">Desc. por Artículo</h1>
          <span class="text-caption font-weight-medium text-primary" style="opacity:0.7;letter-spacing:0.03em">
            DESCUENTO D3 · PRIORIDAD MÁXIMA
          </span>
        </div>
        <v-chip color="primary" variant="flat" size="small" class="font-weight-bold px-3">
          {{ total }} artículos
        </v-chip>
      </v-card-text>

      <v-divider />

      <!-- Filtros -->
      <v-card-text class="pt-3 pb-3 px-4">
        <div class="d-flex align-center flex-wrap gap-3">
          <v-text-field
            v-model="filtros.buscar"
            label="Código o descripción"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            style="min-width:220px; max-width:300px; flex:1"
            @keyup.enter="buscar"
            @click:clear="() => { filtros.buscar = ''; buscar(); }"
          />

          <v-text-field
            v-model="filtros.proveedor"
            label="Proveedor"
            prepend-inner-icon="mdi-domain"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            style="min-width:180px; max-width:240px; flex:1"
            @keyup.enter="buscar"
            @click:clear="() => { filtros.proveedor = ''; buscar(); }"
          />

          <div class="d-flex gap-2 flex-shrink-0">
            <v-btn
              :variant="filtros.soloCon ? 'flat' : 'outlined'"
              :color="filtros.soloCon ? 'primary' : 'default'"
              size="small"
              rounded="pill"
              :prepend-icon="filtros.soloCon ? 'mdi-check' : 'mdi-percent'"
              :aria-pressed="filtros.soloCon"
              aria-label="Filtrar artículos con descuento"
              class="toggle-btn"
              @click="filtros.soloCon = !filtros.soloCon; buscar()"
              style="height:36px"
            >
              Con descuento
            </v-btn>
            <v-btn
              :variant="filtros.soloStock ? 'flat' : 'outlined'"
              :color="filtros.soloStock ? 'success' : 'default'"
              size="small"
              rounded="pill"
              :prepend-icon="filtros.soloStock ? 'mdi-check' : 'mdi-package-variant'"
              :aria-pressed="filtros.soloStock"
              aria-label="Filtrar artículos con stock disponible"
              class="toggle-btn"
              @click="filtros.soloStock = !filtros.soloStock; buscar()"
              style="height:36px"
            >
              Con stock
            </v-btn>
          </div>

          <v-spacer class="d-none d-sm-block" />

          <v-btn
            color="primary"
            variant="elevated"
            prepend-icon="mdi-magnify"
            :loading="cargando"
            class="flex-shrink-0"
            style="height:36px"
            @click="buscar"
          >
            Buscar
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Tabla -->
    <v-card rounded="xl" elevation="2">
      <v-data-table-server
        :headers="headers"
        :items="articulos"
        :items-length="total"
        :loading="cargando"
        v-model:items-per-page="limit"
        :page="page"
        @update:options="onOptions"
        :items-per-page-options="[25, 50, 100]"
        density="comfortable"
      >
        <template v-slot:no-data>
          <div class="d-flex flex-column align-center py-10">
            <div class="empty-icon-wrap mb-4">
              <v-icon size="40" color="primary">mdi-label-percent-outline</v-icon>
            </div>
            <span class="text-body-1 font-weight-medium text-high-emphasis">Sin resultados</span>
            <span class="text-caption text-medium-emphasis mt-1">Probá con otros filtros o buscá por código</span>
          </div>
        </template>

        <template v-slot:item.CODARTICULO="{ item }">
          <span class="text-caption font-weight-medium text-medium-emphasis">{{ item.CODARTICULO }}</span>
        </template>

        <template v-slot:item.PROVEEDOR="{ item }">
          <v-tooltip :text="item.PROVEEDOR || '—'" location="top">
            <template v-slot:activator="{ props }">
              <span v-bind="props" class="text-caption text-medium-emphasis d-inline-block text-truncate" style="max-width:140px">
                {{ item.PROVEEDOR || '—' }}
              </span>
            </template>
          </v-tooltip>
        </template>

        <template v-slot:item.PRECIO="{ item }">
          <span class="text-body-2">{{ fmtBs(item.PRECIO) }}</span>
        </template>

        <template v-slot:item.PRECIO_FINAL="{ item }">
          <div class="d-flex align-center gap-1">
            <span
              class="text-body-2 font-weight-bold"
              :class="item.DTOARTICULO > 0 ? 'text-success' : ''"
            >{{ fmtBs(item.PRECIO_FINAL) }}</span>
            <v-chip v-if="item.DTOARTICULO > 0" size="x-small" color="success" variant="tonal">
              -{{ item.DTOARTICULO }}%
            </v-chip>
          </div>
        </template>

        <template v-slot:item.STOCK="{ item }">
          <v-chip
            :color="item.STOCK > 0 ? 'success' : 'error'"
            size="small"
            variant="tonal"
          >{{ item.STOCK }}</v-chip>
        </template>

        <template v-slot:item.DTOARTICULO="{ item }">
          <div class="d-flex align-center gap-2">
            <v-chip
              v-if="item.DTOARTICULO > 0"
              color="primary"
              size="small"
              variant="flat"
              prepend-icon="mdi-percent"
            >{{ item.DTOARTICULO }}%</v-chip>
            <span v-else class="text-caption text-medium-emphasis">—</span>
            <v-btn icon="mdi-pencil-outline" size="x-small" variant="text" :aria-label="`Editar descuento de ${item.DESCRIPCION}`" @click="abrirEditar(item)" />
          </div>
        </template>
      </v-data-table-server>
    </v-card>

    <!-- Dialog editar -->
    <v-dialog v-model="modal.mostrar" max-width="420" persistent>
      <v-card rounded="xl">
        <v-card-title class="pa-4 pb-2 text-subtitle-1 font-weight-bold">
          Descuento D3 — {{ modal.descripcion }}
        </v-card-title>
        <v-card-subtitle class="px-4 pb-1 text-caption text-medium-emphasis">
          Cód. {{ modal.codarticulo }} · Precio base: {{ fmtBs(modal.precio) }}
        </v-card-subtitle>
        <v-card-text class="pa-4">
          <v-text-field
            v-model.number="modal.dto"
            label="Descuento D3 (%)"
            type="number"
            min="0"
            max="100"
            step="1"
            variant="outlined"
            density="comfortable"
            suffix="%"
            autofocus
            hint="0 = sin descuento por artículo"
            persistent-hint
            @keyup.enter="guardar"
          />
          <div v-if="modal.precio > 0 && modal.dto > 0" class="mt-3 pa-3 rounded-lg bg-success-lighten-5">
            <span class="text-caption text-medium-emphasis">Precio resultante: </span>
            <span class="text-body-1 font-weight-bold text-success">
              {{ fmtBs(modal.precio * (1 - modal.dto / 100)) }}
            </span>
          </div>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-btn variant="text" @click="modal.mostrar = false">Cancelar</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="elevated" :loading="guardando" @click="guardar">Guardar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.mostrar" :color="snack.color" timeout="3000" location="bottom end">
      {{ snack.texto }}
    </v-snackbar>

  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL ?? '';

const filtros = reactive({ buscar: '', proveedor: '', soloCon: false, soloStock: false });
const page    = ref(1);
const limit   = ref(50);
const total   = ref(0);
const cargando  = ref(false);
const articulos = ref<any[]>([]);

const modal    = ref({ mostrar: false, codarticulo: 0, descripcion: '', dto: 0, precio: 0 });
const guardando = ref(false);
const snack    = ref({ mostrar: false, texto: '', color: 'success' });

const headers = [
  { title: 'Código',        key: 'CODARTICULO', width: 90  },
  { title: 'Descripción',   key: 'DESCRIPCION'             },
  { title: 'Proveedor',     key: 'PROVEEDOR',   width: 160, sortable: false },
  { title: 'Precio base',   key: 'PRECIO',      width: 130, sortable: false },
  { title: 'Precio c/Dto.', key: 'PRECIO_FINAL',width: 150, sortable: false },
  { title: 'Stock',         key: 'STOCK',       width: 90,  sortable: false },
  { title: 'Desc. D3',      key: 'DTOARTICULO', width: 150, sortable: false },
];

// B2: instanciar UNA vez — evita 100+ allocations de Intl.NumberFormat por render de tabla
const bsFormatter = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// B1: v >= 0 para mostrar Bs. 0.00 cuando el descuento es 100%
const fmtBs = (v: number | null | undefined) =>
  (v != null && v >= 0) ? 'Bs. ' + bsFormatter.format(v) : '—';

const lanzarAviso = (texto: string, color = 'success') => {
  snack.value = { mostrar: true, texto, color };
};

// M6: AbortController para cancelar requests obsoletos ante filtros rápidos
let abortController: AbortController | null = null;

const cargar = async () => {
  abortController?.abort();
  abortController = new AbortController();
  cargando.value = true;
  try {
    const r = await axios.get(`${API}/api/descuento-articulo`, {
      params: {
        buscar:    filtros.buscar    || undefined,
        proveedor: filtros.proveedor || undefined,
        soloCon:   filtros.soloCon   ? '1' : undefined,
        soloStock: filtros.soloStock ? '1' : undefined,
        page:      page.value,
        limit:     limit.value,
      },
      signal: abortController.signal,
    });
    articulos.value = r.data.data;
    total.value     = r.data.total;
  } catch (e: any) {
    if (axios.isCancel(e) || e?.code === 'ERR_CANCELED') return;
    lanzarAviso('Error al cargar artículos', 'error');
  } finally {
    cargando.value = false;
  }
};

// A2: resetea página antes de buscar — evita tabla vacía al cambiar filtros desde página > 1
const buscar = () => { page.value = 1; cargar(); };

// M1: onOptions maneja la carga inicial (Vuetify emite update:options al montar)
const onOptions = ({ page: p, itemsPerPage: l }: any) => {
  page.value  = p;
  limit.value = l;
  cargar();
};

const abrirEditar = (item: any) => {
  modal.value = { mostrar: true, codarticulo: item.CODARTICULO, descripcion: item.DESCRIPCION, dto: item.DTOARTICULO, precio: item.PRECIO };
};

const guardar = async () => {
  // A1: validar NaN explícitamente — campo vacío produce NaN que pasaba el rango 0-100
  if (typeof modal.value.dto !== 'number' || isNaN(modal.value.dto) || modal.value.dto < 0 || modal.value.dto > 100) {
    lanzarAviso('El descuento debe ser un número entre 0 y 100', 'warning');
    return;
  }
  guardando.value = true;
  try {
    await axios.patch(`${API}/api/descuento-articulo/${modal.value.codarticulo}`, { dtoArticulo: modal.value.dto });
    const art = articulos.value.find(a => a.CODARTICULO === modal.value.codarticulo);
    if (art) {
      art.DTOARTICULO  = modal.value.dto;
      art.PRECIO_FINAL = +(art.PRECIO * (1 - modal.value.dto / 100)).toFixed(2);
    }
    modal.value.mostrar = false;
    lanzarAviso('Descuento actualizado');
  } catch (e: any) {
    // B4: propagar mensaje del servidor si está disponible
    const msg = e.response?.data?.message ?? 'Error al guardar';
    lanzarAviso(msg, 'error');
  } finally {
    guardando.value = false;
  }
};
</script>

<style scoped>
/* === Tokens del módulo === */
.module-header {
  background: linear-gradient(
    135deg,
    rgb(var(--v-theme-primary) / 0.06) 0%,
    transparent 55%
  );
}

.module-avatar {
  box-shadow:
    0 0 0 3px rgb(var(--v-theme-primary) / 0.12),
    0 4px 10px rgb(var(--v-theme-primary) / 0.18);
}

/* Transición suave en los toggles — evita el snap brusco */
.toggle-btn {
  transition: background-color 160ms cubic-bezier(0.16, 1, 0.3, 1),
              color 160ms cubic-bezier(0.16, 1, 0.3, 1),
              border-color 160ms cubic-bezier(0.16, 1, 0.3, 1) !important;
}

/* Empty state anclado visualmente */
.empty-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary) / 0.08);
}

/* Movimiento respetuoso */
@media (prefers-reduced-motion: reduce) {
  .toggle-btn { transition: none !important; }
}
</style>
