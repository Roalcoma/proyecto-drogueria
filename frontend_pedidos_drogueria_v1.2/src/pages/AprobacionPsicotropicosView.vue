<template>
  <v-container fluid class="pa-6 bg-background h-100">
    <div class="d-flex align-center mb-6">
      <v-icon color="purple-darken-2" size="32" class="mr-3">mdi-shield-alert</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black" style="color: #164E63;">Aprobación de Psicotrópicos</h1>
        <span class="text-caption text-medium-emphasis">Pedidos con artículos controlados pendientes de aprobación</span>
      </div>
      <v-spacer />
      <v-btn prepend-icon="mdi-refresh" variant="tonal" color="primary" :loading="cargando" @click="cargarPedidos">Refrescar</v-btn>
    </div>

    <v-card rounded="xl" elevation="2">
      <div class="pa-4 d-flex flex-wrap gap-3 align-center border-b">
        <v-text-field v-model="filtros.buscarId" label="N° Orden" prepend-inner-icon="mdi-pound"
          variant="outlined" density="compact" hide-details clearable style="min-width:160px;max-width:200px"
          @update:model-value="resetPagina" />
        <v-text-field v-model="filtros.clienteId" label="Cód. Cliente" prepend-inner-icon="mdi-account"
          variant="outlined" density="compact" hide-details clearable style="min-width:140px;max-width:180px"
          @update:model-value="resetPagina" />
        <v-text-field v-model="filtros.fechaDesde" label="Desde" type="date"
          variant="outlined" density="compact" hide-details clearable style="min-width:155px;max-width:175px"
          @update:model-value="resetPagina" />
        <v-text-field v-model="filtros.fechaHasta" label="Hasta" type="date"
          variant="outlined" density="compact" hide-details clearable style="min-width:155px;max-width:175px"
          @update:model-value="resetPagina" />
        <v-btn variant="tonal" color="purple-darken-1" prepend-icon="mdi-magnify" @click="cargarPedidos">Buscar</v-btn>
        <v-btn variant="text" color="grey" prepend-icon="mdi-close" @click="limpiarFiltros">Limpiar</v-btn>
      </div>

      <v-data-table-server
        :headers="headers" :items="pedidos" :items-length="totalPedidos" :loading="cargando"
        v-model:items-per-page="itemsPerPage" @update:options="cargarPagina"
        :items-per-page-options="[10, 25, 50, 100, 200]">
        <template v-slot:item.FECHA="{ item }">
          {{ new Date(item.FECHA).toLocaleString('es-VE', { timeZone: brandingStore.zonaHoraria }) }}
        </template>
        <template v-slot:item.cliente_psico="{ item }">
          <span class="font-weight-medium">{{ item.CLIENTEID }}</span>
          <span v-if="item.NOMBRECLIENTE" class="text-grey ml-1">— {{ item.NOMBRECLIENTE }}</span>
        </template>
        <template v-slot:item.TOTALPRECIO="{ item }">
          <v-chip color="green-darken-1" variant="tonal" class="font-weight-black" style="height: auto; padding: 6px 12px;">
            <MontoDisplay :usd="Number(item.TOTALPRECIO || 0)" :tasa="carritoStore.tasa" align-end />
          </v-chip>
        </template>
        <template v-slot:item.acciones="{ item }">
          <div class="d-flex gap-2 flex-wrap">
            <v-btn size="small" color="purple-darken-1" variant="tonal" prepend-icon="mdi-pencil" @click="abrirDetalle(item)">
              Revisar / Editar
            </v-btn>
            <v-btn size="small" color="red-darken-2" variant="tonal" prepend-icon="mdi-file-pdf-box"
              :loading="pdfCargando === item.ORDERID + '-con'" @click="imprimirPDF(item, false)">
              Con precios
            </v-btn>
            <v-btn size="small" color="blue-grey-darken-1" variant="tonal" prepend-icon="mdi-file-pdf-box"
              :loading="pdfCargando === item.ORDERID + '-sin'" @click="imprimirPDF(item, true)">
              Sanidad
            </v-btn>
          </div>
        </template>
      </v-data-table-server>
    </v-card>

    <!-- Modal principal: revisar / editar / aprobar / cancelar -->
    <v-dialog v-model="modalDetalle.mostrar" max-width="820" :persistent="aprobando || cancelando">
      <v-card rounded="xl" v-if="modalDetalle.pedido">
        <v-card-title class="pa-4 bg-purple-darken-2 text-white d-flex align-center gap-2">
          <v-icon>mdi-shield-alert</v-icon>
          Pedido #{{ modalDetalle.pedido.ORDERID }}
          <v-spacer />
          <span class="text-body-2 font-weight-regular">Cliente: {{ modalDetalle.pedido.CLIENTEID }}<span v-if="modalDetalle.pedido.NOMBRECLIENTE"> — {{ modalDetalle.pedido.NOMBRECLIENTE }}</span></span>
        </v-card-title>

        <v-card-text class="pa-4">
          <!-- Cabecera líneas -->
          <div class="d-flex justify-space-between align-center mb-2">
            <div class="text-subtitle-2 font-weight-bold">Líneas del pedido</div>
            <v-btn size="small" color="purple-darken-1" variant="tonal" prepend-icon="mdi-plus"
              @click="abrirBuscarPsico">
              Agregar psicotrópico
            </v-btn>
          </div>

          <v-table density="compact" class="mb-2 rounded-lg" style="border:1px solid rgba(0,0,0,.12)">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th class="text-center" style="width:100px">Cantidad</th>
                <th class="text-right">Precio unit.</th>
                <th style="width:44px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(l, idx) in lineasLocales" :key="l.LINEAID || `new-${idx}`">
                <td class="text-caption">{{ l.CODARTICULO }}</td>
                <td class="text-caption">{{ l.DESCRIPCION }}</td>
                <td>
                  <v-text-field
                    type="number" v-model.number="l.PRODUCTCOUNT"
                    density="compact" hide-details variant="outlined"
                    :min="1" style="width:80px"
                    @update:model-value="marcarModificado" />
                </td>
                <td class="text-right text-caption">
                  <MontoDisplay :usd="Number(l.PRECIOUNITARIO)" :tasa="carritoStore.tasa" align-end />
                </td>
                <td>
                  <v-btn icon="mdi-delete-outline" size="x-small" color="red-darken-1" variant="text"
                    @click="eliminarLinea(idx)" />
                </td>
              </tr>
              <tr v-if="lineasLocales.length === 0">
                <td colspan="5" class="text-center text-grey py-3 text-caption">Sin líneas — el pedido no puede aprobarse vacío</td>
              </tr>
            </tbody>
          </v-table>

          <div class="d-flex justify-end align-center gap-2 mb-1">
            <span class="text-caption text-grey">Total calculado:</span>
            <strong><MontoDisplay :usd="totalComputed" :tasa="carritoStore.tasa" main-class="font-weight-black text-green-darken-2" /></strong>
          </div>
          <div v-if="lineasModificadas" class="d-flex justify-end mb-3">
            <v-chip size="small" color="orange" variant="tonal" prepend-icon="mdi-pencil">Cambios sin guardar — se guardan al aprobar</v-chip>
          </div>

          <v-divider class="my-4" />

          <div class="text-subtitle-2 font-weight-bold mb-2">Código de aprobación gubernamental</div>
          <div class="d-flex gap-2 align-start">
            <v-text-field v-model="codigoAprobacion" label="Código" variant="outlined" density="comfortable"
              hint="Requerido para aprobar el pedido" persistent-hint autofocus style="flex:1" />
            <v-btn color="blue-grey" variant="tonal" class="mt-1" :loading="guardandoCodigo"
              :disabled="aprobando || cancelando" @click="guardarCodigo">
              <v-icon start>mdi-content-save</v-icon>Guardar código
            </v-btn>
          </div>
        </v-card-text>

        <v-card-actions class="pa-4 pt-0">
          <v-btn color="red-darken-2" variant="tonal" prepend-icon="mdi-cancel"
            :loading="cancelando" :disabled="aprobando" @click="confirmarCancelar = true">
            Cancelar pedido
          </v-btn>
          <v-spacer />
          <v-btn variant="text" :disabled="aprobando || cancelando" @click="modalDetalle.mostrar = false">Cerrar</v-btn>
          <v-btn color="purple-darken-1" variant="elevated"
            :loading="aprobando" :disabled="!codigoAprobacion.trim() || lineasLocales.length === 0 || cancelando"
            @click="aprobar">
            <v-icon start>mdi-check-circle</v-icon>
            Aprobar → Pendiente
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Confirm cancel dialog -->
    <v-dialog v-model="confirmarCancelar" max-width="380">
      <v-card rounded="xl">
        <v-card-title class="pa-4 text-red-darken-2"><v-icon class="mr-2">mdi-alert</v-icon>Cancelar pedido</v-card-title>
        <v-card-text>¿Estás seguro de que deseas cancelar el pedido <strong>#{{ modalDetalle.pedido?.ORDERID }}</strong>? Esta acción no se puede deshacer.</v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="confirmarCancelar = false">No, volver</v-btn>
          <v-btn color="red-darken-2" variant="elevated" :loading="cancelando" @click="cancelarPedido">Sí, cancelar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog búsqueda de psicotrópicos para agregar -->
    <v-dialog v-model="buscarPsicoDialog" max-width="640">
      <v-card rounded="xl">
        <v-card-title class="pa-4 bg-purple-darken-1 text-white">
          <v-icon class="mr-2">mdi-pill</v-icon>Agregar artículo psicotrópico
        </v-card-title>
        <v-card-text class="pa-4">
          <div class="d-flex gap-2 mb-3">
            <v-text-field v-model="busquedaPsico" label="Buscar por nombre, principio activo o referencia"
              variant="outlined" density="compact" prepend-inner-icon="mdi-magnify"
              clearable hide-details @keyup.enter="buscarPsicotropicos" style="flex:1" />
            <v-btn color="purple" variant="tonal" :loading="cargandoPsico" @click="buscarPsicotropicos">Buscar</v-btn>
          </div>

          <v-table density="compact" v-if="productosPsico.length" class="rounded-lg" style="border:1px solid rgba(0,0,0,.12)">
            <thead>
              <tr>
                <th>Descripción</th>
                <th class="text-center">Stock</th>
                <th class="text-right">Precio</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in productosPsico" :key="p.CODARTICULO">
                <td class="text-caption text-wrap" style="max-width:240px">{{ p.DESCRIPCION }}</td>
                <td class="text-center text-caption">{{ p.STOCKTOTAL }}</td>
                <td class="text-right text-caption">
                  <MontoDisplay :usd="Number(p.prices?.[0]?.PNETO || 0)" :tasa="carritoStore.tasa" align-end />
                </td>
                <td>
                  <v-btn size="x-small" color="purple-darken-1" variant="tonal" @click="agregarProducto(p)">
                    Agregar
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>

          <div v-else-if="!cargandoPsico && busquedaPsicoBuscada" class="text-grey text-center py-6 text-caption">
            Sin resultados para "{{ busquedaPsicoBuscada }}"
          </div>
          <div v-else-if="!cargandoPsico" class="text-grey text-center py-6 text-caption">
            Ingrese un término y presione Buscar
          </div>

          <div class="d-flex justify-center mt-3" v-if="totalPsico > limitePsico">
            <v-pagination v-model="paginaPsico" :length="Math.ceil(totalPsico / limitePsico)"
              size="small" @update:model-value="buscarPsicotropicos" />
          </div>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="buscarPsicoDialog = false">Cerrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="aviso.mostrar" :color="aviso.color" timeout="3500">{{ aviso.texto }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import axios from 'axios';
import { usePageSize } from '../utils/usePageSize';
import { useCarritoStore } from '../stores/useCarritoStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useBrandingStore } from '../stores/useBrandingStore';
import MontoDisplay from '../components/MontoDisplay.vue';
import { generarPedidoPDF } from '../utils/pedidoPDF';

const carritoStore  = useCarritoStore();
const authStore     = useAuthStore();
const brandingStore = useBrandingStore();
const API = import.meta.env.VITE_API_URL;
const ESTATUS = 'APROBACION PSICOTROPICOS';

// --- Lista principal ---
const pedidos      = ref<any[]>([]);
const totalPedidos = ref(0);
const cargando     = ref(false);
const itemsPerPage = usePageSize('aprobacion-psico');
const pagina       = ref(1);
const headers = [
  { title: 'Orden',   key: 'ORDERID' },
  { title: 'Fecha',   key: 'FECHA' },
  { title: 'Cliente', key: 'cliente_psico', sortable: false },
  { title: 'Total',   key: 'TOTALPRECIO' },
  { title: '',        key: 'acciones', sortable: false },
];

const pdfCargando = ref<string | null>(null);
const aviso = ref({ mostrar: false, texto: '', color: 'success' });
const lanzarAviso = (texto: string, color = 'success') => { aviso.value = { mostrar: true, texto, color }; };

const filtros = ref({ buscarId: '', clienteId: '', fechaDesde: '', fechaHasta: '' });
const resetPagina = () => { pagina.value = 1; cargarPedidos(); };
const limpiarFiltros = () => { filtros.value = { buscarId: '', clienteId: '', fechaDesde: '', fechaHasta: '' }; resetPagina(); };

const cargarPedidos = async () => {
  cargando.value = true;
  try {
    const params: any = { estatus: ESTATUS, page: pagina.value, limit: itemsPerPage.value };
    if (filtros.value.buscarId)   params.buscarId   = filtros.value.buscarId;
    if (filtros.value.clienteId)  params.clienteId  = filtros.value.clienteId;
    if (filtros.value.fechaDesde) params.fechaDesde = filtros.value.fechaDesde;
    if (filtros.value.fechaHasta) params.fechaHasta = filtros.value.fechaHasta;
    const res = await axios.get(`${API}/pedidos`, { params });
    if (res.data.success) { pedidos.value = res.data.data; totalPedidos.value = res.data.total; }
  } finally { cargando.value = false; }
};
const cargarPagina = (opt: any) => { pagina.value = opt.page; itemsPerPage.value = opt.itemsPerPage; cargarPedidos(); };

// --- Modal detalle/editar ---
const modalDetalle     = ref<any>({ mostrar: false, pedido: null });
const lineasLocales    = ref<any[]>([]);
const pedidoOriginal   = ref<any>(null);
const lineasModificadas = ref(false);
const codigoAprobacion = ref('');
const aprobando        = ref(false);
const cancelando       = ref(false);
const confirmarCancelar = ref(false);

const totalComputed = computed(() =>
  lineasLocales.value.reduce((sum, l) => sum + Number(l.PRECIOUNITARIO) * Math.max(1, Number(l.PRODUCTCOUNT) || 1), 0)
);

const marcarModificado = () => { lineasModificadas.value = true; };

const eliminarLinea = (idx: number) => {
  lineasLocales.value.splice(idx, 1);
  lineasModificadas.value = true;
};

const guardandoCodigo = ref(false);

const abrirDetalle = async (item: any) => {
  lineasModificadas.value = false;
  const res = await axios.get(`${API}/pedidos`, { params: { orderId: item.ORDERID } });
  if (res.data.success) {
    pedidoOriginal.value = res.data.data;
    codigoAprobacion.value = res.data.data.OBSERVACIONES || '';
    lineasLocales.value = (res.data.data.lineas || []).map((l: any) => ({ ...l }));
    modalDetalle.value = { mostrar: true, pedido: res.data.data };
  }
};

const guardarCodigo = async () => {
  if (!pedidoOriginal.value) return;
  guardandoCodigo.value = true;
  try {
    const res = await axios.put(`${API}/pedidos/codigo-aprobacion`, {
      orderId: pedidoOriginal.value.ORDERID,
      codigo: codigoAprobacion.value,
    });
    if (res.data.success) {
      lanzarAviso('Código guardado');
    } else {
      lanzarAviso(res.data.message || 'Error al guardar', 'error');
    }
  } catch (e: any) {
    lanzarAviso(e.response?.data?.message || 'Error al guardar', 'error');
  } finally {
    guardandoCodigo.value = false;
  }
};

const guardarLineas = async () => {
  const p = pedidoOriginal.value;
  const res = await axios.put(`${API}/pedidos`, {
    pedidos: {
      orderId:    p.ORDERID,
      clienteId:  p.CLIENTEID,
      codVendedor: p.CODVENDEDOR || 1,
      totalPed:   totalComputed.value,
      lineas: lineasLocales.value.map((l: any) => ({
        codarticulo:  l.CODARTICULO,
        referencia:   l.REFERENCIA  || '',
        codalmacen:   l.CODALMACEN  || '',
        idtarifav:    l.IDTARIFAV   || 0,
        cantidad:     Math.max(1, Number(l.PRODUCTCOUNT) || 1),
        precio:       Number(l.PRECIOUNITARIO) || 0,
        DESCUENTO1:   Number(l.DESCUENTO1  || 0),
        DESCUENTO2:   Number(l.DESCUENTO2  || 0),
        DESCUENTO3:   Number(l.DESCUENTO3  || 0),
        DESCUENTO4:   Number(l.DESCUENTO4  || 0),
        PRECIOBRUTO:  Number(l.PRECIOBRUTO || l.PRECIOUNITARIO) || 0,
      })),
    },
  });
  return res.data;
};

const aprobar = async () => {
  if (!pedidoOriginal.value) return;
  if (lineasLocales.value.length === 0) { lanzarAviso('El pedido debe tener al menos una línea', 'error'); return; }
  aprobando.value = true;
  try {
    if (lineasModificadas.value) {
      const saveRes = await guardarLineas();
      if (!saveRes.success) { lanzarAviso(saveRes.message || 'Error al guardar cambios', 'error'); return; }
      lineasModificadas.value = false;
    }
    const res = await axios.put(`${API}/pedidos/aprobar-psicotropico`, {
      orderId: pedidoOriginal.value.ORDERID,
      codigoAprobacion: codigoAprobacion.value,
    });
    if (res.data.success) {
      lanzarAviso('Pedido aprobado — liberado a PENDIENTE POR AUTORIZACIÓN');
      modalDetalle.value.mostrar = false;
      cargarPedidos();
    } else {
      lanzarAviso(res.data.message || 'Error al aprobar', 'error');
    }
  } catch (e: any) {
    lanzarAviso(e.response?.data?.message || 'Error al aprobar', 'error');
  } finally {
    aprobando.value = false;
  }
};

const cancelarPedido = async () => {
  if (!pedidoOriginal.value) return;
  cancelando.value = true;
  confirmarCancelar.value = false;
  try {
    const res = await axios.put(`${API}/pedidos/status`, {
      orderId: pedidoOriginal.value.ORDERID,
      status: 'CANCELADO',
    });
    if (res.data.success) {
      lanzarAviso('Pedido cancelado correctamente');
      modalDetalle.value.mostrar = false;
      cargarPedidos();
    } else {
      lanzarAviso(res.data.message || 'Error al cancelar', 'error');
    }
  } catch (e: any) {
    lanzarAviso(e.response?.data?.message || 'Error al cancelar', 'error');
  } finally {
    cancelando.value = false;
  }
};

// --- Buscar psicotrópicos para agregar ---
const buscarPsicoDialog   = ref(false);
const busquedaPsico       = ref('');
const busquedaPsicoBuscada = ref('');
const productosPsico      = ref<any[]>([]);
const totalPsico          = ref(0);
const cargandoPsico       = ref(false);
const paginaPsico         = ref(1);
const limitePsico         = 8;

const abrirBuscarPsico = () => {
  busquedaPsico.value = '';
  busquedaPsicoBuscada.value = '';
  productosPsico.value = [];
  totalPsico.value = 0;
  paginaPsico.value = 1;
  buscarPsicoDialog.value = true;
};

const buscarPsicotropicos = async () => {
  cargandoPsico.value = true;
  busquedaPsicoBuscada.value = busquedaPsico.value;
  try {
    const res = await axios.get(`${API}/products/get-products`, {
      params: { articulo: busquedaPsico.value, page: paginaPsico.value, limit: limitePsico, solo_controlados: true },
    });
    if (res.data.success) { productosPsico.value = res.data.data; totalPsico.value = res.data.total; }
  } finally { cargandoPsico.value = false; }
};

const agregarProducto = (producto: any) => {
  const primerLinea = lineasLocales.value[0];
  const precio = Number(producto.prices?.[0]?.PNETO || 0);
  lineasLocales.value.push({
    LINEAID:        null,
    CODARTICULO:    producto.CODARTICULO,
    DESCRIPCION:    producto.DESCRIPCION || producto.REFPROVEEDOR || String(producto.CODARTICULO),
    REFERENCIA:     producto.REFPROVEEDOR || '',
    CODALMACEN:     primerLinea?.CODALMACEN || '',
    IDTARIFAV:      producto.prices?.[0]?.IDTARIFAV || 0,
    PRODUCTCOUNT:   1,
    PRECIOUNITARIO: precio,
    PRECIOBRUTO:    precio,
    DESCUENTO1: 0, DESCUENTO2: 0, DESCUENTO3: 0, DESCUENTO4: 0,
    TOTALLINEA: precio,
  });
  lineasModificadas.value = true;
  lanzarAviso(`${producto.DESCRIPCION} agregado`);
};

// --- PDF ---
const imprimirPDF = async (item: any, sinPrecios: boolean) => {
  const key = item.ORDERID + (sinPrecios ? '-sin' : '-con');
  pdfCargando.value = key;
  try {
    const res = await axios.get(`${API}/pedidos`, { params: { orderId: item.ORDERID } });
    if (!res.data.success) { lanzarAviso('No se pudo cargar el pedido', 'error'); return; }
    const pedido = res.data.data;
    const tz = { timeZone: brandingStore.zonaHoraria };
    await generarPedidoPDF({
      numeroOrden: item.ORDERID,
      fecha: item.FECHA,
      estatus: item.ESTATUS,
      esPsicotropico: true,
      cliente: {
        codcliente:      item.CLIENTEID,
        nombrecliente:   item.NOMBRECLIENTE || `Cliente ${item.CLIENTEID}`,
        nombrecomercial: item.NOMBRECOMERCIAL || '',
        nit:             item.NIF20 || '',
        direccionFiscal: item.DIRECCION1 || '',
        direccionEnvio:  item.DIRECCION_ENVIO || '',
      },
      lineas: (pedido.lineas || []).map((l: any) => ({
        codigo:           l.CODARTICULO,
        descripcion:      l.DESCRIPCION || '',
        cantidad:         Number(l.PRODUCTCOUNT),
        precioUnitario:   Number(l.PRECIOUNITARIO ?? 0),
        descuentos:       [l.DESCUENTO1, l.DESCUENTO2, l.DESCUENTO3, l.DESCUENTO4].map(Number).filter(d => d > 0),
        diasProteccion:   Number(l.DIASPROTECCION ?? 0),
        porcentajeIva:    Number(l.PORCENTAJEIVA ?? 0),
        esControlado:     true,
        lote:             l.LOTE || '',
        fechaVencimiento: l.FECHA_VENCIMIENTO || '',
      })),
      totalUSD:      Number(pedido.TOTALPRECIO ?? 0),
      ocultarPrecios: sinPrecios,
      firmante: {
        usuario: authStore.usuario?.usuario || 'Usuario desconocido',
        fecha:   new Date().toLocaleDateString('es-VE', tz),
      },
    });
  } catch {
    lanzarAviso('Error al generar el PDF', 'error');
  } finally {
    pdfCargando.value = null;
  }
};

let refreshInterval: ReturnType<typeof setInterval> | null = null;
onMounted(() => { refreshInterval = setInterval(cargarPedidos, 60_000); });
onUnmounted(() => { if (refreshInterval) clearInterval(refreshInterval); });
</script>
