<template>
  <div class="d-flex flex-column" :class="alignEnd ? 'align-end' : 'align-start'">
    <span :class="mainClass">$ {{ Number(usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
    <span v-if="tasa > 0" class="text-caption text-medium-emphasis" style="font-size: 0.72rem !important;">
      Bs. {{ bsVal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  usd: number;
  tasa: number;
  bs?: number;         // override computed BsD (for values stored in Bs)
  mainClass?: string;
  alignEnd?: boolean;
}>();

const bsVal = computed(() => props.bs !== undefined ? props.bs : props.usd * props.tasa);
</script>
