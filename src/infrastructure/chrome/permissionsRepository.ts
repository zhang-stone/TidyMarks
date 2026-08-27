import type { PermissionsPort } from '../../application/ports';
import { AppError } from '../../shared/errors';

/** 从 Base URL 提取精确 Origin（路径与查询不参与权限匹配）。 */
export function originPattern(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new AppError('validation', 'Base URL 格式不正确');
  }
  if (url.protocol !== 'https:') {
    throw new AppError('validation', '仅支持 HTTPS 的 API Base URL');
  }
  return `${url.origin}/*`;
}

/**
 * 权限适配：用户点击“测试连接/保存并连接”时申请 Base URL 对应 Origin；
 * 更换 Base URL 后由调用方负责移除旧 Origin。
 */
export function createPermissionsRepository(): PermissionsPort {
  return {
    async ensureOriginPermission(baseUrl) {
      const origin = originPattern(baseUrl);
      const granted = await chrome.permissions.contains({ origins: [origin] });
      if (granted) return true;
      return chrome.permissions.request({ origins: [origin] });
    },

    async removeOriginPermission(baseUrl) {
      const origin = originPattern(baseUrl);
      await chrome.permissions.remove({ origins: [origin] });
    },
  };
}
