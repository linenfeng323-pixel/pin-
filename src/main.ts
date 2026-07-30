// =====================================================
// 前端入口（Vue3 + Pinia + Element Plus + 样式）
// =====================================================

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/dist/locale/zh-cn.mjs';

import App from './App.vue';
import './styles/mac-ui.css';
import './index.css'; // Tailwind（由 postcss 生成）

const app = createApp(App);
app.use(createPinia());
app.use(ElementPlus, { locale: zhCn });
app.mount('#app');
