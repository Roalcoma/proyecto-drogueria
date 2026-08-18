<template>
  <v-container fluid class="pa-6 bg-background h-100">
    <div class="d-flex align-center mb-6">
      <v-icon color="primary" size="32" class="mr-3">mdi-account-group</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black" style="color: #164E63;">Gestión de Clientes</h1>
        <span class="text-caption text-medium-emphasis">Descuento global y grupos de clientes</span>
      </div>
    </div>

    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="clientes">Clientes</v-tab>
      <v-tab value="grupos">Grupos de Clientes</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <!-- ===================== CLIENTES ===================== -->
      <v-window-item value="clientes">
        <v-card rounded="xl" elevation="2">
          <v-card-title class="pa-4 d-flex align-center gap-3 flex-wrap">
            <v-text-field v-model="busquedaCliente" label="Buscar por nombre o CIF" prepend-inner-icon="mdi-magnify"
              variant="outlined" density="compact" hide-details clearable @keyup.enter="cargarClientes" style="max-width: 320px;" />
            <v-select v-model="filtroRuta" :items="rutas" item-title="label" item-value="codruta"
              label="Filtrar por ruta" variant="outlined" density="compact" hide-details clearable
              prepend-inner-icon="mdi-map-marker-path" style="max-width: 260px;"
              @update:model-value="cargarClientes" />
          </v-card-title>
          <v-divider />
          <v-data-table-server
            :headers="headersClientes" :items="clientes" :items-length="totalClientes" :loading="cargandoClientes"
            v-model:items-per-page="itemsPerPageClientes" @update:options="cargarPaginaClientes"
            :items-per-page-options="[10, 25, 50, 100, 200]">
            <template v-slot:item.cliente_concat="{ item }">
              <span class="font-weight-medium">{{ item.CODCLIENTE }}</span>
              <span class="text-grey ml-1">— {{ item.NOMBRECLIENTE }}</span>
            </template>
            <template v-slot:item.ruta_display="{ item }">
              <v-chip v-if="item.ZONA" size="x-small" color="blue-grey" variant="tonal" label>
                {{ item.ZONA }}<span v-if="item.RUTA_NOMBRE"> — {{ item.RUTA_NOMBRE }}</span>
              </v-chip>
              <span v-else class="text-grey text-caption">—</span>
            </template>
            <template v-slot:item.DESCUENTO="{ item }">
              <div class="d-flex align-center" style="max-width: 140px;">
                <v-text-field v-model.number="item.DESCUENTO" type="number" density="compact" variant="outlined" hide-details
                  suffix="%" style="max-width: 100px;" />
                <v-btn icon="mdi-content-save" size="small" color="primary" variant="text" class="ml-1"
                  @click="guardarDescuento(item)" :loading="guardandoId === item.CODCLIENTE" />
              </div>
            </template>
            <template v-slot:item.DESCUENTO_D3="{ item }">
              <div class="d-flex align-center" style="max-width: 160px;">
                <v-text-field v-model.number="item.DESCUENTO_D3" type="number" density="compact" variant="outlined" hide-details
                  suffix="%" style="max-width: 100px;" min="0" max="99" />
                <v-btn icon="mdi-content-save" size="small" color="teal" variant="text" class="ml-1"
                  @click="guardarD3(item)" :loading="guardandoD3Id === item.CODCLIENTE" />
              </div>
            </template>
            <template v-slot:item.ftp="{ item }">
              <template v-if="ftpPorCliente[item.CODCLIENTE]">
                <v-chip
                  :color="ftpPorCliente[item.CODCLIENTE].ACTIVO === 'T' ? 'success' : 'default'"
                  size="small" variant="flat" class="mr-1">
                  <v-icon start size="14">mdi-lan-connect</v-icon>
                  {{ ftpPorCliente[item.CODCLIENTE].USUARIO }}
                </v-chip>
                <v-btn icon size="x-small" variant="text"
                  :color="ftpPorCliente[item.CODCLIENTE].ACTIVO === 'T' ? 'warning' : 'success'"
                  :title="ftpPorCliente[item.CODCLIENTE].ACTIVO === 'T' ? 'Desactivar FTP' : 'Activar FTP'"
                  @click="toggleFtpUsuario(ftpPorCliente[item.CODCLIENTE])">
                  <v-icon>{{ ftpPorCliente[item.CODCLIENTE].ACTIVO === 'T' ? 'mdi-account-off' : 'mdi-account-check' }}</v-icon>
                </v-btn>
                <v-btn icon size="x-small" variant="text" color="error" title="Eliminar usuario FTP"
                  @click="eliminarFtpUsuario(ftpPorCliente[item.CODCLIENTE])">
                  <v-icon>mdi-delete</v-icon>
                </v-btn>
              </template>
              <v-btn v-else size="x-small" variant="tonal" color="primary" prepend-icon="mdi-plus"
                @click="abrirFtpDialog(item)">
                Agregar
              </v-btn>
            </template>
          </v-data-table-server>
        </v-card>
      </v-window-item>

      <!-- ===================== GRUPOS DE CLIENTES ===================== -->
      <v-window-item value="grupos">
        <v-card rounded="xl" elevation="2">
          <v-card-title class="pa-4 d-flex align-center gap-2 flex-wrap">
            <v-text-field v-model="busquedaGrupo" label="Buscar grupo" prepend-inner-icon="mdi-magnify"
              variant="outlined" density="compact" hide-details clearable @keyup.enter="cargarGrupos"
              style="max-width: 320px;" class="mr-3" />
            <v-spacer />
            <v-btn v-if="gruposSeleccionados.length" color="error" variant="tonal" prepend-icon="mdi-delete-multiple"
              @click="confirmarEliminarSeleccion">
              Eliminar ({{ gruposSeleccionados.length }})
            </v-btn>
            <v-btn color="teal" variant="tonal" prepend-icon="mdi-account-multiple-plus" @click="$refs.excelClientesLote.click()" :loading="importandoClientesLote">Importar Clientes (masivo)</v-btn>
            <input ref="excelClientesLote" type="file" accept=".xlsx,.xls" style="display:none" @change="importarClientesLoteExcel" />
            <v-btn color="success" variant="tonal" prepend-icon="mdi-microsoft-excel" @click="$refs.excelGrupos.click()" :loading="importandoGruposExcel">Importar Grupos</v-btn>
            <input ref="excelGrupos" type="file" accept=".xlsx,.xls" style="display:none" @change="importarGruposExcel" />
            <v-btn color="primary" prepend-icon="mdi-plus" @click="abrirNuevoGrupo">Nuevo Grupo</v-btn>
          </v-card-title>
          <v-divider />
          <v-data-table-server
            :headers="headersGrupos" :items="grupos" :items-length="totalGrupos" :loading="cargandoGrupos"
            v-model:items-per-page="itemsPerPageGrupos" @update:options="cargarPaginaGrupos"
            :items-per-page-options="[10, 25, 50, 100, 200]"
            show-select v-model="gruposSeleccionados" item-value="ID">
            <template v-slot:item.CODIGO="{ item }">
              <v-chip v-if="item.CODIGO" size="x-small" color="cyan-darken-1" variant="tonal" label class="font-weight-bold">{{ item.CODIGO }}</v-chip>
              <span v-else class="text-caption text-grey">—</span>
            </template>
            <template v-slot:item.TIPO="{ item }">
              <v-chip size="x-small" :color="item.TIPO === 'CONDICION' ? 'purple-darken-1' : 'blue-grey'" variant="flat">
                {{ item.TIPO === 'CONDICION' ? 'Por condición' : 'Manual' }}
              </v-chip>
            </template>
            <template v-slot:item.acciones="{ item }">
              <v-btn icon="mdi-pencil" variant="text" size="small" @click="abrirEditarGrupo(item)" />
              <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-account-multiple" @click="abrirMiembros(item)">
                Clientes
              </v-btn>
              <v-btn icon="mdi-delete" variant="text" size="small" color="error" @click="confirmarEliminarGrupo(item)" />
            </template>
          </v-data-table-server>
        </v-card>
      </v-window-item>
    </v-window>

    <!-- Dialog: nuevo/editar grupo -->
    <v-dialog v-model="modalGrupo.mostrar" max-width="600">
      <v-card rounded="xl">
        <v-card-title class="pa-4">{{ modalGrupo.id ? 'Editar' : 'Nuevo' }} Grupo de Clientes</v-card-title>
        <v-card-text>
          <v-text-field v-model="modalGrupo.nombre" label="Nombre del grupo" variant="outlined" density="comfortable" class="mb-3" autofocus />
          <v-btn-toggle v-model="modalGrupo.tipo" color="primary" variant="outlined" divided mandatory class="mb-4">
            <v-btn value="MANUAL">Manual</v-btn>
            <v-btn value="CONDICION">Por condición</v-btn>
          </v-btn-toggle>

          <template v-if="modalGrupo.tipo === 'CONDICION'">
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-subtitle-2 font-weight-bold">Condiciones (todas se combinan con Y)</span>
              <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-plus" @click="modalGrupo.condiciones.push({ campo: '', operador: '=', valor: '' })">Agregar condición</v-btn>
            </div>
            <v-row v-for="(c, i) in modalGrupo.condiciones" :key="i" dense align="center" class="mb-1">
              <v-col cols="4">
                <v-select v-model="c.campo" :items="camposClientes" item-title="label" item-value="codigo"
                  label="Campo" variant="outlined" density="compact" hide-details />
              </v-col>
              <v-col cols="3">
                <v-select v-model="c.operador" :items="operadoresPara(c.campo)" label="Operador" variant="outlined" density="compact" hide-details />
              </v-col>
              <v-col cols="4">
                <v-text-field v-model="c.valor" label="Valor" variant="outlined" density="compact" hide-details />
              </v-col>
              <v-col cols="1"><v-btn icon="mdi-close" size="small" variant="text" color="error" @click="modalGrupo.condiciones.splice(i, 1)" /></v-col>
            </v-row>
          </template>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer /><v-btn variant="text" @click="modalGrupo.mostrar = false">Cancelar</v-btn>
          <v-btn color="primary" variant="elevated" :loading="guardandoGrupo" @click="guardarGrupo">Guardar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: confirmar eliminación de grupo -->
    <v-dialog v-model="confirmarEliminar.mostrar" max-width="420">
      <v-card rounded="xl">
        <v-card-title class="pa-4">Eliminar grupo{{ confirmarEliminar.ids.length > 1 ? 's' : '' }}</v-card-title>
        <v-card-text>
          <template v-if="confirmarEliminar.ids.length === 1">
            ¿Seguro que deseas eliminar el grupo <strong>{{ confirmarEliminar.nombre }}</strong>?
          </template>
          <template v-else>
            ¿Seguro que deseas eliminar <strong>{{ confirmarEliminar.ids.length }} grupos</strong>?
          </template>
          Se borrarán también todos sus clientes asociados. Esta acción no se puede deshacer.
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="confirmarEliminar.mostrar = false">Cancelar</v-btn>
          <v-btn color="error" variant="elevated" :loading="eliminandoGrupo" @click="eliminarGrupo">Eliminar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: importación de grupos (2 fases) -->
    <v-dialog v-model="modalImportGrupos.mostrar" max-width="620" persistent>
      <v-card rounded="xl">
        <!-- FASE: creando (spinner) -->
        <template v-if="modalImportGrupos.fase === 'creando'">
          <v-card-title class="pa-4">Creando grupos...</v-card-title>
          <v-card-text class="d-flex flex-column align-center pa-8 gap-4">
            <v-progress-circular indeterminate color="primary" size="56" />
            <span class="text-body-2 text-medium-emphasis">Por favor espera</span>
          </v-card-text>
        </template>

        <!-- FASE: resultado -->
        <template v-else-if="modalImportGrupos.fase === 'resultado'">
          <v-card-title class="pa-4">Resultado de importación</v-card-title>
          <v-card-text class="pa-4">
            <div v-if="modalImportGrupos.creados.length" class="mb-4">
              <div class="text-subtitle-2 font-weight-bold text-success mb-2">
                <v-icon size="18" color="success">mdi-check-circle</v-icon>
                Creados ({{ modalImportGrupos.creados.length }})
              </div>
              <div style="max-height:160px;overflow-y:auto;border:1px solid rgba(0,0,0,.08);border-radius:8px;">
                <v-list density="compact">
                  <v-list-item v-for="n in modalImportGrupos.creados" :key="n" :title="n" />
                </v-list>
              </div>
            </div>
            <div v-if="modalImportGrupos.errores.length">
              <div class="text-subtitle-2 font-weight-bold text-error mb-2">
                <v-icon size="18" color="error">mdi-close-circle</v-icon>
                Errores ({{ modalImportGrupos.errores.length }})
              </div>
              <div style="max-height:120px;overflow-y:auto;border:1px solid rgba(0,0,0,.08);border-radius:8px;">
                <v-list density="compact">
                  <v-list-item v-for="e in modalImportGrupos.errores" :key="e.nombre">
                    <v-list-item-title>{{ e.nombre }}</v-list-item-title>
                    <v-list-item-subtitle class="text-error">{{ e.motivo }}</v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </div>
            </div>
          </v-card-text>
          <v-card-actions class="pa-4">
            <v-spacer />
            <v-btn color="primary" variant="elevated" @click="modalImportGrupos.mostrar = false">Cerrar</v-btn>
          </v-card-actions>
        </template>

        <!-- FASE: previsualización -->
        <template v-else>
          <v-card-title class="pa-4">Vista previa — Importar grupos</v-card-title>
          <v-card-text class="pa-4">
            <div v-if="modalImportGrupos.aProcesar.length" class="mb-4">
              <div class="text-subtitle-2 font-weight-bold mb-2">
                <v-icon size="18" color="primary">mdi-checkbox-marked-circle-outline</v-icon>
                Se crearán ({{ modalImportGrupos.seleccionados.length }} / {{ modalImportGrupos.aProcesar.length }})
              </div>
              <div style="max-height:220px;overflow-y:auto;border:1px solid rgba(0,0,0,.08);border-radius:8px;">
                <v-list density="compact" select-strategy="leaf" v-model:selected="modalImportGrupos.seleccionados">
                  <v-list-item v-for="g in modalImportGrupos.aProcesar" :key="g.nombre" :value="g">
                    <template v-slot:prepend="{ isSelected }">
                      <v-checkbox-btn :model-value="isSelected" color="primary" />
                    </template>
                    <v-list-item-title>{{ g.nombre }}</v-list-item-title>
                    <v-list-item-subtitle class="text-medium-emphasis">Código: {{ g.codigo }}</v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </div>
            </div>
            <div v-if="modalImportGrupos.omitidos.length">
              <div class="text-subtitle-2 font-weight-bold text-warning mb-2">
                <v-icon size="18" color="warning">mdi-alert-circle</v-icon>
                Se saltarán ({{ modalImportGrupos.omitidos.length }})
              </div>
              <div style="max-height:140px;overflow-y:auto;border:1px solid rgba(0,0,0,.08);border-radius:8px;">
                <v-list density="compact">
                  <v-list-item v-for="o in modalImportGrupos.omitidos" :key="o.nombre">
                    <v-list-item-title>{{ o.nombre }} <span class="text-medium-emphasis text-caption">({{ o.codigo }})</span></v-list-item-title>
                    <v-list-item-subtitle class="text-warning">{{ o.motivo }}</v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </div>
            </div>
            <div v-if="!modalImportGrupos.aProcesar.length && !modalImportGrupos.omitidos.length" class="text-grey text-center pa-4">
              No se encontraron grupos para procesar.
            </div>
          </v-card-text>
          <v-card-actions class="pa-4">
            <v-btn variant="text" @click="modalImportGrupos.mostrar = false">Cancelar</v-btn>
            <v-spacer />
            <v-btn color="primary" variant="elevated" :disabled="!modalImportGrupos.seleccionados.length" @click="ejecutarCrearLote">
              Crear grupos ({{ modalImportGrupos.seleccionados.length }})
            </v-btn>
          </v-card-actions>
        </template>
      </v-card>
    </v-dialog>

    <!-- Dialog: miembros del grupo -->
    <v-dialog v-model="modalMiembros.mostrar" max-width="800">
      <v-card rounded="xl">
        <v-card-title class="pa-4 bg-primary text-white d-flex align-center justify-space-between">
          <span>{{ modalMiembros.grupo?.NOMBRE }}</span>
          <v-chip v-if="modalMiembros.grupo?.TIPO === 'CONDICION'" size="small" color="white" variant="flat" class="text-purple-darken-1">Por condición — solo lectura</v-chip>
        </v-card-title>
        <v-card-text class="pa-4">
          <template v-if="modalMiembros.grupo?.TIPO !== 'CONDICION'">
            <v-text-field v-model="busquedaClienteAgregar" label="Buscar cliente para agregar" prepend-inner-icon="mdi-magnify"
              variant="outlined" density="compact" class="mb-3" @keyup.enter="buscarClientesParaAgregar" />
            <v-list v-if="resultadosCliente.length" border rounded class="mb-4" max-height="200" style="overflow-y:auto;">
              <v-list-item v-for="cli in resultadosCliente" :key="cli.CODCLIENTE" :title="`${cli.CODCLIENTE} - ${cli.NOMBRECLIENTE}`" :subtitle="cli.ID">
                <template v-slot:append>
                  <v-btn size="small" color="success" @click="agregarMiembro(cli.CODCLIENTE)">Agregar</v-btn>
                </template>
              </v-list-item>
            </v-list>
            <div class="d-flex align-center mb-3 gap-2 flex-wrap">
              <v-btn prepend-icon="mdi-microsoft-excel" color="success" variant="tonal" size="small" @click="$refs.excelClientes.click()" :loading="importandoExcel">
                Importar Excel
              </v-btn>
              <input ref="excelClientes" type="file" accept=".xlsx,.xls" style="display:none" @change="importarExcel" />
              <span v-if="resultadoImport" class="text-caption">{{ resultadoImport }}</span>
            </div>
            <v-alert v-if="noEncontradosList.length" type="warning" variant="tonal" density="compact" class="mb-3 text-caption" closable @click:close="noEncontradosList = []">
              <strong>Códigos no encontrados ({{ noEncontradosList.length }}):</strong>
              <div class="mt-1" style="max-height:80px;overflow-y:auto;word-break:break-all;">
                {{ noEncontradosList.join(' · ') }}
              </div>
            </v-alert>
            <v-divider class="mb-3" />
          </template>
          <div class="text-subtitle-2 font-weight-bold mb-2">Clientes en el grupo ({{ totalMiembros }})</div>
          <v-data-table-server
            :headers="modalMiembros.grupo?.TIPO === 'CONDICION' ? headersMiembrosCondicion : headersMiembros"
            :items="miembros" :items-length="totalMiembros" :loading="cargandoMiembros"
            v-model:items-per-page="itemsPerPageMiembros" @update:options="cargarPaginaMiembros" density="compact"
            :items-per-page-options="[10, 25, 50, 100, 200]">
            <template v-slot:item.cliente_concat="{ item }">
              <span class="font-weight-medium">{{ item.CODCLIENTE }}</span>
              <span class="text-grey ml-1">— {{ item.NOMBRECLIENTE }}</span>
            </template>
            <template v-slot:item.acciones="{ item }">
              <v-btn icon="mdi-delete-outline" color="error" variant="text" size="small" @click="quitarMiembro(item.CODCLIENTE)" />
            </template>
          </v-data-table-server>
        </v-card-text>
        <v-card-actions class="pa-4"><v-spacer /><v-btn variant="text" @click="modalMiembros.mostrar = false">Cerrar</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: configurar usuario FTP de cliente -->
    <v-dialog v-model="ftpDialog.mostrar" max-width="400" persistent>
      <v-card rounded="xl">
        <v-card-title class="text-h6 font-weight-bold pa-5 pb-2">
          <v-icon start color="primary">mdi-lan-connect</v-icon>
          Usuario FTP — {{ ftpDialog.codCliente }}
        </v-card-title>
        <v-card-text class="pa-5 pt-2">
          <p class="text-body-2 text-medium-emphasis mb-4">{{ ftpDialog.nombreCliente }}</p>
          <v-text-field v-model="ftpDialog.usuario" label="Usuario FTP" variant="outlined" density="compact" class="mb-3" hide-details />
          <v-text-field v-model="ftpDialog.password" label="Contraseña" variant="outlined" density="compact" hide-details
            :type="ftpDialog.mostrarPass ? 'text' : 'password'"
            :append-inner-icon="ftpDialog.mostrarPass ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="ftpDialog.mostrarPass = !ftpDialog.mostrarPass" />
        </v-card-text>
        <v-card-actions class="pa-5 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="ftpDialog.mostrar = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="ftpDialog.guardando" @click="crearFtpUsuario">Crear</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: importación masiva de clientes (3 fases) -->
    <v-dialog v-model="modalImportClientes.mostrar" max-width="640" persistent>
      <v-card rounded="xl">
        <!-- FASE: importando -->
        <template v-if="modalImportClientes.fase === 'importando'">
          <v-card-title class="pa-4">Importando clientes...</v-card-title>
          <v-card-text class="d-flex flex-column align-center pa-8 gap-4">
            <v-progress-circular indeterminate color="teal" size="56" />
            <span class="text-body-2 text-medium-emphasis">Procesando {{ modalImportClientes.totalFilas }} filas, por favor espera</span>
          </v-card-text>
        </template>

        <!-- FASE: resultado -->
        <template v-else-if="modalImportClientes.fase === 'resultado'">
          <v-card-title class="pa-4">Resultado de importación</v-card-title>
          <v-card-text class="pa-4">
            <v-alert type="success" variant="tonal" density="compact" class="mb-4">
              <strong>{{ modalImportClientes.insertados }}</strong> cliente(s) insertado(s) correctamente
            </v-alert>
            <div v-if="modalImportClientes.errores.length">
              <div class="text-subtitle-2 font-weight-bold text-error mb-2">
                <v-icon size="18" color="error">mdi-close-circle</v-icon>
                Errores ({{ modalImportClientes.errores.length }})
              </div>
              <div style="max-height:300px;overflow-y:auto;border:1px solid rgba(0,0,0,.08);border-radius:8px;">
                <v-table density="compact">
                  <thead><tr><th>Fila</th><th>Código grupo</th><th>Cod. cliente</th><th>Motivo</th></tr></thead>
                  <tbody>
                    <tr v-for="e in modalImportClientes.errores" :key="`${e.fila}-${e.codcliente}`">
                      <td class="text-caption">{{ e.fila }}</td>
                      <td class="text-caption">{{ e.codigoGrupo }}</td>
                      <td class="text-caption">{{ e.codcliente }}</td>
                      <td class="text-caption text-error">{{ e.motivo }}</td>
                    </tr>
                  </tbody>
                </v-table>
              </div>
            </div>
          </v-card-text>
          <v-card-actions class="pa-4">
            <v-spacer />
            <v-btn color="primary" variant="elevated" @click="modalImportClientes.mostrar = false">Cerrar</v-btn>
          </v-card-actions>
        </template>

        <!-- FASE: preview -->
        <template v-else>
          <v-card-title class="pa-4">Vista previa — Importar clientes (masivo)</v-card-title>
          <v-card-text class="pa-4">
            <v-alert type="info" variant="tonal" density="compact" class="mb-4">
              <strong>{{ modalImportClientes.totalFilas }}</strong> filas detectadas en el archivo
            </v-alert>

            <div v-if="modalImportClientes.gruposAfectados.length" class="mb-4">
              <div class="text-subtitle-2 font-weight-bold mb-2">
                <v-icon size="18" color="teal">mdi-account-group</v-icon>
                Grupos a actualizar ({{ modalImportClientes.gruposAfectados.length }})
              </div>
              <div style="max-height:220px;overflow-y:auto;border:1px solid rgba(0,0,0,.08);border-radius:8px;">
                <v-list density="compact">
                  <v-list-item v-for="g in modalImportClientes.gruposAfectados" :key="g.codigo">
                    <v-list-item-title>{{ g.nombre }}</v-list-item-title>
                    <v-list-item-subtitle class="text-medium-emphasis">Código: {{ g.codigo }} · {{ g.cantidad }} cliente(s)</v-list-item-subtitle>
                    <template v-slot:append>
                      <v-chip size="x-small" color="teal" variant="tonal">{{ g.cantidad }}</v-chip>
                    </template>
                  </v-list-item>
                </v-list>
              </div>
            </div>

            <div v-if="modalImportClientes.sinGrupo.length">
              <div class="text-subtitle-2 font-weight-bold text-warning mb-2">
                <v-icon size="18" color="warning">mdi-alert-circle</v-icon>
                Filas sin grupo reconocido ({{ modalImportClientes.sinGrupo.length }}) — serán ignoradas
              </div>
              <div style="max-height:120px;overflow-y:auto;border:1px solid rgba(0,0,0,.08);border-radius:8px;">
                <v-list density="compact">
                  <v-list-item v-for="s in modalImportClientes.sinGrupo" :key="s.fila">
                    <v-list-item-title class="text-caption">Fila {{ s.fila }} — código grupo: <strong>{{ s.codigoGrupo }}</strong></v-list-item-title>
                  </v-list-item>
                </v-list>
              </div>
            </div>

            <div v-if="!modalImportClientes.gruposAfectados.length && !modalImportClientes.sinGrupo.length" class="text-grey text-center pa-4">
              No se encontraron datos válidos en el archivo.
            </div>
          </v-card-text>
          <v-card-actions class="pa-4">
            <v-btn variant="text" @click="modalImportClientes.mostrar = false">Cancelar</v-btn>
            <v-spacer />
            <v-btn color="teal" variant="elevated" :disabled="!modalImportClientes.gruposAfectados.length" @click="ejecutarImportarClientesLote">
              Importar {{ modalImportClientes.totalFilas - modalImportClientes.sinGrupo.length }} cliente(s)
            </v-btn>
          </v-card-actions>
        </template>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="aviso.mostrar" :color="aviso.color" timeout="3000">{{ aviso.texto }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { usePageSize } from '../utils/usePageSize';

const API = import.meta.env.VITE_API_URL;
const tab = ref('clientes');
const aviso = ref({ mostrar: false, texto: '', color: 'success' });
const lanzarAviso = (texto: string, color = 'success') => aviso.value = { mostrar: true, texto, color };

// ---------- CLIENTES ----------
const busquedaCliente = ref('');
const filtroRuta = ref<number | null>(null);
const rutas = ref<{ codruta: number; descripcion: string; label: string }[]>([]);
const clientes = ref<any[]>([]);
const totalClientes = ref(0);
const cargandoClientes = ref(false);
const itemsPerPageClientes = usePageSize('clientes');
const paginaClientes = ref(1);
const guardandoId   = ref<number | null>(null);
const guardandoD3Id = ref<number | null>(null);
const headersClientes = [
  { title: 'Cliente', key: 'cliente_concat', sortable: false },
  { title: 'CIF', key: 'CIF' },
  { title: 'Teléfono', key: 'TELF' },
  { title: 'Ruta', key: 'ruta_display', sortable: false },
  { title: 'Descuento D1', key: 'DESCUENTO', sortable: false },
  { title: 'Descuento D3 fijo', key: 'DESCUENTO_D3', sortable: false },
  { title: 'FTP', key: 'ftp', sortable: false },
];

const cargarClientes = async () => {
  cargandoClientes.value = true;
  try {
    const params: any = { search: busquedaCliente.value, page: paginaClientes.value, limit: itemsPerPageClientes.value };
    if (filtroRuta.value !== null) params.ruta = filtroRuta.value;
    const res = await axios.get(`${API}/clientes/paginado`, { params });
    if (res.data.success) { clientes.value = res.data.data; totalClientes.value = res.data.total; }
  } finally { cargandoClientes.value = false; }
};
const cargarPaginaClientes = (opt: any) => { paginaClientes.value = opt.page; itemsPerPageClientes.value = opt.itemsPerPage; cargarClientes(); };

const guardarDescuento = async (item: any) => {
  guardandoId.value = item.CODCLIENTE;
  try {
    await axios.patch(`${API}/clientes/${item.CODCLIENTE}/descuento`, { descuento: Number(item.DESCUENTO) || 0 });
    lanzarAviso('Descuento D1 actualizado');
  } catch { lanzarAviso('Error al actualizar descuento', 'error'); }
  finally { guardandoId.value = null; }
};

const guardarD3 = async (item: any) => {
  guardandoD3Id.value = item.CODCLIENTE;
  try {
    await axios.patch(`${API}/clientes/${item.CODCLIENTE}/d3`, { d3: Number(item.DESCUENTO_D3) || 0 });
    lanzarAviso('Descuento D3 actualizado');
  } catch { lanzarAviso('Error al actualizar D3', 'error'); }
  finally { guardandoD3Id.value = null; }
};

// ---------- FTP USUARIOS ----------
const ftpUsuarios = ref<any[]>([]);
const ftpPorCliente = computed(() => {
  const map: Record<string, any> = {};
  for (const u of ftpUsuarios.value) {
    if (u.COD_CLIENTE) map[u.COD_CLIENTE] = u;
  }
  return map;
});

const cargarFtpUsuarios = async () => {
  try {
    const res = await axios.get(`${API}/ftp/usuarios`);
    if (res.data.success) ftpUsuarios.value = res.data.data;
  } catch {}
};

const ftpDialog = ref({ mostrar: false, codCliente: '', nombreCliente: '', usuario: '', password: '', mostrarPass: false, guardando: false });

const abrirFtpDialog = (item: any) => {
  ftpDialog.value = {
    mostrar: true,
    codCliente: item.CODCLIENTE,
    nombreCliente: item.NOMBRECLIENTE,
    usuario: `c${item.CODCLIENTE}`,
    password: '',
    mostrarPass: false,
    guardando: false,
  };
};

const crearFtpUsuario = async () => {
  if (!ftpDialog.value.usuario || !ftpDialog.value.password) {
    lanzarAviso('Usuario y contraseña son requeridos', 'warning'); return;
  }
  ftpDialog.value.guardando = true;
  try {
    const res = await axios.post(`${API}/ftp/usuarios`, {
      usuario: ftpDialog.value.usuario,
      password: ftpDialog.value.password,
      codCliente: ftpDialog.value.codCliente,
    });
    lanzarAviso(res.data.message ?? 'Usuario FTP creado', 'success');
    ftpDialog.value.mostrar = false;
    await cargarFtpUsuarios();
  } catch (e: any) {
    lanzarAviso(e?.response?.data?.message ?? 'Error al crear usuario FTP', 'error');
  } finally { ftpDialog.value.guardando = false; }
};

const toggleFtpUsuario = async (user: any) => {
  try {
    await axios.patch(`${API}/ftp/usuarios/${user.ID}/toggle`);
    await cargarFtpUsuarios();
  } catch { lanzarAviso('Error al cambiar estado FTP', 'error'); }
};

const eliminarFtpUsuario = async (user: any) => {
  try {
    await axios.delete(`${API}/ftp/usuarios/${user.ID}`);
    lanzarAviso('Usuario FTP eliminado');
    await cargarFtpUsuarios();
  } catch { lanzarAviso('Error al eliminar usuario FTP', 'error'); }
};

// ---------- GRUPOS DE CLIENTES ----------
const busquedaGrupo = ref('');
const grupos = ref<any[]>([]);
const totalGrupos = ref(0);
const cargandoGrupos = ref(false);
const itemsPerPageGrupos = usePageSize('clientes-grupos');
const paginaGrupos = ref(1);
const headersGrupos = [
  { title: 'Código', key: 'CODIGO', sortable: false },
  { title: 'Nombre', key: 'NOMBRE' },
  { title: 'Tipo', key: 'TIPO', sortable: false },
  { title: 'Clientes', key: 'TOTALCLIENTES' },
  { title: '', key: 'acciones', sortable: false },
];
const camposClientes = ref<any[]>([]);
const cargarCamposDisponibles = async () => {
  const res = await axios.get(`${API}/promociones/campos-disponibles`);
  if (res.data.success) camposClientes.value = res.data.data.clientes;
};
const operadoresPara = (codigoCampo: string) => {
  const def = camposClientes.value.find((c: any) => c.codigo === codigoCampo);
  if (!def) return ['=', '<>', 'CONTIENE'];
  return def.tipo === 'numero' ? ['=', '<>', '>', '<', '>=', '<='] : ['=', '<>', 'CONTIENE'];
};

const modalGrupo = ref<any>({ mostrar: false, id: null, nombre: '', tipo: 'MANUAL', condiciones: [] });
const guardandoGrupo = ref(false);

const abrirNuevoGrupo = () => {
  modalGrupo.value = { mostrar: true, id: null, nombre: '', tipo: 'MANUAL', condiciones: [] };
};
const abrirEditarGrupo = async (item: any) => {
  modalGrupo.value = { mostrar: true, id: item.ID, nombre: item.NOMBRE, tipo: item.TIPO || 'MANUAL', condiciones: [] };
  if (item.TIPO === 'CONDICION') {
    const res = await axios.get(`${API}/promociones/grupos-clientes/${item.ID}/condiciones`);
    if (res.data.success) modalGrupo.value.condiciones = res.data.data.map((c: any) => ({ campo: c.campo, operador: c.operador, valor: c.valor }));
  }
};
const guardarGrupo = async () => {
  if (!modalGrupo.value.nombre) { lanzarAviso('Ingresa un nombre', 'warning'); return; }
  guardandoGrupo.value = true;
  try {
    const payload = { nombre: modalGrupo.value.nombre, tipo: modalGrupo.value.tipo, condiciones: modalGrupo.value.condiciones };
    if (modalGrupo.value.id) await axios.put(`${API}/promociones/grupos-clientes/${modalGrupo.value.id}`, { ...payload, activo: true });
    else await axios.post(`${API}/promociones/grupos-clientes`, payload);
    lanzarAviso('Grupo guardado');
    modalGrupo.value.mostrar = false;
    cargarGrupos();
  } catch (e: any) { lanzarAviso(e.response?.data?.message || 'Error al guardar grupo', 'error'); }
  finally { guardandoGrupo.value = false; }
};

const cargarGrupos = async () => {
  cargandoGrupos.value = true;
  try {
    const res = await axios.get(`${API}/promociones/grupos-clientes`, { params: { search: busquedaGrupo.value, page: paginaGrupos.value, limit: itemsPerPageGrupos.value } });
    if (res.data.success) { grupos.value = res.data.data; totalGrupos.value = res.data.total; }
  } finally { cargandoGrupos.value = false; }
};
const cargarPaginaGrupos = (opt: any) => { paginaGrupos.value = opt.page; itemsPerPageGrupos.value = opt.itemsPerPage; cargarGrupos(); };

const importandoGruposExcel = ref(false);
type GrupoItem = { codigo: string; nombre: string };
const modalImportGrupos = ref<{
  mostrar: boolean;
  fase: 'preview' | 'creando' | 'resultado';
  aProcesar: GrupoItem[];
  seleccionados: GrupoItem[];
  omitidos: (GrupoItem & { motivo: string })[];
  creados: string[];
  errores: (GrupoItem & { motivo: string })[];
}>({ mostrar: false, fase: 'preview', aProcesar: [], seleccionados: [], omitidos: [], creados: [], errores: [] });

const importarGruposExcel = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  importandoGruposExcel.value = true;
  try {
    const fd = new FormData();
    fd.append('archivo', file);
    const res = await axios.post(`${API}/promociones/grupos-clientes/previsualizar-grupos-excel`, fd);
    const d = res.data;
    modalImportGrupos.value = {
      mostrar: true, fase: 'preview',
      aProcesar: d.aProcesar ?? [],
      seleccionados: [...(d.aProcesar ?? [])],
      omitidos: d.omitidos ?? [],
      creados: [], errores: [],
    };
  } catch (e: any) { lanzarAviso(e?.response?.data?.message ?? 'Error al leer archivo', 'error'); }
  finally { importandoGruposExcel.value = false; (e.target as HTMLInputElement).value = ''; }
};

const ejecutarCrearLote = async () => {
  modalImportGrupos.value.fase = 'creando';
  try {
    const res = await axios.post(`${API}/promociones/grupos-clientes/crear-lote`, {
      grupos: modalImportGrupos.value.seleccionados,
    });
    modalImportGrupos.value.creados = (res.data.creados ?? []).map((g: any) => g.nombre ?? g);
    modalImportGrupos.value.errores = res.data.errores ?? [];
    modalImportGrupos.value.fase = 'resultado';
    if (res.data.creados?.length) cargarGrupos();
  } catch (e: any) {
    lanzarAviso(e?.response?.data?.message ?? 'Error al crear grupos', 'error');
    modalImportGrupos.value.fase = 'preview';
  }
};

const importandoClientesLote = ref(false);
type ErrCliente = { fila: number; codigoGrupo: string; codcliente: string; motivo: string };
const modalImportClientes = ref<{
  mostrar: boolean;
  fase: 'preview' | 'importando' | 'resultado';
  totalFilas: number;
  gruposAfectados: { codigo: string; nombre: string; cantidad: number }[];
  sinGrupo: { fila: number; codigoGrupo: string }[];
  insertados: number;
  errores: ErrCliente[];
  archivoBuffer: File | null;
}>({ mostrar: false, fase: 'preview', totalFilas: 0, gruposAfectados: [], sinGrupo: [], insertados: 0, errores: [], archivoBuffer: null });

const importarClientesLoteExcel = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!file) return;
  importandoClientesLote.value = true;
  try {
    const fd = new FormData();
    fd.append('archivo', file);
    const res = await axios.post(`${API}/promociones/grupos-clientes/previsualizar-clientes-lote`, fd);
    const d = res.data;
    modalImportClientes.value = {
      mostrar: true, fase: 'preview',
      totalFilas: d.totalFilas ?? 0,
      gruposAfectados: d.gruposAfectados ?? [],
      sinGrupo: d.sinGrupo ?? [],
      insertados: 0, errores: [], archivoBuffer: file,
    };
  } catch (e: any) { lanzarAviso(e?.response?.data?.message ?? 'Error al leer archivo', 'error'); }
  finally { importandoClientesLote.value = false; }
};

const ejecutarImportarClientesLote = async () => {
  const file = modalImportClientes.value.archivoBuffer;
  if (!file) return;
  modalImportClientes.value.fase = 'importando';
  try {
    const fd = new FormData();
    fd.append('archivo', file);
    const res = await axios.post(`${API}/promociones/grupos-clientes/importar-clientes-lote`, fd);
    modalImportClientes.value.insertados = res.data.insertados ?? 0;
    modalImportClientes.value.errores = res.data.errores ?? [];
    modalImportClientes.value.fase = 'resultado';
  } catch (e: any) {
    lanzarAviso(e?.response?.data?.message ?? 'Error al importar', 'error');
    modalImportClientes.value.fase = 'preview';
  }
};

const gruposSeleccionados = ref<number[]>([]);
const confirmarEliminar = ref<any>({ mostrar: false, ids: [], nombre: '' });
const eliminandoGrupo = ref(false);

const confirmarEliminarGrupo = (item: any) => {
  confirmarEliminar.value = { mostrar: true, ids: [item.ID], nombre: item.NOMBRE };
};
const confirmarEliminarSeleccion = () => {
  confirmarEliminar.value = { mostrar: true, ids: [...gruposSeleccionados.value], nombre: '' };
};
const eliminarGrupo = async () => {
  eliminandoGrupo.value = true;
  try {
    await Promise.all(confirmarEliminar.value.ids.map((id: number) =>
      axios.delete(`${API}/promociones/grupos-clientes/${id}`)
    ));
    lanzarAviso(confirmarEliminar.value.ids.length > 1 ? `${confirmarEliminar.value.ids.length} grupos eliminados` : 'Grupo eliminado');
    confirmarEliminar.value.mostrar = false;
    gruposSeleccionados.value = [];
    cargarGrupos();
  } catch (e: any) { lanzarAviso(e?.response?.data?.message ?? 'Error al eliminar', 'error'); }
  finally { eliminandoGrupo.value = false; }
};

// ---------- MIEMBROS DEL GRUPO ----------
const modalMiembros = ref<any>({ mostrar: false, grupo: null });
const miembros = ref<any[]>([]);
const totalMiembros = ref(0);
const cargandoMiembros = ref(false);
const itemsPerPageMiembros = usePageSize('clientes-miembros');
const importandoExcel   = ref(false);
const resultadoImport   = ref('');
const noEncontradosList = ref<string[]>([]);

const importarExcel = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file || !modalMiembros.value.grupo) return;
  importandoExcel.value = true;
  resultadoImport.value = '';
  noEncontradosList.value = [];
  try {
    const fd = new FormData();
    fd.append('archivo', file);
    const res = await axios.post(`${API}/promociones/grupos-clientes/${modalMiembros.value.grupo.ID}/importar-excel`, fd);
    const d = res.data;
    resultadoImport.value = `✓ ${d.insertados} nuevos` + (d.noEncontrados.length ? ` · ${d.noEncontrados.length} no encontrados` : '') + (d.yaEnGrupo.length ? ` · ${d.yaEnGrupo.length} ya estaban` : '');
    noEncontradosList.value = d.noEncontrados ?? [];
    cargarPaginaMiembros({ page: 1, itemsPerPage: itemsPerPageMiembros.value });
  } catch (err: any) {
    lanzarAviso(err.response?.data?.message || 'Error al importar', 'error');
  } finally {
    importandoExcel.value = false;
    (e.target as HTMLInputElement).value = '';
  }
};
const paginaMiembros = ref(1);
const headersMiembros = [
  { title: 'Cliente', key: 'cliente_concat', sortable: false },
  { title: 'CIF', key: 'CIF' },
  { title: '', key: 'acciones', sortable: false },
];
const headersMiembrosCondicion = [
  { title: 'Cliente', key: 'cliente_concat', sortable: false },
  { title: 'CIF', key: 'CIF' },
];
const busquedaClienteAgregar = ref('');
const resultadosCliente = ref<any[]>([]);

const abrirMiembros = (grupo: any) => {
  modalMiembros.value = { mostrar: true, grupo };
  paginaMiembros.value = 1;
  resultadosCliente.value = [];
  busquedaClienteAgregar.value = '';
  resultadoImport.value = '';
  cargarMiembros();
};
const cargarMiembros = async () => {
  if (!modalMiembros.value.grupo) return;
  cargandoMiembros.value = true;
  try {
    const res = await axios.get(`${API}/promociones/grupos-clientes/${modalMiembros.value.grupo.ID}/clientes`, { params: { page: paginaMiembros.value, limit: itemsPerPageMiembros.value } });
    if (res.data.success) { miembros.value = res.data.data; totalMiembros.value = res.data.total; }
  } finally { cargandoMiembros.value = false; }
};
const cargarPaginaMiembros = (opt: any) => { paginaMiembros.value = opt.page; itemsPerPageMiembros.value = opt.itemsPerPage; cargarMiembros(); };

const buscarClientesParaAgregar = async () => {
  if (!busquedaClienteAgregar.value) { resultadosCliente.value = []; return; }
  const res = await axios.get(`${API}/clientes`, { params: { cif: busquedaClienteAgregar.value } });
  if (res.data.success) resultadosCliente.value = res.data.clientes;
};

const agregarMiembro = async (codCliente: number) => {
  try {
    await axios.post(`${API}/promociones/grupos-clientes/${modalMiembros.value.grupo.ID}/clientes`, { codCliente });
    lanzarAviso('Cliente agregado');
    cargarMiembros();
    cargarGrupos();
  } catch { lanzarAviso('Error al agregar cliente', 'error'); }
};
const quitarMiembro = async (codCliente: number) => {
  try {
    await axios.delete(`${API}/promociones/grupos-clientes/${modalMiembros.value.grupo.ID}/clientes/${codCliente}`);
    lanzarAviso('Cliente quitado');
    cargarMiembros();
    cargarGrupos();
  } catch { lanzarAviso('Error al quitar cliente', 'error'); }
};

const cargarRutas = async () => {
  try {
    const res = await axios.get(`${API}/facturas/rutas`);
    if (res.data.success) {
      rutas.value = res.data.data.map((r: any) => ({ ...r, label: `${r.codruta} - ${r.descripcion}` }));
    }
  } catch {}
};

onMounted(() => {
  cargarCamposDisponibles();
  cargarFtpUsuarios();
  cargarRutas();
});
</script>
