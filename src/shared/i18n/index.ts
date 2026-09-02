import zhCN from './zh-CN';
import en from './en';
import type { LanguageOption, Locale, Messages } from './types';

export type { Locale, Messages, LanguageOption } from './types';

/** 语言下拉项；与业务逻辑解耦，描述文案所在文件单一来源。 */
export const SUPPORTED_LOCALES: LanguageOption[] = [
  { value: 'zh-CN', flag: '🇨🇳', shortLabel: '中文', optionLabel: '中文' },
  { value: 'en', flag: '🇺🇸', shortLabel: 'EN', optionLabel: 'English' },
];

const DICTS: Record<Locale, Messages> = {
  'zh-CN': zhCN,
  en,
};

type ParamValue = string | number;
export type TranslateParams = Record<string, ParamValue>;

function detectLocale(): Locale {
  try {
    const lang = chrome.i18n.getUILanguage();
    return lang.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
  } catch {
    return 'zh-CN';
  }
}

let currentLocale: Locale = detectLocale();

type LocaleListener = (locale: Locale) => void;
const localeListeners = new Set<LocaleListener>();

function notifyLocaleChange(): void {
  for (const listener of localeListeners) {
    listener(currentLocale);
  }
}

function setCurrentLocale(locale: Locale, silent?: boolean): void {
  if (currentLocale === locale) return;
  currentLocale = locale;
  if (!silent) notifyLocaleChange();
}

export function getLocale(): Locale {
  return currentLocale;
}

/** 订阅语言变化；返回取消订阅函数。 */
export function onLocaleChange(listener: LocaleListener): () => void {
  localeListeners.add(listener);
  return () => {
    localeListeners.delete(listener);
  };
}

const LOCALE_STORAGE_KEY = 'tidymarks.locale';

function normalizeLocale(value: string | undefined): Locale | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('en')) return 'en';
  return undefined;
}

function getChromeStorage(): typeof chrome.storage.local | undefined {
  try {
    return typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : undefined;
  } catch {
    return undefined;
  }
}

/** 异步从 chrome.storage 读一次语言覆盖，命中则切换；可幂等调用。 */
export async function bootstrapLocaleFromStorage(): Promise<void> {
  const storage = getChromeStorage();
  if (!storage) return;
  try {
    const values = await storage.get(LOCALE_STORAGE_KEY);
    const stored = normalizeLocale(values?.[LOCALE_STORAGE_KEY] as string | undefined);
    if (stored) setCurrentLocale(stored);
  } catch (error) {
    console.warn('[i18n] 读取语言覆盖失败', error);
  }
}

/** 永久切换语言：先立即生效，再写 chrome.storage.local 持久化。 */
export async function setLocale(locale: Locale): Promise<void> {
  setCurrentLocale(locale);
  const storage = getChromeStorage();
  if (!storage) return;
  try {
    await storage.set({ [LOCALE_STORAGE_KEY]: locale });
  } catch (error) {
    console.warn('[i18n] 持久化语言失败', error);
  }
}

/** 清除手动语言覆盖，回退到浏览器 UI 语言。 */
export async function resetLocaleToSystem(): Promise<void> {
  const storage = getChromeStorage();
  if (storage) {
    try {
      await storage.remove(LOCALE_STORAGE_KEY);
    } catch (error) {
      console.warn('[i18n] 清除语言覆盖失败', error);
    }
  }
  setCurrentLocale(detectLocale());
}

// 模块加载后立即异步 bootstrap 一次，UI 会渲染两次：首次用浏览器语言，bootstrap 切到持久化语言。
// 若两者一致 setCurrentLocale 不会触发监听器，因此无开销。
void bootstrapLocaleFromStorage();

/** 仅测试使用：切换语言并返回还原函数。 */
export function setLocaleForTesting(locale: Locale): () => void {
  const previous = currentLocale;
  currentLocale = locale;
  return () => {
    currentLocale = previous;
  };
}

type Path<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Path<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Path<Messages>;

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

function lookup(dict: Messages, key: MessageKey): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * 按当前语言取文案，支持 {name} 占位符。
 * 缺失键时回退简体中文并告警，避免界面出现空白。
 */
export function t(key: MessageKey, params?: TranslateParams): string {
  const hit = lookup(DICTS[currentLocale], key);
  if (hit !== undefined) return interpolate(hit, params);
  const fallback = lookup(DICTS['zh-CN'], key);
  if (fallback !== undefined) {
    console.warn(`[i18n] missing key "${key}" for locale "${currentLocale}", fallback to zh-CN`);
    return interpolate(fallback, params);
  }
  console.warn(`[i18n] missing key "${key}"`);
  return key;
}
