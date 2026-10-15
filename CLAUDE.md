# CLAUDE.md — APP Pedidos Droguería Intercontinental

App web de toma, control y autorización de pedidos de la droguería, montada sobre la base SQL Server del ERP **ICG**. Un backend Express (puerto 9010) sirve la API y el frontend Vue compilado; además corre integraciones automáticas (e-commerce, iCompras, FTP, Farcompras, Seped, reporte IMS, monitor de stock).

Documentación completa: @docs/DOCUMENTACION.md

## Comandos

```bash
# Backend (backend_pedidos_drogueria_v1.2/)
npm run dev          # nodemon + ts-node
npm run build        # tsc → dist/
npm start            # node dist/index.js (producción)

# Frontend (frontend_pedidos_drogueria_v1.2/)
npm run dev          # Vite
npm run build-only   # compila dist/ (usar este; `npm run build` falla por type-check heredado)
```

No hay tests automáticos. Para verificar: `npx tsc --noEmit` en el backend y `npm run build-only` en el frontend.

## Mapa de arquitectura

| Archivo | Rol |
|---|---|
| `backend…/src/index.ts` | Arranque: rutas, SPA estático, `initTablas()` de cada servicio, schedulers, cierre ordenado |
| `backend…/src/routers/*.router.ts` | Rutas + permisos (`authMiddleware`, `adminMiddleware`, `requiereBits`) |
| `backend…/src/controllers/` → `services/` | Validación HTTP → lógica + SQL (`mssql`) |
| `backend…/src/services/pedidos.service.ts` | Núcleo: crear/editar, montos, partición P/SD/NI/PE-, estatus, `bloquearStock` |
| `backend…/src/services/promociones.service.ts` | Promociones, grupos, escalas |
| `backend…/src/services/{ecommerce,icompras,ftp,farcompras,seped,ims-email,stockMonitor}.service.ts` | Integraciones y jobs |
| `backend…/src/services/rutero.service.ts` | Rutero/picking (base `dbRutero`) |
| `backend…/src/services/actualizador.service.ts` | Actualizar desde GitHub, backups, rollback, NSSM |
| `backend…/src/services/auth.service.ts` | Login, JWT, `MODULOS_SISTEMA` (bits de permisos) |
| `backend…/src/middleware/auth.middleware.ts` | `BITS`, `requiereBits`, `tieneBit` |
| `backend…/src/db/db.conection.ts` | Pools prod/pruebas/rutero; `connectDb()` elige según `X-Modo-Pruebas` |
| `backend…/src/services/dbconfig.service.ts` | `config/connections.json` (prioridad) → `.env` |
| `frontend…/src/router/index.ts` | Rutas + guardia por módulos |
| `frontend…/src/stores/useAuthStore.ts` | Token, cabeceras axios, modo pruebas |
| `frontend…/src/pages/*View.vue` | Una vista por módulo |
| `frontend…/src/data/changelog.ts` | `APP_VERSION`, `VERSIONES`, `COMMITS` |

## Convenciones

- **Cada cambio** sube `APP_VERSION` y agrega entrada en `VERSIONES` y `COMMITS` de `changelog.ts`.
- Commits: `tipo(versión o área): descripción` → `fix(v1.2.43): …`, `feat(stock): …`.
- Si cambia el frontend, **recompilar** (`npm run build-only`) y commitear `frontend…/dist/`: se versiona y es lo que instala el actualizador.
- Lecturas de ICG siempre `WITH (NOLOCK)`. Todo lo que reserve stock va en transacción con `PedidosServices.bloquearStock(tx)`.
- Montos, descuentos, stock y permisos se deciden **en el servidor**; lo que manda el navegador es propuesta.
- Tablas nuevas: `APP_*`, creadas en `initTablas()` con `IF NOT EXISTS` (solo cambios aditivos, para que el rollback no rompa la base).
- Esquema con `process.env.DB_ESQUEMA || 'dbo'` (constante `ESQ`/`esquema` en cada servicio).
- Permiso nuevo: agregar en `MODULOS_SISTEMA` (auth.service.ts), en `BITS` si se usa en backend, y en la ruta del router del frontend.
- Código, comentarios y mensajes en español.

## Trampas

- Una **copia de la base de producción** trae integraciones activas (carpeta e-commerce, Seped con credenciales reales, SMTP). Antes de arrancar el backend en local, desactivarlas (SQL en docs §12).
- `PENDIENTE → PENDIENTE POR AUTORIZACION` es donde se reserva stock; no se puede autorizar directo desde `PENDIENTE`. Es intencional.
- `NODTOAPLICABLE` es BIT: comparar con `1`, no con `'T'`.
- `mssql.Date` con UTC desplaza un día: las conexiones usan `useUTC: false` y `TZ=America/Caracas`.
- Express 5: el callback de `listen` recibe el error si el puerto falla; no arrancar schedulers en ese caso.
- `ORDERID` tiene longitud máxima: respetar prefijos cortos (`F`, `FC`, `EC-`, sufijos `P`, `SD`, `NI`, `-1`).
- Vuetify 4: selección de tablas con `v-model` + `return-object` (no `v-model:selected`).
- El actualizador **no compila** el backend ni corre `npm install`.
- La app sí escribe en ICG: `CABECERA_PED`, `LINEA_PED`, `VENDEDORES`, `CLIENTESCAMPOSLIBRES` (D1/D3), `ARTICULOSCAMPOSLIBRES` (DTOARTICULO), `FACTURASVENTACAMPOSLIBRES`, `[RIP].[METAS_VENDEDORES]`. Nada más.
- `db.general.conection.ts`, `init.general.sql` y `login.router.ts` son legado sin uso.

## Qué NO hacer

- No subir `config/connections.json`, `.env`, `impresion_facturas/settings.cfg` ni copiar sus valores a docs o código.
- No mover lógica de stock/montos al frontend.
- No usar `git add .`: hay `dist/`, snapshots y archivos locales; agregar rutas explícitas.
- No borrar ni editar `_backups/` / `_restore_tmp/` (son del actualizador).
- No hacer `ALTER`/`DROP` destructivos sobre tablas `APP_*` ni tocar estructura de tablas ICG.
- No ejecutar ciclos de Seped/iCompras/IMS contra producción para "probar".
