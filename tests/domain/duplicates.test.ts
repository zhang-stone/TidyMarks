import { describe, expect, it } from 'vitest';
import { findDuplicateGroups } from '@/src/domain/bookmarks/duplicates';
import type { ScannedBookmark } from '@/src/shared/schemas';

function bookmark(id: string, title: string, url: string): ScannedBookmark {
  return { id, title, url, parentId: '1', rootId: '1', path: [] };
}

describe('findDuplicateGroups', () => {
  it('按相同网址、相似网址、相同标题的优先级分组且不重复收录', () => {
    const groups = findDuplicateGroups([
      bookmark('1', 'GitHub', 'https://github.com'),
      bookmark('2', 'GitHub old', 'https://github.com'),
      bookmark('3', 'Notion', 'https://notion.so'),
      bookmark('4', 'Notion workspace', 'https://www.notion.so/'),
      bookmark('5', 'Figma', 'https://figma.com'),
      bookmark('6', ' figma ', 'https://example.com/design'),
    ]);

    expect(groups.map((group) => group.kind)).toEqual(['same-url', 'similar-url', 'same-title']);
    expect(groups.map((group) => group.bookmarks.map((item) => item.id))).toEqual([
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
    ]);
  });

  it('不会把同一域名下差异明显的页面判为相似', () => {
    const groups = findDuplicateGroups([
      bookmark('1', 'Issues', 'https://github.com/openai/codex/issues'),
      bookmark('2', 'Settings', 'https://github.com/settings/profile'),
    ]);
    expect(groups).toEqual([]);
  });
});
