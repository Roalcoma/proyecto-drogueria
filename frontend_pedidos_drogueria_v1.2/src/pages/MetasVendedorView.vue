<template>
  <v-container fluid class="metas-dashboard pa-4">

    <!-- ── Header ── -->
    <div class="dash-header mb-4">
      <div class="d-flex justify-space-between align-center flex-wrap gap-3">
        <div>
          <div class="dash-title">Metas de Vendedores</div>
          <div class="dash-subtitle">Progreso, rankings y gestión de metas mensuales</div>
        </div>
        <div class="d-flex gap-2 align-center">
          <v-select
            v-model="filtroAnio"
            :items="aniosDisponibles"
            label="Año"
            density="compact"
            variant="outlined"
            hide-details
            style="width:100px"
            @update:model-value="recargar"
          />
          <v-select
            v-model="filtroMes"
            :items="meses"
            item-title="label"
            item-value="valor"
            label="Mes"
            density="compact"
            variant="outlined"
            hide-details
            style="width:140px"
            @update:model-value="recargar"
          />
        </div>
      </div>
    </div>

    <!-- ── Tabs ── -->
    <v-tabs v-model="tab" color="primary" class="dash-tabs mb-1">
      <v-tab value="progreso"   prepend-icon="mdi-chart-line">Progreso</v-tab>
      <v-tab value="rankings"   prepend-icon="mdi-trophy">Rankings</v-tab>
      <v-tab value="vendedores" prepend-icon="mdi-account-details">Vendedores</v-tab>
      <v-tab value="gestion"    prepend-icon="mdi-table-edit">Gestión</v-tab>
    </v-tabs>
    <v-divider class="mb-4" />

    <v-tabs-window v-model="tab">

      <!-- ══════════════ TAB PROGRESO ══════════════ -->
      <v-tabs-window-item value="progreso">

        <!-- Toggle modo -->
        <v-row class="mb-3" align="center">
          <v-col cols="auto">
            <v-btn-toggle v-model="modo" mandatory density="compact" color="primary" variant="outlined">
              <v-btn value="total" prepend-icon="mdi-cart-check">Todo (sin cancelados)</v-btn>
              <v-btn value="facturado" prepend-icon="mdi-receipt-text-check">Solo facturado</v-btn>
            </v-btn-toggle>
          </v-col>
          <v-spacer />
          <v-col cols="auto">
            <v-btn variant="text" size="small" prepend-icon="mdi-refresh" :loading="cargandoProgreso" @click="cargarProgreso">Actualizar</v-btn>
          </v-col>
        </v-row>

        <!-- KPI cards -->
        <v-row class="mb-4" dense>
          <v-col cols="12" sm="6" md="3">
            <div class="kpi-card kpi-primary">
              <div class="kpi-icon-wrap"><v-icon size="20" color="white">mdi-account-group</v-icon></div>
              <div class="kpi-number">{{ progreso.length }}</div>
              <div class="kpi-label">Vendedores con meta</div>
            </div>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <div class="kpi-card kpi-success">
              <div class="kpi-icon-wrap"><v-icon size="20" color="white">mdi-percent-circle</v-icon></div>
              <div class="kpi-number">{{ promedioGeneral }}%</div>
              <div class="kpi-label">Cumplimiento promedio</div>
            </div>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <div class="kpi-card kpi-accent">
              <div class="kpi-icon-wrap"><v-icon size="20" color="white">mdi-currency-usd</v-icon></div>
              <div class="kpi-number kpi-money">$ {{ fmt(totalVendido) }}</div>
              <div class="kpi-label">Total vendido</div>
            </div>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <div class="kpi-card kpi-muted">
              <div class="kpi-icon-wrap kpi-icon-dark"><v-icon size="20" color="white">mdi-target</v-icon></div>
              <div class="kpi-number kpi-money kpi-dark">$ {{ fmt(totalMeta) }}</div>
              <div class="kpi-label">Total meta del mes</div>
            </div>
          </v-col>
        </v-row>

        <!-- Tarjetas de progreso por vendedor -->
        <v-row v-if="cargandoProgreso">
          <v-col v-for="i in 4" :key="i" cols="12">
            <v-skeleton-loader type="list-item-two-line" />
          </v-col>
        </v-row>

        <v-row v-else-if="progreso.length === 0">
          <v-col cols="12">
            <v-alert type="info" variant="tonal">No hay metas cargadas para este período.</v-alert>
          </v-col>
        </v-row>

        <v-expansion-panels v-else variant="accordion" class="zona-panels">
          <v-expansion-panel v-for="zona in progresoByZona" :key="zona.codruta">
            <v-expansion-panel-title>
              <div class="d-flex align-center gap-3 flex-grow-1 flex-wrap pr-2">
                <v-icon size="16" color="#1E40AF">mdi-map-marker-radius</v-icon>
                <span class="zona-panel-name">{{ zona.nombre }}</span>
                <v-chip size="x-small" color="primary" variant="tonal">{{ zona.items.length }} vend.</v-chip>
                <div class="flex-grow-1" />
                <span class="zona-panel-kpi d-none d-sm-flex">
                  <span class="text-caption text-medium-emphasis mr-1">Meta:</span>
                  <span class="mono font-weight-medium">$ {{ fmt(zona.items.reduce((s, i) => s + Number(i.META), 0)) }}</span>
                </span>
                <v-chip
                  size="small"
                  :color="colorPct(Math.round(zona.items.reduce((s, i) => s + pct(i), 0) / zona.items.length))"
                  variant="flat"
                >
                  {{ Math.round(zona.items.reduce((s, i) => s + pct(i), 0) / zona.items.length) }}%
                </v-chip>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text class="pa-0">
              <div class="progress-list pa-3">
                <div
                  v-for="(item, idx) in [...zona.items].sort((a, b) => pct(b) - pct(a))"
                  :key="item.ID"
                  class="progress-card"
                  :class="borderColorClass(pct(item))"
                >
                  <div class="d-flex align-center gap-3">
                    <span class="rank-badge" :class="rankClass(idx)">{{ idx + 1 }}</span>
                    <div class="flex-grow-1">
                      <div class="d-flex align-center gap-2 flex-wrap">
                        <span class="prog-name">{{ item.NOMVENDEDOR }}</span>
                        <v-chip v-if="item.CUMPLIDA" color="success" size="x-small" variant="flat">✓ Cumplida</v-chip>
                      </div>
                      <div class="prog-sub">Cód. {{ item.CODVENDEDOR }} · {{ pedidoLabel(item) }} pedido(s)</div>
                    </div>
                    <div class="text-right">
                      <div class="prog-pct" :class="pctColorClass(pct(item))">{{ pct(item) }}%</div>
                      <div class="prog-falta" v-if="pct(item) < 100">
                        Falta&nbsp;<span class="mono">$ {{ fmt(Math.max(0, item.META - ventaModo(item))) }}</span>
                      </div>
                      <div class="prog-sobre text-success" v-else>
                        +$ {{ fmt(ventaModo(item) - item.META) }}
                      </div>
                    </div>
                  </div>
                  <div class="prog-bar-row mt-2">
                    <div class="d-flex justify-space-between text-caption mb-1">
                      <span class="mono font-weight-medium">$ {{ fmt(ventaModo(item)) }}</span>
                      <span class="prog-meta">Meta&nbsp;<span class="mono">$ {{ fmt(item.META) }}</span></span>
                    </div>
                    <v-progress-linear
                      :model-value="Math.min(pct(item), 100)"
                      :color="colorPct(pct(item))"
                      bg-color="#E9EEF6"
                      height="8"
                      rounded
                    />
                  </div>
                </div>
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

      </v-tabs-window-item>

      <!-- ══════════════ TAB RANKINGS ══════════════ -->
      <v-tabs-window-item value="rankings">
        <v-row v-if="progreso.length === 0" class="mt-2">
          <v-col><v-alert type="info" variant="tonal">No hay metas cargadas para este período.</v-alert></v-col>
        </v-row>

        <v-row v-else>
          <!-- Podio top 3 -->
          <v-col cols="12">
            <div class="section-label mb-3">
              <v-icon start size="16">mdi-trophy</v-icon> Podio — % de meta alcanzada
            </div>
            <div class="podium-row mb-6">
              <!-- 2do lugar -->
              <div v-if="top3[1]" class="podium-slot podium-2">
                <div class="podium-avatar podium-silver">
                  <v-icon size="22" color="white">mdi-medal</v-icon>
                </div>
                <div class="podium-name">{{ top3[1].NOMVENDEDOR }}</div>
                <div class="podium-pct">{{ pct(top3[1]) }}%</div>
                <div class="podium-bar" style="height:60px;background:#CBD5E1" />
              </div>
              <!-- 1er lugar -->
              <div v-if="top3[0]" class="podium-slot podium-1">
                <div class="podium-crown">
                  <v-icon size="18" color="#D97706">mdi-crown</v-icon>
                </div>
                <div class="podium-avatar podium-gold">
                  <v-icon size="28" color="white">mdi-trophy</v-icon>
                </div>
                <div class="podium-name font-weight-bold">{{ top3[0].NOMVENDEDOR }}</div>
                <div class="podium-pct podium-pct-gold">{{ pct(top3[0]) }}%</div>
                <div class="podium-bar" style="height:90px;background:#D97706" />
              </div>
              <!-- 3er lugar -->
              <div v-if="top3[2]" class="podium-slot podium-3">
                <div class="podium-avatar podium-bronze">
                  <v-icon size="18" color="white">mdi-medal-outline</v-icon>
                </div>
                <div class="podium-name">{{ top3[2].NOMVENDEDOR }}</div>
                <div class="podium-pct">{{ pct(top3[2]) }}%</div>
                <div class="podium-bar" style="height:42px;background:#B45309" />
              </div>
            </div>
          </v-col>

          <!-- Ranking por % -->
          <v-col cols="12" md="6">
            <div class="rank-card">
              <div class="rank-card-title">
                <v-icon size="15" color="#1E40AF">mdi-percent</v-icon>
                Ranking por % de meta
              </div>
              <div
                v-for="(item, i) in rankingPct"
                :key="item.ID"
                class="rank-row"
              >
                <span class="rank-num" :class="rankClass(i)">{{ i+1 }}</span>
                <div class="flex-grow-1">
                  <div class="rank-vend">{{ item.NOMVENDEDOR }}</div>
                  <div class="rank-detail mono">$ {{ fmt(ventaModo(item)) }} / $ {{ fmt(item.META) }}</div>
                </div>
                <v-chip :color="colorPct(pct(item))" size="x-small" variant="flat">{{ pct(item) }}%</v-chip>
              </div>
            </div>
          </v-col>

          <!-- Ranking por monto -->
          <v-col cols="12" md="6">
            <div class="rank-card">
              <div class="rank-card-title">
                <v-icon size="15" color="#059669">mdi-currency-usd</v-icon>
                Ranking por monto vendido
              </div>
              <div
                v-for="(item, i) in rankingMonto"
                :key="item.ID"
                class="rank-row"
              >
                <span class="rank-num" :class="rankClass(i)">{{ i+1 }}</span>
                <div class="flex-grow-1">
                  <div class="rank-vend">{{ item.NOMVENDEDOR }}</div>
                  <div class="rank-detail">{{ pedidoLabel(item) }} pedido(s)</div>
                </div>
                <span class="mono font-weight-bold" style="color:#059669">$ {{ fmt(ventaModo(item)) }}</span>
              </div>
            </div>
          </v-col>

          <!-- Ranking por pedidos -->
          <v-col cols="12" md="6">
            <div class="rank-card">
              <div class="rank-card-title">
                <v-icon size="15" color="#D97706">mdi-cart-arrow-right</v-icon>
                Ranking por cantidad de pedidos
              </div>
              <div
                v-for="(item, i) in rankingPedidos"
                :key="item.ID"
                class="rank-row"
              >
                <span class="rank-num" :class="rankClass(i)">{{ i+1 }}</span>
                <div class="flex-grow-1">
                  <div class="rank-vend">{{ item.NOMVENDEDOR }}</div>
                  <div class="rank-detail mono">$ {{ fmt(ventaModo(item)) }} vendido</div>
                </div>
                <v-chip color="warning" size="x-small" variant="flat">{{ pedidoLabel(item) }} ped.</v-chip>
              </div>
            </div>
          </v-col>

          <!-- Distancia a la meta -->
          <v-col cols="12" md="6">
            <div class="rank-card">
              <div class="rank-card-title">
                <v-icon size="15" color="#DC2626">mdi-flag-checkered</v-icon>
                Distancia a la meta
              </div>
              <div
                v-for="item in rankingDistancia"
                :key="item.ID"
                class="rank-row"
              >
                <div class="flex-grow-1">
                  <div class="rank-vend">{{ item.NOMVENDEDOR }}</div>
                  <div class="rank-detail">
                    {{ item.META > ventaModo(item) ? `Falta $ ${fmt(item.META - ventaModo(item))}` : 'Meta superada' }}
                  </div>
                </div>
                <v-chip :color="item.META <= ventaModo(item) ? 'success' : 'error'" size="x-small" variant="flat">
                  {{ item.META <= ventaModo(item) ? '✓' : `$ ${fmt(item.META - ventaModo(item))}` }}
                </v-chip>
              </div>
            </div>
          </v-col>
        </v-row>
      </v-tabs-window-item>

      <!-- ══════════════ TAB VENDEDORES ══════════════ -->
      <v-tabs-window-item value="vendedores">

        <v-row v-if="cargandoProgresoVendedor" class="mt-2">
          <v-col v-for="i in 3" :key="i" cols="12"><v-skeleton-loader type="list-item-two-line" /></v-col>
        </v-row>

        <v-row v-else-if="progresoVendedorAgrupado.length === 0" class="mt-2">
          <v-col><v-alert type="info" variant="tonal">No hay metas cargadas para este período.</v-alert></v-col>
        </v-row>

        <v-expansion-panels v-else variant="accordion" class="zona-panels">
          <v-expansion-panel v-for="vend in progresoVendedorAgrupado" :key="vend.codVendedor">
            <v-expansion-panel-title>
              <div class="d-flex align-center gap-3 flex-grow-1 flex-wrap pr-2">
                <v-icon size="16" color="#1E40AF">mdi-account</v-icon>
                <span class="zona-panel-name">{{ vend.nomVendedor }}</span>
                <span class="gestion-vend-cod">· {{ vend.codVendedor }}</span>
                <v-chip v-if="vend.cumplida" color="success" size="x-small" variant="flat">✓ Cumplida</v-chip>
                <div class="flex-grow-1" />
                <span class="zona-panel-kpi d-none d-sm-flex">
                  <span class="text-caption text-medium-emphasis mr-1">Meta:</span>
                  <span class="mono font-weight-medium">$ {{ fmt(vend.meta) }}</span>
                </span>
                <v-chip
                  size="small"
                  :color="colorPct(vend.meta ? Math.round((modo === 'total' ? vend.totalVenta : vend.totalFact) / vend.meta * 100) : 0)"
                  variant="flat"
                >
                  {{ vend.meta ? Math.round((modo === 'total' ? vend.totalVenta : vend.totalFact) / vend.meta * 100) : 0 }}%
                </v-chip>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text class="pa-0">
              <div class="pa-3">

                <!-- Barra de progreso global del vendedor -->
                <div class="vend-progress-row mb-3">
                  <div class="d-flex justify-space-between text-caption mb-1">
                    <span class="mono font-weight-medium">$ {{ fmt(modo === 'total' ? vend.totalVenta : vend.totalFact) }} vendido</span>
                    <span class="text-medium-emphasis">Meta <span class="mono">$ {{ fmt(vend.meta) }}</span></span>
                  </div>
                  <v-progress-linear
                    :model-value="Math.min(vend.meta ? Math.round((modo === 'total' ? vend.totalVenta : vend.totalFact) / vend.meta * 100) : 0, 100)"
                    :color="colorPct(vend.meta ? Math.round((modo === 'total' ? vend.totalVenta : vend.totalFact) / vend.meta * 100) : 0)"
                    bg-color="#E9EEF6"
                    height="8"
                    rounded
                  />
                </div>

                <!-- Desglose por zona -->
                <div class="vend-zona-table">
                  <div class="vend-zona-row vend-zona-header">
                    <span>Zona</span>
                    <span class="text-right">Pedidos</span>
                    <span class="text-right">Vendido</span>
                    <span class="text-right">% del total</span>
                  </div>
                  <div
                    v-for="zona in vend.zonas.filter((z: any) => (modo === 'total' ? z.VENTA_TOTAL : z.VENTA_FACTURADO) > 0 || z.NUM_PEDIDOS > 0)"
                    :key="zona.CODRUTA_ZONA"
                    class="vend-zona-row"
                  >
                    <span>
                      <v-icon size="12" color="#1E40AF" class="mr-1">mdi-map-marker-radius</v-icon>
                      {{ zona.NOMBRE_ZONA }}
                    </span>
                    <span class="text-right mono text-caption">{{ modo === 'total' ? zona.NUM_PEDIDOS : zona.NUM_FACTURADO }}</span>
                    <span class="text-right mono font-weight-medium">$ {{ fmt(modo === 'total' ? zona.VENTA_TOTAL : zona.VENTA_FACTURADO) }}</span>
                    <span class="text-right">
                      <v-chip size="x-small" color="primary" variant="tonal">
                        {{ (modo === 'total' ? vend.totalVenta : vend.totalFact) > 0
                          ? Math.round((modo === 'total' ? zona.VENTA_TOTAL : zona.VENTA_FACTURADO) / (modo === 'total' ? vend.totalVenta : vend.totalFact) * 100)
                          : 0 }}%
                      </v-chip>
                    </span>
                  </div>
                  <div v-if="vend.zonas.filter((z: any) => (modo === 'total' ? z.VENTA_TOTAL : z.VENTA_FACTURADO) > 0).length === 0"
                       class="vend-zona-empty">Sin ventas registradas este período</div>
                </div>

              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

      </v-tabs-window-item>

      <!-- ══════════════ TAB GESTIÓN ══════════════ -->
      <v-tabs-window-item value="gestion">

        <!-- Toolbar -->
        <div class="d-flex align-center justify-space-between mb-4 flex-wrap gap-2">
          <div class="section-label">
            <v-icon size="16" color="#1E40AF">mdi-map-marker-radius</v-icon>
            Zonas con vendedores
          </div>
          <div class="d-flex gap-2">
            <v-btn variant="text" size="small" prepend-icon="mdi-refresh" :loading="cargandoZonas" @click="cargarZonas">Actualizar</v-btn>
            <v-btn color="primary" variant="flat" size="small" prepend-icon="mdi-plus" @click="dialogNuevaZona = true">
              Nueva meta de zona
            </v-btn>
          </div>
        </div>

        <!-- Lista de zonas -->
        <div class="gestion-table-wrap">
          <v-data-table
            :headers="headersZonaList"
            :items="zonasConMeta"
            :loading="cargandoZonas"
            density="comfortable"
            no-data-text="No hay zonas disponibles"
            items-per-page-text="Por página"
            class="gestion-table"
          >
            <template #item.DESCRIPCION="{ item }">
              <div class="d-flex align-center gap-2">
                <v-icon size="14" color="#1E40AF">mdi-map-marker-radius</v-icon>
                <span class="gestion-vend-name">{{ item.DESCRIPCION }}</span>
                <span class="gestion-vend-cod">· {{ item.CODRUTA }}</span>
              </div>
            </template>
            <template #item.META_ZONA="{ item }">
              <span v-if="item.META_ZONA" class="mono font-weight-medium">$ {{ fmt(item.META_ZONA) }}</span>
              <span v-else class="text-medium-emphasis text-caption">—</span>
            </template>
            <template #item.acciones="{ item }">
              <v-btn icon="mdi-eye" variant="text" size="small" density="compact" @click="abrirDetalleZona(item)" />
              <v-btn icon="mdi-trash-can-outline" variant="text" size="small" density="compact" color="error"
                @click="zonaAEliminar = item; dialogEliminarZona = true" />
            </template>
          </v-data-table>
        </div>

      </v-tabs-window-item>
    </v-tabs-window>

    <!-- Dialog editar meta de vendedor individual -->
    <v-dialog v-model="dialog" max-width="400" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold pa-4">Editar Meta — {{ form.nomVendedor }}</v-card-title>
        <v-card-text class="pt-0">
          <v-row dense>
            <v-col cols="12">
              <v-text-field
                v-model.number="form.meta"
                label="Meta ($) *"
                variant="outlined"
                density="compact"
                type="number"
                min="0"
                :max="maxMetaVendedor ?? undefined"
                prefix="$"
                :error="metaZona > 0 && form.meta > maxMetaVendedor"
                :error-messages="metaZona > 0 && form.meta > maxMetaVendedor ? `Máximo disponible: $ ${fmt(maxMetaVendedor)}` : ''"
              />
            </v-col>
            <v-col v-if="form.id" cols="12">
              <v-switch v-model="form.cumplida" label="¿Meta cumplida?" color="success" density="compact" hide-details />
            </v-col>
            <v-col v-if="metaZona > 0" cols="12">
              <div class="text-caption text-medium-emphasis">
                Representa el <strong>{{ Math.round((form.meta / metaZona) * 100) }}%</strong> de la meta total de la zona ($ {{ fmt(metaZona) }})
                · Disponible: <span :class="maxMetaVendedor < 0 ? 'text-error font-weight-bold' : ''">$ {{ fmt(maxMetaVendedor) }}</span>
              </div>
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="guardando" @click="guardarVendedor">Guardar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: Nueva meta de zona -->
    <v-dialog v-model="dialogNuevaZona" max-width="440" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold pa-4 d-flex align-center gap-2">
          <v-icon color="#1E40AF" size="18">mdi-map-marker-plus</v-icon>
          Nueva meta de zona
        </v-card-title>
        <v-card-text class="pt-0">
          <v-row dense>
            <v-col cols="12">
              <v-autocomplete
                v-model="zonaNuevaMeta"
                :items="zonas"
                item-title="LABEL"
                item-value="CODRUTA"
                label="Zona *"
                variant="outlined"
                density="compact"
                clearable
                hide-details
              />
            </v-col>
            <v-col cols="12" class="mt-3">
              <v-text-field
                v-model.number="metaNuevaInput"
                label="Meta total ($) *"
                variant="outlined"
                density="compact"
                type="number"
                min="0"
                prefix="$"
                hide-details
              />
            </v-col>
            <v-col v-if="zonaNuevaMeta && metaNuevaInput > 0" cols="12" class="mt-2">
              <div class="text-caption text-medium-emphasis">
                <span class="font-weight-medium">{{ zonas.find((z: any) => z.CODRUTA === zonaNuevaMeta)?.NUM_VENDEDORES ?? '?' }}</span> vendedor(es) en esta zona
                · aprox. <span class="mono">$ {{ fmt(metaNuevaInput / (zonas.find((z: any) => z.CODRUTA === zonaNuevaMeta)?.NUM_VENDEDORES || 1)) }}</span> c/u
              </div>
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialogNuevaZona = false; zonaNuevaMeta = null; metaNuevaInput = 0">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="guardandoZona" prepend-icon="mdi-approximately-equal-box" @click="guardarNuevaMetaZona">
            Dividir y guardar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: Detalle de zona -->
    <v-dialog v-model="dialogDetalleZona" max-width="680" scrollable>
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold pa-4 d-flex align-center gap-2">
          <v-icon color="#1E40AF" size="18">mdi-map-marker-radius</v-icon>
          {{ zonaDetalleActual?.DESCRIPCION ?? 'Zona' }}
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" density="compact" size="small" @click="dialogDetalleZona = false" />
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4">

          <!-- Meta de zona + dividir -->
          <div class="zona-meta-panel mb-4">
            <div class="zona-meta-header">
              <v-icon size="16" color="#1E40AF">mdi-target</v-icon>
              <span>Meta total de la zona</span>
            </div>
            <div class="d-flex align-center gap-3 flex-wrap mt-2">
              <v-text-field
                v-model.number="metaZonaInput"
                label="Meta ($)"
                variant="outlined"
                density="compact"
                type="number"
                min="0"
                prefix="$"
                hide-details
                style="max-width:200px"
              />
              <v-btn
                color="primary"
                variant="flat"
                size="small"
                prepend-icon="mdi-approximately-equal-box"
                :loading="dividiendo"
                @click="dividirIgualitariamente"
              >
                Dividir igualitariamente
              </v-btn>
              <div v-if="metaZona > 0" class="zona-meta-actual">
                Meta guardada: <span class="mono font-weight-bold">$ {{ fmt(metaZona) }}</span>
                &nbsp;·&nbsp; {{ vendedoresZona.length }} vendedor(es)
                &nbsp;·&nbsp; aprox. <span class="mono">$ {{ fmt(metaZona / (vendedoresZona.length || 1)) }}</span> c/u
              </div>
            </div>
          </div>

          <!-- Tabla vendedores de la zona -->
          <div class="gestion-table-wrap">
            <v-data-table
              :headers="headersZona"
              :items="vendedoresZona"
              :loading="cargandoVendedoresZona"
              density="comfortable"
              no-data-text="No hay vendedores en esta zona"
              items-per-page-text="Por página"
              class="gestion-table"
            >
              <template #item.NOMVENDEDOR="{ item }">
                <span class="gestion-vend-name">{{ item.NOMVENDEDOR }}</span>
                <span class="gestion-vend-cod"> · {{ item.CODVENDEDOR }}</span>
              </template>
              <template #item.META="{ item }">
                <span class="mono font-weight-medium">$ {{ fmt(item.META) }}</span>
              </template>
              <template #item.PCT_ZONA="{ item }">
                <div class="d-flex align-center gap-2">
                  <v-progress-linear
                    :model-value="pctZona(item)"
                    color="primary"
                    bg-color="#E9EEF6"
                    height="6"
                    rounded
                    style="min-width:60px;max-width:80px"
                  />
                  <span class="mono text-caption font-weight-medium" :class="pctZona(item) >= 100 ? 'text-error' : ''">
                    {{ pctZona(item) }}%
                  </span>
                </div>
              </template>
              <template #item.CUMPLIDA="{ item }">
                <v-chip
                  v-if="item.ID_META"
                  :color="item.CUMPLIDA ? 'success' : 'default'"
                  :variant="item.CUMPLIDA ? 'flat' : 'outlined'"
                  size="small"
                  :loading="toggling === item.ID_META"
                  style="cursor:pointer"
                  @click="toggleCumplida({ ID: item.ID_META, CUMPLIDA: item.CUMPLIDA })"
                >
                  <v-icon start size="14">{{ item.CUMPLIDA ? 'mdi-check-circle' : 'mdi-circle-outline' }}</v-icon>
                  {{ item.CUMPLIDA ? 'Cumplida' : 'Pendiente' }}
                </v-chip>
                <v-chip v-else size="small" variant="outlined" color="default">Sin meta</v-chip>
              </template>
              <template #item.acciones="{ item }">
                <v-btn icon="mdi-pencil" variant="text" size="small" density="compact" @click="abrirEdicionVendedor(item)" />
              </template>
            </v-data-table>
          </div>

        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Dialog: Confirmar eliminación de zona -->
    <v-dialog v-model="dialogEliminarZona" max-width="420" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold pa-4 d-flex align-center gap-2">
          <v-icon color="error" size="18">mdi-alert</v-icon>
          Eliminar meta de zona
        </v-card-title>
        <v-card-text class="pt-0">
          <p>
            ¿Eliminar la meta de <strong>{{ zonaAEliminar?.DESCRIPCION }}</strong>?
          </p>
          <v-alert type="warning" variant="tonal" density="compact" class="mt-2 text-caption">
            También se eliminarán las metas individuales de todos los vendedores de esta zona para el período seleccionado.
          </v-alert>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialogEliminarZona = false; zonaAEliminar = null">Cancelar</v-btn>
          <v-btn color="error" variant="flat" :loading="eliminandoZona" @click="eliminarMetaZona">Eliminar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" :timeout="3000">{{ snack.text }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';

const API = `${import.meta.env.VITE_API_URL}/metas-vendedor`;

const meses = [
  { valor: 1, label: 'Enero' },   { valor: 2, label: 'Febrero' },  { valor: 3, label: 'Marzo' },
  { valor: 4, label: 'Abril' },   { valor: 5, label: 'Mayo' },      { valor: 6, label: 'Junio' },
  { valor: 7, label: 'Julio' },   { valor: 8, label: 'Agosto' },    { valor: 9, label: 'Septiembre' },
  { valor: 10, label: 'Octubre' },{ valor: 11, label: 'Noviembre' },{ valor: 12, label: 'Diciembre' },
];
const anioActual = new Date().getFullYear();
const mesActual  = new Date().getMonth() + 1;
const aniosDisponibles = Array.from({ length: 5 }, (_, i) => anioActual - 1 + i);

// ── Estado global ──
const tab          = ref('progreso');
const filtroAnio   = ref(anioActual);
const filtroMes    = ref(mesActual);
const modo         = ref<'total' | 'facturado'>('total');

// ── Progreso ──
const progreso                 = ref<any[]>([]);
const cargandoProgreso         = ref(false);
const progresoVendedor         = ref<any[]>([]);
const cargandoProgresoVendedor = ref(false);

// ── Gestión: zonas ──
const zonas               = ref<any[]>([]);
const cargandoZonas       = ref(false);
const zonaSeleccionada    = ref<number | null>(null);
const metaZona            = ref(0);
const metaZonaInput       = ref(0);
const vendedoresZona      = ref<any[]>([]);
const cargandoVendedoresZona = ref(false);
const dividiendo          = ref(false);

// ── Dialogs ──
const dialog            = ref(false);
const dialogNuevaZona   = ref(false);
const dialogDetalleZona = ref(false);
const zonaNuevaMeta     = ref<number | null>(null);
const metaNuevaInput    = ref(0);
const guardandoZona       = ref(false);
const dialogEliminarZona  = ref(false);
const zonaAEliminar       = ref<any>(null);
const eliminandoZona      = ref(false);
const guardando = ref(false);
const toggling  = ref<number | null>(null);
const form      = ref({ codVendedor: null as number | null, nomVendedor: '', meta: 0, cumplida: false, id: null as number | null });
const snack     = ref({ show: false, text: '', color: 'success' });

const headersZona = [
  { title: 'Vendedor',    key: 'NOMVENDEDOR', sortable: true },
  { title: 'Meta indiv.', key: 'META',        sortable: true, width: '160px' },
  { title: '% de zona',   key: 'PCT_ZONA',    sortable: false, width: '160px' },
  { title: 'Estado',      key: 'CUMPLIDA',    sortable: false, width: '130px' },
  { title: '',            key: 'acciones',    sortable: false, width: '60px' },
];
const headersZonaList = [
  { title: 'Zona',        key: 'DESCRIPCION',   sortable: true },
  { title: 'Vendedores',  key: 'NUM_VENDEDORES', sortable: true, width: '140px' },
  { title: 'Meta ($)',    key: 'META_ZONA',      sortable: true, width: '180px' },
  { title: '',            key: 'acciones',       sortable: false, width: '100px' },
];

// ── Helpers ──
function fmt(v: number) {
  return new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
}
function mostrarSnack(text: string, color = 'success') { snack.value = { show: true, text, color }; }

function ventaModo(item: any): number {
  return modo.value === 'facturado' ? Number(item.VENTA_FACTURADO) : Number(item.VENTA_TOTAL);
}
function pedidoLabel(item: any): number {
  return modo.value === 'facturado' ? Number(item.NUM_FACTURADO) : Number(item.NUM_PEDIDOS);
}
function pct(item: any): number {
  const m = Number(item.META);
  if (!m) return 0;
  return Math.round((ventaModo(item) / m) * 100);
}
function colorPct(p: number): string {
  if (p >= 100) return 'success';
  if (p >= 75)  return 'warning';
  if (p >= 50)  return 'orange';
  return 'error';
}
function borderColorClass(p: number): string {
  if (p >= 100) return 'border-success';
  if (p >= 75)  return 'border-warning';
  if (p >= 50)  return 'border-orange';
  return 'border-error';
}
function pctColorClass(p: number): string {
  if (p >= 100) return 'pct-success';
  if (p >= 75)  return 'pct-warning';
  if (p >= 50)  return 'pct-orange';
  return 'pct-error';
}
function rankClass(i: number): string {
  if (i === 0) return 'rank-gold';
  if (i === 1) return 'rank-silver';
  if (i === 2) return 'rank-bronze';
  return '';
}

// ── Computed para progreso ──
const progresoOrdenado = computed(() => [...progreso.value].sort((a, b) => pct(b) - pct(a)));

const progresoByZona = computed(() => {
  const grupos: Record<number, { codruta: number; nombre: string; items: any[] }> = {};
  for (const item of progreso.value) {
    const key = Number(item.CODRUTA) || 0;
    if (!grupos[key]) grupos[key] = { codruta: key, nombre: String(item.NOMBREZONA || 'Sin zona'), items: [] };
    grupos[key].items.push(item);
  }
  return Object.values(grupos).sort((a, b) => a.nombre.localeCompare(b.nombre));
});
const totalMeta        = computed(() => progreso.value.reduce((s, i) => s + Number(i.META), 0));
const totalVendido     = computed(() => progreso.value.reduce((s, i) => s + ventaModo(i), 0));
const promedioGeneral  = computed(() => {
  if (!progreso.value.length) return 0;
  return Math.round(progreso.value.reduce((s, i) => s + pct(i), 0) / progreso.value.length);
});

// ── Computed para rankings ──
const rankingPct       = computed(() => [...progreso.value].sort((a, b) => pct(b) - pct(a)));
const rankingMonto     = computed(() => [...progreso.value].sort((a, b) => ventaModo(b) - ventaModo(a)));
const rankingPedidos   = computed(() => [...progreso.value].sort((a, b) => pedidoLabel(b) - pedidoLabel(a)));
const rankingDistancia = computed(() => [...progreso.value].sort((a, b) => (a.META - ventaModo(a)) - (b.META - ventaModo(b))));
const top3             = computed(() => rankingPct.value.slice(0, 3));

const zonaDetalleActual = computed(() =>
  zonas.value.find((z: any) => z.CODRUTA === zonaSeleccionada.value)
);

const progresoVendedorAgrupado = computed(() => {
  const map: Record<number, { codVendedor: number; nomVendedor: string; meta: number; cumplida: boolean; zonas: any[]; totalVenta: number; totalFact: number }> = {};
  for (const row of progresoVendedor.value) {
    const k = row.CODVENDEDOR;
    if (!map[k]) map[k] = { codVendedor: k, nomVendedor: row.NOMVENDEDOR, meta: Number(row.META), cumplida: !!row.CUMPLIDA, zonas: [], totalVenta: 0, totalFact: 0 };
    map[k].zonas.push(row);
    map[k].totalVenta += Number(row.VENTA_TOTAL);
    map[k].totalFact  += Number(row.VENTA_FACTURADO);
  }
  return Object.values(map).sort((a, b) => a.nomVendedor.localeCompare(b.nomVendedor));
});

const zonasConMeta = computed(() =>
  zonas.value.filter((z: any) => z.META_ZONA != null)
);

// ── Computed ──
function pctZona(item: any): number {
  if (!metaZona.value) return 0;
  return Math.min(Math.round((Number(item.META) / metaZona.value) * 100), 999);
}

const maxMetaVendedor = computed(() => {
  if (!metaZona.value) return Infinity;
  const otras = vendedoresZona.value
    .filter((v: any) => v.CODVENDEDOR !== form.value.codVendedor)
    .reduce((s: number, v: any) => s + Number(v.META), 0);
  return metaZona.value - otras;
});

// ── Data loaders ──
async function cargarProgreso() {
  cargandoProgreso.value = true;
  try {
    const res = await axios.get(`${API}/progreso`, { params: { anio: filtroAnio.value, mes: filtroMes.value } });
    progreso.value = res.data.data;
  } catch { mostrarSnack('Error al obtener el progreso', 'error'); }
  finally { cargandoProgreso.value = false; }
}

async function cargarProgresoVendedor() {
  cargandoProgresoVendedor.value = true;
  try {
    const res = await axios.get(`${API}/progreso-vendedor`, { params: { anio: filtroAnio.value, mes: filtroMes.value } });
    progresoVendedor.value = res.data.data;
  } catch { mostrarSnack('Error al obtener progreso por vendedor', 'error'); }
  finally { cargandoProgresoVendedor.value = false; }
}

async function cargarZonas() {
  cargandoZonas.value = true;
  try {
    const res = await axios.get(`${API}/zonas`, { params: { anio: filtroAnio.value, mes: filtroMes.value } });
    zonas.value = (res.data.data ?? []).map((z: any) => ({
      ...z,
      LABEL: `${z.CODRUTA} - ${z.DESCRIPCION}`,
    }));
  } catch (e) {
    console.error('[metas] error zonas:', e);
    mostrarSnack('Error al obtener zonas', 'error');
  }
  finally { cargandoZonas.value = false; }
}

async function cargarVendedoresZona() {
  if (!zonaSeleccionada.value) return;
  cargandoVendedoresZona.value = true;
  try {
    const res = await axios.get(`${API}/zonas/${zonaSeleccionada.value}/vendedores`, {
      params: { anio: filtroAnio.value, mes: filtroMes.value }
    });
    vendedoresZona.value = res.data.vendedores;
    metaZona.value       = Number(res.data.metaZona ?? 0);
    metaZonaInput.value  = metaZona.value || 0;
  } catch { mostrarSnack('Error al obtener vendedores de la zona', 'error'); }
  finally { cargandoVendedoresZona.value = false; }
}

watch(tab, (val) => {
  if (val === 'vendedores' && !progresoVendedor.value.length) cargarProgresoVendedor();
});

watch(zonaSeleccionada, () => {
  vendedoresZona.value = [];
  metaZona.value       = 0;
  metaZonaInput.value  = 0;
});

async function recargar() {
  progresoVendedor.value = [];
  await Promise.all([cargarProgreso(), cargarZonas()]);
  if (tab.value === 'vendedores') await cargarProgresoVendedor();
  if (zonaSeleccionada.value) await cargarVendedoresZona();
}

// ── Zona: eliminar meta ──
async function eliminarMetaZona() {
  if (!zonaAEliminar.value) return;
  eliminandoZona.value = true;
  try {
    await axios.delete(`${API}/zonas/${zonaAEliminar.value.CODRUTA}`, {
      params: { anio: filtroAnio.value, mes: filtroMes.value },
    });
    mostrarSnack(`Meta de ${zonaAEliminar.value.DESCRIPCION} eliminada`);
    dialogEliminarZona.value = false;
    zonaAEliminar.value = null;
    progresoVendedor.value = [];
    await Promise.all([cargarZonas(), cargarProgreso()]);
  } catch { mostrarSnack('Error al eliminar la meta de zona', 'error'); }
  finally { eliminandoZona.value = false; }
}

// ── Zona: abrir detalle y guardar nueva meta ──
async function abrirDetalleZona(zona: any) {
  zonaSeleccionada.value = zona.CODRUTA;
  dialogDetalleZona.value = true;
  await cargarVendedoresZona();
}

async function guardarNuevaMetaZona() {
  if (!zonaNuevaMeta.value || !metaNuevaInput.value) {
    mostrarSnack('Completá la zona y la meta', 'warning'); return;
  }
  guardandoZona.value = true;
  try {
    await axios.post(`${API}/zonas/${zonaNuevaMeta.value}`, {
      anio: filtroAnio.value, mes: filtroMes.value, meta: metaNuevaInput.value,
    });
    mostrarSnack('Meta de zona guardada y distribuida');
    dialogNuevaZona.value = false;
    zonaNuevaMeta.value   = null;
    metaNuevaInput.value  = 0;
    await Promise.all([cargarZonas(), cargarProgreso()]);
  } catch { mostrarSnack('Error al guardar la meta de zona', 'error'); }
  finally { guardandoZona.value = false; }
}

// ── Zona: dividir igualitariamente ──
async function dividirIgualitariamente() {
  if (!zonaSeleccionada.value || !metaZonaInput.value) {
    mostrarSnack('Ingresá un monto de meta para la zona', 'warning'); return;
  }
  dividiendo.value = true;
  try {
    await axios.post(`${API}/zonas/${zonaSeleccionada.value}`, {
      anio: filtroAnio.value,
      mes:  filtroMes.value,
      meta: metaZonaInput.value,
    });
    mostrarSnack('Meta dividida igualitariamente entre los vendedores');
    await Promise.all([cargarVendedoresZona(), cargarZonas()]);
    await cargarProgreso();
  } catch { mostrarSnack('Error al guardar la meta de zona', 'error'); }
  finally { dividiendo.value = false; }
}

// ── Edición por vendedor ──
function abrirEdicionVendedor(item: any) {
  form.value = {
    codVendedor: item.CODVENDEDOR,
    nomVendedor: item.NOMVENDEDOR,
    meta:        Number(item.META),
    cumplida:    !!item.CUMPLIDA,
    id:          item.ID_META ?? null,
  };
  dialog.value = true;
}

async function guardarVendedor() {
  if (!form.value.codVendedor || form.value.meta == null) {
    mostrarSnack('Completá todos los campos requeridos', 'warning'); return;
  }
  if (metaZona.value > 0 && form.value.meta > maxMetaVendedor.value) {
    mostrarSnack(`La meta supera el disponible de la zona (máx. $ ${fmt(maxMetaVendedor.value)})`, 'error'); return;
  }
  guardando.value = true;
  try {
    await axios.post(API, {
      codVendedor: form.value.codVendedor,
      anio: filtroAnio.value,
      mes:  filtroMes.value,
      meta: form.value.meta,
    });
    if (form.value.id) await axios.patch(`${API}/${form.value.id}/cumplida`, { cumplida: form.value.cumplida });
    dialog.value = false;
    mostrarSnack('Meta guardada correctamente');
    await cargarVendedoresZona();
    await cargarProgreso();
  } catch { mostrarSnack('Error al guardar la meta', 'error'); }
  finally { guardando.value = false; }
}

async function toggleCumplida(item: any) {
  toggling.value = item.ID;
  try {
    const nueva = !item.CUMPLIDA;
    await axios.patch(`${API}/${item.ID}/cumplida`, { cumplida: nueva });
    const vend = vendedoresZona.value.find((v: any) => v.ID_META === item.ID);
    if (vend) vend.CUMPLIDA = nueva;
    mostrarSnack(nueva ? 'Meta marcada como cumplida' : 'Meta desmarcada');
  } catch { mostrarSnack('Error al actualizar la meta', 'error'); }
  finally { toggling.value = null; }
}

onMounted(async () => {
  await recargar();
});
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Fira+Sans:wght@400;500;600;700&display=swap');

/* ── Design tokens ── */
.metas-dashboard {
  --c-primary:  #1E40AF;
  --c-accent:   #D97706;
  --c-success:  #059669;
  --c-warning:  #D97706;
  --c-danger:   #DC2626;
  --c-orange:   #EA580C;
  --c-muted:    #E9EEF6;
  --c-bg:       #F8FAFC;
  --c-border:   #E2E8F0;
  --c-text:     #0F172A;
  --c-sub:      #64748B;
  font-family: 'Fira Sans', 'Segoe UI', sans-serif;
}

/* ── Header ── */
.dash-header {
  border-left: 4px solid var(--c-primary);
  padding-left: 12px;
}
.dash-title {
  font-family: 'Fira Sans', sans-serif;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--c-primary);
  letter-spacing: -0.01em;
  line-height: 1.2;
}
.dash-subtitle {
  font-size: 0.8rem;
  color: var(--c-sub);
  margin-top: 2px;
}

/* ── KPI cards ── */
.kpi-card {
  border-radius: 10px;
  padding: 14px 16px;
  position: relative;
  overflow: hidden;
  transition: transform 150ms ease, box-shadow 150ms ease;
  cursor: default;
}
.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.12);
}
.kpi-primary { background: var(--c-primary); }
.kpi-success { background: var(--c-success); }
.kpi-accent  { background: var(--c-accent);  }
.kpi-muted   { background: #334155;          }

.kpi-icon-wrap {
  position: absolute;
  top: 12px;
  right: 14px;
  opacity: 0.6;
}
.kpi-number {
  font-family: 'Fira Code', monospace;
  font-size: 2rem;
  font-weight: 600;
  color: white;
  line-height: 1.1;
  margin-top: 20px;
}
.kpi-money { font-size: 1.35rem; }
.kpi-label {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.75);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-top: 4px;
}

/* ── Progress list ── */
.progress-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.progress-card {
  background: white;
  border: 1px solid var(--c-border);
  border-left-width: 4px;
  border-radius: 8px;
  padding: 12px 16px;
  transition: background 150ms, box-shadow 150ms;
}
.progress-card:hover {
  background: var(--c-bg);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.border-success { border-left-color: var(--c-success) !important; }
.border-warning { border-left-color: var(--c-warning) !important; }
.border-orange  { border-left-color: var(--c-orange)  !important; }
.border-error   { border-left-color: var(--c-danger)  !important; }

.rank-badge {
  font-family: 'Fira Code', monospace;
  font-size: 1.4rem;
  font-weight: 700;
  color: #CBD5E1;
  min-width: 36px;
  text-align: center;
  flex-shrink: 0;
}
.rank-gold   { color: #D97706; }
.rank-silver { color: #64748B; }
.rank-bronze { color: #B45309; }

.prog-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--c-text);
}
.prog-sub {
  font-size: 0.75rem;
  color: var(--c-sub);
  margin-top: 1px;
}
.prog-pct {
  font-family: 'Fira Code', monospace;
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1;
}
.pct-success { color: var(--c-success); }
.pct-warning { color: var(--c-warning); }
.pct-orange  { color: var(--c-orange);  }
.pct-error   { color: var(--c-danger);  }

.prog-falta, .prog-sobre {
  font-size: 0.7rem;
  color: var(--c-sub);
  white-space: nowrap;
}
.prog-sobre { color: var(--c-success) !important; }
.prog-meta {
  font-size: 0.75rem;
  color: var(--c-sub);
}
.prog-bar-row { padding-top: 4px; }

/* ── Section label ── */
.section-label {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--c-sub);
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── Podium ── */
.podium-row {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 8px;
}
.podium-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 0 0 120px;
}
.podium-1 { flex-basis: 140px; }

.podium-crown {
  margin-bottom: 4px;
}
.podium-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}
.podium-1 .podium-avatar { width: 64px; height: 64px; }
.podium-gold   { background: #D97706; }
.podium-silver { background: #94A3B8; }
.podium-bronze { background: #B45309; }

.podium-name {
  font-size: 0.8rem;
  font-weight: 600;
  text-align: center;
  color: var(--c-text);
  line-height: 1.3;
}
.podium-pct {
  font-family: 'Fira Code', monospace;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--c-sub);
  margin: 2px 0 6px;
}
.podium-pct-gold { color: #D97706; }
.podium-bar {
  width: 100%;
  border-radius: 4px 4px 0 0;
}

/* ── Ranking cards ── */
.rank-card {
  border: 1px solid var(--c-border);
  border-radius: 10px;
  overflow: hidden;
  background: white;
}
.rank-card-title {
  padding: 10px 14px;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--c-sub);
  background: var(--c-bg);
  border-bottom: 1px solid var(--c-border);
  display: flex;
  align-items: center;
  gap: 6px;
}
.rank-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  border-bottom: 1px solid #F1F5F9;
  transition: background 150ms;
}
.rank-row:last-child { border-bottom: none; }
.rank-row:hover { background: var(--c-bg); }

.rank-num {
  font-family: 'Fira Code', monospace;
  font-size: 1rem;
  font-weight: 700;
  color: #CBD5E1;
  min-width: 24px;
  text-align: center;
}
.rank-vend {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--c-text);
}
.rank-detail {
  font-size: 0.72rem;
  color: var(--c-sub);
}

/* ── Panel meta zona ── */
.zona-meta-panel {
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-left: 4px solid var(--c-primary);
  border-radius: 8px;
  padding: 14px 16px;
}
.zona-meta-header {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--c-sub);
  display: flex;
  align-items: center;
  gap: 6px;
}
.zona-meta-actual {
  font-size: 0.8rem;
  color: var(--c-sub);
  align-self: center;
}

/* ── Gestión tab ── */
.gestion-toolbar {
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: 10px;
  padding: 12px 16px;
}
.gestion-table-wrap {
  border: 1px solid var(--c-border);
  border-radius: 10px;
  overflow: hidden;
}
.gestion-table :deep(thead tr th) {
  font-family: 'Fira Sans', sans-serif;
  font-size: 0.72rem !important;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--c-sub) !important;
  background: var(--c-bg) !important;
  border-bottom: 1px solid var(--c-border) !important;
}
.gestion-table :deep(tbody tr:hover td) {
  background: var(--c-bg);
}
.gestion-table :deep(tbody tr td) {
  border-bottom: 1px solid #F1F5F9 !important;
  font-size: 0.85rem;
}
.gestion-vend-name {
  font-weight: 600;
  color: var(--c-text);
}
.gestion-vend-cod {
  font-family: 'Fira Code', monospace;
  font-size: 0.75rem;
  color: var(--c-sub);
}
.gestion-cumplida-label {
  font-size: 0.78rem;
  font-weight: 500;
}

/* ── Zona expansion panels (progreso) ── */
.zona-panels {
  border: 1px solid var(--c-border);
  border-radius: 10px;
  overflow: hidden;
}
.zona-panels :deep(.v-expansion-panel) {
  border-radius: 0 !important;
}
.zona-panels :deep(.v-expansion-panel-title) {
  background: white;
  border-bottom: 1px solid var(--c-border);
  min-height: 52px;
  padding: 8px 16px;
}
.zona-panels :deep(.v-expansion-panel-title:hover) {
  background: var(--c-bg);
}
.zona-panels :deep(.v-expansion-panel-text__wrapper) {
  padding: 0;
}
.zona-panel-name {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--c-text);
}
.zona-panel-kpi {
  display: flex;
  align-items: center;
  font-size: 0.82rem;
  color: var(--c-text);
  gap: 4px;
}

/* ── Vendedores tab: desglose por zona ── */
.vend-progress-row { padding: 0 4px; }
.vend-zona-table {
  border: 1px solid var(--c-border);
  border-radius: 8px;
  overflow: hidden;
  font-size: 0.82rem;
}
.vend-zona-row {
  display: grid;
  grid-template-columns: 1fr 90px 160px 100px;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border-bottom: 1px solid #F1F5F9;
  transition: background 120ms;
}
.vend-zona-row:last-child { border-bottom: none; }
.vend-zona-row:not(.vend-zona-header):hover { background: var(--c-bg); }
.vend-zona-header {
  background: var(--c-bg);
  border-bottom: 1px solid var(--c-border);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--c-sub);
}
.vend-zona-empty {
  padding: 12px 14px;
  font-size: 0.8rem;
  color: var(--c-sub);
  font-style: italic;
}

/* ── Misc ── */
.mono {
  font-family: 'Fira Code', monospace;
}
</style>
