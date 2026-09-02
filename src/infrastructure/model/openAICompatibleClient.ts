import type { ChatMessage, ModelPort } from '../../application/ports';
import { AppError } from '../../shared/errors';
import type { ModelSettings } from '../../shared/schemas';

/** 429 / 5xx 的自动重试次数上限（架构方案第 6.2 节：最多自动重试两次）。 */
export const MAX_AUTO_RETRIES = 2;

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AppError('aborted', 'errors.aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** 响应体摘要：截断且不含请求头，避免泄露 API Key。 */
function summarizeBody(body: string): string {
  return body.replace(/\s+/g, ' ').slice(0, 200);
}

/**
 * OpenAI-compatible Chat Completions 客户端。
 * 由 Dashboard 直接向用户配置的 API 发起，不经过任何项目服务器（架构方案第 6.1 节）。
 */
export function createOpenAICompatibleClient(
  settings: ModelSettings,
  fetchImpl: typeof fetch = fetch,
): ModelPort {
  const endpoint = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  async function requestOnce(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages,
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
        signal: signal ?? null,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (signal?.aborted) throw new AppError('aborted', 'errors.aborted');
      throw new AppError('network', 'errors.networkCheckBaseUrl');
    }

    if (response.ok) {
      const data = (await response.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        throw new AppError('invalid_response', 'errors.emptyContent');
      }
      return content;
    }

    const body = await response.text().catch(() => '');
    const detail = summarizeBody(body);
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw new RateLimitedError(Number.isFinite(retryAfter) ? retryAfter : null, detail);
    }
    if (response.status >= 500) {
      throw new ServerError(response.status, detail);
    }
    if (response.status === 401 || response.status === 403) {
      throw new AppError('permission', 'errors.authFailed', { status: response.status });
    }
    throw new AppError('invalid_response', 'errors.httpError', { status: response.status, detail });
  }

  return {
    async chat(messages, signal) {
      let attempt = 0;
      for (;;) {
        try {
          return await requestOnce(messages, signal);
        } catch (error) {
          const retryable = error instanceof RateLimitedError || error instanceof ServerError;
          if (!retryable || attempt >= MAX_AUTO_RETRIES) {
            if (error instanceof RateLimitedError) {
              throw new AppError('rate_limited', 'errors.rateLimited');
            }
            if (error instanceof ServerError) {
              throw new AppError('network', 'errors.serverError', { status: error.status });
            }
            throw error;
          }
          const delay =
            error instanceof RateLimitedError && error.retryAfterSeconds !== null
              ? error.retryAfterSeconds * 1000
              : 1000 * 2 ** attempt; // 指数退避
          await sleep(delay, signal);
          attempt += 1;
        }
      }
    },
  };
}

class RateLimitedError extends Error {
  constructor(
    readonly retryAfterSeconds: number | null,
    detail: string,
  ) {
    super(`HTTP 429 ${detail}`);
  }
}

class ServerError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`HTTP ${status} ${detail}`);
  }
}

/**
 * 从模型文本中提取 JSON 对象：容忍 ```json 代码围栏与首尾噪声文本。
 */
export function extractJsonObject(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? content.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new AppError('invalid_response', 'errors.invalidJson');
    }
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      throw new AppError('invalid_response', 'errors.invalidJson');
    }
  }
}
