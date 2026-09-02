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
      throw new AppError('aborted', 'errors.aborted');
    }
    throw new AppError('unknown', 'errors.messagingUnreachable');
  }

  const parsed = ResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new AppError('unknown', 'errors.unknownResponse');
  }
  if (!parsed.data.ok) {
    // 后台抛出的 AppError 已在 Service Worker 侧完成本地化，直接透传文案并保留分类。
    const error = new AppError(parsed.data.error.kind, 'errors.unknownResponse');
    error.message = parsed.data.error.message;
    throw error;
  }
  return parsed.data.payload;
}
