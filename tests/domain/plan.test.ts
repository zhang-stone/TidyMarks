import { describe, expect, it } from 'vitest';
import {
  dedupeTaxonomy,
  normalizeTargetPath,
  sanitizeFolderName,
  validateAssignmentBatch,
  bookmarkDomain,
} from '@/src/domain/organize/plan';

describe('sanitizeFolderName', () => {
  it('清理控制字符并折叠空白', () => {
    expect(sanitizeFolderName('  a\u0000b\u0001  c ')).toBe('ab c');
  });

  it('超长名称截断到 100 字符', () => {
    expect(sanitizeFolderName('a'.repeat(150)).length).toBe(100);
  });
});

describe('normalizeTargetPath', () => {
  it('去掉空段并保留前两级', () => {
    expect(normalizeTargetPath(['', 'A', 'B', 'C'])).toEqual(['A', 'B']);
  });

  it('清理后为空返回 null', () => {
    expect(normalizeTargetPath([' ', '\u0007'])).toBeNull();
  });
});

describe('dedupeTaxonomy', () => {
  it('不区分大小写去重且保留首个写法', () => {
    expect(dedupeTaxonomy([['Dev'], ['dev'], ['DEV']])).toEqual([['Dev']]);
  });

  it('一级与二级视为不同路径', () => {
    expect(dedupeTaxonomy([['A'], ['A', 'B']])).toEqual([['A'], ['A', 'B']]);
  });
});

describe('validateAssignmentBatch', () => {
  const allowed = new Set(['1', '2', '3']);

  it('合法项通过并清理路径', () => {
    const { valid, rejected } = validateAssignmentBatch(
      [{ bookmarkId: '1', targetPath: [' a ', 'b'] }],
      allowed,
    );
    expect(valid).toEqual([{ bookmarkId: '1', targetPath: ['a', 'b'] }]);
    expect(rejected).toHaveLength(0);
  });

  it('未知书签 / 重复目标 / 非法路径进入 rejected', () => {
    const { valid, rejected } = validateAssignmentBatch(
      [
        { bookmarkId: '9', targetPath: ['A'] },
        { bookmarkId: '2', targetPath: ['A'] },
        { bookmarkId: '2', targetPath: ['A'] },
        { bookmarkId: '3', targetPath: [] },
      ],
      allowed,
    );
    expect(valid).toHaveLength(1);
    expect(rejected.map((r) => r.reason)).toEqual(['unknown_bookmark', 'duplicate_target', 'invalid_path']);
  });
});

describe('bookmarkDomain', () => {
  it('提取 hostname，非法 URL 返回空串', () => {
    expect(bookmarkDomain('https://example.com/path')).toBe('example.com');
    expect(bookmarkDomain('not-a-url')).toBe('');
  });
});
