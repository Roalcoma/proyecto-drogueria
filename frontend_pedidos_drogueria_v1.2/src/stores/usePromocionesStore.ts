import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';
import type { ArticuloCarrito, Cliente } from './useCarritoStore';

const API = `${import.meta.env.VITE_API_URL}/promociones`;

export interface PromocionVigente {
    id: number;
    nombre: string;
    base: 'UNIDADES' | 'MONTO';
    alcanceCliente: 'TODOS' | 'INCLUIR_GRUPO' | 'EXCLUIR_GRUPO';
    criterioTipo: 'ARTICULOS' | 'PROVEEDOR_MARCA';
    codigosArticulo: number[];
    codigosCliente: number[];
    codigosClienteExcluir: number[];
    escalas: { minimo: number; maximo: number | null; porcentaje: number }[];
    slotDescuento: number; // 1=D1, 2=D2, 3=D3
}

export interface PromocionAplicada {
    idPromocion: number;
    nombre: string;
    porcentaje: number;
    base: number;
}

export const usePromocionesStore = defineStore('promociones', () => {
    const vigentes = ref<PromocionVigente[]>([]);

    const cargarVigentes = async () => {
        try {
            const res = await axios.get(`${API}/vigentes`);
            if (res.data.success) vigentes.value = res.data.data;
        } catch {
            vigentes.value = [];
        }
    };

    const clienteCalifica = (promo: PromocionVigente, cliente: Cliente | null): boolean => {
        const cod = cliente ? Number(cliente.CODCLIENTE) : null;
        const excluido = cod !== null && (promo.codigosClienteExcluir ?? []).includes(cod);
        if (promo.alcanceCliente === 'TODOS') return !excluido;
        if (cod === null) return false;
        return promo.codigosCliente.includes(cod) && !excluido;
    };

    const precioBase = (item: ArticuloCarrito): number =>
        (item.prices && item.prices.length > 0) ? parseFloat(item.prices[0].PNETO) : 0;

    /**
     * Devuelve, por CODARTICULO, los porcentajes de descuento indexados por slot (1=D1, 2=D2, 3=D3).
     * Si dos promos compiten por el mismo slot en el mismo artículo, gana la primera.
     */
    const calcularDescuentosPromocion = (
        articulos: ArticuloCarrito[],
        cliente: Cliente | null
    ): { slotsPorArticulo: Map<string | number, Map<number, number>>; aplicadas: PromocionAplicada[] } => {
        const slotsPorArticulo = new Map<string | number, Map<number, number>>();
        const aplicadas: PromocionAplicada[] = [];

        for (const promo of vigentes.value) {
            if (!clienteCalifica(promo, cliente)) continue;
            const slot = promo.slotDescuento ?? 2;
            if (slot !== 2 && slot !== 3) continue;

            const itemsDelGrupo = articulos.filter(a => promo.codigosArticulo.includes(Number(a.CODARTICULO)));
            if (itemsDelGrupo.length === 0) continue;

            if (promo.criterioTipo === 'PROVEEDOR_MARCA') {
                // Escala calculada sobre el TOTAL agregado de todos los artículos del grupo
                const baseTotal = promo.base === 'UNIDADES'
                    ? itemsDelGrupo.reduce((s, a) => s + a.cantidad, 0)
                    : itemsDelGrupo.reduce((s, a) => s + precioBase(a) * a.cantidad, 0);

                const tramo = promo.escalas.find(e => baseTotal >= e.minimo && (e.maximo === null || baseTotal <= e.maximo));
                if (!tramo || tramo.porcentaje <= 0) continue;

                for (const item of itemsDelGrupo) {
                    const artSlots = slotsPorArticulo.get(item.CODARTICULO) ?? new Map<number, number>();
                    if (!artSlots.has(slot)) {
                        artSlots.set(slot, tramo.porcentaje);
                        slotsPorArticulo.set(item.CODARTICULO, artSlots);
                    }
                }
                aplicadas.push({ idPromocion: promo.id, nombre: promo.nombre, porcentaje: tramo.porcentaje, base: baseTotal });
            } else {
                let promoRegistrada = false;
                for (const item of itemsDelGrupo) {
                    const base = promo.base === 'UNIDADES'
                        ? item.cantidad
                        : precioBase(item) * item.cantidad;

                    const tramo = promo.escalas.find(e => base >= e.minimo && (e.maximo === null || base <= e.maximo));
                    if (!tramo || tramo.porcentaje <= 0) continue;

                    const artSlots = slotsPorArticulo.get(item.CODARTICULO) ?? new Map<number, number>();
                    if (!artSlots.has(slot)) {
                        artSlots.set(slot, tramo.porcentaje);
                        slotsPorArticulo.set(item.CODARTICULO, artSlots);
                    }
                    if (!promoRegistrada) {
                        aplicadas.push({ idPromocion: promo.id, nombre: promo.nombre, porcentaje: tramo.porcentaje, base });
                        promoRegistrada = true;
                    }
                }
            }
        }

        return { slotsPorArticulo, aplicadas };
    };

    return { vigentes, cargarVigentes, calcularDescuentosPromocion };
});
