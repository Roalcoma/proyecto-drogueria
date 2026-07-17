// src/stores/useCarritoStore.ts
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { usePromocionesStore, type PromocionAplicada } from './usePromocionesStore';

// 1. Definimos los "moldes" (Interfaces) para TypeScript
export interface Cliente {
    CODCLIENTE: string | number;
    NOMBRECLIENTE?: string;
    ID?: string;
    DESCUENTO?: number;   // CCL.D1 — descuento de cabecera
    DESCUENTO_D3?: number; // CCL.D3 — si > 0 bloquea promos de slot 3
    DESCUENTO2?: number;
    DESCUENTO3?: number;
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

    const recalcularPromociones = () => {
        const promoStore = usePromocionesStore();
        const cli = clienteSeleccionado.value;
        const { slotsPorArticulo, aplicadas } = promoStore.calcularDescuentosPromocion(articulos.value, cli);
        promocionesAplicadas.value = aplicadas;

        articulos.value.forEach(art => {
            const d4Manual = Number(art.descuentos?.[3] ?? 0); // preservar D4 manual

            if (art.NODTOAPLICABLE === 'T') {
                art.descuentos = d4Manual > 0 ? [0, 0, 0, d4Manual] : [];
                return;
            }

            const slots = slotsPorArticulo.get(art.CODARTICULO) ?? new Map<number, number>();
            const d1 = Number(cli?.DESCUENTO ?? 0);
            const d2 = slots.get(2) ?? 0;
            // D3: CCL.D3 del cliente tiene prioridad; si está vacío se aplica la promo de slot 3
            const cclD3 = Number(cli?.DESCUENTO_D3 ?? 0);
            const d3 = cclD3 > 0 ? cclD3 : (slots.get(3) ?? 0);

            const result = [d1, d2, d3, d4Manual];
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
            articulos.value.push({ ...producto, cantidad, descuentos: [] });
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
