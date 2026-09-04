<template>
  <v-container fluid class="pa-6 bg-background">

    <div class="d-flex align-center mb-5">
      <v-icon color="primary" size="32" class="mr-3">mdi-server-network</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black" style="color:#164E63;">Servidor FTP</h1>
        <span class="text-caption text-medium-emphasis">Administración del servidor FTP, ICompras y Farcompras</span>
      </div>
    </div>

    <v-tabs v-model="tabActiva" color="primary" class="mb-5">
      <v-tab value="ftp">
        <v-icon start>mdi-server-network</v-icon>FTP
      </v-tab>
      <v-tab value="icompras">
        <v-icon start>mdi-download-circle-outline</v-icon>ICOMPRAS
      </v-tab>
      <v-tab value="farcompras">
        <v-icon start>mdi-truck-delivery-outline</v-icon>FARCOMPRAS
      </v-tab>
      <v-tab value="seped">
        <v-icon start>mdi-robot-outline</v-icon>SEPED
      </v-tab>
    </v-tabs>

    <!-- ══════════════════════ TAB FTP ══════════════════════ -->
    <div v-show="tabActiva === 'ftp'">

      <!-- Estado + control -->
      <v-card v-if="authStore.esAdmin" rounded="xl" elevation="2" class="pa-6 mb-4">
        <div class="d-flex align-center mb-4">
          <div class="text-subtitle-1 font-weight-bold">
            <v-icon start color="primary">mdi-server-network</v-icon>
            Estado del servidor
          </div>
          <v-spacer />
          <v-chip :color="servidorActivo ? 'success' : 'default'" variant="flat" class="mr-3">
            <v-icon start>{{ servidorActivo ? 'mdi-check-circle' : 'mdi-circle-off-outline' }}</v-icon>
            {{ servidorActivo ? 'Activo' : 'Inactivo' }}
          </v-chip>
          <v-btn v-if="!servidorActivo" color="success" variant="tonal" prepend-icon="mdi-play" :loading="accionServidor" @click="iniciarServidor">
            Iniciar
          </v-btn>
          <v-btn v-else color="error" variant="tonal" prepend-icon="mdi-stop" :loading="accionServidor" @click="detenerServidor">
            Detener
          </v-btn>
        </div>

        <div class="d-flex align-center mb-4 gap-3">
          <v-switch
            v-model="cfgServidor.ftpHabilitado"
            label="Iniciar automáticamente al reiniciar el servidor"
            color="primary"
            hide-details
            density="compact"
          />
        </div>

        <v-alert v-if="servidorActivo" type="info" variant="tonal" density="compact" class="mb-0">
          Puerto FTP activo: <strong>{{ cfgServidor.puerto }}</strong>.
          Los clientes deben conectarse a la IP del servidor en ese puerto.
          Puertos pasivos: <strong>{{ cfgServidor.pasivoMin }}–{{ cfgServidor.pasivoMax }}</strong>.
        </v-alert>
      </v-card>

      <!-- Configuración de red -->
      <v-card v-if="authStore.esAdmin" rounded="xl" elevation="2" class="pa-6 mb-4">
        <div class="text-subtitle-1 font-weight-bold mb-4">
          <v-icon start color="primary">mdi-cog-outline</v-icon>
          Configuración de red
        </div>
        <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
          Después de cambiar la configuración, <strong>detén y vuelve a iniciar</strong> el servidor para aplicar los cambios.
          Puertos menores a 1024 pueden requerir permisos de administrador en el sistema operativo.
        </v-alert>
        <v-row>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model.number="cfgServidor.puerto"
              label="Puerto FTP"
              type="number"
              variant="outlined"
              density="compact"
              hint="Default: 21 (requiere admin en Linux/Windows)"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model.number="cfgServidor.pasivoMin"
              label="Puerto pasivo mínimo"
              type="number"
              variant="outlined"
              density="compact"
              hint="Rango para modo pasivo (PASV)"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model.number="cfgServidor.pasivoMax"
              label="Puerto pasivo máximo"
              type="number"
              variant="outlined"
              density="compact"
              hint="Abre estos puertos en el firewall/router"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="8">
            <v-text-field
              v-model="cfgServidor.ipExterna"
              label="IP externa (NAT)"
              variant="outlined"
              density="compact"
              placeholder="Ej: 201.248.10.50"
              hint="IP pública o dominio del servidor. Vacío = auto-detect (solo red local)"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="4" class="d-flex align-center">
            <v-btn color="primary" :loading="guardandoCfgSrv" @click="guardarCfgServidor" block>
              Guardar configuración
            </v-btn>
          </v-col>
        </v-row>
      </v-card>

      <!-- IP para datos de conexión de clientes -->
      <v-card rounded="xl" elevation="2" class="pa-6 mb-4">
        <div class="text-subtitle-1 font-weight-bold mb-3">
          <v-icon start color="primary">mdi-ip-network</v-icon>
          Dirección para datos de conexión
        </div>
        <v-row align="center">
          <v-col cols="12" sm="8">
            <v-text-field
              v-model="ipConexionClientes"
              label="IP o dominio que ven los clientes"
              variant="outlined"
              density="compact"
              placeholder="Ej: 186.167.68.54:58080"
              hint="Se usa solo al generar el archivo de datos de conexión. No afecta al servidor FTP."
              persistent-hint
              hide-details="auto"
            />
          </v-col>
          <v-col cols="12" sm="4" class="d-flex align-center gap-2">
            <v-btn color="primary" variant="tonal" prepend-icon="mdi-content-save-outline" @click="guardarIpConexion" block>
              Guardar dirección
            </v-btn>
          </v-col>
        </v-row>
      </v-card>

      <!-- Gestión de usuarios -->
      <v-card v-if="authStore.esAdmin || authStore.puedeGestionarFtpUsuarios" rounded="xl" elevation="2" class="pa-6">
        <div class="d-flex align-center mb-4">
          <div class="text-subtitle-1 font-weight-bold">
            <v-icon start color="primary">mdi-account-multiple</v-icon>
            Usuarios FTP
          </div>
          <v-spacer />
          <v-btn variant="tonal" color="teal-darken-1" prepend-icon="mdi-file-excel-outline" class="mr-2" @click="descargarPlantilla">
            Plantilla
          </v-btn>
          <v-btn variant="tonal" color="green-darken-2" prepend-icon="mdi-file-import-outline" class="mr-2"
            :loading="importandoExcel" @click="seleccionarExcel">
            Importar Excel
          </v-btn>
          <v-btn variant="tonal" color="orange-darken-2" prepend-icon="mdi-key-change" class="mr-2"
            :loading="sincronizandoClaves" @click="seleccionarExcelClaves">
            Sincronizar claves
          </v-btn>
          <input ref="inputImportRef"      type="file" accept=".xlsx,.xls" style="display:none" @change="importarExcel" />
          <input ref="inputClavesRef"      type="file" accept=".xlsx,.xls" style="display:none" @change="sincronizarClaves" />
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-account-plus" @click="abrirDialogNuevoUsuario">
            Nuevo usuario
          </v-btn>
        </div>

        <v-text-field
          v-model="buscarUsuario"
          placeholder="Buscar por usuario, código o nombre de cliente..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          class="mb-3"
        />

        <v-data-table
          :headers="headersUsuarios"
          :items="usuariosFiltrados"
          :loading="cargandoUsuarios"
          hover
          class="bg-white"
          no-data-text="No hay usuarios FTP configurados"
        >
          <template v-slot:item.ACTIVO="{ item }">
            <v-chip :color="item.ACTIVO === 'T' ? 'success' : 'default'" size="small" variant="flat">
              {{ item.ACTIVO === 'T' ? 'Activo' : 'Inactivo' }}
            </v-chip>
          </template>
          <template v-slot:item.FECHA_CREACION="{ item }">
            {{ item.FECHA_CREACION ? new Date(item.FECHA_CREACION).toLocaleDateString('es-VE', { timeZone: brandingStore.zonaHoraria }) : '—' }}
          </template>
          <template v-slot:item.acciones="{ item }">
            <v-btn icon size="small" variant="text" color="teal-darken-1" title="Datos de conexión" @click="abrirDatosConexion(item)">
              <v-icon>mdi-lan-connect</v-icon>
            </v-btn>
            <v-btn icon size="small" variant="text" :color="item.ACTIVO === 'T' ? 'warning' : 'success'"
              :title="item.ACTIVO === 'T' ? 'Desactivar' : 'Activar'"
              @click="toggleUsuario(item)">
              <v-icon>{{ item.ACTIVO === 'T' ? 'mdi-account-off' : 'mdi-account-check' }}</v-icon>
            </v-btn>
            <v-btn icon size="small" variant="text" color="info" title="Cambiar contraseña" @click="abrirDialogPassword(item)">
              <v-icon>mdi-key</v-icon>
            </v-btn>
            <v-btn icon size="small" variant="text" color="error" title="Eliminar" @click="confirmarEliminar(item)">
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </template>
        </v-data-table>
      </v-card>

      <!-- Formatos de archivos generados -->
      <v-card rounded="xl" elevation="2" class="pa-6 mt-4">
        <div class="text-subtitle-1 font-weight-bold mb-4">
          <v-icon start color="secondary">mdi-information-outline</v-icon>
          Formato de archivos generados
        </div>

        <div class="d-flex align-center mb-2">
          <div class="text-subtitle-2 font-weight-medium">
            <v-icon start size="18" color="primary">mdi-upload-outline</v-icon>
            Pedidos — archivo que envía el cliente
          </div>
          <v-spacer />
          <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-content-copy" @click="() => copiarFormato(formatoPedidos)">Copiar</v-btn>
        </div>
        <v-card variant="outlined" class="pa-4 text-body-2 mb-5" style="font-family: monospace; white-space: pre-line;">{{ formatoPedidos }}</v-card>

        <v-divider class="mb-5" />

        <div class="d-flex align-center mb-2">
          <div class="text-subtitle-2 font-weight-medium">
            <v-icon start size="18" color="teal-darken-1">mdi-file-document-outline</v-icon>
            inventario.txt — generado por cliente al conectarse
          </div>
          <v-spacer />
          <v-btn size="small" variant="tonal" color="teal-darken-1" prepend-icon="mdi-content-copy" @click="() => copiarFormato(formatoInventario)">Copiar</v-btn>
        </div>
        <v-card variant="outlined" class="pa-4 text-body-2 mb-5" style="font-family: monospace; white-space: pre-line;">{{ formatoInventario }}</v-card>

        <v-divider class="mb-5" />

        <div class="d-flex align-center mb-2">
          <div class="text-subtitle-2 font-weight-medium">
            <v-icon start size="18" color="orange-darken-2">mdi-receipt-text-outline</v-icon>
            Facturas — generadas por cliente al conectarse
          </div>
          <v-spacer />
          <v-btn size="small" variant="tonal" color="orange-darken-2" prepend-icon="mdi-content-copy" @click="() => copiarFormato(formatoFacturas)">Copiar</v-btn>
        </div>
        <v-card variant="outlined" class="pa-4 text-body-2" style="font-family: monospace; white-space: pre-line;">{{ formatoFacturas }}</v-card>
      </v-card>

    </div><!-- /tab ftp -->

    <!-- ══════════════════════ TAB ICOMPRAS ══════════════════════ -->
    <div v-show="tabActiva === 'icompras'">

      <!-- Configuración -->
      <v-card v-if="authStore.esAdmin" rounded="xl" elevation="2" class="pa-6 mb-4">
        <div class="text-subtitle-1 font-weight-bold mb-4">
          <v-icon start color="primary">mdi-cog-outline</v-icon>
          Configuración ICompras
        </div>
        <v-row>
          <v-col cols="12" sm="8">
            <v-text-field
              v-model="icCfg.urlBase"
              label="URL base del servidor remoto"
              variant="outlined"
              density="compact"
              placeholder="http://192.168.1.10:8080"
              hint="Sin barra al final. Ej: http://10.0.0.5:8080"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model="icCfg.codisb"
              label="CODISB"
              variant="outlined"
              density="compact"
              placeholder="501590192"
              hint="Código de sucursal"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="icCfg.rutaPedidos"
              label="Carpeta local de pedidos"
              variant="outlined"
              density="compact"
              placeholder="C:\PEDIDOS"
              hint="Ruta donde se guardarán los archivos .txt descargados"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="3">
            <v-text-field
              v-model.number="icCfg.intervaloSeg"
              label="Intervalo (segundos)"
              type="number"
              variant="outlined"
              density="compact"
              :min="1"
              hint="Frecuencia del ciclo automático"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="3" class="d-flex align-center">
            <v-switch
              v-model="icCfg.habilitado"
              label="Activar ciclo automático"
              color="primary"
              hide-details
              density="compact"
            />
          </v-col>
          <v-col cols="12" class="d-flex justify-end pt-0">
            <v-btn color="primary" :loading="guardandoIcCfg" prepend-icon="mdi-content-save-outline" @click="guardarIcCfg">
              Guardar configuración
            </v-btn>
          </v-col>
        </v-row>
      </v-card>

      <!-- Estado del scheduler + acciones -->
      <v-card rounded="xl" elevation="2" class="pa-6 mb-4">
        <div class="d-flex align-center mb-4">
          <div class="text-subtitle-1 font-weight-bold">
            <v-icon start color="primary">mdi-timer-outline</v-icon>
            Ciclo automático
          </div>
          <v-spacer />
          <v-chip :color="icSchedulerActivo ? 'success' : 'default'" variant="flat" class="mr-3">
            <v-icon start>{{ icSchedulerActivo ? 'mdi-check-circle' : 'mdi-circle-off-outline' }}</v-icon>
            {{ icSchedulerActivo ? 'En ejecución' : 'Detenido' }}
          </v-chip>
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-play-circle-outline"
            :loading="ejecutandoCiclo" @click="ejecutarCicloManual">
            Ejecutar ahora
          </v-btn>
        </div>
        <v-alert v-if="ultimoCicloResultado" :type="ultimoCicloResultado.errores > 0 ? 'warning' : 'success'"
          variant="tonal" density="compact" class="mb-0">
          Último ciclo: <strong>{{ ultimoCicloResultado.descargados }}</strong> descargados,
          <strong>{{ ultimoCicloResultado.errores }}</strong> errores
        </v-alert>
      </v-card>

      <!-- Reprocesar pedido -->
      <v-card rounded="xl" elevation="2" class="pa-6 mb-4">
        <div class="text-subtitle-1 font-weight-bold mb-4">
          <v-icon start color="orange-darken-2">mdi-refresh-circle</v-icon>
          Reprocesar pedido por ID
        </div>
        <v-row align="center">
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="icReprocesarId"
              label="ID del pedido remoto"
              variant="outlined"
              density="compact"
              hide-details
              placeholder="Ej: 12345"
              @keyup.enter="reprocesarPedido"
            />
          </v-col>
          <v-col cols="12" sm="3">
            <v-btn color="orange-darken-2" variant="tonal" :loading="reprocesando"
              prepend-icon="mdi-refresh" @click="reprocesarPedido" block>
              Reprocesar
            </v-btn>
          </v-col>
        </v-row>
      </v-card>

      <!-- Auditoría -->
      <v-card rounded="xl" elevation="2" class="pa-6">
        <div class="d-flex align-center mb-4">
          <div class="text-subtitle-1 font-weight-bold">
            <v-icon start color="primary">mdi-clipboard-list-outline</v-icon>
            Auditoría de pedidos
          </div>
          <v-spacer />
          <v-btn variant="tonal" prepend-icon="mdi-refresh" size="small" :loading="cargandoAudit" @click="cargarAuditoria">
            Actualizar
          </v-btn>
        </div>
        <v-data-table
          :headers="headersAudit"
          :items="auditoria"
          :loading="cargandoAudit"
          hover
          density="compact"
          class="bg-white"
          no-data-text="Sin registros"
          :items-per-page="20"
        >
          <template v-slot:item.ESTADO="{ item }">
            <v-chip :color="colorEstado(item.ESTADO)" size="x-small" variant="flat">
              {{ item.ESTADO }}
            </v-chip>
          </template>
          <template v-slot:item.FECHA_DESCARGA="{ item }">
            {{ item.FECHA_DESCARGA ? new Date(item.FECHA_DESCARGA).toLocaleString('es-VE', { timeZone: brandingStore.zonaHoraria }) : '—' }}
          </template>
          <template v-slot:item.ARCHIVO_PATH="{ item }">
            <span class="text-caption text-truncate" style="max-width:200px;display:inline-block;" :title="item.ARCHIVO_PATH">
              {{ item.ARCHIVO_PATH || '—' }}
            </span>
          </template>
          <template v-slot:item.ERROR_MSG="{ item }">
            <span v-if="item.ERROR_MSG" class="text-caption text-error" :title="item.ERROR_MSG">
              {{ item.ERROR_MSG.slice(0, 60) }}{{ item.ERROR_MSG.length > 60 ? '…' : '' }}
            </span>
            <span v-else class="text-caption text-medium-emphasis">—</span>
          </template>
        </v-data-table>
      </v-card>

    </div><!-- /tab icompras -->

    <!-- ══════════════════════ TAB FARCOMPRAS ══════════════════════ -->
    <div v-show="tabActiva === 'farcompras'">

      <!-- Configuración -->
      <v-card v-if="authStore.esAdmin" rounded="xl" elevation="2" class="pa-6 mb-4">
        <div class="text-subtitle-1 font-weight-bold mb-4">
          <v-icon start color="deep-orange">mdi-cog-outline</v-icon>
          Configuración Farcompras
        </div>
        <v-row>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="fcCfg.rutaBase"
              label="Carpeta base Farcompras"
              variant="outlined"
              density="compact"
              placeholder="C:\FTP\farcompras"
              hint="Carpeta raíz del usuario FTP de Farcompras. Debe contener 'pedidos/' como subcarpeta."
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="3">
            <v-text-field
              v-model="fcCfg.usuarioFtp"
              label="Usuario FTP"
              variant="outlined"
              density="compact"
              placeholder="farcompras"
              hint="Nombre del usuario FTP creado en la pestaña FTP"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="3">
            <v-text-field
              v-model.number="fcCfg.intervaloSeg"
              label="Intervalo (segundos)"
              type="number"
              variant="outlined"
              density="compact"
              :min="30"
              hint="Frecuencia del ciclo automático"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="3" class="d-flex align-center">
            <v-switch
              v-model="fcCfg.habilitado"
              label="Activar ciclo automático"
              color="deep-orange"
              hide-details
              density="compact"
            />
          </v-col>
          <v-col cols="12" class="d-flex justify-end pt-0">
            <v-btn color="deep-orange" :loading="guardandoFcCfg" prepend-icon="mdi-content-save-outline" @click="guardarFcCfg">
              Guardar configuración
            </v-btn>
          </v-col>
        </v-row>
      </v-card>

      <!-- Documentación de archivos -->
      <v-card rounded="xl" elevation="2" class="pa-6 mb-4">
        <div class="d-flex align-center mb-4">
          <div class="text-subtitle-1 font-weight-bold">
            <v-icon start color="deep-orange">mdi-file-document-multiple-outline</v-icon>
            Documentación de archivos
          </div>
          <v-spacer />
          <v-btn variant="tonal" color="deep-orange" size="small" prepend-icon="mdi-file-pdf-box" @click="descargarDocumentacionFarcompras">
            Descargar PDF
          </v-btn>
        </div>

        <v-row>
          <!-- inventario.txt -->
          <v-col cols="12" lg="4">
            <div class="d-flex align-center mb-2">
              <v-icon color="teal" size="18" class="mr-2">mdi-package-variant</v-icon>
              <span class="text-subtitle-2 font-weight-bold">inventario.txt</span>
              <v-chip size="x-small" color="teal" variant="tonal" class="ml-2">Saliente</v-chip>
            </div>
            <div class="text-caption text-medium-emphasis mb-3">
              Generado automáticamente en cada ciclo y al conectar por FTP. Separado por punto y coma, codificación latin1.
            </div>
            <div class="text-caption font-weight-medium mb-1">Formato (una línea por artículo):</div>
            <v-table density="compact" class="mb-3" style="font-size:11px">
              <thead><tr>
                <th>Campo</th><th>Descripción</th>
              </tr></thead>
              <tbody>
                <tr><td><code>codarticulo</code></td><td>Código interno (5 dígitos, rellenado con ceros)</td></tr>
                <tr><td><code>refproveedor</code></td><td>Referencia del proveedor</td></tr>
                <tr><td><code>descripcion</code></td><td>Nombre del artículo (máx. 45 caracteres)</td></tr>
                <tr><td><code>vence</code></td><td>Fecha de vencimiento más próxima (DD/MM/AAAA) o vacío</td></tr>
                <tr><td><code>precio</code></td><td>Precio base de venta</td></tr>
                <tr><td><code>descuentos</code></td><td>D1+D2+D3+D4. Si hay D2 activo: <code>0+10+0+0</code>. Sin descuento: vacío</td></tr>
                <tr><td><code>precio</code></td><td>Precio base (igual al anterior — sin aplicar descuento)</td></tr>
                <tr><td><code>stock</code></td><td>Unidades disponibles en almacén</td></tr>
                <tr><td><code>marca</code></td><td>Nombre de la marca (máx. 30 caracteres)</td></tr>
              </tbody>
            </v-table>
            <div class="text-caption font-weight-medium mb-1">Ejemplo:</div>
            <pre class="text-caption pa-2 rounded" style="font-size:10px;line-height:1.6;background:rgba(0,0,0,.04);overflow-x:auto">00001;LAB001;AMOXICILINA 500MG;31/12/2025;8.50;;8.50;120;GENFAR
00002;LAB002;IBUPROFENO 400MG;;5.20;0+10+0+0;5.20;85;BAYER
00003;;PARACETAMOL 500MG;;;;4.10;;3.69;200;</pre>
          </v-col>

          <!-- clientes.txt -->
          <v-col cols="12" lg="4">
            <div class="d-flex align-center mb-2">
              <v-icon color="teal" size="18" class="mr-2">mdi-account-group-outline</v-icon>
              <span class="text-subtitle-2 font-weight-bold">clientes.txt</span>
              <v-chip size="x-small" color="teal" variant="tonal" class="ml-2">Saliente</v-chip>
            </div>
            <div class="text-caption text-medium-emphasis mb-3">
              Generado junto al inventario. Lista todos los clientes registrados en el sistema con su RIF y descuento D1. Codificación latin1.
            </div>
            <div class="text-caption font-weight-medium mb-1">Formato (una línea por cliente):</div>
            <v-table density="compact" class="mb-3" style="font-size:11px">
              <thead><tr>
                <th>Campo</th><th>Descripción</th>
              </tr></thead>
              <tbody>
                <tr><td><code>codcliente</code></td><td>Código interno del cliente en el ERP</td></tr>
                <tr><td><code>nif20</code></td><td>RIF / cédula fiscal del cliente</td></tr>
                <tr><td><code>nombrecliente</code></td><td>Razón social o nombre del cliente</td></tr>
                <tr><td><code>d1</code></td><td>Descuento D1 asignado (porcentaje, 2 decimales). 0.00 si no tiene</td></tr>
              </tbody>
            </v-table>
            <div class="text-caption font-weight-medium mb-1">Ejemplo:</div>
            <pre class="text-caption pa-2 rounded" style="font-size:10px;line-height:1.6;background:rgba(0,0,0,.04);overflow-x:auto">1001;J-12345678-9;FARMACIA LA SALUD;5.00
1002;V-87654321-0;CLINICA SANTA MARIA;0.00
1003;J-98765432-1;DROGUERIA EL CENTRO;3.50</pre>
          </v-col>

          <!-- pedidos/*.txt -->
          <v-col cols="12" lg="4">
            <div class="d-flex align-center mb-2">
              <v-icon color="deep-orange" size="18" class="mr-2">mdi-cart-arrow-down</v-icon>
              <span class="text-subtitle-2 font-weight-bold">pedidos/*.txt</span>
              <v-chip size="x-small" color="deep-orange" variant="tonal" class="ml-2">Entrante</v-chip>
            </div>
            <div class="text-caption text-medium-emphasis mb-3">
              Farcompras deposita un archivo <code>.txt</code> por pedido dentro de <strong>carpeta_base/pedidos/</strong>.
              Al procesarse correctamente se renombra a <code>.bak</code>. Si el RIF no existe en el sistema el archivo queda intacto y se registra el error en auditoría.
            </div>
            <div class="text-caption font-weight-medium mb-1">Formato:</div>
            <v-table density="compact" class="mb-3" style="font-size:11px">
              <thead><tr>
                <th>Línea</th><th>Contenido</th>
              </tr></thead>
              <tbody>
                <tr><td>1</td><td>RIF del cliente que hace el pedido (se busca en <code>NIF20</code> del ERP)</td></tr>
                <tr><td>2…N</td><td><code>codarticulo;descripcion;cantidad;precioTotal</code> — una línea por artículo</td></tr>
              </tbody>
            </v-table>
            <div class="text-caption font-weight-medium mb-1">Detalle de líneas de artículo:</div>
            <v-table density="compact" class="mb-3" style="font-size:11px">
              <thead><tr>
                <th>Campo</th><th>Descripción</th>
              </tr></thead>
              <tbody>
                <tr><td><code>codarticulo</code></td><td>Código interno del artículo</td></tr>
                <tr><td><code>descripcion</code></td><td>Descripción (referencial, no se usa en la importación)</td></tr>
                <tr><td><code>cantidad</code></td><td>Unidades solicitadas (entero)</td></tr>
                <tr><td><code>precioTotal</code></td><td>Precio total de la línea (solo referencial)</td></tr>
              </tbody>
            </v-table>
            <div class="text-caption font-weight-medium mb-1">Ejemplo:</div>
            <pre class="text-caption pa-2 rounded" style="font-size:10px;line-height:1.6;background:rgba(0,0,0,.04);overflow-x:auto">J-12345678-9
00001;AMOXICILINA 500MG;10;85.00
00002;IBUPROFENO 400MG;5;26.00
00015;PARACETAMOL 500MG;20;82.00</pre>
            <v-alert type="info" variant="tonal" density="compact" class="mt-3" style="font-size:11px">
              Los pedidos se separan automáticamente por tipo de artículo (Normal, NI, Psicotrópico) y se dividen en chunks si superan el máximo de líneas configurado, igual que el resto de flujos.
            </v-alert>
          </v-col>
        </v-row>
      </v-card>

      <!-- Estado del scheduler + acciones -->
      <v-card rounded="xl" elevation="2" class="pa-6 mb-4">
        <div class="d-flex align-center mb-4">
          <div class="text-subtitle-1 font-weight-bold">
            <v-icon start color="deep-orange">mdi-timer-outline</v-icon>
            Ciclo automático (inventario + pedidos)
          </div>
          <v-spacer />
          <v-chip :color="fcSchedulerActivo ? 'success' : 'default'" variant="flat" class="mr-3">
            <v-icon start>{{ fcSchedulerActivo ? 'mdi-check-circle' : 'mdi-circle-off-outline' }}</v-icon>
            {{ fcSchedulerActivo ? 'En ejecución' : 'Detenido' }}
          </v-chip>
          <v-btn color="deep-orange" variant="tonal" prepend-icon="mdi-play-circle-outline"
            :loading="ejecutandoFcCiclo" @click="ejecutarFcCiclo">
            Ejecutar ahora
          </v-btn>
        </div>
        <p class="text-caption text-medium-emphasis mb-0">
          El ciclo regenera <code>inventario.txt</code> en la carpeta base y luego escanea
          <code>pedidos/</code> en busca de archivos nuevos para importarlos a la app.
        </p>
      </v-card>

      <!-- Auditoría -->
      <v-card rounded="xl" elevation="2" class="pa-6">
        <div class="d-flex align-center mb-4">
          <div class="text-subtitle-1 font-weight-bold">
            <v-icon start color="deep-orange">mdi-clipboard-list-outline</v-icon>
            Auditoría de pedidos Farcompras
          </div>
          <v-spacer />
          <v-btn variant="tonal" prepend-icon="mdi-refresh" size="small" :loading="cargandoFcAudit" @click="cargarFcAuditoria">
            Actualizar
          </v-btn>
        </div>
        <v-data-table
          :headers="headersFcAudit"
          :items="fcAuditoria"
          :loading="cargandoFcAudit"
          hover
          density="compact"
          class="bg-white"
          no-data-text="Sin registros"
          :items-per-page="20"
        >
          <template v-slot:item.EVENTO="{ item }">
            <v-chip :color="colorEventoFc(item.EVENTO)" size="x-small" variant="flat">
              {{ item.EVENTO }}
            </v-chip>
          </template>
          <template v-slot:item.FECHA="{ item }">
            {{ item.FECHA ? new Date(item.FECHA).toLocaleString('es-VE', { timeZone: brandingStore.zonaHoraria }) : '—' }}
          </template>
          <template v-slot:item.MENSAJE="{ item }">
            <span v-if="item.MENSAJE" class="text-caption" :title="item.MENSAJE">
              {{ item.MENSAJE.slice(0, 70) }}{{ item.MENSAJE.length > 70 ? '…' : '' }}
            </span>
            <span v-else class="text-caption text-medium-emphasis">—</span>
          </template>
        </v-data-table>
      </v-card>

    </div><!-- /tab farcompras -->

    <!-- ══════════════════════ TAB SEPED ══════════════════════ -->
    <div v-show="tabActiva === 'seped'">

      <!-- Config -->
      <v-card rounded="xl" elevation="2" class="pa-6 mb-4">
        <div class="d-flex align-center mb-4">
          <div class="text-subtitle-1 font-weight-bold">
            <v-icon start color="primary">mdi-cog-outline</v-icon>
            Configuración SEPED
          </div>
          <v-spacer />
          <v-chip :color="sepedSchedulerActivo ? 'success' : 'default'" variant="flat" class="mr-3">
            <v-icon start>{{ sepedSchedulerActivo ? 'mdi-check-circle' : 'mdi-circle-off-outline' }}</v-icon>
            {{ sepedSchedulerActivo ? 'Activo' : 'Inactivo' }}
          </v-chip>
        </div>

        <!-- Conexión -->
        <p class="text-caption text-medium-emphasis font-weight-medium mb-2 text-uppercase">Conexión</p>
        <v-row dense class="mb-2">
          <v-col cols="12" sm="5">
            <v-text-field v-model="sepedCfg.baseUrl" label="URL Base" variant="outlined" density="compact" hide-details placeholder="https://sistema.ejemplo.com" />
          </v-col>
          <v-col cols="12" sm="3">
            <v-text-field v-model="sepedCfg.loginPath" label="Ruta de login" variant="outlined" density="compact" hide-details placeholder="/login" />
          </v-col>
          <v-col cols="12" sm="2">
            <v-text-field v-model="sepedCfg.username" label="Usuario" variant="outlined" density="compact" hide-details />
          </v-col>
          <v-col cols="12" sm="2">
            <v-text-field v-model="sepedCfg.password" label="Contraseña" variant="outlined" density="compact" hide-details type="password" />
          </v-col>
        </v-row>

        <!-- Rutas -->
        <p class="text-caption text-medium-emphasis font-weight-medium mb-2 text-uppercase">Rutas del sistema</p>
        <v-row dense class="mb-2">
          <v-col cols="12" sm="4">
            <v-text-field v-model="sepedCfg.listingPath" label="Listado de pedidos" variant="outlined" density="compact" hide-details placeholder="/seped/pedidos" />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field v-model="sepedCfg.editPathTemplate" label="Editar pedido (usa {id})" variant="outlined" density="compact" hide-details placeholder="/seped/alcabala/{id}" />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field v-model="sepedCfg.acceptPathTemplate" label="Aceptar pedido (usa {id})" variant="outlined" density="compact" hide-details placeholder="Igual al de editar si está vacío" />
          </v-col>
        </v-row>

        <!-- Selectores HTML -->
        <p class="text-caption text-medium-emphasis font-weight-medium mb-2 text-uppercase">Selectores CSS del listado</p>
        <v-row dense class="mb-2">
          <v-col cols="12" sm="3">
            <v-text-field v-model="sepedCfg.orderRowSelector" label="Fila de pedido" variant="outlined" density="compact" hide-details placeholder="tr.pedido-row" />
          </v-col>
          <v-col cols="12" sm="3">
            <v-text-field v-model="sepedCfg.orderIdSelector" label="ID del pedido" variant="outlined" density="compact" hide-details placeholder="td.id a" />
          </v-col>
          <v-col cols="12" sm="3">
            <v-text-field v-model="sepedCfg.orderClientSelector" label="Cliente" variant="outlined" density="compact" hide-details placeholder="td.cliente" />
          </v-col>
          <v-col cols="12" sm="3">
            <v-text-field v-model="sepedCfg.orderTotalSelector" label="Monto total" variant="outlined" density="compact" hide-details placeholder="td.monto" />
          </v-col>
        </v-row>

        <!-- Comportamiento -->
        <p class="text-caption text-medium-emphasis font-weight-medium mb-2 text-uppercase">Comportamiento</p>
        <v-row dense class="mb-3">
          <v-col cols="6" sm="2">
            <v-text-field v-model.number="sepedCfg.intervaloSeg" label="Intervalo (seg)" type="number" variant="outlined" density="compact" hide-details min="10" />
          </v-col>
          <v-col cols="6" sm="2">
            <v-text-field v-model.number="sepedCfg.acceptThreshold" label="Umbral de aceptación" type="number" variant="outlined" density="compact" hide-details min="0" hint="0 = acepta todos" />
          </v-col>
          <v-col cols="6" sm="2">
            <v-text-field v-model.number="sepedCfg.maxRetries" label="Reintentos máx." type="number" variant="outlined" density="compact" hide-details min="1" max="10" />
          </v-col>
          <v-col cols="6" sm="2">
            <v-text-field v-model.number="sepedCfg.backoffBase" label="Backoff base (seg)" type="number" variant="outlined" density="compact" hide-details min="1" />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field v-model="sepedCfg.noOpWindows" label="Ventanas sin operación" variant="outlined" density="compact" hide-details placeholder="22:00-06:00,12:00-14:00" />
          </v-col>
        </v-row>
        <v-row dense class="mb-4">
          <v-col cols="12" sm="5">
            <v-text-field v-model="sepedCfg.snapshotDir" label="Carpeta de snapshots" variant="outlined" density="compact" hide-details placeholder="seped_snapshots" />
          </v-col>
          <v-col cols="auto"><v-switch v-model="sepedCfg.habilitado" label="Habilitado" color="primary" density="compact" hide-details /></v-col>
          <v-col cols="auto"><v-switch v-model="sepedCfg.dryRun" label="Modo prueba (sin POST)" color="warning" density="compact" hide-details /></v-col>
          <v-col cols="auto"><v-switch v-model="sepedCfg.ignoreSnapshotCheck" label="Ignorar snapshot check" color="info" density="compact" hide-details /></v-col>
        </v-row>

        <div class="d-flex gap-3">
          <v-btn color="primary" variant="flat" prepend-icon="mdi-content-save" :loading="guardandoSepedCfg" @click="guardarSepedCfg">
            Guardar
          </v-btn>
          <v-btn color="teal" variant="tonal" prepend-icon="mdi-play-circle-outline" :loading="ejecutandoCicloSeped" @click="ejecutarCicloSeped">
            Ejecutar ahora
          </v-btn>
        </div>
      </v-card>

      <!-- Log en tiempo real -->
      <v-card rounded="xl" elevation="2" class="pa-6 mb-4">
        <div class="d-flex align-center mb-3">
          <div class="text-subtitle-1 font-weight-bold">
            <v-icon start color="primary">mdi-console</v-icon>
            Log en tiempo real
          </div>
          <v-spacer />
          <v-btn
            v-if="!sepedSseActivo"
            size="small" color="success" variant="tonal" prepend-icon="mdi-play"
            class="mr-2" @click="iniciarSepedLog"
          >Conectar</v-btn>
          <v-btn
            v-else
            size="small" color="error" variant="tonal" prepend-icon="mdi-stop"
            class="mr-2" @click="detenerSepedLog"
          >Desconectar</v-btn>
          <v-btn size="small" variant="text" prepend-icon="mdi-delete-sweep" @click="sepedLogLines = []">Limpiar</v-btn>
        </div>
        <div
          ref="sepedLogRef"
          class="seped-log pa-3 rounded-lg"
          style="height:280px; overflow-y:auto; font-family:monospace; font-size:12px; line-height:1.6;"
        >
          <div v-if="!sepedLogLines.length" class="text-medium-emphasis text-caption pa-2">
            Sin mensajes aún. Conecta el log para ver actividad en tiempo real.
          </div>
          <div
            v-for="(line, i) in sepedLogLines"
            :key="i"
            :class="line.includes('[ERROR]') ? 'text-error' : line.includes('[WARN]') ? 'text-warning' : ''"
          >{{ line }}</div>
        </div>
      </v-card>

      <!-- Auditoría -->
      <v-card rounded="xl" elevation="2" class="pa-6">
        <div class="d-flex align-center mb-4">
          <div class="text-subtitle-1 font-weight-bold">
            <v-icon start color="primary">mdi-clipboard-list-outline</v-icon>
            Auditoría de pedidos
          </div>
          <v-spacer />
          <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-refresh" :loading="cargandoSepedAuditoria" @click="cargarSepedAuditoria">
            Actualizar
          </v-btn>
        </div>
        <v-data-table
          :headers="sepedAuditoriaHeaders"
          :items="sepedAuditoria"
          :loading="cargandoSepedAuditoria"
          density="compact"
          items-per-page="15"
        >
          <template v-slot:item.STATUS="{ item }">
            <v-chip size="x-small"
              :color="item.STATUS === 'success' ? 'success' : item.STATUS === 'failed' || item.STATUS === 'error' ? 'error' : item.STATUS === 'pending' ? 'warning' : 'default'"
              variant="flat">
              {{ item.STATUS }}
            </v-chip>
          </template>
          <template v-slot:item.ACTION="{ item }">
            <v-chip size="x-small" :color="item.ACTION === 'accept' ? 'teal' : 'default'" variant="tonal">
              {{ item.ACTION }}
            </v-chip>
          </template>
          <template v-slot:item.FECHA="{ item }">
            {{ item.FECHA ? new Date(item.FECHA).toLocaleString('es-VE', { timeZone: brandingStore.zonaHoraria }) : '—' }}
          </template>
          <template v-slot:item.DETALLE="{ item }">
            <span v-if="item.DETALLE" class="text-caption" :title="item.DETALLE">{{ item.DETALLE.slice(0, 60) }}{{ item.DETALLE.length > 60 ? '…' : '' }}</span>
            <span v-else class="text-caption text-medium-emphasis">—</span>
          </template>
        </v-data-table>
      </v-card>

    </div><!-- /tab seped -->

    <!-- ══ Dialogs FTP ══ -->

    <!-- Dialog: Nuevo usuario FTP -->
    <v-dialog v-model="dialogNuevoUsuario" max-width="420" persistent>
      <v-card rounded="xl">
        <v-card-title class="text-h6 font-weight-bold pa-5 pb-2">
          <v-icon start color="primary">mdi-account-plus</v-icon>
          Nuevo usuario FTP
        </v-card-title>
        <v-card-text class="pa-5 pt-2">
          <v-text-field v-model="nuevoUsuario.usuario"    label="Usuario"     variant="outlined" density="compact" class="mb-3" hide-details />
          <v-text-field v-model="nuevoUsuario.password"   label="Contraseña"  variant="outlined" density="compact" class="mb-3" hide-details
            :type="mostrarPassNuevo ? 'text' : 'password'"
            :append-inner-icon="mostrarPassNuevo ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="mostrarPassNuevo = !mostrarPassNuevo" />
          <v-text-field v-model="nuevoUsuario.codCliente" label="Cód. Cliente (opcional)" variant="outlined" density="compact" hide-details
            hint="Número de cliente — define el directorio home del usuario" persistent-hint />
        </v-card-text>
        <v-card-actions class="pa-5 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialogNuevoUsuario = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="guardandoUsuario" @click="crearUsuario">Crear</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: Cambiar contraseña -->
    <v-dialog v-model="dialogPassword" max-width="380" persistent>
      <v-card rounded="xl">
        <v-card-title class="text-h6 font-weight-bold pa-5 pb-2">
          <v-icon start color="info">mdi-key</v-icon>
          Cambiar contraseña
        </v-card-title>
        <v-card-text class="pa-5 pt-2">
          <p class="text-body-2 mb-3">Usuario: <strong>{{ usuarioSeleccionado?.USUARIO }}</strong></p>
          <v-text-field v-model="nuevaPassword" label="Nueva contraseña" variant="outlined" density="compact" hide-details
            :type="mostrarPassEditar ? 'text' : 'password'"
            :append-inner-icon="mostrarPassEditar ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="mostrarPassEditar = !mostrarPassEditar" />
        </v-card-text>
        <v-card-actions class="pa-5 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialogPassword = false">Cancelar</v-btn>
          <v-btn color="info" variant="flat" :loading="guardandoPassword" @click="cambiarPassword">Guardar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: Confirmar eliminar -->
    <v-dialog v-model="dialogEliminar" max-width="360">
      <v-card rounded="xl">
        <v-card-title class="text-h6 font-weight-bold pa-5 pb-2">Eliminar usuario</v-card-title>
        <v-card-text class="pa-5 pt-0">
          ¿Eliminar el usuario FTP <strong>{{ usuarioSeleccionado?.USUARIO }}</strong>? Esta acción no se puede deshacer.
        </v-card-text>
        <v-card-actions class="pa-5 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="dialogEliminar = false">Cancelar</v-btn>
          <v-btn color="error" variant="flat" :loading="eliminandoUsuario" @click="eliminarUsuario">Eliminar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: Resultados de importación -->
    <v-dialog v-model="dialogResultados" max-width="560" scrollable>
      <v-card rounded="xl">
        <v-card-title class="pa-5 pb-2 d-flex align-center">
          <v-icon start color="green-darken-2">mdi-file-import-outline</v-icon>
          Resultado de importación
          <v-spacer />
          <v-chip size="small" color="success" variant="tonal" class="mr-1">
            {{ resultadosImport.filter(r => r.ok).length }} ok
          </v-chip>
          <v-chip size="small" color="error" variant="tonal">
            {{ resultadosImport.filter(r => !r.ok).length }} error
          </v-chip>
        </v-card-title>
        <v-card-text class="pa-4">
          <v-table density="compact">
            <thead>
              <tr>
                <th>Fila</th><th>Usuario</th><th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in resultadosImport" :key="r.fila">
                <td class="text-caption">{{ r.fila }}</td>
                <td>{{ r.usuario }}</td>
                <td>
                  <v-chip v-if="r.ok" size="x-small" color="success" variant="flat">Creado</v-chip>
                  <v-tooltip v-else location="top" :text="r.error">
                    <template #activator="{ props }">
                      <v-chip v-bind="props" size="x-small" color="error" variant="flat">Error</v-chip>
                    </template>
                  </v-tooltip>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="flat" color="primary" @click="dialogResultados = false">Cerrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: Datos de conexión FTP -->
    <v-dialog v-model="dialogConexion" max-width="460">
      <v-card rounded="xl">
        <v-card-title class="text-h6 font-weight-bold pa-5 pb-2">
          <v-icon start color="teal-darken-1">mdi-lan-connect</v-icon>
          Datos de conexión FTP
        </v-card-title>
        <v-card-text class="pa-5 pt-2">
          <v-alert v-if="!conexionTienePassword" type="warning" variant="tonal" density="compact" class="mb-3">
            La contraseña no está guardada para este usuario. Usá el botón <v-icon size="small">mdi-key</v-icon> para cambiarla y quedará disponible aquí.
          </v-alert>
          <pre class="conexion-txt pa-4 rounded-lg text-body-2">{{ textoConexion }}</pre>
        </v-card-text>
        <v-card-actions class="pa-5 pt-0 gap-2">
          <v-btn variant="tonal" color="teal-darken-1" prepend-icon="mdi-content-copy" :disabled="!conexionTienePassword" @click="copiarConexion">
            Copiar
          </v-btn>
          <v-btn variant="tonal" color="primary" prepend-icon="mdi-download" :disabled="!conexionTienePassword" @click="descargarConexion">
            Descargar TXT
          </v-btn>
          <v-spacer />
          <v-btn variant="text" @click="dialogConexion = false">Cerrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" rounded="pill">{{ snack.text }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import axios from 'axios';
import { useBrandingStore } from '../stores/useBrandingStore';
import { useAuthStore } from '../stores/useAuthStore';

const brandingStore = useBrandingStore();
const authStore     = useAuthStore();
const API = `${import.meta.env.VITE_API_URL}/ftp`;

const snack = ref({ show: false, text: '', color: 'success' });
const mostrarSnack = (text: string, color = 'success') => { snack.value = { show: true, text, color }; };

const tabActiva = ref<'ftp' | 'icompras' | 'farcompras' | 'seped'>('ftp');

// ── FTP: Estado del servidor ───────────────────────────────────────────────────

const servidorActivo  = ref(false);
const accionServidor  = ref(false);
const guardandoCfgSrv = ref(false);
const cfgServidor     = ref({ puerto: 21, pasivoMin: 40000, pasivoMax: 40100, ipExterna: '', ftpHabilitado: false });

// ── FTP: Usuarios ──────────────────────────────────────────────────────────────

const usuarios           = ref<any[]>([]);
const cargandoUsuarios   = ref(false);
const dialogNuevoUsuario = ref(false);
const nuevoUsuario       = ref({ usuario: '', password: '', codCliente: '' });
const mostrarPassNuevo   = ref(false);
const guardandoUsuario   = ref(false);
const dialogPassword     = ref(false);
const nuevaPassword      = ref('');
const mostrarPassEditar  = ref(false);
const guardandoPassword  = ref(false);
const dialogEliminar     = ref(false);
const eliminandoUsuario  = ref(false);
const usuarioSeleccionado = ref<any>(null);

const dialogConexion        = ref(false);
const textoConexion         = ref('');
const conexionTienePassword = ref(false);
const ipConexionClientes    = ref(localStorage.getItem('ftp_ip_conexion') ?? '');

const buscarUsuario = ref('');

const usuariosFiltrados = computed(() => {
  const q = buscarUsuario.value.toLowerCase().trim();
  if (!q) return usuarios.value;
  return usuarios.value.filter(u =>
    (u.USUARIO       || '').toLowerCase().includes(q) ||
    (u.COD_CLIENTE   || '').toString().includes(q)    ||
    (u.NOMBRE_CLIENTE|| '').toLowerCase().includes(q)
  );
});

const headersUsuarios = [
  { title: 'Usuario',  key: 'USUARIO',       sortable: false },
  { title: 'Cliente',  key: 'COD_CLIENTE',    sortable: false },
  { title: 'Estado',   key: 'ACTIVO',         sortable: false },
  { title: 'Creado',   key: 'FECHA_CREACION', sortable: false },
  { title: 'Acciones', key: 'acciones',       sortable: false },
];

const formatoPedidos = `Ruta: c{CODCLIENTE}/Pedidos/{CODCLIENTE}P{NRO_PEDIDO}.txt

Contenido (separado por ;):
  CODARTICULO;DESCRIPCION;CANTIDAD;PRECIO_TOTAL
  Ejemplo:
  00668;CREMA GENTAMICINA 30GR;10;73.70
  05066;ABRETIA 10MG X 10 CAPS;5;91.15

Campos:
  CODARTICULO    Código ICG del artículo
  DESCRIPCION    Descripción del producto
  CANTIDAD       Unidades solicitadas
  PRECIO_TOTAL   Precio total de la línea (referencial; el sistema usa su propio precio)

Ciclo del archivo:
  {CODCLIENTE}P{NRO_PEDIDO}.txt  ← el cliente sube este archivo
  {CODCLIENTE}P{NRO_PEDIDO}.bak  ← renombrado automáticamente al procesar`;

const formatoInventario = `Ruta: c{CODCLIENTE}/inventario.txt

Contenido (separado por ;):
  CODARTICULO;REF_PROVEEDOR;DESCRIPCION;VENCE;PRECIO_SD;DESCUENTO;PRECIO_CD;STOCK;MARCA
  Ejemplo:
  00668;REF001;CREMA GENTAMICINA 30GR;31/12/2025;7.37;5+0+0+0;6.99;50;LAB ESAGEN
  05066;AB123;ABRETIA 10MG X 10 CAPS;;91.15;0+0+0+0;91.15;12;LAB BAGO

Campos:
  CODARTICULO    Código ICG (5 dígitos, con cero a la izquierda)
  REF_PROVEEDOR  Referencia del proveedor / código de barras
  DESCRIPCION    Descripción larga (máx 45 caracteres)
  VENCE          Fecha de vencimiento DD/MM/AAAA  (vacío si no aplica)
  PRECIO_SD      Precio sin descuento (tarifa base)
  DESCUENTO      Descuentos: D1+D2+Promo1+Promo2 (porcentajes separados por +)
  PRECIO_CD      Precio con todos los descuentos aplicados
  STOCK          Unidades disponibles en almacén
  MARCA          Laboratorio/marca (máx 30 caracteres)`;

const formatoFacturas = `Ruta: c{CODCLIENTE}/Facturas/F{NUMFACTURA_8_DIGITS}.txt

Dos tipos de registros por archivo:

Tipo R — línea de producto:
  R;NUMFACTURA;NOFISCAL;CODARTICULO;REF;DESCRIPCION;CANTIDAD;NETO_LINEA;PRECIO_SD;DESCUENTOS;PRECIO_CD;LOTE;FECHA_LOTE;TASA_IVA

Tipo E — encabezado/total (última línea del archivo):
  E;NUMFACTURA;NOFISCAL;FECHA;TASA;(vacío);TOTAL_UNID;TOTAL_NETO;TOTAL_CON_IVA;DSCTO_LINEAL;TOTAL_IVA;(vacío);SICM;TOTAL_IVA

Ejemplo:
  R;00000123;12345678-1;00668;REF001;CREMA GENTAMICINA 30GR;10.000;73.70;7.37;5+0+0;6.99;L001;31/12/2025;16.00
  R;00000123;12345678-1;05066;AB123;ABRETIA 10MG X 10 CAPS;5.000;455.75;91.15;0+0+0;91.15;;;16.00
  E;00000123;12345678-1;25/01/2025;1.00;;15;529.45;614.16;0.00;84.71;;V12345678;84.71

Campos Tipo R:
  NUMFACTURA   Número de factura (8 dígitos con cero a la izquierda)
  NOFISCAL     Número de control fiscal
  CODARTICULO  Código ICG (5 dígitos)
  REF          Referencia proveedor
  DESCRIPCION  Descripción del artículo (máx 40 caracteres)
  CANTIDAD     Unidades despachadas (3 decimales)
  NETO_LINEA   Total de la línea con IVA incluido
  PRECIO_SD    Precio sin descuento (bruto)
  DESCUENTOS   Porcentajes de descuento: D1+D2+D3
  PRECIO_CD    Precio unitario con descuento aplicado
  LOTE         Código de lote (vacío si no aplica)
  FECHA_LOTE   Fecha de vencimiento del lote DD/MM/AAAA
  TASA_IVA     Porcentaje de IVA aplicado

Campos Tipo E:
  FECHA         Fecha de la factura DD/MM/AAAA
  TASA          Tasa de cambio del día
  TOTAL_UNID    Suma de unidades de todas las líneas
  TOTAL_NETO    Total sin IVA
  TOTAL_CON_IVA Total con IVA
  DSCTO_LINEAL  Descuento lineal (diferencia bruto-neto)
  TOTAL_IVA     Monto total del IVA
  SICM          Código SICM del cliente`;

// ── ICOMPRAS: estado ───────────────────────────────────────────────────────────

const icCfg = ref({
  urlBase: '', codisb: '', intervaloSeg: 60, habilitado: false, rutaPedidos: '',
});
const guardandoIcCfg      = ref(false);
const icSchedulerActivo   = ref(false);
const ejecutandoCiclo     = ref(false);
const ultimoCicloResultado = ref<{ descargados: number; errores: number } | null>(null);
const icReprocesarId      = ref('');
const reprocesando        = ref(false);
const auditoria           = ref<any[]>([]);
const cargandoAudit       = ref(false);

const headersAudit = [
  { title: 'ID',          key: 'ID_PEDIDO_REM',  sortable: false, width: 100 },
  { title: 'Estado',      key: 'ESTADO',          sortable: false, width: 110 },
  { title: 'Descargado',  key: 'FECHA_DESCARGA',  sortable: false, width: 160 },
  { title: 'Archivo',     key: 'ARCHIVO_PATH',    sortable: false },
  { title: 'Error',       key: 'ERROR_MSG',       sortable: false },
];

const colorEstado = (estado: string) => {
  const m: Record<string, string> = {
    PROCESADO: 'success', RECIBIDO: 'info', DESCARGANDO: 'warning',
    FACTURADO: 'teal', ANULADO: 'default', ERROR: 'error',
  };
  return m[estado] ?? 'default';
};

// ── FARCOMPRAS: estado ─────────────────────────────────────────────────────────
const fcCfg = ref({
  rutaBase: '', habilitado: false, intervaloSeg: 300, usuarioFtp: '',
});
const guardandoFcCfg    = ref(false);
const fcSchedulerActivo = ref(false);
const ejecutandoFcCiclo = ref(false);
const fcAuditoria       = ref<any[]>([]);
const cargandoFcAudit   = ref(false);

const headersFcAudit = [
  { title: 'ID',      key: 'ID',      sortable: false, width: 70 },
  { title: 'Archivo', key: 'ARCHIVO', sortable: false },
  { title: 'Evento',  key: 'EVENTO',  sortable: false, width: 160 },
  { title: 'OrderID', key: 'ORDERID', sortable: false, width: 160 },
  { title: 'Mensaje', key: 'MENSAJE', sortable: false },
  { title: 'Fecha',   key: 'FECHA',   sortable: false, width: 170 },
];

const colorEventoFc = (evento: string) => {
  const m: Record<string, string> = {
    PROCESADO: 'success', YA_PROCESADO: 'info', PARSE_ERROR: 'warning',
    ERROR_INSERCION: 'error', ERROR_CONFIG: 'error', ERROR_CRITICO: 'error',
    CLIENTE_NO_ENCONTRADO: 'warning',
  };
  return m[evento] ?? 'default';
};

// ── FTP: métodos ──────────────────────────────────────────────────────────────

const cargarEstadoServidor = async () => {
  try {
    const res = await axios.get(`${API}/servidor/estado`);
    if (res.data.success) {
      servidorActivo.value = res.data.activo;
      cfgServidor.value = {
        puerto:        res.data.puerto,
        pasivoMin:     res.data.pasivoMin,
        pasivoMax:     res.data.pasivoMax,
        ipExterna:     res.data.ipExterna ?? '',
        ftpHabilitado: res.data.ftpHabilitado ?? false,
      };
    }
  } catch {}
};

const guardarCfgServidor = async () => {
  guardandoCfgSrv.value = true;
  try {
    await axios.post(`${API}/servidor/config`, cfgServidor.value);
    mostrarSnack('Configuración guardada. Reinicia el servidor para aplicar.', 'success');
  } catch { mostrarSnack('Error al guardar configuración', 'error'); }
  finally { guardandoCfgSrv.value = false; }
};

const iniciarServidor = async () => {
  accionServidor.value = true;
  try {
    const res = await axios.post(`${API}/servidor/iniciar`);
    mostrarSnack(res.data.message, res.data.success ? 'success' : 'error');
    await cargarEstadoServidor();
  } catch (e: any) {
    mostrarSnack(e?.response?.data?.message ?? 'Error al iniciar servidor', 'error');
  } finally { accionServidor.value = false; }
};

const detenerServidor = async () => {
  accionServidor.value = true;
  try {
    const res = await axios.post(`${API}/servidor/detener`);
    mostrarSnack(res.data.message, res.data.success ? 'success' : 'error');
    await cargarEstadoServidor();
  } catch { mostrarSnack('Error al detener servidor', 'error'); }
  finally { accionServidor.value = false; }
};

const cargarUsuarios = async () => {
  cargandoUsuarios.value = true;
  try {
    const res = await axios.get(`${API}/usuarios`);
    if (res.data.success) usuarios.value = res.data.data;
  } catch { mostrarSnack('Error al cargar usuarios FTP', 'error'); }
  finally { cargandoUsuarios.value = false; }
};

const abrirDialogNuevoUsuario = () => {
  nuevoUsuario.value = { usuario: '', password: '', codCliente: '' };
  mostrarPassNuevo.value = false;
  dialogNuevoUsuario.value = true;
};

const crearUsuario = async () => {
  if (!nuevoUsuario.value.usuario || !nuevoUsuario.value.password) {
    mostrarSnack('Usuario y contraseña son requeridos', 'warning');
    return;
  }
  guardandoUsuario.value = true;
  try {
    const res = await axios.post(`${API}/usuarios`, nuevoUsuario.value);
    mostrarSnack(res.data.message, 'success');
    dialogNuevoUsuario.value = false;
    await cargarUsuarios();
  } catch (e: any) {
    mostrarSnack(e?.response?.data?.message ?? 'Error al crear usuario', 'error');
  } finally { guardandoUsuario.value = false; }
};

const toggleUsuario = async (item: any) => {
  try {
    await axios.patch(`${API}/usuarios/${item.ID}/toggle`);
    await cargarUsuarios();
  } catch { mostrarSnack('Error al cambiar estado', 'error'); }
};

const abrirDialogPassword = (item: any) => {
  usuarioSeleccionado.value = item;
  nuevaPassword.value = '';
  mostrarPassEditar.value = false;
  dialogPassword.value = true;
};

const cambiarPassword = async () => {
  if (!nuevaPassword.value) { mostrarSnack('La contraseña no puede estar vacía', 'warning'); return; }
  guardandoPassword.value = true;
  try {
    await axios.patch(`${API}/usuarios/${usuarioSeleccionado.value.ID}/password`, { password: nuevaPassword.value });
    mostrarSnack('Contraseña actualizada', 'success');
    dialogPassword.value = false;
  } catch { mostrarSnack('Error al cambiar contraseña', 'error'); }
  finally { guardandoPassword.value = false; }
};

const confirmarEliminar = (item: any) => {
  usuarioSeleccionado.value = item;
  dialogEliminar.value = true;
};

const eliminarUsuario = async () => {
  eliminandoUsuario.value = true;
  try {
    await axios.delete(`${API}/usuarios/${usuarioSeleccionado.value.ID}`);
    mostrarSnack('Usuario eliminado', 'success');
    dialogEliminar.value = false;
    await cargarUsuarios();
  } catch { mostrarSnack('Error al eliminar usuario', 'error'); }
  finally { eliminandoUsuario.value = false; }
};

const abrirDatosConexion = (item: any) => {
  localStorage.setItem('ftp_ip_conexion', ipConexionClientes.value);
  const direccion = ipConexionClientes.value.trim() || '<completar dirección FTP>';
  const nombre = item.NOMBRE_CLIENTE || item.USUARIO;
  const clave  = item.PASSWORD_PLAIN || null;
  conexionTienePassword.value = !!clave;
  textoConexion.value =
`DATOS DE CONEXION

${nombre}

Dirección FTP: ${direccion}
Usuario: ${item.USUARIO}
Contraseña: ${clave ?? '(no disponible — resetear con el botón de llave)'}`;
  dialogConexion.value = true;
};

const copiarConexion = () => {
  navigator.clipboard.writeText(textoConexion.value);
  mostrarSnack('Copiado al portapapeles', 'success');
};

const copiarFormato = (texto: string) => {
  navigator.clipboard.writeText(texto);
  mostrarSnack('Formato copiado al portapapeles', 'success');
};

const descargarConexion = () => {
  const blob = new Blob([textoConexion.value], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const usuario = textoConexion.value.match(/Usuario: (.+)/)?.[1]?.trim() ?? 'conexion';
  a.download = `datos_conexion_${usuario}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
};

const inputImportRef    = ref<HTMLInputElement | null>(null);
const inputClavesRef    = ref<HTMLInputElement | null>(null);
const importandoExcel   = ref(false);
const sincronizandoClaves = ref(false);
const dialogResultados  = ref(false);
const resultadosImport  = ref<{ fila: number; usuario: string; ok: boolean; error?: string }[]>([]);

const seleccionarExcel = () => inputImportRef.value?.click();

const descargarPlantilla = async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Usuarios FTP');
  ws.columns = [
    { header: 'CODCLIENTE', key: 'CODCLIENTE', width: 15 },
    { header: 'USUARIO',    key: 'USUARIO',    width: 22 },
    { header: 'CLAVE',      key: 'CLAVE',      width: 22 },
  ];
  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF164E63' } };
  ws.addRow({ CODCLIENTE: '1234', USUARIO: 'cliente1234', CLAVE: 'clave123' });
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = 'plantilla_usuarios_ftp.xlsx';
  a.click();
};

const importarExcel = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  importandoExcel.value = true;
  try {
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, { type: 'array' });
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    if (!rows.length) { mostrarSnack('El archivo no tiene datos', 'warning'); return; }
    const filas = rows.map((r: any) => ({
      codCliente: String(r.CODCLIENTE ?? '').trim(),
      usuario:    String(r.USUARIO    ?? '').trim(),
      password:   String(r.CLAVE      ?? '').trim(),
    })).filter(f => f.usuario);
    if (!filas.length) { mostrarSnack('No se encontraron filas válidas (verifica encabezados: CODCLIENTE, USUARIO, CLAVE)', 'warning'); return; }
    const res = await axios.post(`${API}/usuarios/importar`, { filas });
    resultadosImport.value = res.data.resultados;
    dialogResultados.value = true;
    await cargarUsuarios();
  } catch (err: any) {
    mostrarSnack(err?.response?.data?.message ?? 'Error al importar', 'error');
  } finally {
    importandoExcel.value = false;
    if (inputImportRef.value) inputImportRef.value.value = '';
  }
};

const seleccionarExcelClaves = () => inputClavesRef.value?.click();

const sincronizarClaves = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  sincronizandoClaves.value = true;
  try {
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array' });
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    if (!rows.length) { mostrarSnack('El archivo no tiene datos', 'warning'); return; }
    const filas = rows
      .map((r: any) => ({
        usuario:  String(r.USUARIO ?? '').trim(),
        password: String(r.CLAVE   ?? '').trim(),
      }))
      .filter(f => f.usuario && f.password);
    if (!filas.length) { mostrarSnack('No se encontraron filas válidas (columnas: USUARIO, CLAVE)', 'warning'); return; }
    const res = await axios.post(`${API}/usuarios/sincronizar-claves`, { filas });
    resultadosImport.value = res.data.resultados;
    dialogResultados.value = true;
    await cargarUsuarios();
  } catch (err: any) {
    mostrarSnack(err?.response?.data?.message ?? 'Error al sincronizar claves', 'error');
  } finally {
    sincronizandoClaves.value = false;
    if (inputClavesRef.value) inputClavesRef.value.value = '';
  }
};

const guardarIpConexion = () => {
  localStorage.setItem('ftp_ip_conexion', ipConexionClientes.value);
  mostrarSnack('Dirección guardada correctamente', 'success');
};

// ── ICOMPRAS: métodos ──────────────────────────────────────────────────────────

const cargarIcCfg = async () => {
  try {
    const res = await axios.get(`${API}/icompras/config`);
    if (res.data.success) {
      icCfg.value          = res.data.data;
      icSchedulerActivo.value = res.data.schedulerActivo;
    }
  } catch {}
};

const guardarIcCfg = async () => {
  guardandoIcCfg.value = true;
  try {
    const res = await axios.put(`${API}/icompras/config`, icCfg.value);
    icSchedulerActivo.value = res.data.schedulerActivo ?? icCfg.value.habilitado;
    mostrarSnack('Configuración ICompras guardada', 'success');
  } catch (e: any) {
    mostrarSnack(e?.response?.data?.message ?? 'Error al guardar', 'error');
  } finally { guardandoIcCfg.value = false; }
};

const ejecutarCicloManual = async () => {
  ejecutandoCiclo.value = true;
  try {
    const res = await axios.post(`${API}/icompras/ciclo`);
    if (res.data.success) {
      ultimoCicloResultado.value = { descargados: res.data.descargados, errores: res.data.errores };
      mostrarSnack(`Ciclo completado: ${res.data.descargados} descargados, ${res.data.errores} errores`,
        res.data.errores > 0 ? 'warning' : 'success');
      await cargarAuditoria();
    }
  } catch (e: any) {
    mostrarSnack(e?.response?.data?.message ?? 'Error al ejecutar ciclo', 'error');
  } finally { ejecutandoCiclo.value = false; }
};

const reprocesarPedido = async () => {
  if (!icReprocesarId.value.trim()) { mostrarSnack('Ingresa un ID de pedido', 'warning'); return; }
  reprocesando.value = true;
  try {
    const res = await axios.post(`${API}/icompras/reprocesar`, { id: icReprocesarId.value.trim() });
    mostrarSnack(res.data.message ?? 'Reprocesado', 'success');
    icReprocesarId.value = '';
    await cargarAuditoria();
  } catch (e: any) {
    mostrarSnack(e?.response?.data?.message ?? 'Error al reprocesar', 'error');
  } finally { reprocesando.value = false; }
};

const cargarAuditoria = async () => {
  cargandoAudit.value = true;
  try {
    const res = await axios.get(`${API}/icompras/auditoria`);
    if (res.data.success) auditoria.value = res.data.data;
  } catch { mostrarSnack('Error al cargar auditoría', 'error'); }
  finally { cargandoAudit.value = false; }
};

// ── FARCOMPRAS: métodos ────────────────────────────────────────────────────────

const cargarFcCfg = async () => {
  try {
    const res = await axios.get(`${API}/farcompras/config`);
    if (res.data.success) {
      fcCfg.value = res.data.data;
      fcSchedulerActivo.value = res.data.schedulerActivo;
    }
  } catch {}
};

const guardarFcCfg = async () => {
  guardandoFcCfg.value = true;
  try {
    const res = await axios.put(`${API}/farcompras/config`, fcCfg.value);
    fcSchedulerActivo.value = res.data.schedulerActivo ?? fcCfg.value.habilitado;
    mostrarSnack('Configuración Farcompras guardada', 'success');
  } catch (e: any) {
    mostrarSnack(e?.response?.data?.message ?? 'Error al guardar', 'error');
  } finally { guardandoFcCfg.value = false; }
};

const ejecutarFcCiclo = async () => {
  ejecutandoFcCiclo.value = true;
  try {
    await axios.post(`${API}/farcompras/ciclo`);
    mostrarSnack('Ciclo Farcompras iniciado', 'success');
    setTimeout(() => cargarFcAuditoria(), 3000);
  } catch (e: any) {
    mostrarSnack(e?.response?.data?.message ?? 'Error al ejecutar ciclo', 'error');
  } finally { ejecutandoFcCiclo.value = false; }
};

const cargarFcAuditoria = async () => {
  cargandoFcAudit.value = true;
  try {
    const res = await axios.get(`${API}/farcompras/auditoria`);
    if (res.data.success) fcAuditoria.value = res.data.data;
  } catch { mostrarSnack('Error al cargar auditoría Farcompras', 'error'); }
  finally { cargandoFcAudit.value = false; }
};

const descargarDocumentacionFarcompras = () => {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Documentación Integración Farcompras</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 32px; }
  h1 { font-size: 20px; color: #c2410c; margin-bottom: 4px; }
  .subtitle { font-size: 11px; color: #666; margin-bottom: 28px; }
  h2 { font-size: 14px; color: #1e3a5f; margin: 0 0 4px; }
  .badge { display:inline-block; font-size:9px; padding:2px 7px; border-radius:10px; font-weight:bold; margin-left:6px; vertical-align:middle; }
  .badge-out { background:#d1fae5; color:#065f46; }
  .badge-in  { background:#ffedd5; color:#9a3412; }
  .desc { color:#555; font-size:11px; margin-bottom:10px; margin-top:4px; }
  table { width:100%; border-collapse:collapse; margin-bottom:12px; }
  th { background:#f1f5f9; text-align:left; padding:5px 8px; font-size:11px; border:1px solid #e2e8f0; }
  td { padding:4px 8px; font-size:11px; border:1px solid #e2e8f0; vertical-align:top; }
  td code, th code { background:#f1f5f9; padding:1px 4px; border-radius:3px; font-family:monospace; font-size:10px; }
  pre { background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:10px; font-size:10px; line-height:1.7; font-family:monospace; white-space:pre-wrap; margin-bottom:12px; }
  .section { margin-bottom: 28px; page-break-inside: avoid; }
  .note { background:#fff7ed; border-left:3px solid #f97316; padding:8px 12px; font-size:11px; color:#7c2d12; border-radius:0 4px 4px 0; margin-top:8px; }
  hr { border:none; border-top:1px solid #e2e8f0; margin:24px 0; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<h1>Documentación — Integración Farcompras</h1>
<div class="subtitle">Generado automáticamente · Formato de archivos FTP</div>

<div class="section">
  <h2>inventario.txt <span class="badge badge-out">Saliente</span></h2>
  <p class="desc">Generado automáticamente en cada ciclo y al conectar por FTP. Una línea por artículo. Separado por punto y coma (;). Codificación: latin1.</p>
  <table>
    <tr><th>Posición</th><th>Campo</th><th>Descripción</th></tr>
    <tr><td>1</td><td><code>codarticulo</code></td><td>Código interno del artículo (5 dígitos, rellenado con ceros a la izquierda)</td></tr>
    <tr><td>2</td><td><code>refproveedor</code></td><td>Referencia del proveedor</td></tr>
    <tr><td>3</td><td><code>descripcion</code></td><td>Nombre del artículo (máx. 45 caracteres)</td></tr>
    <tr><td>4</td><td><code>vence</code></td><td>Fecha de vencimiento más próxima en formato DD/MM/AAAA, o vacío si no aplica</td></tr>
    <tr><td>5</td><td><code>precio</code></td><td>Precio base de venta (2 decimales)</td></tr>
    <tr><td>6</td><td><code>descuentos</code></td><td>Descuentos en formato D1+D2+D3+D4. Si hay D2 activo: <code>0+10+0+0</code>. Sin descuento: vacío</td></tr>
    <tr><td>7</td><td><code>precio</code></td><td>Precio base repetido (sin aplicar descuento)</td></tr>
    <tr><td>8</td><td><code>stock</code></td><td>Unidades disponibles en almacén</td></tr>
    <tr><td>9</td><td><code>marca</code></td><td>Nombre de la marca (máx. 30 caracteres)</td></tr>
  </table>
  <pre>00001;LAB001;AMOXICILINA 500MG;31/12/2025;8.50;;8.50;120;GENFAR
00002;LAB002;IBUPROFENO 400MG;;5.20;0+10+0+0;5.20;85;BAYER
00003;;PARACETAMOL 500MG;;4.10;;4.10;200;</pre>
</div>

<hr/>

<div class="section">
  <h2>clientes.txt <span class="badge badge-out">Saliente</span></h2>
  <p class="desc">Generado junto al inventario. Lista todos los clientes del sistema con su RIF y descuento D1. Una línea por cliente. Separado por punto y coma (;). Codificación: latin1.</p>
  <table>
    <tr><th>Posición</th><th>Campo</th><th>Descripción</th></tr>
    <tr><td>1</td><td><code>codcliente</code></td><td>Código interno del cliente en el ERP</td></tr>
    <tr><td>2</td><td><code>nif20</code></td><td>RIF o cédula fiscal del cliente</td></tr>
    <tr><td>3</td><td><code>nombrecliente</code></td><td>Razón social o nombre del cliente</td></tr>
    <tr><td>4</td><td><code>d1</code></td><td>Descuento D1 asignado al cliente (porcentaje con 2 decimales). 0.00 si no tiene descuento</td></tr>
  </table>
  <pre>1001;J-12345678-9;FARMACIA LA SALUD;5.00
1002;V-87654321-0;CLINICA SANTA MARIA;0.00
1003;J-98765432-1;DROGUERIA EL CENTRO;3.50</pre>
</div>

<hr/>

<div class="section">
  <h2>pedidos/*.txt <span class="badge badge-in">Entrante</span></h2>
  <p class="desc">Farcompras deposita un archivo .txt por pedido dentro de <strong>carpeta_base/pedidos/</strong>. Al procesarse correctamente se renombra a .bak. Si el RIF no existe en el sistema el archivo queda sin procesar y se registra el error en auditoría.</p>
  <table>
    <tr><th>Línea</th><th>Contenido</th><th>Descripción</th></tr>
    <tr><td>1</td><td><code>RIF</code></td><td>RIF del cliente que realiza el pedido. Se busca en el campo NIF20 del ERP para identificar al cliente y su vendedor</td></tr>
    <tr><td>2…N</td><td><code>codarticulo;descripcion;cantidad;precioTotal</code></td><td>Una línea por artículo solicitado</td></tr>
  </table>
  <table style="margin-top:8px">
    <tr><th>Posición</th><th>Campo</th><th>Descripción</th></tr>
    <tr><td>1</td><td><code>codarticulo</code></td><td>Código interno del artículo en el ERP</td></tr>
    <tr><td>2</td><td><code>descripcion</code></td><td>Descripción referencial (no se utiliza en la importación)</td></tr>
    <tr><td>3</td><td><code>cantidad</code></td><td>Unidades solicitadas</td></tr>
    <tr><td>4</td><td><code>precioTotal</code></td><td>Precio total de la línea (referencial; el sistema recalcula con sus precios)</td></tr>
  </table>
  <pre>J-12345678-9
00001;AMOXICILINA 500MG;10;85.00
00002;IBUPROFENO 400MG;5;26.00
00015;PARACETAMOL 500MG;20;82.00</pre>
  <div class="note">
    Los pedidos se separan automáticamente por tipo de artículo (Normal, NI, Psicotrópico, Sin Descuento) y se dividen en partes si superan el máximo de líneas configurado en el sistema, igual que todos los demás flujos de importación.
  </div>
</div>
</body>
</html>`;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => win.print();
};

// ── SEPED ──────────────────────────────────────────────────────────────────
const SEPED_API = `${import.meta.env.VITE_API_URL}/seped`;

const sepedCfg = ref({
  habilitado: false, intervaloSeg: 60, baseUrl: '', loginPath: '/login',
  listingPath: '', editPathTemplate: '', acceptPathTemplate: '',
  orderRowSelector: 'tr', orderIdSelector: 'td:first-child',
  orderClientSelector: 'td:nth-child(2)', orderTotalSelector: 'td:last-child',
  username: '', password: '', acceptThreshold: 0,
  maxRetries: 3, backoffBase: 2, noOpWindows: '',
  dryRun: false, ignoreSnapshotCheck: false, snapshotDir: 'seped_snapshots',
});
const sepedSchedulerActivo  = ref(false);
const guardandoSepedCfg     = ref(false);
const ejecutandoCicloSeped  = ref(false);
const sepedAuditoria        = ref<any[]>([]);
const cargandoSepedAuditoria = ref(false);
const sepedLogLines         = ref<string[]>([]);
const sepedSseActivo        = ref(false);
const sepedLogRef           = ref<HTMLElement | null>(null);
let   sepedSse: EventSource | null = null;

const sepedAuditoriaHeaders = [
  { title: 'ID',       key: 'ID',      width: 60  },
  { title: 'Pedido',   key: 'ORDERID', width: 110 },
  { title: 'Cliente',  key: 'CLIENT'              },
  { title: 'Acción',   key: 'ACTION',  width: 100 },
  { title: 'Estado',   key: 'STATUS',  width: 120 },
  { title: 'Detalle',  key: 'DETALLE'             },
  { title: 'Fecha',    key: 'FECHA',   width: 170 },
];

const cargarSepedCfg = async () => {
  try {
    const res = await axios.get(`${SEPED_API}/config`);
    if (res.data.success) {
      Object.assign(sepedCfg.value, res.data.data);
      sepedSchedulerActivo.value = res.data.schedulerActivo;
    }
  } catch { /* silencioso en onMounted */ }
};

const guardarSepedCfg = async () => {
  guardandoSepedCfg.value = true;
  try {
    const res = await axios.put(`${SEPED_API}/config`, sepedCfg.value);
    if (res.data.success) {
      sepedSchedulerActivo.value = res.data.schedulerActivo;
      mostrarSnack('Configuración SEPED guardada');
    }
  } catch { mostrarSnack('Error al guardar configuración SEPED', 'error'); }
  finally { guardandoSepedCfg.value = false; }
};

const ejecutarCicloSeped = async () => {
  ejecutandoCicloSeped.value = true;
  try {
    await axios.post(`${SEPED_API}/ciclo`);
    mostrarSnack('Ciclo SEPED iniciado');
  } catch { mostrarSnack('Error al iniciar ciclo SEPED', 'error'); }
  finally { ejecutandoCicloSeped.value = false; }
};

const cargarSepedAuditoria = async () => {
  cargandoSepedAuditoria.value = true;
  try {
    const res = await axios.get(`${SEPED_API}/auditoria`);
    if (res.data.success) sepedAuditoria.value = res.data.data;
  } catch { mostrarSnack('Error al cargar auditoría SEPED', 'error'); }
  finally { cargandoSepedAuditoria.value = false; }
};

const iniciarSepedLog = () => {
  if (sepedSse) return;
  const token = localStorage.getItem('token');
  sepedSse = new EventSource(`${SEPED_API}/logs?token=${token ?? ''}`);
  sepedSseActivo.value = true;
  sepedSse.onmessage = (e) => {
    sepedLogLines.value.push(JSON.parse(e.data));
    if (sepedLogLines.value.length > 500) sepedLogLines.value.shift();
    // auto-scroll
    const el = sepedLogRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  };
  sepedSse.onerror = () => {
    sepedSseActivo.value = false;
    sepedSse?.close(); sepedSse = null;
  };
};

const detenerSepedLog = () => {
  sepedSse?.close(); sepedSse = null;
  sepedSseActivo.value = false;
};

onMounted(async () => {
  const tasks: Promise<any>[] = [cargarUsuarios(), cargarIcCfg(), cargarAuditoria(), cargarFcCfg(), cargarFcAuditoria(), cargarSepedCfg(), cargarSepedAuditoria()];
  if (authStore.esAdmin) tasks.push(cargarEstadoServidor());
  await Promise.all(tasks);
});
</script>

<style scoped>
.conexion-txt {
  background: rgb(var(--v-theme-surface-variant));
  font-family: monospace;
  white-space: pre;
  line-height: 1.8;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.seped-log {
  background: rgb(var(--v-theme-surface-variant));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
