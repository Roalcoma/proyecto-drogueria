// src/stores/useCarritoStore.ts
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { usePromocionesStore, type PromocionAplicada } from './usePromocionesStore';

// 1. Definimos los "moldes" (Interfaces) para TypeScript
export interface Cliente {
    CODCLIENTE: string | number;
    NOMBRECLIENTE?: string;
    ID?: string; // Para el CIF/RUT
    DESCUENTO?: number;  // Corresponde a CCL.D3
    DESCUENTO2?: number; // Corresponde a CCL.D4
    DESCUENTO3?: number; // Corresponde a CCL.D5
    [key: string]: any;
}

export interface Producto {
    CODARTICULO: string | number;
    DESCRIPCION?: string;
    DESCUENTOART?: number; // Descuento específico del artículo desde BD
    [key: string]: any;
}

// Un artículo del carrito ahora incluye obligatoriamente el array de descuentos
export interface ArticuloCarrito extends Producto {
    cantidad: number;
    descuentos: number[];
}

const SESSION_KEY = 'carrito_sesion';

export const useCarritoStore = defineStore('carrito', () => {
    const guardado = sessionStorage.getItem(SESSION_KEY);
    const inicial = guardado ? JSON.parse(guardado) : null;

    const clienteSeleccionado = ref<Cliente | null>(inicial?.clienteSeleccionado ?? null);
    const articulos = ref<ArticuloCarrito[]>(inicial?.articulos ?? []);
    const tasa = ref(inicial?.tasa ?? 0);
    const promocionesAplicadas = ref<PromocionAplicada[]>([]);

    watch([clienteSeleccionado, articulos, tasa], () => {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            clienteSeleccionado: clienteSeleccionado.value,
            articulos: articulos.value,
            tasa: tasa.value,
        }));
    }, { deep: true });

    // Solo descuento global del cliente. Artículos con NODTOAPLICABLE='T' no reciben ningún descuento.
    const recalcularDescuentosArticulo = (producto: Producto): number[] => {
        if (producto.NODTOAPLICABLE === 'T') return [];
        const lista: number[] = [];
        const cli = clienteSeleccionado.value;
        if (Number(cli?.DESCUENTO) > 0) lista.push(Number(cli?.DESCUENTO));
        return lista;
    };

    const recalcularPromociones = () => {
        const promoStore = usePromocionesStore();
        const { slotsPorArticulo, aplicadas } = promoStore.calcularDescuentosPromocion(articulos.value, clienteSeleccionado.value);
        promocionesAplicadas.value = aplicadas;

        articulos.value.forEach(art => {
            const clientDesc = recalcularDescuentosArticulo(art); // [descGlobal] or []
            const slots = slotsPorArticulo.get(art.CODARTICULO) ?? new Map<number, number>();

            if (slots.size === 0) {
                art.descuentos = clientDesc;
                return;
            }

            // Build descuentos[] where index i = slot (i+1)
            // Client discount wins at D1 (index 0) if present
            const maxSlot = Math.max(...slots.keys());
            const len = Math.max(clientDesc.length, maxSlot);
            const result: number[] = [];
            for (let i = 0; i < len; i++) {
                const slot = i + 1;
                if (i < clientDesc.length && clientDesc[i] > 0) {
                    result.push(clientDesc[i]);
                } else {
                    result.push(slots.get(slot) ?? 0);
                }
            }
            // Trim trailing zeros
            while (result.length > 0 && !result[result.length - 1]) result.pop();
            art.descuentos = result;
        });
    };

    const agregarArticulo = (producto: Producto, cantidad: number = 1) => {
        const existe = articulos.value.find(p => p.CODARTICULO === producto.CODARTICULO);

        const stockMax = (producto as any).stocks?.reduce((t: number, s: any) => t + s.STOCK, 0) || 0;
        if (existe) {
            const nueva = existe.cantidad + cantidad;
            existe.cantidad = stockMax > 0 ? Math.min(nueva, stockMax) : nueva;
        } else {
            articulos.value.push({
                ...producto,
                cantidad,
                descuentos: recalcularDescuentosArticulo(producto)
            });
        }
        recalcularPromociones();
    };

    /**
     * IMPORTANTE: Llama a esta función en tu CatalogoView.vue
     * justo después de asignar clienteSeleccionado.value = cliente
     */
    const actualizarDescuentosPorCliente = () => {
        recalcularPromociones();
    };

    const setTasa = (nuevaTasa: number) => {
        tasa.value = nuevaTasa;
    };

    const limpiarCarrito = () => {
        clienteSeleccionado.value = null;
        articulos.value = [];
        promocionesAplicadas.value = [];
        sessionStorage.removeItem(SESSION_KEY);
    };

    return {
        clienteSeleccionado,
        articulos,
        tasa,
        promocionesAplicadas,
        agregarArticulo,
        actualizarDescuentosPorCliente,
        recalcularPromociones,
        limpiarCarrito,
        setTasa
    };
});
