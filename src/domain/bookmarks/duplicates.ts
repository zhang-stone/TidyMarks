import type { ScannedBookmark } from '../../shared/schemas';

export type DuplicateKind = 'same-url' | 'similar-url' | 'same-title';

export interface DuplicateGroup {
  id: string;
  kind: DuplicateKind;
  bookmarks: ScannedBookmark[];
}

function exactUrlKey(value: string): string {
  return value.trim();
}

function looseUrlKey(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `${hostname}${pathname}${url.search}`.toLowerCase();
  } catch {
    return null;
  }
}

function commonPrefixRatio(left: string, right: string): number {
  let length = 0;
  const max = Math.min(left.length, right.length);
  while (length < max && left[length] === right[length]) length += 1;
  return (2 * length) / (left.length + right.length);
}

function similarUrl(left: string, right: string): boolean {
  const a = looseUrlKey(left);
  const b = looseUrlKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.split('/')[0] === b.split('/')[0] && commonPrefixRatio(a, b) >= 0.8;
}

function normalizedTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** 按匹配置信度分组，同一个书签只进入一个分组。 */
export function findDuplicateGroups(bookmarks: ScannedBookmark[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const used = new Set<string>();

  const addBuckets = (kind: DuplicateKind, keyFor: (bookmark: ScannedBookmark) => string | null) => {
    const buckets = new Map<string, ScannedBookmark[]>();
    for (const bookmark of bookmarks) {
      if (used.has(bookmark.id)) continue;
      const key = keyFor(bookmark);
      if (!key) continue;
      const bucket = buckets.get(key) ?? [];
      bucket.push(bookmark);
      buckets.set(key, bucket);
    }
    for (const [key, bucket] of buckets) {
      if (bucket.length < 2) continue;
      bucket.forEach((bookmark) => used.add(bookmark.id));
      groups.push({ id: `${kind}:${key}`, kind, bookmarks: bucket });
    }
  };

  addBuckets('same-url', (bookmark) => exactUrlKey(bookmark.url));

  const remaining = bookmarks.filter((bookmark) => !used.has(bookmark.id));
  const visited = new Set<string>();
  for (const bookmark of remaining) {
    if (visited.has(bookmark.id)) continue;
    const component: ScannedBookmark[] = [];
    const queue = [bookmark];
    visited.add(bookmark.id);
    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      for (const candidate of remaining) {
        if (!visited.has(candidate.id) && similarUrl(current.url, candidate.url)) {
          visited.add(candidate.id);
          queue.push(candidate);
        }
      }
    }
    if (component.length > 1) {
      component.forEach((item) => used.add(item.id));
      groups.push({
        id: `similar-url:${component.map((item) => item.id).join(',')}`,
        kind: 'similar-url',
        bookmarks: component,
      });
    }
  }

  addBuckets('same-title', (bookmark) => normalizedTitle(bookmark.title) || null);
  return groups;
}
