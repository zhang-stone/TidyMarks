import { AppError } from '../../shared/errors';
import { ResponseSchema, type RequestMessage } from '../../shared/messages';

/**
 * Dashboard 侧消息客户端：向 Service Worker 发送命令并校验响应。
 * 响应错误统一转为 AppError，保证 UI 只处理可展示的错误分类。
 */
export async function sendRequest(request: RequestMessage): Promise<unknown> {
  let response: unknown;
  try {
    response = await chrome.runtime.sendMessage(request);
  } catch (error) {
    if (error instanceof Error && error.message.includes('cancel')) {
      throw new AppError('aborted', '请求已取消');
    }
    throw new AppError('unknown', '无法联系后台服务，请重新打开扩展页面');
  }

  const parsed = ResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new AppError('unknown', '后台服务返回了无法识别的响应');
  }
  if (!parsed.data.ok) {
    throw new AppError(parsed.data.error.kind, parsed.data.error.message);
  }
  return parsed.data.payload;
}
