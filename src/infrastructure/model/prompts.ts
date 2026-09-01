import type { ChatMessage } from '../../application/ports';
import type { FolderNameStyle, ScannedBookmark } from '../../shared/schemas';
import { bookmarkFeatureLine, MAX_TOP_LEVEL_FOLDERS } from '../../domain/organize/plan';

/**
 * 大模型提示词。约束：
 * - 输出仅为 JSON 对象；
 * - 目录最多两级；
 * - 分配阶段只允许返回 bookmarkId / targetPath / reason（架构方案第 6.3 节）。
 */

function systemPrompt(folderNameStyle: FolderNameStyle): string {
  const namingRule =
    folderNameStyle === 'emoji'
      ? '每个目录名必须以一个语义匹配的 emoji 开头，格式如“💻 开发工具”，让目录便于一眼辨认。'
      : '目录名只使用文字，不要包含 emoji 或其他图标，保持简洁。';
  return [
    '你是一个浏览器书签整理助手，负责把用户的书签分类到清晰的目录体系。',
    '只输出 JSON 对象，不要输出任何解释性文字。',
    '目录名使用书签内容的主要语言，简短、具体、可数；不要使用“其他”“杂项”这类兜底目录，除非确实无法归类。',
    namingRule,
    '目录路径最多两级（["一级"] 或 ["一级","二级"]）。',
    `一级目录总数是硬性上限，绝对不能超过 ${MAX_TOP_LEVEL_FOLDERS} 个；超出时优先合并语义相近的一级目录，或把较窄的一级目录降为其他一级目录的二级目录。`,
  ].join('\n');
}

export function taxonomyBatchPrompt(
  bookmarks: ScannedBookmark[],
  existingFolderNames: string[],
  folderNameStyle: FolderNameStyle = 'text',
): ChatMessage[] {
  const lines = bookmarks.map(bookmarkFeatureLine).join('\n');
  return [
    { role: 'system', content: systemPrompt(folderNameStyle) },
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

export function taxonomyMergePrompt(
  candidates: string[][],
  folderNameStyle: FolderNameStyle = 'text',
): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt(folderNameStyle) },
    {
      role: 'user',
      content: [
        '下面是从多批书签样本中收集到的候选目录（可能有大量语义重复）：',
        JSON.stringify(candidates),
        '',
        '请合并为一套统一、互斥、不冗余的目录体系，路径最多两级。合并规则：',
        '1. 语义相近或指向同一主题的目录必须合并为一个，只保留一个最简洁、最通用的名称，其余全部丢弃。',
        '   例如“开发工具/编程工具/程序员工具”合并为“开发工具”；“AI/人工智能/AIGC”合并为“人工智能”；',
        '   “学习/教程/教育资源”合并为“学习资源”。同义词、缩写、单复数、中英文表达相同概念的都视为重复。',
        '2. 合并只针对“同一层级、含义等价”的目录；父目录与其子目录是包含关系，不是重复，禁止把子目录合并进父目录，',
        '   也禁止把父目录降级成子目录。例如“开发工具”与“开发工具/前端”必须都保留，不能合并；',
        '   二级目录之间是否重复，要在同一个一级目录下判断。',
        '3. 命名风格保持一致；不要出现两个名字不同但含义相同的目录。',
        '4. 去掉几乎无人会用的、过于冷门或过于宽泛的目录。',
        `5. 一级目录总数绝对不能超过 ${MAX_TOP_LEVEL_FOLDERS} 个；超出时继续合并语义相近的一级目录，或把较窄的一级目录降为其他一级目录的二级目录。`,
        '输出 JSON：{"categories": [["一级目录"], ["一级目录","二级目录"]]}',
      ].join('\n'),
    },
  ];
}

/**
 * 当合并结果的一级目录数量仍超过上限时，让模型进一步收敛。
 * 只做“减少一级目录数量”的定向压缩，保留原有二级层级关系。
 */
export function taxonomyReducePrompt(
  categories: string[][],
  topLevelNames: string[],
  folderNameStyle: FolderNameStyle = 'text',
): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt(folderNameStyle) },
    {
      role: 'user',
      content: [
        '下面这套目录体系的一级目录太多了：',
        JSON.stringify(categories),
        `当前一级目录共有 ${topLevelNames.length} 个：${JSON.stringify(topLevelNames)}。`,
        `请把一级目录压缩到不超过 ${MAX_TOP_LEVEL_FOLDERS} 个。压缩方式：`,
        '1. 合并语义相近的一级目录，只保留一个最通用的名称；',
        '2. 或把范围较窄的一级目录，降级为某个更通用一级目录下的二级目录；',
        '3. 不要丢失原有内容覆盖面，尽量让每个原目录都能在新体系里找到归属；',
        '4. 父子层级是包含关系，不是重复，不要把二级目录并回其父目录。',
        '输出 JSON：{"categories": [["一级目录"], ["一级目录","二级目录"]]}',
      ].join('\n'),
    },
  ];
}

export function assignmentBatchPrompt(
  taxonomy: string[][],
  bookmarks: ScannedBookmark[],
  folderNameStyle: FolderNameStyle = 'text',
): ChatMessage[] {
  const lines = bookmarks.map(bookmarkFeatureLine).join('\n');
  return [
    { role: 'system', content: systemPrompt(folderNameStyle) },
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
