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
      runtime: { id: 'test-extension' },
    };

    const [{ SelectPage, PreviewPage, buildFolderTree, collectAllFolderIds, bookmarksInSelectedFolders, toggleFolderSelection }, { default: SelectFolderTree }] = await Promise.all([
      import('@/entrypoints/dashboard/App'),
      import('@/entrypoints/dashboard/SelectFolderTree'),
    ]);
    const shortcuts: FolderTreeNode = {
      id: 'shortcuts', name: '快捷键', children: [], bookmarkIds: ['bookmark'],
    };
    const bytedance: FolderTreeNode = {
      id: 'bytedance', name: 'bytedance', children: [shortcuts], bookmarkIds: [],
    };
    const empty: FolderTreeNode = {
      id: 'empty', name: '空目录', children: [], bookmarkIds: [],
    };
    const folderTreeHtml = renderToStaticMarkup(createElement(SelectFolderTree, {
      tree: [bytedance, empty],
      folderMap: new Map([['bytedance', bytedance], ['shortcuts', shortcuts], ['empty', empty]]),
      activeFolderId: null,
      selectedFolderIds: null,
      onActiveFolderChange: () => undefined,
      onToggleFolder: () => undefined,
    }));
    const page = createElement(SelectPage, {
      scan,
      selectedFolderIds: null,
      onSelectFolders: () => undefined,
      onBack: () => undefined,
      onGenerate: () => undefined,
    });
    const html = renderToStaticMarkup(page);

    const shortcutIndex = folderTreeHtml.indexOf('快捷键');
    const leafItemIndex = folderTreeHtml.lastIndexOf('data-part="item"', shortcutIndex);
    const parentBranchIndex = folderTreeHtml.lastIndexOf('data-part="branch-control"', shortcutIndex);
    expect(shortcutIndex).toBeGreaterThan(-1);
    expect(leafItemIndex).toBeGreaterThan(parentBranchIndex);
    expect(folderTreeHtml).toContain('空目录');
    expect(folderTreeHtml).toContain('type="checkbox"');
    expect(html).toContain('保守整理');
    expect(html).toContain('重新规划目录');
    expect(html).toContain('name="organize-mode" checked="" value="conservative"');
    expect(html).toContain('文件夹命名风格');
    expect(html).toContain('图标 + 文字');
    expect(html).toContain('纯文字');
    expect(html).toContain('name="folder-name-style" checked="" value="emoji"');

    const builtTree = buildFolderTree({
      ...scan,
      folders: [
        ...scan.folders,
        {
          id: 'empty',
          parentId: 'root',
          rootId: 'root',
          title: '空目录',
          path: ['空目录'],
          depth: 1,
        },
      ],
    });
    expect(builtTree.flatMap(collectAllFolderIds)).toContain('empty');
    expect(bookmarksInSelectedFolders(scan, new Set(['shortcuts'])).map((item) => item.id))
      .toEqual(['bookmark']);
    expect(bookmarksInSelectedFolders(scan, new Set(['bytedance']))).toEqual([]);

    const allFolderIds = ['bytedance', 'shortcuts', 'empty'];
    const withoutBytedance = toggleFolderSelection(null, allFolderIds, bytedance);
    expect([...withoutBytedance]).toEqual(['empty']);
    const shortcutsOnly = toggleFolderSelection(withoutBytedance, allFolderIds, shortcuts);
    expect([...shortcutsOnly].sort()).toEqual(['empty', 'shortcuts']);

    const previewHtml = renderToStaticMarkup(createElement(PreviewPage, {
      assignments: [{ bookmarkId: 'bookmark', targetPath: ['开发'] }],
      scan,
      selectedFolderCount: 2,
      bookmarksById: new Map([['bookmark', scan.bookmarks[0]!]]),
      onBack: () => undefined,
      onApply: () => undefined,
    }));
    expect(previewHtml).toContain('书签仅供查看');
    expect(previewHtml).toContain('应用方案并清理空目录');
    expect(previewHtml).not.toContain('点击书签');
  });
});
