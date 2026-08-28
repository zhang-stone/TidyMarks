import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import type { ScanResult } from '@/src/shared/schemas';

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

    const { SelectPage } = await import('@/entrypoints/dashboard/App');
    const page = createElement(SelectPage, {
      scan,
      selectedIds: null,
      onSelect: () => undefined,
      onBack: () => undefined,
      onGenerate: () => undefined,
    });
    const html = renderToStaticMarkup(
      createElement(ChakraProvider, { value: defaultSystem, children: page }),
    );

    const shortcutIndex = html.indexOf('快捷键');
    const leafItemIndex = html.lastIndexOf('data-part="item"', shortcutIndex);
    const parentBranchIndex = html.lastIndexOf('data-part="branch-control"', shortcutIndex);
    expect(shortcutIndex).toBeGreaterThan(-1);
    expect(leafItemIndex).toBeGreaterThan(parentBranchIndex);
  });
});
