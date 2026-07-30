/// <reference types="vite/client" />
declare module 'element-plus/dist/locale/zh-cn.mjs' {
  const locale: any;
  export default locale;
}
declare module '@element-plus/icons-vue' {
  export const UploadFilled: any;
  export const Upload: any;
}
declare module '@tauri-apps/plugin-clipboard-manager' {
  export function readText(): Promise<string>;
  export function writeText(s: string): Promise<void>;
  export function readImage(): Promise<{ bytes: Uint8Array; kind?: string } | null>;
  export function hasImage(): Promise<boolean>;
}
