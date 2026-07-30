// =====================================================
// 全局辅助：Element Plus Message / MessageBox 等统一封装
// 任何 SFC 只需要 import { ElMessage, ElMessageBox } from '@/global'
// =====================================================

import { ElMessage as EM, ElMessageBox as EMB } from 'element-plus';

export const ElMessage = EM;
export const ElMessageBox = EMB;

/** 确认弹窗：带 Mac 风格按钮类名 */
export async function confirmYes(
  message: string,
  title = '确认操作',
  opt?: Partial<Parameters<typeof EMB.confirm>[2]>
): Promise<boolean> {
  try {
    await EMB.confirm(message, title, {
      type: 'warning',
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      confirmButtonClass: 'mac-btn mac-btn-primary !px-5',
      cancelButtonClass: 'mac-btn !px-5',
      ...(opt ?? {}),
    });
    return true;
  } catch {
    return false;
  }
}
