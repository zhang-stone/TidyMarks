import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ScanResult } from '@/src/shared/schemas';
import type { FolderTreeNode } from '@/entrypoints/dashboard/App';

const scan: ScanResult = {
  scanId: 'indent-regression',
  scannedAt: 1,
  roots: [{ id: 'root', title: '书签栏' }],
  folders: [
    {
      id: 'bytedance',
      parentId: 'root',
      rootId: 'root',
      title: 'bytedance',
      path: ['bytedance'],
      depth: 1,
    },
    {
      id: 'shortcuts',
      parentId: 'bytedance',
      rootId: 'root',
      title: '快捷键',
      path: ['bytedance', '快捷键'],
      depth: 2,
    },
  ],
  bookmarks: [
    {
      id: 'bookmark',
      title: '子目录书签',
      url: 'https://example.com',
      parentId: 'shortcuts',
      rootId: 'root',
      path: ['bytedance', '快捷键'],
    },
  ],
};

describe('选择范围文件夹树', () => {
  it('叶子文件夹使用 TreeView item 承载层级缩进', async () => {
    // App 模块在顶层创建 storage adapter，SSR 只需最小 API 占位。
    (globalThis as { chrome?: unknown }).chrome = {
      storage: { local: {} },
    };

    const [{ SelectPage }, { default: SelectFolderTree }] = await Promise.all([
      import('@/entrypoints/dashboard/App'),
      import('@/entrypoints/dashboard/SelectFolderTree'),
    ]);
    const shortcuts: FolderTreeNode = {
      id: 'shortcuts', name: '快捷键', children: [], bookmarkIds: ['bookmark'],
    };
    const bytedance: FolderTreeNode = {
      id: 'bytedance', name: 'bytedance', children: [shortcuts], bookmarkIds: [],
    };
    const folderTreeHtml = renderToStaticMarkup(createElement(SelectFolderTree, {
      tree: [bytedance],
      folderMap: new Map([['bytedance', bytedance], ['shortcuts', shortcuts]]),
      activeFolderId: null,
      selectedIds: null,
      onActiveFolderChange: () => undefined,
      onToggleFolder: () => undefined,
    }));
    const page = createElement(SelectPage, {
      scan,
      selectedIds: null,
      onSelect: () => undefined,
      onBack: () => undefined,
      onGenerate: () => undefined,
    });
    const html = renderToStaticMarkup(page);

    const shortcutIndex = folderTreeHtml.indexOf('快捷键');
    const leafItemIndex = folderTreeHtml.lastIndexOf('data-part="item"', shortcutIndex);
    const parentBranchIndex = folderTreeHtml.lastIndexOf('data-part="branch-control"', shortcutIndex);
    expect(shortcutIndex).toBeGreaterThan(-1);
    expect(leafItemIndex).toBeGreaterThan(parentBranchIndex);
    expect(html).toContain('保守整理');
    expect(html).toContain('重新规划目录');
    expect(html).toContain('name="organize-mode" checked="" value="conservative"');
    expect(html).toContain('文件夹命名风格');
    expect(html).toContain('图标 + 文字');
    expect(html).toContain('纯文字');
    expect(html).toContain('name="folder-name-style" checked="" value="emoji"');
  });
});
