<template>
  <v-container fluid class="pa-0 bg-background" style="height:calc(100vh - 64px);display:flex;flex-direction:column;overflow:hidden">

    <!-- Header -->
    <div class="px-6 pt-4 pb-1">
      <h1 style="font-size:1.5rem;font-weight:700;color:#164E63;">Compras</h1>
    </div>

    <v-tabs v-model="tab" color="primary" class="px-4">
      <v-tab value="albaranes" prepend-icon="mdi-clipboard-text-outline">Albaranes de Compra</v-tab>
      <v-tab value="rechequeo" prepend-icon="mdi-barcode-scan">Rechequeo</v-tab>
    </v-tabs>
    <v-divider />

    <v-window v-model="tab" style="flex:1;overflow:hidden">

      <!-- ═══════════════════════ TAB 1: ALBARANES ═══════════════════════════ -->
      <v-window-item value="albaranes" style="height:100%;overflow:hidden">
        <v-container fluid class="pa-4" style="height:100%;overflow:hidden">
          <v-row style="height:100%">

            <!-- Panel izquierdo: filtros + lista -->
            <v-col cols="12" md="4" lg="3" style="height:100%;display:flex;flex-direction:column">
              <v-card rounded="xl" elevation="2" style="flex:1;display:flex;flex-direction:column;overflow:hidden">
                <div class="pa-4 pb-2 d-flex align-center gap-2">
                  <v-icon color="primary" size="18">mdi-filter-outline</v-icon>
                  <span class="text-subtitle-2 font-weight-bold">Albaranes ZACA</span>
                  <v-chip size="x-small" color="primary" variant="tonal" class="ml-auto">{{ albTotal }}</v-chip>
                </div>
                <v-divider />
                <div class="px-3 pt-3 pb-2">
                  <v-text-field v-model="albFiltros.numalbaran" label="N° Albarán" variant="outlined" density="compact"
                    hide-details clearable prepend-inner-icon="mdi-magnify" class="mb-2"
                    @keyup.enter="buscarAlbaranes" type="number" />
                  <v-row dense class="mb-2">
                    <v-col><v-text-field v-model="albFiltros.desde" type="date" label="Desde" variant="outlined" density="compact" hide-details /></v-col>
                    <v-col><v-text-field v-model="albFiltros.hasta" type="date" label="Hasta" variant="outlined" density="compact" hide-details /></v-col>
                  </v-row>
                  <v-text-field v-model="albFiltros.proveedor" label="Proveedor" variant="outlined" density="compact" hide-details clearable prepend-inner-icon="mdi-domain" class="mb-2" @keyup.enter="buscarAlbaranes" />
                  <v-btn block color="primary" variant="elevated" :loading="cargandoAlb" @click="buscarAlbaranes" prepend-icon="mdi-magnify">Buscar</v-btn>
                </div>

                <v-divider />

                <div style="flex:1;overflow-y:auto" class="pa-2">
                  <v-progress-linear v-if="cargandoAlb" indeterminate color="primary" class="mb-1" />
                  <div v-if="!albaranes.length && !cargandoAlb" class="text-caption text-medium-emphasis pa-2">
                    No hay resultados
                  </div>
                  <v-list-item
                    v-for="alb in albaranes"
                    :key="`${alb.NUMSERIE}-${alb.NUMALBARAN}`"
                    :active="albSeleccionado?.NUMSERIE === alb.NUMSERIE && albSeleccionado?.NUMALBARAN === alb.NUMALBARAN"
                    active-color="primary"
                    rounded="lg"
                    density="compact"
                    @click="seleccionarAlbaran(alb)"
                    class="mb-1"
                  >
                    <v-list-item-title class="text-body-2 font-weight-bold">
                      ZACA-{{ Number(alb.NUMALBARAN) }}
                    </v-list-item-title>
                    <v-list-item-subtitle class="text-caption text-truncate" style="max-width:140px">
                      {{ alb.NOMPROVEEDOR || alb.CODPROVEEDOR }}
                    </v-list-item-subtitle>
                    <template #append>
                      <span class="text-caption text-medium-emphasis">{{ alb.FECHA }}</span>
                    </template>
                  </v-list-item>

                  <div v-if="albTotal > 50" class="d-flex justify-center mt-2">
                    <v-pagination v-model="albPage" :length="Math.ceil(albTotal/50)" density="compact" total-visible="4" @update:model-value="buscarAlbaranes" />
                  </div>
                </div>
              </v-card>
            </v-col>

            <!-- Panel derecho: detalle -->
            <v-col cols="12" md="8" lg="9" style="height:100%;overflow-y:auto">
              <div v-if="!albDetalle" class="d-flex align-center justify-center" style="height:100%">
                <div class="text-center text-medium-emphasis">
                  <v-icon size="64" color="grey-lighten-1">mdi-file-document-outline</v-icon>
                  <p class="mt-3">Seleccioná un albarán de la lista</p>
                </div>
              </div>

              <template v-else>
                <!-- Cabecera del albarán -->
                <v-card rounded="xl" elevation="2" class="mb-4">
                  <v-card-text class="pa-4">
                    <v-row align="start" dense>
                      <v-col>
                        <span class="text-h6 font-weight-bold">
                          Compra {{ albDetalle.ESTATUS }} — {{ albDetalle.NUMSERIE }}-{{ String(albDetalle.NUMALBARAN).padStart(8,'0') }}
                        </span>
                        <div class="d-flex flex-wrap gap-2 mt-2">
                          <v-chip size="small" color="secondary" variant="tonal" prepend-icon="mdi-domain">
                            {{ albDetalle.NOMPROVEEDOR || albDetalle.CODPROVEEDOR }}
                          </v-chip>
                          <v-chip size="small" variant="tonal" prepend-icon="mdi-calendar">{{ albDetalle.FECHA }}</v-chip>
                          <v-chip size="small" variant="tonal" prepend-icon="mdi-warehouse">Almacén: {{ albDetalle.CODALMACEN }}</v-chip>
                        </div>
                      </v-col>
                      <v-col cols="auto">
                        <v-btn color="primary" variant="elevated" prepend-icon="mdi-file-pdf-box" :loading="generandoPdf" @click="generarPdfAlbaran">
                          PDF
                        </v-btn>
                      </v-col>
                    </v-row>

                    <v-row dense class="mt-3">
                      <v-col cols="6" md="3">
                        <div class="text-caption text-medium-emphasis">Actualizado</div>
                        <div class="text-body-2">{{ albDetalle.FECHAACTUALIZADO || '—' }}</div>
                      </v-col>
                      <v-col cols="6" md="3">
                        <div class="text-caption text-medium-emphasis">Vencimiento</div>
                        <div class="text-body-2">{{ albDetalle.FECHAVENCIMIENTO || '—' }}</div>
                      </v-col>
                      <v-col cols="6" md="3">
                        <div class="text-caption text-medium-emphasis">Peso Neto / Unidades</div>
                        <div class="text-body-2">{{ albDetalle.PESONETO }} kg / {{ albDetalle.UNIDADES }}</div>
                      </v-col>
                      <v-col v-if="albDetalle.NUMSERIEFAC || albDetalle.NUMFAC" cols="6" md="3">
                        <div class="text-caption text-medium-emphasis">Factura Compra</div>
                        <div class="text-body-2">{{ albDetalle.NUMSERIEFAC }}-{{ albDetalle.NUMFAC }}</div>
                      </v-col>
                      <v-col v-if="albDetalle.OBSERVACION" cols="12">
                        <div class="text-caption text-medium-emphasis">Observación</div>
                        <div class="text-body-2">{{ albDetalle.OBSERVACION }}</div>
                      </v-col>
                    </v-row>
                  </v-card-text>
                </v-card>

                <!-- Líneas -->
                <v-card rounded="xl" elevation="2" class="mb-4">
                  <v-progress-linear v-if="cargandoAlbDetalle" indeterminate color="primary" />
                  <v-data-table
                    :headers="headersAlb"
                    :items="albLineas"
                    density="compact"
                    :items-per-page="500"
                    hide-default-footer
                    class="alb-tabla"
                  >
                    <template #item.PVENTA="{ item }">{{ fmt(item.PVENTA) }}</template>
                    <template #item.COSTO="{ item }">{{ fmt(item.COSTO) }}</template>
                    <template #item.IMPORTE="{ item }">{{ fmt(item.IMPORTE) }}</template>
                  </v-data-table>
                </v-card>

                <!-- Totales -->
                <v-card rounded="xl" elevation="2">
                  <v-card-text>
                    <v-row dense>
                      <v-col cols="6" md="3">
                        <div class="text-caption text-medium-emphasis">Exento</div>
                        <div class="text-body-2 font-weight-medium">{{ fmt(albDetalle.EXENTO) }} Bs</div>
                        <div class="text-caption text-teal-darken-2">$ {{ fmtUSD(albDetalle.EXENTO) }}</div>
                      </v-col>
                      <v-col cols="6" md="3">
                        <div class="text-caption text-medium-emphasis">Base Imponible</div>
                        <div class="text-body-2 font-weight-medium">{{ fmt(albDetalle.BASEIMPONIBLE) }} Bs</div>
                        <div class="text-caption text-teal-darken-2">$ {{ fmtUSD(albDetalle.BASEIMPONIBLE) }}</div>
                      </v-col>
                      <v-col cols="6" md="3">
                        <div class="text-caption text-medium-emphasis">Total IVA</div>
                        <div class="text-body-2 font-weight-medium">{{ fmt(albDetalle.TOTALIVA) }} Bs</div>
                        <div class="text-caption text-teal-darken-2">$ {{ fmtUSD(albDetalle.TOTALIVA) }}</div>
                      </v-col>
                      <v-col cols="6" md="3">
                        <div class="text-caption text-medium-emphasis">Total</div>
                        <div class="text-body-2 font-weight-bold text-primary">{{ fmt(albDetalle.TOTAL) }} Bs</div>
                        <div class="text-caption font-weight-bold text-teal-darken-2">$ {{ fmtUSD(albDetalle.TOTAL) }}</div>
                      </v-col>
                      <v-col cols="6" md="3">
                        <div class="text-caption text-medium-emphasis">Ret. IVA</div>
                        <div class="text-body-2 font-weight-medium">{{ fmt(albDetalle.RETIVA) }} Bs</div>
                        <div class="text-caption text-teal-darken-2">$ {{ fmtUSD(albDetalle.RETIVA) }}</div>
                      </v-col>
                      <v-col cols="6" md="3">
                        <div class="text-caption text-medium-emphasis">ISLR</div>
                        <div class="text-body-2 font-weight-medium">{{ fmt(albDetalle.ISLR) }} Bs</div>
                        <div class="text-caption text-teal-darken-2">$ {{ fmtUSD(albDetalle.ISLR) }}</div>
                      </v-col>
                      <v-col cols="6" md="3">
                        <div class="text-caption text-medium-emphasis">Neto CxP</div>
                        <div class="text-body-2 font-weight-medium">{{ fmt(albDetalle.NETOCXP) }} Bs</div>
                        <div class="text-caption text-teal-darken-2">$ {{ fmtUSD(albDetalle.NETOCXP) }}</div>
                      </v-col>
                      <v-col cols="6" md="3">
                        <div class="text-caption text-medium-emphasis">Dto. Comercial</div>
                        <div class="text-body-2 font-weight-medium">{{ fmt(albDetalle.DTOCOMERCIAL) }} Bs</div>
                        <div class="text-caption text-teal-darken-2">$ {{ fmtUSD(albDetalle.DTOCOMERCIAL) }}</div>
                      </v-col>
                    </v-row>
                  </v-card-text>
                </v-card>
              </template>
            </v-col>
          </v-row>
        </v-container>
      </v-window-item>

      <!-- ═══════════════════════ TAB 2: RECHEQUEO ══════════════════════════ -->
      <v-window-item value="rechequeo" style="height:100%;overflow:hidden">

        <!-- PRÓXIMAMENTE — cambiar HABILITADO a true para activar -->
        <div v-if="!HABILITADO" class="d-flex align-center justify-center" style="height:100%">
          <div class="text-center">
            <v-icon size="72" color="teal-darken-2" class="mb-3">mdi-wrench-clock</v-icon>
            <div class="text-h5 font-weight-bold text-teal-darken-2 mb-1">Próximamente</div>
            <div class="text-body-2 text-medium-emphasis">Esta sección estará disponible pronto.</div>
          </div>
        </div>

        <v-container v-else fluid class="pa-4" style="height:100%;overflow:hidden">
          <v-row style="height:100%">

            <!-- ── Panel izquierdo ──────────────────────────────────────────── -->
            <v-col cols="12" md="4" lg="3" style="height:100%;display:flex;flex-direction:column">
              <v-card rounded="xl" elevation="2" style="flex:1;display:flex;flex-direction:column;overflow:hidden">
                <v-card-title class="d-flex align-center gap-2 pa-4 pb-2">
                  <v-icon color="primary">mdi-clipboard-list-outline</v-icon>
                  <span class="text-subtitle-1 font-weight-bold">Compras</span>
                </v-card-title>
                <v-divider />

                <div style="flex:1;overflow-y:auto">
                  <!-- Mis pedidos -->
                  <div class="px-2 pt-2">
                    <div class="d-flex align-center gap-2 px-2 py-1">
                      <v-icon size="16" color="primary">mdi-lock</v-icon>
                      <span class="text-caption font-weight-bold text-primary">MIS PEDIDOS</span>
                      <v-chip size="x-small" color="primary">{{ misPedidos.length }}</v-chip>
                      <v-progress-circular v-if="cargandoMios" size="14" width="2" indeterminate color="primary" class="ms-auto" />
                    </div>
                    <div v-if="!misPedidos.length && !cargandoMios" class="text-caption text-medium-emphasis pa-2">
                      No tenés pedidos tomados
                    </div>
                    <v-list-item
                      v-for="p in misPedidos"
                      :key="`mio-${p.NUMSERIE}-${p.NUMPEDIDO}-${p.N}`"
                      :active="esMismoPedido(p, pedidoActual)"
                      active-color="primary"
                      rounded="lg"
                      density="compact"
                      @click="seleccionarMiPedido(p)"
                      class="mb-1"
                    >
                      <v-list-item-title class="text-body-2 font-weight-medium">
                        {{ p.NUMSERIE }}-{{ p.NUMPEDIDO }}-{{ p.N }}
                      </v-list-item-title>
                      <v-list-item-subtitle class="text-caption text-truncate">
                        {{ p.PROVEEDOR || 'Sin proveedor' }}
                      </v-list-item-subtitle>
                      <template #append>
                        <v-chip size="x-small" color="warning" variant="tonal">{{ p.TOTAL_PENDIENTES }}</v-chip>
                      </template>
                    </v-list-item>
                  </div>

                  <v-divider class="my-2" />

                  <!-- Disponibles -->
                  <div class="px-2 pb-2">
                    <div class="d-flex align-center gap-2 px-2 py-1">
                      <v-icon size="16" color="secondary">mdi-clipboard-text-outline</v-icon>
                      <span class="text-caption font-weight-bold text-secondary">DISPONIBLES</span>
                      <v-chip size="x-small" color="secondary">{{ disponibles.length }}</v-chip>
                      <v-progress-circular v-if="cargandoDisp" size="14" width="2" indeterminate color="secondary" class="ms-auto" />
                    </div>
                    <div v-if="!disponibles.length && !cargandoDisp" class="text-caption text-medium-emphasis pa-2">
                      No hay pedidos disponibles
                    </div>
                    <v-list-item
                      v-for="p in disponibles"
                      :key="`disp-${p.NUMSERIE}-${p.NUMPEDIDO}-${p.N}`"
                      rounded="lg"
                      density="compact"
                      @click="abrirDialogTomar(p)"
                      class="mb-1"
                    >
                      <v-list-item-title class="text-body-2">
                        {{ p.NUMSERIE }}-{{ p.NUMPEDIDO }}-{{ p.N }}
                      </v-list-item-title>
                      <v-list-item-subtitle class="text-caption text-truncate">
                        {{ p.PROVEEDOR || 'Sin proveedor' }}
                      </v-list-item-subtitle>
                      <template #append>
                        <div class="d-flex align-center gap-1">
                          <v-chip size="x-small" color="warning" variant="tonal">{{ p.TOTAL_PENDIENTES }}</v-chip>
                          <v-btn size="x-small" color="primary" variant="tonal" icon="mdi-hand-pointing-right" />
                        </div>
                      </template>
                    </v-list-item>
                  </div>

                  <v-divider class="my-2" />

                  <!-- Cerrados -->
                  <div class="px-2 pb-2">
                    <div class="d-flex align-center gap-2 px-2 py-1">
                      <v-icon size="16" color="success">mdi-check-circle-outline</v-icon>
                      <span class="text-caption font-weight-bold text-success">CERRADOS</span>
                      <v-chip size="x-small" color="success">{{ cerrados.length }}</v-chip>
                    </div>
                    <div v-if="!cerrados.length" class="text-caption text-medium-emphasis pa-2">
                      Sin pedidos cerrados
                    </div>
                    <v-list-item
                      v-for="c in cerrados"
                      :key="`cerr-${c.ID}`"
                      rounded="lg"
                      density="compact"
                      @click="verDetalleCerrado(c)"
                      class="mb-1"
                    >
                      <v-list-item-title class="text-body-2">
                        {{ c.NUMSERIE }}-{{ c.NUMPEDIDO }}-{{ c.N }}
                      </v-list-item-title>
                      <v-list-item-subtitle class="text-caption text-truncate">
                        {{ c.PROVEEDOR || 'Sin proveedor' }} · {{ c.IDFACTURA }}
                      </v-list-item-subtitle>
                      <template #append>
                        <v-chip size="x-small" color="success" variant="tonal">{{ c.TOTAL_CONTADAS }}</v-chip>
                      </template>
                    </v-list-item>
                  </div>
                </div>
              </v-card>
            </v-col>

            <!-- ── Panel derecho ────────────────────────────────────────────── -->
            <v-col cols="12" md="8" lg="9" style="height:100%;overflow-y:auto">
              <div v-if="!pedidoActual" class="d-flex align-center justify-center" style="height:100%">
                <div class="text-center text-medium-emphasis">
                  <v-icon size="64" color="grey-lighten-1">mdi-clipboard-search-outline</v-icon>
                  <p class="mt-3">Tomá un pedido de la lista para comenzar</p>
                </div>
              </div>

              <template v-else>
                <v-card rounded="xl" elevation="2" class="mb-4">
                  <v-card-text class="pa-4">
                    <v-row align="start" dense>
                      <v-col>
                        <span class="text-h6 font-weight-bold">
                          Pedido {{ pedidoActual.NUMSERIE }}-{{ pedidoActual.NUMPEDIDO }}-{{ pedidoActual.N }}
                        </span>
                        <div class="d-flex align-center gap-2 mt-1 flex-wrap">
                          <v-chip size="small" color="secondary" variant="tonal" prepend-icon="mdi-domain">
                            {{ pedidoActual.PROVEEDOR || 'Sin proveedor' }}
                          </v-chip>
                          <v-chip size="small" variant="tonal" prepend-icon="mdi-calendar">{{ pedidoActual.FECHAPEDIDO }}</v-chip>
                          <v-chip size="small" color="warning" prepend-icon="mdi-clock-outline">
                            {{ pedidoActual.TOTAL_PENDIENTES }} pendientes
                          </v-chip>
                        </div>
                        <div class="d-flex align-center gap-1 flex-wrap mt-2">
                          <span class="text-caption text-medium-emphasis me-1">Mis IDs:</span>
                          <v-chip
                            v-for="cab in myCabs"
                            :key="cab.ID"
                            size="small"
                            :color="activeCab?.ID === cab.ID ? 'primary' : 'default'"
                            :variant="activeCab?.ID === cab.ID ? 'elevated' : 'tonal'"
                            prepend-icon="mdi-file-document-outline"
                            @click="seleccionarCab(cab)"
                            style="cursor:pointer"
                          >{{ cab.IDFACTURA }}</v-chip>
                          <v-btn size="x-small" color="primary" variant="text" prepend-icon="mdi-plus" @click="abrirDialogTomarActual">
                            Agregar
                          </v-btn>
                        </div>
                        <div v-if="otrosCabs.length" class="d-flex align-center gap-1 flex-wrap mt-1">
                          <span class="text-caption text-medium-emphasis me-1">Otros:</span>
                          <v-chip v-for="cab in otrosCabs" :key="cab.ID" size="x-small" color="secondary" variant="tonal">
                            <v-icon start size="12">mdi-account</v-icon>
                            {{ cab.USUARIO }}: {{ cab.IDFACTURA }}
                          </v-chip>
                        </div>
                      </v-col>
                      <v-col cols="auto">
                        <v-btn color="error" variant="tonal" prepend-icon="mdi-lock-check" :loading="cerrando" @click="abrirDialogCerrar">
                          Cerrar pedido
                        </v-btn>
                      </v-col>
                    </v-row>
                  </v-card-text>
                </v-card>

                <v-card rounded="xl" elevation="2">
                  <v-card-title class="d-flex align-center flex-wrap gap-2 pa-4">
                    <span class="text-subtitle-1 font-weight-bold">Artículos</span>
                    <v-chip v-if="pollingActivo" size="x-small" color="success" variant="tonal" prepend-icon="mdi-sync">en vivo</v-chip>
                    <v-text-field
                      v-model="inputScan"
                      placeholder="Escanear código…"
                      variant="outlined"
                      density="compact"
                      hide-details
                      prepend-inner-icon="mdi-barcode-scan"
                      clearable
                      style="min-width:200px;max-width:280px"
                      @keyup.enter="procesarScan(inputScan)"
                      ref="inputScanRef"
                    />
                    <v-spacer />
                    <v-chip v-if="lineasConDiferencia > 0" size="small" color="error" prepend-icon="mdi-alert-circle">
                      {{ lineasConDiferencia }} con diferencia
                    </v-chip>
                    <v-chip v-else-if="lineas.length" size="small" color="success" prepend-icon="mdi-check-circle">
                      Sin diferencias
                    </v-chip>
                  </v-card-title>
                  <v-divider />
                  <v-progress-linear v-if="cargandoDetalle" indeterminate color="primary" />
                  <v-data-table
                    :headers="headers"
                    :items="lineasConConteo"
                    density="compact"
                    :items-per-page="500"
                    hide-default-footer
                    class="rechequeo-tabla"
                    :row-props="({ item }) => String(item.CODARTICULO) === ultimoScan ? { class: 'fila-escaneada' } : {}"
                  >
                    <template #item.POR_MI="{ item }">
                      <v-text-field
                        :model-value="item.POR_MI"
                        type="number"
                        min="0"
                        variant="underlined"
                        density="compact"
                        hide-details
                        style="width:80px"
                        @update:model-value="(v: any) => actualizarConteo(item.CODARTICULO, v)"
                      />
                    </template>
                    <template #item.LOTE="{ item }">
                      <v-text-field
                        :model-value="item.LOTE"
                        placeholder="Lote"
                        variant="underlined"
                        density="compact"
                        hide-details
                        style="width:120px"
                        :disabled="!activeCab || activeCab.USUARIO !== authStore.usuario?.usuario"
                        @update:model-value="(v: any) => actualizarLote(item.CODARTICULO, v)"
                      />
                    </template>
                    <template #item.FECHA_VENCIMIENTO="{ item }">
                      <v-text-field
                        :model-value="item.FECHA_VENCIMIENTO"
                        type="date"
                        variant="underlined"
                        density="compact"
                        hide-details
                        style="width:130px"
                        :disabled="!activeCab || activeCab.USUARIO !== authStore.usuario?.usuario"
                        @update:model-value="(v: any) => actualizarFechaVenc(item.CODARTICULO, v)"
                      />
                    </template>
                    <template #item.CONTADAS_TOTAL="{ item }">
                      <span :class="item.CONTADAS_TOTAL > 0 ? 'text-success font-weight-medium' : ''">
                        {{ item.CONTADAS_TOTAL }}
                      </span>
                    </template>
                    <template #item.DIFERENCIA="{ item }">
                      <v-chip
                        size="x-small"
                        :color="item.DIFERENCIA === 0 ? 'success' : item.DIFERENCIA > 0 ? 'warning' : 'error'"
                        variant="tonal"
                      >{{ item.DIFERENCIA > 0 ? '+' : '' }}{{ item.DIFERENCIA }}</v-chip>
                    </template>
                  </v-data-table>
                </v-card>
              </template>
            </v-col>
          </v-row>
        </v-container>

      </v-window-item>
    </v-window>

    <!-- ── Dialogs rechequeo ──────────────────────────────────────────────────── -->
    <v-dialog v-model="dialogTomar" max-width="480" persistent>
      <v-card rounded="xl">
        <v-card-title class="pa-5 pb-2">
          <v-icon color="primary" class="me-2">mdi-hand-pointing-right</v-icon>
          {{ pedidoActual && esMismoPedido(pedidoParaTomar, pedidoActual) ? 'Agregar identificador' : 'Tomar conteo' }}
        </v-card-title>
        <v-card-text class="pa-5 pt-2">
          <p class="text-body-2 mb-1">
            <strong>{{ pedidoParaTomar?.NUMSERIE }}-{{ pedidoParaTomar?.NUMPEDIDO }}-{{ pedidoParaTomar?.N }}</strong>
            · {{ pedidoParaTomar?.PROVEEDOR }}
          </p>
          <p class="text-caption text-medium-emphasis mb-4">
            Ingresá el identificador de la factura/nota de entrega del proveedor.
          </p>
          <v-text-field
            v-model="identificadorTomar"
            label="Identificador (ej: FAC-00123, NE-456)"
            variant="outlined"
            density="compact"
            hide-details
            autofocus
            @keyup.enter="confirmarTomar"
          />
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialogTomar = false">Cancelar</v-btn>
          <v-btn color="primary" variant="elevated" :loading="tomando" :disabled="!identificadorTomar.trim()" @click="confirmarTomar">
            Confirmar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogCerrar" max-width="440">
      <v-card rounded="xl">
        <v-card-title class="pa-5 pb-2">
          <v-icon :color="lineasConDiferencia > 0 ? 'warning' : 'success'" class="me-2">
            {{ lineasConDiferencia > 0 ? 'mdi-alert' : 'mdi-check-circle' }}
          </v-icon>
          Cerrar conteo
        </v-card-title>
        <v-card-text class="pa-5 pt-2">
          <v-alert v-if="lineasConDiferencia > 0" type="warning" variant="tonal" rounded="lg" class="mb-3">
            Hay <strong>{{ lineasConDiferencia }} artículo{{ lineasConDiferencia > 1 ? 's' : '' }}</strong>
            con diferencia entre lo pedido y lo contado. ¿Querés cerrar de todas formas?
          </v-alert>
          <p v-else class="text-body-2">No hay diferencias. El conteo quedará registrado y el pedido se liberará.</p>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialogCerrar = false">Cancelar</v-btn>
          <v-btn :color="lineasConDiferencia > 0 ? 'warning' : 'success'" variant="elevated" :loading="cerrando" @click="confirmarCerrar">
            {{ lineasConDiferencia > 0 ? 'Cerrar de todas formas' : 'Cerrar' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogDetalleCerrado" max-width="700">
      <v-card rounded="xl">
        <v-card-title class="pa-5 pb-2 d-flex align-center gap-2">
          <v-icon color="success">mdi-check-circle</v-icon>
          Pedido cerrado {{ cerradoActual?.NUMSERIE }}-{{ cerradoActual?.NUMPEDIDO }}-{{ cerradoActual?.N }}
        </v-card-title>
        <v-card-subtitle class="px-5 pb-2">
          {{ cerradoActual?.PROVEEDOR }} · {{ cerradoActual?.IDFACTURA }} · {{ cerradoActual?.USUARIO }} · {{ cerradoActual?.FECHA?.slice(0,10) }}
        </v-card-subtitle>
        <v-divider />
        <v-card-text class="pa-0">
          <v-data-table :headers="headersCerrado" :items="detalleCerrado" density="compact" :items-per-page="200" hide-default-footer />
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="dialogDetalleCerrado = false">Cerrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.visible" :color="snackbar.color" :timeout="3500" location="bottom right">
      {{ snackbar.text }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';

const HABILITADO = false; // cambiar a true para activar la sección
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuthStore } from '../stores/useAuthStore';
import logoSrc from '../assets/drogueria_logo.png';

const API       = import.meta.env.VITE_API_URL;
const authStore = useAuthStore();

// ── Shared ────────────────────────────────────────────────────────────────────
const tab      = ref('albaranes');
const snackbar = ref({ visible: false, text: '', color: 'success' });

function mostrarSnack(text: string, color = 'success') {
  snackbar.value = { visible: true, text, color };
}

// Logo base64 (shared for PDF) — compressed to JPEG to keep PDF small
const logoBase64 = ref('');
onMounted(async () => {
  try {
    const res  = await fetch(logoSrc);
    const blob = await res.blob();
    const img  = new Image();
    const url  = URL.createObjectURL(blob);
    await new Promise<void>(resolve => { img.onload = () => resolve(); img.src = url; });
    const canvas  = document.createElement('canvas');
    canvas.width  = 320;
    canvas.height = Math.round(320 * img.naturalHeight / img.naturalWidth);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    logoBase64.value = canvas.toDataURL('image/jpeg', 0.72);
    URL.revokeObjectURL(url);
  } catch { /* sin logo */ }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ALBARANES
// ═══════════════════════════════════════════════════════════════════════════════

const estatusOpts  = ['CONFIRMADA', 'PENDIENTE', 'ANULADA', 'EN PROCESO'];
const albFiltros   = ref({ desde: '', hasta: '', proveedor: '', estatus: '', numalbaran: '' });
const albaranes    = ref<any[]>([]);
const albTotal     = ref(0);
const albPage      = ref(1);
const cargandoAlb  = ref(false);

const albSeleccionado    = ref<any | null>(null);
const albDetalle         = ref<any | null>(null);
const albLineas          = ref<any[]>([]);
const cargandoAlbDetalle = ref(false);
const generandoPdf       = ref(false);

const headersAlb = [
  { title: 'Código',      key: 'CODARTICULO', width: 90 },
  { title: 'Descripción', key: 'DESCRIPCION', sortable: false },
  { title: 'P/Venta',    key: 'PVENTA',        width: 80,  align: 'end' as const },
  { title: 'Lote',        key: 'LOTE',         width: 90,  sortable: false },
  { title: 'Vence',       key: 'FECHAVENCE',   width: 90,  sortable: false },
  { title: 'Cant.',       key: 'CANTIDAD',      width: 65,  align: 'end' as const },
  { title: 'Margen',      key: 'MARGEN',        width: 75,  align: 'end' as const },
  { title: 'Costo',       key: 'COSTO',         width: 80,  align: 'end' as const },
  { title: 'Importe',     key: 'IMPORTE',       width: 90,  align: 'end' as const },
];

function fmt(v: any) {
  const n = Number(v) || 0;
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUSD(bs: any) {
  const cot = Number(albDetalle.value?.COTIZACION) || 1;
  return ((Number(bs) || 0) / cot).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function buscarAlbaranes() {
  cargandoAlb.value = true;
  try {
    const params: Record<string, string> = { page: String(albPage.value), limit: '50' };
    if (albFiltros.value.desde)      params['desde']      = albFiltros.value.desde;
    if (albFiltros.value.hasta)      params['hasta']      = albFiltros.value.hasta;
    if (albFiltros.value.proveedor)  params['proveedor']  = albFiltros.value.proveedor;
    if (albFiltros.value.estatus)    params['estatus']    = albFiltros.value.estatus;
    if (albFiltros.value.numalbaran) params['numalbaran'] = albFiltros.value.numalbaran;
    const r = await axios.get(`${API}/rechequeo/albaranes`, { params });
    albaranes.value = r.data.data;
    albTotal.value  = r.data.total;
  } catch {
    mostrarSnack('Error buscando albaranes', 'error');
  } finally {
    cargandoAlb.value = false;
  }
}

async function seleccionarAlbaran(alb: any) {
  albSeleccionado.value    = alb;
  albDetalle.value         = null;
  albLineas.value          = [];
  cargandoAlbDetalle.value = true;
  try {
    const r = await axios.get(`${API}/rechequeo/albaranes/${alb.NUMSERIE}/${alb.NUMALBARAN}`);
    albDetalle.value = r.data.cabecera;
    albLineas.value  = r.data.lineas;
  } catch {
    mostrarSnack('Error cargando albarán', 'error');
  } finally {
    cargandoAlbDetalle.value = false;
  }
}

async function generarPdfAlbaran() {
  if (!albDetalle.value) return;
  generandoPdf.value = true;
  try {
    const cab    = albDetalle.value;
    const lineas = albLineas.value;

    const TEAL  = [22, 78, 99]  as [number,number,number];
    const LTEAL = [232, 246, 250] as [number,number,number];
    const GRAY  = [100, 100, 100] as [number,number,number];

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W   = doc.internal.pageSize.getWidth();
    const H   = doc.internal.pageSize.getHeight();
    const lm  = 12, rm = 12;
    let y = 8;

    // ── HEADER: logo + empresa + título en una sola banda ─────────────────────
    const logoW = 36, logoH = 11;
    const numAlb = `${cab.NUMSERIE}-${Number(cab.NUMALBARAN)}`;
    if (logoBase64.value) {
      doc.addImage(logoBase64.value, 'JPEG', lm, y, logoW, logoH);
    }
    // Empresa (centro)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...TEAL);
    doc.text('DROGUERÍA INTERCONTINENTAL, C.A.', W / 2, y + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text('Av. Principal, Zona Industrial  ·  RIF: J-000000000-0', W / 2, y + 8.5, { align: 'center' });
    // Número (derecha, grande)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...TEAL);
    doc.text(numAlb, W - rm, y + 5, { align: 'right' });

    y += logoH + 3;
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(0.6);
    doc.line(lm, y, W - rm, y);
    doc.setLineWidth(0.2);
    y += 5;

    // ── INFO GRID (tabla sin bordes, 2 columnas) ──────────────────────────────
    const midX  = W / 2;
    const lblW  = 26;
    const rowH  = 5.5;
    doc.setFontSize(8);

    const cotizacion = Number(cab.COTIZACION) || 0;
    const infoRows: [string, string, string, string][] = [
      ['Almacén:',   cab.CODALMACEN || '—',
       'Actualizado:', cab.FECHAACTUALIZADO || '—'],
      ['Fecha:',     cab.FECHA || '—',
       'Vencimiento:', cab.FECHAVENCIMIENTO || '—'],
      ['Proveedor:', `${cab.CODPROVEEDOR} - ${cab.NOMPROVEEDOR}`,
       'Unidades:', String(Number(cab.UNIDADES) || 0)],
      ['Peso Neto:', `${Number(cab.PESONETO) || 0} bultos`,
       'Cotización:', cotizacion > 0 ? `${cotizacion.toFixed(4)} Bs/USD` : '—'],
      ['Factura Compra:', (cab.NUMSERIEFAC && cab.NUMFAC) ? `${cab.NUMSERIEFAC}-${Number(cab.NUMFAC)}` : '—',
       '', ''],
      ['Responsable:', cab.RESPONSABLE || '—',
       '', ''],
    ];

    for (const [lblL, valL, lblR, valR] of infoRows) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
      doc.text(lblL, lm, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(valL, lm + lblW, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
      doc.text(lblR, midX + 2, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(valR, midX + 2 + lblW, y);
      y += rowH;
    }

    if (cab.OBSERVACION) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
      doc.text('Observación:', lm, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      const obs = doc.splitTextToSize(cab.OBSERVACION, W - lm - rm - lblW);
      doc.text(obs, lm + lblW, y);
      y += obs.length * rowH;
    }

    y += 3;

    // ── TABLA DE LÍNEAS ───────────────────────────────────────────────────────
    autoTable(doc, {
      startY: y,
      margin: { left: lm, right: rm },
      styles: {
        fontSize: 7,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: TEAL,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
        halign: 'center',
      },
      alternateRowStyles: { fillColor: LTEAL },
      bodyStyles: { textColor: [30, 30, 30] },
      columns: [
        { header: 'Código',      dataKey: 'CODARTICULO' },
        { header: 'Descripción', dataKey: 'DESCRIPCION' },
        { header: 'P/Venta',     dataKey: 'PVENTA' },
        { header: 'Lote',        dataKey: 'LOTE' },
        { header: 'Vence',       dataKey: 'FECHAVENCE' },
        { header: 'Cant.',       dataKey: 'CANTIDAD' },
        { header: 'Margen',      dataKey: 'MARGEN' },
        { header: 'Costo',       dataKey: 'COSTO' },
        { header: 'Importe',     dataKey: 'IMPORTE' },
      ],
      body: lineas.map(l => ({
        ...l,
        PVENTA:  fmt(l.PVENTA),
        COSTO:   fmt(l.COSTO),
        IMPORTE: fmt(l.IMPORTE),
        MARGEN:  `${Number(l.MARGEN).toFixed(2)}%`,
      })),
      columnStyles: {
        0: { cellWidth: 16, halign: 'center' },
        1: { cellWidth: 'auto', textColor: [22, 78, 99] },
        2: { cellWidth: 18, halign: 'right' },
        3: { cellWidth: 18 },
        4: { cellWidth: 18 },
        5: { cellWidth: 12, halign: 'right' },
        6: { cellWidth: 16, halign: 'right' },
        7: { cellWidth: 18, halign: 'right' },
        8: { cellWidth: 20, halign: 'right' },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let y2 = (doc as any).lastAutoTable.finalY + 5;

    // ── FOOTER: FIRMAS + TOTALES ──────────────────────────────────────────────
    // ALBCOMPRACAB almacena montos en Bs; USD = Bs ÷ cotizacion
    const subBs  = Number(cab.BASEIMPONIBLE) || 0;
    const ivaBs  = Number(cab.TOTALIVA)      || 0;
    const totBs  = Number(cab.TOTAL)         || 0;
    const subUSD = cotizacion > 0 ? subBs / cotizacion : 0;
    const ivaUSD = cotizacion > 0 ? ivaBs / cotizacion : 0;
    const totUSD = cotizacion > 0 ? totBs / cotizacion : 0;

    // Firmas
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'normal');
    doc.text('Preparado por:', lm, y2 + 4);
    doc.setDrawColor(120, 120, 120);
    doc.line(lm + 32, y2 + 4, lm + 80, y2 + 4);
    doc.text('Autorizado por:', lm, y2 + 14);
    doc.line(lm + 32, y2 + 14, lm + 80, y2 + 14);

    // Caja de totales (derecha) — USD + Bs
    const bW  = 105;
    const bX  = W - rm - bW;
    const bY  = y2;
    const bH  = 24;
    const colU = bX + bW - 55; // inicio columna USD

    // Fondo encabezado
    doc.setFillColor(...TEAL);
    doc.rect(bX, bY, bW, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('CONCEPTO',     bX + 2,   bY + 4);
    doc.text('USD',          colU - 1, bY + 4, { align: 'right' });
    doc.text('Bs',           bX + bW - 2, bY + 4, { align: 'right' });

    // Fila SUB-TOTAL
    doc.setFillColor(245, 250, 252);
    doc.rect(bX, bY + 6, bW, 6, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text('SUB-TOTAL',   bX + 2,   bY + 10);
    doc.text(fmt(subUSD),   colU - 1, bY + 10, { align: 'right' });
    doc.text(fmt(subBs),    bX + bW - 2, bY + 10, { align: 'right' });

    // Fila IMPUESTO
    doc.setFillColor(245, 250, 252);
    doc.rect(bX, bY + 12, bW, 6, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text('IMPUESTO',    bX + 2,   bY + 16);
    doc.text(fmt(ivaUSD),   colU - 1, bY + 16, { align: 'right' });
    doc.text(fmt(ivaBs),    bX + bW - 2, bY + 16, { align: 'right' });

    // Fila TOTAL
    doc.setFillColor(...TEAL);
    doc.rect(bX, bY + 18, bW, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('TOTAL',       bX + 2,   bY + 22);
    doc.text(fmt(totUSD),   colU - 1, bY + 22, { align: 'right' });
    doc.text(fmt(totBs),    bX + bW - 2, bY + 22, { align: 'right' });

    // Línea separadora entre columnas USD / Bs
    doc.setDrawColor(180, 220, 230);
    doc.setLineWidth(0.2);
    doc.line(colU + 1, bY, colU + 1, bY + bH);

    // Borde de la caja
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(0.4);
    doc.rect(bX, bY, bW, bH);
    doc.setLineWidth(0.2);

    y2 += bH + 5;


    // Nro de página
    const pages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFontSize(6);
      doc.setTextColor(...GRAY);
      doc.text(`Página ${p} / ${pages}`, W - rm, H - 5, { align: 'right' });
    }

    doc.save(`AlbaranCompra_${numAlb}.pdf`);
  } catch (e: any) {
    mostrarSnack('Error generando PDF: ' + e.message, 'error');
  } finally {
    generandoPdf.value = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECHEQUEO (sin cambios)
// ═══════════════════════════════════════════════════════════════════════════════

const misPedidos      = ref<any[]>([]);
const disponibles     = ref<any[]>([]);
const cerrados        = ref<any[]>([]);
const cargandoMios    = ref(false);
const cargandoDisp    = ref(false);
const cargandoDetalle = ref(false);

const pedidoActual = ref<any | null>(null);
const lineas       = ref<any[]>([]);
const cabeceras    = ref<any[]>([]);
const activeCab    = ref<any | null>(null);
const misConteos   = ref<Record<string, number>>({});

const dialogTomar        = ref(false);
const pedidoParaTomar    = ref<any | null>(null);
const identificadorTomar = ref('');
const tomando            = ref(false);

const dialogCerrar         = ref(false);
const cerrando             = ref(false);
const dialogDetalleCerrado = ref(false);
const cerradoActual        = ref<any | null>(null);
const detalleCerrado       = ref<any[]>([]);

const inputScan    = ref('');
const inputScanRef = ref<any>(null);
const ultimoScan   = ref<string | null>(null);
let scanHighlightTimer: ReturnType<typeof setTimeout> | null = null;

let pollingTimer: ReturnType<typeof setInterval> | null = null;
const pollingActivo = ref(false);

const headersCerrado = [
  { title: 'Código',     key: 'CODARTICULO',       width: 90 },
  { title: 'Descripción',key: 'DESCRIPCION',       sortable: false },
  { title: 'Contadas',   key: 'UNIDADES_CONTADAS', width: 90, align: 'end' as const },
  { title: 'Precio',     key: 'PRECIO',             width: 90, align: 'end' as const },
];

const headers = [
  { title: 'Código',      key: 'CODARTICULO',      width: 100 },
  { title: 'Descripción', key: 'DESCRIPCION',      sortable: false },
  { title: 'Pedidas',     key: 'PEDIDAS',           width: 80,  align: 'end' as const },
  { title: 'Recibidas',   key: 'RECIBIDAS',         width: 85,  align: 'end' as const },
  { title: 'Pendientes',  key: 'PENDIENTES',        width: 90,  align: 'end' as const },
  { title: 'Por mí',      key: 'POR_MI',            width: 110, align: 'end' as const, sortable: false },
  { title: 'Lote',        key: 'LOTE',              width: 140, sortable: false },
  { title: 'Vencimiento', key: 'FECHA_VENCIMIENTO', width: 145, sortable: false },
  { title: 'Total',       key: 'CONTADAS_TOTAL',    width: 75,  align: 'end' as const },
  { title: 'Diferencia',  key: 'DIFERENCIA',        width: 95,  align: 'center' as const },
];

const myCabs = computed(() =>
  cabeceras.value.filter(c => c.USUARIO === authStore.usuario?.usuario)
);
const otrosCabs = computed(() =>
  cabeceras.value.filter(c => c.USUARIO !== authStore.usuario?.usuario)
);

const misLotes      = ref<Record<string, string>>({});
const misFechasVenc = ref<Record<string, string>>({});

const lineasConConteo = computed(() =>
  lineas.value.map(l => {
    const cod   = String(l.CODARTICULO);
    const yo    = misConteos.value[cod] ?? 0;
    const total = Number(l.CONTADAS_TOTAL) || 0;
    return {
      ...l,
      POR_MI:            yo,
      LOTE:              misLotes.value[cod]      ?? '',
      FECHA_VENCIMIENTO: misFechasVenc.value[cod] ?? '',
      DIFERENCIA:        total - l.PENDIENTES,
    };
  })
);

const lineasConDiferencia = computed(() =>
  lineasConConteo.value.filter(l => l.DIFERENCIA !== 0).length
);

const refProveedorMap = computed(() => {
  const m: Record<string, string> = {};
  for (const l of lineas.value) {
    if (l.REFPROVEEDOR?.trim()) m[l.REFPROVEEDOR.trim()] = String(l.CODARTICULO);
  }
  return m;
});

function esMismoPedido(a: any, b: any | null) {
  return b && a && a.NUMSERIE === b.NUMSERIE && a.NUMPEDIDO === b.NUMPEDIDO && a.N === b.N;
}

function iniciarPolling() {
  detenerPolling();
  pollingActivo.value = true;
  pollingTimer = setInterval(cargarLineasSilencioso, 8000);
}
function detenerPolling() {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
  pollingActivo.value = false;
}

async function cargarListas() {
  cargandoMios.value = true;
  cargandoDisp.value = true;
  try {
    const [rMios, rDisp, rCerr] = await Promise.all([
      axios.get(`${API}/rechequeo/mios`),
      axios.get(`${API}/rechequeo/disponibles`),
      axios.get(`${API}/rechequeo/cerrados`),
    ]);
    misPedidos.value  = rMios.data.data;
    disponibles.value = rDisp.data.data;
    cerrados.value    = rCerr.data.data;
  } catch {
    mostrarSnack('Error cargando listas', 'error');
  } finally {
    cargandoMios.value = false;
    cargandoDisp.value = false;
  }
}

async function verDetalleCerrado(c: any) {
  cerradoActual.value       = c;
  detalleCerrado.value      = [];
  dialogDetalleCerrado.value = true;
  try {
    const r = await axios.get(`${API}/rechequeo/cerrados/${c.ID}/detalle`);
    detalleCerrado.value = r.data.data;
  } catch {
    mostrarSnack('Error cargando detalle', 'error');
  }
}

async function seleccionarMiPedido(p: any) {
  pedidoActual.value = p;
  activeCab.value    = null;
  misConteos.value   = {};
  ultimoScan.value   = null;
  iniciarPolling();
  await cargarDetalle();
}

async function cargarDetalle() {
  if (!pedidoActual.value) return;
  const { NUMSERIE, NUMPEDIDO, N } = pedidoActual.value;
  cargandoDetalle.value = true;
  try {
    const r = await axios.get(`${API}/rechequeo/pedidos/${NUMSERIE}/${NUMPEDIDO}/${N}`);
    lineas.value    = r.data.lineas;
    cabeceras.value = r.data.cabeceras ?? [];
    if (!activeCab.value) {
      const primera = myCabs.value[0] ?? null;
      activeCab.value = primera;
      if (primera) await cargarMisConteos(primera.ID);
    }
  } catch {
    mostrarSnack('Error cargando artículos', 'error');
  } finally {
    cargandoDetalle.value = false;
  }
}

async function cargarLineasSilencioso() {
  if (!pedidoActual.value) return;
  const { NUMSERIE, NUMPEDIDO, N } = pedidoActual.value;
  try {
    const r = await axios.get(`${API}/rechequeo/pedidos/${NUMSERIE}/${NUMPEDIDO}/${N}`);
    lineas.value    = r.data.lineas;
    cabeceras.value = r.data.cabeceras ?? [];
  } catch { /* silent */ }
}

async function cargarMisConteos(idcab: number) {
  try {
    const r = await axios.get(`${API}/rechequeo/cabecera/${idcab}/detalles`);
    const mapU: Record<string, number> = {};
    const mapL: Record<string, string> = {};
    const mapF: Record<string, string> = {};
    for (const d of r.data.data) {
      const cod = String(d.CODARTICULO);
      mapU[cod] = Number(d.UNIDADES_CONTADAS);
      if (d.LOTE) mapL[cod] = d.LOTE;
      if (d.FECHA_VENCIMIENTO) mapF[cod] = d.FECHA_VENCIMIENTO.split('T')[0];
    }
    misConteos.value    = mapU;
    misLotes.value      = mapL;
    misFechasVenc.value = mapF;
  } catch { /* silent */ }
}

async function seleccionarCab(cab: any) {
  activeCab.value     = cab;
  misConteos.value    = {};
  misLotes.value      = {};
  misFechasVenc.value = {};
  await cargarMisConteos(cab.ID);
}

function abrirDialogTomar(p: any) {
  pedidoParaTomar.value    = p;
  identificadorTomar.value = '';
  dialogTomar.value        = true;
}

function abrirDialogTomarActual() {
  if (!pedidoActual.value) return;
  pedidoParaTomar.value    = pedidoActual.value;
  identificadorTomar.value = '';
  dialogTomar.value        = true;
}

async function confirmarTomar() {
  const fac = identificadorTomar.value.trim();
  if (!fac || !pedidoParaTomar.value) return;
  tomando.value = true;
  try {
    const p = pedidoParaTomar.value;
    const r = await axios.post(`${API}/rechequeo/tomar`, {
      numserie: p.NUMSERIE, numpedido: p.NUMPEDIDO, n: p.N, idfactura: fac,
    });
    const newId: number = r.data.id;
    dialogTomar.value = false;
    await cargarListas();
    const miP = misPedidos.value.find((x: any) => esMismoPedido(x, p));
    if (miP) {
      if (esMismoPedido(pedidoActual.value, p)) {
        await cargarDetalle();
        const nueva = cabeceras.value.find((c: any) => c.ID === newId);
        if (nueva) await seleccionarCab(nueva);
      } else {
        await seleccionarMiPedido(miP);
        const nueva = cabeceras.value.find((c: any) => c.ID === newId);
        if (nueva) await seleccionarCab(nueva);
      }
    }
  } catch (err: any) {
    mostrarSnack(err.response?.data?.message ?? 'Error al tomar el pedido', 'error');
  } finally {
    tomando.value = false;
  }
}

function abrirDialogCerrar() {
  dialogCerrar.value = true;
}

async function confirmarCerrar() {
  if (!pedidoActual.value) return;
  cerrando.value = true;
  try {
    await axios.post(`${API}/rechequeo/cerrar`, {
      numserie:  pedidoActual.value.NUMSERIE,
      numpedido: pedidoActual.value.NUMPEDIDO,
      n:         pedidoActual.value.N,
    });
    dialogCerrar.value = false;
    pedidoActual.value = null;
    activeCab.value    = null;
    cabeceras.value    = [];
    misConteos.value   = {};
    lineas.value       = [];
    detenerPolling();
    await cargarListas();
    mostrarSnack('Conteo cerrado correctamente', 'success');
  } catch (err: any) {
    mostrarSnack(err.response?.data?.message ?? 'Error cerrando conteo', 'error');
  } finally {
    cerrando.value = false;
  }
}

const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function guardarDetalle(codarticulo: string) {
  if (!activeCab.value) return;
  const cod      = String(codarticulo);
  const unidades = misConteos.value[cod] ?? 0;
  const lote     = misLotes.value[cod] || undefined;
  const fechaVencimiento = misFechasVenc.value[cod] || undefined;
  clearTimeout(debounceTimers[cod]);
  debounceTimers[cod] = setTimeout(async () => {
    try {
      await axios.post(`${API}/rechequeo/conteo`, { idcab: activeCab.value?.ID, codarticulo: cod, unidades, lote, fechaVencimiento });
      await cargarLineasSilencioso();
    } catch {
      mostrarSnack('Error guardando conteo', 'error');
    }
  }, 600);
}

function actualizarConteo(codarticulo: string, valorRaw: any) {
  if (!activeCab.value) return;
  misConteos.value[String(codarticulo)] = Number(valorRaw) || 0;
  guardarDetalle(codarticulo);
}

function actualizarLote(codarticulo: string, valor: string) {
  if (!activeCab.value) return;
  misLotes.value[String(codarticulo)] = valor;
  guardarDetalle(codarticulo);
}

function actualizarFechaVenc(codarticulo: string, valor: string) {
  if (!activeCab.value) return;
  misFechasVenc.value[String(codarticulo)] = valor;
  guardarDetalle(codarticulo);
}

function procesarScan(valor: string) {
  inputScan.value = '';
  const codigo = valor.trim();
  if (!codigo) return;
  const cod = refProveedorMap.value[codigo];
  if (!cod) { mostrarSnack(`No encontrado: ${codigo}`, 'error'); return; }
  const actual = misConteos.value[cod] ?? 0;
  actualizarConteo(cod, actual + 1);
  ultimoScan.value = cod;
  if (scanHighlightTimer) clearTimeout(scanHighlightTimer);
  scanHighlightTimer = setTimeout(() => { ultimoScan.value = null; }, 4000);
  nextTick(() => inputScanRef.value?.focus());
}

onMounted(() => {
  // Albaranes: carga sin filtro de fecha inicial
  buscarAlbaranes();

  cargarListas();
});
onUnmounted(detenerPolling);
</script>

<style scoped>
/* Hacer que v-window propague la altura a sus items */
:deep(.v-window__container) { height: 100%; }
:deep(.v-window-item)       { height: 100%; }

.rechequeo-tabla :deep(td) { font-size: 0.8125rem; }
.rechequeo-tabla :deep(.v-data-table__td) { padding: 4px 8px; }
.rechequeo-tabla :deep(.fila-escaneada td) {
  background-color: rgba(255, 160, 0, 0.18) !important;
  transition: background-color 0.3s;
}
.alb-tabla :deep(td) { font-size: 0.8125rem; }
.alb-tabla :deep(.v-data-table__td) { padding: 4px 8px; }
</style>
