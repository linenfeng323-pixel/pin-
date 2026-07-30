<!-- 按键捕获输入框（单独抽出 SFC，避免嵌套 script setup 的 TS 冲突） -->
<template>
  <div tabindex="0"
       class="cursor-pointer rounded-md px-3 py-2 text-sm font-mono inline-flex items-center gap-1 select-none transition-all"
       :class="[capturing ? 'ring-2 ring-blue-500' : 'hover:bg-black/5 dark:hover:bg-white/5', extraClass]"
       :style="{ minWidth: '160px', border: '1px solid var(--mac-border-strong)', background: 'var(--mac-card-bg-solid)' }"
       @click="start" @blur="finish" @keydown="onKeyDown" @keyup="finish">
    <template v-for="p in displayParts" :key="p">
      <span class="kbd">{{ p }}</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  modelValue: string;
  extraClass?: string;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void;
}>();

const capturing = ref(false);
const pressed = ref<string[]>([]);

function start() {
  capturing.value = true;
  pressed.value = [];
}
function finish() {
  if (!capturing.value) return;
  capturing.value = false;
  if (pressed.value.length) {
    emit('update:modelValue', normalizeAccel(pressed.value));
  }
  pressed.value = [];
}
function onKeyDown(e: KeyboardEvent) {
  if (!capturing.value) return;
  e.preventDefault();
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Meta');
  let code: string = e.key.length === 1 ? e.key.toUpperCase() : normalizeKey(e.code);
  const seq = [...mods];
  if (code && !seq.includes(code)) seq.push(code);
  pressed.value = seq;
}

const displayParts = computed<string[]>(() => {
  if (capturing.value && pressed.value.length) {
    return pressed.value.length ? pressed.value : ['按下组合键…'];
  }
  return props.modelValue ? props.modelValue.split('+').filter(Boolean) : ['点此按键'];
});

function normalizeKey(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return 'Digit' + code.slice(5);
  if (code === 'Space') return 'Space';
  if (code.startsWith('Arrow')) return code;
  if (/^F\d+$/.test(code)) return code;
  if (code === 'Minus') return 'Minus';
  if (code === 'Equal') return 'Equal';
  if (code === 'Escape') return 'Esc';
  return code;
}
function normalizeAccel(seq: string[]): string {
  const order = ['Ctrl','Alt','Shift','Meta'];
  const mods = seq.filter(p => order.includes(p)).sort((a,b) => order.indexOf(a) - order.indexOf(b));
  const keys = seq.filter(p => !order.includes(p));
  return [...mods, ...keys].join('+');
}
</script>
