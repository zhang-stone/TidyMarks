import type { ChatMessage } from '../../application/ports';
import type { ScannedBookmark } from '../../shared/schemas';
import { bookmarkFeatureLine } from '../../domain/organize/plan';

/**
 * 大模型提示词。约束：
 * - 输出仅为 JSON 对象；
 * - 目录最多两级；
 * - 分配阶段只允许返回 bookmarkId / targetPath / reason（架构方案第 6.3 节）。
 */

const SYSTEM = [
  '你是一个浏览器书签整理助手，负责把用户的书签分类到清晰的目录体系。',
  '只输出 JSON 对象，不要输出任何解释性文字。',
  '目录名使用书签内容的主要语言，简短、具体、可数；不要使用“其他”“杂项”这类兜底目录，除非确实无法归类。',
  '目录路径最多两级（["一级"] 或 ["一级","二级"]）。',
].join('\n');

export function taxonomyBatchPrompt(
  bookmarks: ScannedBookmark[],
  existingFolderNames: string[],
): ChatMessage[] {
  const lines = bookmarks.map(bookmarkFeatureLine).join('\n');
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: [
        existingFolderNames.length > 0
          ? `用户已有的目录名：${JSON.stringify(existingFolderNames)}。可以复用或改进。`
          : '',
        '下面是用户书签的一批样本（id / title / domain / currentPath）：',
        lines,
        '',
        '请给出这批书签体现的候选分类目录。输出 JSON：',
        '{"candidates": [["一级目录"], ["一级目录","二级目录"]]}',
      ].join('\n'),
    },
  ];
}

export function taxonomyMergePrompt(candidates: string[][]): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: [
        '下面是从多批书签样本中收集到的候选目录：',
        JSON.stringify(candidates),
        '',
        '请合并为一套统一、互斥、不冗余的目录体系，路径最多两级。',
        '语义相近的目录合并为一个；去掉几乎无人会用的目录。',
        '输出 JSON：{"categories": [["一级目录"], ["一级目录","二级目录"]]}',
      ].join('\n'),
    },
  ];
}

export function assignmentBatchPrompt(
  taxonomy: string[][],
  bookmarks: ScannedBookmark[],
): ChatMessage[] {
  const lines = bookmarks.map(bookmarkFeatureLine).join('\n');
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: [
        '固定目录体系如下，只能从中选择：',
        JSON.stringify(taxonomy),
        '',
        '请为下面每条书签选择一个最合适的目录（必须逐字来自上面的体系）：',
        lines,
        '',
        '输出 JSON：{"assignments": [{"bookmarkId": "<书签id>", "targetPath": ["一级","二级"], "reason": "<一句话原因>"}]}',
        '每条书签恰好出现一次；不要输出目录体系之外的路径。',
      ].join('\n'),
    },
  ];
}

/**
 * 保守整理只允许模型从每条书签所在 Chrome 根目录的现有路径中选择。
 * 按 bookmarkId 提供白名单，避免模型跨系统根目录或臆造新目录。
 */
export function conservativeAssignmentBatchPrompt(
  existingPathsByRoot: ReadonlyMap<string, readonly string[][]>,
  bookmarks: ScannedBookmark[],
): ChatMessage[] {
  const lines = bookmarks.map(bookmarkFeatureLine).join('\n');
  const bookmarkRoots = Object.fromEntries(
    bookmarks.map((bookmark) => [bookmark.id, bookmark.rootId]),
  );
  const batchRootIds = new Set(bookmarks.map((bookmark) => bookmark.rootId));
  const allowedTargetsByRoot = Object.fromEntries(
    [...batchRootIds].map((rootId) => [rootId, existingPathsByRoot.get(rootId) ?? []]),
  );
  return [
    {
      role: 'system',
      content: [
        '你是一个浏览器书签整理助手。当前使用保守整理模式。',
        '只输出 JSON 对象，不要输出任何解释性文字。',
        '必须保持用户现有目录结构，只能从给定的已有目录路径中选择，禁止新建或改写目录。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '下面是书签（id / title / domain / currentPath）：',
        lines,
        '',
        '书签所属的系统根目录如下（仅用于匹配允许列表）：',
        JSON.stringify(bookmarkRoots),
        '每个系统根目录允许使用的已有目录路径如下：',
        JSON.stringify(allowedTargetsByRoot),
        '',
        '请为每条书签选择最合适的已有目录，targetPath 必须逐字来自其系统根目录的允许列表。',
        '输出 JSON：{"assignments": [{"bookmarkId": "<书签id>", "targetPath": ["已有目录路径"], "reason": "<一句话原因>"}]}',
        '每条书签恰好出现一次；不要输出允许列表以外的路径。',
      ].join('\n'),
    },
  ];
}
