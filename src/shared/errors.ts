import { t, type MessageKey, type TranslateParams } from './i18n';

/**
 * 可展示的错误分类。
 * 注意：errorKind 枚举必须与 docs/技术架构方案 第 5 节的失败项语义保持一致，
 * 且任何分支都不得携带 API Key 等敏感信息。
 */
export const ERROR_KINDS = [
  'not_configured',
  'network',
  'rate_limited',
  'invalid_response',
  'validation',
  'permission',
  'storage_quota',
  'user_conflict',
  'aborted',
  'unknown',
] as const;

export type ErrorKind = (typeof ERROR_KINDS)[number];

export interface ClassifiedError {
  kind: ErrorKind;
  message: string;
}

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly i18nKey: MessageKey;
  readonly params?: TranslateParams;

  constructor(kind: ErrorKind, i18nKey: MessageKey, params?: TranslateParams) {
    super(t(i18nKey, params));
    this.name = 'AppError';
    this.kind = kind;
    this.i18nKey = i18nKey;
    this.params = params;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** 将任意异常归一化为可展示错误，避免向上层抛出原始对象。 */
export function classifyError(error: unknown): ClassifiedError {
  if (isAppError(error)) {
    return { kind: error.kind, message: error.message };
  }
  if (error instanceof Error) {
    return { kind: 'unknown', message: error.message };
  }
  return { kind: 'unknown', message: String(error) };
}
