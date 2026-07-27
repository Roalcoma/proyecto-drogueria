export interface VersionEntry {
  version: string;
  fecha: string;
  desde: string; // commits desde esta fecha pertenecen a esta versión
}

export const APP_VERSION = '1.2.5';

// Ordenadas de más nueva a más antigua.
// Un commit pertenece a la versión cuyo "desde" sea <= fecha del commit
// y sea la más reciente que cumpla esa condición.
export const VERSIONES: VersionEntry[] = [
  { version: '1.2.5', fecha: '2026-07-27', desde: '2026-07-25' },
  { version: '1.2.4', fecha: '2026-07-24', desde: '2026-07-20' },
  { version: '1.2.3', fecha: '2026-07-19', desde: '2026-07-13' },
  { version: '1.2.2', fecha: '2026-07-12', desde: '2026-07-06' },
  { version: '1.2.1', fecha: '2026-07-05', desde: '2026-06-20' },
  { version: '1.2.0', fecha: '2026-06-19', desde: '2020-01-01' },
];
