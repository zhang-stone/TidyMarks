import { useMemo } from 'react';
import { ChakraProvider, TreeView, createTreeCollection, defaultSystem } from '@chakra-ui/react';
import type { FolderTreeNode } from './App';

export interface SelectFolderTreeProps {
  tree: FolderTreeNode[];
  folderMap: Map<string, FolderTreeNode>;
  activeFolderId: string | null;
  selectedFolderIds: Set<string> | null;
  onActiveFolderChange: (id: string) => void;
  onToggleFolder: (node: FolderTreeNode) => void;
}

const FolderIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <path d="M1 4a1 1 0 0 1 1-1h3.586L7 4.414A1 1 0 0 0 7.707 4.7L8 5H14a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z" fill="var(--color-icon-brand-subtle)" stroke="var(--color-icon-brand)" strokeWidth="0.6" />
  </svg>
);

function collectFolderIds(node: FolderTreeNode): string[] {
  return [node.id, ...node.children.flatMap(collectFolderIds)];
}

function countBookmarks(node: FolderTreeNode): number {
  return node.bookmarkIds.length + node.children.reduce(
    (total, child) => total + countBookmarks(child),
    0,
  );
}

export default function SelectFolderTree(props: SelectFolderTreeProps) {
  const collection = useMemo(() => createTreeCollection({
    rootNode: { id: 'root', name: 'Root', children: props.tree, bookmarkIds: [] },
    nodeToValue: (node) => node.id,
    nodeToString: (node) => node.name,
  }), [props.tree]);

  const expandedIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (nodes: FolderTreeNode[]) => {
      for (const node of nodes) {
        if (node.children.length > 0) {
          ids.push(node.id);
          walk(node.children);
        }
      }
    };
    walk(props.tree);
    return ids;
  }, [props.tree]);

  const checkState = (node: FolderTreeNode): 'all' | 'some' | 'none' => {
    const ids = collectFolderIds(node);
    if (!props.selectedFolderIds) return 'all';
    const selected = ids.filter((id) => props.selectedFolderIds!.has(id)).length;
    if (selected === ids.length) return 'all';
    return selected > 0 ? 'some' : 'none';
  };

  return (
    <ChakraProvider value={defaultSystem}>
      <TreeView.Root collection={collection} defaultExpandedValue={expandedIds} size="sm">
        <TreeView.Tree>
          <TreeView.Node
            render={({ node, nodeState }) => {
              const folder = props.folderMap.get(node.id);
              if (!folder) return null;
              const bookmarkCount = countBookmarks(folder);
              const state = checkState(folder);
              const content = (
                <>
                  {nodeState.isBranch ? (
                    <TreeView.BranchIndicator className="folder-tree-arrow"><span>▾</span></TreeView.BranchIndicator>
                  ) : <span className="folder-tree-arrow-spacer" />}
                  <FolderIcon />
                  {nodeState.isBranch ? (
                    <TreeView.BranchText className="folder-tree-name">{node.name}</TreeView.BranchText>
                  ) : (
                    <TreeView.ItemText className="folder-tree-name">{node.name}</TreeView.ItemText>
                  )}
                  <span className="folder-tree-count">{bookmarkCount}</span>
                  <input
                    type="checkbox"
                    className="folder-tree-checkbox"
                    checked={state !== 'none'}
                    ref={(element) => { if (element) element.indeterminate = state === 'some'; }}
                    onChange={(event) => { event.stopPropagation(); props.onToggleFolder(folder); }}
                    onClick={(event) => event.stopPropagation()}
                  />
                </>
              );

              return nodeState.isBranch ? (
                <TreeView.BranchControl
                  className={`folder-tree-row ${props.activeFolderId === node.id ? 'active' : ''}`}
                  onClick={(event) => { event.stopPropagation(); props.onActiveFolderChange(node.id); }}
                >
                  {content}
                </TreeView.BranchControl>
              ) : (
                <TreeView.Item
                  className={`folder-tree-row folder-tree-leaf ${props.activeFolderId === node.id ? 'active' : ''}`}
                  onClick={() => props.onActiveFolderChange(node.id)}
                >
                  {content}
                </TreeView.Item>
              );
            }}
          />
        </TreeView.Tree>
      </TreeView.Root>
    </ChakraProvider>
  );
}
