import { ref, watch } from 'vue';

/**
 * Ref para el tamaño de página que persiste en sessionStorage.
 * key: identificador único por tabla (ej. 'pedidos-estatus').
 */
export function usePageSize(key: string, defaultSize = 10) {
    const stored = parseInt(sessionStorage.getItem(`psize:${key}`) ?? '', 10);
    const size = ref(Number.isNaN(stored) ? defaultSize : stored);
    watch(size, val => sessionStorage.setItem(`psize:${key}`, String(val)));
    return size;
}
