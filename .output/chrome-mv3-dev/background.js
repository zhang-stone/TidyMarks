var background = (function() {
	//#region node_modules/wxt/dist/utils/define-background.mjs
	function defineBackground(arg) {
		if (arg == null || typeof arg === "function") return { main: arg };
		return arg;
	}
	//#endregion
	//#region src/domain/bookmarks/types.ts
	function isFolder(node) {
		return node.url === void 0;
	}
	function isUnmodifiable(node) {
		return node.unmodifiable !== void 0 && node.unmodifiable !== false;
	}
	//#endregion
	//#region src/domain/bookmarks/tree.ts
	/**
	* 识别 Chrome 系统根目录（书签栏 / 其他书签 / 移动设备书签等）。
	* 不硬编码根目录 ID：getTree() 顶层节点的直接子节点即为系统根目录（带 folderType），
	* 若顶层本身已是多个节点则取所有无 parentId 的节点。
	*/
	function identifyRoots(tree) {
		if (tree.length === 1 && tree[0]?.children?.length) {
			const top = tree[0];
			const children = top.children;
			if (!top.parentId && children && children.every((c) => isFolder(c))) return children;
		}
		return tree.filter((n) => !n.parentId && isFolder(n));
	}
	/**
	* 将书签树扁平化为一次一致的扫描结果。
	* - 以节点 ID 为内部主键，不以标题或 URL 作身份标识；
	* - 跳过不可修改节点及其整个子树（架构方案第 7 节）。
	*/
	function buildScanResult(tree, scanId, scannedAt = Date.now()) {
		const roots = identifyRoots(tree).map((r) => ({
			id: r.id,
			title: r.title
		}));
		const rootIds = new Set(roots.map((r) => r.id));
		const folders = [];
		const bookmarks = [];
		const walk = (node, ctx) => {
			for (const child of node.children ?? []) {
				if (isUnmodifiable(child)) continue;
				if (isFolder(child)) {
					const folderPath = [...ctx.path, child.title];
					folders.push({
						id: child.id,
						parentId: node.id,
						rootId: ctx.rootId,
						title: child.title,
						path: folderPath,
						depth: ctx.depth + 1
					});
					walk(child, {
						rootId: ctx.rootId,
						path: folderPath,
						depth: ctx.depth + 1
					});
				} else bookmarks.push({
					id: child.id,
					title: child.title,
					url: child.url ?? "",
					parentId: node.id,
					rootId: ctx.rootId,
					path: ctx.path
				});
			}
		};
		for (const root of identifyRoots(tree)) {
			if (!rootIds.has(root.id)) continue;
			walk(root, {
				rootId: root.id,
				path: [],
				depth: 0
			});
		}
		return {
			scanId,
			scannedAt,
			roots,
			folders,
			bookmarks
		};
	}
	//#endregion
	//#region src/domain/organize/stateMachine.ts
	/**
	* 任务状态机（架构方案第 5 节）。
	* failed 之后允许重新开始扫描，也允许从持久化游标重试失败的应用（MVP 执行结果页的“重试”入口）；
	* undone/partially_undone 为终态或允许重试撤销。
	*/
	var TRANSITIONS = {
		idle: ["scanning"],
		scanning: ["planning", "failed"],
		planning: ["classifying", "failed"],
		classifying: ["reviewing", "failed"],
		reviewing: ["applying", "scanning"],
		applying: [
			"completed",
			"interrupted",
			"failed"
		],
		interrupted: ["applying", "undoing"],
		completed: ["undoing"],
		undoing: [
			"undone",
			"partially_undone",
			"failed"
		],
		undone: ["scanning"],
		partially_undone: ["undoing", "scanning"],
		failed: ["scanning", "applying"]
	};
	function canTransition(from, to) {
		return TRANSITIONS[from].includes(to);
	}
	var IllegalTransitionError = class extends Error {
		from;
		to;
		constructor(from, to) {
			super(`非法任务状态迁移: ${from} -> ${to}`);
			this.from = from;
			this.to = to;
			this.name = "IllegalTransitionError";
		}
	};
	function assertTransition(from, to) {
		if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
	}
	/** 同一时间只允许一个会修改书签的任务：这两个状态期间拒绝新的应用请求。 */
	function isWriteLocked(status) {
		return status === "applying" || status === "undoing";
	}
	//#endregion
	//#region src/application/scanBookmarks.ts
	/**
	* 扫描整棵书签树并持久化一次一致的结果。
	* 由 Service Worker 调用；Dashboard 通过消息触发。
	*/
	async function scanBookmarks(deps, job) {
		const { storage, bookmarks, events } = deps;
		const now = deps.now ?? (() => Date.now());
		const newId = deps.newId ?? (() => crypto.randomUUID());
		assertTransition(job.status, "scanning");
		const working = {
			...job,
			status: "scanning",
			updatedAt: now()
		};
		await storage.saveJob(working);
		const scan = buildScanResult(await bookmarks.getTree(), newId(), now());
		await storage.saveScan(scan);
		const done = {
			...working,
			status: "planning",
			updatedAt: now()
		};
		await storage.saveJob(done);
		events?.progress(done.jobId, done.status, scan.bookmarks.length, scan.bookmarks.length);
		return scan;
	}
	//#endregion
	//#region src/shared/errors.ts
	/**
	* 可展示的错误分类。
	* 注意：errorKind 枚举必须与 docs/技术架构方案 第 5 节的失败项语义保持一致，
	* 且任何分支都不得携带 API Key 等敏感信息。
	*/
	var ERROR_KINDS = [
		"not_configured",
		"network",
		"rate_limited",
		"invalid_response",
		"validation",
		"permission",
		"storage_quota",
		"user_conflict",
		"aborted",
		"unknown"
	];
	var AppError = class extends Error {
		kind;
		constructor(kind, message) {
			super(message);
			this.name = "AppError";
			this.kind = kind;
		}
	};
	function isAppError(error) {
		return error instanceof AppError;
	}
	/** 将任意异常归一化为可展示错误，避免向上层抛出原始对象。 */
	function classifyError(error) {
		if (isAppError(error)) return {
			kind: error.kind,
			message: error.message
		};
		if (error instanceof Error) return {
			kind: "unknown",
			message: error.message
		};
		return {
			kind: "unknown",
			message: String(error)
		};
	}
	//#endregion
	//#region src/application/applyPlan.ts
	/**
	* 一键应用（架构方案第 8 节）。Service Worker 是唯一调用入口。
	*
	* 顺序：
	* 1. 建立任务锁（applying）；
	* 2. 基于最新书签状态构建撤销快照（每条待移动书签的 id / parentId / index）；
	* 3. 按路径逐级解析或创建目录（按 parentId + title 查找保证幂等）；
	* 4. 顺序 move，每条成功即更新游标与 appliedIds；单条失败入列继续；
	* 5. 完成置 completed 并展示失败与重试入口。
	*
	* 中断恢复：同一 jobId 重复进入时跳过已 applied 的书签，从持久化游标继续。
	*/
	async function applyPlan(deps, job, bookmarks, assignments) {
		const { storage, events } = deps;
		const now = deps.now ?? (() => Date.now());
		if (isWriteLocked(job.status) && job.status !== "applying") throw new Error(`当前任务状态为 ${job.status}，无法开始应用`);
		if (job.status !== "applying") assertTransition(job.status, "applying");
		const byId = new Map(bookmarks.map((b) => [b.id, b]));
		const ordered = [];
		for (const assignment of assignments) {
			const bookmark = byId.get(assignment.bookmarkId);
			if (bookmark) ordered.push({
				bookmark,
				assignment
			});
		}
		let working = {
			...job,
			status: "applying",
			updatedAt: now(),
			failures: job.status === "applying" ? job.failures : []
		};
		await storage.saveJob(working);
		const fresh = /* @__PURE__ */ new Map();
		const missing = /* @__PURE__ */ new Set();
		for (const { bookmark } of ordered) {
			if (working.appliedIds.includes(bookmark.id)) continue;
			const node = await deps.bookmarks.get(bookmark.id);
			if (!node || node.url === void 0) {
				missing.add(bookmark.id);
				continue;
			}
			fresh.set(bookmark.id, {
				parentId: node.parentId ?? "",
				index: node.index ?? 0
			});
		}
		const existingFailures = working.failures.filter((f) => f.bookmarkId === void 0);
		for (const id of missing) existingFailures.push({
			bookmarkId: id,
			kind: "validation",
			message: "书签已不存在，跳过"
		});
		working = {
			...working,
			failures: existingFailures
		};
		const undoExisting = await storage.loadUndo();
		const moves = undoExisting && undoExisting.jobId === job.jobId ? [...undoExisting.moves] : [];
		const knownMoveIds = new Set(moves.map((m) => m.bookmarkId));
		for (const { bookmark } of ordered) {
			if (working.appliedIds.includes(bookmark.id)) continue;
			if (knownMoveIds.has(bookmark.id)) continue;
			const pos = fresh.get(bookmark.id);
			if (!pos) continue;
			moves.push({
				bookmarkId: bookmark.id,
				fromParentId: pos.parentId,
				fromIndex: pos.index,
				toFolderId: ""
			});
		}
		const childrenByParent = /* @__PURE__ */ new Map();
		const createdFolders = undoExisting && undoExisting.jobId === job.jobId ? [...undoExisting.createdFolders] : [];
		const createdIds = new Set(createdFolders.map((f) => f.id));
		const folderCache = /* @__PURE__ */ new Map();
		const resolveFolder = async (rootId, path) => {
			const key = `${rootId}|${path.map((s) => s.toLowerCase()).join(" ")}`;
			const cached = folderCache.get(key);
			if (cached) return {
				rootId,
				folderId: cached
			};
			let parentId = rootId;
			let depth = 0;
			for (const segment of path) {
				depth += 1;
				const children = childrenByParent.get(parentId) ?? await deps.bookmarks.getChildren(parentId);
				childrenByParent.set(parentId, children);
				const hit = children.find((c) => c.url === void 0 && c.title.toLowerCase() === segment.toLowerCase());
				if (hit) parentId = hit.id;
				else {
					const created = await deps.bookmarks.createFolder(parentId, segment);
					const node = {
						id: created.id,
						parentId,
						title: segment
					};
					childrenByParent.set(created.id, []);
					const siblings = childrenByParent.get(parentId) ?? [];
					siblings.push(node);
					childrenByParent.set(parentId, siblings);
					if (!createdIds.has(created.id)) {
						createdIds.add(created.id);
						createdFolders.push({
							id: created.id,
							depth
						});
					}
					parentId = created.id;
				}
			}
			folderCache.set(key, parentId);
			return {
				rootId,
				folderId: parentId
			};
		};
		const resolvedTargets = /* @__PURE__ */ new Map();
		for (const { bookmark, assignment } of ordered) {
			if (working.appliedIds.includes(bookmark.id) || missing.has(bookmark.id)) continue;
			const target = await resolveFolder(bookmark.rootId, assignment.targetPath);
			resolvedTargets.set(bookmark.id, target);
			const move = moves.find((m) => m.bookmarkId === bookmark.id);
			if (move) move.toFolderId = target.folderId;
			working = {
				...working,
				createdFolderIds: createdFolders.map((f) => f.id),
				updatedAt: now()
			};
			await storage.saveJob(working);
		}
		const snapshot = {
			jobId: job.jobId,
			createdAt: now(),
			moves: moves.filter((m) => m.toFolderId.length > 0),
			createdFolders
		};
		await storage.saveUndo(snapshot);
		const failures = [...working.failures];
		const total = ordered.length;
		let processed = 0;
		for (const { bookmark } of ordered) {
			processed += 1;
			if ((await storage.loadJob())?.cancelRequested) {
				const interrupted = {
					...working,
					status: "interrupted",
					cancelRequested: true,
					updatedAt: now()
				};
				await storage.saveJob(interrupted);
				events?.interrupted(interrupted);
				return {
					job: interrupted,
					appliedIds: interrupted.appliedIds,
					failures: interrupted.failures
				};
			}
			if (working.appliedIds.includes(bookmark.id)) {
				events?.progress(job.jobId, "applying", processed, total);
				continue;
			}
			if (missing.has(bookmark.id)) continue;
			const target = resolvedTargets.get(bookmark.id);
			if (!target) continue;
			const current = await deps.bookmarks.get(bookmark.id);
			if (!current) {
				failures.push({
					bookmarkId: bookmark.id,
					kind: "validation",
					message: "书签在应用过程中被删除"
				});
				continue;
			}
			if (current.parentId === target.folderId) {
				working = {
					...working,
					appliedIds: [...working.appliedIds, bookmark.id],
					applyCursor: processed,
					updatedAt: now()
				};
				await storage.saveJob(working);
				events?.progress(job.jobId, "applying", processed, total);
				continue;
			}
			try {
				await deps.bookmarks.move(bookmark.id, { parentId: target.folderId });
				working = {
					...working,
					appliedIds: [...working.appliedIds, bookmark.id],
					applyCursor: processed,
					updatedAt: now()
				};
				await storage.saveJob(working);
			} catch (error) {
				const classified = classifyError(error);
				failures.push({
					bookmarkId: bookmark.id,
					kind: classified.kind,
					message: classified.message
				});
				working = {
					...working,
					failures,
					applyCursor: processed,
					updatedAt: now()
				};
				await storage.saveJob(working);
			}
			events?.progress(job.jobId, "applying", processed, total);
		}
		const completed = {
			...working,
			failures,
			status: "completed",
			updatedAt: now()
		};
		await storage.saveJob(completed);
		events?.completed(completed);
		return {
			job: completed,
			appliedIds: completed.appliedIds,
			failures
		};
	}
	//#endregion
	//#region src/domain/undo/snapshot.ts
	/**
	* 判定一条快照记录是否应恢复（架构方案第 9 节）：
	* 书签当前仍在本次应用的目标目录时才恢复；
	* 已被用户再次移动或已删除则跳过并报冲突，不覆盖用户的新操作。
	*/
	function decideRestore(move, currentBookmark, parentExists) {
		if (!currentBookmark) return {
			action: "skip",
			move,
			reason: "bookmark_missing"
		};
		if (!parentExists) return {
			action: "skip",
			move,
			reason: "parent_missing"
		};
		if (currentBookmark.parentId !== move.toFolderId) return {
			action: "skip",
			move,
			reason: "moved_by_user"
		};
		return {
			action: "restore",
			move
		};
	}
	/**
	* 恢复顺序：按原 parentId 分组，组内按原 index 升序移回，
	* 使目录内的相对顺序尽量恢复到应用前状态。
	*/
	function orderRestores(moves) {
		const groups = /* @__PURE__ */ new Map();
		for (const move of moves) {
			const group = groups.get(move.fromParentId);
			if (group) group.push(move);
			else groups.set(move.fromParentId, [move]);
		}
		const ordered = [];
		for (const group of groups.values()) ordered.push(...[...group].sort((a, b) => a.fromIndex - b.fromIndex));
		return ordered;
	}
	/**
	* 新建目录的删除顺序：按深度从深到浅。
	* 只删除空目录由调用方逐条确认；排序保证子目录先于父目录被检查。
	*/
	function orderFoldersForDeletion(createdFolders) {
		return [...createdFolders].sort((a, b) => b.depth - a.depth).map((f) => f.id);
	}
	//#endregion
	//#region src/application/undoLastApply.ts
	var CONFLICT_REASONS = {
		moved_by_user: "书签已被再次移动，跳过以不覆盖用户的新操作",
		bookmark_missing: "书签已删除，无法恢复",
		parent_missing: "原父目录已不存在，无法恢复"
	};
	/**
	* 一键撤销最近一次整理（架构方案第 9 节）。Service Worker 是唯一调用入口。
	*
	* 1. 仅处理快照 moves 中成功移动过的书签；
	* 2. 每条先判定可恢复性（仍在本次应用的目标目录才恢复；用户二次移动、
	*    已删除或原父目录不存在则跳过并报冲突，不覆盖用户的新操作）；
	* 3. 恢复顺序：按原 parentId 分组、组内按原 index 升序移回；
	* 4. 恢复后将本次新建目录按深度从深到浅删除，但只删除空目录；
	* 5. 有冲突时状态为 partially_undone，保留快照供用户重试。
	*/
	async function undoLastApply(deps, job) {
		const { storage, events, bookmarks } = deps;
		const now = deps.now ?? (() => Date.now());
		if (isWriteLocked(job.status)) throw new Error(`当前任务状态为 ${job.status}，无法开始撤销`);
		assertTransition(job.status, "undoing");
		const snapshot = await storage.loadUndo();
		if (!snapshot || snapshot.jobId !== job.jobId) throw new Error("没有可用于撤销的最近一次整理快照");
		let working = {
			...job,
			status: "undoing",
			updatedAt: now(),
			cancelRequested: false
		};
		await storage.saveJob(working);
		const conflicts = [];
		let cancelled = false;
		const decisions = [];
		for (const move of snapshot.moves) {
			const current = await bookmarks.get(move.bookmarkId);
			const originalParent = await bookmarks.get(move.fromParentId);
			const parentExists = originalParent !== void 0 && originalParent.url === void 0;
			decisions.push(decideRestore(move, current, parentExists));
		}
		for (const decision of orderRestores(decisions.filter((d) => d.action === "restore").map((d) => d.move))) {
			if ((await storage.loadJob())?.cancelRequested) {
				cancelled = true;
				break;
			}
			try {
				await bookmarks.move(decision.bookmarkId, {
					parentId: decision.fromParentId,
					index: decision.fromIndex
				});
			} catch (error) {
				const classified = classifyError(error);
				conflicts.push({
					bookmarkId: decision.bookmarkId,
					kind: classified.kind,
					message: `恢复失败：${classified.message}`
				});
			}
		}
		for (const decision of decisions) {
			if (decision.action !== "skip") continue;
			conflicts.push({
				bookmarkId: decision.move.bookmarkId,
				kind: "user_conflict",
				message: CONFLICT_REASONS[decision.reason]
			});
		}
		for (const folderId of orderFoldersForDeletion(snapshot.createdFolders)) {
			if (cancelled) break;
			try {
				if ((await bookmarks.getChildren(folderId)).length === 0) await bookmarks.removeTree(folderId);
			} catch {}
		}
		if (cancelled) conflicts.push({
			kind: "user_conflict",
			message: "已按用户请求中断撤销，可重新发起撤销"
		});
		const final = {
			...working,
			status: conflicts.length > 0 ? "partially_undone" : "undone",
			failures: conflicts,
			updatedAt: now()
		};
		await storage.saveJob(final);
		if (conflicts.length > 0) events?.failed(final);
		else events?.completed(final);
		return {
			job: final,
			conflicts
		};
	}
	//#endregion
	//#region src/application/resumeJob.ts
	/**
	* Dashboard 重开后的状态恢复（架构方案第 12 节）：
	* 通过 GET_STATUS 拉齐 job / scan / plan / undo 快照，重建界面所需的一切，
	* 不依赖长连接或内存状态。
	*/
	async function resumeJob(deps) {
		const [job, scan, plan, undo] = await Promise.all([
			deps.storage.loadJob(),
			deps.storage.loadScan(),
			deps.storage.loadPlan(),
			deps.storage.loadUndo()
		]);
		const currentJob = job ?? {
			jobId: crypto.randomUUID(),
			status: "idle",
			updatedAt: Date.now(),
			applyCursor: 0,
			appliedIds: [],
			createdFolderIds: [],
			cancelRequested: false,
			failures: []
		};
		const jobMatches = (record) => record !== null && record.jobId === currentJob.jobId;
		return {
			job: currentJob,
			scan,
			hasUndoSnapshot: undo !== null && jobMatches(undo),
			plan: plan && jobMatches(plan) ? plan : null,
			canResumeApply: currentJob.status === "interrupted" || currentJob.status === "applying",
			canResumePlanning: plan !== null && jobMatches(plan) && plan.phase !== "done" && (currentJob.status === "planning" || currentJob.status === "classifying" || currentJob.status === "failed" || currentJob.status === "reviewing")
		};
	}
	//#endregion
	//#region src/infrastructure/chrome/bookmarksRepository.ts
	/** chrome.bookmarks 的适配实现。 */
	function createBookmarksRepository() {
		return {
			async getTree() {
				return await chrome.bookmarks.getTree();
			},
			async get(id) {
				try {
					return (await chrome.bookmarks.get(id))[0] ?? void 0;
				} catch {
					return;
				}
			},
			async getChildren(parentId) {
				try {
					return await chrome.bookmarks.getChildren(parentId);
				} catch {
					return [];
				}
			},
			async createFolder(parentId, title) {
				return { id: (await chrome.bookmarks.create({
					parentId,
					title
				})).id };
			},
			async move(id, destination) {
				await chrome.bookmarks.move(id, destination);
			},
			async removeTree(id) {
				await chrome.bookmarks.removeTree(id);
			}
		};
	}
	//#endregion
	//#region node_modules/zod/v3/helpers/util.js
	var util;
	(function(util) {
		util.assertEqual = (_) => {};
		function assertIs(_arg) {}
		util.assertIs = assertIs;
		function assertNever(_x) {
			throw new Error();
		}
		util.assertNever = assertNever;
		util.arrayToEnum = (items) => {
			const obj = {};
			for (const item of items) obj[item] = item;
			return obj;
		};
		util.getValidEnumValues = (obj) => {
			const validKeys = util.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
			const filtered = {};
			for (const k of validKeys) filtered[k] = obj[k];
			return util.objectValues(filtered);
		};
		util.objectValues = (obj) => {
			return util.objectKeys(obj).map(function(e) {
				return obj[e];
			});
		};
		util.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
			const keys = [];
			for (const key in object) if (Object.prototype.hasOwnProperty.call(object, key)) keys.push(key);
			return keys;
		};
		util.find = (arr, checker) => {
			for (const item of arr) if (checker(item)) return item;
		};
		util.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
		function joinValues(array, separator = " | ") {
			return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
		}
		util.joinValues = joinValues;
		util.jsonStringifyReplacer = (_, value) => {
			if (typeof value === "bigint") return value.toString();
			return value;
		};
	})(util || (util = {}));
	var objectUtil;
	(function(objectUtil) {
		objectUtil.mergeShapes = (first, second) => {
			return {
				...first,
				...second
			};
		};
	})(objectUtil || (objectUtil = {}));
	var ZodParsedType = util.arrayToEnum([
		"string",
		"nan",
		"number",
		"integer",
		"float",
		"boolean",
		"date",
		"bigint",
		"symbol",
		"function",
		"undefined",
		"null",
		"array",
		"object",
		"unknown",
		"promise",
		"void",
		"never",
		"map",
		"set"
	]);
	var getParsedType = (data) => {
		switch (typeof data) {
			case "undefined": return ZodParsedType.undefined;
			case "string": return ZodParsedType.string;
			case "number": return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
			case "boolean": return ZodParsedType.boolean;
			case "function": return ZodParsedType.function;
			case "bigint": return ZodParsedType.bigint;
			case "symbol": return ZodParsedType.symbol;
			case "object":
				if (Array.isArray(data)) return ZodParsedType.array;
				if (data === null) return ZodParsedType.null;
				if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") return ZodParsedType.promise;
				if (typeof Map !== "undefined" && data instanceof Map) return ZodParsedType.map;
				if (typeof Set !== "undefined" && data instanceof Set) return ZodParsedType.set;
				if (typeof Date !== "undefined" && data instanceof Date) return ZodParsedType.date;
				return ZodParsedType.object;
			default: return ZodParsedType.unknown;
		}
	};
	//#endregion
	//#region node_modules/zod/v3/ZodError.js
	var ZodIssueCode = util.arrayToEnum([
		"invalid_type",
		"invalid_literal",
		"custom",
		"invalid_union",
		"invalid_union_discriminator",
		"invalid_enum_value",
		"unrecognized_keys",
		"invalid_arguments",
		"invalid_return_type",
		"invalid_date",
		"invalid_string",
		"too_small",
		"too_big",
		"invalid_intersection_types",
		"not_multiple_of",
		"not_finite"
	]);
	var ZodError = class ZodError extends Error {
		get errors() {
			return this.issues;
		}
		constructor(issues) {
			super();
			this.issues = [];
			this.addIssue = (sub) => {
				this.issues = [...this.issues, sub];
			};
			this.addIssues = (subs = []) => {
				this.issues = [...this.issues, ...subs];
			};
			const actualProto = new.target.prototype;
			if (Object.setPrototypeOf) Object.setPrototypeOf(this, actualProto);
			else this.__proto__ = actualProto;
			this.name = "ZodError";
			this.issues = issues;
		}
		format(_mapper) {
			const mapper = _mapper || function(issue) {
				return issue.message;
			};
			const fieldErrors = { _errors: [] };
			const processError = (error) => {
				for (const issue of error.issues) if (issue.code === "invalid_union") issue.unionErrors.map(processError);
				else if (issue.code === "invalid_return_type") processError(issue.returnTypeError);
				else if (issue.code === "invalid_arguments") processError(issue.argumentsError);
				else if (issue.path.length === 0) fieldErrors._errors.push(mapper(issue));
				else {
					let curr = fieldErrors;
					let i = 0;
					while (i < issue.path.length) {
						const el = issue.path[i];
						if (!(i === issue.path.length - 1)) curr[el] = curr[el] || { _errors: [] };
						else {
							curr[el] = curr[el] || { _errors: [] };
							curr[el]._errors.push(mapper(issue));
						}
						curr = curr[el];
						i++;
					}
				}
			};
			processError(this);
			return fieldErrors;
		}
		static assert(value) {
			if (!(value instanceof ZodError)) throw new Error(`Not a ZodError: ${value}`);
		}
		toString() {
			return this.message;
		}
		get message() {
			return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
		}
		get isEmpty() {
			return this.issues.length === 0;
		}
		flatten(mapper = (issue) => issue.message) {
			const fieldErrors = {};
			const formErrors = [];
			for (const sub of this.issues) if (sub.path.length > 0) {
				const firstEl = sub.path[0];
				fieldErrors[firstEl] = fieldErrors[firstEl] || [];
				fieldErrors[firstEl].push(mapper(sub));
			} else formErrors.push(mapper(sub));
			return {
				formErrors,
				fieldErrors
			};
		}
		get formErrors() {
			return this.flatten();
		}
	};
	ZodError.create = (issues) => {
		return new ZodError(issues);
	};
	//#endregion
	//#region node_modules/zod/v3/locales/en.js
	var errorMap = (issue, _ctx) => {
		let message;
		switch (issue.code) {
			case ZodIssueCode.invalid_type:
				if (issue.received === ZodParsedType.undefined) message = "Required";
				else message = `Expected ${issue.expected}, received ${issue.received}`;
				break;
			case ZodIssueCode.invalid_literal:
				message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
				break;
			case ZodIssueCode.unrecognized_keys:
				message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
				break;
			case ZodIssueCode.invalid_union:
				message = `Invalid input`;
				break;
			case ZodIssueCode.invalid_union_discriminator:
				message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
				break;
			case ZodIssueCode.invalid_enum_value:
				message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
				break;
			case ZodIssueCode.invalid_arguments:
				message = `Invalid function arguments`;
				break;
			case ZodIssueCode.invalid_return_type:
				message = `Invalid function return type`;
				break;
			case ZodIssueCode.invalid_date:
				message = `Invalid date`;
				break;
			case ZodIssueCode.invalid_string:
				if (typeof issue.validation === "object") {
					if ("includes" in issue.validation) {
						message = `Invalid input: must include "${issue.validation.includes}"`;
						if (typeof issue.validation.position === "number") message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
					} else if ("startsWith" in issue.validation) message = `Invalid input: must start with "${issue.validation.startsWith}"`;
					else if ("endsWith" in issue.validation) message = `Invalid input: must end with "${issue.validation.endsWith}"`;
					else util.assertNever(issue.validation);
				} else if (issue.validation !== "regex") message = `Invalid ${issue.validation}`;
				else message = "Invalid";
				break;
			case ZodIssueCode.too_small:
				if (issue.type === "array") message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
				else if (issue.type === "string") message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
				else if (issue.type === "number") message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
				else if (issue.type === "bigint") message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
				else if (issue.type === "date") message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
				else message = "Invalid input";
				break;
			case ZodIssueCode.too_big:
				if (issue.type === "array") message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
				else if (issue.type === "string") message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
				else if (issue.type === "number") message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
				else if (issue.type === "bigint") message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
				else if (issue.type === "date") message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
				else message = "Invalid input";
				break;
			case ZodIssueCode.custom:
				message = `Invalid input`;
				break;
			case ZodIssueCode.invalid_intersection_types:
				message = `Intersection results could not be merged`;
				break;
			case ZodIssueCode.not_multiple_of:
				message = `Number must be a multiple of ${issue.multipleOf}`;
				break;
			case ZodIssueCode.not_finite:
				message = "Number must be finite";
				break;
			default:
				message = _ctx.defaultError;
				util.assertNever(issue);
		}
		return { message };
	};
	//#endregion
	//#region node_modules/zod/v3/errors.js
	var overrideErrorMap = errorMap;
	function getErrorMap() {
		return overrideErrorMap;
	}
	//#endregion
	//#region node_modules/zod/v3/helpers/parseUtil.js
	var makeIssue = (params) => {
		const { data, path, errorMaps, issueData } = params;
		const fullPath = [...path, ...issueData.path || []];
		const fullIssue = {
			...issueData,
			path: fullPath
		};
		if (issueData.message !== void 0) return {
			...issueData,
			path: fullPath,
			message: issueData.message
		};
		let errorMessage = "";
		const maps = errorMaps.filter((m) => !!m).slice().reverse();
		for (const map of maps) errorMessage = map(fullIssue, {
			data,
			defaultError: errorMessage
		}).message;
		return {
			...issueData,
			path: fullPath,
			message: errorMessage
		};
	};
	function addIssueToContext(ctx, issueData) {
		const overrideMap = getErrorMap();
		const issue = makeIssue({
			issueData,
			data: ctx.data,
			path: ctx.path,
			errorMaps: [
				ctx.common.contextualErrorMap,
				ctx.schemaErrorMap,
				overrideMap,
				overrideMap === errorMap ? void 0 : errorMap
			].filter((x) => !!x)
		});
		ctx.common.issues.push(issue);
	}
	var ParseStatus = class ParseStatus {
		constructor() {
			this.value = "valid";
		}
		dirty() {
			if (this.value === "valid") this.value = "dirty";
		}
		abort() {
			if (this.value !== "aborted") this.value = "aborted";
		}
		static mergeArray(status, results) {
			const arrayValue = [];
			for (const s of results) {
				if (s.status === "aborted") return INVALID;
				if (s.status === "dirty") status.dirty();
				arrayValue.push(s.value);
			}
			return {
				status: status.value,
				value: arrayValue
			};
		}
		static async mergeObjectAsync(status, pairs) {
			const syncPairs = [];
			for (const pair of pairs) {
				const key = await pair.key;
				const value = await pair.value;
				syncPairs.push({
					key,
					value
				});
			}
			return ParseStatus.mergeObjectSync(status, syncPairs);
		}
		static mergeObjectSync(status, pairs) {
			const finalObject = {};
			for (const pair of pairs) {
				const { key, value } = pair;
				if (key.status === "aborted") return INVALID;
				if (value.status === "aborted") return INVALID;
				if (key.status === "dirty") status.dirty();
				if (value.status === "dirty") status.dirty();
				if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) finalObject[key.value] = value.value;
			}
			return {
				status: status.value,
				value: finalObject
			};
		}
	};
	var INVALID = Object.freeze({ status: "aborted" });
	var DIRTY = (value) => ({
		status: "dirty",
		value
	});
	var OK = (value) => ({
		status: "valid",
		value
	});
	var isAborted = (x) => x.status === "aborted";
	var isDirty = (x) => x.status === "dirty";
	var isValid = (x) => x.status === "valid";
	var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
	//#endregion
	//#region node_modules/zod/v3/helpers/errorUtil.js
	var errorUtil;
	(function(errorUtil) {
		errorUtil.errToObj = (message) => typeof message === "string" ? { message } : message || {};
		errorUtil.toString = (message) => typeof message === "string" ? message : message?.message;
	})(errorUtil || (errorUtil = {}));
	//#endregion
	//#region node_modules/zod/v3/types.js
	var ParseInputLazyPath = class {
		constructor(parent, value, path, key) {
			this._cachedPath = [];
			this.parent = parent;
			this.data = value;
			this._path = path;
			this._key = key;
		}
		get path() {
			if (!this._cachedPath.length) {
				if (Array.isArray(this._key)) this._cachedPath.push(...this._path, ...this._key);
				else this._cachedPath.push(...this._path, this._key);
			}
			return this._cachedPath;
		}
	};
	var handleResult = (ctx, result) => {
		if (isValid(result)) return {
			success: true,
			data: result.value
		};
		else {
			if (!ctx.common.issues.length) throw new Error("Validation failed but no issues detected.");
			return {
				success: false,
				get error() {
					if (this._error) return this._error;
					const error = new ZodError(ctx.common.issues);
					this._error = error;
					return this._error;
				}
			};
		}
	};
	function processCreateParams(params) {
		if (!params) return {};
		const { errorMap, invalid_type_error, required_error, description } = params;
		if (errorMap && (invalid_type_error || required_error)) throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
		if (errorMap) return {
			errorMap,
			description
		};
		const customMap = (iss, ctx) => {
			const { message } = params;
			if (iss.code === "invalid_enum_value") return { message: message ?? ctx.defaultError };
			if (typeof ctx.data === "undefined") return { message: message ?? required_error ?? ctx.defaultError };
			if (iss.code !== "invalid_type") return { message: ctx.defaultError };
			return { message: message ?? invalid_type_error ?? ctx.defaultError };
		};
		return {
			errorMap: customMap,
			description
		};
	}
	var ZodType = class {
		get description() {
			return this._def.description;
		}
		_getType(input) {
			return getParsedType(input.data);
		}
		_getOrReturnCtx(input, ctx) {
			return ctx || {
				common: input.parent.common,
				data: input.data,
				parsedType: getParsedType(input.data),
				schemaErrorMap: this._def.errorMap,
				path: input.path,
				parent: input.parent
			};
		}
		_processInputParams(input) {
			return {
				status: new ParseStatus(),
				ctx: {
					common: input.parent.common,
					data: input.data,
					parsedType: getParsedType(input.data),
					schemaErrorMap: this._def.errorMap,
					path: input.path,
					parent: input.parent
				}
			};
		}
		_parseSync(input) {
			const result = this._parse(input);
			if (isAsync(result)) throw new Error("Synchronous parse encountered promise.");
			return result;
		}
		_parseAsync(input) {
			const result = this._parse(input);
			return Promise.resolve(result);
		}
		parse(data, params) {
			const result = this.safeParse(data, params);
			if (result.success) return result.data;
			throw result.error;
		}
		safeParse(data, params) {
			const ctx = {
				common: {
					issues: [],
					async: params?.async ?? false,
					contextualErrorMap: params?.errorMap
				},
				path: params?.path || [],
				schemaErrorMap: this._def.errorMap,
				parent: null,
				data,
				parsedType: getParsedType(data)
			};
			return handleResult(ctx, this._parseSync({
				data,
				path: ctx.path,
				parent: ctx
			}));
		}
		"~validate"(data) {
			const ctx = {
				common: {
					issues: [],
					async: !!this["~standard"].async
				},
				path: [],
				schemaErrorMap: this._def.errorMap,
				parent: null,
				data,
				parsedType: getParsedType(data)
			};
			if (!this["~standard"].async) try {
				const result = this._parseSync({
					data,
					path: [],
					parent: ctx
				});
				return isValid(result) ? { value: result.value } : { issues: ctx.common.issues };
			} catch (err) {
				if (err?.message?.toLowerCase()?.includes("encountered")) this["~standard"].async = true;
				ctx.common = {
					issues: [],
					async: true
				};
			}
			return this._parseAsync({
				data,
				path: [],
				parent: ctx
			}).then((result) => isValid(result) ? { value: result.value } : { issues: ctx.common.issues });
		}
		async parseAsync(data, params) {
			const result = await this.safeParseAsync(data, params);
			if (result.success) return result.data;
			throw result.error;
		}
		async safeParseAsync(data, params) {
			const ctx = {
				common: {
					issues: [],
					contextualErrorMap: params?.errorMap,
					async: true
				},
				path: params?.path || [],
				schemaErrorMap: this._def.errorMap,
				parent: null,
				data,
				parsedType: getParsedType(data)
			};
			const maybeAsyncResult = this._parse({
				data,
				path: ctx.path,
				parent: ctx
			});
			return handleResult(ctx, await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult)));
		}
		refine(check, message) {
			const getIssueProperties = (val) => {
				if (typeof message === "string" || typeof message === "undefined") return { message };
				else if (typeof message === "function") return message(val);
				else return message;
			};
			return this._refinement((val, ctx) => {
				const result = check(val);
				const setError = () => ctx.addIssue({
					code: ZodIssueCode.custom,
					...getIssueProperties(val)
				});
				if (typeof Promise !== "undefined" && result instanceof Promise) return result.then((data) => {
					if (!data) {
						setError();
						return false;
					} else return true;
				});
				if (!result) {
					setError();
					return false;
				} else return true;
			});
		}
		refinement(check, refinementData) {
			return this._refinement((val, ctx) => {
				if (!check(val)) {
					ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
					return false;
				} else return true;
			});
		}
		_refinement(refinement) {
			return new ZodEffects({
				schema: this,
				typeName: ZodFirstPartyTypeKind.ZodEffects,
				effect: {
					type: "refinement",
					refinement
				}
			});
		}
		superRefine(refinement) {
			return this._refinement(refinement);
		}
		constructor(def) {
			/** Alias of safeParseAsync */
			this.spa = this.safeParseAsync;
			this._def = def;
			this.parse = this.parse.bind(this);
			this.safeParse = this.safeParse.bind(this);
			this.parseAsync = this.parseAsync.bind(this);
			this.safeParseAsync = this.safeParseAsync.bind(this);
			this.spa = this.spa.bind(this);
			this.refine = this.refine.bind(this);
			this.refinement = this.refinement.bind(this);
			this.superRefine = this.superRefine.bind(this);
			this.optional = this.optional.bind(this);
			this.nullable = this.nullable.bind(this);
			this.nullish = this.nullish.bind(this);
			this.array = this.array.bind(this);
			this.promise = this.promise.bind(this);
			this.or = this.or.bind(this);
			this.and = this.and.bind(this);
			this.transform = this.transform.bind(this);
			this.brand = this.brand.bind(this);
			this.default = this.default.bind(this);
			this.catch = this.catch.bind(this);
			this.describe = this.describe.bind(this);
			this.pipe = this.pipe.bind(this);
			this.readonly = this.readonly.bind(this);
			this.isNullable = this.isNullable.bind(this);
			this.isOptional = this.isOptional.bind(this);
			this["~standard"] = {
				version: 1,
				vendor: "zod",
				validate: (data) => this["~validate"](data)
			};
		}
		optional() {
			return ZodOptional.create(this, this._def);
		}
		nullable() {
			return ZodNullable.create(this, this._def);
		}
		nullish() {
			return this.nullable().optional();
		}
		array() {
			return ZodArray.create(this);
		}
		promise() {
			return ZodPromise.create(this, this._def);
		}
		or(option) {
			return ZodUnion.create([this, option], this._def);
		}
		and(incoming) {
			return ZodIntersection.create(this, incoming, this._def);
		}
		transform(transform) {
			return new ZodEffects({
				...processCreateParams(this._def),
				schema: this,
				typeName: ZodFirstPartyTypeKind.ZodEffects,
				effect: {
					type: "transform",
					transform
				}
			});
		}
		default(def) {
			const defaultValueFunc = typeof def === "function" ? def : () => def;
			return new ZodDefault({
				...processCreateParams(this._def),
				innerType: this,
				defaultValue: defaultValueFunc,
				typeName: ZodFirstPartyTypeKind.ZodDefault
			});
		}
		brand() {
			return new ZodBranded({
				typeName: ZodFirstPartyTypeKind.ZodBranded,
				type: this,
				...processCreateParams(this._def)
			});
		}
		catch(def) {
			const catchValueFunc = typeof def === "function" ? def : () => def;
			return new ZodCatch({
				...processCreateParams(this._def),
				innerType: this,
				catchValue: catchValueFunc,
				typeName: ZodFirstPartyTypeKind.ZodCatch
			});
		}
		describe(description) {
			const This = this.constructor;
			return new This({
				...this._def,
				description
			});
		}
		pipe(target) {
			return ZodPipeline.create(this, target);
		}
		readonly() {
			return ZodReadonly.create(this);
		}
		isOptional() {
			return this.safeParse(void 0).success;
		}
		isNullable() {
			return this.safeParse(null).success;
		}
	};
	var cuidRegex = /^c[^\s-]{8,}$/i;
	var cuid2Regex = /^[0-9a-z]+$/;
	var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
	var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
	var nanoidRegex = /^[a-z0-9_-]{21}$/i;
	var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
	var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
	var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
	var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
	var emojiRegex;
	var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
	var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
	var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
	var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
	var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
	var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
	var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
	var dateRegex = new RegExp(`^${dateRegexSource}$`);
	function timeRegexSource(args) {
		let secondsRegexSource = `[0-5]\\d`;
		if (args.precision) secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
		else if (args.precision == null) secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
		const secondsQuantifier = args.precision ? "+" : "?";
		return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
	}
	function timeRegex(args) {
		return new RegExp(`^${timeRegexSource(args)}$`);
	}
	function datetimeRegex(args) {
		let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
		const opts = [];
		opts.push(args.local ? `Z?` : `Z`);
		if (args.offset) opts.push(`([+-]\\d{2}:?\\d{2})`);
		regex = `${regex}(${opts.join("|")})`;
		return new RegExp(`^${regex}$`);
	}
	function isValidIP(ip, version) {
		if ((version === "v4" || !version) && ipv4Regex.test(ip)) return true;
		if ((version === "v6" || !version) && ipv6Regex.test(ip)) return true;
		return false;
	}
	function isValidJWT(jwt, alg) {
		if (!jwtRegex.test(jwt)) return false;
		try {
			const [header] = jwt.split(".");
			if (!header) return false;
			const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
			const decoded = JSON.parse(atob(base64));
			if (typeof decoded !== "object" || decoded === null) return false;
			if ("typ" in decoded && decoded?.typ !== "JWT") return false;
			if (!decoded.alg) return false;
			if (alg && decoded.alg !== alg) return false;
			return true;
		} catch {
			return false;
		}
	}
	function isValidCidr(ip, version) {
		if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) return true;
		if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) return true;
		return false;
	}
	var ZodString = class ZodString extends ZodType {
		_parse(input) {
			if (this._def.coerce) input.data = String(input.data);
			if (this._getType(input) !== ZodParsedType.string) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.string,
					received: ctx.parsedType
				});
				return INVALID;
			}
			const status = new ParseStatus();
			let ctx = void 0;
			for (const check of this._def.checks) if (check.kind === "min") {
				if (input.data.length < check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_small,
						minimum: check.value,
						type: "string",
						inclusive: true,
						exact: false,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "max") {
				if (input.data.length > check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_big,
						maximum: check.value,
						type: "string",
						inclusive: true,
						exact: false,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "length") {
				const tooBig = input.data.length > check.value;
				const tooSmall = input.data.length < check.value;
				if (tooBig || tooSmall) {
					ctx = this._getOrReturnCtx(input, ctx);
					if (tooBig) addIssueToContext(ctx, {
						code: ZodIssueCode.too_big,
						maximum: check.value,
						type: "string",
						inclusive: true,
						exact: true,
						message: check.message
					});
					else if (tooSmall) addIssueToContext(ctx, {
						code: ZodIssueCode.too_small,
						minimum: check.value,
						type: "string",
						inclusive: true,
						exact: true,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "email") {
				if (!emailRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "email",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "emoji") {
				if (!emojiRegex) emojiRegex = new RegExp(_emojiRegex, "u");
				if (!emojiRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "emoji",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "uuid") {
				if (!uuidRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "uuid",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "nanoid") {
				if (!nanoidRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "nanoid",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "cuid") {
				if (!cuidRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "cuid",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "cuid2") {
				if (!cuid2Regex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "cuid2",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "ulid") {
				if (!ulidRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "ulid",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "url") try {
				new URL(input.data);
			} catch {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "url",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
			else if (check.kind === "regex") {
				check.regex.lastIndex = 0;
				if (!check.regex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "regex",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "trim") input.data = input.data.trim();
			else if (check.kind === "includes") {
				if (!input.data.includes(check.value, check.position)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_string,
						validation: {
							includes: check.value,
							position: check.position
						},
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "toLowerCase") input.data = input.data.toLowerCase();
			else if (check.kind === "toUpperCase") input.data = input.data.toUpperCase();
			else if (check.kind === "startsWith") {
				if (!input.data.startsWith(check.value)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_string,
						validation: { startsWith: check.value },
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "endsWith") {
				if (!input.data.endsWith(check.value)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_string,
						validation: { endsWith: check.value },
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "datetime") {
				if (!datetimeRegex(check).test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_string,
						validation: "datetime",
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "date") {
				if (!dateRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_string,
						validation: "date",
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "time") {
				if (!timeRegex(check).test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_string,
						validation: "time",
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "duration") {
				if (!durationRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "duration",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "ip") {
				if (!isValidIP(input.data, check.version)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "ip",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "jwt") {
				if (!isValidJWT(input.data, check.alg)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "jwt",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "cidr") {
				if (!isValidCidr(input.data, check.version)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "cidr",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "base64") {
				if (!base64Regex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "base64",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "base64url") {
				if (!base64urlRegex.test(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						validation: "base64url",
						code: ZodIssueCode.invalid_string,
						message: check.message
					});
					status.dirty();
				}
			} else util.assertNever(check);
			return {
				status: status.value,
				value: input.data
			};
		}
		_regex(regex, validation, message) {
			return this.refinement((data) => regex.test(data), {
				validation,
				code: ZodIssueCode.invalid_string,
				...errorUtil.errToObj(message)
			});
		}
		_addCheck(check) {
			return new ZodString({
				...this._def,
				checks: [...this._def.checks, check]
			});
		}
		email(message) {
			return this._addCheck({
				kind: "email",
				...errorUtil.errToObj(message)
			});
		}
		url(message) {
			return this._addCheck({
				kind: "url",
				...errorUtil.errToObj(message)
			});
		}
		emoji(message) {
			return this._addCheck({
				kind: "emoji",
				...errorUtil.errToObj(message)
			});
		}
		uuid(message) {
			return this._addCheck({
				kind: "uuid",
				...errorUtil.errToObj(message)
			});
		}
		nanoid(message) {
			return this._addCheck({
				kind: "nanoid",
				...errorUtil.errToObj(message)
			});
		}
		cuid(message) {
			return this._addCheck({
				kind: "cuid",
				...errorUtil.errToObj(message)
			});
		}
		cuid2(message) {
			return this._addCheck({
				kind: "cuid2",
				...errorUtil.errToObj(message)
			});
		}
		ulid(message) {
			return this._addCheck({
				kind: "ulid",
				...errorUtil.errToObj(message)
			});
		}
		base64(message) {
			return this._addCheck({
				kind: "base64",
				...errorUtil.errToObj(message)
			});
		}
		base64url(message) {
			return this._addCheck({
				kind: "base64url",
				...errorUtil.errToObj(message)
			});
		}
		jwt(options) {
			return this._addCheck({
				kind: "jwt",
				...errorUtil.errToObj(options)
			});
		}
		ip(options) {
			return this._addCheck({
				kind: "ip",
				...errorUtil.errToObj(options)
			});
		}
		cidr(options) {
			return this._addCheck({
				kind: "cidr",
				...errorUtil.errToObj(options)
			});
		}
		datetime(options) {
			if (typeof options === "string") return this._addCheck({
				kind: "datetime",
				precision: null,
				offset: false,
				local: false,
				message: options
			});
			return this._addCheck({
				kind: "datetime",
				precision: typeof options?.precision === "undefined" ? null : options?.precision,
				offset: options?.offset ?? false,
				local: options?.local ?? false,
				...errorUtil.errToObj(options?.message)
			});
		}
		date(message) {
			return this._addCheck({
				kind: "date",
				message
			});
		}
		time(options) {
			if (typeof options === "string") return this._addCheck({
				kind: "time",
				precision: null,
				message: options
			});
			return this._addCheck({
				kind: "time",
				precision: typeof options?.precision === "undefined" ? null : options?.precision,
				...errorUtil.errToObj(options?.message)
			});
		}
		duration(message) {
			return this._addCheck({
				kind: "duration",
				...errorUtil.errToObj(message)
			});
		}
		regex(regex, message) {
			return this._addCheck({
				kind: "regex",
				regex,
				...errorUtil.errToObj(message)
			});
		}
		includes(value, options) {
			return this._addCheck({
				kind: "includes",
				value,
				position: options?.position,
				...errorUtil.errToObj(options?.message)
			});
		}
		startsWith(value, message) {
			return this._addCheck({
				kind: "startsWith",
				value,
				...errorUtil.errToObj(message)
			});
		}
		endsWith(value, message) {
			return this._addCheck({
				kind: "endsWith",
				value,
				...errorUtil.errToObj(message)
			});
		}
		min(minLength, message) {
			return this._addCheck({
				kind: "min",
				value: minLength,
				...errorUtil.errToObj(message)
			});
		}
		max(maxLength, message) {
			return this._addCheck({
				kind: "max",
				value: maxLength,
				...errorUtil.errToObj(message)
			});
		}
		length(len, message) {
			return this._addCheck({
				kind: "length",
				value: len,
				...errorUtil.errToObj(message)
			});
		}
		/**
		* Equivalent to `.min(1)`
		*/
		nonempty(message) {
			return this.min(1, errorUtil.errToObj(message));
		}
		trim() {
			return new ZodString({
				...this._def,
				checks: [...this._def.checks, { kind: "trim" }]
			});
		}
		toLowerCase() {
			return new ZodString({
				...this._def,
				checks: [...this._def.checks, { kind: "toLowerCase" }]
			});
		}
		toUpperCase() {
			return new ZodString({
				...this._def,
				checks: [...this._def.checks, { kind: "toUpperCase" }]
			});
		}
		get isDatetime() {
			return !!this._def.checks.find((ch) => ch.kind === "datetime");
		}
		get isDate() {
			return !!this._def.checks.find((ch) => ch.kind === "date");
		}
		get isTime() {
			return !!this._def.checks.find((ch) => ch.kind === "time");
		}
		get isDuration() {
			return !!this._def.checks.find((ch) => ch.kind === "duration");
		}
		get isEmail() {
			return !!this._def.checks.find((ch) => ch.kind === "email");
		}
		get isURL() {
			return !!this._def.checks.find((ch) => ch.kind === "url");
		}
		get isEmoji() {
			return !!this._def.checks.find((ch) => ch.kind === "emoji");
		}
		get isUUID() {
			return !!this._def.checks.find((ch) => ch.kind === "uuid");
		}
		get isNANOID() {
			return !!this._def.checks.find((ch) => ch.kind === "nanoid");
		}
		get isCUID() {
			return !!this._def.checks.find((ch) => ch.kind === "cuid");
		}
		get isCUID2() {
			return !!this._def.checks.find((ch) => ch.kind === "cuid2");
		}
		get isULID() {
			return !!this._def.checks.find((ch) => ch.kind === "ulid");
		}
		get isIP() {
			return !!this._def.checks.find((ch) => ch.kind === "ip");
		}
		get isCIDR() {
			return !!this._def.checks.find((ch) => ch.kind === "cidr");
		}
		get isBase64() {
			return !!this._def.checks.find((ch) => ch.kind === "base64");
		}
		get isBase64url() {
			return !!this._def.checks.find((ch) => ch.kind === "base64url");
		}
		get minLength() {
			let min = null;
			for (const ch of this._def.checks) if (ch.kind === "min") {
				if (min === null || ch.value > min) min = ch.value;
			}
			return min;
		}
		get maxLength() {
			let max = null;
			for (const ch of this._def.checks) if (ch.kind === "max") {
				if (max === null || ch.value < max) max = ch.value;
			}
			return max;
		}
	};
	ZodString.create = (params) => {
		return new ZodString({
			checks: [],
			typeName: ZodFirstPartyTypeKind.ZodString,
			coerce: params?.coerce ?? false,
			...processCreateParams(params)
		});
	};
	function floatSafeRemainder(val, step) {
		const valDecCount = (val.toString().split(".")[1] || "").length;
		const stepDecCount = (step.toString().split(".")[1] || "").length;
		const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
		return Number.parseInt(val.toFixed(decCount).replace(".", "")) % Number.parseInt(step.toFixed(decCount).replace(".", "")) / 10 ** decCount;
	}
	var ZodNumber = class ZodNumber extends ZodType {
		constructor() {
			super(...arguments);
			this.min = this.gte;
			this.max = this.lte;
			this.step = this.multipleOf;
		}
		_parse(input) {
			if (this._def.coerce) input.data = Number(input.data);
			if (this._getType(input) !== ZodParsedType.number) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.number,
					received: ctx.parsedType
				});
				return INVALID;
			}
			let ctx = void 0;
			const status = new ParseStatus();
			for (const check of this._def.checks) if (check.kind === "int") {
				if (!util.isInteger(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.invalid_type,
						expected: "integer",
						received: "float",
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "min") {
				if (check.inclusive ? input.data < check.value : input.data <= check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_small,
						minimum: check.value,
						type: "number",
						inclusive: check.inclusive,
						exact: false,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "max") {
				if (check.inclusive ? input.data > check.value : input.data >= check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_big,
						maximum: check.value,
						type: "number",
						inclusive: check.inclusive,
						exact: false,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "multipleOf") {
				if (floatSafeRemainder(input.data, check.value) !== 0) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.not_multiple_of,
						multipleOf: check.value,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "finite") {
				if (!Number.isFinite(input.data)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.not_finite,
						message: check.message
					});
					status.dirty();
				}
			} else util.assertNever(check);
			return {
				status: status.value,
				value: input.data
			};
		}
		gte(value, message) {
			return this.setLimit("min", value, true, errorUtil.toString(message));
		}
		gt(value, message) {
			return this.setLimit("min", value, false, errorUtil.toString(message));
		}
		lte(value, message) {
			return this.setLimit("max", value, true, errorUtil.toString(message));
		}
		lt(value, message) {
			return this.setLimit("max", value, false, errorUtil.toString(message));
		}
		setLimit(kind, value, inclusive, message) {
			return new ZodNumber({
				...this._def,
				checks: [...this._def.checks, {
					kind,
					value,
					inclusive,
					message: errorUtil.toString(message)
				}]
			});
		}
		_addCheck(check) {
			return new ZodNumber({
				...this._def,
				checks: [...this._def.checks, check]
			});
		}
		int(message) {
			return this._addCheck({
				kind: "int",
				message: errorUtil.toString(message)
			});
		}
		positive(message) {
			return this._addCheck({
				kind: "min",
				value: 0,
				inclusive: false,
				message: errorUtil.toString(message)
			});
		}
		negative(message) {
			return this._addCheck({
				kind: "max",
				value: 0,
				inclusive: false,
				message: errorUtil.toString(message)
			});
		}
		nonpositive(message) {
			return this._addCheck({
				kind: "max",
				value: 0,
				inclusive: true,
				message: errorUtil.toString(message)
			});
		}
		nonnegative(message) {
			return this._addCheck({
				kind: "min",
				value: 0,
				inclusive: true,
				message: errorUtil.toString(message)
			});
		}
		multipleOf(value, message) {
			return this._addCheck({
				kind: "multipleOf",
				value,
				message: errorUtil.toString(message)
			});
		}
		finite(message) {
			return this._addCheck({
				kind: "finite",
				message: errorUtil.toString(message)
			});
		}
		safe(message) {
			return this._addCheck({
				kind: "min",
				inclusive: true,
				value: Number.MIN_SAFE_INTEGER,
				message: errorUtil.toString(message)
			})._addCheck({
				kind: "max",
				inclusive: true,
				value: Number.MAX_SAFE_INTEGER,
				message: errorUtil.toString(message)
			});
		}
		get minValue() {
			let min = null;
			for (const ch of this._def.checks) if (ch.kind === "min") {
				if (min === null || ch.value > min) min = ch.value;
			}
			return min;
		}
		get maxValue() {
			let max = null;
			for (const ch of this._def.checks) if (ch.kind === "max") {
				if (max === null || ch.value < max) max = ch.value;
			}
			return max;
		}
		get isInt() {
			return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
		}
		get isFinite() {
			let max = null;
			let min = null;
			for (const ch of this._def.checks) if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") return true;
			else if (ch.kind === "min") {
				if (min === null || ch.value > min) min = ch.value;
			} else if (ch.kind === "max") {
				if (max === null || ch.value < max) max = ch.value;
			}
			return Number.isFinite(min) && Number.isFinite(max);
		}
	};
	ZodNumber.create = (params) => {
		return new ZodNumber({
			checks: [],
			typeName: ZodFirstPartyTypeKind.ZodNumber,
			coerce: params?.coerce || false,
			...processCreateParams(params)
		});
	};
	var ZodBigInt = class ZodBigInt extends ZodType {
		constructor() {
			super(...arguments);
			this.min = this.gte;
			this.max = this.lte;
		}
		_parse(input) {
			if (this._def.coerce) try {
				input.data = BigInt(input.data);
			} catch {
				return this._getInvalidInput(input);
			}
			if (this._getType(input) !== ZodParsedType.bigint) return this._getInvalidInput(input);
			let ctx = void 0;
			const status = new ParseStatus();
			for (const check of this._def.checks) if (check.kind === "min") {
				if (check.inclusive ? input.data < check.value : input.data <= check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_small,
						type: "bigint",
						minimum: check.value,
						inclusive: check.inclusive,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "max") {
				if (check.inclusive ? input.data > check.value : input.data >= check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_big,
						type: "bigint",
						maximum: check.value,
						inclusive: check.inclusive,
						message: check.message
					});
					status.dirty();
				}
			} else if (check.kind === "multipleOf") {
				if (input.data % check.value !== BigInt(0)) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.not_multiple_of,
						multipleOf: check.value,
						message: check.message
					});
					status.dirty();
				}
			} else util.assertNever(check);
			return {
				status: status.value,
				value: input.data
			};
		}
		_getInvalidInput(input) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.bigint,
				received: ctx.parsedType
			});
			return INVALID;
		}
		gte(value, message) {
			return this.setLimit("min", value, true, errorUtil.toString(message));
		}
		gt(value, message) {
			return this.setLimit("min", value, false, errorUtil.toString(message));
		}
		lte(value, message) {
			return this.setLimit("max", value, true, errorUtil.toString(message));
		}
		lt(value, message) {
			return this.setLimit("max", value, false, errorUtil.toString(message));
		}
		setLimit(kind, value, inclusive, message) {
			return new ZodBigInt({
				...this._def,
				checks: [...this._def.checks, {
					kind,
					value,
					inclusive,
					message: errorUtil.toString(message)
				}]
			});
		}
		_addCheck(check) {
			return new ZodBigInt({
				...this._def,
				checks: [...this._def.checks, check]
			});
		}
		positive(message) {
			return this._addCheck({
				kind: "min",
				value: BigInt(0),
				inclusive: false,
				message: errorUtil.toString(message)
			});
		}
		negative(message) {
			return this._addCheck({
				kind: "max",
				value: BigInt(0),
				inclusive: false,
				message: errorUtil.toString(message)
			});
		}
		nonpositive(message) {
			return this._addCheck({
				kind: "max",
				value: BigInt(0),
				inclusive: true,
				message: errorUtil.toString(message)
			});
		}
		nonnegative(message) {
			return this._addCheck({
				kind: "min",
				value: BigInt(0),
				inclusive: true,
				message: errorUtil.toString(message)
			});
		}
		multipleOf(value, message) {
			return this._addCheck({
				kind: "multipleOf",
				value,
				message: errorUtil.toString(message)
			});
		}
		get minValue() {
			let min = null;
			for (const ch of this._def.checks) if (ch.kind === "min") {
				if (min === null || ch.value > min) min = ch.value;
			}
			return min;
		}
		get maxValue() {
			let max = null;
			for (const ch of this._def.checks) if (ch.kind === "max") {
				if (max === null || ch.value < max) max = ch.value;
			}
			return max;
		}
	};
	ZodBigInt.create = (params) => {
		return new ZodBigInt({
			checks: [],
			typeName: ZodFirstPartyTypeKind.ZodBigInt,
			coerce: params?.coerce ?? false,
			...processCreateParams(params)
		});
	};
	var ZodBoolean = class extends ZodType {
		_parse(input) {
			if (this._def.coerce) input.data = Boolean(input.data);
			if (this._getType(input) !== ZodParsedType.boolean) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.boolean,
					received: ctx.parsedType
				});
				return INVALID;
			}
			return OK(input.data);
		}
	};
	ZodBoolean.create = (params) => {
		return new ZodBoolean({
			typeName: ZodFirstPartyTypeKind.ZodBoolean,
			coerce: params?.coerce || false,
			...processCreateParams(params)
		});
	};
	var ZodDate = class ZodDate extends ZodType {
		_parse(input) {
			if (this._def.coerce) input.data = new Date(input.data);
			if (this._getType(input) !== ZodParsedType.date) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.date,
					received: ctx.parsedType
				});
				return INVALID;
			}
			if (Number.isNaN(input.data.getTime())) {
				addIssueToContext(this._getOrReturnCtx(input), { code: ZodIssueCode.invalid_date });
				return INVALID;
			}
			const status = new ParseStatus();
			let ctx = void 0;
			for (const check of this._def.checks) if (check.kind === "min") {
				if (input.data.getTime() < check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_small,
						message: check.message,
						inclusive: true,
						exact: false,
						minimum: check.value,
						type: "date"
					});
					status.dirty();
				}
			} else if (check.kind === "max") {
				if (input.data.getTime() > check.value) {
					ctx = this._getOrReturnCtx(input, ctx);
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_big,
						message: check.message,
						inclusive: true,
						exact: false,
						maximum: check.value,
						type: "date"
					});
					status.dirty();
				}
			} else util.assertNever(check);
			return {
				status: status.value,
				value: new Date(input.data.getTime())
			};
		}
		_addCheck(check) {
			return new ZodDate({
				...this._def,
				checks: [...this._def.checks, check]
			});
		}
		min(minDate, message) {
			return this._addCheck({
				kind: "min",
				value: minDate.getTime(),
				message: errorUtil.toString(message)
			});
		}
		max(maxDate, message) {
			return this._addCheck({
				kind: "max",
				value: maxDate.getTime(),
				message: errorUtil.toString(message)
			});
		}
		get minDate() {
			let min = null;
			for (const ch of this._def.checks) if (ch.kind === "min") {
				if (min === null || ch.value > min) min = ch.value;
			}
			return min != null ? new Date(min) : null;
		}
		get maxDate() {
			let max = null;
			for (const ch of this._def.checks) if (ch.kind === "max") {
				if (max === null || ch.value < max) max = ch.value;
			}
			return max != null ? new Date(max) : null;
		}
	};
	ZodDate.create = (params) => {
		return new ZodDate({
			checks: [],
			coerce: params?.coerce || false,
			typeName: ZodFirstPartyTypeKind.ZodDate,
			...processCreateParams(params)
		});
	};
	var ZodSymbol = class extends ZodType {
		_parse(input) {
			if (this._getType(input) !== ZodParsedType.symbol) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.symbol,
					received: ctx.parsedType
				});
				return INVALID;
			}
			return OK(input.data);
		}
	};
	ZodSymbol.create = (params) => {
		return new ZodSymbol({
			typeName: ZodFirstPartyTypeKind.ZodSymbol,
			...processCreateParams(params)
		});
	};
	var ZodUndefined = class extends ZodType {
		_parse(input) {
			if (this._getType(input) !== ZodParsedType.undefined) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.undefined,
					received: ctx.parsedType
				});
				return INVALID;
			}
			return OK(input.data);
		}
	};
	ZodUndefined.create = (params) => {
		return new ZodUndefined({
			typeName: ZodFirstPartyTypeKind.ZodUndefined,
			...processCreateParams(params)
		});
	};
	var ZodNull = class extends ZodType {
		_parse(input) {
			if (this._getType(input) !== ZodParsedType.null) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.null,
					received: ctx.parsedType
				});
				return INVALID;
			}
			return OK(input.data);
		}
	};
	ZodNull.create = (params) => {
		return new ZodNull({
			typeName: ZodFirstPartyTypeKind.ZodNull,
			...processCreateParams(params)
		});
	};
	var ZodAny = class extends ZodType {
		constructor() {
			super(...arguments);
			this._any = true;
		}
		_parse(input) {
			return OK(input.data);
		}
	};
	ZodAny.create = (params) => {
		return new ZodAny({
			typeName: ZodFirstPartyTypeKind.ZodAny,
			...processCreateParams(params)
		});
	};
	var ZodUnknown = class extends ZodType {
		constructor() {
			super(...arguments);
			this._unknown = true;
		}
		_parse(input) {
			return OK(input.data);
		}
	};
	ZodUnknown.create = (params) => {
		return new ZodUnknown({
			typeName: ZodFirstPartyTypeKind.ZodUnknown,
			...processCreateParams(params)
		});
	};
	var ZodNever = class extends ZodType {
		_parse(input) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.never,
				received: ctx.parsedType
			});
			return INVALID;
		}
	};
	ZodNever.create = (params) => {
		return new ZodNever({
			typeName: ZodFirstPartyTypeKind.ZodNever,
			...processCreateParams(params)
		});
	};
	var ZodVoid = class extends ZodType {
		_parse(input) {
			if (this._getType(input) !== ZodParsedType.undefined) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.void,
					received: ctx.parsedType
				});
				return INVALID;
			}
			return OK(input.data);
		}
	};
	ZodVoid.create = (params) => {
		return new ZodVoid({
			typeName: ZodFirstPartyTypeKind.ZodVoid,
			...processCreateParams(params)
		});
	};
	var ZodArray = class ZodArray extends ZodType {
		_parse(input) {
			const { ctx, status } = this._processInputParams(input);
			const def = this._def;
			if (ctx.parsedType !== ZodParsedType.array) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.array,
					received: ctx.parsedType
				});
				return INVALID;
			}
			if (def.exactLength !== null) {
				const tooBig = ctx.data.length > def.exactLength.value;
				const tooSmall = ctx.data.length < def.exactLength.value;
				if (tooBig || tooSmall) {
					addIssueToContext(ctx, {
						code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
						minimum: tooSmall ? def.exactLength.value : void 0,
						maximum: tooBig ? def.exactLength.value : void 0,
						type: "array",
						inclusive: true,
						exact: true,
						message: def.exactLength.message
					});
					status.dirty();
				}
			}
			if (def.minLength !== null) {
				if (ctx.data.length < def.minLength.value) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_small,
						minimum: def.minLength.value,
						type: "array",
						inclusive: true,
						exact: false,
						message: def.minLength.message
					});
					status.dirty();
				}
			}
			if (def.maxLength !== null) {
				if (ctx.data.length > def.maxLength.value) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_big,
						maximum: def.maxLength.value,
						type: "array",
						inclusive: true,
						exact: false,
						message: def.maxLength.message
					});
					status.dirty();
				}
			}
			if (ctx.common.async) return Promise.all([...ctx.data].map((item, i) => {
				return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
			})).then((result) => {
				return ParseStatus.mergeArray(status, result);
			});
			const result = [...ctx.data].map((item, i) => {
				return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
			});
			return ParseStatus.mergeArray(status, result);
		}
		get element() {
			return this._def.type;
		}
		min(minLength, message) {
			return new ZodArray({
				...this._def,
				minLength: {
					value: minLength,
					message: errorUtil.toString(message)
				}
			});
		}
		max(maxLength, message) {
			return new ZodArray({
				...this._def,
				maxLength: {
					value: maxLength,
					message: errorUtil.toString(message)
				}
			});
		}
		length(len, message) {
			return new ZodArray({
				...this._def,
				exactLength: {
					value: len,
					message: errorUtil.toString(message)
				}
			});
		}
		nonempty(message) {
			return this.min(1, message);
		}
	};
	ZodArray.create = (schema, params) => {
		return new ZodArray({
			type: schema,
			minLength: null,
			maxLength: null,
			exactLength: null,
			typeName: ZodFirstPartyTypeKind.ZodArray,
			...processCreateParams(params)
		});
	};
	function deepPartialify(schema) {
		if (schema instanceof ZodObject) {
			const newShape = {};
			for (const key in schema.shape) {
				const fieldSchema = schema.shape[key];
				newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
			}
			return new ZodObject({
				...schema._def,
				shape: () => newShape
			});
		} else if (schema instanceof ZodArray) return new ZodArray({
			...schema._def,
			type: deepPartialify(schema.element)
		});
		else if (schema instanceof ZodOptional) return ZodOptional.create(deepPartialify(schema.unwrap()));
		else if (schema instanceof ZodNullable) return ZodNullable.create(deepPartialify(schema.unwrap()));
		else if (schema instanceof ZodTuple) return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
		else return schema;
	}
	var ZodObject = class ZodObject extends ZodType {
		constructor() {
			super(...arguments);
			this._cached = null;
			/**
			* @deprecated In most cases, this is no longer needed - unknown properties are now silently stripped.
			* If you want to pass through unknown properties, use `.passthrough()` instead.
			*/
			this.nonstrict = this.passthrough;
			/**
			* @deprecated Use `.extend` instead
			*  */
			this.augment = this.extend;
		}
		_getCached() {
			if (this._cached !== null) return this._cached;
			const shape = this._def.shape();
			const keys = util.objectKeys(shape);
			this._cached = {
				shape,
				keys
			};
			return this._cached;
		}
		_parse(input) {
			if (this._getType(input) !== ZodParsedType.object) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.object,
					received: ctx.parsedType
				});
				return INVALID;
			}
			const { status, ctx } = this._processInputParams(input);
			const { shape, keys: shapeKeys } = this._getCached();
			const extraKeys = [];
			if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
				for (const key in ctx.data) if (!shapeKeys.includes(key)) extraKeys.push(key);
			}
			const pairs = [];
			for (const key of shapeKeys) {
				const keyValidator = shape[key];
				const value = ctx.data[key];
				pairs.push({
					key: {
						status: "valid",
						value: key
					},
					value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
					alwaysSet: key in ctx.data
				});
			}
			if (this._def.catchall instanceof ZodNever) {
				const unknownKeys = this._def.unknownKeys;
				if (unknownKeys === "passthrough") for (const key of extraKeys) pairs.push({
					key: {
						status: "valid",
						value: key
					},
					value: {
						status: "valid",
						value: ctx.data[key]
					}
				});
				else if (unknownKeys === "strict") {
					if (extraKeys.length > 0) {
						addIssueToContext(ctx, {
							code: ZodIssueCode.unrecognized_keys,
							keys: extraKeys
						});
						status.dirty();
					}
				} else if (unknownKeys === "strip") {} else throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
			} else {
				const catchall = this._def.catchall;
				for (const key of extraKeys) {
					const value = ctx.data[key];
					pairs.push({
						key: {
							status: "valid",
							value: key
						},
						value: catchall._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
						alwaysSet: key in ctx.data
					});
				}
			}
			if (ctx.common.async) return Promise.resolve().then(async () => {
				const syncPairs = [];
				for (const pair of pairs) {
					const key = await pair.key;
					const value = await pair.value;
					syncPairs.push({
						key,
						value,
						alwaysSet: pair.alwaysSet
					});
				}
				return syncPairs;
			}).then((syncPairs) => {
				return ParseStatus.mergeObjectSync(status, syncPairs);
			});
			else return ParseStatus.mergeObjectSync(status, pairs);
		}
		get shape() {
			return this._def.shape();
		}
		strict(message) {
			errorUtil.errToObj;
			return new ZodObject({
				...this._def,
				unknownKeys: "strict",
				...message !== void 0 ? { errorMap: (issue, ctx) => {
					const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
					if (issue.code === "unrecognized_keys") return { message: errorUtil.errToObj(message).message ?? defaultError };
					return { message: defaultError };
				} } : {}
			});
		}
		strip() {
			return new ZodObject({
				...this._def,
				unknownKeys: "strip"
			});
		}
		passthrough() {
			return new ZodObject({
				...this._def,
				unknownKeys: "passthrough"
			});
		}
		extend(augmentation) {
			return new ZodObject({
				...this._def,
				shape: () => ({
					...this._def.shape(),
					...augmentation
				})
			});
		}
		/**
		* Prior to zod@1.0.12 there was a bug in the
		* inferred type of merged objects. Please
		* upgrade if you are experiencing issues.
		*/
		merge(merging) {
			return new ZodObject({
				unknownKeys: merging._def.unknownKeys,
				catchall: merging._def.catchall,
				shape: () => ({
					...this._def.shape(),
					...merging._def.shape()
				}),
				typeName: ZodFirstPartyTypeKind.ZodObject
			});
		}
		setKey(key, schema) {
			return this.augment({ [key]: schema });
		}
		catchall(index) {
			return new ZodObject({
				...this._def,
				catchall: index
			});
		}
		pick(mask) {
			const shape = {};
			for (const key of util.objectKeys(mask)) if (mask[key] && this.shape[key]) shape[key] = this.shape[key];
			return new ZodObject({
				...this._def,
				shape: () => shape
			});
		}
		omit(mask) {
			const shape = {};
			for (const key of util.objectKeys(this.shape)) if (!mask[key]) shape[key] = this.shape[key];
			return new ZodObject({
				...this._def,
				shape: () => shape
			});
		}
		/**
		* @deprecated
		*/
		deepPartial() {
			return deepPartialify(this);
		}
		partial(mask) {
			const newShape = {};
			for (const key of util.objectKeys(this.shape)) {
				const fieldSchema = this.shape[key];
				if (mask && !mask[key]) newShape[key] = fieldSchema;
				else newShape[key] = fieldSchema.optional();
			}
			return new ZodObject({
				...this._def,
				shape: () => newShape
			});
		}
		required(mask) {
			const newShape = {};
			for (const key of util.objectKeys(this.shape)) if (mask && !mask[key]) newShape[key] = this.shape[key];
			else {
				let newField = this.shape[key];
				while (newField instanceof ZodOptional) newField = newField._def.innerType;
				newShape[key] = newField;
			}
			return new ZodObject({
				...this._def,
				shape: () => newShape
			});
		}
		keyof() {
			return createZodEnum(util.objectKeys(this.shape));
		}
	};
	ZodObject.create = (shape, params) => {
		return new ZodObject({
			shape: () => shape,
			unknownKeys: "strip",
			catchall: ZodNever.create(),
			typeName: ZodFirstPartyTypeKind.ZodObject,
			...processCreateParams(params)
		});
	};
	ZodObject.strictCreate = (shape, params) => {
		return new ZodObject({
			shape: () => shape,
			unknownKeys: "strict",
			catchall: ZodNever.create(),
			typeName: ZodFirstPartyTypeKind.ZodObject,
			...processCreateParams(params)
		});
	};
	ZodObject.lazycreate = (shape, params) => {
		return new ZodObject({
			shape,
			unknownKeys: "strip",
			catchall: ZodNever.create(),
			typeName: ZodFirstPartyTypeKind.ZodObject,
			...processCreateParams(params)
		});
	};
	var ZodUnion = class extends ZodType {
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			const options = this._def.options;
			function handleResults(results) {
				for (const result of results) if (result.result.status === "valid") return result.result;
				for (const result of results) if (result.result.status === "dirty") {
					ctx.common.issues.push(...result.ctx.common.issues);
					return result.result;
				}
				const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_union,
					unionErrors
				});
				return INVALID;
			}
			if (ctx.common.async) return Promise.all(options.map(async (option) => {
				const childCtx = {
					...ctx,
					common: {
						...ctx.common,
						issues: []
					},
					parent: null
				};
				return {
					result: await option._parseAsync({
						data: ctx.data,
						path: ctx.path,
						parent: childCtx
					}),
					ctx: childCtx
				};
			})).then(handleResults);
			else {
				let dirty = void 0;
				const issues = [];
				for (const option of options) {
					const childCtx = {
						...ctx,
						common: {
							...ctx.common,
							issues: []
						},
						parent: null
					};
					const result = option._parseSync({
						data: ctx.data,
						path: ctx.path,
						parent: childCtx
					});
					if (result.status === "valid") return result;
					else if (result.status === "dirty" && !dirty) dirty = {
						result,
						ctx: childCtx
					};
					if (childCtx.common.issues.length) issues.push(childCtx.common.issues);
				}
				if (dirty) {
					ctx.common.issues.push(...dirty.ctx.common.issues);
					return dirty.result;
				}
				const unionErrors = issues.map((issues) => new ZodError(issues));
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_union,
					unionErrors
				});
				return INVALID;
			}
		}
		get options() {
			return this._def.options;
		}
	};
	ZodUnion.create = (types, params) => {
		return new ZodUnion({
			options: types,
			typeName: ZodFirstPartyTypeKind.ZodUnion,
			...processCreateParams(params)
		});
	};
	var getDiscriminator = (type) => {
		if (type instanceof ZodLazy) return getDiscriminator(type.schema);
		else if (type instanceof ZodEffects) return getDiscriminator(type.innerType());
		else if (type instanceof ZodLiteral) return [type.value];
		else if (type instanceof ZodEnum) return type.options;
		else if (type instanceof ZodNativeEnum) return util.objectValues(type.enum);
		else if (type instanceof ZodDefault) return getDiscriminator(type._def.innerType);
		else if (type instanceof ZodUndefined) return [void 0];
		else if (type instanceof ZodNull) return [null];
		else if (type instanceof ZodOptional) return [void 0, ...getDiscriminator(type.unwrap())];
		else if (type instanceof ZodNullable) return [null, ...getDiscriminator(type.unwrap())];
		else if (type instanceof ZodBranded) return getDiscriminator(type.unwrap());
		else if (type instanceof ZodReadonly) return getDiscriminator(type.unwrap());
		else if (type instanceof ZodCatch) return getDiscriminator(type._def.innerType);
		else return [];
	};
	var ZodDiscriminatedUnion = class ZodDiscriminatedUnion extends ZodType {
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			if (ctx.parsedType !== ZodParsedType.object) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.object,
					received: ctx.parsedType
				});
				return INVALID;
			}
			const discriminator = this.discriminator;
			const discriminatorValue = ctx.data[discriminator];
			const option = this.optionsMap.get(discriminatorValue);
			if (!option) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_union_discriminator,
					options: Array.from(this.optionsMap.keys()),
					path: [discriminator]
				});
				return INVALID;
			}
			if (ctx.common.async) return option._parseAsync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			});
			else return option._parseSync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			});
		}
		get discriminator() {
			return this._def.discriminator;
		}
		get options() {
			return this._def.options;
		}
		get optionsMap() {
			return this._def.optionsMap;
		}
		/**
		* The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
		* However, it only allows a union of objects, all of which need to share a discriminator property. This property must
		* have a different value for each object in the union.
		* @param discriminator the name of the discriminator property
		* @param types an array of object schemas
		* @param params
		*/
		static create(discriminator, options, params) {
			const optionsMap = /* @__PURE__ */ new Map();
			for (const type of options) {
				const discriminatorValues = getDiscriminator(type.shape[discriminator]);
				if (!discriminatorValues.length) throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
				for (const value of discriminatorValues) {
					if (optionsMap.has(value)) throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
					optionsMap.set(value, type);
				}
			}
			return new ZodDiscriminatedUnion({
				typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
				discriminator,
				options,
				optionsMap,
				...processCreateParams(params)
			});
		}
	};
	function mergeValues(a, b) {
		const aType = getParsedType(a);
		const bType = getParsedType(b);
		if (a === b) return {
			valid: true,
			data: a
		};
		else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
			const bKeys = util.objectKeys(b);
			const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
			const newObj = {
				...a,
				...b
			};
			for (const key of sharedKeys) {
				const sharedValue = mergeValues(a[key], b[key]);
				if (!sharedValue.valid) return { valid: false };
				newObj[key] = sharedValue.data;
			}
			return {
				valid: true,
				data: newObj
			};
		} else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
			if (a.length !== b.length) return { valid: false };
			const newArray = [];
			for (let index = 0; index < a.length; index++) {
				const itemA = a[index];
				const itemB = b[index];
				const sharedValue = mergeValues(itemA, itemB);
				if (!sharedValue.valid) return { valid: false };
				newArray.push(sharedValue.data);
			}
			return {
				valid: true,
				data: newArray
			};
		} else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) return {
			valid: true,
			data: a
		};
		else return { valid: false };
	}
	var ZodIntersection = class extends ZodType {
		_parse(input) {
			const { status, ctx } = this._processInputParams(input);
			const handleParsed = (parsedLeft, parsedRight) => {
				if (isAborted(parsedLeft) || isAborted(parsedRight)) return INVALID;
				const merged = mergeValues(parsedLeft.value, parsedRight.value);
				if (!merged.valid) {
					addIssueToContext(ctx, { code: ZodIssueCode.invalid_intersection_types });
					return INVALID;
				}
				if (isDirty(parsedLeft) || isDirty(parsedRight)) status.dirty();
				return {
					status: status.value,
					value: merged.data
				};
			};
			if (ctx.common.async) return Promise.all([this._def.left._parseAsync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			}), this._def.right._parseAsync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			})]).then(([left, right]) => handleParsed(left, right));
			else return handleParsed(this._def.left._parseSync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			}), this._def.right._parseSync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			}));
		}
	};
	ZodIntersection.create = (left, right, params) => {
		return new ZodIntersection({
			left,
			right,
			typeName: ZodFirstPartyTypeKind.ZodIntersection,
			...processCreateParams(params)
		});
	};
	var ZodTuple = class ZodTuple extends ZodType {
		_parse(input) {
			const { status, ctx } = this._processInputParams(input);
			if (ctx.parsedType !== ZodParsedType.array) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.array,
					received: ctx.parsedType
				});
				return INVALID;
			}
			if (ctx.data.length < this._def.items.length) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					minimum: this._def.items.length,
					inclusive: true,
					exact: false,
					type: "array"
				});
				return INVALID;
			}
			if (!this._def.rest && ctx.data.length > this._def.items.length) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					maximum: this._def.items.length,
					inclusive: true,
					exact: false,
					type: "array"
				});
				status.dirty();
			}
			const items = [...ctx.data].map((item, itemIndex) => {
				const schema = this._def.items[itemIndex] || this._def.rest;
				if (!schema) return null;
				return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
			}).filter((x) => !!x);
			if (ctx.common.async) return Promise.all(items).then((results) => {
				return ParseStatus.mergeArray(status, results);
			});
			else return ParseStatus.mergeArray(status, items);
		}
		get items() {
			return this._def.items;
		}
		rest(rest) {
			return new ZodTuple({
				...this._def,
				rest
			});
		}
	};
	ZodTuple.create = (schemas, params) => {
		if (!Array.isArray(schemas)) throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
		return new ZodTuple({
			items: schemas,
			typeName: ZodFirstPartyTypeKind.ZodTuple,
			rest: null,
			...processCreateParams(params)
		});
	};
	var ZodRecord = class ZodRecord extends ZodType {
		get keySchema() {
			return this._def.keyType;
		}
		get valueSchema() {
			return this._def.valueType;
		}
		_parse(input) {
			const { status, ctx } = this._processInputParams(input);
			if (ctx.parsedType !== ZodParsedType.object) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.object,
					received: ctx.parsedType
				});
				return INVALID;
			}
			const pairs = [];
			const keyType = this._def.keyType;
			const valueType = this._def.valueType;
			for (const key in ctx.data) pairs.push({
				key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
				value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
				alwaysSet: key in ctx.data
			});
			if (ctx.common.async) return ParseStatus.mergeObjectAsync(status, pairs);
			else return ParseStatus.mergeObjectSync(status, pairs);
		}
		get element() {
			return this._def.valueType;
		}
		static create(first, second, third) {
			if (second instanceof ZodType) return new ZodRecord({
				keyType: first,
				valueType: second,
				typeName: ZodFirstPartyTypeKind.ZodRecord,
				...processCreateParams(third)
			});
			return new ZodRecord({
				keyType: ZodString.create(),
				valueType: first,
				typeName: ZodFirstPartyTypeKind.ZodRecord,
				...processCreateParams(second)
			});
		}
	};
	var ZodMap = class extends ZodType {
		get keySchema() {
			return this._def.keyType;
		}
		get valueSchema() {
			return this._def.valueType;
		}
		_parse(input) {
			const { status, ctx } = this._processInputParams(input);
			if (ctx.parsedType !== ZodParsedType.map) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.map,
					received: ctx.parsedType
				});
				return INVALID;
			}
			const keyType = this._def.keyType;
			const valueType = this._def.valueType;
			const pairs = [...ctx.data.entries()].map(([key, value], index) => {
				return {
					key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
					value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
				};
			});
			if (ctx.common.async) {
				const finalMap = /* @__PURE__ */ new Map();
				return Promise.resolve().then(async () => {
					for (const pair of pairs) {
						const key = await pair.key;
						const value = await pair.value;
						if (key.status === "aborted" || value.status === "aborted") return INVALID;
						if (key.status === "dirty" || value.status === "dirty") status.dirty();
						finalMap.set(key.value, value.value);
					}
					return {
						status: status.value,
						value: finalMap
					};
				});
			} else {
				const finalMap = /* @__PURE__ */ new Map();
				for (const pair of pairs) {
					const key = pair.key;
					const value = pair.value;
					if (key.status === "aborted" || value.status === "aborted") return INVALID;
					if (key.status === "dirty" || value.status === "dirty") status.dirty();
					finalMap.set(key.value, value.value);
				}
				return {
					status: status.value,
					value: finalMap
				};
			}
		}
	};
	ZodMap.create = (keyType, valueType, params) => {
		return new ZodMap({
			valueType,
			keyType,
			typeName: ZodFirstPartyTypeKind.ZodMap,
			...processCreateParams(params)
		});
	};
	var ZodSet = class ZodSet extends ZodType {
		_parse(input) {
			const { status, ctx } = this._processInputParams(input);
			if (ctx.parsedType !== ZodParsedType.set) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.set,
					received: ctx.parsedType
				});
				return INVALID;
			}
			const def = this._def;
			if (def.minSize !== null) {
				if (ctx.data.size < def.minSize.value) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_small,
						minimum: def.minSize.value,
						type: "set",
						inclusive: true,
						exact: false,
						message: def.minSize.message
					});
					status.dirty();
				}
			}
			if (def.maxSize !== null) {
				if (ctx.data.size > def.maxSize.value) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.too_big,
						maximum: def.maxSize.value,
						type: "set",
						inclusive: true,
						exact: false,
						message: def.maxSize.message
					});
					status.dirty();
				}
			}
			const valueType = this._def.valueType;
			function finalizeSet(elements) {
				const parsedSet = /* @__PURE__ */ new Set();
				for (const element of elements) {
					if (element.status === "aborted") return INVALID;
					if (element.status === "dirty") status.dirty();
					parsedSet.add(element.value);
				}
				return {
					status: status.value,
					value: parsedSet
				};
			}
			const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
			if (ctx.common.async) return Promise.all(elements).then((elements) => finalizeSet(elements));
			else return finalizeSet(elements);
		}
		min(minSize, message) {
			return new ZodSet({
				...this._def,
				minSize: {
					value: minSize,
					message: errorUtil.toString(message)
				}
			});
		}
		max(maxSize, message) {
			return new ZodSet({
				...this._def,
				maxSize: {
					value: maxSize,
					message: errorUtil.toString(message)
				}
			});
		}
		size(size, message) {
			return this.min(size, message).max(size, message);
		}
		nonempty(message) {
			return this.min(1, message);
		}
	};
	ZodSet.create = (valueType, params) => {
		return new ZodSet({
			valueType,
			minSize: null,
			maxSize: null,
			typeName: ZodFirstPartyTypeKind.ZodSet,
			...processCreateParams(params)
		});
	};
	var ZodFunction = class ZodFunction extends ZodType {
		constructor() {
			super(...arguments);
			this.validate = this.implement;
		}
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			if (ctx.parsedType !== ZodParsedType.function) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.function,
					received: ctx.parsedType
				});
				return INVALID;
			}
			function makeArgsIssue(args, error) {
				return makeIssue({
					data: args,
					path: ctx.path,
					errorMaps: [
						ctx.common.contextualErrorMap,
						ctx.schemaErrorMap,
						getErrorMap(),
						errorMap
					].filter((x) => !!x),
					issueData: {
						code: ZodIssueCode.invalid_arguments,
						argumentsError: error
					}
				});
			}
			function makeReturnsIssue(returns, error) {
				return makeIssue({
					data: returns,
					path: ctx.path,
					errorMaps: [
						ctx.common.contextualErrorMap,
						ctx.schemaErrorMap,
						getErrorMap(),
						errorMap
					].filter((x) => !!x),
					issueData: {
						code: ZodIssueCode.invalid_return_type,
						returnTypeError: error
					}
				});
			}
			const params = { errorMap: ctx.common.contextualErrorMap };
			const fn = ctx.data;
			if (this._def.returns instanceof ZodPromise) {
				const me = this;
				return OK(async function(...args) {
					const error = new ZodError([]);
					const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
						error.addIssue(makeArgsIssue(args, e));
						throw error;
					});
					const result = await Reflect.apply(fn, this, parsedArgs);
					return await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
						error.addIssue(makeReturnsIssue(result, e));
						throw error;
					});
				});
			} else {
				const me = this;
				return OK(function(...args) {
					const parsedArgs = me._def.args.safeParse(args, params);
					if (!parsedArgs.success) throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
					const result = Reflect.apply(fn, this, parsedArgs.data);
					const parsedReturns = me._def.returns.safeParse(result, params);
					if (!parsedReturns.success) throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
					return parsedReturns.data;
				});
			}
		}
		parameters() {
			return this._def.args;
		}
		returnType() {
			return this._def.returns;
		}
		args(...items) {
			return new ZodFunction({
				...this._def,
				args: ZodTuple.create(items).rest(ZodUnknown.create())
			});
		}
		returns(returnType) {
			return new ZodFunction({
				...this._def,
				returns: returnType
			});
		}
		implement(func) {
			return this.parse(func);
		}
		strictImplement(func) {
			return this.parse(func);
		}
		static create(args, returns, params) {
			return new ZodFunction({
				args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
				returns: returns || ZodUnknown.create(),
				typeName: ZodFirstPartyTypeKind.ZodFunction,
				...processCreateParams(params)
			});
		}
	};
	var ZodLazy = class extends ZodType {
		get schema() {
			return this._def.getter();
		}
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			return this._def.getter()._parse({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			});
		}
	};
	ZodLazy.create = (getter, params) => {
		return new ZodLazy({
			getter,
			typeName: ZodFirstPartyTypeKind.ZodLazy,
			...processCreateParams(params)
		});
	};
	var ZodLiteral = class extends ZodType {
		_parse(input) {
			if (input.data !== this._def.value) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					received: ctx.data,
					code: ZodIssueCode.invalid_literal,
					expected: this._def.value
				});
				return INVALID;
			}
			return {
				status: "valid",
				value: input.data
			};
		}
		get value() {
			return this._def.value;
		}
	};
	ZodLiteral.create = (value, params) => {
		return new ZodLiteral({
			value,
			typeName: ZodFirstPartyTypeKind.ZodLiteral,
			...processCreateParams(params)
		});
	};
	function createZodEnum(values, params) {
		return new ZodEnum({
			values,
			typeName: ZodFirstPartyTypeKind.ZodEnum,
			...processCreateParams(params)
		});
	}
	var ZodEnum = class ZodEnum extends ZodType {
		_parse(input) {
			if (typeof input.data !== "string") {
				const ctx = this._getOrReturnCtx(input);
				const expectedValues = this._def.values;
				addIssueToContext(ctx, {
					expected: util.joinValues(expectedValues),
					received: ctx.parsedType,
					code: ZodIssueCode.invalid_type
				});
				return INVALID;
			}
			if (!this._cache) this._cache = new Set(this._def.values);
			if (!this._cache.has(input.data)) {
				const ctx = this._getOrReturnCtx(input);
				const expectedValues = this._def.values;
				addIssueToContext(ctx, {
					received: ctx.data,
					code: ZodIssueCode.invalid_enum_value,
					options: expectedValues
				});
				return INVALID;
			}
			return OK(input.data);
		}
		get options() {
			return this._def.values;
		}
		get enum() {
			const enumValues = {};
			for (const val of this._def.values) enumValues[val] = val;
			return enumValues;
		}
		get Values() {
			const enumValues = {};
			for (const val of this._def.values) enumValues[val] = val;
			return enumValues;
		}
		get Enum() {
			const enumValues = {};
			for (const val of this._def.values) enumValues[val] = val;
			return enumValues;
		}
		extract(values, newDef = this._def) {
			return ZodEnum.create(values, {
				...this._def,
				...newDef
			});
		}
		exclude(values, newDef = this._def) {
			return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
				...this._def,
				...newDef
			});
		}
	};
	ZodEnum.create = createZodEnum;
	var ZodNativeEnum = class extends ZodType {
		_parse(input) {
			const nativeEnumValues = util.getValidEnumValues(this._def.values);
			const ctx = this._getOrReturnCtx(input);
			if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
				const expectedValues = util.objectValues(nativeEnumValues);
				addIssueToContext(ctx, {
					expected: util.joinValues(expectedValues),
					received: ctx.parsedType,
					code: ZodIssueCode.invalid_type
				});
				return INVALID;
			}
			if (!this._cache) this._cache = new Set(util.getValidEnumValues(this._def.values));
			if (!this._cache.has(input.data)) {
				const expectedValues = util.objectValues(nativeEnumValues);
				addIssueToContext(ctx, {
					received: ctx.data,
					code: ZodIssueCode.invalid_enum_value,
					options: expectedValues
				});
				return INVALID;
			}
			return OK(input.data);
		}
		get enum() {
			return this._def.values;
		}
	};
	ZodNativeEnum.create = (values, params) => {
		return new ZodNativeEnum({
			values,
			typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
			...processCreateParams(params)
		});
	};
	var ZodPromise = class extends ZodType {
		unwrap() {
			return this._def.type;
		}
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.promise,
					received: ctx.parsedType
				});
				return INVALID;
			}
			return OK((ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data)).then((data) => {
				return this._def.type.parseAsync(data, {
					path: ctx.path,
					errorMap: ctx.common.contextualErrorMap
				});
			}));
		}
	};
	ZodPromise.create = (schema, params) => {
		return new ZodPromise({
			type: schema,
			typeName: ZodFirstPartyTypeKind.ZodPromise,
			...processCreateParams(params)
		});
	};
	var ZodEffects = class extends ZodType {
		innerType() {
			return this._def.schema;
		}
		sourceType() {
			return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
		}
		_parse(input) {
			const { status, ctx } = this._processInputParams(input);
			const effect = this._def.effect || null;
			const checkCtx = {
				addIssue: (arg) => {
					addIssueToContext(ctx, arg);
					if (arg.fatal) status.abort();
					else status.dirty();
				},
				get path() {
					return ctx.path;
				}
			};
			checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
			if (effect.type === "preprocess") {
				const processed = effect.transform(ctx.data, checkCtx);
				if (ctx.common.async) return Promise.resolve(processed).then(async (processed) => {
					if (status.value === "aborted") return INVALID;
					const result = await this._def.schema._parseAsync({
						data: processed,
						path: ctx.path,
						parent: ctx
					});
					if (result.status === "aborted") return INVALID;
					if (result.status === "dirty") return DIRTY(result.value);
					if (status.value === "dirty") return DIRTY(result.value);
					return result;
				});
				else {
					if (status.value === "aborted") return INVALID;
					const result = this._def.schema._parseSync({
						data: processed,
						path: ctx.path,
						parent: ctx
					});
					if (result.status === "aborted") return INVALID;
					if (result.status === "dirty") return DIRTY(result.value);
					if (status.value === "dirty") return DIRTY(result.value);
					return result;
				}
			}
			if (effect.type === "refinement") {
				const executeRefinement = (acc) => {
					const result = effect.refinement(acc, checkCtx);
					if (ctx.common.async) return Promise.resolve(result);
					if (result instanceof Promise) throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
					return acc;
				};
				if (ctx.common.async === false) {
					const inner = this._def.schema._parseSync({
						data: ctx.data,
						path: ctx.path,
						parent: ctx
					});
					if (inner.status === "aborted") return INVALID;
					if (inner.status === "dirty") status.dirty();
					executeRefinement(inner.value);
					return {
						status: status.value,
						value: inner.value
					};
				} else return this._def.schema._parseAsync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				}).then((inner) => {
					if (inner.status === "aborted") return INVALID;
					if (inner.status === "dirty") status.dirty();
					return executeRefinement(inner.value).then(() => {
						return {
							status: status.value,
							value: inner.value
						};
					});
				});
			}
			if (effect.type === "transform") {
				if (ctx.common.async === false) {
					const base = this._def.schema._parseSync({
						data: ctx.data,
						path: ctx.path,
						parent: ctx
					});
					if (!isValid(base)) return INVALID;
					const result = effect.transform(base.value, checkCtx);
					if (result instanceof Promise) throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
					return {
						status: status.value,
						value: result
					};
				} else return this._def.schema._parseAsync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				}).then((base) => {
					if (!isValid(base)) return INVALID;
					return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
						status: status.value,
						value: result
					}));
				});
			}
			util.assertNever(effect);
		}
	};
	ZodEffects.create = (schema, effect, params) => {
		return new ZodEffects({
			schema,
			typeName: ZodFirstPartyTypeKind.ZodEffects,
			effect,
			...processCreateParams(params)
		});
	};
	ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
		return new ZodEffects({
			schema,
			effect: {
				type: "preprocess",
				transform: preprocess
			},
			typeName: ZodFirstPartyTypeKind.ZodEffects,
			...processCreateParams(params)
		});
	};
	var ZodOptional = class extends ZodType {
		_parse(input) {
			if (this._getType(input) === ZodParsedType.undefined) return OK(void 0);
			return this._def.innerType._parse(input);
		}
		unwrap() {
			return this._def.innerType;
		}
	};
	ZodOptional.create = (type, params) => {
		return new ZodOptional({
			innerType: type,
			typeName: ZodFirstPartyTypeKind.ZodOptional,
			...processCreateParams(params)
		});
	};
	var ZodNullable = class extends ZodType {
		_parse(input) {
			if (this._getType(input) === ZodParsedType.null) return OK(null);
			return this._def.innerType._parse(input);
		}
		unwrap() {
			return this._def.innerType;
		}
	};
	ZodNullable.create = (type, params) => {
		return new ZodNullable({
			innerType: type,
			typeName: ZodFirstPartyTypeKind.ZodNullable,
			...processCreateParams(params)
		});
	};
	var ZodDefault = class extends ZodType {
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			let data = ctx.data;
			if (ctx.parsedType === ZodParsedType.undefined) data = this._def.defaultValue();
			return this._def.innerType._parse({
				data,
				path: ctx.path,
				parent: ctx
			});
		}
		removeDefault() {
			return this._def.innerType;
		}
	};
	ZodDefault.create = (type, params) => {
		return new ZodDefault({
			innerType: type,
			typeName: ZodFirstPartyTypeKind.ZodDefault,
			defaultValue: typeof params.default === "function" ? params.default : () => params.default,
			...processCreateParams(params)
		});
	};
	var ZodCatch = class extends ZodType {
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			const newCtx = {
				...ctx,
				common: {
					...ctx.common,
					issues: []
				}
			};
			const result = this._def.innerType._parse({
				data: newCtx.data,
				path: newCtx.path,
				parent: { ...newCtx }
			});
			if (isAsync(result)) return result.then((result) => {
				return {
					status: "valid",
					value: result.status === "valid" ? result.value : this._def.catchValue({
						get error() {
							return new ZodError(newCtx.common.issues);
						},
						input: newCtx.data
					})
				};
			});
			else return {
				status: "valid",
				value: result.status === "valid" ? result.value : this._def.catchValue({
					get error() {
						return new ZodError(newCtx.common.issues);
					},
					input: newCtx.data
				})
			};
		}
		removeCatch() {
			return this._def.innerType;
		}
	};
	ZodCatch.create = (type, params) => {
		return new ZodCatch({
			innerType: type,
			typeName: ZodFirstPartyTypeKind.ZodCatch,
			catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
			...processCreateParams(params)
		});
	};
	var ZodNaN = class extends ZodType {
		_parse(input) {
			if (this._getType(input) !== ZodParsedType.nan) {
				const ctx = this._getOrReturnCtx(input);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: ZodParsedType.nan,
					received: ctx.parsedType
				});
				return INVALID;
			}
			return {
				status: "valid",
				value: input.data
			};
		}
	};
	ZodNaN.create = (params) => {
		return new ZodNaN({
			typeName: ZodFirstPartyTypeKind.ZodNaN,
			...processCreateParams(params)
		});
	};
	var ZodBranded = class extends ZodType {
		_parse(input) {
			const { ctx } = this._processInputParams(input);
			const data = ctx.data;
			return this._def.type._parse({
				data,
				path: ctx.path,
				parent: ctx
			});
		}
		unwrap() {
			return this._def.type;
		}
	};
	var ZodPipeline = class ZodPipeline extends ZodType {
		_parse(input) {
			const { status, ctx } = this._processInputParams(input);
			if (ctx.common.async) {
				const handleAsync = async () => {
					const inResult = await this._def.in._parseAsync({
						data: ctx.data,
						path: ctx.path,
						parent: ctx
					});
					if (inResult.status === "aborted") return INVALID;
					if (inResult.status === "dirty") {
						status.dirty();
						return DIRTY(inResult.value);
					} else return this._def.out._parseAsync({
						data: inResult.value,
						path: ctx.path,
						parent: ctx
					});
				};
				return handleAsync();
			} else {
				const inResult = this._def.in._parseSync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				});
				if (inResult.status === "aborted") return INVALID;
				if (inResult.status === "dirty") {
					status.dirty();
					return {
						status: "dirty",
						value: inResult.value
					};
				} else return this._def.out._parseSync({
					data: inResult.value,
					path: ctx.path,
					parent: ctx
				});
			}
		}
		static create(a, b) {
			return new ZodPipeline({
				in: a,
				out: b,
				typeName: ZodFirstPartyTypeKind.ZodPipeline
			});
		}
	};
	var ZodReadonly = class extends ZodType {
		_parse(input) {
			const result = this._def.innerType._parse(input);
			const freeze = (data) => {
				if (isValid(data)) data.value = Object.freeze(data.value);
				return data;
			};
			return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
		}
		unwrap() {
			return this._def.innerType;
		}
	};
	ZodReadonly.create = (type, params) => {
		return new ZodReadonly({
			innerType: type,
			typeName: ZodFirstPartyTypeKind.ZodReadonly,
			...processCreateParams(params)
		});
	};
	ZodObject.lazycreate;
	var ZodFirstPartyTypeKind;
	(function(ZodFirstPartyTypeKind) {
		ZodFirstPartyTypeKind["ZodString"] = "ZodString";
		ZodFirstPartyTypeKind["ZodNumber"] = "ZodNumber";
		ZodFirstPartyTypeKind["ZodNaN"] = "ZodNaN";
		ZodFirstPartyTypeKind["ZodBigInt"] = "ZodBigInt";
		ZodFirstPartyTypeKind["ZodBoolean"] = "ZodBoolean";
		ZodFirstPartyTypeKind["ZodDate"] = "ZodDate";
		ZodFirstPartyTypeKind["ZodSymbol"] = "ZodSymbol";
		ZodFirstPartyTypeKind["ZodUndefined"] = "ZodUndefined";
		ZodFirstPartyTypeKind["ZodNull"] = "ZodNull";
		ZodFirstPartyTypeKind["ZodAny"] = "ZodAny";
		ZodFirstPartyTypeKind["ZodUnknown"] = "ZodUnknown";
		ZodFirstPartyTypeKind["ZodNever"] = "ZodNever";
		ZodFirstPartyTypeKind["ZodVoid"] = "ZodVoid";
		ZodFirstPartyTypeKind["ZodArray"] = "ZodArray";
		ZodFirstPartyTypeKind["ZodObject"] = "ZodObject";
		ZodFirstPartyTypeKind["ZodUnion"] = "ZodUnion";
		ZodFirstPartyTypeKind["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
		ZodFirstPartyTypeKind["ZodIntersection"] = "ZodIntersection";
		ZodFirstPartyTypeKind["ZodTuple"] = "ZodTuple";
		ZodFirstPartyTypeKind["ZodRecord"] = "ZodRecord";
		ZodFirstPartyTypeKind["ZodMap"] = "ZodMap";
		ZodFirstPartyTypeKind["ZodSet"] = "ZodSet";
		ZodFirstPartyTypeKind["ZodFunction"] = "ZodFunction";
		ZodFirstPartyTypeKind["ZodLazy"] = "ZodLazy";
		ZodFirstPartyTypeKind["ZodLiteral"] = "ZodLiteral";
		ZodFirstPartyTypeKind["ZodEnum"] = "ZodEnum";
		ZodFirstPartyTypeKind["ZodEffects"] = "ZodEffects";
		ZodFirstPartyTypeKind["ZodNativeEnum"] = "ZodNativeEnum";
		ZodFirstPartyTypeKind["ZodOptional"] = "ZodOptional";
		ZodFirstPartyTypeKind["ZodNullable"] = "ZodNullable";
		ZodFirstPartyTypeKind["ZodDefault"] = "ZodDefault";
		ZodFirstPartyTypeKind["ZodCatch"] = "ZodCatch";
		ZodFirstPartyTypeKind["ZodPromise"] = "ZodPromise";
		ZodFirstPartyTypeKind["ZodBranded"] = "ZodBranded";
		ZodFirstPartyTypeKind["ZodPipeline"] = "ZodPipeline";
		ZodFirstPartyTypeKind["ZodReadonly"] = "ZodReadonly";
	})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
	var stringType = ZodString.create;
	var numberType = ZodNumber.create;
	ZodNaN.create;
	ZodBigInt.create;
	var booleanType = ZodBoolean.create;
	ZodDate.create;
	ZodSymbol.create;
	ZodUndefined.create;
	ZodNull.create;
	ZodAny.create;
	var unknownType = ZodUnknown.create;
	ZodNever.create;
	ZodVoid.create;
	var arrayType = ZodArray.create;
	var objectType = ZodObject.create;
	ZodObject.strictCreate;
	var unionType = ZodUnion.create;
	var discriminatedUnionType = ZodDiscriminatedUnion.create;
	ZodIntersection.create;
	ZodTuple.create;
	ZodRecord.create;
	ZodMap.create;
	ZodSet.create;
	ZodFunction.create;
	ZodLazy.create;
	var literalType = ZodLiteral.create;
	var enumType = ZodEnum.create;
	ZodNativeEnum.create;
	ZodPromise.create;
	ZodEffects.create;
	ZodOptional.create;
	ZodNullable.create;
	ZodEffects.createWithPreprocess;
	ZodPipeline.create;
	//#endregion
	//#region src/shared/schemas.ts
	/**
	* 持久化数据与模型响应共用的 Zod Schema。
	* 存储 key 见 docs/技术架构方案 第 10 节：
	* settings:model / job:current / scan:current / plan:current / undo:latest
	*/
	var STORAGE_KEYS = {
		modelSettings: "settings:model",
		job: "job:current",
		scan: "scan:current",
		plan: "plan:current",
		undo: "undo:latest"
	};
	var ModelSettingsSchema = objectType({
		baseUrl: stringType().url().refine((u) => u.startsWith("https://"), { message: "仅支持 HTTPS 的 API Base URL" }),
		apiKey: stringType().min(1),
		model: stringType().min(1)
	});
	var ScanRootSchema = objectType({
		id: stringType(),
		title: stringType()
	});
	var ScanFolderSchema = objectType({
		id: stringType(),
		parentId: stringType(),
		rootId: stringType(),
		title: stringType(),
		/** 相对于所在根目录的目录名路径（不含根目录自身）。 */
		path: arrayType(stringType()),
		depth: numberType().int().nonnegative()
	});
	var ScannedBookmarkSchema = objectType({
		id: stringType(),
		title: stringType(),
		url: stringType(),
		parentId: stringType(),
		rootId: stringType(),
		/** 书签所在目录相对于根目录的目录名路径（不含根目录自身）。 */
		path: arrayType(stringType())
	});
	var ScanResultSchema = objectType({
		scanId: stringType(),
		scannedAt: numberType(),
		roots: arrayType(ScanRootSchema),
		folders: arrayType(ScanFolderSchema),
		bookmarks: arrayType(ScannedBookmarkSchema)
	});
	var PathSegmentSchema = stringType().min(1).max(100);
	/** AI 路径最多两级、至少一级（“未分类”等单级目录也合法）。 */
	var TargetPathSchema = arrayType(PathSegmentSchema).min(1).max(2);
	var AssignmentSchema = objectType({
		bookmarkId: stringType(),
		targetPath: TargetPathSchema,
		reason: stringType().optional()
	});
	var PlanRecordSchema = objectType({
		jobId: stringType(),
		createdAt: numberType(),
		phase: enumType([
			"taxonomy",
			"assign",
			"done"
		]),
		/** 分类体系阶段各批次产出的候选目录，用于断点续跑。 */
		taxonomyCandidates: arrayType(arrayType(PathSegmentSchema).min(1).max(2)).default([]),
		/** 已完成的分类体系批次数。 */
		taxonomyCursor: numberType().int().nonnegative().default(0),
		/** 合并后的最终目录体系，全部为不超过两级的路径。 */
		taxonomy: arrayType(TargetPathSchema).default([]),
		assignments: arrayType(AssignmentSchema).default([]),
		/** 已完成分配的书签数游标，恢复时从这里继续。 */
		assignCursor: numberType().int().nonnegative().default(0)
	});
	var JOB_STATUSES = [
		"idle",
		"scanning",
		"planning",
		"classifying",
		"reviewing",
		"applying",
		"completed",
		"interrupted",
		"undoing",
		"undone",
		"partially_undone",
		"failed"
	];
	var FailureItemSchema = objectType({
		bookmarkId: stringType().optional(),
		kind: enumType(ERROR_KINDS),
		message: stringType()
	});
	var JobStateSchema = objectType({
		jobId: stringType(),
		status: enumType(JOB_STATUSES),
		updatedAt: numberType(),
		/** apply 阶段成功移动的书签数游标。 */
		applyCursor: numberType().int().nonnegative().default(0),
		appliedIds: arrayType(stringType()).default([]),
		/** apply 阶段新建的目录 ID（撤销时只删除这些目录中的空目录）。 */
		createdFolderIds: arrayType(stringType()).default([]),
		/** 用户请求中断写入的标志，Service Worker 在每条写入之间检查。 */
		cancelRequested: booleanType().default(false),
		failures: arrayType(FailureItemSchema).default([]),
		error: FailureItemSchema.optional()
	});
	var UndoMoveSchema = objectType({
		bookmarkId: stringType(),
		fromParentId: stringType(),
		fromIndex: numberType().int().nonnegative(),
		toFolderId: stringType()
	});
	var UndoSnapshotSchema = objectType({
		jobId: stringType(),
		createdAt: numberType(),
		moves: arrayType(UndoMoveSchema),
		createdFolders: arrayType(objectType({
			id: stringType(),
			depth: numberType().int().nonnegative()
		}))
	});
	objectType({ candidates: arrayType(arrayType(stringType()).min(1).max(2)) });
	objectType({ categories: arrayType(arrayType(stringType()).min(1).max(2)) });
	objectType({ assignments: arrayType(objectType({
		bookmarkId: stringType(),
		targetPath: arrayType(stringType()).min(1).max(2),
		reason: stringType().optional()
	})) });
	//#endregion
	//#region src/infrastructure/chrome/storageRepository.ts
	/**
	* chrome.storage.local 适配实现。
	* - 读取时经 Zod 校验，损坏数据返回 null 而不是抛出；
	* - 写入前检查已用空间，接近配额时拒绝并提示（架构方案第 10 节）。
	*/
	function createStorageRepository(area) {
		async function read(key, schema) {
			const raw = (await area.get(key))[key];
			if (raw === void 0 || raw === null) return null;
			const parsed = schema.safeParse(raw);
			return parsed.success ? parsed.data : null;
		}
		async function write(key, value) {
			if (await area.getBytesInUse(null) >= 9961472) throw new AppError("storage_quota", "本地存储空间不足，请缩小整理范围（chrome.storage.local 配额约 10 MB）");
			await area.set({ [key]: value });
		}
		return {
			loadModelSettings: () => read(STORAGE_KEYS.modelSettings, ModelSettingsSchema),
			saveModelSettings: (settings) => write(STORAGE_KEYS.modelSettings, ModelSettingsSchema.parse(settings)),
			loadJob: () => read(STORAGE_KEYS.job, JobStateSchema),
			saveJob: (job) => write(STORAGE_KEYS.job, JobStateSchema.parse(job)),
			loadScan: () => read(STORAGE_KEYS.scan, ScanResultSchema),
			saveScan: (scan) => write(STORAGE_KEYS.scan, ScanResultSchema.parse(scan)),
			loadPlan: () => read(STORAGE_KEYS.plan, PlanRecordSchema),
			savePlan: (plan) => write(STORAGE_KEYS.plan, PlanRecordSchema.parse(plan)),
			loadUndo: () => read(STORAGE_KEYS.undo, UndoSnapshotSchema),
			saveUndo: (snapshot) => write(STORAGE_KEYS.undo, UndoSnapshotSchema.parse(snapshot)),
			async clear(keys) {
				const storageKeys = keys.map((k) => STORAGE_KEYS[k]);
				await area.remove(storageKeys);
			}
		};
	}
	/** 扩展启动时调用：限制 storage.local 仅可信上下文可访问。 */
	async function enforceTrustedContexts() {
		await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
	}
	var RequestSchema = discriminatedUnionType("type", [
		objectType({
			type: literalType("GET_STATUS"),
			requestId: stringType()
		}),
		objectType({
			type: literalType("SCAN_BOOKMARKS"),
			requestId: stringType(),
			jobId: stringType()
		}),
		objectType({
			type: literalType("APPLY_PLAN"),
			requestId: stringType(),
			jobId: stringType()
		}),
		objectType({
			type: literalType("RETRY_FAILED"),
			requestId: stringType(),
			jobId: stringType()
		}),
		objectType({
			type: literalType("UNDO_LAST_APPLY"),
			requestId: stringType(),
			jobId: stringType()
		}),
		objectType({
			type: literalType("CANCEL_JOB"),
			requestId: stringType(),
			jobId: stringType()
		})
	]);
	unionType([objectType({
		ok: literalType(true),
		requestId: stringType(),
		payload: unknownType()
	}), objectType({
		ok: literalType(false),
		requestId: stringType(),
		error: FailureItemSchema
	})]);
	discriminatedUnionType("type", [
		objectType({
			type: literalType("JOB_PROGRESS"),
			jobId: stringType(),
			status: enumType(JOB_STATUSES),
			processed: numberType(),
			total: numberType()
		}),
		objectType({
			type: literalType("JOB_COMPLETED"),
			jobId: stringType(),
			job: JobStateSchema
		}),
		objectType({
			type: literalType("JOB_INTERRUPTED"),
			jobId: stringType(),
			job: JobStateSchema
		}),
		objectType({
			type: literalType("JOB_FAILED"),
			jobId: stringType(),
			job: JobStateSchema
		})
	]);
	/**
	* 校验入站消息；非法或未知类型返回 null，由调用方直接拒绝。
	* 这是边界校验，消息来自同一扩展内的页面，但仍按架构方案要求严格校验。
	*/
	function parseRequest(raw) {
		const result = RequestSchema.safeParse(raw);
		return result.success ? result.data : null;
	}
	//#endregion
	//#region entrypoints/background.ts
	var DASHBOARD_URL = chrome.runtime.getURL("/dashboard.html");
	/**
	* Service Worker：所有书签写操作的唯一入口（架构方案第 3.2 节）。
	* - 点击扩展图标时打开或复用 Dashboard 标签页；
	* - 消息路由：所有入站消息经 Zod 校验，未知命令直接拒绝；
	* - 进度/结果事件 fire-and-forget 广播，Dashboard 不在线时忽略发送失败。
	*/
	function createEventsPort() {
		const fireAndForget = (message) => {
			chrome.runtime.sendMessage(message).catch(() => {});
		};
		return {
			progress: (jobId, status, processed, total) => fireAndForget({
				type: "JOB_PROGRESS",
				jobId,
				status,
				processed,
				total
			}),
			completed: (job) => fireAndForget({
				type: "JOB_COMPLETED",
				jobId: job.jobId,
				job
			}),
			interrupted: (job) => fireAndForget({
				type: "JOB_INTERRUPTED",
				jobId: job.jobId,
				job
			}),
			failed: (job) => fireAndForget({
				type: "JOB_FAILED",
				jobId: job.jobId,
				job
			})
		};
	}
	/** 打开或复用唯一的全页 Dashboard 标签页（扩展对自己的 origin 有访问权，无需 tabs 权限）。 */
	async function openDashboard() {
		const existing = (await chrome.tabs.query({ url: `${DASHBOARD_URL}*` }))[0];
		if (existing?.id !== void 0) {
			await chrome.tabs.update(existing.id, { active: true });
			if (existing.windowId !== void 0) await chrome.windows.update(existing.windowId, { focused: true }).catch(() => void 0);
			return;
		}
		await chrome.tabs.create({
			url: DASHBOARD_URL,
			active: true
		});
	}
	/** 扫描请求的任务解析：可从当前状态继续时复用，否则换新任务重新开始。 */
	async function resolveJobForScan(storage, jobId) {
		const existing = await storage.loadJob();
		if (existing && existing.jobId === jobId && canTransition(existing.status, "scanning")) return existing;
		return {
			jobId,
			status: "idle",
			updatedAt: Date.now(),
			applyCursor: 0,
			appliedIds: [],
			createdFolderIds: [],
			cancelRequested: false,
			failures: []
		};
	}
	async function handleScan(storage, jobId) {
		const job = await resolveJobForScan(storage, jobId);
		return {
			scan: await scanBookmarks({
				bookmarks: createBookmarksRepository(),
				storage,
				events: createEventsPort()
			}, job),
			job: await storage.loadJob() ?? job
		};
	}
	async function handleApply(storage, jobId) {
		const job = await storage.loadJob();
		const scan = await storage.loadScan();
		const plan = await storage.loadPlan();
		if (!job || job.jobId !== jobId) throw new Error("任务不存在或已过期，请重新扫描");
		if (!scan) throw new Error("没有可用的扫描结果，请先扫描");
		if (!plan || plan.jobId !== job.jobId) throw new Error("没有可用的分类方案，请先生成方案");
		return { job: (await applyPlan({
			bookmarks: createBookmarksRepository(),
			storage,
			events: createEventsPort()
		}, job, scan.bookmarks, plan.assignments)).job };
	}
	async function handleUndo(storage, jobId) {
		const job = await storage.loadJob();
		if (!job || job.jobId !== jobId) throw new Error("任务不存在或已过期");
		const result = await undoLastApply({
			bookmarks: createBookmarksRepository(),
			storage,
			events: createEventsPort()
		}, job);
		return {
			job: result.job,
			conflicts: result.conflicts
		};
	}
	/** 标记取消：写入持久化标志，应用/撤销循环在每个书签之间重读检查。 */
	async function handleCancel(storage, jobId) {
		const job = await storage.loadJob();
		if (!job || job.jobId !== jobId) throw new Error("任务不存在或已过期");
		const cancelled = {
			...job,
			cancelRequested: true,
			updatedAt: Date.now()
		};
		await storage.saveJob(cancelled);
		return { job: cancelled };
	}
	/** 失败时把任务落为 failed 状态并广播，保证 Dashboard 重开后可恢复。 */
	async function markFailed(storage, jobId, error) {
		if (!jobId) return;
		const job = await storage.loadJob();
		if (!job || job.jobId !== jobId) return;
		const classified = classifyError(error);
		const failed = {
			...job,
			status: "failed",
			error: {
				kind: classified.kind,
				message: classified.message
			},
			updatedAt: Date.now()
		};
		try {
			await storage.saveJob(failed);
			createEventsPort().failed(failed);
		} catch {}
	}
	var background_default = defineBackground(() => {
		enforceTrustedContexts().catch(() => void 0);
		chrome.action.onClicked.addListener(() => {
			openDashboard();
		});
		chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
			const request = parseRequest(raw);
			if (!request) {
				sendResponse({
					ok: false,
					requestId: typeof raw?.requestId === "string" ? raw.requestId : "",
					error: {
						kind: "validation",
						message: "未知或非法的命令"
					}
				});
				return false;
			}
			const storage = createStorageRepository(chrome.storage.local);
			const requestId = request.requestId;
			const jobId = "jobId" in request ? request.jobId : null;
			(async () => {
				try {
					let payload;
					switch (request.type) {
						case "GET_STATUS":
							payload = await resumeJob({ storage });
							break;
						case "SCAN_BOOKMARKS":
							payload = await handleScan(storage, request.jobId);
							break;
						case "APPLY_PLAN":
						case "RETRY_FAILED":
							payload = await handleApply(storage, request.jobId);
							break;
						case "UNDO_LAST_APPLY":
							payload = await handleUndo(storage, request.jobId);
							break;
						case "CANCEL_JOB": payload = await handleCancel(storage, request.jobId);
					}
					sendResponse({
						ok: true,
						requestId,
						payload
					});
				} catch (error) {
					await markFailed(storage, jobId, error);
					sendResponse({
						ok: false,
						requestId,
						error: classifyError(error)
					});
				}
			})();
			return true;
		});
	});
	//#endregion
	//#region node_modules/wxt/dist/browser.mjs
	/**
	* Contains the `browser` export which you should use to access the extension
	* APIs in your project:
	*
	* ```ts
	* import { browser } from 'wxt/browser';
	*
	* browser.runtime.onInstalled.addListener(() => {
	*   // ...
	* });
	* ```
	*
	* @module wxt/browser
	*/
	var browser = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
	//#endregion
	//#region node_modules/@webext-core/match-patterns/lib/index.mjs
	/**
	* Class for parsing and performing operations on match patterns.
	*
	* @example
	*   const pattern = new MatchPattern('*://google.com/*');
	*
	*   pattern.includes('https://google.com'); // true
	*   pattern.includes('http://youtube.com/watch?v=123'); // false
	*/
	var MatchPattern = class MatchPattern {
		static {
			this.PROTOCOLS = [
				"http",
				"https",
				"file",
				"ftp",
				"urn",
				"ws",
				"wss"
			];
		}
		/**
		* Parse a match pattern string. If it is invalid, the constructor will throw an
		* `InvalidMatchPattern` error.
		*
		* @param matchPattern The match pattern to parse.
		*/
		constructor(matchPattern) {
			if (matchPattern === "<all_urls>") {
				this.isAllUrls = true;
				this.protocolMatches = [...MatchPattern.PROTOCOLS];
				this.hostnameMatch = "*";
				this.pathnameMatch = "*";
			} else {
				const groups = /(.*):\/\/(.*?)(\/.*)/.exec(matchPattern);
				if (groups == null) throw new InvalidMatchPattern(matchPattern, "Incorrect format");
				const [_, protocol, hostname, pathname] = groups;
				validateProtocol(matchPattern, protocol);
				validateHostname(matchPattern, hostname);
				this.protocolMatches = protocol === "*" ? ["http", "https"] : [protocol];
				this.hostnameMatch = hostname;
				this.pathnameMatch = pathname;
			}
		}
		/** Check if a URL is included in a pattern. */
		includes(url) {
			const u = typeof url === "string" ? new URL(url) : url instanceof Location ? new URL(url.href) : url;
			if (this.isAllUrls) return !this.isUnknownProtocol(u);
			return !!this.protocolMatches.find((protocol) => {
				if (protocol === "http") return this.isHttpMatch(u);
				if (protocol === "https") return this.isHttpsMatch(u);
				if (protocol === "file") return this.isFileMatch(u);
				if (protocol === "ftp") return this.isFtpMatch(u);
				if (protocol === "urn") return this.isUrnMatch(u);
			});
		}
		isHttpMatch(url) {
			return url.protocol === "http:" && this.isHostPathMatch(url);
		}
		isHttpsMatch(url) {
			return url.protocol === "https:" && this.isHostPathMatch(url);
		}
		isHostPathMatch(url) {
			if (!this.hostnameMatch || !this.pathnameMatch) return false;
			const hostnameMatchRegexs = [this.convertPatternToRegex(this.hostnameMatch), this.convertPatternToRegex(this.hostnameMatch.replace(/^\*\./, ""))];
			const pathnameMatchRegex = this.convertPatternToRegex(this.pathnameMatch);
			return !!hostnameMatchRegexs.find((regex) => regex.test(url.hostname)) && pathnameMatchRegex.test(url.pathname);
		}
		isUnknownProtocol(url) {
			return !this.protocolMatches.includes(url.protocol.slice(0, -1));
		}
		isPathMatch(url) {
			if (!this.pathnameMatch) return false;
			return this.convertPatternToRegex(this.pathnameMatch).test(url.pathname);
		}
		isFileMatch(url) {
			return url.protocol === "file:" && this.isPathMatch(url);
		}
		isFtpMatch(_url) {
			throw Error("Not implemented: ftp:// pattern matching. Open a PR to add support");
		}
		isUrnMatch(_url) {
			throw Error("Not implemented: urn:// pattern matching. Open a PR to add support");
		}
		convertPatternToRegex(pattern) {
			const starsReplaced = this.escapeForRegex(pattern).replace(/\\\*/g, ".*");
			return RegExp(`^${starsReplaced}$`);
		}
		escapeForRegex(string) {
			return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
	};
	var InvalidMatchPattern = class extends Error {
		constructor(matchPattern, reason) {
			super(`Invalid match pattern "${matchPattern}": ${reason}`);
		}
	};
	function validateProtocol(matchPattern, protocol) {
		if (!MatchPattern.PROTOCOLS.includes(protocol) && protocol !== "*") throw new InvalidMatchPattern(matchPattern, `${protocol} not a valid protocol (${MatchPattern.PROTOCOLS.join(", ")})`);
	}
	function validateHostname(matchPattern, hostname) {
		if (hostname.includes(":")) throw new InvalidMatchPattern(matchPattern, `Hostname cannot include a port`);
		if (hostname.includes("*") && hostname.length > 1 && !hostname.startsWith("*.")) throw new InvalidMatchPattern(matchPattern, `If using a wildcard (*), it must go at the start of the hostname`);
	}
	//#endregion
	//#region \0virtual:wxt-background-entrypoint?/Users/zhangzhenghe/stone/ai-bookmark-organizer/entrypoints/background.ts
	function print(method, ...args) {
		if (typeof args[0] === "string") method(`[wxt] ${args.shift()}`, ...args);
		else method("[wxt]", ...args);
	}
	/** Wrapper around `console` with a "[wxt]" prefix */
	var logger = {
		debug: (...args) => print(console.debug, ...args),
		log: (...args) => print(console.log, ...args),
		warn: (...args) => print(console.warn, ...args),
		error: (...args) => print(console.error, ...args)
	};
	var ws;
	/** Connect to the websocket and listen for messages. */
	function getDevServerWebSocket() {
		if (ws == null) {
			const serverUrl = "ws://localhost:3000";
			logger.debug("Connecting to dev server @", serverUrl);
			ws = new WebSocket(serverUrl, "vite-hmr");
			ws.addWxtEventListener = ws.addEventListener.bind(ws);
			ws.sendCustom = (event, payload) => ws?.send(JSON.stringify({
				type: "custom",
				event,
				payload
			}));
			ws.addEventListener("open", () => {
				logger.debug("Connected to dev server");
			});
			ws.addEventListener("close", () => {
				logger.debug("Disconnected from dev server");
			});
			ws.addEventListener("error", (event) => {
				logger.error("Failed to connect to dev server", event);
			});
			ws.addEventListener("message", (e) => {
				try {
					const message = JSON.parse(e.data);
					if (message.type === "custom") ws?.dispatchEvent(new CustomEvent(message.event, { detail: message.data }));
				} catch (err) {
					logger.error("Failed to handle message", err);
				}
			});
		}
		return ws;
	}
	/** https://developer.chrome.com/blog/longer-esw-lifetimes/ */
	function keepServiceWorkerAlive() {
		setInterval(async () => {
			await browser.runtime.getPlatformInfo();
		}, 5e3);
	}
	function reloadContentScript(payload) {
		if (browser.runtime.getManifest().manifest_version == 2) reloadContentScriptMv2(payload);
		else reloadContentScriptMv3(payload);
	}
	async function reloadContentScriptMv3({ registration, contentScript }) {
		if (registration === "runtime") await reloadRuntimeContentScriptMv3(contentScript);
		else await reloadManifestContentScriptMv3(contentScript);
	}
	async function reloadManifestContentScriptMv3(contentScript) {
		const id = `wxt:${contentScript.js[0]}`;
		logger.log("Reloading content script:", contentScript);
		const registered = await browser.scripting.getRegisteredContentScripts();
		logger.debug("Existing scripts:", registered);
		const existing = registered.find((cs) => cs.id === id);
		if (existing) {
			logger.debug("Updating content script", existing);
			await browser.scripting.updateContentScripts([{
				...contentScript,
				id,
				css: contentScript.css ?? []
			}]);
		} else {
			logger.debug("Registering new content script...");
			await browser.scripting.registerContentScripts([{
				...contentScript,
				id,
				css: contentScript.css ?? []
			}]);
		}
		await reloadTabsForContentScript(contentScript);
	}
	async function reloadRuntimeContentScriptMv3(contentScript) {
		logger.log("Reloading content script:", contentScript);
		const registered = await browser.scripting.getRegisteredContentScripts();
		logger.debug("Existing scripts:", registered);
		const matches = registered.filter((cs) => {
			const hasJs = contentScript.js?.find((js) => cs.js?.includes(js));
			const hasCss = contentScript.css?.find((css) => cs.css?.includes(css));
			return hasJs || hasCss;
		});
		if (matches.length === 0) {
			logger.log("Content script is not registered yet, nothing to reload", contentScript);
			return;
		}
		await browser.scripting.updateContentScripts(matches);
		await reloadTabsForContentScript(contentScript);
	}
	async function reloadTabsForContentScript(contentScript) {
		const allTabs = await browser.tabs.query({});
		const matchPatterns = contentScript.matches.map((match) => new MatchPattern(match));
		const matchingTabs = allTabs.filter((tab) => {
			const url = tab.url;
			if (!url) return false;
			return !!matchPatterns.find((pattern) => pattern.includes(url));
		});
		await Promise.all(matchingTabs.map(async (tab) => {
			try {
				await browser.tabs.reload(tab.id);
			} catch (err) {
				logger.warn("Failed to reload tab:", err);
			}
		}));
	}
	async function reloadContentScriptMv2(_payload) {
		throw Error("TODO: reloadContentScriptMv2");
	}
	try {
		const ws = getDevServerWebSocket();
		ws.addWxtEventListener("wxt:reload-extension", () => {
			browser.runtime.reload();
		});
		ws.addWxtEventListener("wxt:reload-content-script", (event) => {
			reloadContentScript(event.detail);
		});
		ws.addEventListener("open", () => ws.sendCustom("wxt:background-initialized"));
		keepServiceWorkerAlive();
	} catch (err) {
		logger.error("Failed to setup web socket connection with dev server", err);
	}
	browser.commands.onCommand.addListener((command) => {
		if (command === "wxt:reload-extension") browser.runtime.reload();
	});
	var result;
	try {
		result = background_default.main();
		if (result instanceof Promise) console.warn("The background's main() function return a promise, but it must be synchronous");
	} catch (err) {
		logger.error("The background crashed on startup!");
		throw err;
	}
	//#endregion
	return result;
})();

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2dyb3VuZC5qcyIsIm5hbWVzIjpbImRlZmF1bHRFcnJvck1hcCIsImRlZmF1bHRFcnJvck1hcCIsInJlZ2V4IiwiZGVmYXVsdEVycm9yTWFwIiwiYnJvd3NlciJdLCJzb3VyY2VzIjpbIi4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9kZWZpbmUtYmFja2dyb3VuZC5tanMiLCIuLi8uLi9zcmMvZG9tYWluL2Jvb2ttYXJrcy90eXBlcy50cyIsIi4uLy4uL3NyYy9kb21haW4vYm9va21hcmtzL3RyZWUudHMiLCIuLi8uLi9zcmMvZG9tYWluL29yZ2FuaXplL3N0YXRlTWFjaGluZS50cyIsIi4uLy4uL3NyYy9hcHBsaWNhdGlvbi9zY2FuQm9va21hcmtzLnRzIiwiLi4vLi4vc3JjL3NoYXJlZC9lcnJvcnMudHMiLCIuLi8uLi9zcmMvYXBwbGljYXRpb24vYXBwbHlQbGFuLnRzIiwiLi4vLi4vc3JjL2RvbWFpbi91bmRvL3NuYXBzaG90LnRzIiwiLi4vLi4vc3JjL2FwcGxpY2F0aW9uL3VuZG9MYXN0QXBwbHkudHMiLCIuLi8uLi9zcmMvYXBwbGljYXRpb24vcmVzdW1lSm9iLnRzIiwiLi4vLi4vc3JjL2luZnJhc3RydWN0dXJlL2Nocm9tZS9ib29rbWFya3NSZXBvc2l0b3J5LnRzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3pvZC92My9oZWxwZXJzL3V0aWwuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvem9kL3YzL1pvZEVycm9yLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3pvZC92My9sb2NhbGVzL2VuLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3pvZC92My9lcnJvcnMuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvem9kL3YzL2hlbHBlcnMvcGFyc2VVdGlsLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3pvZC92My9oZWxwZXJzL2Vycm9yVXRpbC5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy96b2QvdjMvdHlwZXMuanMiLCIuLi8uLi9zcmMvc2hhcmVkL3NjaGVtYXMudHMiLCIuLi8uLi9zcmMvaW5mcmFzdHJ1Y3R1cmUvY2hyb21lL3N0b3JhZ2VSZXBvc2l0b3J5LnRzIiwiLi4vLi4vc3JjL3NoYXJlZC9tZXNzYWdlcy50cyIsIi4uLy4uL2VudHJ5cG9pbnRzL2JhY2tncm91bmQudHMiLCIuLi8uLi9ub2RlX21vZHVsZXMvQHd4dC1kZXYvYnJvd3Nlci9zcmMvaW5kZXgubWpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIubWpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL0B3ZWJleHQtY29yZS9tYXRjaC1wYXR0ZXJucy9saWIvaW5kZXgubWpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vI3JlZ2lvbiBzcmMvdXRpbHMvZGVmaW5lLWJhY2tncm91bmQudHNcbmZ1bmN0aW9uIGRlZmluZUJhY2tncm91bmQoYXJnKSB7XG5cdGlmIChhcmcgPT0gbnVsbCB8fCB0eXBlb2YgYXJnID09PSBcImZ1bmN0aW9uXCIpIHJldHVybiB7IG1haW46IGFyZyB9O1xuXHRyZXR1cm4gYXJnO1xufVxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBkZWZpbmVCYWNrZ3JvdW5kIH07XG4iLCIvKipcbiAqIENocm9tZSDkuabnrb7moJHnmoTnuq/mlbDmja7ooajnpLrvvIzkuI4gY2hyb21lLmJvb2ttYXJrcy5Cb29rbWFya1RyZWVOb2RlIOe7k+aehOWFvOWuue+8jFxuICog5L2G5LiN5Y+N5ZCR5L6d6LWW5rWP6KeI5ZmoIEFQSe+8iOaetuaehOaWueahiOesrCA0IOiKguS+nei1luaWueWQkee6puadn++8ieOAglxuICovXG5leHBvcnQgaW50ZXJmYWNlIEJvb2ttYXJrTm9kZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHBhcmVudElkPzogc3RyaW5nO1xuICBpbmRleD86IG51bWJlcjtcbiAgdGl0bGU6IHN0cmluZztcbiAgLyoqIOWtmOWcqCB1cmwg6KGo56S65Lmm562+6IqC54K577yM5ZCm5YiZ5piv55uu5b2V6IqC54K544CCICovXG4gIHVybD86IHN0cmluZztcbiAgdW5tb2RpZmlhYmxlPzogYm9vbGVhbiB8IHN0cmluZztcbiAgZm9sZGVyVHlwZT86IHN0cmluZztcbiAgY2hpbGRyZW4/OiBCb29rbWFya05vZGVbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRm9sZGVyKG5vZGU6IEJvb2ttYXJrTm9kZSk6IGJvb2xlYW4ge1xuICByZXR1cm4gbm9kZS51cmwgPT09IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzVW5tb2RpZmlhYmxlKG5vZGU6IEJvb2ttYXJrTm9kZSk6IGJvb2xlYW4ge1xuICByZXR1cm4gbm9kZS51bm1vZGlmaWFibGUgIT09IHVuZGVmaW5lZCAmJiBub2RlLnVubW9kaWZpYWJsZSAhPT0gZmFsc2U7XG59XG4iLCJpbXBvcnQgdHlwZSB7IFNjYW5Gb2xkZXIsIFNjYW5SZXN1bHQsIFNjYW5uZWRCb29rbWFyayB9IGZyb20gJy4uLy4uL3NoYXJlZC9zY2hlbWFzJztcbmltcG9ydCB0eXBlIHsgQm9va21hcmtOb2RlIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBpc0ZvbGRlciwgaXNVbm1vZGlmaWFibGUgfSBmcm9tICcuL3R5cGVzJztcblxuLyoqXG4gKiDor4bliKsgQ2hyb21lIOezu+e7n+agueebruW9le+8iOS5puetvuagjyAvIOWFtuS7luS5puetviAvIOenu+WKqOiuvuWkh+S5puetvuetie+8ieOAglxuICog5LiN56Gs57yW56CB5qC555uu5b2VIElE77yaZ2V0VHJlZSgpIOmhtuWxguiKgueCueeahOebtOaOpeWtkOiKgueCueWNs+S4uuezu+e7n+agueebruW9le+8iOW4piBmb2xkZXJUeXBl77yJ77yMXG4gKiDoi6XpobblsYLmnKzouqvlt7LmmK/lpJrkuKroioLngrnliJnlj5bmiYDmnInml6AgcGFyZW50SWQg55qE6IqC54K544CCXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpZGVudGlmeVJvb3RzKHRyZWU6IEJvb2ttYXJrTm9kZVtdKTogQm9va21hcmtOb2RlW10ge1xuICBpZiAodHJlZS5sZW5ndGggPT09IDEgJiYgdHJlZVswXT8uY2hpbGRyZW4/Lmxlbmd0aCkge1xuICAgIGNvbnN0IHRvcCA9IHRyZWVbMF07XG4gICAgY29uc3QgY2hpbGRyZW4gPSB0b3AuY2hpbGRyZW47XG4gICAgLy8g6Kem5LiN5Y+v5L+u5pS555qE6Jma5ouf5qC577yIaWQg6YCa5bi45Li6IFwiMFwi77yJ77yM5YW25a2Q6IqC54K55Li657O757uf5qC555uu5b2V44CCXG4gICAgaWYgKCF0b3AucGFyZW50SWQgJiYgY2hpbGRyZW4gJiYgY2hpbGRyZW4uZXZlcnkoKGMpID0+IGlzRm9sZGVyKGMpKSkge1xuICAgICAgcmV0dXJuIGNoaWxkcmVuO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdHJlZS5maWx0ZXIoKG4pID0+ICFuLnBhcmVudElkICYmIGlzRm9sZGVyKG4pKTtcbn1cblxuaW50ZXJmYWNlIFdhbGtDb250ZXh0IHtcbiAgcm9vdElkOiBzdHJpbmc7XG4gIC8qKiDlvZPliY3nm67lvZXnm7jlr7nmoLnnm67lvZXnmoTnm67lvZXlkI3ot6/lvoTvvIjkuI3lkKvmoLnnm67lvZXoh6rouqvvvInjgIIgKi9cbiAgcGF0aDogc3RyaW5nW107XG4gIGRlcHRoOiBudW1iZXI7XG59XG5cbi8qKlxuICog5bCG5Lmm562+5qCR5omB5bmz5YyW5Li65LiA5qyh5LiA6Ie055qE5omr5o+P57uT5p6c44CCXG4gKiAtIOS7peiKgueCuSBJRCDkuLrlhoXpg6jkuLvplK7vvIzkuI3ku6XmoIfpopjmiJYgVVJMIOS9nOi6q+S7veagh+ivhu+8m1xuICogLSDot7Pov4fkuI3lj6/kv67mlLnoioLngrnlj4rlhbbmlbTkuKrlrZDmoJHvvIjmnrbmnoTmlrnmoYjnrKwgNyDoioLvvInjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkU2NhblJlc3VsdChcbiAgdHJlZTogQm9va21hcmtOb2RlW10sXG4gIHNjYW5JZDogc3RyaW5nLFxuICBzY2FubmVkQXQgPSBEYXRlLm5vdygpLFxuKTogU2NhblJlc3VsdCB7XG4gIGNvbnN0IHJvb3RzID0gaWRlbnRpZnlSb290cyh0cmVlKS5tYXAoKHIpID0+ICh7IGlkOiByLmlkLCB0aXRsZTogci50aXRsZSB9KSk7XG4gIGNvbnN0IHJvb3RJZHMgPSBuZXcgU2V0KHJvb3RzLm1hcCgocikgPT4gci5pZCkpO1xuICBjb25zdCBmb2xkZXJzOiBTY2FuRm9sZGVyW10gPSBbXTtcbiAgY29uc3QgYm9va21hcmtzOiBTY2FubmVkQm9va21hcmtbXSA9IFtdO1xuXG4gIGNvbnN0IHdhbGsgPSAobm9kZTogQm9va21hcmtOb2RlLCBjdHg6IFdhbGtDb250ZXh0KTogdm9pZCA9PiB7XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuID8/IFtdKSB7XG4gICAgICBpZiAoaXNVbm1vZGlmaWFibGUoY2hpbGQpKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKGlzRm9sZGVyKGNoaWxkKSkge1xuICAgICAgICBjb25zdCBmb2xkZXJQYXRoID0gWy4uLmN0eC5wYXRoLCBjaGlsZC50aXRsZV07XG4gICAgICAgIGZvbGRlcnMucHVzaCh7XG4gICAgICAgICAgaWQ6IGNoaWxkLmlkLFxuICAgICAgICAgIHBhcmVudElkOiBub2RlLmlkLFxuICAgICAgICAgIHJvb3RJZDogY3R4LnJvb3RJZCxcbiAgICAgICAgICB0aXRsZTogY2hpbGQudGl0bGUsXG4gICAgICAgICAgcGF0aDogZm9sZGVyUGF0aCxcbiAgICAgICAgICBkZXB0aDogY3R4LmRlcHRoICsgMSxcbiAgICAgICAgfSk7XG4gICAgICAgIHdhbGsoY2hpbGQsIHsgcm9vdElkOiBjdHgucm9vdElkLCBwYXRoOiBmb2xkZXJQYXRoLCBkZXB0aDogY3R4LmRlcHRoICsgMSB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJvb2ttYXJrcy5wdXNoKHtcbiAgICAgICAgICBpZDogY2hpbGQuaWQsXG4gICAgICAgICAgdGl0bGU6IGNoaWxkLnRpdGxlLFxuICAgICAgICAgIHVybDogY2hpbGQudXJsID8/ICcnLFxuICAgICAgICAgIHBhcmVudElkOiBub2RlLmlkLFxuICAgICAgICAgIHJvb3RJZDogY3R4LnJvb3RJZCxcbiAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIGZvciAoY29uc3Qgcm9vdCBvZiBpZGVudGlmeVJvb3RzKHRyZWUpKSB7XG4gICAgaWYgKCFyb290SWRzLmhhcyhyb290LmlkKSkgY29udGludWU7XG4gICAgd2Fsayhyb290LCB7IHJvb3RJZDogcm9vdC5pZCwgcGF0aDogW10sIGRlcHRoOiAwIH0pO1xuICB9XG5cbiAgcmV0dXJuIHsgc2NhbklkLCBzY2FubmVkQXQsIHJvb3RzLCBmb2xkZXJzLCBib29rbWFya3MgfTtcbn1cbiIsImltcG9ydCB0eXBlIHsgSm9iU3RhdHVzIH0gZnJvbSAnLi4vLi4vc2hhcmVkL3NjaGVtYXMnO1xuXG4vKipcbiAqIOS7u+WKoeeKtuaAgeacuu+8iOaetuaehOaWueahiOesrCA1IOiKgu+8ieOAglxuICogZmFpbGVkIOS5i+WQjuWFgeiuuOmHjeaWsOW8gOWni+aJq+aPj++8jOS5n+WFgeiuuOS7juaMgeS5heWMlua4uOagh+mHjeivleWksei0peeahOW6lOeUqO+8iE1WUCDmiafooYznu5PmnpzpobXnmoTigJzph43or5XigJ3lhaXlj6PvvInvvJtcbiAqIHVuZG9uZS9wYXJ0aWFsbHlfdW5kb25lIOS4uue7iOaAgeaIluWFgeiuuOmHjeivleaSpOmUgOOAglxuICovXG5jb25zdCBUUkFOU0lUSU9OUzogUmVhZG9ubHk8UmVjb3JkPEpvYlN0YXR1cywgcmVhZG9ubHkgSm9iU3RhdHVzW10+PiA9IHtcbiAgaWRsZTogWydzY2FubmluZyddLFxuICBzY2FubmluZzogWydwbGFubmluZycsICdmYWlsZWQnXSxcbiAgcGxhbm5pbmc6IFsnY2xhc3NpZnlpbmcnLCAnZmFpbGVkJ10sXG4gIGNsYXNzaWZ5aW5nOiBbJ3Jldmlld2luZycsICdmYWlsZWQnXSxcbiAgcmV2aWV3aW5nOiBbJ2FwcGx5aW5nJywgJ3NjYW5uaW5nJ10sXG4gIGFwcGx5aW5nOiBbJ2NvbXBsZXRlZCcsICdpbnRlcnJ1cHRlZCcsICdmYWlsZWQnXSxcbiAgaW50ZXJydXB0ZWQ6IFsnYXBwbHlpbmcnLCAndW5kb2luZyddLFxuICBjb21wbGV0ZWQ6IFsndW5kb2luZyddLFxuICB1bmRvaW5nOiBbJ3VuZG9uZScsICdwYXJ0aWFsbHlfdW5kb25lJywgJ2ZhaWxlZCddLFxuICB1bmRvbmU6IFsnc2Nhbm5pbmcnXSxcbiAgcGFydGlhbGx5X3VuZG9uZTogWyd1bmRvaW5nJywgJ3NjYW5uaW5nJ10sXG4gIGZhaWxlZDogWydzY2FubmluZycsICdhcHBseWluZyddLFxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNhblRyYW5zaXRpb24oZnJvbTogSm9iU3RhdHVzLCB0bzogSm9iU3RhdHVzKTogYm9vbGVhbiB7XG4gIHJldHVybiBUUkFOU0lUSU9OU1tmcm9tXS5pbmNsdWRlcyh0byk7XG59XG5cbmV4cG9ydCBjbGFzcyBJbGxlZ2FsVHJhbnNpdGlvbkVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihcbiAgICByZWFkb25seSBmcm9tOiBKb2JTdGF0dXMsXG4gICAgcmVhZG9ubHkgdG86IEpvYlN0YXR1cyxcbiAgKSB7XG4gICAgc3VwZXIoYOmdnuazleS7u+WKoeeKtuaAgei/geenuzogJHtmcm9tfSAtPiAke3RvfWApO1xuICAgIHRoaXMubmFtZSA9ICdJbGxlZ2FsVHJhbnNpdGlvbkVycm9yJztcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0VHJhbnNpdGlvbihmcm9tOiBKb2JTdGF0dXMsIHRvOiBKb2JTdGF0dXMpOiB2b2lkIHtcbiAgaWYgKCFjYW5UcmFuc2l0aW9uKGZyb20sIHRvKSkge1xuICAgIHRocm93IG5ldyBJbGxlZ2FsVHJhbnNpdGlvbkVycm9yKGZyb20sIHRvKTtcbiAgfVxufVxuXG4vKiog5ZCM5LiA5pe26Ze05Y+q5YWB6K645LiA5Liq5Lya5L+u5pS55Lmm562+55qE5Lu75Yqh77ya6L+Z5Lik5Liq54q25oCB5pyf6Ze05ouS57ud5paw55qE5bqU55So6K+35rGC44CCICovXG5leHBvcnQgZnVuY3Rpb24gaXNXcml0ZUxvY2tlZChzdGF0dXM6IEpvYlN0YXR1cyk6IGJvb2xlYW4ge1xuICByZXR1cm4gc3RhdHVzID09PSAnYXBwbHlpbmcnIHx8IHN0YXR1cyA9PT0gJ3VuZG9pbmcnO1xufVxuIiwiaW1wb3J0IHR5cGUgeyBCb29rbWFya3NQb3J0LCBFdmVudHNQb3J0LCBTdG9yYWdlUG9ydCB9IGZyb20gJy4vcG9ydHMnO1xuaW1wb3J0IHsgYnVpbGRTY2FuUmVzdWx0IH0gZnJvbSAnLi4vZG9tYWluL2Jvb2ttYXJrcy90cmVlJztcbmltcG9ydCB7IGFzc2VydFRyYW5zaXRpb24gfSBmcm9tICcuLi9kb21haW4vb3JnYW5pemUvc3RhdGVNYWNoaW5lJztcbmltcG9ydCB0eXBlIHsgSm9iU3RhdGUsIFNjYW5SZXN1bHQgfSBmcm9tICcuLi9zaGFyZWQvc2NoZW1hcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NhbkRlcHMge1xuICBib29rbWFya3M6IEJvb2ttYXJrc1BvcnQ7XG4gIHN0b3JhZ2U6IFN0b3JhZ2VQb3J0O1xuICBldmVudHM/OiBFdmVudHNQb3J0O1xuICBub3c/OiAoKSA9PiBudW1iZXI7XG4gIG5ld0lkPzogKCkgPT4gc3RyaW5nO1xufVxuXG4vKipcbiAqIOaJq+aPj+aVtOajteS5puetvuagkeW5tuaMgeS5heWMluS4gOasoeS4gOiHtOeahOe7k+aenOOAglxuICog55SxIFNlcnZpY2UgV29ya2VyIOiwg+eUqO+8m0Rhc2hib2FyZCDpgJrov4fmtojmga/op6blj5HjgIJcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNjYW5Cb29rbWFya3MoZGVwczogU2NhbkRlcHMsIGpvYjogSm9iU3RhdGUpOiBQcm9taXNlPFNjYW5SZXN1bHQ+IHtcbiAgY29uc3QgeyBzdG9yYWdlLCBib29rbWFya3MsIGV2ZW50cyB9ID0gZGVwcztcbiAgY29uc3Qgbm93ID0gZGVwcy5ub3cgPz8gKCgpID0+IERhdGUubm93KCkpO1xuICBjb25zdCBuZXdJZCA9IGRlcHMubmV3SWQgPz8gKCgpID0+IGNyeXB0by5yYW5kb21VVUlEKCkpO1xuXG4gIGFzc2VydFRyYW5zaXRpb24oam9iLnN0YXR1cywgJ3NjYW5uaW5nJyk7XG4gIGNvbnN0IHdvcmtpbmc6IEpvYlN0YXRlID0geyAuLi5qb2IsIHN0YXR1czogJ3NjYW5uaW5nJywgdXBkYXRlZEF0OiBub3coKSB9O1xuICBhd2FpdCBzdG9yYWdlLnNhdmVKb2Iod29ya2luZyk7XG5cbiAgY29uc3QgdHJlZSA9IGF3YWl0IGJvb2ttYXJrcy5nZXRUcmVlKCk7XG4gIGNvbnN0IHNjYW4gPSBidWlsZFNjYW5SZXN1bHQodHJlZSwgbmV3SWQoKSwgbm93KCkpO1xuICBhd2FpdCBzdG9yYWdlLnNhdmVTY2FuKHNjYW4pO1xuXG4gIGNvbnN0IGRvbmU6IEpvYlN0YXRlID0geyAuLi53b3JraW5nLCBzdGF0dXM6ICdwbGFubmluZycsIHVwZGF0ZWRBdDogbm93KCkgfTtcbiAgYXdhaXQgc3RvcmFnZS5zYXZlSm9iKGRvbmUpO1xuICBldmVudHM/LnByb2dyZXNzKGRvbmUuam9iSWQsIGRvbmUuc3RhdHVzLCBzY2FuLmJvb2ttYXJrcy5sZW5ndGgsIHNjYW4uYm9va21hcmtzLmxlbmd0aCk7XG4gIHJldHVybiBzY2FuO1xufVxuIiwiLyoqXG4gKiDlj6/lsZXnpLrnmoTplJnor6/liIbnsbvjgIJcbiAqIOazqOaEj++8mmVycm9yS2luZCDmnprkuL7lv4XpobvkuI4gZG9jcy/mioDmnK/mnrbmnoTmlrnmoYgg56ysIDUg6IqC55qE5aSx6LSl6aG56K+t5LmJ5L+d5oyB5LiA6Ie077yMXG4gKiDkuJTku7vkvZXliIbmlK/pg73kuI3lvpfmkLrluKYgQVBJIEtleSDnrYnmlY/mhJ/kv6Hmga/jgIJcbiAqL1xuZXhwb3J0IGNvbnN0IEVSUk9SX0tJTkRTID0gW1xuICAnbm90X2NvbmZpZ3VyZWQnLFxuICAnbmV0d29yaycsXG4gICdyYXRlX2xpbWl0ZWQnLFxuICAnaW52YWxpZF9yZXNwb25zZScsXG4gICd2YWxpZGF0aW9uJyxcbiAgJ3Blcm1pc3Npb24nLFxuICAnc3RvcmFnZV9xdW90YScsXG4gICd1c2VyX2NvbmZsaWN0JyxcbiAgJ2Fib3J0ZWQnLFxuICAndW5rbm93bicsXG5dIGFzIGNvbnN0O1xuXG5leHBvcnQgdHlwZSBFcnJvcktpbmQgPSAodHlwZW9mIEVSUk9SX0tJTkRTKVtudW1iZXJdO1xuXG5leHBvcnQgaW50ZXJmYWNlIENsYXNzaWZpZWRFcnJvciB7XG4gIGtpbmQ6IEVycm9yS2luZDtcbiAgbWVzc2FnZTogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQXBwRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIHJlYWRvbmx5IGtpbmQ6IEVycm9yS2luZDtcblxuICBjb25zdHJ1Y3RvcihraW5kOiBFcnJvcktpbmQsIG1lc3NhZ2U6IHN0cmluZykge1xuICAgIHN1cGVyKG1lc3NhZ2UpO1xuICAgIHRoaXMubmFtZSA9ICdBcHBFcnJvcic7XG4gICAgdGhpcy5raW5kID0ga2luZDtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBcHBFcnJvcihlcnJvcjogdW5rbm93bik6IGVycm9yIGlzIEFwcEVycm9yIHtcbiAgcmV0dXJuIGVycm9yIGluc3RhbmNlb2YgQXBwRXJyb3I7XG59XG5cbi8qKiDlsIbku7vmhI/lvILluLjlvZLkuIDljJbkuLrlj6/lsZXnpLrplJnor6/vvIzpgb/lhY3lkJHkuIrlsYLmipvlh7rljp/lp4vlr7nosaHjgIIgKi9cbmV4cG9ydCBmdW5jdGlvbiBjbGFzc2lmeUVycm9yKGVycm9yOiB1bmtub3duKTogQ2xhc3NpZmllZEVycm9yIHtcbiAgaWYgKGlzQXBwRXJyb3IoZXJyb3IpKSB7XG4gICAgcmV0dXJuIHsga2luZDogZXJyb3Iua2luZCwgbWVzc2FnZTogZXJyb3IubWVzc2FnZSB9O1xuICB9XG4gIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgcmV0dXJuIHsga2luZDogJ3Vua25vd24nLCBtZXNzYWdlOiBlcnJvci5tZXNzYWdlIH07XG4gIH1cbiAgcmV0dXJuIHsga2luZDogJ3Vua25vd24nLCBtZXNzYWdlOiBTdHJpbmcoZXJyb3IpIH07XG59XG4iLCJpbXBvcnQgdHlwZSB7IEJvb2ttYXJrc1BvcnQsIEV2ZW50c1BvcnQsIFN0b3JhZ2VQb3J0IH0gZnJvbSAnLi9wb3J0cyc7XG5pbXBvcnQgeyBhc3NlcnRUcmFuc2l0aW9uLCBpc1dyaXRlTG9ja2VkIH0gZnJvbSAnLi4vZG9tYWluL29yZ2FuaXplL3N0YXRlTWFjaGluZSc7XG5pbXBvcnQgdHlwZSB7IEJvb2ttYXJrTm9kZSB9IGZyb20gJy4uL2RvbWFpbi9ib29rbWFya3MvdHlwZXMnO1xuaW1wb3J0IHsgY2xhc3NpZnlFcnJvciB9IGZyb20gJy4uL3NoYXJlZC9lcnJvcnMnO1xuaW1wb3J0IHR5cGUge1xuICBBc3NpZ25tZW50LFxuICBGYWlsdXJlSXRlbSxcbiAgSm9iU3RhdGUsXG4gIFNjYW5uZWRCb29rbWFyayxcbiAgVW5kb01vdmUsXG4gIFVuZG9TbmFwc2hvdCxcbn0gZnJvbSAnLi4vc2hhcmVkL3NjaGVtYXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEFwcGx5RGVwcyB7XG4gIGJvb2ttYXJrczogQm9va21hcmtzUG9ydDtcbiAgc3RvcmFnZTogU3RvcmFnZVBvcnQ7XG4gIGV2ZW50cz86IEV2ZW50c1BvcnQ7XG4gIG5vdz86ICgpID0+IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcHBseVJlc3VsdCB7XG4gIGpvYjogSm9iU3RhdGU7XG4gIGFwcGxpZWRJZHM6IHN0cmluZ1tdO1xuICBmYWlsdXJlczogRmFpbHVyZUl0ZW1bXTtcbn1cblxuaW50ZXJmYWNlIFJlc29sdmVkVGFyZ2V0IHtcbiAgcm9vdElkOiBzdHJpbmc7XG4gIC8qKiDnm67moIflj7blrZDnm67lvZUgSUTjgIIgKi9cbiAgZm9sZGVySWQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiDkuIDplK7lupTnlKjvvIjmnrbmnoTmlrnmoYjnrKwgOCDoioLvvInjgIJTZXJ2aWNlIFdvcmtlciDmmK/llK/kuIDosIPnlKjlhaXlj6PjgIJcbiAqXG4gKiDpobrluo/vvJpcbiAqIDEuIOW7uueri+S7u+WKoemUge+8iGFwcGx5aW5n77yJ77ybXG4gKiAyLiDln7rkuo7mnIDmlrDkuabnrb7nirbmgIHmnoTlu7rmkqTplIDlv6vnhafvvIjmr4/mnaHlvoXnp7vliqjkuabnrb7nmoQgaWQgLyBwYXJlbnRJZCAvIGluZGV477yJ77ybXG4gKiAzLiDmjInot6/lvoTpgJDnuqfop6PmnpDmiJbliJvlu7rnm67lvZXvvIjmjIkgcGFyZW50SWQgKyB0aXRsZSDmn6Xmib7kv53or4HluYLnrYnvvInvvJtcbiAqIDQuIOmhuuW6jyBtb3Zl77yM5q+P5p2h5oiQ5Yqf5Y2z5pu05paw5ri45qCH5LiOIGFwcGxpZWRJZHPvvJvljZXmnaHlpLHotKXlhaXliJfnu6fnu63vvJtcbiAqIDUuIOWujOaIkOe9riBjb21wbGV0ZWQg5bm25bGV56S65aSx6LSl5LiO6YeN6K+V5YWl5Y+j44CCXG4gKlxuICog5Lit5pat5oGi5aSN77ya5ZCM5LiAIGpvYklkIOmHjeWkjei/m+WFpeaXtui3s+i/h+W3siBhcHBsaWVkIOeahOS5puetvu+8jOS7juaMgeS5heWMlua4uOagh+e7p+e7reOAglxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXBwbHlQbGFuKFxuICBkZXBzOiBBcHBseURlcHMsXG4gIGpvYjogSm9iU3RhdGUsXG4gIGJvb2ttYXJrczogU2Nhbm5lZEJvb2ttYXJrW10sXG4gIGFzc2lnbm1lbnRzOiBBc3NpZ25tZW50W10sXG4pOiBQcm9taXNlPEFwcGx5UmVzdWx0PiB7XG4gIGNvbnN0IHsgc3RvcmFnZSwgZXZlbnRzIH0gPSBkZXBzO1xuICBjb25zdCBub3cgPSBkZXBzLm5vdyA/PyAoKCkgPT4gRGF0ZS5ub3coKSk7XG5cbiAgaWYgKGlzV3JpdGVMb2NrZWQoam9iLnN0YXR1cykgJiYgam9iLnN0YXR1cyAhPT0gJ2FwcGx5aW5nJykge1xuICAgIC8vIHVuZG9pbmcg5pyf6Ze05ouS57ud5paw55qE5bqU55So6K+35rGC44CCXG4gICAgdGhyb3cgbmV3IEVycm9yKGDlvZPliY3ku7vliqHnirbmgIHkuLogJHtqb2Iuc3RhdHVzfe+8jOaXoOazleW8gOWni+W6lOeUqGApO1xuICB9XG4gIGlmIChqb2Iuc3RhdHVzICE9PSAnYXBwbHlpbmcnKSB7XG4gICAgYXNzZXJ0VHJhbnNpdGlvbihqb2Iuc3RhdHVzLCAnYXBwbHlpbmcnKTtcbiAgfVxuXG4gIGNvbnN0IGJ5SWQgPSBuZXcgTWFwKGJvb2ttYXJrcy5tYXAoKGIpID0+IFtiLmlkLCBiXSBhcyBjb25zdCkpO1xuICBjb25zdCBvcmRlcmVkOiBBcnJheTx7IGJvb2ttYXJrOiBTY2FubmVkQm9va21hcms7IGFzc2lnbm1lbnQ6IEFzc2lnbm1lbnQgfT4gPSBbXTtcbiAgZm9yIChjb25zdCBhc3NpZ25tZW50IG9mIGFzc2lnbm1lbnRzKSB7XG4gICAgY29uc3QgYm9va21hcmsgPSBieUlkLmdldChhc3NpZ25tZW50LmJvb2ttYXJrSWQpO1xuICAgIGlmIChib29rbWFyaykgb3JkZXJlZC5wdXNoKHsgYm9va21hcmssIGFzc2lnbm1lbnQgfSk7XG4gIH1cblxuICBsZXQgd29ya2luZzogSm9iU3RhdGUgPSB7XG4gICAgLi4uam9iLFxuICAgIHN0YXR1czogJ2FwcGx5aW5nJyxcbiAgICB1cGRhdGVkQXQ6IG5vdygpLFxuICAgIGZhaWx1cmVzOiBqb2Iuc3RhdHVzID09PSAnYXBwbHlpbmcnID8gam9iLmZhaWx1cmVzIDogW10sXG4gIH07XG4gIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYih3b3JraW5nKTtcblxuICAvLyAtLS0tIDEuIOW6lOeUqOWJjemHjeaWsOivu+WPluebuOWFs+S5puetvu+8jOS4jeiDveS/oeS7u+aJq+aPj+mYtuauteeahOaXp+S9jee9riAtLS0tXG4gIGNvbnN0IGZyZXNoID0gbmV3IE1hcDxzdHJpbmcsIHsgcGFyZW50SWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9PigpO1xuICBjb25zdCBtaXNzaW5nID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgeyBib29rbWFyayB9IG9mIG9yZGVyZWQpIHtcbiAgICBpZiAod29ya2luZy5hcHBsaWVkSWRzLmluY2x1ZGVzKGJvb2ttYXJrLmlkKSkgY29udGludWU7XG4gICAgY29uc3Qgbm9kZSA9IGF3YWl0IGRlcHMuYm9va21hcmtzLmdldChib29rbWFyay5pZCk7XG4gICAgaWYgKCFub2RlIHx8IG5vZGUudXJsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIG1pc3NpbmcuYWRkKGJvb2ttYXJrLmlkKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBmcmVzaC5zZXQoYm9va21hcmsuaWQsIHsgcGFyZW50SWQ6IG5vZGUucGFyZW50SWQgPz8gJycsIGluZGV4OiBub2RlLmluZGV4ID8/IDAgfSk7XG4gIH1cblxuICBjb25zdCBleGlzdGluZ0ZhaWx1cmVzOiBGYWlsdXJlSXRlbVtdID0gd29ya2luZy5mYWlsdXJlcy5maWx0ZXIoKGYpID0+IGYuYm9va21hcmtJZCA9PT0gdW5kZWZpbmVkKTtcbiAgZm9yIChjb25zdCBpZCBvZiBtaXNzaW5nKSB7XG4gICAgZXhpc3RpbmdGYWlsdXJlcy5wdXNoKHsgYm9va21hcmtJZDogaWQsIGtpbmQ6ICd2YWxpZGF0aW9uJywgbWVzc2FnZTogJ+S5puetvuW3suS4jeWtmOWcqO+8jOi3s+i/hycgfSk7XG4gIH1cbiAgd29ya2luZyA9IHsgLi4ud29ya2luZywgZmFpbHVyZXM6IGV4aXN0aW5nRmFpbHVyZXMgfTtcblxuICAvLyAtLS0tIDIuIOW7uueri+aSpOmUgOW/q+eFp++8iOS7heWMheWQq+WwmuacquW6lOeUqOeahOenu+WKqO+8m+W3suW6lOeUqOmDqOWIhuS/neeVmeWcqCB1bmRvOmxhdGVzdCDkuK3vvIkgLS0tLVxuICBjb25zdCB1bmRvRXhpc3RpbmcgPSBhd2FpdCBzdG9yYWdlLmxvYWRVbmRvKCk7XG4gIGNvbnN0IG1vdmVzOiBVbmRvTW92ZVtdID1cbiAgICB1bmRvRXhpc3RpbmcgJiYgdW5kb0V4aXN0aW5nLmpvYklkID09PSBqb2Iuam9iSWQgPyBbLi4udW5kb0V4aXN0aW5nLm1vdmVzXSA6IFtdO1xuICBjb25zdCBrbm93bk1vdmVJZHMgPSBuZXcgU2V0KG1vdmVzLm1hcCgobSkgPT4gbS5ib29rbWFya0lkKSk7XG4gIGZvciAoY29uc3QgeyBib29rbWFyayB9IG9mIG9yZGVyZWQpIHtcbiAgICBpZiAod29ya2luZy5hcHBsaWVkSWRzLmluY2x1ZGVzKGJvb2ttYXJrLmlkKSkgY29udGludWU7XG4gICAgaWYgKGtub3duTW92ZUlkcy5oYXMoYm9va21hcmsuaWQpKSBjb250aW51ZTtcbiAgICBjb25zdCBwb3MgPSBmcmVzaC5nZXQoYm9va21hcmsuaWQpO1xuICAgIGlmICghcG9zKSBjb250aW51ZTtcbiAgICBtb3Zlcy5wdXNoKHtcbiAgICAgIGJvb2ttYXJrSWQ6IGJvb2ttYXJrLmlkLFxuICAgICAgZnJvbVBhcmVudElkOiBwb3MucGFyZW50SWQsXG4gICAgICBmcm9tSW5kZXg6IHBvcy5pbmRleCxcbiAgICAgIHRvRm9sZGVySWQ6ICcnLCAvLyDop6PmnpDnm67moIfnm67lvZXlkI7lm57loatcbiAgICB9KTtcbiAgfVxuXG4gIC8vIC0tLS0gMy4g6Kej5p6Q5oiW5Yib5bu655uu5qCH55uu5b2VIC0tLS1cbiAgLy8g5oOw5oCn5oyJ6ZyA6K+75Y+W55uu5b2V57uT5p6E77yaZ2V0Q2hpbGRyZW4ocGFyZW50SWQpICsg57yT5a2Y77yM6YG/5YWN5q+P5qyh5YWo5qCR5omr5o+P44CCXG4gIGNvbnN0IGNoaWxkcmVuQnlQYXJlbnQgPSBuZXcgTWFwPHN0cmluZywgQm9va21hcmtOb2RlW10+KCk7XG5cbiAgY29uc3QgY3JlYXRlZEZvbGRlcnMgPVxuICAgIHVuZG9FeGlzdGluZyAmJiB1bmRvRXhpc3Rpbmcuam9iSWQgPT09IGpvYi5qb2JJZCA/IFsuLi51bmRvRXhpc3RpbmcuY3JlYXRlZEZvbGRlcnNdIDogW107XG4gIGNvbnN0IGNyZWF0ZWRJZHMgPSBuZXcgU2V0KGNyZWF0ZWRGb2xkZXJzLm1hcCgoZikgPT4gZi5pZCkpO1xuICBjb25zdCBmb2xkZXJDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7IC8vIGAke3Jvb3RJZH18JHtwYXRoLmpvaW4oJy8nKX1gIC0+IGZvbGRlcklkXG5cbiAgY29uc3QgcmVzb2x2ZUZvbGRlciA9IGFzeW5jIChyb290SWQ6IHN0cmluZywgcGF0aDogc3RyaW5nW10pOiBQcm9taXNlPFJlc29sdmVkVGFyZ2V0PiA9PiB7XG4gICAgY29uc3Qga2V5ID0gYCR7cm9vdElkfXwke3BhdGgubWFwKChzKSA9PiBzLnRvTG93ZXJDYXNlKCkpLmpvaW4oJyAnKX1gO1xuICAgIGNvbnN0IGNhY2hlZCA9IGZvbGRlckNhY2hlLmdldChrZXkpO1xuICAgIGlmIChjYWNoZWQpIHJldHVybiB7IHJvb3RJZCwgZm9sZGVySWQ6IGNhY2hlZCB9O1xuXG4gICAgbGV0IHBhcmVudElkID0gcm9vdElkO1xuICAgIGxldCBkZXB0aCA9IDA7XG4gICAgZm9yIChjb25zdCBzZWdtZW50IG9mIHBhdGgpIHtcbiAgICAgIGRlcHRoICs9IDE7XG4gICAgICBjb25zdCBjaGlsZHJlbiA9IGNoaWxkcmVuQnlQYXJlbnQuZ2V0KHBhcmVudElkKSA/PyAoYXdhaXQgZGVwcy5ib29rbWFya3MuZ2V0Q2hpbGRyZW4ocGFyZW50SWQpKTtcbiAgICAgIGNoaWxkcmVuQnlQYXJlbnQuc2V0KHBhcmVudElkLCBjaGlsZHJlbik7XG4gICAgICBjb25zdCBoaXQgPSBjaGlsZHJlbi5maW5kKFxuICAgICAgICAoYykgPT4gYy51cmwgPT09IHVuZGVmaW5lZCAmJiBjLnRpdGxlLnRvTG93ZXJDYXNlKCkgPT09IHNlZ21lbnQudG9Mb3dlckNhc2UoKSxcbiAgICAgICk7XG4gICAgICBpZiAoaGl0KSB7XG4gICAgICAgIHBhcmVudElkID0gaGl0LmlkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgY3JlYXRlZCA9IGF3YWl0IGRlcHMuYm9va21hcmtzLmNyZWF0ZUZvbGRlcihwYXJlbnRJZCwgc2VnbWVudCk7XG4gICAgICAgIGNvbnN0IG5vZGU6IEJvb2ttYXJrTm9kZSA9IHsgaWQ6IGNyZWF0ZWQuaWQsIHBhcmVudElkLCB0aXRsZTogc2VnbWVudCB9O1xuICAgICAgICBjaGlsZHJlbkJ5UGFyZW50LnNldChjcmVhdGVkLmlkLCBbXSk7XG4gICAgICAgIGNvbnN0IHNpYmxpbmdzID0gY2hpbGRyZW5CeVBhcmVudC5nZXQocGFyZW50SWQpID8/IFtdO1xuICAgICAgICBzaWJsaW5ncy5wdXNoKG5vZGUpO1xuICAgICAgICBjaGlsZHJlbkJ5UGFyZW50LnNldChwYXJlbnRJZCwgc2libGluZ3MpO1xuICAgICAgICBpZiAoIWNyZWF0ZWRJZHMuaGFzKGNyZWF0ZWQuaWQpKSB7XG4gICAgICAgICAgY3JlYXRlZElkcy5hZGQoY3JlYXRlZC5pZCk7XG4gICAgICAgICAgY3JlYXRlZEZvbGRlcnMucHVzaCh7IGlkOiBjcmVhdGVkLmlkLCBkZXB0aCB9KTtcbiAgICAgICAgfVxuICAgICAgICBwYXJlbnRJZCA9IGNyZWF0ZWQuaWQ7XG4gICAgICB9XG4gICAgfVxuICAgIGZvbGRlckNhY2hlLnNldChrZXksIHBhcmVudElkKTtcbiAgICByZXR1cm4geyByb290SWQsIGZvbGRlcklkOiBwYXJlbnRJZCB9O1xuICB9O1xuXG4gIGNvbnN0IHJlc29sdmVkVGFyZ2V0cyA9IG5ldyBNYXA8c3RyaW5nLCBSZXNvbHZlZFRhcmdldD4oKTtcbiAgZm9yIChjb25zdCB7IGJvb2ttYXJrLCBhc3NpZ25tZW50IH0gb2Ygb3JkZXJlZCkge1xuICAgIGlmICh3b3JraW5nLmFwcGxpZWRJZHMuaW5jbHVkZXMoYm9va21hcmsuaWQpIHx8IG1pc3NpbmcuaGFzKGJvb2ttYXJrLmlkKSkgY29udGludWU7XG4gICAgY29uc3QgdGFyZ2V0ID0gYXdhaXQgcmVzb2x2ZUZvbGRlcihib29rbWFyay5yb290SWQsIGFzc2lnbm1lbnQudGFyZ2V0UGF0aCk7XG4gICAgcmVzb2x2ZWRUYXJnZXRzLnNldChib29rbWFyay5pZCwgdGFyZ2V0KTtcbiAgICBjb25zdCBtb3ZlID0gbW92ZXMuZmluZCgobSkgPT4gbS5ib29rbWFya0lkID09PSBib29rbWFyay5pZCk7XG4gICAgaWYgKG1vdmUpIG1vdmUudG9Gb2xkZXJJZCA9IHRhcmdldC5mb2xkZXJJZDtcbiAgICAvLyDmlrDlu7rnm67lvZXljbPml7bmjIHkuYXljJbvvIzkv53or4HkuK3mlq3lkI7nm67lvZXkuI3kuKLjgIJcbiAgICB3b3JraW5nID0geyAuLi53b3JraW5nLCBjcmVhdGVkRm9sZGVySWRzOiBjcmVhdGVkRm9sZGVycy5tYXAoKGYpID0+IGYuaWQpLCB1cGRhdGVkQXQ6IG5vdygpIH07XG4gICAgYXdhaXQgc3RvcmFnZS5zYXZlSm9iKHdvcmtpbmcpO1xuICB9XG5cbiAgLy8gLS0tLSDlv6vnhafkv53lrZjmiJDlip/lkI7miY3opobnm5bkuIrkuIDku73mkqTplIDlv6vnhafvvIjmnrbmnoTmlrnmoYjnrKwgOSDoioLvvIkgLS0tLVxuICBjb25zdCBzbmFwc2hvdDogVW5kb1NuYXBzaG90ID0ge1xuICAgIGpvYklkOiBqb2Iuam9iSWQsXG4gICAgY3JlYXRlZEF0OiBub3coKSxcbiAgICBtb3ZlczogbW92ZXMuZmlsdGVyKChtKSA9PiBtLnRvRm9sZGVySWQubGVuZ3RoID4gMCksXG4gICAgY3JlYXRlZEZvbGRlcnMsXG4gIH07XG4gIGF3YWl0IHN0b3JhZ2Uuc2F2ZVVuZG8oc25hcHNob3QpO1xuXG4gIC8vIC0tLS0gNC4g6aG65bqP56e75YqoIC0tLS1cbiAgY29uc3QgZmFpbHVyZXM6IEZhaWx1cmVJdGVtW10gPSBbLi4ud29ya2luZy5mYWlsdXJlc107XG4gIGNvbnN0IHRvdGFsID0gb3JkZXJlZC5sZW5ndGg7XG4gIGxldCBwcm9jZXNzZWQgPSAwO1xuXG4gIGZvciAoY29uc3QgeyBib29rbWFyayB9IG9mIG9yZGVyZWQpIHtcbiAgICBwcm9jZXNzZWQgKz0gMTtcbiAgICAvLyDlj5bmtojmo4Dmn6XvvJrph43or7vmjIHkuYXljJbmoIflv5fvvIxDQU5DRUxfSk9CIOabtOaWsOWtmOWCqOWQjueri+WNs+eUn+aViOOAglxuICAgIGNvbnN0IHBlcnNpc3RlZCA9IGF3YWl0IHN0b3JhZ2UubG9hZEpvYigpO1xuICAgIGlmIChwZXJzaXN0ZWQ/LmNhbmNlbFJlcXVlc3RlZCkge1xuICAgICAgY29uc3QgaW50ZXJydXB0ZWQ6IEpvYlN0YXRlID0ge1xuICAgICAgICAuLi53b3JraW5nLFxuICAgICAgICBzdGF0dXM6ICdpbnRlcnJ1cHRlZCcsXG4gICAgICAgIGNhbmNlbFJlcXVlc3RlZDogdHJ1ZSxcbiAgICAgICAgdXBkYXRlZEF0OiBub3coKSxcbiAgICAgIH07XG4gICAgICBhd2FpdCBzdG9yYWdlLnNhdmVKb2IoaW50ZXJydXB0ZWQpO1xuICAgICAgZXZlbnRzPy5pbnRlcnJ1cHRlZChpbnRlcnJ1cHRlZCk7XG4gICAgICByZXR1cm4geyBqb2I6IGludGVycnVwdGVkLCBhcHBsaWVkSWRzOiBpbnRlcnJ1cHRlZC5hcHBsaWVkSWRzLCBmYWlsdXJlczogaW50ZXJydXB0ZWQuZmFpbHVyZXMgfTtcbiAgICB9XG4gICAgaWYgKHdvcmtpbmcuYXBwbGllZElkcy5pbmNsdWRlcyhib29rbWFyay5pZCkpIHtcbiAgICAgIGV2ZW50cz8ucHJvZ3Jlc3Moam9iLmpvYklkLCAnYXBwbHlpbmcnLCBwcm9jZXNzZWQsIHRvdGFsKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAobWlzc2luZy5oYXMoYm9va21hcmsuaWQpKSBjb250aW51ZTtcblxuICAgIGNvbnN0IHRhcmdldCA9IHJlc29sdmVkVGFyZ2V0cy5nZXQoYm9va21hcmsuaWQpO1xuICAgIGlmICghdGFyZ2V0KSBjb250aW51ZTtcblxuICAgIC8vIOW5guetie+8muenu+WKqOWJjeajgOafpeW9k+WJjeS9jee9ru+8jOW3suWcqOebruagh+ebruW9leaXtuebtOaOpeagh+iusOWujOaIkOOAglxuICAgIGNvbnN0IGN1cnJlbnQgPSBhd2FpdCBkZXBzLmJvb2ttYXJrcy5nZXQoYm9va21hcmsuaWQpO1xuICAgIGlmICghY3VycmVudCkge1xuICAgICAgZmFpbHVyZXMucHVzaCh7IGJvb2ttYXJrSWQ6IGJvb2ttYXJrLmlkLCBraW5kOiAndmFsaWRhdGlvbicsIG1lc3NhZ2U6ICfkuabnrb7lnKjlupTnlKjov4fnqIvkuK3ooqvliKDpmaQnIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChjdXJyZW50LnBhcmVudElkID09PSB0YXJnZXQuZm9sZGVySWQpIHtcbiAgICAgIHdvcmtpbmcgPSB7XG4gICAgICAgIC4uLndvcmtpbmcsXG4gICAgICAgIGFwcGxpZWRJZHM6IFsuLi53b3JraW5nLmFwcGxpZWRJZHMsIGJvb2ttYXJrLmlkXSxcbiAgICAgICAgYXBwbHlDdXJzb3I6IHByb2Nlc3NlZCxcbiAgICAgICAgdXBkYXRlZEF0OiBub3coKSxcbiAgICAgIH07XG4gICAgICBhd2FpdCBzdG9yYWdlLnNhdmVKb2Iod29ya2luZyk7XG4gICAgICBldmVudHM/LnByb2dyZXNzKGpvYi5qb2JJZCwgJ2FwcGx5aW5nJywgcHJvY2Vzc2VkLCB0b3RhbCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgYXdhaXQgZGVwcy5ib29rbWFya3MubW92ZShib29rbWFyay5pZCwgeyBwYXJlbnRJZDogdGFyZ2V0LmZvbGRlcklkIH0pO1xuICAgICAgd29ya2luZyA9IHtcbiAgICAgICAgLi4ud29ya2luZyxcbiAgICAgICAgYXBwbGllZElkczogWy4uLndvcmtpbmcuYXBwbGllZElkcywgYm9va21hcmsuaWRdLFxuICAgICAgICBhcHBseUN1cnNvcjogcHJvY2Vzc2VkLFxuICAgICAgICB1cGRhdGVkQXQ6IG5vdygpLFxuICAgICAgfTtcbiAgICAgIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYih3b3JraW5nKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgY2xhc3NpZmllZCA9IGNsYXNzaWZ5RXJyb3IoZXJyb3IpO1xuICAgICAgZmFpbHVyZXMucHVzaCh7IGJvb2ttYXJrSWQ6IGJvb2ttYXJrLmlkLCBraW5kOiBjbGFzc2lmaWVkLmtpbmQsIG1lc3NhZ2U6IGNsYXNzaWZpZWQubWVzc2FnZSB9KTtcbiAgICAgIHdvcmtpbmcgPSB7IC4uLndvcmtpbmcsIGZhaWx1cmVzLCBhcHBseUN1cnNvcjogcHJvY2Vzc2VkLCB1cGRhdGVkQXQ6IG5vdygpIH07XG4gICAgICBhd2FpdCBzdG9yYWdlLnNhdmVKb2Iod29ya2luZyk7XG4gICAgfVxuICAgIGV2ZW50cz8ucHJvZ3Jlc3Moam9iLmpvYklkLCAnYXBwbHlpbmcnLCBwcm9jZXNzZWQsIHRvdGFsKTtcbiAgfVxuXG4gIGNvbnN0IGNvbXBsZXRlZDogSm9iU3RhdGUgPSB7IC4uLndvcmtpbmcsIGZhaWx1cmVzLCBzdGF0dXM6ICdjb21wbGV0ZWQnLCB1cGRhdGVkQXQ6IG5vdygpIH07XG4gIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYihjb21wbGV0ZWQpO1xuICBldmVudHM/LmNvbXBsZXRlZChjb21wbGV0ZWQpO1xuICByZXR1cm4geyBqb2I6IGNvbXBsZXRlZCwgYXBwbGllZElkczogY29tcGxldGVkLmFwcGxpZWRJZHMsIGZhaWx1cmVzIH07XG59XG4iLCJpbXBvcnQgdHlwZSB7IFVuZG9Nb3ZlLCBVbmRvU25hcHNob3QgfSBmcm9tICcuLi8uLi9zaGFyZWQvc2NoZW1hcyc7XG5cbi8qKiDmkqTplIDml7bljZXmnaHnp7vliqjnmoTlj6/miafooYzmgKfliKTlrprjgIIgKi9cbmV4cG9ydCB0eXBlIFJlc3RvcmVEZWNpc2lvbiA9XG4gIHwgeyBhY3Rpb246ICdyZXN0b3JlJzsgbW92ZTogVW5kb01vdmUgfVxuICB8IHsgYWN0aW9uOiAnc2tpcCc7IG1vdmU6IFVuZG9Nb3ZlOyByZWFzb246ICdtb3ZlZF9ieV91c2VyJyB8ICdib29rbWFya19taXNzaW5nJyB8ICdwYXJlbnRfbWlzc2luZycgfTtcblxuLyoqXG4gKiDliKTlrprkuIDmnaHlv6vnhaforrDlvZXmmK/lkKblupTmgaLlpI3vvIjmnrbmnoTmlrnmoYjnrKwgOSDoioLvvInvvJpcbiAqIOS5puetvuW9k+WJjeS7jeWcqOacrOasoeW6lOeUqOeahOebruagh+ebruW9leaXtuaJjeaBouWkje+8m1xuICog5bey6KKr55So5oi35YaN5qyh56e75Yqo5oiW5bey5Yig6Zmk5YiZ6Lez6L+H5bm25oql5Yay56qB77yM5LiN6KaG55uW55So5oi355qE5paw5pON5L2c44CCXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZWNpZGVSZXN0b3JlKFxuICBtb3ZlOiBVbmRvTW92ZSxcbiAgY3VycmVudEJvb2ttYXJrOiB7IHBhcmVudElkPzogc3RyaW5nIH0gfCB1bmRlZmluZWQsXG4gIHBhcmVudEV4aXN0czogYm9vbGVhbixcbik6IFJlc3RvcmVEZWNpc2lvbiB7XG4gIGlmICghY3VycmVudEJvb2ttYXJrKSB7XG4gICAgcmV0dXJuIHsgYWN0aW9uOiAnc2tpcCcsIG1vdmUsIHJlYXNvbjogJ2Jvb2ttYXJrX21pc3NpbmcnIH07XG4gIH1cbiAgaWYgKCFwYXJlbnRFeGlzdHMpIHtcbiAgICByZXR1cm4geyBhY3Rpb246ICdza2lwJywgbW92ZSwgcmVhc29uOiAncGFyZW50X21pc3NpbmcnIH07XG4gIH1cbiAgaWYgKGN1cnJlbnRCb29rbWFyay5wYXJlbnRJZCAhPT0gbW92ZS50b0ZvbGRlcklkKSB7XG4gICAgcmV0dXJuIHsgYWN0aW9uOiAnc2tpcCcsIG1vdmUsIHJlYXNvbjogJ21vdmVkX2J5X3VzZXInIH07XG4gIH1cbiAgcmV0dXJuIHsgYWN0aW9uOiAncmVzdG9yZScsIG1vdmUgfTtcbn1cblxuLyoqXG4gKiDmgaLlpI3pobrluo/vvJrmjInljp8gcGFyZW50SWQg5YiG57uE77yM57uE5YaF5oyJ5Y6fIGluZGV4IOWNh+W6j+enu+Wbnu+8jFxuICog5L2/55uu5b2V5YaF55qE55u45a+56aG65bqP5bC96YeP5oGi5aSN5Yiw5bqU55So5YmN54q25oCB44CCXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvcmRlclJlc3RvcmVzKG1vdmVzOiBVbmRvTW92ZVtdKTogVW5kb01vdmVbXSB7XG4gIGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBVbmRvTW92ZVtdPigpO1xuICBmb3IgKGNvbnN0IG1vdmUgb2YgbW92ZXMpIHtcbiAgICBjb25zdCBncm91cCA9IGdyb3Vwcy5nZXQobW92ZS5mcm9tUGFyZW50SWQpO1xuICAgIGlmIChncm91cCkge1xuICAgICAgZ3JvdXAucHVzaChtb3ZlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZ3JvdXBzLnNldChtb3ZlLmZyb21QYXJlbnRJZCwgW21vdmVdKTtcbiAgICB9XG4gIH1cbiAgY29uc3Qgb3JkZXJlZDogVW5kb01vdmVbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcy52YWx1ZXMoKSkge1xuICAgIG9yZGVyZWQucHVzaCguLi5bLi4uZ3JvdXBdLnNvcnQoKGEsIGIpID0+IGEuZnJvbUluZGV4IC0gYi5mcm9tSW5kZXgpKTtcbiAgfVxuICByZXR1cm4gb3JkZXJlZDtcbn1cblxuLyoqXG4gKiDmlrDlu7rnm67lvZXnmoTliKDpmaTpobrluo/vvJrmjInmt7Hluqbku47mt7HliLDmtYXjgIJcbiAqIOWPquWIoOmZpOepuuebruW9leeUseiwg+eUqOaWuemAkOadoeehruiupO+8m+aOkuW6j+S/neivgeWtkOebruW9leWFiOS6jueItuebruW9leiiq+ajgOafpeOAglxuICovXG5leHBvcnQgZnVuY3Rpb24gb3JkZXJGb2xkZXJzRm9yRGVsZXRpb24oXG4gIGNyZWF0ZWRGb2xkZXJzOiBVbmRvU25hcHNob3RbJ2NyZWF0ZWRGb2xkZXJzJ10sXG4pOiBzdHJpbmdbXSB7XG4gIHJldHVybiBbLi4uY3JlYXRlZEZvbGRlcnNdLnNvcnQoKGEsIGIpID0+IGIuZGVwdGggLSBhLmRlcHRoKS5tYXAoKGYpID0+IGYuaWQpO1xufVxuIiwiaW1wb3J0IHR5cGUgeyBCb29rbWFya3NQb3J0LCBFdmVudHNQb3J0LCBTdG9yYWdlUG9ydCB9IGZyb20gJy4vcG9ydHMnO1xuaW1wb3J0IHsgYXNzZXJ0VHJhbnNpdGlvbiwgaXNXcml0ZUxvY2tlZCB9IGZyb20gJy4uL2RvbWFpbi9vcmdhbml6ZS9zdGF0ZU1hY2hpbmUnO1xuaW1wb3J0IHtcbiAgZGVjaWRlUmVzdG9yZSxcbiAgb3JkZXJGb2xkZXJzRm9yRGVsZXRpb24sXG4gIG9yZGVyUmVzdG9yZXMsXG4gIHR5cGUgUmVzdG9yZURlY2lzaW9uLFxufSBmcm9tICcuLi9kb21haW4vdW5kby9zbmFwc2hvdCc7XG5pbXBvcnQgeyBjbGFzc2lmeUVycm9yIH0gZnJvbSAnLi4vc2hhcmVkL2Vycm9ycyc7XG5pbXBvcnQgdHlwZSB7IEZhaWx1cmVJdGVtLCBKb2JTdGF0ZSwgVW5kb1NuYXBzaG90IH0gZnJvbSAnLi4vc2hhcmVkL3NjaGVtYXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFVuZG9EZXBzIHtcbiAgYm9va21hcmtzOiBCb29rbWFya3NQb3J0O1xuICBzdG9yYWdlOiBTdG9yYWdlUG9ydDtcbiAgZXZlbnRzPzogRXZlbnRzUG9ydDtcbiAgbm93PzogKCkgPT4gbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFVuZG9SZXN1bHQge1xuICBqb2I6IEpvYlN0YXRlO1xuICAvKiog5Yay56qB5LiO5aSx6LSl6K+m5oOF77yb5YWo6YOo5oiQ5Yqf5pe25Li656m644CCICovXG4gIGNvbmZsaWN0czogRmFpbHVyZUl0ZW1bXTtcbn1cblxuY29uc3QgQ09ORkxJQ1RfUkVBU09OUyA9IHtcbiAgbW92ZWRfYnlfdXNlcjogJ+S5puetvuW3suiiq+WGjeasoeenu+WKqO+8jOi3s+i/h+S7peS4jeimhueblueUqOaIt+eahOaWsOaTjeS9nCcsXG4gIGJvb2ttYXJrX21pc3Npbmc6ICfkuabnrb7lt7LliKDpmaTvvIzml6Dms5XmgaLlpI0nLFxuICBwYXJlbnRfbWlzc2luZzogJ+WOn+eItuebruW9leW3suS4jeWtmOWcqO+8jOaXoOazleaBouWkjScsXG59IGFzIGNvbnN0O1xuXG4vKipcbiAqIOS4gOmUruaSpOmUgOacgOi/keS4gOasoeaVtOeQhu+8iOaetuaehOaWueahiOesrCA5IOiKgu+8ieOAglNlcnZpY2UgV29ya2VyIOaYr+WUr+S4gOiwg+eUqOWFpeWPo+OAglxuICpcbiAqIDEuIOS7heWkhOeQhuW/q+eFpyBtb3ZlcyDkuK3miJDlip/np7vliqjov4fnmoTkuabnrb7vvJtcbiAqIDIuIOavj+adoeWFiOWIpOWumuWPr+aBouWkjeaAp++8iOS7jeWcqOacrOasoeW6lOeUqOeahOebruagh+ebruW9leaJjeaBouWkje+8m+eUqOaIt+S6jOasoeenu+WKqOOAgVxuICogICAg5bey5Yig6Zmk5oiW5Y6f54i255uu5b2V5LiN5a2Y5Zyo5YiZ6Lez6L+H5bm25oql5Yay56qB77yM5LiN6KaG55uW55So5oi355qE5paw5pON5L2c77yJ77ybXG4gKiAzLiDmgaLlpI3pobrluo/vvJrmjInljp8gcGFyZW50SWQg5YiG57uE44CB57uE5YaF5oyJ5Y6fIGluZGV4IOWNh+W6j+enu+Wbnu+8m1xuICogNC4g5oGi5aSN5ZCO5bCG5pys5qyh5paw5bu655uu5b2V5oyJ5rex5bqm5LuO5rex5Yiw5rWF5Yig6Zmk77yM5L2G5Y+q5Yig6Zmk56m655uu5b2V77ybXG4gKiA1LiDmnInlhrLnqoHml7bnirbmgIHkuLogcGFydGlhbGx5X3VuZG9uZe+8jOS/neeVmeW/q+eFp+S+m+eUqOaIt+mHjeivleOAglxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdW5kb0xhc3RBcHBseShkZXBzOiBVbmRvRGVwcywgam9iOiBKb2JTdGF0ZSk6IFByb21pc2U8VW5kb1Jlc3VsdD4ge1xuICBjb25zdCB7IHN0b3JhZ2UsIGV2ZW50cywgYm9va21hcmtzIH0gPSBkZXBzO1xuICBjb25zdCBub3cgPSBkZXBzLm5vdyA/PyAoKCkgPT4gRGF0ZS5ub3coKSk7XG5cbiAgaWYgKGlzV3JpdGVMb2NrZWQoam9iLnN0YXR1cykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYOW9k+WJjeS7u+WKoeeKtuaAgeS4uiAke2pvYi5zdGF0dXN977yM5peg5rOV5byA5aeL5pKk6ZSAYCk7XG4gIH1cbiAgYXNzZXJ0VHJhbnNpdGlvbihqb2Iuc3RhdHVzLCAndW5kb2luZycpO1xuXG4gIGNvbnN0IHNuYXBzaG90OiBVbmRvU25hcHNob3QgfCBudWxsID0gYXdhaXQgc3RvcmFnZS5sb2FkVW5kbygpO1xuICBpZiAoIXNuYXBzaG90IHx8IHNuYXBzaG90LmpvYklkICE9PSBqb2Iuam9iSWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ+ayoeacieWPr+eUqOS6juaSpOmUgOeahOacgOi/keS4gOasoeaVtOeQhuW/q+eFpycpO1xuICB9XG5cbiAgbGV0IHdvcmtpbmc6IEpvYlN0YXRlID0geyAuLi5qb2IsIHN0YXR1czogJ3VuZG9pbmcnLCB1cGRhdGVkQXQ6IG5vdygpLCBjYW5jZWxSZXF1ZXN0ZWQ6IGZhbHNlIH07XG4gIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYih3b3JraW5nKTtcblxuICBjb25zdCBjb25mbGljdHM6IEZhaWx1cmVJdGVtW10gPSBbXTtcbiAgbGV0IGNhbmNlbGxlZCA9IGZhbHNlO1xuXG4gIC8vIC0tLS0gMS4g6YCQ5p2h5Yik5a6a5Y+v5oGi5aSN5oCnIC0tLS1cbiAgY29uc3QgZGVjaXNpb25zOiBSZXN0b3JlRGVjaXNpb25bXSA9IFtdO1xuICBmb3IgKGNvbnN0IG1vdmUgb2Ygc25hcHNob3QubW92ZXMpIHtcbiAgICBjb25zdCBjdXJyZW50ID0gYXdhaXQgYm9va21hcmtzLmdldChtb3ZlLmJvb2ttYXJrSWQpO1xuICAgIC8vIOWOn+eItuebruW9leWtmOWcqOaAp+WNleeLrOehruiupO+8iOS5puetvuW9k+WJjeS4jeWcqOebruagh+ebruW9leaXtuS5n+ajgOafpe+8jOS+v+S6juaKpeWRiuWGsueqgeWOn+WboO+8ieOAglxuICAgIGNvbnN0IG9yaWdpbmFsUGFyZW50ID0gYXdhaXQgYm9va21hcmtzLmdldChtb3ZlLmZyb21QYXJlbnRJZCk7XG4gICAgY29uc3QgcGFyZW50RXhpc3RzID0gb3JpZ2luYWxQYXJlbnQgIT09IHVuZGVmaW5lZCAmJiBvcmlnaW5hbFBhcmVudC51cmwgPT09IHVuZGVmaW5lZDtcbiAgICBkZWNpc2lvbnMucHVzaChkZWNpZGVSZXN0b3JlKG1vdmUsIGN1cnJlbnQsIHBhcmVudEV4aXN0cykpO1xuICB9XG5cbiAgLy8gLS0tLSAyLiDmjInmgaLlpI3pobrluo/np7vlm54gLS0tLVxuICBmb3IgKGNvbnN0IGRlY2lzaW9uIG9mIG9yZGVyUmVzdG9yZXMoXG4gICAgZGVjaXNpb25zLmZpbHRlcigoZCk6IGQgaXMgRXh0cmFjdDxSZXN0b3JlRGVjaXNpb24sIHsgYWN0aW9uOiAncmVzdG9yZScgfT4gPT5cbiAgICAgIGQuYWN0aW9uID09PSAncmVzdG9yZScsXG4gICAgKS5tYXAoKGQpID0+IGQubW92ZSksXG4gICkpIHtcbiAgICAvLyDlj5bmtojmo4Dmn6XvvJrph43or7vmjIHkuYXljJbmoIflv5fvvIxDQU5DRUxfSk9CIOabtOaWsOWtmOWCqOWQjueri+WNs+eUn+aViOOAglxuICAgIGNvbnN0IHBlcnNpc3RlZCA9IGF3YWl0IHN0b3JhZ2UubG9hZEpvYigpO1xuICAgIGlmIChwZXJzaXN0ZWQ/LmNhbmNlbFJlcXVlc3RlZCkge1xuICAgICAgY2FuY2VsbGVkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgYXdhaXQgYm9va21hcmtzLm1vdmUoZGVjaXNpb24uYm9va21hcmtJZCwge1xuICAgICAgICBwYXJlbnRJZDogZGVjaXNpb24uZnJvbVBhcmVudElkLFxuICAgICAgICBpbmRleDogZGVjaXNpb24uZnJvbUluZGV4LFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnN0IGNsYXNzaWZpZWQgPSBjbGFzc2lmeUVycm9yKGVycm9yKTtcbiAgICAgIGNvbmZsaWN0cy5wdXNoKHtcbiAgICAgICAgYm9va21hcmtJZDogZGVjaXNpb24uYm9va21hcmtJZCxcbiAgICAgICAga2luZDogY2xhc3NpZmllZC5raW5kLFxuICAgICAgICBtZXNzYWdlOiBg5oGi5aSN5aSx6LSl77yaJHtjbGFzc2lmaWVkLm1lc3NhZ2V9YCxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8vIC0tLS0gMy4g5Yay56qB5pS26ZuG77yI6Lez6L+H6aG577yJIC0tLS1cbiAgZm9yIChjb25zdCBkZWNpc2lvbiBvZiBkZWNpc2lvbnMpIHtcbiAgICBpZiAoZGVjaXNpb24uYWN0aW9uICE9PSAnc2tpcCcpIGNvbnRpbnVlO1xuICAgIGNvbmZsaWN0cy5wdXNoKHtcbiAgICAgIGJvb2ttYXJrSWQ6IGRlY2lzaW9uLm1vdmUuYm9va21hcmtJZCxcbiAgICAgIGtpbmQ6ICd1c2VyX2NvbmZsaWN0JyxcbiAgICAgIG1lc3NhZ2U6IENPTkZMSUNUX1JFQVNPTlNbZGVjaXNpb24ucmVhc29uXSxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIC0tLS0gNC4g5Yig6Zmk5pys5qyh5paw5bu655qE56m655uu5b2V77yI5rex5Yiw5rWF77yJIC0tLS1cbiAgZm9yIChjb25zdCBmb2xkZXJJZCBvZiBvcmRlckZvbGRlcnNGb3JEZWxldGlvbihzbmFwc2hvdC5jcmVhdGVkRm9sZGVycykpIHtcbiAgICBpZiAoY2FuY2VsbGVkKSBicmVhaztcbiAgICB0cnkge1xuICAgICAgY29uc3QgY2hpbGRyZW4gPSBhd2FpdCBib29rbWFya3MuZ2V0Q2hpbGRyZW4oZm9sZGVySWQpO1xuICAgICAgaWYgKGNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBhd2FpdCBib29rbWFya3MucmVtb3ZlVHJlZShmb2xkZXJJZCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyDnm67lvZXlt7LooqvnlKjmiLfmiYvliqjliKDpmaTmiJbnp7vliqjvvJrlv73nlaXvvIzkuI3lvbHlk43mkqTplIDnu5PmnpzjgIJcbiAgICB9XG4gIH1cblxuICAvLyDnlKjmiLflj5bmtojml7bkv53nlZnlv6vnhafkuI7miqXlkYrvvIznirbmgIHkuLogcGFydGlhbGx5X3VuZG9uZSDku6Xkvr/ph43or5XmkqTplIDjgIJcbiAgaWYgKGNhbmNlbGxlZCkge1xuICAgIGNvbmZsaWN0cy5wdXNoKHsga2luZDogJ3VzZXJfY29uZmxpY3QnLCBtZXNzYWdlOiAn5bey5oyJ55So5oi36K+35rGC5Lit5pat5pKk6ZSA77yM5Y+v6YeN5paw5Y+R6LW35pKk6ZSAJyB9KTtcbiAgfVxuXG4gIGNvbnN0IGZpbmFsOiBKb2JTdGF0ZSA9IHtcbiAgICAuLi53b3JraW5nLFxuICAgIHN0YXR1czogY29uZmxpY3RzLmxlbmd0aCA+IDAgPyAncGFydGlhbGx5X3VuZG9uZScgOiAndW5kb25lJyxcbiAgICBmYWlsdXJlczogY29uZmxpY3RzLFxuICAgIHVwZGF0ZWRBdDogbm93KCksXG4gIH07XG4gIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYihmaW5hbCk7XG4gIGlmIChjb25mbGljdHMubGVuZ3RoID4gMCkge1xuICAgIGV2ZW50cz8uZmFpbGVkKGZpbmFsKTtcbiAgfSBlbHNlIHtcbiAgICBldmVudHM/LmNvbXBsZXRlZChmaW5hbCk7XG4gIH1cbiAgcmV0dXJuIHsgam9iOiBmaW5hbCwgY29uZmxpY3RzIH07XG59XG4iLCJpbXBvcnQgdHlwZSB7IFN0b3JhZ2VQb3J0IH0gZnJvbSAnLi9wb3J0cyc7XG5pbXBvcnQgdHlwZSB7IEpvYlN0YXRlLCBQbGFuUmVjb3JkIH0gZnJvbSAnLi4vc2hhcmVkL3NjaGVtYXMnO1xuaW1wb3J0IHR5cGUgeyBTdGF0dXNQYXlsb2FkIH0gZnJvbSAnLi4vc2hhcmVkL21lc3NhZ2VzJztcblxuZXhwb3J0IGludGVyZmFjZSBSZXN1bWVEZXBzIHtcbiAgc3RvcmFnZTogU3RvcmFnZVBvcnQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVzdW1lVmlldyBleHRlbmRzIFN0YXR1c1BheWxvYWQge1xuICBwbGFuOiBQbGFuUmVjb3JkIHwgbnVsbDtcbiAgLyoqIOW9k+WJjeS7u+WKoeaYr+WQpuWPr+S7peS7juaMgeS5heWMlua4uOagh+e7p+e7reWGmeWFpeOAgiAqL1xuICBjYW5SZXN1bWVBcHBseTogYm9vbGVhbjtcbiAgLyoqIOaYr+WQpuWtmOWcqOWxnuS6juW9k+WJjeS7u+WKoeeahOOAgeWPr+e7p+e7reeahOaooeWei+euoee6v+OAgiAqL1xuICBjYW5SZXN1bWVQbGFubmluZzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBEYXNoYm9hcmQg6YeN5byA5ZCO55qE54q25oCB5oGi5aSN77yI5p625p6E5pa55qGI56ysIDEyIOiKgu+8ie+8mlxuICog6YCa6L+HIEdFVF9TVEFUVVMg5ouJ6b2QIGpvYiAvIHNjYW4gLyBwbGFuIC8gdW5kbyDlv6vnhafvvIzph43lu7rnlYzpnaLmiYDpnIDnmoTkuIDliIfvvIxcbiAqIOS4jeS+nei1lumVv+i/nuaOpeaIluWGheWtmOeKtuaAgeOAglxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzdW1lSm9iKGRlcHM6IFJlc3VtZURlcHMpOiBQcm9taXNlPFJlc3VtZVZpZXc+IHtcbiAgY29uc3QgW2pvYiwgc2NhbiwgcGxhbiwgdW5kb10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgZGVwcy5zdG9yYWdlLmxvYWRKb2IoKSxcbiAgICBkZXBzLnN0b3JhZ2UubG9hZFNjYW4oKSxcbiAgICBkZXBzLnN0b3JhZ2UubG9hZFBsYW4oKSxcbiAgICBkZXBzLnN0b3JhZ2UubG9hZFVuZG8oKSxcbiAgXSk7XG5cbiAgY29uc3QgY3VycmVudEpvYjogSm9iU3RhdGUgPVxuICAgIGpvYiA/PyB7XG4gICAgICBqb2JJZDogY3J5cHRvLnJhbmRvbVVVSUQoKSxcbiAgICAgIHN0YXR1czogJ2lkbGUnLFxuICAgICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLFxuICAgICAgYXBwbHlDdXJzb3I6IDAsXG4gICAgICBhcHBsaWVkSWRzOiBbXSxcbiAgICAgIGNyZWF0ZWRGb2xkZXJJZHM6IFtdLFxuICAgICAgY2FuY2VsUmVxdWVzdGVkOiBmYWxzZSxcbiAgICAgIGZhaWx1cmVzOiBbXSxcbiAgICB9O1xuXG4gIGNvbnN0IGpvYk1hdGNoZXMgPSAocmVjb3JkOiB7IGpvYklkOiBzdHJpbmcgfSB8IG51bGwpOiBib29sZWFuID0+XG4gICAgcmVjb3JkICE9PSBudWxsICYmIHJlY29yZC5qb2JJZCA9PT0gY3VycmVudEpvYi5qb2JJZDtcblxuICByZXR1cm4ge1xuICAgIGpvYjogY3VycmVudEpvYixcbiAgICAvLyBzY2FuIOe7k+aenOS4jeaQuuW4piBqb2JJZO+8jOebtOaOpei/lOWbnu+8m+aWsOS4gOi9ruaJq+aPj+S8muimhuebluWug+OAglxuICAgIHNjYW4sXG4gICAgaGFzVW5kb1NuYXBzaG90OiB1bmRvICE9PSBudWxsICYmIGpvYk1hdGNoZXModW5kbyksXG4gICAgcGxhbjogcGxhbiAmJiBqb2JNYXRjaGVzKHBsYW4pID8gcGxhbiA6IG51bGwsXG4gICAgLy8gaW50ZXJydXB0ZWQgPSDnlKjmiLfkuK3mlq3vvJthcHBseWluZyA9IFNXIOWcqOWGmeWFpeS4remAlOiiq+WbnuaUtu+8jOS4pOiAhemDveWPr+S7juaMgeS5heWMlua4uOagh+e7rei3keOAglxuICAgIGNhblJlc3VtZUFwcGx5OiBjdXJyZW50Sm9iLnN0YXR1cyA9PT0gJ2ludGVycnVwdGVkJyB8fCBjdXJyZW50Sm9iLnN0YXR1cyA9PT0gJ2FwcGx5aW5nJyxcbiAgICBjYW5SZXN1bWVQbGFubmluZzpcbiAgICAgIHBsYW4gIT09IG51bGwgJiZcbiAgICAgIGpvYk1hdGNoZXMocGxhbikgJiZcbiAgICAgIHBsYW4ucGhhc2UgIT09ICdkb25lJyAmJlxuICAgICAgKGN1cnJlbnRKb2Iuc3RhdHVzID09PSAncGxhbm5pbmcnIHx8XG4gICAgICAgIGN1cnJlbnRKb2Iuc3RhdHVzID09PSAnY2xhc3NpZnlpbmcnIHx8XG4gICAgICAgIGN1cnJlbnRKb2Iuc3RhdHVzID09PSAnZmFpbGVkJyB8fFxuICAgICAgICBjdXJyZW50Sm9iLnN0YXR1cyA9PT0gJ3Jldmlld2luZycpLFxuICB9O1xufVxuIiwiaW1wb3J0IHR5cGUgeyBCb29rbWFya3NQb3J0IH0gZnJvbSAnLi4vLi4vYXBwbGljYXRpb24vcG9ydHMnO1xuaW1wb3J0IHR5cGUgeyBCb29rbWFya05vZGUgfSBmcm9tICcuLi8uLi9kb21haW4vYm9va21hcmtzL3R5cGVzJztcblxuLyoqIGNocm9tZS5ib29rbWFya3Mg55qE6YCC6YWN5a6e546w44CCICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQm9va21hcmtzUmVwb3NpdG9yeSgpOiBCb29rbWFya3NQb3J0IHtcbiAgcmV0dXJuIHtcbiAgICBhc3luYyBnZXRUcmVlKCkge1xuICAgICAgY29uc3QgdHJlZSA9IGF3YWl0IGNocm9tZS5ib29rbWFya3MuZ2V0VHJlZSgpO1xuICAgICAgcmV0dXJuIHRyZWUgYXMgdW5rbm93biBhcyBCb29rbWFya05vZGVbXTtcbiAgICB9LFxuXG4gICAgYXN5bmMgZ2V0KGlkKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBub2RlcyA9IGF3YWl0IGNocm9tZS5ib29rbWFya3MuZ2V0KGlkKTtcbiAgICAgICAgcmV0dXJuIChub2Rlc1swXSBhcyB1bmtub3duIGFzIEJvb2ttYXJrTm9kZSkgPz8gdW5kZWZpbmVkO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgfSxcblxuICAgIGFzeW5jIGdldENoaWxkcmVuKHBhcmVudElkKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjaGlsZHJlbiA9IGF3YWl0IGNocm9tZS5ib29rbWFya3MuZ2V0Q2hpbGRyZW4ocGFyZW50SWQpO1xuICAgICAgICByZXR1cm4gY2hpbGRyZW4gYXMgdW5rbm93biBhcyBCb29rbWFya05vZGVbXTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgfSxcblxuICAgIGFzeW5jIGNyZWF0ZUZvbGRlcihwYXJlbnRJZCwgdGl0bGUpIHtcbiAgICAgIGNvbnN0IG5vZGUgPSBhd2FpdCBjaHJvbWUuYm9va21hcmtzLmNyZWF0ZSh7IHBhcmVudElkLCB0aXRsZSB9KTtcbiAgICAgIHJldHVybiB7IGlkOiBub2RlLmlkIH07XG4gICAgfSxcblxuICAgIGFzeW5jIG1vdmUoaWQsIGRlc3RpbmF0aW9uKSB7XG4gICAgICBhd2FpdCBjaHJvbWUuYm9va21hcmtzLm1vdmUoaWQsIGRlc3RpbmF0aW9uKTtcbiAgICB9LFxuXG4gICAgYXN5bmMgcmVtb3ZlVHJlZShpZCkge1xuICAgICAgYXdhaXQgY2hyb21lLmJvb2ttYXJrcy5yZW1vdmVUcmVlKGlkKTtcbiAgICB9LFxuICB9O1xufVxuIiwiZXhwb3J0IHZhciB1dGlsO1xuKGZ1bmN0aW9uICh1dGlsKSB7XG4gICAgdXRpbC5hc3NlcnRFcXVhbCA9IChfKSA9PiB7IH07XG4gICAgZnVuY3Rpb24gYXNzZXJ0SXMoX2FyZykgeyB9XG4gICAgdXRpbC5hc3NlcnRJcyA9IGFzc2VydElzO1xuICAgIGZ1bmN0aW9uIGFzc2VydE5ldmVyKF94KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcigpO1xuICAgIH1cbiAgICB1dGlsLmFzc2VydE5ldmVyID0gYXNzZXJ0TmV2ZXI7XG4gICAgdXRpbC5hcnJheVRvRW51bSA9IChpdGVtcykgPT4ge1xuICAgICAgICBjb25zdCBvYmogPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG4gICAgICAgICAgICBvYmpbaXRlbV0gPSBpdGVtO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvYmo7XG4gICAgfTtcbiAgICB1dGlsLmdldFZhbGlkRW51bVZhbHVlcyA9IChvYmopID0+IHtcbiAgICAgICAgY29uc3QgdmFsaWRLZXlzID0gdXRpbC5vYmplY3RLZXlzKG9iaikuZmlsdGVyKChrKSA9PiB0eXBlb2Ygb2JqW29ialtrXV0gIT09IFwibnVtYmVyXCIpO1xuICAgICAgICBjb25zdCBmaWx0ZXJlZCA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IGsgb2YgdmFsaWRLZXlzKSB7XG4gICAgICAgICAgICBmaWx0ZXJlZFtrXSA9IG9ialtrXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdXRpbC5vYmplY3RWYWx1ZXMoZmlsdGVyZWQpO1xuICAgIH07XG4gICAgdXRpbC5vYmplY3RWYWx1ZXMgPSAob2JqKSA9PiB7XG4gICAgICAgIHJldHVybiB1dGlsLm9iamVjdEtleXMob2JqKS5tYXAoZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgICAgIHJldHVybiBvYmpbZV07XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgdXRpbC5vYmplY3RLZXlzID0gdHlwZW9mIE9iamVjdC5rZXlzID09PSBcImZ1bmN0aW9uXCIgLy8gZXNsaW50LWRpc2FibGUtbGluZSBiYW4vYmFuXG4gICAgICAgID8gKG9iaikgPT4gT2JqZWN0LmtleXMob2JqKSAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIGJhbi9iYW5cbiAgICAgICAgOiAob2JqZWN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBrZXlzID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwga2V5KSkge1xuICAgICAgICAgICAgICAgICAgICBrZXlzLnB1c2goa2V5KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ga2V5cztcbiAgICAgICAgfTtcbiAgICB1dGlsLmZpbmQgPSAoYXJyLCBjaGVja2VyKSA9PiB7XG4gICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBhcnIpIHtcbiAgICAgICAgICAgIGlmIChjaGVja2VyKGl0ZW0pKVxuICAgICAgICAgICAgICAgIHJldHVybiBpdGVtO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfTtcbiAgICB1dGlsLmlzSW50ZWdlciA9IHR5cGVvZiBOdW1iZXIuaXNJbnRlZ2VyID09PSBcImZ1bmN0aW9uXCJcbiAgICAgICAgPyAodmFsKSA9PiBOdW1iZXIuaXNJbnRlZ2VyKHZhbCkgLy8gZXNsaW50LWRpc2FibGUtbGluZSBiYW4vYmFuXG4gICAgICAgIDogKHZhbCkgPT4gdHlwZW9mIHZhbCA9PT0gXCJudW1iZXJcIiAmJiBOdW1iZXIuaXNGaW5pdGUodmFsKSAmJiBNYXRoLmZsb29yKHZhbCkgPT09IHZhbDtcbiAgICBmdW5jdGlvbiBqb2luVmFsdWVzKGFycmF5LCBzZXBhcmF0b3IgPSBcIiB8IFwiKSB7XG4gICAgICAgIHJldHVybiBhcnJheS5tYXAoKHZhbCkgPT4gKHR5cGVvZiB2YWwgPT09IFwic3RyaW5nXCIgPyBgJyR7dmFsfSdgIDogdmFsKSkuam9pbihzZXBhcmF0b3IpO1xuICAgIH1cbiAgICB1dGlsLmpvaW5WYWx1ZXMgPSBqb2luVmFsdWVzO1xuICAgIHV0aWwuanNvblN0cmluZ2lmeVJlcGxhY2VyID0gKF8sIHZhbHVlKSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09IFwiYmlnaW50XCIpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZS50b1N0cmluZygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9O1xufSkodXRpbCB8fCAodXRpbCA9IHt9KSk7XG5leHBvcnQgdmFyIG9iamVjdFV0aWw7XG4oZnVuY3Rpb24gKG9iamVjdFV0aWwpIHtcbiAgICBvYmplY3RVdGlsLm1lcmdlU2hhcGVzID0gKGZpcnN0LCBzZWNvbmQpID0+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIC4uLmZpcnN0LFxuICAgICAgICAgICAgLi4uc2Vjb25kLCAvLyBzZWNvbmQgb3ZlcndyaXRlcyBmaXJzdFxuICAgICAgICB9O1xuICAgIH07XG59KShvYmplY3RVdGlsIHx8IChvYmplY3RVdGlsID0ge30pKTtcbmV4cG9ydCBjb25zdCBab2RQYXJzZWRUeXBlID0gdXRpbC5hcnJheVRvRW51bShbXG4gICAgXCJzdHJpbmdcIixcbiAgICBcIm5hblwiLFxuICAgIFwibnVtYmVyXCIsXG4gICAgXCJpbnRlZ2VyXCIsXG4gICAgXCJmbG9hdFwiLFxuICAgIFwiYm9vbGVhblwiLFxuICAgIFwiZGF0ZVwiLFxuICAgIFwiYmlnaW50XCIsXG4gICAgXCJzeW1ib2xcIixcbiAgICBcImZ1bmN0aW9uXCIsXG4gICAgXCJ1bmRlZmluZWRcIixcbiAgICBcIm51bGxcIixcbiAgICBcImFycmF5XCIsXG4gICAgXCJvYmplY3RcIixcbiAgICBcInVua25vd25cIixcbiAgICBcInByb21pc2VcIixcbiAgICBcInZvaWRcIixcbiAgICBcIm5ldmVyXCIsXG4gICAgXCJtYXBcIixcbiAgICBcInNldFwiLFxuXSk7XG5leHBvcnQgY29uc3QgZ2V0UGFyc2VkVHlwZSA9IChkYXRhKSA9PiB7XG4gICAgY29uc3QgdCA9IHR5cGVvZiBkYXRhO1xuICAgIHN3aXRjaCAodCkge1xuICAgICAgICBjYXNlIFwidW5kZWZpbmVkXCI6XG4gICAgICAgICAgICByZXR1cm4gWm9kUGFyc2VkVHlwZS51bmRlZmluZWQ7XG4gICAgICAgIGNhc2UgXCJzdHJpbmdcIjpcbiAgICAgICAgICAgIHJldHVybiBab2RQYXJzZWRUeXBlLnN0cmluZztcbiAgICAgICAgY2FzZSBcIm51bWJlclwiOlxuICAgICAgICAgICAgcmV0dXJuIE51bWJlci5pc05hTihkYXRhKSA/IFpvZFBhcnNlZFR5cGUubmFuIDogWm9kUGFyc2VkVHlwZS5udW1iZXI7XG4gICAgICAgIGNhc2UgXCJib29sZWFuXCI6XG4gICAgICAgICAgICByZXR1cm4gWm9kUGFyc2VkVHlwZS5ib29sZWFuO1xuICAgICAgICBjYXNlIFwiZnVuY3Rpb25cIjpcbiAgICAgICAgICAgIHJldHVybiBab2RQYXJzZWRUeXBlLmZ1bmN0aW9uO1xuICAgICAgICBjYXNlIFwiYmlnaW50XCI6XG4gICAgICAgICAgICByZXR1cm4gWm9kUGFyc2VkVHlwZS5iaWdpbnQ7XG4gICAgICAgIGNhc2UgXCJzeW1ib2xcIjpcbiAgICAgICAgICAgIHJldHVybiBab2RQYXJzZWRUeXBlLnN5bWJvbDtcbiAgICAgICAgY2FzZSBcIm9iamVjdFwiOlxuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gWm9kUGFyc2VkVHlwZS5hcnJheTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkYXRhID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFpvZFBhcnNlZFR5cGUubnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkYXRhLnRoZW4gJiYgdHlwZW9mIGRhdGEudGhlbiA9PT0gXCJmdW5jdGlvblwiICYmIGRhdGEuY2F0Y2ggJiYgdHlwZW9mIGRhdGEuY2F0Y2ggPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgICAgIHJldHVybiBab2RQYXJzZWRUeXBlLnByb21pc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZW9mIE1hcCAhPT0gXCJ1bmRlZmluZWRcIiAmJiBkYXRhIGluc3RhbmNlb2YgTWFwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFpvZFBhcnNlZFR5cGUubWFwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHR5cGVvZiBTZXQgIT09IFwidW5kZWZpbmVkXCIgJiYgZGF0YSBpbnN0YW5jZW9mIFNldCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBab2RQYXJzZWRUeXBlLnNldDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0eXBlb2YgRGF0ZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiBkYXRhIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBab2RQYXJzZWRUeXBlLmRhdGU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gWm9kUGFyc2VkVHlwZS5vYmplY3Q7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gWm9kUGFyc2VkVHlwZS51bmtub3duO1xuICAgIH1cbn07XG4iLCJpbXBvcnQgeyB1dGlsIH0gZnJvbSBcIi4vaGVscGVycy91dGlsLmpzXCI7XG5leHBvcnQgY29uc3QgWm9kSXNzdWVDb2RlID0gdXRpbC5hcnJheVRvRW51bShbXG4gICAgXCJpbnZhbGlkX3R5cGVcIixcbiAgICBcImludmFsaWRfbGl0ZXJhbFwiLFxuICAgIFwiY3VzdG9tXCIsXG4gICAgXCJpbnZhbGlkX3VuaW9uXCIsXG4gICAgXCJpbnZhbGlkX3VuaW9uX2Rpc2NyaW1pbmF0b3JcIixcbiAgICBcImludmFsaWRfZW51bV92YWx1ZVwiLFxuICAgIFwidW5yZWNvZ25pemVkX2tleXNcIixcbiAgICBcImludmFsaWRfYXJndW1lbnRzXCIsXG4gICAgXCJpbnZhbGlkX3JldHVybl90eXBlXCIsXG4gICAgXCJpbnZhbGlkX2RhdGVcIixcbiAgICBcImludmFsaWRfc3RyaW5nXCIsXG4gICAgXCJ0b29fc21hbGxcIixcbiAgICBcInRvb19iaWdcIixcbiAgICBcImludmFsaWRfaW50ZXJzZWN0aW9uX3R5cGVzXCIsXG4gICAgXCJub3RfbXVsdGlwbGVfb2ZcIixcbiAgICBcIm5vdF9maW5pdGVcIixcbl0pO1xuZXhwb3J0IGNvbnN0IHF1b3RlbGVzc0pzb24gPSAob2JqKSA9PiB7XG4gICAgY29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KG9iaiwgbnVsbCwgMik7XG4gICAgcmV0dXJuIGpzb24ucmVwbGFjZSgvXCIoW15cIl0rKVwiOi9nLCBcIiQxOlwiKTtcbn07XG5leHBvcnQgY2xhc3MgWm9kRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gICAgZ2V0IGVycm9ycygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNzdWVzO1xuICAgIH1cbiAgICBjb25zdHJ1Y3Rvcihpc3N1ZXMpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy5pc3N1ZXMgPSBbXTtcbiAgICAgICAgdGhpcy5hZGRJc3N1ZSA9IChzdWIpID0+IHtcbiAgICAgICAgICAgIHRoaXMuaXNzdWVzID0gWy4uLnRoaXMuaXNzdWVzLCBzdWJdO1xuICAgICAgICB9O1xuICAgICAgICB0aGlzLmFkZElzc3VlcyA9IChzdWJzID0gW10pID0+IHtcbiAgICAgICAgICAgIHRoaXMuaXNzdWVzID0gWy4uLnRoaXMuaXNzdWVzLCAuLi5zdWJzXTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgYWN0dWFsUHJvdG8gPSBuZXcudGFyZ2V0LnByb3RvdHlwZTtcbiAgICAgICAgaWYgKE9iamVjdC5zZXRQcm90b3R5cGVPZikge1xuICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGJhbi9iYW5cbiAgICAgICAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZih0aGlzLCBhY3R1YWxQcm90byk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9fcHJvdG9fXyA9IGFjdHVhbFByb3RvO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMubmFtZSA9IFwiWm9kRXJyb3JcIjtcbiAgICAgICAgdGhpcy5pc3N1ZXMgPSBpc3N1ZXM7XG4gICAgfVxuICAgIGZvcm1hdChfbWFwcGVyKSB7XG4gICAgICAgIGNvbnN0IG1hcHBlciA9IF9tYXBwZXIgfHxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChpc3N1ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBpc3N1ZS5tZXNzYWdlO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgY29uc3QgZmllbGRFcnJvcnMgPSB7IF9lcnJvcnM6IFtdIH07XG4gICAgICAgIGNvbnN0IHByb2Nlc3NFcnJvciA9IChlcnJvcikgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBpc3N1ZSBvZiBlcnJvci5pc3N1ZXMpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNzdWUuY29kZSA9PT0gXCJpbnZhbGlkX3VuaW9uXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaXNzdWUudW5pb25FcnJvcnMubWFwKHByb2Nlc3NFcnJvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGlzc3VlLmNvZGUgPT09IFwiaW52YWxpZF9yZXR1cm5fdHlwZVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHByb2Nlc3NFcnJvcihpc3N1ZS5yZXR1cm5UeXBlRXJyb3IpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChpc3N1ZS5jb2RlID09PSBcImludmFsaWRfYXJndW1lbnRzXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc0Vycm9yKGlzc3VlLmFyZ3VtZW50c0Vycm9yKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoaXNzdWUucGF0aC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgZmllbGRFcnJvcnMuX2Vycm9ycy5wdXNoKG1hcHBlcihpc3N1ZSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGN1cnIgPSBmaWVsZEVycm9ycztcbiAgICAgICAgICAgICAgICAgICAgbGV0IGkgPSAwO1xuICAgICAgICAgICAgICAgICAgICB3aGlsZSAoaSA8IGlzc3VlLnBhdGgubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBlbCA9IGlzc3VlLnBhdGhbaV07XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0ZXJtaW5hbCA9IGkgPT09IGlzc3VlLnBhdGgubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdGVybWluYWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJyW2VsXSA9IGN1cnJbZWxdIHx8IHsgX2Vycm9yczogW10gfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiAodHlwZW9mIGVsID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICBjdXJyW2VsXSA9IGN1cnJbZWxdIHx8IHsgX2Vycm9yczogW10gfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB9IGVsc2UgaWYgKHR5cGVvZiBlbCA9PT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgY29uc3QgZXJyb3JBcnJheTogYW55ID0gW107XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICBlcnJvckFycmF5Ll9lcnJvcnMgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgIGN1cnJbZWxdID0gY3VycltlbF0gfHwgZXJyb3JBcnJheTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJyW2VsXSA9IGN1cnJbZWxdIHx8IHsgX2Vycm9yczogW10gfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJyW2VsXS5fZXJyb3JzLnB1c2gobWFwcGVyKGlzc3VlKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyID0gY3VycltlbF07XG4gICAgICAgICAgICAgICAgICAgICAgICBpKys7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHByb2Nlc3NFcnJvcih0aGlzKTtcbiAgICAgICAgcmV0dXJuIGZpZWxkRXJyb3JzO1xuICAgIH1cbiAgICBzdGF0aWMgYXNzZXJ0KHZhbHVlKSB7XG4gICAgICAgIGlmICghKHZhbHVlIGluc3RhbmNlb2YgWm9kRXJyb3IpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vdCBhIFpvZEVycm9yOiAke3ZhbHVlfWApO1xuICAgICAgICB9XG4gICAgfVxuICAgIHRvU3RyaW5nKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5tZXNzYWdlO1xuICAgIH1cbiAgICBnZXQgbWVzc2FnZSgpIHtcbiAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHRoaXMuaXNzdWVzLCB1dGlsLmpzb25TdHJpbmdpZnlSZXBsYWNlciwgMik7XG4gICAgfVxuICAgIGdldCBpc0VtcHR5KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5pc3N1ZXMubGVuZ3RoID09PSAwO1xuICAgIH1cbiAgICBmbGF0dGVuKG1hcHBlciA9IChpc3N1ZSkgPT4gaXNzdWUubWVzc2FnZSkge1xuICAgICAgICBjb25zdCBmaWVsZEVycm9ycyA9IHt9O1xuICAgICAgICBjb25zdCBmb3JtRXJyb3JzID0gW107XG4gICAgICAgIGZvciAoY29uc3Qgc3ViIG9mIHRoaXMuaXNzdWVzKSB7XG4gICAgICAgICAgICBpZiAoc3ViLnBhdGgubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpcnN0RWwgPSBzdWIucGF0aFswXTtcbiAgICAgICAgICAgICAgICBmaWVsZEVycm9yc1tmaXJzdEVsXSA9IGZpZWxkRXJyb3JzW2ZpcnN0RWxdIHx8IFtdO1xuICAgICAgICAgICAgICAgIGZpZWxkRXJyb3JzW2ZpcnN0RWxdLnB1c2gobWFwcGVyKHN1YikpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZm9ybUVycm9ycy5wdXNoKG1hcHBlcihzdWIpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBmb3JtRXJyb3JzLCBmaWVsZEVycm9ycyB9O1xuICAgIH1cbiAgICBnZXQgZm9ybUVycm9ycygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZmxhdHRlbigpO1xuICAgIH1cbn1cblpvZEVycm9yLmNyZWF0ZSA9IChpc3N1ZXMpID0+IHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBab2RFcnJvcihpc3N1ZXMpO1xuICAgIHJldHVybiBlcnJvcjtcbn07XG4iLCJpbXBvcnQgeyBab2RJc3N1ZUNvZGUgfSBmcm9tIFwiLi4vWm9kRXJyb3IuanNcIjtcbmltcG9ydCB7IHV0aWwsIFpvZFBhcnNlZFR5cGUgfSBmcm9tIFwiLi4vaGVscGVycy91dGlsLmpzXCI7XG5jb25zdCBlcnJvck1hcCA9IChpc3N1ZSwgX2N0eCkgPT4ge1xuICAgIGxldCBtZXNzYWdlO1xuICAgIHN3aXRjaCAoaXNzdWUuY29kZSkge1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGU6XG4gICAgICAgICAgICBpZiAoaXNzdWUucmVjZWl2ZWQgPT09IFpvZFBhcnNlZFR5cGUudW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IFwiUmVxdWlyZWRcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgRXhwZWN0ZWQgJHtpc3N1ZS5leHBlY3RlZH0sIHJlY2VpdmVkICR7aXNzdWUucmVjZWl2ZWR9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS5pbnZhbGlkX2xpdGVyYWw6XG4gICAgICAgICAgICBtZXNzYWdlID0gYEludmFsaWQgbGl0ZXJhbCB2YWx1ZSwgZXhwZWN0ZWQgJHtKU09OLnN0cmluZ2lmeShpc3N1ZS5leHBlY3RlZCwgdXRpbC5qc29uU3RyaW5naWZ5UmVwbGFjZXIpfWA7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUudW5yZWNvZ25pemVkX2tleXM6XG4gICAgICAgICAgICBtZXNzYWdlID0gYFVucmVjb2duaXplZCBrZXkocykgaW4gb2JqZWN0OiAke3V0aWwuam9pblZhbHVlcyhpc3N1ZS5rZXlzLCBcIiwgXCIpfWA7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUuaW52YWxpZF91bmlvbjpcbiAgICAgICAgICAgIG1lc3NhZ2UgPSBgSW52YWxpZCBpbnB1dGA7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUuaW52YWxpZF91bmlvbl9kaXNjcmltaW5hdG9yOlxuICAgICAgICAgICAgbWVzc2FnZSA9IGBJbnZhbGlkIGRpc2NyaW1pbmF0b3IgdmFsdWUuIEV4cGVjdGVkICR7dXRpbC5qb2luVmFsdWVzKGlzc3VlLm9wdGlvbnMpfWA7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUuaW52YWxpZF9lbnVtX3ZhbHVlOlxuICAgICAgICAgICAgbWVzc2FnZSA9IGBJbnZhbGlkIGVudW0gdmFsdWUuIEV4cGVjdGVkICR7dXRpbC5qb2luVmFsdWVzKGlzc3VlLm9wdGlvbnMpfSwgcmVjZWl2ZWQgJyR7aXNzdWUucmVjZWl2ZWR9J2A7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUuaW52YWxpZF9hcmd1bWVudHM6XG4gICAgICAgICAgICBtZXNzYWdlID0gYEludmFsaWQgZnVuY3Rpb24gYXJndW1lbnRzYDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS5pbnZhbGlkX3JldHVybl90eXBlOlxuICAgICAgICAgICAgbWVzc2FnZSA9IGBJbnZhbGlkIGZ1bmN0aW9uIHJldHVybiB0eXBlYDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS5pbnZhbGlkX2RhdGU6XG4gICAgICAgICAgICBtZXNzYWdlID0gYEludmFsaWQgZGF0ZWA7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmc6XG4gICAgICAgICAgICBpZiAodHlwZW9mIGlzc3VlLnZhbGlkYXRpb24gPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoXCJpbmNsdWRlc1wiIGluIGlzc3VlLnZhbGlkYXRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZSA9IGBJbnZhbGlkIGlucHV0OiBtdXN0IGluY2x1ZGUgXCIke2lzc3VlLnZhbGlkYXRpb24uaW5jbHVkZXN9XCJgO1xuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGlzc3VlLnZhbGlkYXRpb24ucG9zaXRpb24gPT09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgJHttZXNzYWdlfSBhdCBvbmUgb3IgbW9yZSBwb3NpdGlvbnMgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvICR7aXNzdWUudmFsaWRhdGlvbi5wb3NpdGlvbn1gO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKFwic3RhcnRzV2l0aFwiIGluIGlzc3VlLnZhbGlkYXRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZSA9IGBJbnZhbGlkIGlucHV0OiBtdXN0IHN0YXJ0IHdpdGggXCIke2lzc3VlLnZhbGlkYXRpb24uc3RhcnRzV2l0aH1cImA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKFwiZW5kc1dpdGhcIiBpbiBpc3N1ZS52YWxpZGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgSW52YWxpZCBpbnB1dDogbXVzdCBlbmQgd2l0aCBcIiR7aXNzdWUudmFsaWRhdGlvbi5lbmRzV2l0aH1cImA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB1dGlsLmFzc2VydE5ldmVyKGlzc3VlLnZhbGlkYXRpb24pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGlzc3VlLnZhbGlkYXRpb24gIT09IFwicmVnZXhcIikge1xuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgSW52YWxpZCAke2lzc3VlLnZhbGlkYXRpb259YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBcIkludmFsaWRcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS50b29fc21hbGw6XG4gICAgICAgICAgICBpZiAoaXNzdWUudHlwZSA9PT0gXCJhcnJheVwiKVxuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgQXJyYXkgbXVzdCBjb250YWluICR7aXNzdWUuZXhhY3QgPyBcImV4YWN0bHlcIiA6IGlzc3VlLmluY2x1c2l2ZSA/IGBhdCBsZWFzdGAgOiBgbW9yZSB0aGFuYH0gJHtpc3N1ZS5taW5pbXVtfSBlbGVtZW50KHMpYDtcbiAgICAgICAgICAgIGVsc2UgaWYgKGlzc3VlLnR5cGUgPT09IFwic3RyaW5nXCIpXG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IGBTdHJpbmcgbXVzdCBjb250YWluICR7aXNzdWUuZXhhY3QgPyBcImV4YWN0bHlcIiA6IGlzc3VlLmluY2x1c2l2ZSA/IGBhdCBsZWFzdGAgOiBgb3ZlcmB9ICR7aXNzdWUubWluaW11bX0gY2hhcmFjdGVyKHMpYDtcbiAgICAgICAgICAgIGVsc2UgaWYgKGlzc3VlLnR5cGUgPT09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IGBOdW1iZXIgbXVzdCBiZSAke2lzc3VlLmV4YWN0ID8gYGV4YWN0bHkgZXF1YWwgdG8gYCA6IGlzc3VlLmluY2x1c2l2ZSA/IGBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gYCA6IGBncmVhdGVyIHRoYW4gYH0ke2lzc3VlLm1pbmltdW19YDtcbiAgICAgICAgICAgIGVsc2UgaWYgKGlzc3VlLnR5cGUgPT09IFwiYmlnaW50XCIpXG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IGBOdW1iZXIgbXVzdCBiZSAke2lzc3VlLmV4YWN0ID8gYGV4YWN0bHkgZXF1YWwgdG8gYCA6IGlzc3VlLmluY2x1c2l2ZSA/IGBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gYCA6IGBncmVhdGVyIHRoYW4gYH0ke2lzc3VlLm1pbmltdW19YDtcbiAgICAgICAgICAgIGVsc2UgaWYgKGlzc3VlLnR5cGUgPT09IFwiZGF0ZVwiKVxuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgRGF0ZSBtdXN0IGJlICR7aXNzdWUuZXhhY3QgPyBgZXhhY3RseSBlcXVhbCB0byBgIDogaXNzdWUuaW5jbHVzaXZlID8gYGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byBgIDogYGdyZWF0ZXIgdGhhbiBgfSR7bmV3IERhdGUoTnVtYmVyKGlzc3VlLm1pbmltdW0pKX1gO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBcIkludmFsaWQgaW5wdXRcIjtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS50b29fYmlnOlxuICAgICAgICAgICAgaWYgKGlzc3VlLnR5cGUgPT09IFwiYXJyYXlcIilcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gYEFycmF5IG11c3QgY29udGFpbiAke2lzc3VlLmV4YWN0ID8gYGV4YWN0bHlgIDogaXNzdWUuaW5jbHVzaXZlID8gYGF0IG1vc3RgIDogYGxlc3MgdGhhbmB9ICR7aXNzdWUubWF4aW11bX0gZWxlbWVudChzKWA7XG4gICAgICAgICAgICBlbHNlIGlmIChpc3N1ZS50eXBlID09PSBcInN0cmluZ1wiKVxuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgU3RyaW5nIG11c3QgY29udGFpbiAke2lzc3VlLmV4YWN0ID8gYGV4YWN0bHlgIDogaXNzdWUuaW5jbHVzaXZlID8gYGF0IG1vc3RgIDogYHVuZGVyYH0gJHtpc3N1ZS5tYXhpbXVtfSBjaGFyYWN0ZXIocylgO1xuICAgICAgICAgICAgZWxzZSBpZiAoaXNzdWUudHlwZSA9PT0gXCJudW1iZXJcIilcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gYE51bWJlciBtdXN0IGJlICR7aXNzdWUuZXhhY3QgPyBgZXhhY3RseWAgOiBpc3N1ZS5pbmNsdXNpdmUgPyBgbGVzcyB0aGFuIG9yIGVxdWFsIHRvYCA6IGBsZXNzIHRoYW5gfSAke2lzc3VlLm1heGltdW19YDtcbiAgICAgICAgICAgIGVsc2UgaWYgKGlzc3VlLnR5cGUgPT09IFwiYmlnaW50XCIpXG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IGBCaWdJbnQgbXVzdCBiZSAke2lzc3VlLmV4YWN0ID8gYGV4YWN0bHlgIDogaXNzdWUuaW5jbHVzaXZlID8gYGxlc3MgdGhhbiBvciBlcXVhbCB0b2AgOiBgbGVzcyB0aGFuYH0gJHtpc3N1ZS5tYXhpbXVtfWA7XG4gICAgICAgICAgICBlbHNlIGlmIChpc3N1ZS50eXBlID09PSBcImRhdGVcIilcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gYERhdGUgbXVzdCBiZSAke2lzc3VlLmV4YWN0ID8gYGV4YWN0bHlgIDogaXNzdWUuaW5jbHVzaXZlID8gYHNtYWxsZXIgdGhhbiBvciBlcXVhbCB0b2AgOiBgc21hbGxlciB0aGFuYH0gJHtuZXcgRGF0ZShOdW1iZXIoaXNzdWUubWF4aW11bSkpfWA7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IFwiSW52YWxpZCBpbnB1dFwiO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLmN1c3RvbTpcbiAgICAgICAgICAgIG1lc3NhZ2UgPSBgSW52YWxpZCBpbnB1dGA7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUuaW52YWxpZF9pbnRlcnNlY3Rpb25fdHlwZXM6XG4gICAgICAgICAgICBtZXNzYWdlID0gYEludGVyc2VjdGlvbiByZXN1bHRzIGNvdWxkIG5vdCBiZSBtZXJnZWRgO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLm5vdF9tdWx0aXBsZV9vZjpcbiAgICAgICAgICAgIG1lc3NhZ2UgPSBgTnVtYmVyIG11c3QgYmUgYSBtdWx0aXBsZSBvZiAke2lzc3VlLm11bHRpcGxlT2Z9YDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS5ub3RfZmluaXRlOlxuICAgICAgICAgICAgbWVzc2FnZSA9IFwiTnVtYmVyIG11c3QgYmUgZmluaXRlXCI7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIG1lc3NhZ2UgPSBfY3R4LmRlZmF1bHRFcnJvcjtcbiAgICAgICAgICAgIHV0aWwuYXNzZXJ0TmV2ZXIoaXNzdWUpO1xuICAgIH1cbiAgICByZXR1cm4geyBtZXNzYWdlIH07XG59O1xuZXhwb3J0IGRlZmF1bHQgZXJyb3JNYXA7XG4iLCJpbXBvcnQgZGVmYXVsdEVycm9yTWFwIGZyb20gXCIuL2xvY2FsZXMvZW4uanNcIjtcbmxldCBvdmVycmlkZUVycm9yTWFwID0gZGVmYXVsdEVycm9yTWFwO1xuZXhwb3J0IHsgZGVmYXVsdEVycm9yTWFwIH07XG5leHBvcnQgZnVuY3Rpb24gc2V0RXJyb3JNYXAobWFwKSB7XG4gICAgb3ZlcnJpZGVFcnJvck1hcCA9IG1hcDtcbn1cbmV4cG9ydCBmdW5jdGlvbiBnZXRFcnJvck1hcCgpIHtcbiAgICByZXR1cm4gb3ZlcnJpZGVFcnJvck1hcDtcbn1cbiIsImltcG9ydCB7IGdldEVycm9yTWFwIH0gZnJvbSBcIi4uL2Vycm9ycy5qc1wiO1xuaW1wb3J0IGRlZmF1bHRFcnJvck1hcCBmcm9tIFwiLi4vbG9jYWxlcy9lbi5qc1wiO1xuZXhwb3J0IGNvbnN0IG1ha2VJc3N1ZSA9IChwYXJhbXMpID0+IHtcbiAgICBjb25zdCB7IGRhdGEsIHBhdGgsIGVycm9yTWFwcywgaXNzdWVEYXRhIH0gPSBwYXJhbXM7XG4gICAgY29uc3QgZnVsbFBhdGggPSBbLi4ucGF0aCwgLi4uKGlzc3VlRGF0YS5wYXRoIHx8IFtdKV07XG4gICAgY29uc3QgZnVsbElzc3VlID0ge1xuICAgICAgICAuLi5pc3N1ZURhdGEsXG4gICAgICAgIHBhdGg6IGZ1bGxQYXRoLFxuICAgIH07XG4gICAgaWYgKGlzc3VlRGF0YS5tZXNzYWdlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIC4uLmlzc3VlRGF0YSxcbiAgICAgICAgICAgIHBhdGg6IGZ1bGxQYXRoLFxuICAgICAgICAgICAgbWVzc2FnZTogaXNzdWVEYXRhLm1lc3NhZ2UsXG4gICAgICAgIH07XG4gICAgfVxuICAgIGxldCBlcnJvck1lc3NhZ2UgPSBcIlwiO1xuICAgIGNvbnN0IG1hcHMgPSBlcnJvck1hcHNcbiAgICAgICAgLmZpbHRlcigobSkgPT4gISFtKVxuICAgICAgICAuc2xpY2UoKVxuICAgICAgICAucmV2ZXJzZSgpO1xuICAgIGZvciAoY29uc3QgbWFwIG9mIG1hcHMpIHtcbiAgICAgICAgZXJyb3JNZXNzYWdlID0gbWFwKGZ1bGxJc3N1ZSwgeyBkYXRhLCBkZWZhdWx0RXJyb3I6IGVycm9yTWVzc2FnZSB9KS5tZXNzYWdlO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICAuLi5pc3N1ZURhdGEsXG4gICAgICAgIHBhdGg6IGZ1bGxQYXRoLFxuICAgICAgICBtZXNzYWdlOiBlcnJvck1lc3NhZ2UsXG4gICAgfTtcbn07XG5leHBvcnQgY29uc3QgRU1QVFlfUEFUSCA9IFtdO1xuZXhwb3J0IGZ1bmN0aW9uIGFkZElzc3VlVG9Db250ZXh0KGN0eCwgaXNzdWVEYXRhKSB7XG4gICAgY29uc3Qgb3ZlcnJpZGVNYXAgPSBnZXRFcnJvck1hcCgpO1xuICAgIGNvbnN0IGlzc3VlID0gbWFrZUlzc3VlKHtcbiAgICAgICAgaXNzdWVEYXRhOiBpc3N1ZURhdGEsXG4gICAgICAgIGRhdGE6IGN0eC5kYXRhLFxuICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgZXJyb3JNYXBzOiBbXG4gICAgICAgICAgICBjdHguY29tbW9uLmNvbnRleHR1YWxFcnJvck1hcCwgLy8gY29udGV4dHVhbCBlcnJvciBtYXAgaXMgZmlyc3QgcHJpb3JpdHlcbiAgICAgICAgICAgIGN0eC5zY2hlbWFFcnJvck1hcCwgLy8gdGhlbiBzY2hlbWEtYm91bmQgbWFwIGlmIGF2YWlsYWJsZVxuICAgICAgICAgICAgb3ZlcnJpZGVNYXAsIC8vIHRoZW4gZ2xvYmFsIG92ZXJyaWRlIG1hcFxuICAgICAgICAgICAgb3ZlcnJpZGVNYXAgPT09IGRlZmF1bHRFcnJvck1hcCA/IHVuZGVmaW5lZCA6IGRlZmF1bHRFcnJvck1hcCwgLy8gdGhlbiBnbG9iYWwgZGVmYXVsdCBtYXBcbiAgICAgICAgXS5maWx0ZXIoKHgpID0+ICEheCksXG4gICAgfSk7XG4gICAgY3R4LmNvbW1vbi5pc3N1ZXMucHVzaChpc3N1ZSk7XG59XG5leHBvcnQgY2xhc3MgUGFyc2VTdGF0dXMge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLnZhbHVlID0gXCJ2YWxpZFwiO1xuICAgIH1cbiAgICBkaXJ0eSgpIHtcbiAgICAgICAgaWYgKHRoaXMudmFsdWUgPT09IFwidmFsaWRcIilcbiAgICAgICAgICAgIHRoaXMudmFsdWUgPSBcImRpcnR5XCI7XG4gICAgfVxuICAgIGFib3J0KCkge1xuICAgICAgICBpZiAodGhpcy52YWx1ZSAhPT0gXCJhYm9ydGVkXCIpXG4gICAgICAgICAgICB0aGlzLnZhbHVlID0gXCJhYm9ydGVkXCI7XG4gICAgfVxuICAgIHN0YXRpYyBtZXJnZUFycmF5KHN0YXR1cywgcmVzdWx0cykge1xuICAgICAgICBjb25zdCBhcnJheVZhbHVlID0gW107XG4gICAgICAgIGZvciAoY29uc3QgcyBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgICBpZiAocy5zdGF0dXMgPT09IFwiYWJvcnRlZFwiKVxuICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgaWYgKHMuc3RhdHVzID09PSBcImRpcnR5XCIpXG4gICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICBhcnJheVZhbHVlLnB1c2gocy52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBzdGF0dXMudmFsdWUsIHZhbHVlOiBhcnJheVZhbHVlIH07XG4gICAgfVxuICAgIHN0YXRpYyBhc3luYyBtZXJnZU9iamVjdEFzeW5jKHN0YXR1cywgcGFpcnMpIHtcbiAgICAgICAgY29uc3Qgc3luY1BhaXJzID0gW107XG4gICAgICAgIGZvciAoY29uc3QgcGFpciBvZiBwYWlycykge1xuICAgICAgICAgICAgY29uc3Qga2V5ID0gYXdhaXQgcGFpci5rZXk7XG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IGF3YWl0IHBhaXIudmFsdWU7XG4gICAgICAgICAgICBzeW5jUGFpcnMucHVzaCh7XG4gICAgICAgICAgICAgICAga2V5LFxuICAgICAgICAgICAgICAgIHZhbHVlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFBhcnNlU3RhdHVzLm1lcmdlT2JqZWN0U3luYyhzdGF0dXMsIHN5bmNQYWlycyk7XG4gICAgfVxuICAgIHN0YXRpYyBtZXJnZU9iamVjdFN5bmMoc3RhdHVzLCBwYWlycykge1xuICAgICAgICBjb25zdCBmaW5hbE9iamVjdCA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IHBhaXIgb2YgcGFpcnMpIHtcbiAgICAgICAgICAgIGNvbnN0IHsga2V5LCB2YWx1ZSB9ID0gcGFpcjtcbiAgICAgICAgICAgIGlmIChrZXkuc3RhdHVzID09PSBcImFib3J0ZWRcIilcbiAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgIGlmICh2YWx1ZS5zdGF0dXMgPT09IFwiYWJvcnRlZFwiKVxuICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgaWYgKGtleS5zdGF0dXMgPT09IFwiZGlydHlcIilcbiAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgIGlmICh2YWx1ZS5zdGF0dXMgPT09IFwiZGlydHlcIilcbiAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgIGlmIChrZXkudmFsdWUgIT09IFwiX19wcm90b19fXCIgJiYgKHR5cGVvZiB2YWx1ZS52YWx1ZSAhPT0gXCJ1bmRlZmluZWRcIiB8fCBwYWlyLmFsd2F5c1NldCkpIHtcbiAgICAgICAgICAgICAgICBmaW5hbE9iamVjdFtrZXkudmFsdWVdID0gdmFsdWUudmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBzdGF0dXMudmFsdWUsIHZhbHVlOiBmaW5hbE9iamVjdCB9O1xuICAgIH1cbn1cbmV4cG9ydCBjb25zdCBJTlZBTElEID0gT2JqZWN0LmZyZWV6ZSh7XG4gICAgc3RhdHVzOiBcImFib3J0ZWRcIixcbn0pO1xuZXhwb3J0IGNvbnN0IERJUlRZID0gKHZhbHVlKSA9PiAoeyBzdGF0dXM6IFwiZGlydHlcIiwgdmFsdWUgfSk7XG5leHBvcnQgY29uc3QgT0sgPSAodmFsdWUpID0+ICh7IHN0YXR1czogXCJ2YWxpZFwiLCB2YWx1ZSB9KTtcbmV4cG9ydCBjb25zdCBpc0Fib3J0ZWQgPSAoeCkgPT4geC5zdGF0dXMgPT09IFwiYWJvcnRlZFwiO1xuZXhwb3J0IGNvbnN0IGlzRGlydHkgPSAoeCkgPT4geC5zdGF0dXMgPT09IFwiZGlydHlcIjtcbmV4cG9ydCBjb25zdCBpc1ZhbGlkID0gKHgpID0+IHguc3RhdHVzID09PSBcInZhbGlkXCI7XG5leHBvcnQgY29uc3QgaXNBc3luYyA9ICh4KSA9PiB0eXBlb2YgUHJvbWlzZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiB4IGluc3RhbmNlb2YgUHJvbWlzZTtcbiIsImV4cG9ydCB2YXIgZXJyb3JVdGlsO1xuKGZ1bmN0aW9uIChlcnJvclV0aWwpIHtcbiAgICBlcnJvclV0aWwuZXJyVG9PYmogPSAobWVzc2FnZSkgPT4gdHlwZW9mIG1lc3NhZ2UgPT09IFwic3RyaW5nXCIgPyB7IG1lc3NhZ2UgfSA6IG1lc3NhZ2UgfHwge307XG4gICAgLy8gYmlvbWUtaWdub3JlIGxpbnQ6XG4gICAgZXJyb3JVdGlsLnRvU3RyaW5nID0gKG1lc3NhZ2UpID0+IHR5cGVvZiBtZXNzYWdlID09PSBcInN0cmluZ1wiID8gbWVzc2FnZSA6IG1lc3NhZ2U/Lm1lc3NhZ2U7XG59KShlcnJvclV0aWwgfHwgKGVycm9yVXRpbCA9IHt9KSk7XG4iLCJpbXBvcnQgeyBab2RFcnJvciwgWm9kSXNzdWVDb2RlLCB9IGZyb20gXCIuL1pvZEVycm9yLmpzXCI7XG5pbXBvcnQgeyBkZWZhdWx0RXJyb3JNYXAsIGdldEVycm9yTWFwIH0gZnJvbSBcIi4vZXJyb3JzLmpzXCI7XG5pbXBvcnQgeyBlcnJvclV0aWwgfSBmcm9tIFwiLi9oZWxwZXJzL2Vycm9yVXRpbC5qc1wiO1xuaW1wb3J0IHsgRElSVFksIElOVkFMSUQsIE9LLCBQYXJzZVN0YXR1cywgYWRkSXNzdWVUb0NvbnRleHQsIGlzQWJvcnRlZCwgaXNBc3luYywgaXNEaXJ0eSwgaXNWYWxpZCwgbWFrZUlzc3VlLCB9IGZyb20gXCIuL2hlbHBlcnMvcGFyc2VVdGlsLmpzXCI7XG5pbXBvcnQgeyB1dGlsLCBab2RQYXJzZWRUeXBlLCBnZXRQYXJzZWRUeXBlIH0gZnJvbSBcIi4vaGVscGVycy91dGlsLmpzXCI7XG5jbGFzcyBQYXJzZUlucHV0TGF6eVBhdGgge1xuICAgIGNvbnN0cnVjdG9yKHBhcmVudCwgdmFsdWUsIHBhdGgsIGtleSkge1xuICAgICAgICB0aGlzLl9jYWNoZWRQYXRoID0gW107XG4gICAgICAgIHRoaXMucGFyZW50ID0gcGFyZW50O1xuICAgICAgICB0aGlzLmRhdGEgPSB2YWx1ZTtcbiAgICAgICAgdGhpcy5fcGF0aCA9IHBhdGg7XG4gICAgICAgIHRoaXMuX2tleSA9IGtleTtcbiAgICB9XG4gICAgZ2V0IHBhdGgoKSB7XG4gICAgICAgIGlmICghdGhpcy5fY2FjaGVkUGF0aC5sZW5ndGgpIHtcbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHRoaXMuX2tleSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9jYWNoZWRQYXRoLnB1c2goLi4udGhpcy5fcGF0aCwgLi4udGhpcy5fa2V5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuX2NhY2hlZFBhdGgucHVzaCguLi50aGlzLl9wYXRoLCB0aGlzLl9rZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl9jYWNoZWRQYXRoO1xuICAgIH1cbn1cbmNvbnN0IGhhbmRsZVJlc3VsdCA9IChjdHgsIHJlc3VsdCkgPT4ge1xuICAgIGlmIChpc1ZhbGlkKHJlc3VsdCkpIHtcbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogcmVzdWx0LnZhbHVlIH07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBpZiAoIWN0eC5jb21tb24uaXNzdWVzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVmFsaWRhdGlvbiBmYWlsZWQgYnV0IG5vIGlzc3VlcyBkZXRlY3RlZC5cIik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgZ2V0IGVycm9yKCkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9lcnJvcilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2Vycm9yO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVycm9yID0gbmV3IFpvZEVycm9yKGN0eC5jb21tb24uaXNzdWVzKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9lcnJvciA9IGVycm9yO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9lcnJvcjtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgfVxufTtcbmZ1bmN0aW9uIHByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSB7XG4gICAgaWYgKCFwYXJhbXMpXG4gICAgICAgIHJldHVybiB7fTtcbiAgICBjb25zdCB7IGVycm9yTWFwLCBpbnZhbGlkX3R5cGVfZXJyb3IsIHJlcXVpcmVkX2Vycm9yLCBkZXNjcmlwdGlvbiB9ID0gcGFyYW1zO1xuICAgIGlmIChlcnJvck1hcCAmJiAoaW52YWxpZF90eXBlX2Vycm9yIHx8IHJlcXVpcmVkX2Vycm9yKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbid0IHVzZSBcImludmFsaWRfdHlwZV9lcnJvclwiIG9yIFwicmVxdWlyZWRfZXJyb3JcIiBpbiBjb25qdW5jdGlvbiB3aXRoIGN1c3RvbSBlcnJvciBtYXAuYCk7XG4gICAgfVxuICAgIGlmIChlcnJvck1hcClcbiAgICAgICAgcmV0dXJuIHsgZXJyb3JNYXA6IGVycm9yTWFwLCBkZXNjcmlwdGlvbiB9O1xuICAgIGNvbnN0IGN1c3RvbU1hcCA9IChpc3MsIGN0eCkgPT4ge1xuICAgICAgICBjb25zdCB7IG1lc3NhZ2UgfSA9IHBhcmFtcztcbiAgICAgICAgaWYgKGlzcy5jb2RlID09PSBcImludmFsaWRfZW51bV92YWx1ZVwiKSB7XG4gICAgICAgICAgICByZXR1cm4geyBtZXNzYWdlOiBtZXNzYWdlID8/IGN0eC5kZWZhdWx0RXJyb3IgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIGN0eC5kYXRhID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICByZXR1cm4geyBtZXNzYWdlOiBtZXNzYWdlID8/IHJlcXVpcmVkX2Vycm9yID8/IGN0eC5kZWZhdWx0RXJyb3IgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaXNzLmNvZGUgIT09IFwiaW52YWxpZF90eXBlXCIpXG4gICAgICAgICAgICByZXR1cm4geyBtZXNzYWdlOiBjdHguZGVmYXVsdEVycm9yIH07XG4gICAgICAgIHJldHVybiB7IG1lc3NhZ2U6IG1lc3NhZ2UgPz8gaW52YWxpZF90eXBlX2Vycm9yID8/IGN0eC5kZWZhdWx0RXJyb3IgfTtcbiAgICB9O1xuICAgIHJldHVybiB7IGVycm9yTWFwOiBjdXN0b21NYXAsIGRlc2NyaXB0aW9uIH07XG59XG5leHBvcnQgY2xhc3MgWm9kVHlwZSB7XG4gICAgZ2V0IGRlc2NyaXB0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLmRlc2NyaXB0aW9uO1xuICAgIH1cbiAgICBfZ2V0VHlwZShpbnB1dCkge1xuICAgICAgICByZXR1cm4gZ2V0UGFyc2VkVHlwZShpbnB1dC5kYXRhKTtcbiAgICB9XG4gICAgX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpIHtcbiAgICAgICAgcmV0dXJuIChjdHggfHwge1xuICAgICAgICAgICAgY29tbW9uOiBpbnB1dC5wYXJlbnQuY29tbW9uLFxuICAgICAgICAgICAgZGF0YTogaW5wdXQuZGF0YSxcbiAgICAgICAgICAgIHBhcnNlZFR5cGU6IGdldFBhcnNlZFR5cGUoaW5wdXQuZGF0YSksXG4gICAgICAgICAgICBzY2hlbWFFcnJvck1hcDogdGhpcy5fZGVmLmVycm9yTWFwLFxuICAgICAgICAgICAgcGF0aDogaW5wdXQucGF0aCxcbiAgICAgICAgICAgIHBhcmVudDogaW5wdXQucGFyZW50LFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3RhdHVzOiBuZXcgUGFyc2VTdGF0dXMoKSxcbiAgICAgICAgICAgIGN0eDoge1xuICAgICAgICAgICAgICAgIGNvbW1vbjogaW5wdXQucGFyZW50LmNvbW1vbixcbiAgICAgICAgICAgICAgICBkYXRhOiBpbnB1dC5kYXRhLFxuICAgICAgICAgICAgICAgIHBhcnNlZFR5cGU6IGdldFBhcnNlZFR5cGUoaW5wdXQuZGF0YSksXG4gICAgICAgICAgICAgICAgc2NoZW1hRXJyb3JNYXA6IHRoaXMuX2RlZi5lcnJvck1hcCxcbiAgICAgICAgICAgICAgICBwYXRoOiBpbnB1dC5wYXRoLFxuICAgICAgICAgICAgICAgIHBhcmVudDogaW5wdXQucGFyZW50LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgX3BhcnNlU3luYyhpbnB1dCkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLl9wYXJzZShpbnB1dCk7XG4gICAgICAgIGlmIChpc0FzeW5jKHJlc3VsdCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlN5bmNocm9ub3VzIHBhcnNlIGVuY291bnRlcmVkIHByb21pc2UuXCIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICAgIF9wYXJzZUFzeW5jKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuX3BhcnNlKGlucHV0KTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuICAgIH1cbiAgICBwYXJzZShkYXRhLCBwYXJhbXMpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5zYWZlUGFyc2UoZGF0YSwgcGFyYW1zKTtcbiAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzKVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdC5kYXRhO1xuICAgICAgICB0aHJvdyByZXN1bHQuZXJyb3I7XG4gICAgfVxuICAgIHNhZmVQYXJzZShkYXRhLCBwYXJhbXMpIHtcbiAgICAgICAgY29uc3QgY3R4ID0ge1xuICAgICAgICAgICAgY29tbW9uOiB7XG4gICAgICAgICAgICAgICAgaXNzdWVzOiBbXSxcbiAgICAgICAgICAgICAgICBhc3luYzogcGFyYW1zPy5hc3luYyA/PyBmYWxzZSxcbiAgICAgICAgICAgICAgICBjb250ZXh0dWFsRXJyb3JNYXA6IHBhcmFtcz8uZXJyb3JNYXAsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcGF0aDogcGFyYW1zPy5wYXRoIHx8IFtdLFxuICAgICAgICAgICAgc2NoZW1hRXJyb3JNYXA6IHRoaXMuX2RlZi5lcnJvck1hcCxcbiAgICAgICAgICAgIHBhcmVudDogbnVsbCxcbiAgICAgICAgICAgIGRhdGEsXG4gICAgICAgICAgICBwYXJzZWRUeXBlOiBnZXRQYXJzZWRUeXBlKGRhdGEpLFxuICAgICAgICB9O1xuICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLl9wYXJzZVN5bmMoeyBkYXRhLCBwYXRoOiBjdHgucGF0aCwgcGFyZW50OiBjdHggfSk7XG4gICAgICAgIHJldHVybiBoYW5kbGVSZXN1bHQoY3R4LCByZXN1bHQpO1xuICAgIH1cbiAgICBcIn52YWxpZGF0ZVwiKGRhdGEpIHtcbiAgICAgICAgY29uc3QgY3R4ID0ge1xuICAgICAgICAgICAgY29tbW9uOiB7XG4gICAgICAgICAgICAgICAgaXNzdWVzOiBbXSxcbiAgICAgICAgICAgICAgICBhc3luYzogISF0aGlzW1wifnN0YW5kYXJkXCJdLmFzeW5jLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHBhdGg6IFtdLFxuICAgICAgICAgICAgc2NoZW1hRXJyb3JNYXA6IHRoaXMuX2RlZi5lcnJvck1hcCxcbiAgICAgICAgICAgIHBhcmVudDogbnVsbCxcbiAgICAgICAgICAgIGRhdGEsXG4gICAgICAgICAgICBwYXJzZWRUeXBlOiBnZXRQYXJzZWRUeXBlKGRhdGEpLFxuICAgICAgICB9O1xuICAgICAgICBpZiAoIXRoaXNbXCJ+c3RhbmRhcmRcIl0uYXN5bmMpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5fcGFyc2VTeW5jKHsgZGF0YSwgcGF0aDogW10sIHBhcmVudDogY3R4IH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBpc1ZhbGlkKHJlc3VsdClcbiAgICAgICAgICAgICAgICAgICAgPyB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogcmVzdWx0LnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIDoge1xuICAgICAgICAgICAgICAgICAgICAgICAgaXNzdWVzOiBjdHguY29tbW9uLmlzc3VlcyxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyPy5tZXNzYWdlPy50b0xvd2VyQ2FzZSgpPy5pbmNsdWRlcyhcImVuY291bnRlcmVkXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXNbXCJ+c3RhbmRhcmRcIl0uYXN5bmMgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjdHguY29tbW9uID0ge1xuICAgICAgICAgICAgICAgICAgICBpc3N1ZXM6IFtdLFxuICAgICAgICAgICAgICAgICAgICBhc3luYzogdHJ1ZSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl9wYXJzZUFzeW5jKHsgZGF0YSwgcGF0aDogW10sIHBhcmVudDogY3R4IH0pLnRoZW4oKHJlc3VsdCkgPT4gaXNWYWxpZChyZXN1bHQpXG4gICAgICAgICAgICA/IHtcbiAgICAgICAgICAgICAgICB2YWx1ZTogcmVzdWx0LnZhbHVlLFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgOiB7XG4gICAgICAgICAgICAgICAgaXNzdWVzOiBjdHguY29tbW9uLmlzc3VlcyxcbiAgICAgICAgICAgIH0pO1xuICAgIH1cbiAgICBhc3luYyBwYXJzZUFzeW5jKGRhdGEsIHBhcmFtcykge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnNhZmVQYXJzZUFzeW5jKGRhdGEsIHBhcmFtcyk7XG4gICAgICAgIGlmIChyZXN1bHQuc3VjY2VzcylcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQuZGF0YTtcbiAgICAgICAgdGhyb3cgcmVzdWx0LmVycm9yO1xuICAgIH1cbiAgICBhc3luYyBzYWZlUGFyc2VBc3luYyhkYXRhLCBwYXJhbXMpIHtcbiAgICAgICAgY29uc3QgY3R4ID0ge1xuICAgICAgICAgICAgY29tbW9uOiB7XG4gICAgICAgICAgICAgICAgaXNzdWVzOiBbXSxcbiAgICAgICAgICAgICAgICBjb250ZXh0dWFsRXJyb3JNYXA6IHBhcmFtcz8uZXJyb3JNYXAsXG4gICAgICAgICAgICAgICAgYXN5bmM6IHRydWUsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcGF0aDogcGFyYW1zPy5wYXRoIHx8IFtdLFxuICAgICAgICAgICAgc2NoZW1hRXJyb3JNYXA6IHRoaXMuX2RlZi5lcnJvck1hcCxcbiAgICAgICAgICAgIHBhcmVudDogbnVsbCxcbiAgICAgICAgICAgIGRhdGEsXG4gICAgICAgICAgICBwYXJzZWRUeXBlOiBnZXRQYXJzZWRUeXBlKGRhdGEpLFxuICAgICAgICB9O1xuICAgICAgICBjb25zdCBtYXliZUFzeW5jUmVzdWx0ID0gdGhpcy5fcGFyc2UoeyBkYXRhLCBwYXRoOiBjdHgucGF0aCwgcGFyZW50OiBjdHggfSk7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IChpc0FzeW5jKG1heWJlQXN5bmNSZXN1bHQpID8gbWF5YmVBc3luY1Jlc3VsdCA6IFByb21pc2UucmVzb2x2ZShtYXliZUFzeW5jUmVzdWx0KSk7XG4gICAgICAgIHJldHVybiBoYW5kbGVSZXN1bHQoY3R4LCByZXN1bHQpO1xuICAgIH1cbiAgICByZWZpbmUoY2hlY2ssIG1lc3NhZ2UpIHtcbiAgICAgICAgY29uc3QgZ2V0SXNzdWVQcm9wZXJ0aWVzID0gKHZhbCkgPT4ge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBtZXNzYWdlID09PSBcInN0cmluZ1wiIHx8IHR5cGVvZiBtZXNzYWdlID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgbWVzc2FnZSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodHlwZW9mIG1lc3NhZ2UgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgICAgIHJldHVybiBtZXNzYWdlKHZhbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWVzc2FnZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3JlZmluZW1lbnQoKHZhbCwgY3R4KSA9PiB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBjaGVjayh2YWwpO1xuICAgICAgICAgICAgY29uc3Qgc2V0RXJyb3IgPSAoKSA9PiBjdHguYWRkSXNzdWUoe1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5jdXN0b20sXG4gICAgICAgICAgICAgICAgLi4uZ2V0SXNzdWVQcm9wZXJ0aWVzKHZhbCksXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgUHJvbWlzZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiByZXN1bHQgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdC50aGVuKChkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0RXJyb3IoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgICAgIHNldEVycm9yKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZWZpbmVtZW50KGNoZWNrLCByZWZpbmVtZW50RGF0YSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcmVmaW5lbWVudCgodmFsLCBjdHgpID0+IHtcbiAgICAgICAgICAgIGlmICghY2hlY2sodmFsKSkge1xuICAgICAgICAgICAgICAgIGN0eC5hZGRJc3N1ZSh0eXBlb2YgcmVmaW5lbWVudERhdGEgPT09IFwiZnVuY3Rpb25cIiA/IHJlZmluZW1lbnREYXRhKHZhbCwgY3R4KSA6IHJlZmluZW1lbnREYXRhKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuICAgIF9yZWZpbmVtZW50KHJlZmluZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RFZmZlY3RzKHtcbiAgICAgICAgICAgIHNjaGVtYTogdGhpcyxcbiAgICAgICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kRWZmZWN0cyxcbiAgICAgICAgICAgIGVmZmVjdDogeyB0eXBlOiBcInJlZmluZW1lbnRcIiwgcmVmaW5lbWVudCB9LFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgc3VwZXJSZWZpbmUocmVmaW5lbWVudCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcmVmaW5lbWVudChyZWZpbmVtZW50KTtcbiAgICB9XG4gICAgY29uc3RydWN0b3IoZGVmKSB7XG4gICAgICAgIC8qKiBBbGlhcyBvZiBzYWZlUGFyc2VBc3luYyAqL1xuICAgICAgICB0aGlzLnNwYSA9IHRoaXMuc2FmZVBhcnNlQXN5bmM7XG4gICAgICAgIHRoaXMuX2RlZiA9IGRlZjtcbiAgICAgICAgdGhpcy5wYXJzZSA9IHRoaXMucGFyc2UuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5zYWZlUGFyc2UgPSB0aGlzLnNhZmVQYXJzZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnBhcnNlQXN5bmMgPSB0aGlzLnBhcnNlQXN5bmMuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5zYWZlUGFyc2VBc3luYyA9IHRoaXMuc2FmZVBhcnNlQXN5bmMuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5zcGEgPSB0aGlzLnNwYS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnJlZmluZSA9IHRoaXMucmVmaW5lLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMucmVmaW5lbWVudCA9IHRoaXMucmVmaW5lbWVudC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnN1cGVyUmVmaW5lID0gdGhpcy5zdXBlclJlZmluZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLm9wdGlvbmFsID0gdGhpcy5vcHRpb25hbC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLm51bGxhYmxlID0gdGhpcy5udWxsYWJsZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLm51bGxpc2ggPSB0aGlzLm51bGxpc2guYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5hcnJheSA9IHRoaXMuYXJyYXkuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5wcm9taXNlID0gdGhpcy5wcm9taXNlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMub3IgPSB0aGlzLm9yLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYW5kID0gdGhpcy5hbmQuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy50cmFuc2Zvcm0gPSB0aGlzLnRyYW5zZm9ybS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmJyYW5kID0gdGhpcy5icmFuZC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmRlZmF1bHQgPSB0aGlzLmRlZmF1bHQuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5jYXRjaCA9IHRoaXMuY2F0Y2guYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5kZXNjcmliZSA9IHRoaXMuZGVzY3JpYmUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5waXBlID0gdGhpcy5waXBlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMucmVhZG9ubHkgPSB0aGlzLnJlYWRvbmx5LmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuaXNOdWxsYWJsZSA9IHRoaXMuaXNOdWxsYWJsZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmlzT3B0aW9uYWwgPSB0aGlzLmlzT3B0aW9uYWwuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpc1tcIn5zdGFuZGFyZFwiXSA9IHtcbiAgICAgICAgICAgIHZlcnNpb246IDEsXG4gICAgICAgICAgICB2ZW5kb3I6IFwiem9kXCIsXG4gICAgICAgICAgICB2YWxpZGF0ZTogKGRhdGEpID0+IHRoaXNbXCJ+dmFsaWRhdGVcIl0oZGF0YSksXG4gICAgICAgIH07XG4gICAgfVxuICAgIG9wdGlvbmFsKCkge1xuICAgICAgICByZXR1cm4gWm9kT3B0aW9uYWwuY3JlYXRlKHRoaXMsIHRoaXMuX2RlZik7XG4gICAgfVxuICAgIG51bGxhYmxlKCkge1xuICAgICAgICByZXR1cm4gWm9kTnVsbGFibGUuY3JlYXRlKHRoaXMsIHRoaXMuX2RlZik7XG4gICAgfVxuICAgIG51bGxpc2goKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm51bGxhYmxlKCkub3B0aW9uYWwoKTtcbiAgICB9XG4gICAgYXJyYXkoKSB7XG4gICAgICAgIHJldHVybiBab2RBcnJheS5jcmVhdGUodGhpcyk7XG4gICAgfVxuICAgIHByb21pc2UoKSB7XG4gICAgICAgIHJldHVybiBab2RQcm9taXNlLmNyZWF0ZSh0aGlzLCB0aGlzLl9kZWYpO1xuICAgIH1cbiAgICBvcihvcHRpb24pIHtcbiAgICAgICAgcmV0dXJuIFpvZFVuaW9uLmNyZWF0ZShbdGhpcywgb3B0aW9uXSwgdGhpcy5fZGVmKTtcbiAgICB9XG4gICAgYW5kKGluY29taW5nKSB7XG4gICAgICAgIHJldHVybiBab2RJbnRlcnNlY3Rpb24uY3JlYXRlKHRoaXMsIGluY29taW5nLCB0aGlzLl9kZWYpO1xuICAgIH1cbiAgICB0cmFuc2Zvcm0odHJhbnNmb3JtKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kRWZmZWN0cyh7XG4gICAgICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHRoaXMuX2RlZiksXG4gICAgICAgICAgICBzY2hlbWE6IHRoaXMsXG4gICAgICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZEVmZmVjdHMsXG4gICAgICAgICAgICBlZmZlY3Q6IHsgdHlwZTogXCJ0cmFuc2Zvcm1cIiwgdHJhbnNmb3JtIH0sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBkZWZhdWx0KGRlZikge1xuICAgICAgICBjb25zdCBkZWZhdWx0VmFsdWVGdW5jID0gdHlwZW9mIGRlZiA9PT0gXCJmdW5jdGlvblwiID8gZGVmIDogKCkgPT4gZGVmO1xuICAgICAgICByZXR1cm4gbmV3IFpvZERlZmF1bHQoe1xuICAgICAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyh0aGlzLl9kZWYpLFxuICAgICAgICAgICAgaW5uZXJUeXBlOiB0aGlzLFxuICAgICAgICAgICAgZGVmYXVsdFZhbHVlOiBkZWZhdWx0VmFsdWVGdW5jLFxuICAgICAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2REZWZhdWx0LFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgYnJhbmQoKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kQnJhbmRlZCh7XG4gICAgICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZEJyYW5kZWQsXG4gICAgICAgICAgICB0eXBlOiB0aGlzLFxuICAgICAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyh0aGlzLl9kZWYpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgY2F0Y2goZGVmKSB7XG4gICAgICAgIGNvbnN0IGNhdGNoVmFsdWVGdW5jID0gdHlwZW9mIGRlZiA9PT0gXCJmdW5jdGlvblwiID8gZGVmIDogKCkgPT4gZGVmO1xuICAgICAgICByZXR1cm4gbmV3IFpvZENhdGNoKHtcbiAgICAgICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXModGhpcy5fZGVmKSxcbiAgICAgICAgICAgIGlubmVyVHlwZTogdGhpcyxcbiAgICAgICAgICAgIGNhdGNoVmFsdWU6IGNhdGNoVmFsdWVGdW5jLFxuICAgICAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RDYXRjaCxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGRlc2NyaWJlKGRlc2NyaXB0aW9uKSB7XG4gICAgICAgIGNvbnN0IFRoaXMgPSB0aGlzLmNvbnN0cnVjdG9yO1xuICAgICAgICByZXR1cm4gbmV3IFRoaXMoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgZGVzY3JpcHRpb24sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBwaXBlKHRhcmdldCkge1xuICAgICAgICByZXR1cm4gWm9kUGlwZWxpbmUuY3JlYXRlKHRoaXMsIHRhcmdldCk7XG4gICAgfVxuICAgIHJlYWRvbmx5KCkge1xuICAgICAgICByZXR1cm4gWm9kUmVhZG9ubHkuY3JlYXRlKHRoaXMpO1xuICAgIH1cbiAgICBpc09wdGlvbmFsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zYWZlUGFyc2UodW5kZWZpbmVkKS5zdWNjZXNzO1xuICAgIH1cbiAgICBpc051bGxhYmxlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zYWZlUGFyc2UobnVsbCkuc3VjY2VzcztcbiAgICB9XG59XG5jb25zdCBjdWlkUmVnZXggPSAvXmNbXlxccy1dezgsfSQvaTtcbmNvbnN0IGN1aWQyUmVnZXggPSAvXlswLTlhLXpdKyQvO1xuY29uc3QgdWxpZFJlZ2V4ID0gL15bMC05QS1ISktNTlAtVFYtWl17MjZ9JC9pO1xuLy8gY29uc3QgdXVpZFJlZ2V4ID1cbi8vICAgL14oW2EtZjAtOV17OH0tW2EtZjAtOV17NH0tWzEtNV1bYS1mMC05XXszfS1bYS1mMC05XXs0fS1bYS1mMC05XXsxMn18MDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAwKSQvaTtcbmNvbnN0IHV1aWRSZWdleCA9IC9eWzAtOWEtZkEtRl17OH1cXGItWzAtOWEtZkEtRl17NH1cXGItWzAtOWEtZkEtRl17NH1cXGItWzAtOWEtZkEtRl17NH1cXGItWzAtOWEtZkEtRl17MTJ9JC9pO1xuY29uc3QgbmFub2lkUmVnZXggPSAvXlthLXowLTlfLV17MjF9JC9pO1xuY29uc3Qgand0UmVnZXggPSAvXltBLVphLXowLTktX10rXFwuW0EtWmEtejAtOS1fXStcXC5bQS1aYS16MC05LV9dKiQvO1xuY29uc3QgZHVyYXRpb25SZWdleCA9IC9eWy0rXT9QKD8hJCkoPzooPzpbLStdP1xcZCtZKXwoPzpbLStdP1xcZCtbLixdXFxkK1kkKSk/KD86KD86Wy0rXT9cXGQrTSl8KD86Wy0rXT9cXGQrWy4sXVxcZCtNJCkpPyg/Oig/OlstK10/XFxkK1cpfCg/OlstK10/XFxkK1suLF1cXGQrVyQpKT8oPzooPzpbLStdP1xcZCtEKXwoPzpbLStdP1xcZCtbLixdXFxkK0QkKSk/KD86VCg/PVtcXGQrLV0pKD86KD86Wy0rXT9cXGQrSCl8KD86Wy0rXT9cXGQrWy4sXVxcZCtIJCkpPyg/Oig/OlstK10/XFxkK00pfCg/OlstK10/XFxkK1suLF1cXGQrTSQpKT8oPzpbLStdP1xcZCsoPzpbLixdXFxkKyk/Uyk/KT8/JC87XG4vLyBmcm9tIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS80NjE4MS8xNTUwMTU1XG4vLyBvbGQgdmVyc2lvbjogdG9vIHNsb3csIGRpZG4ndCBzdXBwb3J0IHVuaWNvZGVcbi8vIGNvbnN0IGVtYWlsUmVnZXggPSAvXigoKFthLXpdfFxcZHxbISNcXCQlJidcXCpcXCtcXC1cXC89XFw/XFxeX2B7XFx8fX5dfFtcXHUwMEEwLVxcdUQ3RkZcXHVGOTAwLVxcdUZEQ0ZcXHVGREYwLVxcdUZGRUZdKSsoXFwuKFthLXpdfFxcZHxbISNcXCQlJidcXCpcXCtcXC1cXC89XFw/XFxeX2B7XFx8fX5dfFtcXHUwMEEwLVxcdUQ3RkZcXHVGOTAwLVxcdUZEQ0ZcXHVGREYwLVxcdUZGRUZdKSspKil8KChcXHgyMikoKCgoXFx4MjB8XFx4MDkpKihcXHgwZFxceDBhKSk/KFxceDIwfFxceDA5KSspPygoW1xceDAxLVxceDA4XFx4MGJcXHgwY1xceDBlLVxceDFmXFx4N2ZdfFxceDIxfFtcXHgyMy1cXHg1Yl18W1xceDVkLVxceDdlXXxbXFx1MDBBMC1cXHVEN0ZGXFx1RjkwMC1cXHVGRENGXFx1RkRGMC1cXHVGRkVGXSl8KFxcXFwoW1xceDAxLVxceDA5XFx4MGJcXHgwY1xceDBkLVxceDdmXXxbXFx1MDBBMC1cXHVEN0ZGXFx1RjkwMC1cXHVGRENGXFx1RkRGMC1cXHVGRkVGXSkpKSkqKCgoXFx4MjB8XFx4MDkpKihcXHgwZFxceDBhKSk/KFxceDIwfFxceDA5KSspPyhcXHgyMikpKUAoKChbYS16XXxcXGR8W1xcdTAwQTAtXFx1RDdGRlxcdUY5MDAtXFx1RkRDRlxcdUZERjAtXFx1RkZFRl0pfCgoW2Etel18XFxkfFtcXHUwMEEwLVxcdUQ3RkZcXHVGOTAwLVxcdUZEQ0ZcXHVGREYwLVxcdUZGRUZdKShbYS16XXxcXGR8LXxcXC58X3x+fFtcXHUwMEEwLVxcdUQ3RkZcXHVGOTAwLVxcdUZEQ0ZcXHVGREYwLVxcdUZGRUZdKSooW2Etel18XFxkfFtcXHUwMEEwLVxcdUQ3RkZcXHVGOTAwLVxcdUZEQ0ZcXHVGREYwLVxcdUZGRUZdKSkpXFwuKSsoKFthLXpdfFtcXHUwMEEwLVxcdUQ3RkZcXHVGOTAwLVxcdUZEQ0ZcXHVGREYwLVxcdUZGRUZdKXwoKFthLXpdfFtcXHUwMEEwLVxcdUQ3RkZcXHVGOTAwLVxcdUZEQ0ZcXHVGREYwLVxcdUZGRUZdKShbYS16XXxcXGR8LXxcXC58X3x+fFtcXHUwMEEwLVxcdUQ3RkZcXHVGOTAwLVxcdUZEQ0ZcXHVGREYwLVxcdUZGRUZdKSooW2Etel18W1xcdTAwQTAtXFx1RDdGRlxcdUY5MDAtXFx1RkRDRlxcdUZERjAtXFx1RkZFRl0pKSkkL2k7XG4vL29sZCBlbWFpbCByZWdleFxuLy8gY29uc3QgZW1haWxSZWdleCA9IC9eKChbXjw+KClbXFxdLiw7Olxcc0BcIl0rKFxcLltePD4oKVtcXF0uLDs6XFxzQFwiXSspKil8KFwiLitcIikpQCgoPyEtKShbXjw+KClbXFxdLiw7Olxcc0BcIl0rXFwuKStbXjw+KClbXFxdLiw7Olxcc0BcIl17MSx9KVteLTw+KClbXFxdLiw7Olxcc0BcIl0kL2k7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmVcbi8vIGNvbnN0IGVtYWlsUmVnZXggPVxuLy8gICAvXigoW148PigpW1xcXVxcXFwuLDs6XFxzQFxcXCJdKyhcXC5bXjw+KClbXFxdXFxcXC4sOzpcXHNAXFxcIl0rKSopfChcXFwiLitcXFwiKSlAKChcXFsoKCgyNVswLTVdKXwoMlswLTRdWzAtOV0pfCgxWzAtOV17Mn0pfChbMC05XXsxLDJ9KSlcXC4pezN9KCgyNVswLTVdKXwoMlswLTRdWzAtOV0pfCgxWzAtOV17Mn0pfChbMC05XXsxLDJ9KSlcXF0pfChcXFtJUHY2OigoW2EtZjAtOV17MSw0fTopezd9fDo6KFthLWYwLTldezEsNH06KXswLDZ9fChbYS1mMC05XXsxLDR9Oil7MX06KFthLWYwLTldezEsNH06KXswLDV9fChbYS1mMC05XXsxLDR9Oil7Mn06KFthLWYwLTldezEsNH06KXswLDR9fChbYS1mMC05XXsxLDR9Oil7M306KFthLWYwLTldezEsNH06KXswLDN9fChbYS1mMC05XXsxLDR9Oil7NH06KFthLWYwLTldezEsNH06KXswLDJ9fChbYS1mMC05XXsxLDR9Oil7NX06KFthLWYwLTldezEsNH06KXswLDF9KShbYS1mMC05XXsxLDR9fCgoKDI1WzAtNV0pfCgyWzAtNF1bMC05XSl8KDFbMC05XXsyfSl8KFswLTldezEsMn0pKVxcLil7M30oKDI1WzAtNV0pfCgyWzAtNF1bMC05XSl8KDFbMC05XXsyfSl8KFswLTldezEsMn0pKSlcXF0pfChbQS1aYS16MC05XShbQS1aYS16MC05LV0qW0EtWmEtejAtOV0pKihcXC5bQS1aYS16XXsyLH0pKykpJC87XG4vLyBjb25zdCBlbWFpbFJlZ2V4ID1cbi8vICAgL15bYS16QS1aMC05XFwuXFwhXFwjXFwkXFwlXFwmXFwnXFwqXFwrXFwvXFw9XFw/XFxeXFxfXFxgXFx7XFx8XFx9XFx+XFwtXStAW2EtekEtWjAtOV0oPzpbYS16QS1aMC05LV17MCw2MX1bYS16QS1aMC05XSk/KD86XFwuW2EtekEtWjAtOV0oPzpbYS16QS1aMC05LV17MCw2MX1bYS16QS1aMC05XSk/KSokLztcbi8vIGNvbnN0IGVtYWlsUmVnZXggPVxuLy8gICAvXig/OlthLXowLTkhIyQlJicqKy89P15fYHt8fX4tXSsoPzpcXC5bYS16MC05ISMkJSYnKisvPT9eX2B7fH1+LV0rKSp8XCIoPzpbXFx4MDEtXFx4MDhcXHgwYlxceDBjXFx4MGUtXFx4MWZcXHgyMVxceDIzLVxceDViXFx4NWQtXFx4N2ZdfFxcXFxbXFx4MDEtXFx4MDlcXHgwYlxceDBjXFx4MGUtXFx4N2ZdKSpcIilAKD86KD86W2EtejAtOV0oPzpbYS16MC05LV0qW2EtejAtOV0pP1xcLikrW2EtejAtOV0oPzpbYS16MC05LV0qW2EtejAtOV0pP3xcXFsoPzooPzoyNVswLTVdfDJbMC00XVswLTldfFswMV0/WzAtOV1bMC05XT8pXFwuKXszfSg/OjI1WzAtNV18MlswLTRdWzAtOV18WzAxXT9bMC05XVswLTldP3xbYS16MC05LV0qW2EtejAtOV06KD86W1xceDAxLVxceDA4XFx4MGJcXHgwY1xceDBlLVxceDFmXFx4MjEtXFx4NWFcXHg1My1cXHg3Zl18XFxcXFtcXHgwMS1cXHgwOVxceDBiXFx4MGNcXHgwZS1cXHg3Zl0pKylcXF0pJC9pO1xuY29uc3QgZW1haWxSZWdleCA9IC9eKD8hXFwuKSg/IS4qXFwuXFwuKShbQS1aMC05XycrXFwtXFwuXSopW0EtWjAtOV8rLV1AKFtBLVowLTldW0EtWjAtOVxcLV0qXFwuKStbQS1aXXsyLH0kL2k7XG4vLyBjb25zdCBlbWFpbFJlZ2V4ID1cbi8vICAgL15bYS16MC05LiEjJCUm4oCZKisvPT9eX2B7fH1+LV0rQFthLXowLTktXSsoPzpcXC5bYS16MC05XFwtXSspKiQvaTtcbi8vIGZyb20gaHR0cHM6Ly90aGVrZXZpbnNjb3R0LmNvbS9lbW9qaXMtaW4tamF2YXNjcmlwdC8jd3JpdGluZy1hLXJlZ3VsYXItZXhwcmVzc2lvblxuY29uc3QgX2Vtb2ppUmVnZXggPSBgXihcXFxccHtFeHRlbmRlZF9QaWN0b2dyYXBoaWN9fFxcXFxwe0Vtb2ppX0NvbXBvbmVudH0pKyRgO1xubGV0IGVtb2ppUmVnZXg7XG4vLyBmYXN0ZXIsIHNpbXBsZXIsIHNhZmVyXG5jb25zdCBpcHY0UmVnZXggPSAvXig/Oig/OjI1WzAtNV18MlswLTRdWzAtOV18MVswLTldWzAtOV18WzEtOV1bMC05XXxbMC05XSlcXC4pezN9KD86MjVbMC01XXwyWzAtNF1bMC05XXwxWzAtOV1bMC05XXxbMS05XVswLTldfFswLTldKSQvO1xuY29uc3QgaXB2NENpZHJSZWdleCA9IC9eKD86KD86MjVbMC01XXwyWzAtNF1bMC05XXwxWzAtOV1bMC05XXxbMS05XVswLTldfFswLTldKVxcLil7M30oPzoyNVswLTVdfDJbMC00XVswLTldfDFbMC05XVswLTldfFsxLTldWzAtOV18WzAtOV0pXFwvKDNbMC0yXXxbMTJdP1swLTldKSQvO1xuLy8gY29uc3QgaXB2NlJlZ2V4ID1cbi8vIC9eKChbYS1mMC05XXsxLDR9Oil7N318OjooW2EtZjAtOV17MSw0fTopezAsNn18KFthLWYwLTldezEsNH06KXsxfTooW2EtZjAtOV17MSw0fTopezAsNX18KFthLWYwLTldezEsNH06KXsyfTooW2EtZjAtOV17MSw0fTopezAsNH18KFthLWYwLTldezEsNH06KXszfTooW2EtZjAtOV17MSw0fTopezAsM318KFthLWYwLTldezEsNH06KXs0fTooW2EtZjAtOV17MSw0fTopezAsMn18KFthLWYwLTldezEsNH06KXs1fTooW2EtZjAtOV17MSw0fTopezAsMX0pKFthLWYwLTldezEsNH18KCgoMjVbMC01XSl8KDJbMC00XVswLTldKXwoMVswLTldezJ9KXwoWzAtOV17MSwyfSkpXFwuKXszfSgoMjVbMC01XSl8KDJbMC00XVswLTldKXwoMVswLTldezJ9KXwoWzAtOV17MSwyfSkpKSQvO1xuY29uc3QgaXB2NlJlZ2V4ID0gL14oKFswLTlhLWZBLUZdezEsNH06KXs3LDd9WzAtOWEtZkEtRl17MSw0fXwoWzAtOWEtZkEtRl17MSw0fTopezEsN306fChbMC05YS1mQS1GXXsxLDR9Oil7MSw2fTpbMC05YS1mQS1GXXsxLDR9fChbMC05YS1mQS1GXXsxLDR9Oil7MSw1fSg6WzAtOWEtZkEtRl17MSw0fSl7MSwyfXwoWzAtOWEtZkEtRl17MSw0fTopezEsNH0oOlswLTlhLWZBLUZdezEsNH0pezEsM318KFswLTlhLWZBLUZdezEsNH06KXsxLDN9KDpbMC05YS1mQS1GXXsxLDR9KXsxLDR9fChbMC05YS1mQS1GXXsxLDR9Oil7MSwyfSg6WzAtOWEtZkEtRl17MSw0fSl7MSw1fXxbMC05YS1mQS1GXXsxLDR9OigoOlswLTlhLWZBLUZdezEsNH0pezEsNn0pfDooKDpbMC05YS1mQS1GXXsxLDR9KXsxLDd9fDopfGZlODA6KDpbMC05YS1mQS1GXXswLDR9KXswLDR9JVswLTlhLXpBLVpdezEsfXw6OihmZmZmKDowezEsNH0pezAsMX06KXswLDF9KCgyNVswLTVdfCgyWzAtNF18MXswLDF9WzAtOV0pezAsMX1bMC05XSlcXC4pezMsM30oMjVbMC01XXwoMlswLTRdfDF7MCwxfVswLTldKXswLDF9WzAtOV0pfChbMC05YS1mQS1GXXsxLDR9Oil7MSw0fTooKDI1WzAtNV18KDJbMC00XXwxezAsMX1bMC05XSl7MCwxfVswLTldKVxcLil7MywzfSgyNVswLTVdfCgyWzAtNF18MXswLDF9WzAtOV0pezAsMX1bMC05XSkpJC87XG5jb25zdCBpcHY2Q2lkclJlZ2V4ID0gL14oKFswLTlhLWZBLUZdezEsNH06KXs3LDd9WzAtOWEtZkEtRl17MSw0fXwoWzAtOWEtZkEtRl17MSw0fTopezEsN306fChbMC05YS1mQS1GXXsxLDR9Oil7MSw2fTpbMC05YS1mQS1GXXsxLDR9fChbMC05YS1mQS1GXXsxLDR9Oil7MSw1fSg6WzAtOWEtZkEtRl17MSw0fSl7MSwyfXwoWzAtOWEtZkEtRl17MSw0fTopezEsNH0oOlswLTlhLWZBLUZdezEsNH0pezEsM318KFswLTlhLWZBLUZdezEsNH06KXsxLDN9KDpbMC05YS1mQS1GXXsxLDR9KXsxLDR9fChbMC05YS1mQS1GXXsxLDR9Oil7MSwyfSg6WzAtOWEtZkEtRl17MSw0fSl7MSw1fXxbMC05YS1mQS1GXXsxLDR9OigoOlswLTlhLWZBLUZdezEsNH0pezEsNn0pfDooKDpbMC05YS1mQS1GXXsxLDR9KXsxLDd9fDopfGZlODA6KDpbMC05YS1mQS1GXXswLDR9KXswLDR9JVswLTlhLXpBLVpdezEsfXw6OihmZmZmKDowezEsNH0pezAsMX06KXswLDF9KCgyNVswLTVdfCgyWzAtNF18MXswLDF9WzAtOV0pezAsMX1bMC05XSlcXC4pezMsM30oMjVbMC01XXwoMlswLTRdfDF7MCwxfVswLTldKXswLDF9WzAtOV0pfChbMC05YS1mQS1GXXsxLDR9Oil7MSw0fTooKDI1WzAtNV18KDJbMC00XXwxezAsMX1bMC05XSl7MCwxfVswLTldKVxcLil7MywzfSgyNVswLTVdfCgyWzAtNF18MXswLDF9WzAtOV0pezAsMX1bMC05XSkpXFwvKDEyWzAtOF18MVswMV1bMC05XXxbMS05XT9bMC05XSkkLztcbi8vIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzc4NjAzOTIvZGV0ZXJtaW5lLWlmLXN0cmluZy1pcy1pbi1iYXNlNjQtdXNpbmctamF2YXNjcmlwdFxuY29uc3QgYmFzZTY0UmVnZXggPSAvXihbMC05YS16QS1aKy9dezR9KSooKFswLTlhLXpBLVorL117Mn09PSl8KFswLTlhLXpBLVorL117M309KSk/JC87XG4vLyBodHRwczovL2Jhc2U2NC5ndXJ1L3N0YW5kYXJkcy9iYXNlNjR1cmxcbmNvbnN0IGJhc2U2NHVybFJlZ2V4ID0gL14oWzAtOWEtekEtWi1fXXs0fSkqKChbMC05YS16QS1aLV9dezJ9KD09KT8pfChbMC05YS16QS1aLV9dezN9KD0pPykpPyQvO1xuLy8gc2ltcGxlXG4vLyBjb25zdCBkYXRlUmVnZXhTb3VyY2UgPSBgXFxcXGR7NH0tXFxcXGR7Mn0tXFxcXGR7Mn1gO1xuLy8gbm8gbGVhcCB5ZWFyIHZhbGlkYXRpb25cbi8vIGNvbnN0IGRhdGVSZWdleFNvdXJjZSA9IGBcXFxcZHs0fS0oKDBbMTM1NzhdfDEwfDEyKS0zMXwoMFsxMy05XXwxWzAtMl0pLTMwfCgwWzEtOV18MVswLTJdKS0oMFsxLTldfDFcXFxcZHwyXFxcXGQpKWA7XG4vLyB3aXRoIGxlYXAgeWVhciB2YWxpZGF0aW9uXG5jb25zdCBkYXRlUmVnZXhTb3VyY2UgPSBgKChcXFxcZFxcXFxkWzI0NjhdWzA0OF18XFxcXGRcXFxcZFsxMzU3OV1bMjZdfFxcXFxkXFxcXGQwWzQ4XXxbMDI0NjhdWzA0OF0wMHxbMTM1NzldWzI2XTAwKS0wMi0yOXxcXFxcZHs0fS0oKDBbMTM1NzhdfDFbMDJdKS0oMFsxLTldfFsxMl1cXFxcZHwzWzAxXSl8KDBbNDY5XXwxMSktKDBbMS05XXxbMTJdXFxcXGR8MzApfCgwMiktKDBbMS05XXwxXFxcXGR8MlswLThdKSkpYDtcbmNvbnN0IGRhdGVSZWdleCA9IG5ldyBSZWdFeHAoYF4ke2RhdGVSZWdleFNvdXJjZX0kYCk7XG5mdW5jdGlvbiB0aW1lUmVnZXhTb3VyY2UoYXJncykge1xuICAgIGxldCBzZWNvbmRzUmVnZXhTb3VyY2UgPSBgWzAtNV1cXFxcZGA7XG4gICAgaWYgKGFyZ3MucHJlY2lzaW9uKSB7XG4gICAgICAgIHNlY29uZHNSZWdleFNvdXJjZSA9IGAke3NlY29uZHNSZWdleFNvdXJjZX1cXFxcLlxcXFxkeyR7YXJncy5wcmVjaXNpb259fWA7XG4gICAgfVxuICAgIGVsc2UgaWYgKGFyZ3MucHJlY2lzaW9uID09IG51bGwpIHtcbiAgICAgICAgc2Vjb25kc1JlZ2V4U291cmNlID0gYCR7c2Vjb25kc1JlZ2V4U291cmNlfShcXFxcLlxcXFxkKyk/YDtcbiAgICB9XG4gICAgY29uc3Qgc2Vjb25kc1F1YW50aWZpZXIgPSBhcmdzLnByZWNpc2lvbiA/IFwiK1wiIDogXCI/XCI7IC8vIHJlcXVpcmUgc2Vjb25kcyBpZiBwcmVjaXNpb24gaXMgbm9uemVyb1xuICAgIHJldHVybiBgKFswMV1cXFxcZHwyWzAtM10pOlswLTVdXFxcXGQoOiR7c2Vjb25kc1JlZ2V4U291cmNlfSkke3NlY29uZHNRdWFudGlmaWVyfWA7XG59XG5mdW5jdGlvbiB0aW1lUmVnZXgoYXJncykge1xuICAgIHJldHVybiBuZXcgUmVnRXhwKGBeJHt0aW1lUmVnZXhTb3VyY2UoYXJncyl9JGApO1xufVxuLy8gQWRhcHRlZCBmcm9tIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8zMTQzMjMxXG5leHBvcnQgZnVuY3Rpb24gZGF0ZXRpbWVSZWdleChhcmdzKSB7XG4gICAgbGV0IHJlZ2V4ID0gYCR7ZGF0ZVJlZ2V4U291cmNlfVQke3RpbWVSZWdleFNvdXJjZShhcmdzKX1gO1xuICAgIGNvbnN0IG9wdHMgPSBbXTtcbiAgICBvcHRzLnB1c2goYXJncy5sb2NhbCA/IGBaP2AgOiBgWmApO1xuICAgIGlmIChhcmdzLm9mZnNldClcbiAgICAgICAgb3B0cy5wdXNoKGAoWystXVxcXFxkezJ9Oj9cXFxcZHsyfSlgKTtcbiAgICByZWdleCA9IGAke3JlZ2V4fSgke29wdHMuam9pbihcInxcIil9KWA7XG4gICAgcmV0dXJuIG5ldyBSZWdFeHAoYF4ke3JlZ2V4fSRgKTtcbn1cbmZ1bmN0aW9uIGlzVmFsaWRJUChpcCwgdmVyc2lvbikge1xuICAgIGlmICgodmVyc2lvbiA9PT0gXCJ2NFwiIHx8ICF2ZXJzaW9uKSAmJiBpcHY0UmVnZXgudGVzdChpcCkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGlmICgodmVyc2lvbiA9PT0gXCJ2NlwiIHx8ICF2ZXJzaW9uKSAmJiBpcHY2UmVnZXgudGVzdChpcCkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cbmZ1bmN0aW9uIGlzVmFsaWRKV1Qoand0LCBhbGcpIHtcbiAgICBpZiAoIWp3dFJlZ2V4LnRlc3Qoand0KSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IFtoZWFkZXJdID0gand0LnNwbGl0KFwiLlwiKTtcbiAgICAgICAgaWYgKCFoZWFkZXIpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIC8vIENvbnZlcnQgYmFzZTY0dXJsIHRvIGJhc2U2NFxuICAgICAgICBjb25zdCBiYXNlNjQgPSBoZWFkZXJcbiAgICAgICAgICAgIC5yZXBsYWNlKC8tL2csIFwiK1wiKVxuICAgICAgICAgICAgLnJlcGxhY2UoL18vZywgXCIvXCIpXG4gICAgICAgICAgICAucGFkRW5kKGhlYWRlci5sZW5ndGggKyAoKDQgLSAoaGVhZGVyLmxlbmd0aCAlIDQpKSAlIDQpLCBcIj1cIik7XG4gICAgICAgIGNvbnN0IGRlY29kZWQgPSBKU09OLnBhcnNlKGF0b2IoYmFzZTY0KSk7XG4gICAgICAgIGlmICh0eXBlb2YgZGVjb2RlZCAhPT0gXCJvYmplY3RcIiB8fCBkZWNvZGVkID09PSBudWxsKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAoXCJ0eXBcIiBpbiBkZWNvZGVkICYmIGRlY29kZWQ/LnR5cCAhPT0gXCJKV1RcIilcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKCFkZWNvZGVkLmFsZylcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKGFsZyAmJiBkZWNvZGVkLmFsZyAhPT0gYWxnKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY2F0Y2gge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuZnVuY3Rpb24gaXNWYWxpZENpZHIoaXAsIHZlcnNpb24pIHtcbiAgICBpZiAoKHZlcnNpb24gPT09IFwidjRcIiB8fCAhdmVyc2lvbikgJiYgaXB2NENpZHJSZWdleC50ZXN0KGlwKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKCh2ZXJzaW9uID09PSBcInY2XCIgfHwgIXZlcnNpb24pICYmIGlwdjZDaWRyUmVnZXgudGVzdChpcCkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cbmV4cG9ydCBjbGFzcyBab2RTdHJpbmcgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgaWYgKHRoaXMuX2RlZi5jb2VyY2UpIHtcbiAgICAgICAgICAgIGlucHV0LmRhdGEgPSBTdHJpbmcoaW5wdXQuZGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFyc2VkVHlwZSA9IHRoaXMuX2dldFR5cGUoaW5wdXQpO1xuICAgICAgICBpZiAocGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5zdHJpbmcpIHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUuc3RyaW5nLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc3RhdHVzID0gbmV3IFBhcnNlU3RhdHVzKCk7XG4gICAgICAgIGxldCBjdHggPSB1bmRlZmluZWQ7XG4gICAgICAgIGZvciAoY29uc3QgY2hlY2sgb2YgdGhpcy5fZGVmLmNoZWNrcykge1xuICAgICAgICAgICAgaWYgKGNoZWNrLmtpbmQgPT09IFwibWluXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoaW5wdXQuZGF0YS5sZW5ndGggPCBjaGVjay52YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX3NtYWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWluaW11bTogY2hlY2sudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXhhY3Q6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwibWF4XCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoaW5wdXQuZGF0YS5sZW5ndGggPiBjaGVjay52YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX2JpZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1heGltdW06IGNoZWNrLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4YWN0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImxlbmd0aFwiKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdG9vQmlnID0gaW5wdXQuZGF0YS5sZW5ndGggPiBjaGVjay52YWx1ZTtcbiAgICAgICAgICAgICAgICBjb25zdCB0b29TbWFsbCA9IGlucHV0LmRhdGEubGVuZ3RoIDwgY2hlY2sudmFsdWU7XG4gICAgICAgICAgICAgICAgaWYgKHRvb0JpZyB8fCB0b29TbWFsbCkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRvb0JpZykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19iaWcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF4aW11bTogY2hlY2sudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhhY3Q6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHRvb1NtYWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX3NtYWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1pbmltdW06IGNoZWNrLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4YWN0OiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImVtYWlsXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWVtYWlsUmVnZXgudGVzdChpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcImVtYWlsXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJlbW9qaVwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFlbW9qaVJlZ2V4KSB7XG4gICAgICAgICAgICAgICAgICAgIGVtb2ppUmVnZXggPSBuZXcgUmVnRXhwKF9lbW9qaVJlZ2V4LCBcInVcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghZW1vamlSZWdleC50ZXN0KGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwiZW1vamlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcInV1aWRcIikge1xuICAgICAgICAgICAgICAgIGlmICghdXVpZFJlZ2V4LnRlc3QoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJ1dWlkXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJuYW5vaWRcIikge1xuICAgICAgICAgICAgICAgIGlmICghbmFub2lkUmVnZXgudGVzdChpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcIm5hbm9pZFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwiY3VpZFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjdWlkUmVnZXgudGVzdChpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcImN1aWRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImN1aWQyXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWN1aWQyUmVnZXgudGVzdChpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcImN1aWQyXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJ1bGlkXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXVsaWRSZWdleC50ZXN0KGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwidWxpZFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwidXJsXCIpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBuZXcgVVJMKGlucHV0LmRhdGEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwidXJsXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJyZWdleFwiKSB7XG4gICAgICAgICAgICAgICAgY2hlY2sucmVnZXgubGFzdEluZGV4ID0gMDtcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXN0UmVzdWx0ID0gY2hlY2sucmVnZXgudGVzdChpbnB1dC5kYXRhKTtcbiAgICAgICAgICAgICAgICBpZiAoIXRlc3RSZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJyZWdleFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwidHJpbVwiKSB7XG4gICAgICAgICAgICAgICAgaW5wdXQuZGF0YSA9IGlucHV0LmRhdGEudHJpbSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJpbmNsdWRlc1wiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFpbnB1dC5kYXRhLmluY2x1ZGVzKGNoZWNrLnZhbHVlLCBjaGVjay5wb3NpdGlvbikpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogeyBpbmNsdWRlczogY2hlY2sudmFsdWUsIHBvc2l0aW9uOiBjaGVjay5wb3NpdGlvbiB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwidG9Mb3dlckNhc2VcIikge1xuICAgICAgICAgICAgICAgIGlucHV0LmRhdGEgPSBpbnB1dC5kYXRhLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcInRvVXBwZXJDYXNlXCIpIHtcbiAgICAgICAgICAgICAgICBpbnB1dC5kYXRhID0gaW5wdXQuZGF0YS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJzdGFydHNXaXRoXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWlucHV0LmRhdGEuc3RhcnRzV2l0aChjaGVjay52YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogeyBzdGFydHNXaXRoOiBjaGVjay52YWx1ZSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwiZW5kc1dpdGhcIikge1xuICAgICAgICAgICAgICAgIGlmICghaW5wdXQuZGF0YS5lbmRzV2l0aChjaGVjay52YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogeyBlbmRzV2l0aDogY2hlY2sudmFsdWUgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImRhdGV0aW1lXCIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZWdleCA9IGRhdGV0aW1lUmVnZXgoY2hlY2spO1xuICAgICAgICAgICAgICAgIGlmICghcmVnZXgudGVzdChpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcImRhdGV0aW1lXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJkYXRlXCIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZWdleCA9IGRhdGVSZWdleDtcbiAgICAgICAgICAgICAgICBpZiAoIXJlZ2V4LnRlc3QoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJkYXRlXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJ0aW1lXCIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZWdleCA9IHRpbWVSZWdleChjaGVjayk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZWdleC50ZXN0KGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwidGltZVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwiZHVyYXRpb25cIikge1xuICAgICAgICAgICAgICAgIGlmICghZHVyYXRpb25SZWdleC50ZXN0KGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwiZHVyYXRpb25cIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImlwXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWlzVmFsaWRJUChpbnB1dC5kYXRhLCBjaGVjay52ZXJzaW9uKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcImlwXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJqd3RcIikge1xuICAgICAgICAgICAgICAgIGlmICghaXNWYWxpZEpXVChpbnB1dC5kYXRhLCBjaGVjay5hbGcpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwiand0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJjaWRyXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWlzVmFsaWRDaWRyKGlucHV0LmRhdGEsIGNoZWNrLnZlcnNpb24pKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwiY2lkclwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwiYmFzZTY0XCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWJhc2U2NFJlZ2V4LnRlc3QoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJiYXNlNjRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImJhc2U2NHVybFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFiYXNlNjR1cmxSZWdleC50ZXN0KGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwiYmFzZTY0dXJsXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdXRpbC5hc3NlcnROZXZlcihjaGVjayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBzdGF0dXMudmFsdWUsIHZhbHVlOiBpbnB1dC5kYXRhIH07XG4gICAgfVxuICAgIF9yZWdleChyZWdleCwgdmFsaWRhdGlvbiwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5yZWZpbmVtZW50KChkYXRhKSA9PiByZWdleC50ZXN0KGRhdGEpLCB7XG4gICAgICAgICAgICB2YWxpZGF0aW9uLFxuICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgX2FkZENoZWNrKGNoZWNrKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kU3RyaW5nKHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIGNoZWNrczogWy4uLnRoaXMuX2RlZi5jaGVja3MsIGNoZWNrXSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGVtYWlsKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHsga2luZDogXCJlbWFpbFwiLCAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSkgfSk7XG4gICAgfVxuICAgIHVybChtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7IGtpbmQ6IFwidXJsXCIsIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSB9KTtcbiAgICB9XG4gICAgZW1vamkobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soeyBraW5kOiBcImVtb2ppXCIsIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSB9KTtcbiAgICB9XG4gICAgdXVpZChtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7IGtpbmQ6IFwidXVpZFwiLCAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSkgfSk7XG4gICAgfVxuICAgIG5hbm9pZChtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7IGtpbmQ6IFwibmFub2lkXCIsIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSB9KTtcbiAgICB9XG4gICAgY3VpZChtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7IGtpbmQ6IFwiY3VpZFwiLCAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSkgfSk7XG4gICAgfVxuICAgIGN1aWQyKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHsga2luZDogXCJjdWlkMlwiLCAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSkgfSk7XG4gICAgfVxuICAgIHVsaWQobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soeyBraW5kOiBcInVsaWRcIiwgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpIH0pO1xuICAgIH1cbiAgICBiYXNlNjQobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soeyBraW5kOiBcImJhc2U2NFwiLCAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSkgfSk7XG4gICAgfVxuICAgIGJhc2U2NHVybChtZXNzYWdlKSB7XG4gICAgICAgIC8vIGJhc2U2NHVybCBlbmNvZGluZyBpcyBhIG1vZGlmaWNhdGlvbiBvZiBiYXNlNjQgdGhhdCBjYW4gc2FmZWx5IGJlIHVzZWQgaW4gVVJMcyBhbmQgZmlsZW5hbWVzXG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcImJhc2U2NHVybFwiLFxuICAgICAgICAgICAgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgand0KG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHsga2luZDogXCJqd3RcIiwgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG9wdGlvbnMpIH0pO1xuICAgIH1cbiAgICBpcChvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7IGtpbmQ6IFwiaXBcIiwgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG9wdGlvbnMpIH0pO1xuICAgIH1cbiAgICBjaWRyKG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHsga2luZDogXCJjaWRyXCIsIC4uLmVycm9yVXRpbC5lcnJUb09iaihvcHRpb25zKSB9KTtcbiAgICB9XG4gICAgZGF0ZXRpbWUob3B0aW9ucykge1xuICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICAgICAga2luZDogXCJkYXRldGltZVwiLFxuICAgICAgICAgICAgICAgIHByZWNpc2lvbjogbnVsbCxcbiAgICAgICAgICAgICAgICBvZmZzZXQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGxvY2FsOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBvcHRpb25zLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwiZGF0ZXRpbWVcIixcbiAgICAgICAgICAgIHByZWNpc2lvbjogdHlwZW9mIG9wdGlvbnM/LnByZWNpc2lvbiA9PT0gXCJ1bmRlZmluZWRcIiA/IG51bGwgOiBvcHRpb25zPy5wcmVjaXNpb24sXG4gICAgICAgICAgICBvZmZzZXQ6IG9wdGlvbnM/Lm9mZnNldCA/PyBmYWxzZSxcbiAgICAgICAgICAgIGxvY2FsOiBvcHRpb25zPy5sb2NhbCA/PyBmYWxzZSxcbiAgICAgICAgICAgIC4uLmVycm9yVXRpbC5lcnJUb09iaihvcHRpb25zPy5tZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGRhdGUobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soeyBraW5kOiBcImRhdGVcIiwgbWVzc2FnZSB9KTtcbiAgICB9XG4gICAgdGltZShvcHRpb25zKSB7XG4gICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgICAgICBraW5kOiBcInRpbWVcIixcbiAgICAgICAgICAgICAgICBwcmVjaXNpb246IG51bGwsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogb3B0aW9ucyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcInRpbWVcIixcbiAgICAgICAgICAgIHByZWNpc2lvbjogdHlwZW9mIG9wdGlvbnM/LnByZWNpc2lvbiA9PT0gXCJ1bmRlZmluZWRcIiA/IG51bGwgOiBvcHRpb25zPy5wcmVjaXNpb24sXG4gICAgICAgICAgICAuLi5lcnJvclV0aWwuZXJyVG9PYmoob3B0aW9ucz8ubWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBkdXJhdGlvbihtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7IGtpbmQ6IFwiZHVyYXRpb25cIiwgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpIH0pO1xuICAgIH1cbiAgICByZWdleChyZWdleCwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJyZWdleFwiLFxuICAgICAgICAgICAgcmVnZXg6IHJlZ2V4LFxuICAgICAgICAgICAgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgaW5jbHVkZXModmFsdWUsIG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwiaW5jbHVkZXNcIixcbiAgICAgICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgICAgIHBvc2l0aW9uOiBvcHRpb25zPy5wb3NpdGlvbixcbiAgICAgICAgICAgIC4uLmVycm9yVXRpbC5lcnJUb09iaihvcHRpb25zPy5tZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHN0YXJ0c1dpdGgodmFsdWUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwic3RhcnRzV2l0aFwiLFxuICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICAgICAgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZW5kc1dpdGgodmFsdWUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwiZW5kc1dpdGhcIixcbiAgICAgICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgICAgIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG1pbihtaW5MZW5ndGgsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibWluXCIsXG4gICAgICAgICAgICB2YWx1ZTogbWluTGVuZ3RoLFxuICAgICAgICAgICAgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbWF4KG1heExlbmd0aCwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtYXhcIixcbiAgICAgICAgICAgIHZhbHVlOiBtYXhMZW5ndGgsXG4gICAgICAgICAgICAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBsZW5ndGgobGVuLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcImxlbmd0aFwiLFxuICAgICAgICAgICAgdmFsdWU6IGxlbixcbiAgICAgICAgICAgIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEVxdWl2YWxlbnQgdG8gYC5taW4oMSlgXG4gICAgICovXG4gICAgbm9uZW1wdHkobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5taW4oMSwgZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpKTtcbiAgICB9XG4gICAgdHJpbSgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RTdHJpbmcoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgY2hlY2tzOiBbLi4udGhpcy5fZGVmLmNoZWNrcywgeyBraW5kOiBcInRyaW1cIiB9XSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHRvTG93ZXJDYXNlKCkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZFN0cmluZyh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBjaGVja3M6IFsuLi50aGlzLl9kZWYuY2hlY2tzLCB7IGtpbmQ6IFwidG9Mb3dlckNhc2VcIiB9XSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHRvVXBwZXJDYXNlKCkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZFN0cmluZyh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBjaGVja3M6IFsuLi50aGlzLl9kZWYuY2hlY2tzLCB7IGtpbmQ6IFwidG9VcHBlckNhc2VcIiB9XSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGdldCBpc0RhdGV0aW1lKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcImRhdGV0aW1lXCIpO1xuICAgIH1cbiAgICBnZXQgaXNEYXRlKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcImRhdGVcIik7XG4gICAgfVxuICAgIGdldCBpc1RpbWUoKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwidGltZVwiKTtcbiAgICB9XG4gICAgZ2V0IGlzRHVyYXRpb24oKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwiZHVyYXRpb25cIik7XG4gICAgfVxuICAgIGdldCBpc0VtYWlsKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcImVtYWlsXCIpO1xuICAgIH1cbiAgICBnZXQgaXNVUkwoKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwidXJsXCIpO1xuICAgIH1cbiAgICBnZXQgaXNFbW9qaSgpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJlbW9qaVwiKTtcbiAgICB9XG4gICAgZ2V0IGlzVVVJRCgpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJ1dWlkXCIpO1xuICAgIH1cbiAgICBnZXQgaXNOQU5PSUQoKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwibmFub2lkXCIpO1xuICAgIH1cbiAgICBnZXQgaXNDVUlEKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcImN1aWRcIik7XG4gICAgfVxuICAgIGdldCBpc0NVSUQyKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcImN1aWQyXCIpO1xuICAgIH1cbiAgICBnZXQgaXNVTElEKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcInVsaWRcIik7XG4gICAgfVxuICAgIGdldCBpc0lQKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcImlwXCIpO1xuICAgIH1cbiAgICBnZXQgaXNDSURSKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcImNpZHJcIik7XG4gICAgfVxuICAgIGdldCBpc0Jhc2U2NCgpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJiYXNlNjRcIik7XG4gICAgfVxuICAgIGdldCBpc0Jhc2U2NHVybCgpIHtcbiAgICAgICAgLy8gYmFzZTY0dXJsIGVuY29kaW5nIGlzIGEgbW9kaWZpY2F0aW9uIG9mIGJhc2U2NCB0aGF0IGNhbiBzYWZlbHkgYmUgdXNlZCBpbiBVUkxzIGFuZCBmaWxlbmFtZXNcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJiYXNlNjR1cmxcIik7XG4gICAgfVxuICAgIGdldCBtaW5MZW5ndGgoKSB7XG4gICAgICAgIGxldCBtaW4gPSBudWxsO1xuICAgICAgICBmb3IgKGNvbnN0IGNoIG9mIHRoaXMuX2RlZi5jaGVja3MpIHtcbiAgICAgICAgICAgIGlmIChjaC5raW5kID09PSBcIm1pblwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1pbiA9PT0gbnVsbCB8fCBjaC52YWx1ZSA+IG1pbilcbiAgICAgICAgICAgICAgICAgICAgbWluID0gY2gudmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1pbjtcbiAgICB9XG4gICAgZ2V0IG1heExlbmd0aCgpIHtcbiAgICAgICAgbGV0IG1heCA9IG51bGw7XG4gICAgICAgIGZvciAoY29uc3QgY2ggb2YgdGhpcy5fZGVmLmNoZWNrcykge1xuICAgICAgICAgICAgaWYgKGNoLmtpbmQgPT09IFwibWF4XCIpIHtcbiAgICAgICAgICAgICAgICBpZiAobWF4ID09PSBudWxsIHx8IGNoLnZhbHVlIDwgbWF4KVxuICAgICAgICAgICAgICAgICAgICBtYXggPSBjaC52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWF4O1xuICAgIH1cbn1cblpvZFN0cmluZy5jcmVhdGUgPSAocGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RTdHJpbmcoe1xuICAgICAgICBjaGVja3M6IFtdLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZFN0cmluZyxcbiAgICAgICAgY29lcmNlOiBwYXJhbXM/LmNvZXJjZSA/PyBmYWxzZSxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbi8vIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzM5NjY0ODQvd2h5LWRvZXMtbW9kdWx1cy1vcGVyYXRvci1yZXR1cm4tZnJhY3Rpb25hbC1udW1iZXItaW4tamF2YXNjcmlwdC8zMTcxMTAzNCMzMTcxMTAzNFxuZnVuY3Rpb24gZmxvYXRTYWZlUmVtYWluZGVyKHZhbCwgc3RlcCkge1xuICAgIGNvbnN0IHZhbERlY0NvdW50ID0gKHZhbC50b1N0cmluZygpLnNwbGl0KFwiLlwiKVsxXSB8fCBcIlwiKS5sZW5ndGg7XG4gICAgY29uc3Qgc3RlcERlY0NvdW50ID0gKHN0ZXAudG9TdHJpbmcoKS5zcGxpdChcIi5cIilbMV0gfHwgXCJcIikubGVuZ3RoO1xuICAgIGNvbnN0IGRlY0NvdW50ID0gdmFsRGVjQ291bnQgPiBzdGVwRGVjQ291bnQgPyB2YWxEZWNDb3VudCA6IHN0ZXBEZWNDb3VudDtcbiAgICBjb25zdCB2YWxJbnQgPSBOdW1iZXIucGFyc2VJbnQodmFsLnRvRml4ZWQoZGVjQ291bnQpLnJlcGxhY2UoXCIuXCIsIFwiXCIpKTtcbiAgICBjb25zdCBzdGVwSW50ID0gTnVtYmVyLnBhcnNlSW50KHN0ZXAudG9GaXhlZChkZWNDb3VudCkucmVwbGFjZShcIi5cIiwgXCJcIikpO1xuICAgIHJldHVybiAodmFsSW50ICUgc3RlcEludCkgLyAxMCAqKiBkZWNDb3VudDtcbn1cbmV4cG9ydCBjbGFzcyBab2ROdW1iZXIgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoLi4uYXJndW1lbnRzKTtcbiAgICAgICAgdGhpcy5taW4gPSB0aGlzLmd0ZTtcbiAgICAgICAgdGhpcy5tYXggPSB0aGlzLmx0ZTtcbiAgICAgICAgdGhpcy5zdGVwID0gdGhpcy5tdWx0aXBsZU9mO1xuICAgIH1cbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgaWYgKHRoaXMuX2RlZi5jb2VyY2UpIHtcbiAgICAgICAgICAgIGlucHV0LmRhdGEgPSBOdW1iZXIoaW5wdXQuZGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFyc2VkVHlwZSA9IHRoaXMuX2dldFR5cGUoaW5wdXQpO1xuICAgICAgICBpZiAocGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5udW1iZXIpIHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUubnVtYmVyLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGN0eCA9IHVuZGVmaW5lZDtcbiAgICAgICAgY29uc3Qgc3RhdHVzID0gbmV3IFBhcnNlU3RhdHVzKCk7XG4gICAgICAgIGZvciAoY29uc3QgY2hlY2sgb2YgdGhpcy5fZGVmLmNoZWNrcykge1xuICAgICAgICAgICAgaWYgKGNoZWNrLmtpbmQgPT09IFwiaW50XCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXV0aWwuaXNJbnRlZ2VyKGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBleHBlY3RlZDogXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICByZWNlaXZlZDogXCJmbG9hdFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwibWluXCIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0b29TbWFsbCA9IGNoZWNrLmluY2x1c2l2ZSA/IGlucHV0LmRhdGEgPCBjaGVjay52YWx1ZSA6IGlucHV0LmRhdGEgPD0gY2hlY2sudmFsdWU7XG4gICAgICAgICAgICAgICAgaWYgKHRvb1NtYWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fc21hbGwsXG4gICAgICAgICAgICAgICAgICAgICAgICBtaW5pbXVtOiBjaGVjay52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwibnVtYmVyXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IGNoZWNrLmluY2x1c2l2ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4YWN0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcIm1heFwiKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdG9vQmlnID0gY2hlY2suaW5jbHVzaXZlID8gaW5wdXQuZGF0YSA+IGNoZWNrLnZhbHVlIDogaW5wdXQuZGF0YSA+PSBjaGVjay52YWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAodG9vQmlnKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fYmlnLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWF4aW11bTogY2hlY2sudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIm51bWJlclwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlOiBjaGVjay5pbmNsdXNpdmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBleGFjdDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJtdWx0aXBsZU9mXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoZmxvYXRTYWZlUmVtYWluZGVyKGlucHV0LmRhdGEsIGNoZWNrLnZhbHVlKSAhPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUubm90X211bHRpcGxlX29mLFxuICAgICAgICAgICAgICAgICAgICAgICAgbXVsdGlwbGVPZjogY2hlY2sudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJmaW5pdGVcIikge1xuICAgICAgICAgICAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5ub3RfZmluaXRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHV0aWwuYXNzZXJ0TmV2ZXIoY2hlY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN0YXR1czogc3RhdHVzLnZhbHVlLCB2YWx1ZTogaW5wdXQuZGF0YSB9O1xuICAgIH1cbiAgICBndGUodmFsdWUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0TGltaXQoXCJtaW5cIiwgdmFsdWUsIHRydWUsIGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSk7XG4gICAgfVxuICAgIGd0KHZhbHVlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldExpbWl0KFwibWluXCIsIHZhbHVlLCBmYWxzZSwgZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpKTtcbiAgICB9XG4gICAgbHRlKHZhbHVlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldExpbWl0KFwibWF4XCIsIHZhbHVlLCB0cnVlLCBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSkpO1xuICAgIH1cbiAgICBsdCh2YWx1ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXRMaW1pdChcIm1heFwiLCB2YWx1ZSwgZmFsc2UsIGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSk7XG4gICAgfVxuICAgIHNldExpbWl0KGtpbmQsIHZhbHVlLCBpbmNsdXNpdmUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2ROdW1iZXIoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgY2hlY2tzOiBbXG4gICAgICAgICAgICAgICAgLi4udGhpcy5fZGVmLmNoZWNrcyxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGtpbmQsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlLFxuICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmUsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIF9hZGRDaGVjayhjaGVjaykge1xuICAgICAgICByZXR1cm4gbmV3IFpvZE51bWJlcih7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBjaGVja3M6IFsuLi50aGlzLl9kZWYuY2hlY2tzLCBjaGVja10sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBpbnQobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJpbnRcIixcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHBvc2l0aXZlKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibWluXCIsXG4gICAgICAgICAgICB2YWx1ZTogMCxcbiAgICAgICAgICAgIGluY2x1c2l2ZTogZmFsc2UsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBuZWdhdGl2ZShtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm1heFwiLFxuICAgICAgICAgICAgdmFsdWU6IDAsXG4gICAgICAgICAgICBpbmNsdXNpdmU6IGZhbHNlLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbm9ucG9zaXRpdmUobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtYXhcIixcbiAgICAgICAgICAgIHZhbHVlOiAwLFxuICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbm9ubmVnYXRpdmUobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtaW5cIixcbiAgICAgICAgICAgIHZhbHVlOiAwLFxuICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbXVsdGlwbGVPZih2YWx1ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtdWx0aXBsZU9mXCIsXG4gICAgICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBmaW5pdGUobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJmaW5pdGVcIixcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHNhZmUobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtaW5cIixcbiAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgIHZhbHVlOiBOdW1iZXIuTUlOX1NBRkVfSU5URUdFUixcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSkuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibWF4XCIsXG4gICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICB2YWx1ZTogTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBnZXQgbWluVmFsdWUoKSB7XG4gICAgICAgIGxldCBtaW4gPSBudWxsO1xuICAgICAgICBmb3IgKGNvbnN0IGNoIG9mIHRoaXMuX2RlZi5jaGVja3MpIHtcbiAgICAgICAgICAgIGlmIChjaC5raW5kID09PSBcIm1pblwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1pbiA9PT0gbnVsbCB8fCBjaC52YWx1ZSA+IG1pbilcbiAgICAgICAgICAgICAgICAgICAgbWluID0gY2gudmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1pbjtcbiAgICB9XG4gICAgZ2V0IG1heFZhbHVlKCkge1xuICAgICAgICBsZXQgbWF4ID0gbnVsbDtcbiAgICAgICAgZm9yIChjb25zdCBjaCBvZiB0aGlzLl9kZWYuY2hlY2tzKSB7XG4gICAgICAgICAgICBpZiAoY2gua2luZCA9PT0gXCJtYXhcIikge1xuICAgICAgICAgICAgICAgIGlmIChtYXggPT09IG51bGwgfHwgY2gudmFsdWUgPCBtYXgpXG4gICAgICAgICAgICAgICAgICAgIG1heCA9IGNoLnZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXg7XG4gICAgfVxuICAgIGdldCBpc0ludCgpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJpbnRcIiB8fCAoY2gua2luZCA9PT0gXCJtdWx0aXBsZU9mXCIgJiYgdXRpbC5pc0ludGVnZXIoY2gudmFsdWUpKSk7XG4gICAgfVxuICAgIGdldCBpc0Zpbml0ZSgpIHtcbiAgICAgICAgbGV0IG1heCA9IG51bGw7XG4gICAgICAgIGxldCBtaW4gPSBudWxsO1xuICAgICAgICBmb3IgKGNvbnN0IGNoIG9mIHRoaXMuX2RlZi5jaGVja3MpIHtcbiAgICAgICAgICAgIGlmIChjaC5raW5kID09PSBcImZpbml0ZVwiIHx8IGNoLmtpbmQgPT09IFwiaW50XCIgfHwgY2gua2luZCA9PT0gXCJtdWx0aXBsZU9mXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoLmtpbmQgPT09IFwibWluXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAobWluID09PSBudWxsIHx8IGNoLnZhbHVlID4gbWluKVxuICAgICAgICAgICAgICAgICAgICBtaW4gPSBjaC52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoLmtpbmQgPT09IFwibWF4XCIpIHtcbiAgICAgICAgICAgICAgICBpZiAobWF4ID09PSBudWxsIHx8IGNoLnZhbHVlIDwgbWF4KVxuICAgICAgICAgICAgICAgICAgICBtYXggPSBjaC52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gTnVtYmVyLmlzRmluaXRlKG1pbikgJiYgTnVtYmVyLmlzRmluaXRlKG1heCk7XG4gICAgfVxufVxuWm9kTnVtYmVyLmNyZWF0ZSA9IChwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZE51bWJlcih7XG4gICAgICAgIGNoZWNrczogW10sXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kTnVtYmVyLFxuICAgICAgICBjb2VyY2U6IHBhcmFtcz8uY29lcmNlIHx8IGZhbHNlLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZEJpZ0ludCBleHRlbmRzIFpvZFR5cGUge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzdXBlciguLi5hcmd1bWVudHMpO1xuICAgICAgICB0aGlzLm1pbiA9IHRoaXMuZ3RlO1xuICAgICAgICB0aGlzLm1heCA9IHRoaXMubHRlO1xuICAgIH1cbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgaWYgKHRoaXMuX2RlZi5jb2VyY2UpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgaW5wdXQuZGF0YSA9IEJpZ0ludChpbnB1dC5kYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fZ2V0SW52YWxpZElucHV0KGlucHV0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYXJzZWRUeXBlID0gdGhpcy5fZ2V0VHlwZShpbnB1dCk7XG4gICAgICAgIGlmIChwYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLmJpZ2ludCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2dldEludmFsaWRJbnB1dChpbnB1dCk7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGN0eCA9IHVuZGVmaW5lZDtcbiAgICAgICAgY29uc3Qgc3RhdHVzID0gbmV3IFBhcnNlU3RhdHVzKCk7XG4gICAgICAgIGZvciAoY29uc3QgY2hlY2sgb2YgdGhpcy5fZGVmLmNoZWNrcykge1xuICAgICAgICAgICAgaWYgKGNoZWNrLmtpbmQgPT09IFwibWluXCIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0b29TbWFsbCA9IGNoZWNrLmluY2x1c2l2ZSA/IGlucHV0LmRhdGEgPCBjaGVjay52YWx1ZSA6IGlucHV0LmRhdGEgPD0gY2hlY2sudmFsdWU7XG4gICAgICAgICAgICAgICAgaWYgKHRvb1NtYWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fc21hbGwsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcImJpZ2ludFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWluaW11bTogY2hlY2sudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IGNoZWNrLmluY2x1c2l2ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcIm1heFwiKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdG9vQmlnID0gY2hlY2suaW5jbHVzaXZlID8gaW5wdXQuZGF0YSA+IGNoZWNrLnZhbHVlIDogaW5wdXQuZGF0YSA+PSBjaGVjay52YWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAodG9vQmlnKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fYmlnLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJiaWdpbnRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIG1heGltdW06IGNoZWNrLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlOiBjaGVjay5pbmNsdXNpdmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJtdWx0aXBsZU9mXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoaW5wdXQuZGF0YSAlIGNoZWNrLnZhbHVlICE9PSBCaWdJbnQoMCkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLm5vdF9tdWx0aXBsZV9vZixcbiAgICAgICAgICAgICAgICAgICAgICAgIG11bHRpcGxlT2Y6IGNoZWNrLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHV0aWwuYXNzZXJ0TmV2ZXIoY2hlY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN0YXR1czogc3RhdHVzLnZhbHVlLCB2YWx1ZTogaW5wdXQuZGF0YSB9O1xuICAgIH1cbiAgICBfZ2V0SW52YWxpZElucHV0KGlucHV0KSB7XG4gICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUuYmlnaW50LFxuICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgfVxuICAgIGd0ZSh2YWx1ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXRMaW1pdChcIm1pblwiLCB2YWx1ZSwgdHJ1ZSwgZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpKTtcbiAgICB9XG4gICAgZ3QodmFsdWUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0TGltaXQoXCJtaW5cIiwgdmFsdWUsIGZhbHNlLCBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSkpO1xuICAgIH1cbiAgICBsdGUodmFsdWUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0TGltaXQoXCJtYXhcIiwgdmFsdWUsIHRydWUsIGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSk7XG4gICAgfVxuICAgIGx0KHZhbHVlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldExpbWl0KFwibWF4XCIsIHZhbHVlLCBmYWxzZSwgZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpKTtcbiAgICB9XG4gICAgc2V0TGltaXQoa2luZCwgdmFsdWUsIGluY2x1c2l2ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZEJpZ0ludCh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBjaGVja3M6IFtcbiAgICAgICAgICAgICAgICAuLi50aGlzLl9kZWYuY2hlY2tzLFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAga2luZCxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBdLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgX2FkZENoZWNrKGNoZWNrKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kQmlnSW50KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIGNoZWNrczogWy4uLnRoaXMuX2RlZi5jaGVja3MsIGNoZWNrXSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHBvc2l0aXZlKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibWluXCIsXG4gICAgICAgICAgICB2YWx1ZTogQmlnSW50KDApLFxuICAgICAgICAgICAgaW5jbHVzaXZlOiBmYWxzZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG5lZ2F0aXZlKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibWF4XCIsXG4gICAgICAgICAgICB2YWx1ZTogQmlnSW50KDApLFxuICAgICAgICAgICAgaW5jbHVzaXZlOiBmYWxzZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG5vbnBvc2l0aXZlKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibWF4XCIsXG4gICAgICAgICAgICB2YWx1ZTogQmlnSW50KDApLFxuICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbm9ubmVnYXRpdmUobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtaW5cIixcbiAgICAgICAgICAgIHZhbHVlOiBCaWdJbnQoMCksXG4gICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBtdWx0aXBsZU9mKHZhbHVlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm11bHRpcGxlT2ZcIixcbiAgICAgICAgICAgIHZhbHVlLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZ2V0IG1pblZhbHVlKCkge1xuICAgICAgICBsZXQgbWluID0gbnVsbDtcbiAgICAgICAgZm9yIChjb25zdCBjaCBvZiB0aGlzLl9kZWYuY2hlY2tzKSB7XG4gICAgICAgICAgICBpZiAoY2gua2luZCA9PT0gXCJtaW5cIikge1xuICAgICAgICAgICAgICAgIGlmIChtaW4gPT09IG51bGwgfHwgY2gudmFsdWUgPiBtaW4pXG4gICAgICAgICAgICAgICAgICAgIG1pbiA9IGNoLnZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtaW47XG4gICAgfVxuICAgIGdldCBtYXhWYWx1ZSgpIHtcbiAgICAgICAgbGV0IG1heCA9IG51bGw7XG4gICAgICAgIGZvciAoY29uc3QgY2ggb2YgdGhpcy5fZGVmLmNoZWNrcykge1xuICAgICAgICAgICAgaWYgKGNoLmtpbmQgPT09IFwibWF4XCIpIHtcbiAgICAgICAgICAgICAgICBpZiAobWF4ID09PSBudWxsIHx8IGNoLnZhbHVlIDwgbWF4KVxuICAgICAgICAgICAgICAgICAgICBtYXggPSBjaC52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWF4O1xuICAgIH1cbn1cblpvZEJpZ0ludC5jcmVhdGUgPSAocGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RCaWdJbnQoe1xuICAgICAgICBjaGVja3M6IFtdLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZEJpZ0ludCxcbiAgICAgICAgY29lcmNlOiBwYXJhbXM/LmNvZXJjZSA/PyBmYWxzZSxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RCb29sZWFuIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGlmICh0aGlzLl9kZWYuY29lcmNlKSB7XG4gICAgICAgICAgICBpbnB1dC5kYXRhID0gQm9vbGVhbihpbnB1dC5kYXRhKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYXJzZWRUeXBlID0gdGhpcy5fZ2V0VHlwZShpbnB1dCk7XG4gICAgICAgIGlmIChwYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLmJvb2xlYW4pIHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUuYm9vbGVhbixcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBPSyhpbnB1dC5kYXRhKTtcbiAgICB9XG59XG5ab2RCb29sZWFuLmNyZWF0ZSA9IChwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZEJvb2xlYW4oe1xuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZEJvb2xlYW4sXG4gICAgICAgIGNvZXJjZTogcGFyYW1zPy5jb2VyY2UgfHwgZmFsc2UsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kRGF0ZSBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBpZiAodGhpcy5fZGVmLmNvZXJjZSkge1xuICAgICAgICAgICAgaW5wdXQuZGF0YSA9IG5ldyBEYXRlKGlucHV0LmRhdGEpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhcnNlZFR5cGUgPSB0aGlzLl9nZXRUeXBlKGlucHV0KTtcbiAgICAgICAgaWYgKHBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUuZGF0ZSkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5kYXRlLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKE51bWJlci5pc05hTihpbnB1dC5kYXRhLmdldFRpbWUoKSkpIHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX2RhdGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHN0YXR1cyA9IG5ldyBQYXJzZVN0YXR1cygpO1xuICAgICAgICBsZXQgY3R4ID0gdW5kZWZpbmVkO1xuICAgICAgICBmb3IgKGNvbnN0IGNoZWNrIG9mIHRoaXMuX2RlZi5jaGVja3MpIHtcbiAgICAgICAgICAgIGlmIChjaGVjay5raW5kID09PSBcIm1pblwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlucHV0LmRhdGEuZ2V0VGltZSgpIDwgY2hlY2sudmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19zbWFsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBleGFjdDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBtaW5pbXVtOiBjaGVjay52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiZGF0ZVwiLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJtYXhcIikge1xuICAgICAgICAgICAgICAgIGlmIChpbnB1dC5kYXRhLmdldFRpbWUoKSA+IGNoZWNrLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fYmlnLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4YWN0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1heGltdW06IGNoZWNrLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJkYXRlXCIsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB1dGlsLmFzc2VydE5ldmVyKGNoZWNrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3RhdHVzOiBzdGF0dXMudmFsdWUsXG4gICAgICAgICAgICB2YWx1ZTogbmV3IERhdGUoaW5wdXQuZGF0YS5nZXRUaW1lKCkpLFxuICAgICAgICB9O1xuICAgIH1cbiAgICBfYWRkQ2hlY2soY2hlY2spIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2REYXRlKHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIGNoZWNrczogWy4uLnRoaXMuX2RlZi5jaGVja3MsIGNoZWNrXSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG1pbihtaW5EYXRlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm1pblwiLFxuICAgICAgICAgICAgdmFsdWU6IG1pbkRhdGUuZ2V0VGltZSgpLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbWF4KG1heERhdGUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibWF4XCIsXG4gICAgICAgICAgICB2YWx1ZTogbWF4RGF0ZS5nZXRUaW1lKCksXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBnZXQgbWluRGF0ZSgpIHtcbiAgICAgICAgbGV0IG1pbiA9IG51bGw7XG4gICAgICAgIGZvciAoY29uc3QgY2ggb2YgdGhpcy5fZGVmLmNoZWNrcykge1xuICAgICAgICAgICAgaWYgKGNoLmtpbmQgPT09IFwibWluXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAobWluID09PSBudWxsIHx8IGNoLnZhbHVlID4gbWluKVxuICAgICAgICAgICAgICAgICAgICBtaW4gPSBjaC52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWluICE9IG51bGwgPyBuZXcgRGF0ZShtaW4pIDogbnVsbDtcbiAgICB9XG4gICAgZ2V0IG1heERhdGUoKSB7XG4gICAgICAgIGxldCBtYXggPSBudWxsO1xuICAgICAgICBmb3IgKGNvbnN0IGNoIG9mIHRoaXMuX2RlZi5jaGVja3MpIHtcbiAgICAgICAgICAgIGlmIChjaC5raW5kID09PSBcIm1heFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1heCA9PT0gbnVsbCB8fCBjaC52YWx1ZSA8IG1heClcbiAgICAgICAgICAgICAgICAgICAgbWF4ID0gY2gudmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1heCAhPSBudWxsID8gbmV3IERhdGUobWF4KSA6IG51bGw7XG4gICAgfVxufVxuWm9kRGF0ZS5jcmVhdGUgPSAocGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2REYXRlKHtcbiAgICAgICAgY2hlY2tzOiBbXSxcbiAgICAgICAgY29lcmNlOiBwYXJhbXM/LmNvZXJjZSB8fCBmYWxzZSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2REYXRlLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZFN5bWJvbCBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCBwYXJzZWRUeXBlID0gdGhpcy5fZ2V0VHlwZShpbnB1dCk7XG4gICAgICAgIGlmIChwYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLnN5bWJvbCkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5zeW1ib2wsXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gT0soaW5wdXQuZGF0YSk7XG4gICAgfVxufVxuWm9kU3ltYm9sLmNyZWF0ZSA9IChwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZFN5bWJvbCh7XG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kU3ltYm9sLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZFVuZGVmaW5lZCBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCBwYXJzZWRUeXBlID0gdGhpcy5fZ2V0VHlwZShpbnB1dCk7XG4gICAgICAgIGlmIChwYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLnVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS51bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gT0soaW5wdXQuZGF0YSk7XG4gICAgfVxufVxuWm9kVW5kZWZpbmVkLmNyZWF0ZSA9IChwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZFVuZGVmaW5lZCh7XG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kVW5kZWZpbmVkLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZE51bGwgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgcGFyc2VkVHlwZSA9IHRoaXMuX2dldFR5cGUoaW5wdXQpO1xuICAgICAgICBpZiAocGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5udWxsKSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLm51bGwsXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gT0soaW5wdXQuZGF0YSk7XG4gICAgfVxufVxuWm9kTnVsbC5jcmVhdGUgPSAocGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2ROdWxsKHtcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2ROdWxsLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZEFueSBleHRlbmRzIFpvZFR5cGUge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzdXBlciguLi5hcmd1bWVudHMpO1xuICAgICAgICAvLyB0byBwcmV2ZW50IGluc3RhbmNlcyBvZiBvdGhlciBjbGFzc2VzIGZyb20gZXh0ZW5kaW5nIFpvZEFueS4gdGhpcyBjYXVzZXMgaXNzdWVzIHdpdGggY2F0Y2hhbGwgaW4gWm9kT2JqZWN0LlxuICAgICAgICB0aGlzLl9hbnkgPSB0cnVlO1xuICAgIH1cbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgcmV0dXJuIE9LKGlucHV0LmRhdGEpO1xuICAgIH1cbn1cblpvZEFueS5jcmVhdGUgPSAocGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RBbnkoe1xuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZEFueSxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RVbmtub3duIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHN1cGVyKC4uLmFyZ3VtZW50cyk7XG4gICAgICAgIC8vIHJlcXVpcmVkXG4gICAgICAgIHRoaXMuX3Vua25vd24gPSB0cnVlO1xuICAgIH1cbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgcmV0dXJuIE9LKGlucHV0LmRhdGEpO1xuICAgIH1cbn1cblpvZFVua25vd24uY3JlYXRlID0gKHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kVW5rbm93bih7XG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kVW5rbm93bixcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2ROZXZlciBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLm5ldmVyLFxuICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgfVxufVxuWm9kTmV2ZXIuY3JlYXRlID0gKHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kTmV2ZXIoe1xuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZE5ldmVyLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZFZvaWQgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgcGFyc2VkVHlwZSA9IHRoaXMuX2dldFR5cGUoaW5wdXQpO1xuICAgICAgICBpZiAocGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS51bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUudm9pZCxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBPSyhpbnB1dC5kYXRhKTtcbiAgICB9XG59XG5ab2RWb2lkLmNyZWF0ZSA9IChwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZFZvaWQoe1xuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZFZvaWQsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kQXJyYXkgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBjdHgsIHN0YXR1cyB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgY29uc3QgZGVmID0gdGhpcy5fZGVmO1xuICAgICAgICBpZiAoY3R4LnBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUuYXJyYXkpIHtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUuYXJyYXksXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZGVmLmV4YWN0TGVuZ3RoICE9PSBudWxsKSB7XG4gICAgICAgICAgICBjb25zdCB0b29CaWcgPSBjdHguZGF0YS5sZW5ndGggPiBkZWYuZXhhY3RMZW5ndGgudmFsdWU7XG4gICAgICAgICAgICBjb25zdCB0b29TbWFsbCA9IGN0eC5kYXRhLmxlbmd0aCA8IGRlZi5leGFjdExlbmd0aC52YWx1ZTtcbiAgICAgICAgICAgIGlmICh0b29CaWcgfHwgdG9vU21hbGwpIHtcbiAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogdG9vQmlnID8gWm9kSXNzdWVDb2RlLnRvb19iaWcgOiBab2RJc3N1ZUNvZGUudG9vX3NtYWxsLFxuICAgICAgICAgICAgICAgICAgICBtaW5pbXVtOiAodG9vU21hbGwgPyBkZWYuZXhhY3RMZW5ndGgudmFsdWUgOiB1bmRlZmluZWQpLFxuICAgICAgICAgICAgICAgICAgICBtYXhpbXVtOiAodG9vQmlnID8gZGVmLmV4YWN0TGVuZ3RoLnZhbHVlIDogdW5kZWZpbmVkKSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGV4YWN0OiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBkZWYuZXhhY3RMZW5ndGgubWVzc2FnZSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoZGVmLm1pbkxlbmd0aCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgaWYgKGN0eC5kYXRhLmxlbmd0aCA8IGRlZi5taW5MZW5ndGgudmFsdWUpIHtcbiAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19zbWFsbCxcbiAgICAgICAgICAgICAgICAgICAgbWluaW11bTogZGVmLm1pbkxlbmd0aC52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGV4YWN0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogZGVmLm1pbkxlbmd0aC5tZXNzYWdlLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChkZWYubWF4TGVuZ3RoICE9PSBudWxsKSB7XG4gICAgICAgICAgICBpZiAoY3R4LmRhdGEubGVuZ3RoID4gZGVmLm1heExlbmd0aC52YWx1ZSkge1xuICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX2JpZyxcbiAgICAgICAgICAgICAgICAgICAgbWF4aW11bTogZGVmLm1heExlbmd0aC52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGV4YWN0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogZGVmLm1heExlbmd0aC5tZXNzYWdlLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjdHguY29tbW9uLmFzeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoWy4uLmN0eC5kYXRhXS5tYXAoKGl0ZW0sIGkpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZGVmLnR5cGUuX3BhcnNlQXN5bmMobmV3IFBhcnNlSW5wdXRMYXp5UGF0aChjdHgsIGl0ZW0sIGN0eC5wYXRoLCBpKSk7XG4gICAgICAgICAgICB9KSkudGhlbigocmVzdWx0KSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFBhcnNlU3RhdHVzLm1lcmdlQXJyYXkoc3RhdHVzLCByZXN1bHQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gWy4uLmN0eC5kYXRhXS5tYXAoKGl0ZW0sIGkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBkZWYudHlwZS5fcGFyc2VTeW5jKG5ldyBQYXJzZUlucHV0TGF6eVBhdGgoY3R4LCBpdGVtLCBjdHgucGF0aCwgaSkpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIFBhcnNlU3RhdHVzLm1lcmdlQXJyYXkoc3RhdHVzLCByZXN1bHQpO1xuICAgIH1cbiAgICBnZXQgZWxlbWVudCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi50eXBlO1xuICAgIH1cbiAgICBtaW4obWluTGVuZ3RoLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kQXJyYXkoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgbWluTGVuZ3RoOiB7IHZhbHVlOiBtaW5MZW5ndGgsIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSB9LFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbWF4KG1heExlbmd0aCwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZEFycmF5KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIG1heExlbmd0aDogeyB2YWx1ZTogbWF4TGVuZ3RoLCBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSkgfSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGxlbmd0aChsZW4sIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RBcnJheSh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBleGFjdExlbmd0aDogeyB2YWx1ZTogbGVuLCBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSkgfSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG5vbmVtcHR5KG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubWluKDEsIG1lc3NhZ2UpO1xuICAgIH1cbn1cblpvZEFycmF5LmNyZWF0ZSA9IChzY2hlbWEsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kQXJyYXkoe1xuICAgICAgICB0eXBlOiBzY2hlbWEsXG4gICAgICAgIG1pbkxlbmd0aDogbnVsbCxcbiAgICAgICAgbWF4TGVuZ3RoOiBudWxsLFxuICAgICAgICBleGFjdExlbmd0aDogbnVsbCxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RBcnJheSxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmZ1bmN0aW9uIGRlZXBQYXJ0aWFsaWZ5KHNjaGVtYSkge1xuICAgIGlmIChzY2hlbWEgaW5zdGFuY2VvZiBab2RPYmplY3QpIHtcbiAgICAgICAgY29uc3QgbmV3U2hhcGUgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gc2NoZW1hLnNoYXBlKSB7XG4gICAgICAgICAgICBjb25zdCBmaWVsZFNjaGVtYSA9IHNjaGVtYS5zaGFwZVtrZXldO1xuICAgICAgICAgICAgbmV3U2hhcGVba2V5XSA9IFpvZE9wdGlvbmFsLmNyZWF0ZShkZWVwUGFydGlhbGlmeShmaWVsZFNjaGVtYSkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgWm9kT2JqZWN0KHtcbiAgICAgICAgICAgIC4uLnNjaGVtYS5fZGVmLFxuICAgICAgICAgICAgc2hhcGU6ICgpID0+IG5ld1NoYXBlLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZWxzZSBpZiAoc2NoZW1hIGluc3RhbmNlb2YgWm9kQXJyYXkpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RBcnJheSh7XG4gICAgICAgICAgICAuLi5zY2hlbWEuX2RlZixcbiAgICAgICAgICAgIHR5cGU6IGRlZXBQYXJ0aWFsaWZ5KHNjaGVtYS5lbGVtZW50KSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHNjaGVtYSBpbnN0YW5jZW9mIFpvZE9wdGlvbmFsKSB7XG4gICAgICAgIHJldHVybiBab2RPcHRpb25hbC5jcmVhdGUoZGVlcFBhcnRpYWxpZnkoc2NoZW1hLnVud3JhcCgpKSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHNjaGVtYSBpbnN0YW5jZW9mIFpvZE51bGxhYmxlKSB7XG4gICAgICAgIHJldHVybiBab2ROdWxsYWJsZS5jcmVhdGUoZGVlcFBhcnRpYWxpZnkoc2NoZW1hLnVud3JhcCgpKSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHNjaGVtYSBpbnN0YW5jZW9mIFpvZFR1cGxlKSB7XG4gICAgICAgIHJldHVybiBab2RUdXBsZS5jcmVhdGUoc2NoZW1hLml0ZW1zLm1hcCgoaXRlbSkgPT4gZGVlcFBhcnRpYWxpZnkoaXRlbSkpKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBzY2hlbWE7XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFpvZE9iamVjdCBleHRlbmRzIFpvZFR5cGUge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzdXBlciguLi5hcmd1bWVudHMpO1xuICAgICAgICB0aGlzLl9jYWNoZWQgPSBudWxsO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGRlcHJlY2F0ZWQgSW4gbW9zdCBjYXNlcywgdGhpcyBpcyBubyBsb25nZXIgbmVlZGVkIC0gdW5rbm93biBwcm9wZXJ0aWVzIGFyZSBub3cgc2lsZW50bHkgc3RyaXBwZWQuXG4gICAgICAgICAqIElmIHlvdSB3YW50IHRvIHBhc3MgdGhyb3VnaCB1bmtub3duIHByb3BlcnRpZXMsIHVzZSBgLnBhc3N0aHJvdWdoKClgIGluc3RlYWQuXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLm5vbnN0cmljdCA9IHRoaXMucGFzc3Rocm91Z2g7XG4gICAgICAgIC8vIGV4dGVuZDxcbiAgICAgICAgLy8gICBBdWdtZW50YXRpb24gZXh0ZW5kcyBab2RSYXdTaGFwZSxcbiAgICAgICAgLy8gICBOZXdPdXRwdXQgZXh0ZW5kcyB1dGlsLmZsYXR0ZW48e1xuICAgICAgICAvLyAgICAgW2sgaW4ga2V5b2YgQXVnbWVudGF0aW9uIHwga2V5b2YgT3V0cHV0XTogayBleHRlbmRzIGtleW9mIEF1Z21lbnRhdGlvblxuICAgICAgICAvLyAgICAgICA/IEF1Z21lbnRhdGlvbltrXVtcIl9vdXRwdXRcIl1cbiAgICAgICAgLy8gICAgICAgOiBrIGV4dGVuZHMga2V5b2YgT3V0cHV0XG4gICAgICAgIC8vICAgICAgID8gT3V0cHV0W2tdXG4gICAgICAgIC8vICAgICAgIDogbmV2ZXI7XG4gICAgICAgIC8vICAgfT4sXG4gICAgICAgIC8vICAgTmV3SW5wdXQgZXh0ZW5kcyB1dGlsLmZsYXR0ZW48e1xuICAgICAgICAvLyAgICAgW2sgaW4ga2V5b2YgQXVnbWVudGF0aW9uIHwga2V5b2YgSW5wdXRdOiBrIGV4dGVuZHMga2V5b2YgQXVnbWVudGF0aW9uXG4gICAgICAgIC8vICAgICAgID8gQXVnbWVudGF0aW9uW2tdW1wiX2lucHV0XCJdXG4gICAgICAgIC8vICAgICAgIDogayBleHRlbmRzIGtleW9mIElucHV0XG4gICAgICAgIC8vICAgICAgID8gSW5wdXRba11cbiAgICAgICAgLy8gICAgICAgOiBuZXZlcjtcbiAgICAgICAgLy8gICB9PlxuICAgICAgICAvLyA+KFxuICAgICAgICAvLyAgIGF1Z21lbnRhdGlvbjogQXVnbWVudGF0aW9uXG4gICAgICAgIC8vICk6IFpvZE9iamVjdDxcbiAgICAgICAgLy8gICBleHRlbmRTaGFwZTxULCBBdWdtZW50YXRpb24+LFxuICAgICAgICAvLyAgIFVua25vd25LZXlzLFxuICAgICAgICAvLyAgIENhdGNoYWxsLFxuICAgICAgICAvLyAgIE5ld091dHB1dCxcbiAgICAgICAgLy8gICBOZXdJbnB1dFxuICAgICAgICAvLyA+IHtcbiAgICAgICAgLy8gICByZXR1cm4gbmV3IFpvZE9iamVjdCh7XG4gICAgICAgIC8vICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgIC8vICAgICBzaGFwZTogKCkgPT4gKHtcbiAgICAgICAgLy8gICAgICAgLi4udGhpcy5fZGVmLnNoYXBlKCksXG4gICAgICAgIC8vICAgICAgIC4uLmF1Z21lbnRhdGlvbixcbiAgICAgICAgLy8gICAgIH0pLFxuICAgICAgICAvLyAgIH0pIGFzIGFueTtcbiAgICAgICAgLy8gfVxuICAgICAgICAvKipcbiAgICAgICAgICogQGRlcHJlY2F0ZWQgVXNlIGAuZXh0ZW5kYCBpbnN0ZWFkXG4gICAgICAgICAqICAqL1xuICAgICAgICB0aGlzLmF1Z21lbnQgPSB0aGlzLmV4dGVuZDtcbiAgICB9XG4gICAgX2dldENhY2hlZCgpIHtcbiAgICAgICAgaWYgKHRoaXMuX2NhY2hlZCAhPT0gbnVsbClcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jYWNoZWQ7XG4gICAgICAgIGNvbnN0IHNoYXBlID0gdGhpcy5fZGVmLnNoYXBlKCk7XG4gICAgICAgIGNvbnN0IGtleXMgPSB1dGlsLm9iamVjdEtleXMoc2hhcGUpO1xuICAgICAgICB0aGlzLl9jYWNoZWQgPSB7IHNoYXBlLCBrZXlzIH07XG4gICAgICAgIHJldHVybiB0aGlzLl9jYWNoZWQ7XG4gICAgfVxuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCBwYXJzZWRUeXBlID0gdGhpcy5fZ2V0VHlwZShpbnB1dCk7XG4gICAgICAgIGlmIChwYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLm9iamVjdCkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5vYmplY3QsXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB7IHN0YXR1cywgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBjb25zdCB7IHNoYXBlLCBrZXlzOiBzaGFwZUtleXMgfSA9IHRoaXMuX2dldENhY2hlZCgpO1xuICAgICAgICBjb25zdCBleHRyYUtleXMgPSBbXTtcbiAgICAgICAgaWYgKCEodGhpcy5fZGVmLmNhdGNoYWxsIGluc3RhbmNlb2YgWm9kTmV2ZXIgJiYgdGhpcy5fZGVmLnVua25vd25LZXlzID09PSBcInN0cmlwXCIpKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBjdHguZGF0YSkge1xuICAgICAgICAgICAgICAgIGlmICghc2hhcGVLZXlzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgICAgICAgICAgICAgICAgZXh0cmFLZXlzLnB1c2goa2V5KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFpcnMgPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2Ygc2hhcGVLZXlzKSB7XG4gICAgICAgICAgICBjb25zdCBrZXlWYWxpZGF0b3IgPSBzaGFwZVtrZXldO1xuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBjdHguZGF0YVtrZXldO1xuICAgICAgICAgICAgcGFpcnMucHVzaCh7XG4gICAgICAgICAgICAgICAga2V5OiB7IHN0YXR1czogXCJ2YWxpZFwiLCB2YWx1ZToga2V5IH0sXG4gICAgICAgICAgICAgICAgdmFsdWU6IGtleVZhbGlkYXRvci5fcGFyc2UobmV3IFBhcnNlSW5wdXRMYXp5UGF0aChjdHgsIHZhbHVlLCBjdHgucGF0aCwga2V5KSksXG4gICAgICAgICAgICAgICAgYWx3YXlzU2V0OiBrZXkgaW4gY3R4LmRhdGEsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5fZGVmLmNhdGNoYWxsIGluc3RhbmNlb2YgWm9kTmV2ZXIpIHtcbiAgICAgICAgICAgIGNvbnN0IHVua25vd25LZXlzID0gdGhpcy5fZGVmLnVua25vd25LZXlzO1xuICAgICAgICAgICAgaWYgKHVua25vd25LZXlzID09PSBcInBhc3N0aHJvdWdoXCIpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBleHRyYUtleXMpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFpcnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZXk6IHsgc3RhdHVzOiBcInZhbGlkXCIsIHZhbHVlOiBrZXkgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiB7IHN0YXR1czogXCJ2YWxpZFwiLCB2YWx1ZTogY3R4LmRhdGFba2V5XSB9LFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh1bmtub3duS2V5cyA9PT0gXCJzdHJpY3RcIikge1xuICAgICAgICAgICAgICAgIGlmIChleHRyYUtleXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS51bnJlY29nbml6ZWRfa2V5cyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleXM6IGV4dHJhS2V5cyxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHVua25vd25LZXlzID09PSBcInN0cmlwXCIpIHtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW50ZXJuYWwgWm9kT2JqZWN0IGVycm9yOiBpbnZhbGlkIHVua25vd25LZXlzIHZhbHVlLmApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgLy8gcnVuIGNhdGNoYWxsIHZhbGlkYXRpb25cbiAgICAgICAgICAgIGNvbnN0IGNhdGNoYWxsID0gdGhpcy5fZGVmLmNhdGNoYWxsO1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgZXh0cmFLZXlzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBjdHguZGF0YVtrZXldO1xuICAgICAgICAgICAgICAgIHBhaXJzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBrZXk6IHsgc3RhdHVzOiBcInZhbGlkXCIsIHZhbHVlOiBrZXkgfSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGNhdGNoYWxsLl9wYXJzZShuZXcgUGFyc2VJbnB1dExhenlQYXRoKGN0eCwgdmFsdWUsIGN0eC5wYXRoLCBrZXkpIC8vLCBjdHguY2hpbGQoa2V5KSwgdmFsdWUsIGdldFBhcnNlZFR5cGUodmFsdWUpXG4gICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgICAgIGFsd2F5c1NldDoga2V5IGluIGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjdHguY29tbW9uLmFzeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICAgICAgICAudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3luY1BhaXJzID0gW107XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBwYWlyIG9mIHBhaXJzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGtleSA9IGF3YWl0IHBhaXIua2V5O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IGF3YWl0IHBhaXIudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIHN5bmNQYWlycy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgYWx3YXlzU2V0OiBwYWlyLmFsd2F5c1NldCxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBzeW5jUGFpcnM7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC50aGVuKChzeW5jUGFpcnMpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gUGFyc2VTdGF0dXMubWVyZ2VPYmplY3RTeW5jKHN0YXR1cywgc3luY1BhaXJzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIFBhcnNlU3RhdHVzLm1lcmdlT2JqZWN0U3luYyhzdGF0dXMsIHBhaXJzKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBnZXQgc2hhcGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuc2hhcGUoKTtcbiAgICB9XG4gICAgc3RyaWN0KG1lc3NhZ2UpIHtcbiAgICAgICAgZXJyb3JVdGlsLmVyclRvT2JqO1xuICAgICAgICByZXR1cm4gbmV3IFpvZE9iamVjdCh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICB1bmtub3duS2V5czogXCJzdHJpY3RcIixcbiAgICAgICAgICAgIC4uLihtZXNzYWdlICE9PSB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICA/IHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3JNYXA6IChpc3N1ZSwgY3R4KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkZWZhdWx0RXJyb3IgPSB0aGlzLl9kZWYuZXJyb3JNYXA/Lihpc3N1ZSwgY3R4KS5tZXNzYWdlID8/IGN0eC5kZWZhdWx0RXJyb3I7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXNzdWUuY29kZSA9PT0gXCJ1bnJlY29nbml6ZWRfa2V5c1wiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKS5tZXNzYWdlID8/IGRlZmF1bHRFcnJvcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBkZWZhdWx0RXJyb3IsXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICA6IHt9KSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHN0cmlwKCkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZE9iamVjdCh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICB1bmtub3duS2V5czogXCJzdHJpcFwiLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcGFzc3Rocm91Z2goKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kT2JqZWN0KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIHVua25vd25LZXlzOiBcInBhc3N0aHJvdWdoXCIsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBjb25zdCBBdWdtZW50RmFjdG9yeSA9XG4gICAgLy8gICA8RGVmIGV4dGVuZHMgWm9kT2JqZWN0RGVmPihkZWY6IERlZikgPT5cbiAgICAvLyAgIDxBdWdtZW50YXRpb24gZXh0ZW5kcyBab2RSYXdTaGFwZT4oXG4gICAgLy8gICAgIGF1Z21lbnRhdGlvbjogQXVnbWVudGF0aW9uXG4gICAgLy8gICApOiBab2RPYmplY3Q8XG4gICAgLy8gICAgIGV4dGVuZFNoYXBlPFJldHVyblR5cGU8RGVmW1wic2hhcGVcIl0+LCBBdWdtZW50YXRpb24+LFxuICAgIC8vICAgICBEZWZbXCJ1bmtub3duS2V5c1wiXSxcbiAgICAvLyAgICAgRGVmW1wiY2F0Y2hhbGxcIl1cbiAgICAvLyAgID4gPT4ge1xuICAgIC8vICAgICByZXR1cm4gbmV3IFpvZE9iamVjdCh7XG4gICAgLy8gICAgICAgLi4uZGVmLFxuICAgIC8vICAgICAgIHNoYXBlOiAoKSA9PiAoe1xuICAgIC8vICAgICAgICAgLi4uZGVmLnNoYXBlKCksXG4gICAgLy8gICAgICAgICAuLi5hdWdtZW50YXRpb24sXG4gICAgLy8gICAgICAgfSksXG4gICAgLy8gICAgIH0pIGFzIGFueTtcbiAgICAvLyAgIH07XG4gICAgZXh0ZW5kKGF1Z21lbnRhdGlvbikge1xuICAgICAgICByZXR1cm4gbmV3IFpvZE9iamVjdCh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBzaGFwZTogKCkgPT4gKHtcbiAgICAgICAgICAgICAgICAuLi50aGlzLl9kZWYuc2hhcGUoKSxcbiAgICAgICAgICAgICAgICAuLi5hdWdtZW50YXRpb24sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFByaW9yIHRvIHpvZEAxLjAuMTIgdGhlcmUgd2FzIGEgYnVnIGluIHRoZVxuICAgICAqIGluZmVycmVkIHR5cGUgb2YgbWVyZ2VkIG9iamVjdHMuIFBsZWFzZVxuICAgICAqIHVwZ3JhZGUgaWYgeW91IGFyZSBleHBlcmllbmNpbmcgaXNzdWVzLlxuICAgICAqL1xuICAgIG1lcmdlKG1lcmdpbmcpIHtcbiAgICAgICAgY29uc3QgbWVyZ2VkID0gbmV3IFpvZE9iamVjdCh7XG4gICAgICAgICAgICB1bmtub3duS2V5czogbWVyZ2luZy5fZGVmLnVua25vd25LZXlzLFxuICAgICAgICAgICAgY2F0Y2hhbGw6IG1lcmdpbmcuX2RlZi5jYXRjaGFsbCxcbiAgICAgICAgICAgIHNoYXBlOiAoKSA9PiAoe1xuICAgICAgICAgICAgICAgIC4uLnRoaXMuX2RlZi5zaGFwZSgpLFxuICAgICAgICAgICAgICAgIC4uLm1lcmdpbmcuX2RlZi5zaGFwZSgpLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZE9iamVjdCxcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBtZXJnZWQ7XG4gICAgfVxuICAgIC8vIG1lcmdlPFxuICAgIC8vICAgSW5jb21pbmcgZXh0ZW5kcyBBbnlab2RPYmplY3QsXG4gICAgLy8gICBBdWdtZW50YXRpb24gZXh0ZW5kcyBJbmNvbWluZ1tcInNoYXBlXCJdLFxuICAgIC8vICAgTmV3T3V0cHV0IGV4dGVuZHMge1xuICAgIC8vICAgICBbayBpbiBrZXlvZiBBdWdtZW50YXRpb24gfCBrZXlvZiBPdXRwdXRdOiBrIGV4dGVuZHMga2V5b2YgQXVnbWVudGF0aW9uXG4gICAgLy8gICAgICAgPyBBdWdtZW50YXRpb25ba11bXCJfb3V0cHV0XCJdXG4gICAgLy8gICAgICAgOiBrIGV4dGVuZHMga2V5b2YgT3V0cHV0XG4gICAgLy8gICAgICAgPyBPdXRwdXRba11cbiAgICAvLyAgICAgICA6IG5ldmVyO1xuICAgIC8vICAgfSxcbiAgICAvLyAgIE5ld0lucHV0IGV4dGVuZHMge1xuICAgIC8vICAgICBbayBpbiBrZXlvZiBBdWdtZW50YXRpb24gfCBrZXlvZiBJbnB1dF06IGsgZXh0ZW5kcyBrZXlvZiBBdWdtZW50YXRpb25cbiAgICAvLyAgICAgICA/IEF1Z21lbnRhdGlvbltrXVtcIl9pbnB1dFwiXVxuICAgIC8vICAgICAgIDogayBleHRlbmRzIGtleW9mIElucHV0XG4gICAgLy8gICAgICAgPyBJbnB1dFtrXVxuICAgIC8vICAgICAgIDogbmV2ZXI7XG4gICAgLy8gICB9XG4gICAgLy8gPihcbiAgICAvLyAgIG1lcmdpbmc6IEluY29taW5nXG4gICAgLy8gKTogWm9kT2JqZWN0PFxuICAgIC8vICAgZXh0ZW5kU2hhcGU8VCwgUmV0dXJuVHlwZTxJbmNvbWluZ1tcIl9kZWZcIl1bXCJzaGFwZVwiXT4+LFxuICAgIC8vICAgSW5jb21pbmdbXCJfZGVmXCJdW1widW5rbm93bktleXNcIl0sXG4gICAgLy8gICBJbmNvbWluZ1tcIl9kZWZcIl1bXCJjYXRjaGFsbFwiXSxcbiAgICAvLyAgIE5ld091dHB1dCxcbiAgICAvLyAgIE5ld0lucHV0XG4gICAgLy8gPiB7XG4gICAgLy8gICBjb25zdCBtZXJnZWQ6IGFueSA9IG5ldyBab2RPYmplY3Qoe1xuICAgIC8vICAgICB1bmtub3duS2V5czogbWVyZ2luZy5fZGVmLnVua25vd25LZXlzLFxuICAgIC8vICAgICBjYXRjaGFsbDogbWVyZ2luZy5fZGVmLmNhdGNoYWxsLFxuICAgIC8vICAgICBzaGFwZTogKCkgPT5cbiAgICAvLyAgICAgICBvYmplY3RVdGlsLm1lcmdlU2hhcGVzKHRoaXMuX2RlZi5zaGFwZSgpLCBtZXJnaW5nLl9kZWYuc2hhcGUoKSksXG4gICAgLy8gICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kT2JqZWN0LFxuICAgIC8vICAgfSkgYXMgYW55O1xuICAgIC8vICAgcmV0dXJuIG1lcmdlZDtcbiAgICAvLyB9XG4gICAgc2V0S2V5KGtleSwgc2NoZW1hKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmF1Z21lbnQoeyBba2V5XTogc2NoZW1hIH0pO1xuICAgIH1cbiAgICAvLyBtZXJnZTxJbmNvbWluZyBleHRlbmRzIEFueVpvZE9iamVjdD4oXG4gICAgLy8gICBtZXJnaW5nOiBJbmNvbWluZ1xuICAgIC8vICk6IC8vWm9kT2JqZWN0PFQgJiBJbmNvbWluZ1tcIl9zaGFwZVwiXSwgVW5rbm93bktleXMsIENhdGNoYWxsPiA9IChtZXJnaW5nKSA9PiB7XG4gICAgLy8gWm9kT2JqZWN0PFxuICAgIC8vICAgZXh0ZW5kU2hhcGU8VCwgUmV0dXJuVHlwZTxJbmNvbWluZ1tcIl9kZWZcIl1bXCJzaGFwZVwiXT4+LFxuICAgIC8vICAgSW5jb21pbmdbXCJfZGVmXCJdW1widW5rbm93bktleXNcIl0sXG4gICAgLy8gICBJbmNvbWluZ1tcIl9kZWZcIl1bXCJjYXRjaGFsbFwiXVxuICAgIC8vID4ge1xuICAgIC8vICAgLy8gY29uc3QgbWVyZ2VkU2hhcGUgPSBvYmplY3RVdGlsLm1lcmdlU2hhcGVzKFxuICAgIC8vICAgLy8gICB0aGlzLl9kZWYuc2hhcGUoKSxcbiAgICAvLyAgIC8vICAgbWVyZ2luZy5fZGVmLnNoYXBlKClcbiAgICAvLyAgIC8vICk7XG4gICAgLy8gICBjb25zdCBtZXJnZWQ6IGFueSA9IG5ldyBab2RPYmplY3Qoe1xuICAgIC8vICAgICB1bmtub3duS2V5czogbWVyZ2luZy5fZGVmLnVua25vd25LZXlzLFxuICAgIC8vICAgICBjYXRjaGFsbDogbWVyZ2luZy5fZGVmLmNhdGNoYWxsLFxuICAgIC8vICAgICBzaGFwZTogKCkgPT5cbiAgICAvLyAgICAgICBvYmplY3RVdGlsLm1lcmdlU2hhcGVzKHRoaXMuX2RlZi5zaGFwZSgpLCBtZXJnaW5nLl9kZWYuc2hhcGUoKSksXG4gICAgLy8gICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kT2JqZWN0LFxuICAgIC8vICAgfSkgYXMgYW55O1xuICAgIC8vICAgcmV0dXJuIG1lcmdlZDtcbiAgICAvLyB9XG4gICAgY2F0Y2hhbGwoaW5kZXgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RPYmplY3Qoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgY2F0Y2hhbGw6IGluZGV4LFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcGljayhtYXNrKSB7XG4gICAgICAgIGNvbnN0IHNoYXBlID0ge307XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIHV0aWwub2JqZWN0S2V5cyhtYXNrKSkge1xuICAgICAgICAgICAgaWYgKG1hc2tba2V5XSAmJiB0aGlzLnNoYXBlW2tleV0pIHtcbiAgICAgICAgICAgICAgICBzaGFwZVtrZXldID0gdGhpcy5zaGFwZVtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgWm9kT2JqZWN0KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIHNoYXBlOiAoKSA9PiBzaGFwZSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG9taXQobWFzaykge1xuICAgICAgICBjb25zdCBzaGFwZSA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiB1dGlsLm9iamVjdEtleXModGhpcy5zaGFwZSkpIHtcbiAgICAgICAgICAgIGlmICghbWFza1trZXldKSB7XG4gICAgICAgICAgICAgICAgc2hhcGVba2V5XSA9IHRoaXMuc2hhcGVba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFpvZE9iamVjdCh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBzaGFwZTogKCkgPT4gc2hhcGUsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBAZGVwcmVjYXRlZFxuICAgICAqL1xuICAgIGRlZXBQYXJ0aWFsKCkge1xuICAgICAgICByZXR1cm4gZGVlcFBhcnRpYWxpZnkodGhpcyk7XG4gICAgfVxuICAgIHBhcnRpYWwobWFzaykge1xuICAgICAgICBjb25zdCBuZXdTaGFwZSA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiB1dGlsLm9iamVjdEtleXModGhpcy5zaGFwZSkpIHtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkU2NoZW1hID0gdGhpcy5zaGFwZVtrZXldO1xuICAgICAgICAgICAgaWYgKG1hc2sgJiYgIW1hc2tba2V5XSkge1xuICAgICAgICAgICAgICAgIG5ld1NoYXBlW2tleV0gPSBmaWVsZFNjaGVtYTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIG5ld1NoYXBlW2tleV0gPSBmaWVsZFNjaGVtYS5vcHRpb25hbCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgWm9kT2JqZWN0KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIHNoYXBlOiAoKSA9PiBuZXdTaGFwZSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJlcXVpcmVkKG1hc2spIHtcbiAgICAgICAgY29uc3QgbmV3U2hhcGUgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgdXRpbC5vYmplY3RLZXlzKHRoaXMuc2hhcGUpKSB7XG4gICAgICAgICAgICBpZiAobWFzayAmJiAhbWFza1trZXldKSB7XG4gICAgICAgICAgICAgICAgbmV3U2hhcGVba2V5XSA9IHRoaXMuc2hhcGVba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkU2NoZW1hID0gdGhpcy5zaGFwZVtrZXldO1xuICAgICAgICAgICAgICAgIGxldCBuZXdGaWVsZCA9IGZpZWxkU2NoZW1hO1xuICAgICAgICAgICAgICAgIHdoaWxlIChuZXdGaWVsZCBpbnN0YW5jZW9mIFpvZE9wdGlvbmFsKSB7XG4gICAgICAgICAgICAgICAgICAgIG5ld0ZpZWxkID0gbmV3RmllbGQuX2RlZi5pbm5lclR5cGU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG5ld1NoYXBlW2tleV0gPSBuZXdGaWVsZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFpvZE9iamVjdCh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBzaGFwZTogKCkgPT4gbmV3U2hhcGUsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBrZXlvZigpIHtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZVpvZEVudW0odXRpbC5vYmplY3RLZXlzKHRoaXMuc2hhcGUpKTtcbiAgICB9XG59XG5ab2RPYmplY3QuY3JlYXRlID0gKHNoYXBlLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZE9iamVjdCh7XG4gICAgICAgIHNoYXBlOiAoKSA9PiBzaGFwZSxcbiAgICAgICAgdW5rbm93bktleXM6IFwic3RyaXBcIixcbiAgICAgICAgY2F0Y2hhbGw6IFpvZE5ldmVyLmNyZWF0ZSgpLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZE9iamVjdCxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcblpvZE9iamVjdC5zdHJpY3RDcmVhdGUgPSAoc2hhcGUsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kT2JqZWN0KHtcbiAgICAgICAgc2hhcGU6ICgpID0+IHNoYXBlLFxuICAgICAgICB1bmtub3duS2V5czogXCJzdHJpY3RcIixcbiAgICAgICAgY2F0Y2hhbGw6IFpvZE5ldmVyLmNyZWF0ZSgpLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZE9iamVjdCxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcblpvZE9iamVjdC5sYXp5Y3JlYXRlID0gKHNoYXBlLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZE9iamVjdCh7XG4gICAgICAgIHNoYXBlLFxuICAgICAgICB1bmtub3duS2V5czogXCJzdHJpcFwiLFxuICAgICAgICBjYXRjaGFsbDogWm9kTmV2ZXIuY3JlYXRlKCksXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kT2JqZWN0LFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZFVuaW9uIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBjb25zdCBvcHRpb25zID0gdGhpcy5fZGVmLm9wdGlvbnM7XG4gICAgICAgIGZ1bmN0aW9uIGhhbmRsZVJlc3VsdHMocmVzdWx0cykge1xuICAgICAgICAgICAgLy8gcmV0dXJuIGZpcnN0IGlzc3VlLWZyZWUgdmFsaWRhdGlvbiBpZiBpdCBleGlzdHNcbiAgICAgICAgICAgIGZvciAoY29uc3QgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnJlc3VsdC5zdGF0dXMgPT09IFwidmFsaWRcIikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0LnJlc3VsdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5yZXN1bHQuc3RhdHVzID09PSBcImRpcnR5XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gYWRkIGlzc3VlcyBmcm9tIGRpcnR5IG9wdGlvblxuICAgICAgICAgICAgICAgICAgICBjdHguY29tbW9uLmlzc3Vlcy5wdXNoKC4uLnJlc3VsdC5jdHguY29tbW9uLmlzc3Vlcyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQucmVzdWx0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHJldHVybiBpbnZhbGlkXG4gICAgICAgICAgICBjb25zdCB1bmlvbkVycm9ycyA9IHJlc3VsdHMubWFwKChyZXN1bHQpID0+IG5ldyBab2RFcnJvcihyZXN1bHQuY3R4LmNvbW1vbi5pc3N1ZXMpKTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3VuaW9uLFxuICAgICAgICAgICAgICAgIHVuaW9uRXJyb3JzLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY3R4LmNvbW1vbi5hc3luYykge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKG9wdGlvbnMubWFwKGFzeW5jIChvcHRpb24pID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjaGlsZEN0eCA9IHtcbiAgICAgICAgICAgICAgICAgICAgLi4uY3R4LFxuICAgICAgICAgICAgICAgICAgICBjb21tb246IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC4uLmN0eC5jb21tb24sXG4gICAgICAgICAgICAgICAgICAgICAgICBpc3N1ZXM6IFtdLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IG51bGwsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQ6IGF3YWl0IG9wdGlvbi5fcGFyc2VBc3luYyh7XG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBjaGlsZEN0eCxcbiAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgICAgIGN0eDogY2hpbGRDdHgsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pKS50aGVuKGhhbmRsZVJlc3VsdHMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgbGV0IGRpcnR5ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgY29uc3QgaXNzdWVzID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IG9wdGlvbiBvZiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY2hpbGRDdHggPSB7XG4gICAgICAgICAgICAgICAgICAgIC4uLmN0eCxcbiAgICAgICAgICAgICAgICAgICAgY29tbW9uOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAuLi5jdHguY29tbW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNzdWVzOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBudWxsLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gb3B0aW9uLl9wYXJzZVN5bmMoe1xuICAgICAgICAgICAgICAgICAgICBkYXRhOiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogY2hpbGRDdHgsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5zdGF0dXMgPT09IFwidmFsaWRcIikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChyZXN1bHQuc3RhdHVzID09PSBcImRpcnR5XCIgJiYgIWRpcnR5KSB7XG4gICAgICAgICAgICAgICAgICAgIGRpcnR5ID0geyByZXN1bHQsIGN0eDogY2hpbGRDdHggfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGNoaWxkQ3R4LmNvbW1vbi5pc3N1ZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGlzc3Vlcy5wdXNoKGNoaWxkQ3R4LmNvbW1vbi5pc3N1ZXMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkaXJ0eSkge1xuICAgICAgICAgICAgICAgIGN0eC5jb21tb24uaXNzdWVzLnB1c2goLi4uZGlydHkuY3R4LmNvbW1vbi5pc3N1ZXMpO1xuICAgICAgICAgICAgICAgIHJldHVybiBkaXJ0eS5yZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB1bmlvbkVycm9ycyA9IGlzc3Vlcy5tYXAoKGlzc3VlcykgPT4gbmV3IFpvZEVycm9yKGlzc3VlcykpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdW5pb24sXG4gICAgICAgICAgICAgICAgdW5pb25FcnJvcnMsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgfVxuICAgIGdldCBvcHRpb25zKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLm9wdGlvbnM7XG4gICAgfVxufVxuWm9kVW5pb24uY3JlYXRlID0gKHR5cGVzLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZFVuaW9uKHtcbiAgICAgICAgb3B0aW9uczogdHlwZXMsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kVW5pb24sXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vLy8vLy8vLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLy8vLy8vLy8vXG4vLy8vLy8vLy8vICAgICAgWm9kRGlzY3JpbWluYXRlZFVuaW9uICAgICAgLy8vLy8vLy8vL1xuLy8vLy8vLy8vLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vLy8vLy8vLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuY29uc3QgZ2V0RGlzY3JpbWluYXRvciA9ICh0eXBlKSA9PiB7XG4gICAgaWYgKHR5cGUgaW5zdGFuY2VvZiBab2RMYXp5KSB7XG4gICAgICAgIHJldHVybiBnZXREaXNjcmltaW5hdG9yKHR5cGUuc2NoZW1hKTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZSBpbnN0YW5jZW9mIFpvZEVmZmVjdHMpIHtcbiAgICAgICAgcmV0dXJuIGdldERpc2NyaW1pbmF0b3IodHlwZS5pbm5lclR5cGUoKSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGUgaW5zdGFuY2VvZiBab2RMaXRlcmFsKSB7XG4gICAgICAgIHJldHVybiBbdHlwZS52YWx1ZV07XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGUgaW5zdGFuY2VvZiBab2RFbnVtKSB7XG4gICAgICAgIHJldHVybiB0eXBlLm9wdGlvbnM7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGUgaW5zdGFuY2VvZiBab2ROYXRpdmVFbnVtKSB7XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBiYW4vYmFuXG4gICAgICAgIHJldHVybiB1dGlsLm9iamVjdFZhbHVlcyh0eXBlLmVudW0pO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlIGluc3RhbmNlb2YgWm9kRGVmYXVsdCkge1xuICAgICAgICByZXR1cm4gZ2V0RGlzY3JpbWluYXRvcih0eXBlLl9kZWYuaW5uZXJUeXBlKTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZSBpbnN0YW5jZW9mIFpvZFVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gW3VuZGVmaW5lZF07XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGUgaW5zdGFuY2VvZiBab2ROdWxsKSB7XG4gICAgICAgIHJldHVybiBbbnVsbF07XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGUgaW5zdGFuY2VvZiBab2RPcHRpb25hbCkge1xuICAgICAgICByZXR1cm4gW3VuZGVmaW5lZCwgLi4uZ2V0RGlzY3JpbWluYXRvcih0eXBlLnVud3JhcCgpKV07XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGUgaW5zdGFuY2VvZiBab2ROdWxsYWJsZSkge1xuICAgICAgICByZXR1cm4gW251bGwsIC4uLmdldERpc2NyaW1pbmF0b3IodHlwZS51bndyYXAoKSldO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlIGluc3RhbmNlb2YgWm9kQnJhbmRlZCkge1xuICAgICAgICByZXR1cm4gZ2V0RGlzY3JpbWluYXRvcih0eXBlLnVud3JhcCgpKTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZSBpbnN0YW5jZW9mIFpvZFJlYWRvbmx5KSB7XG4gICAgICAgIHJldHVybiBnZXREaXNjcmltaW5hdG9yKHR5cGUudW53cmFwKCkpO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlIGluc3RhbmNlb2YgWm9kQ2F0Y2gpIHtcbiAgICAgICAgcmV0dXJuIGdldERpc2NyaW1pbmF0b3IodHlwZS5fZGVmLmlubmVyVHlwZSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxufTtcbmV4cG9ydCBjbGFzcyBab2REaXNjcmltaW5hdGVkVW5pb24gZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGlmIChjdHgucGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5vYmplY3QpIHtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUub2JqZWN0LFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZGlzY3JpbWluYXRvciA9IHRoaXMuZGlzY3JpbWluYXRvcjtcbiAgICAgICAgY29uc3QgZGlzY3JpbWluYXRvclZhbHVlID0gY3R4LmRhdGFbZGlzY3JpbWluYXRvcl07XG4gICAgICAgIGNvbnN0IG9wdGlvbiA9IHRoaXMub3B0aW9uc01hcC5nZXQoZGlzY3JpbWluYXRvclZhbHVlKTtcbiAgICAgICAgaWYgKCFvcHRpb24pIHtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3VuaW9uX2Rpc2NyaW1pbmF0b3IsXG4gICAgICAgICAgICAgICAgb3B0aW9uczogQXJyYXkuZnJvbSh0aGlzLm9wdGlvbnNNYXAua2V5cygpKSxcbiAgICAgICAgICAgICAgICBwYXRoOiBbZGlzY3JpbWluYXRvcl0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjdHguY29tbW9uLmFzeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gb3B0aW9uLl9wYXJzZUFzeW5jKHtcbiAgICAgICAgICAgICAgICBkYXRhOiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG9wdGlvbi5fcGFyc2VTeW5jKHtcbiAgICAgICAgICAgICAgICBkYXRhOiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIGdldCBkaXNjcmltaW5hdG9yKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLmRpc2NyaW1pbmF0b3I7XG4gICAgfVxuICAgIGdldCBvcHRpb25zKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLm9wdGlvbnM7XG4gICAgfVxuICAgIGdldCBvcHRpb25zTWFwKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLm9wdGlvbnNNYXA7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFRoZSBjb25zdHJ1Y3RvciBvZiB0aGUgZGlzY3JpbWluYXRlZCB1bmlvbiBzY2hlbWEuIEl0cyBiZWhhdmlvdXIgaXMgdmVyeSBzaW1pbGFyIHRvIHRoYXQgb2YgdGhlIG5vcm1hbCB6LnVuaW9uKCkgY29uc3RydWN0b3IuXG4gICAgICogSG93ZXZlciwgaXQgb25seSBhbGxvd3MgYSB1bmlvbiBvZiBvYmplY3RzLCBhbGwgb2Ygd2hpY2ggbmVlZCB0byBzaGFyZSBhIGRpc2NyaW1pbmF0b3IgcHJvcGVydHkuIFRoaXMgcHJvcGVydHkgbXVzdFxuICAgICAqIGhhdmUgYSBkaWZmZXJlbnQgdmFsdWUgZm9yIGVhY2ggb2JqZWN0IGluIHRoZSB1bmlvbi5cbiAgICAgKiBAcGFyYW0gZGlzY3JpbWluYXRvciB0aGUgbmFtZSBvZiB0aGUgZGlzY3JpbWluYXRvciBwcm9wZXJ0eVxuICAgICAqIEBwYXJhbSB0eXBlcyBhbiBhcnJheSBvZiBvYmplY3Qgc2NoZW1hc1xuICAgICAqIEBwYXJhbSBwYXJhbXNcbiAgICAgKi9cbiAgICBzdGF0aWMgY3JlYXRlKGRpc2NyaW1pbmF0b3IsIG9wdGlvbnMsIHBhcmFtcykge1xuICAgICAgICAvLyBHZXQgYWxsIHRoZSB2YWxpZCBkaXNjcmltaW5hdG9yIHZhbHVlc1xuICAgICAgICBjb25zdCBvcHRpb25zTWFwID0gbmV3IE1hcCgpO1xuICAgICAgICAvLyB0cnkge1xuICAgICAgICBmb3IgKGNvbnN0IHR5cGUgb2Ygb3B0aW9ucykge1xuICAgICAgICAgICAgY29uc3QgZGlzY3JpbWluYXRvclZhbHVlcyA9IGdldERpc2NyaW1pbmF0b3IodHlwZS5zaGFwZVtkaXNjcmltaW5hdG9yXSk7XG4gICAgICAgICAgICBpZiAoIWRpc2NyaW1pbmF0b3JWYWx1ZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBIGRpc2NyaW1pbmF0b3IgdmFsdWUgZm9yIGtleSBcXGAke2Rpc2NyaW1pbmF0b3J9XFxgIGNvdWxkIG5vdCBiZSBleHRyYWN0ZWQgZnJvbSBhbGwgc2NoZW1hIG9wdGlvbnNgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoY29uc3QgdmFsdWUgb2YgZGlzY3JpbWluYXRvclZhbHVlcykge1xuICAgICAgICAgICAgICAgIGlmIChvcHRpb25zTWFwLmhhcyh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBEaXNjcmltaW5hdG9yIHByb3BlcnR5ICR7U3RyaW5nKGRpc2NyaW1pbmF0b3IpfSBoYXMgZHVwbGljYXRlIHZhbHVlICR7U3RyaW5nKHZhbHVlKX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgb3B0aW9uc01hcC5zZXQodmFsdWUsIHR5cGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgWm9kRGlzY3JpbWluYXRlZFVuaW9uKHtcbiAgICAgICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kRGlzY3JpbWluYXRlZFVuaW9uLFxuICAgICAgICAgICAgZGlzY3JpbWluYXRvcixcbiAgICAgICAgICAgIG9wdGlvbnMsXG4gICAgICAgICAgICBvcHRpb25zTWFwLFxuICAgICAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgICAgICB9KTtcbiAgICB9XG59XG5mdW5jdGlvbiBtZXJnZVZhbHVlcyhhLCBiKSB7XG4gICAgY29uc3QgYVR5cGUgPSBnZXRQYXJzZWRUeXBlKGEpO1xuICAgIGNvbnN0IGJUeXBlID0gZ2V0UGFyc2VkVHlwZShiKTtcbiAgICBpZiAoYSA9PT0gYikge1xuICAgICAgICByZXR1cm4geyB2YWxpZDogdHJ1ZSwgZGF0YTogYSB9O1xuICAgIH1cbiAgICBlbHNlIGlmIChhVHlwZSA9PT0gWm9kUGFyc2VkVHlwZS5vYmplY3QgJiYgYlR5cGUgPT09IFpvZFBhcnNlZFR5cGUub2JqZWN0KSB7XG4gICAgICAgIGNvbnN0IGJLZXlzID0gdXRpbC5vYmplY3RLZXlzKGIpO1xuICAgICAgICBjb25zdCBzaGFyZWRLZXlzID0gdXRpbC5vYmplY3RLZXlzKGEpLmZpbHRlcigoa2V5KSA9PiBiS2V5cy5pbmRleE9mKGtleSkgIT09IC0xKTtcbiAgICAgICAgY29uc3QgbmV3T2JqID0geyAuLi5hLCAuLi5iIH07XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIHNoYXJlZEtleXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHNoYXJlZFZhbHVlID0gbWVyZ2VWYWx1ZXMoYVtrZXldLCBiW2tleV0pO1xuICAgICAgICAgICAgaWYgKCFzaGFyZWRWYWx1ZS52YWxpZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHZhbGlkOiBmYWxzZSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbmV3T2JqW2tleV0gPSBzaGFyZWRWYWx1ZS5kYXRhO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHZhbGlkOiB0cnVlLCBkYXRhOiBuZXdPYmogfTtcbiAgICB9XG4gICAgZWxzZSBpZiAoYVR5cGUgPT09IFpvZFBhcnNlZFR5cGUuYXJyYXkgJiYgYlR5cGUgPT09IFpvZFBhcnNlZFR5cGUuYXJyYXkpIHtcbiAgICAgICAgaWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgdmFsaWQ6IGZhbHNlIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbmV3QXJyYXkgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGEubGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgICAgICBjb25zdCBpdGVtQSA9IGFbaW5kZXhdO1xuICAgICAgICAgICAgY29uc3QgaXRlbUIgPSBiW2luZGV4XTtcbiAgICAgICAgICAgIGNvbnN0IHNoYXJlZFZhbHVlID0gbWVyZ2VWYWx1ZXMoaXRlbUEsIGl0ZW1CKTtcbiAgICAgICAgICAgIGlmICghc2hhcmVkVmFsdWUudmFsaWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyB2YWxpZDogZmFsc2UgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG5ld0FycmF5LnB1c2goc2hhcmVkVmFsdWUuZGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgdmFsaWQ6IHRydWUsIGRhdGE6IG5ld0FycmF5IH07XG4gICAgfVxuICAgIGVsc2UgaWYgKGFUeXBlID09PSBab2RQYXJzZWRUeXBlLmRhdGUgJiYgYlR5cGUgPT09IFpvZFBhcnNlZFR5cGUuZGF0ZSAmJiArYSA9PT0gK2IpIHtcbiAgICAgICAgcmV0dXJuIHsgdmFsaWQ6IHRydWUsIGRhdGE6IGEgfTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJldHVybiB7IHZhbGlkOiBmYWxzZSB9O1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBab2RJbnRlcnNlY3Rpb24gZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBzdGF0dXMsIGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgY29uc3QgaGFuZGxlUGFyc2VkID0gKHBhcnNlZExlZnQsIHBhcnNlZFJpZ2h0KSA9PiB7XG4gICAgICAgICAgICBpZiAoaXNBYm9ydGVkKHBhcnNlZExlZnQpIHx8IGlzQWJvcnRlZChwYXJzZWRSaWdodCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IG1lcmdlZCA9IG1lcmdlVmFsdWVzKHBhcnNlZExlZnQudmFsdWUsIHBhcnNlZFJpZ2h0LnZhbHVlKTtcbiAgICAgICAgICAgIGlmICghbWVyZ2VkLnZhbGlkKSB7XG4gICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX2ludGVyc2VjdGlvbl90eXBlcyxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpc0RpcnR5KHBhcnNlZExlZnQpIHx8IGlzRGlydHkocGFyc2VkUmlnaHQpKSB7XG4gICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4geyBzdGF0dXM6IHN0YXR1cy52YWx1ZSwgdmFsdWU6IG1lcmdlZC5kYXRhIH07XG4gICAgICAgIH07XG4gICAgICAgIGlmIChjdHguY29tbW9uLmFzeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgICAgIHRoaXMuX2RlZi5sZWZ0Ll9wYXJzZUFzeW5jKHtcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICB0aGlzLl9kZWYucmlnaHQuX3BhcnNlQXN5bmMoe1xuICAgICAgICAgICAgICAgICAgICBkYXRhOiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgXSkudGhlbigoW2xlZnQsIHJpZ2h0XSkgPT4gaGFuZGxlUGFyc2VkKGxlZnQsIHJpZ2h0KSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gaGFuZGxlUGFyc2VkKHRoaXMuX2RlZi5sZWZ0Ll9wYXJzZVN5bmMoe1xuICAgICAgICAgICAgICAgIGRhdGE6IGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICAgICAgfSksIHRoaXMuX2RlZi5yaWdodC5fcGFyc2VTeW5jKHtcbiAgICAgICAgICAgICAgICBkYXRhOiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblpvZEludGVyc2VjdGlvbi5jcmVhdGUgPSAobGVmdCwgcmlnaHQsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kSW50ZXJzZWN0aW9uKHtcbiAgICAgICAgbGVmdDogbGVmdCxcbiAgICAgICAgcmlnaHQ6IHJpZ2h0LFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZEludGVyc2VjdGlvbixcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbi8vIHR5cGUgWm9kVHVwbGVJdGVtcyA9IFtab2RUeXBlQW55LCAuLi5ab2RUeXBlQW55W11dO1xuZXhwb3J0IGNsYXNzIFpvZFR1cGxlIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgc3RhdHVzLCBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGlmIChjdHgucGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5hcnJheSkge1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5hcnJheSxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjdHguZGF0YS5sZW5ndGggPCB0aGlzLl9kZWYuaXRlbXMubGVuZ3RoKSB7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX3NtYWxsLFxuICAgICAgICAgICAgICAgIG1pbmltdW06IHRoaXMuX2RlZi5pdGVtcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgICAgIGV4YWN0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICB0eXBlOiBcImFycmF5XCIsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3QgPSB0aGlzLl9kZWYucmVzdDtcbiAgICAgICAgaWYgKCFyZXN0ICYmIGN0eC5kYXRhLmxlbmd0aCA+IHRoaXMuX2RlZi5pdGVtcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fYmlnLFxuICAgICAgICAgICAgICAgIG1heGltdW06IHRoaXMuX2RlZi5pdGVtcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgICAgIGV4YWN0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICB0eXBlOiBcImFycmF5XCIsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGl0ZW1zID0gWy4uLmN0eC5kYXRhXVxuICAgICAgICAgICAgLm1hcCgoaXRlbSwgaXRlbUluZGV4KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzY2hlbWEgPSB0aGlzLl9kZWYuaXRlbXNbaXRlbUluZGV4XSB8fCB0aGlzLl9kZWYucmVzdDtcbiAgICAgICAgICAgIGlmICghc2NoZW1hKVxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgcmV0dXJuIHNjaGVtYS5fcGFyc2UobmV3IFBhcnNlSW5wdXRMYXp5UGF0aChjdHgsIGl0ZW0sIGN0eC5wYXRoLCBpdGVtSW5kZXgpKTtcbiAgICAgICAgfSlcbiAgICAgICAgICAgIC5maWx0ZXIoKHgpID0+ICEheCk7IC8vIGZpbHRlciBudWxsc1xuICAgICAgICBpZiAoY3R4LmNvbW1vbi5hc3luYykge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKGl0ZW1zKS50aGVuKChyZXN1bHRzKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFBhcnNlU3RhdHVzLm1lcmdlQXJyYXkoc3RhdHVzLCByZXN1bHRzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIFBhcnNlU3RhdHVzLm1lcmdlQXJyYXkoc3RhdHVzLCBpdGVtcyk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0IGl0ZW1zKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLml0ZW1zO1xuICAgIH1cbiAgICByZXN0KHJlc3QpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RUdXBsZSh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICByZXN0LFxuICAgICAgICB9KTtcbiAgICB9XG59XG5ab2RUdXBsZS5jcmVhdGUgPSAoc2NoZW1hcywgcGFyYW1zKSA9PiB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHNjaGVtYXMpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIllvdSBtdXN0IHBhc3MgYW4gYXJyYXkgb2Ygc2NoZW1hcyB0byB6LnR1cGxlKFsgLi4uIF0pXCIpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IFpvZFR1cGxlKHtcbiAgICAgICAgaXRlbXM6IHNjaGVtYXMsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kVHVwbGUsXG4gICAgICAgIHJlc3Q6IG51bGwsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kUmVjb3JkIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgZ2V0IGtleVNjaGVtYSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5rZXlUeXBlO1xuICAgIH1cbiAgICBnZXQgdmFsdWVTY2hlbWEoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYudmFsdWVUeXBlO1xuICAgIH1cbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBzdGF0dXMsIGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgaWYgKGN0eC5wYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLm9iamVjdCkge1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5vYmplY3QsXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYWlycyA9IFtdO1xuICAgICAgICBjb25zdCBrZXlUeXBlID0gdGhpcy5fZGVmLmtleVR5cGU7XG4gICAgICAgIGNvbnN0IHZhbHVlVHlwZSA9IHRoaXMuX2RlZi52YWx1ZVR5cGU7XG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIGN0eC5kYXRhKSB7XG4gICAgICAgICAgICBwYWlycy5wdXNoKHtcbiAgICAgICAgICAgICAgICBrZXk6IGtleVR5cGUuX3BhcnNlKG5ldyBQYXJzZUlucHV0TGF6eVBhdGgoY3R4LCBrZXksIGN0eC5wYXRoLCBrZXkpKSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogdmFsdWVUeXBlLl9wYXJzZShuZXcgUGFyc2VJbnB1dExhenlQYXRoKGN0eCwgY3R4LmRhdGFba2V5XSwgY3R4LnBhdGgsIGtleSkpLFxuICAgICAgICAgICAgICAgIGFsd2F5c1NldDoga2V5IGluIGN0eC5kYXRhLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGN0eC5jb21tb24uYXN5bmMpIHtcbiAgICAgICAgICAgIHJldHVybiBQYXJzZVN0YXR1cy5tZXJnZU9iamVjdEFzeW5jKHN0YXR1cywgcGFpcnMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIFBhcnNlU3RhdHVzLm1lcmdlT2JqZWN0U3luYyhzdGF0dXMsIHBhaXJzKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBnZXQgZWxlbWVudCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi52YWx1ZVR5cGU7XG4gICAgfVxuICAgIHN0YXRpYyBjcmVhdGUoZmlyc3QsIHNlY29uZCwgdGhpcmQpIHtcbiAgICAgICAgaWYgKHNlY29uZCBpbnN0YW5jZW9mIFpvZFR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgWm9kUmVjb3JkKHtcbiAgICAgICAgICAgICAgICBrZXlUeXBlOiBmaXJzdCxcbiAgICAgICAgICAgICAgICB2YWx1ZVR5cGU6IHNlY29uZCxcbiAgICAgICAgICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZFJlY29yZCxcbiAgICAgICAgICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHRoaXJkKSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgWm9kUmVjb3JkKHtcbiAgICAgICAgICAgIGtleVR5cGU6IFpvZFN0cmluZy5jcmVhdGUoKSxcbiAgICAgICAgICAgIHZhbHVlVHlwZTogZmlyc3QsXG4gICAgICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZFJlY29yZCxcbiAgICAgICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMoc2Vjb25kKSxcbiAgICAgICAgfSk7XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFpvZE1hcCBleHRlbmRzIFpvZFR5cGUge1xuICAgIGdldCBrZXlTY2hlbWEoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYua2V5VHlwZTtcbiAgICB9XG4gICAgZ2V0IHZhbHVlU2NoZW1hKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnZhbHVlVHlwZTtcbiAgICB9XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgc3RhdHVzLCBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGlmIChjdHgucGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5tYXApIHtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUubWFwLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qga2V5VHlwZSA9IHRoaXMuX2RlZi5rZXlUeXBlO1xuICAgICAgICBjb25zdCB2YWx1ZVR5cGUgPSB0aGlzLl9kZWYudmFsdWVUeXBlO1xuICAgICAgICBjb25zdCBwYWlycyA9IFsuLi5jdHguZGF0YS5lbnRyaWVzKCldLm1hcCgoW2tleSwgdmFsdWVdLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBrZXk6IGtleVR5cGUuX3BhcnNlKG5ldyBQYXJzZUlucHV0TGF6eVBhdGgoY3R4LCBrZXksIGN0eC5wYXRoLCBbaW5kZXgsIFwia2V5XCJdKSksXG4gICAgICAgICAgICAgICAgdmFsdWU6IHZhbHVlVHlwZS5fcGFyc2UobmV3IFBhcnNlSW5wdXRMYXp5UGF0aChjdHgsIHZhbHVlLCBjdHgucGF0aCwgW2luZGV4LCBcInZhbHVlXCJdKSksXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgICAgaWYgKGN0eC5jb21tb24uYXN5bmMpIHtcbiAgICAgICAgICAgIGNvbnN0IGZpbmFsTWFwID0gbmV3IE1hcCgpO1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcGFpciBvZiBwYWlycykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSBhd2FpdCBwYWlyLmtleTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBhd2FpdCBwYWlyLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBpZiAoa2V5LnN0YXR1cyA9PT0gXCJhYm9ydGVkXCIgfHwgdmFsdWUuc3RhdHVzID09PSBcImFib3J0ZWRcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKGtleS5zdGF0dXMgPT09IFwiZGlydHlcIiB8fCB2YWx1ZS5zdGF0dXMgPT09IFwiZGlydHlcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZmluYWxNYXAuc2V0KGtleS52YWx1ZSwgdmFsdWUudmFsdWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdGF0dXM6IHN0YXR1cy52YWx1ZSwgdmFsdWU6IGZpbmFsTWFwIH07XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGZpbmFsTWFwID0gbmV3IE1hcCgpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBwYWlyIG9mIHBhaXJzKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gcGFpci5rZXk7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBwYWlyLnZhbHVlO1xuICAgICAgICAgICAgICAgIGlmIChrZXkuc3RhdHVzID09PSBcImFib3J0ZWRcIiB8fCB2YWx1ZS5zdGF0dXMgPT09IFwiYWJvcnRlZFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoa2V5LnN0YXR1cyA9PT0gXCJkaXJ0eVwiIHx8IHZhbHVlLnN0YXR1cyA9PT0gXCJkaXJ0eVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmaW5hbE1hcC5zZXQoa2V5LnZhbHVlLCB2YWx1ZS52YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4geyBzdGF0dXM6IHN0YXR1cy52YWx1ZSwgdmFsdWU6IGZpbmFsTWFwIH07XG4gICAgICAgIH1cbiAgICB9XG59XG5ab2RNYXAuY3JlYXRlID0gKGtleVR5cGUsIHZhbHVlVHlwZSwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RNYXAoe1xuICAgICAgICB2YWx1ZVR5cGUsXG4gICAgICAgIGtleVR5cGUsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kTWFwLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZFNldCBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IHN0YXR1cywgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBpZiAoY3R4LnBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUuc2V0KSB7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLnNldCxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGRlZiA9IHRoaXMuX2RlZjtcbiAgICAgICAgaWYgKGRlZi5taW5TaXplICE9PSBudWxsKSB7XG4gICAgICAgICAgICBpZiAoY3R4LmRhdGEuc2l6ZSA8IGRlZi5taW5TaXplLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fc21hbGwsXG4gICAgICAgICAgICAgICAgICAgIG1pbmltdW06IGRlZi5taW5TaXplLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcInNldFwiLFxuICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGV4YWN0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogZGVmLm1pblNpemUubWVzc2FnZSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoZGVmLm1heFNpemUgIT09IG51bGwpIHtcbiAgICAgICAgICAgIGlmIChjdHguZGF0YS5zaXplID4gZGVmLm1heFNpemUudmFsdWUpIHtcbiAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19iaWcsXG4gICAgICAgICAgICAgICAgICAgIG1heGltdW06IGRlZi5tYXhTaXplLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcInNldFwiLFxuICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGV4YWN0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogZGVmLm1heFNpemUubWVzc2FnZSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCB2YWx1ZVR5cGUgPSB0aGlzLl9kZWYudmFsdWVUeXBlO1xuICAgICAgICBmdW5jdGlvbiBmaW5hbGl6ZVNldChlbGVtZW50cykge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkU2V0ID0gbmV3IFNldCgpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVsZW1lbnQuc3RhdHVzID09PSBcImFib3J0ZWRcIilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICAgICAgaWYgKGVsZW1lbnQuc3RhdHVzID09PSBcImRpcnR5XCIpXG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIHBhcnNlZFNldC5hZGQoZWxlbWVudC52YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4geyBzdGF0dXM6IHN0YXR1cy52YWx1ZSwgdmFsdWU6IHBhcnNlZFNldCB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGVsZW1lbnRzID0gWy4uLmN0eC5kYXRhLnZhbHVlcygpXS5tYXAoKGl0ZW0sIGkpID0+IHZhbHVlVHlwZS5fcGFyc2UobmV3IFBhcnNlSW5wdXRMYXp5UGF0aChjdHgsIGl0ZW0sIGN0eC5wYXRoLCBpKSkpO1xuICAgICAgICBpZiAoY3R4LmNvbW1vbi5hc3luYykge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKGVsZW1lbnRzKS50aGVuKChlbGVtZW50cykgPT4gZmluYWxpemVTZXQoZWxlbWVudHMpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBmaW5hbGl6ZVNldChlbGVtZW50cyk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgbWluKG1pblNpemUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RTZXQoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgbWluU2l6ZTogeyB2YWx1ZTogbWluU2l6ZSwgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpIH0sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBtYXgobWF4U2l6ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZFNldCh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBtYXhTaXplOiB7IHZhbHVlOiBtYXhTaXplLCBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSkgfSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHNpemUoc2l6ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5taW4oc2l6ZSwgbWVzc2FnZSkubWF4KHNpemUsIG1lc3NhZ2UpO1xuICAgIH1cbiAgICBub25lbXB0eShtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm1pbigxLCBtZXNzYWdlKTtcbiAgICB9XG59XG5ab2RTZXQuY3JlYXRlID0gKHZhbHVlVHlwZSwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RTZXQoe1xuICAgICAgICB2YWx1ZVR5cGUsXG4gICAgICAgIG1pblNpemU6IG51bGwsXG4gICAgICAgIG1heFNpemU6IG51bGwsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kU2V0LFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZEZ1bmN0aW9uIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHN1cGVyKC4uLmFyZ3VtZW50cyk7XG4gICAgICAgIHRoaXMudmFsaWRhdGUgPSB0aGlzLmltcGxlbWVudDtcbiAgICB9XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBpZiAoY3R4LnBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUuZnVuY3Rpb24pIHtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUuZnVuY3Rpb24sXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBtYWtlQXJnc0lzc3VlKGFyZ3MsIGVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4gbWFrZUlzc3VlKHtcbiAgICAgICAgICAgICAgICBkYXRhOiBhcmdzLFxuICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgIGVycm9yTWFwczogW2N0eC5jb21tb24uY29udGV4dHVhbEVycm9yTWFwLCBjdHguc2NoZW1hRXJyb3JNYXAsIGdldEVycm9yTWFwKCksIGRlZmF1bHRFcnJvck1hcF0uZmlsdGVyKCh4KSA9PiAhIXgpLFxuICAgICAgICAgICAgICAgIGlzc3VlRGF0YToge1xuICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9hcmd1bWVudHMsXG4gICAgICAgICAgICAgICAgICAgIGFyZ3VtZW50c0Vycm9yOiBlcnJvcixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gbWFrZVJldHVybnNJc3N1ZShyZXR1cm5zLCBlcnJvcikge1xuICAgICAgICAgICAgcmV0dXJuIG1ha2VJc3N1ZSh7XG4gICAgICAgICAgICAgICAgZGF0YTogcmV0dXJucyxcbiAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICBlcnJvck1hcHM6IFtjdHguY29tbW9uLmNvbnRleHR1YWxFcnJvck1hcCwgY3R4LnNjaGVtYUVycm9yTWFwLCBnZXRFcnJvck1hcCgpLCBkZWZhdWx0RXJyb3JNYXBdLmZpbHRlcigoeCkgPT4gISF4KSxcbiAgICAgICAgICAgICAgICBpc3N1ZURhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfcmV0dXJuX3R5cGUsXG4gICAgICAgICAgICAgICAgICAgIHJldHVyblR5cGVFcnJvcjogZXJyb3IsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHsgZXJyb3JNYXA6IGN0eC5jb21tb24uY29udGV4dHVhbEVycm9yTWFwIH07XG4gICAgICAgIGNvbnN0IGZuID0gY3R4LmRhdGE7XG4gICAgICAgIGlmICh0aGlzLl9kZWYucmV0dXJucyBpbnN0YW5jZW9mIFpvZFByb21pc2UpIHtcbiAgICAgICAgICAgIC8vIFdvdWxkIGxvdmUgYSB3YXkgdG8gYXZvaWQgZGlzYWJsaW5nIHRoaXMgcnVsZSwgYnV0IHdlIG5lZWRcbiAgICAgICAgICAgIC8vIGFuIGFsaWFzICh1c2luZyBhbiBhcnJvdyBmdW5jdGlvbiB3YXMgd2hhdCBjYXVzZWQgMjY1MSkuXG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXRoaXMtYWxpYXNcbiAgICAgICAgICAgIGNvbnN0IG1lID0gdGhpcztcbiAgICAgICAgICAgIHJldHVybiBPSyhhc3luYyBmdW5jdGlvbiAoLi4uYXJncykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVycm9yID0gbmV3IFpvZEVycm9yKFtdKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJzZWRBcmdzID0gYXdhaXQgbWUuX2RlZi5hcmdzLnBhcnNlQXN5bmMoYXJncywgcGFyYW1zKS5jYXRjaCgoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBlcnJvci5hZGRJc3N1ZShtYWtlQXJnc0lzc3VlKGFyZ3MsIGUpKTtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgUmVmbGVjdC5hcHBseShmbiwgdGhpcywgcGFyc2VkQXJncyk7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkUmV0dXJucyA9IGF3YWl0IG1lLl9kZWYucmV0dXJucy5fZGVmLnR5cGVcbiAgICAgICAgICAgICAgICAgICAgLnBhcnNlQXN5bmMocmVzdWx0LCBwYXJhbXMpXG4gICAgICAgICAgICAgICAgICAgIC5jYXRjaCgoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBlcnJvci5hZGRJc3N1ZShtYWtlUmV0dXJuc0lzc3VlKHJlc3VsdCwgZSkpO1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcGFyc2VkUmV0dXJucztcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgLy8gV291bGQgbG92ZSBhIHdheSB0byBhdm9pZCBkaXNhYmxpbmcgdGhpcyBydWxlLCBidXQgd2UgbmVlZFxuICAgICAgICAgICAgLy8gYW4gYWxpYXMgKHVzaW5nIGFuIGFycm93IGZ1bmN0aW9uIHdhcyB3aGF0IGNhdXNlZCAyNjUxKS5cbiAgICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdGhpcy1hbGlhc1xuICAgICAgICAgICAgY29uc3QgbWUgPSB0aGlzO1xuICAgICAgICAgICAgcmV0dXJuIE9LKGZ1bmN0aW9uICguLi5hcmdzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkQXJncyA9IG1lLl9kZWYuYXJncy5zYWZlUGFyc2UoYXJncywgcGFyYW1zKTtcbiAgICAgICAgICAgICAgICBpZiAoIXBhcnNlZEFyZ3Muc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgWm9kRXJyb3IoW21ha2VBcmdzSXNzdWUoYXJncywgcGFyc2VkQXJncy5lcnJvcildKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gUmVmbGVjdC5hcHBseShmbiwgdGhpcywgcGFyc2VkQXJncy5kYXRhKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJzZWRSZXR1cm5zID0gbWUuX2RlZi5yZXR1cm5zLnNhZmVQYXJzZShyZXN1bHQsIHBhcmFtcyk7XG4gICAgICAgICAgICAgICAgaWYgKCFwYXJzZWRSZXR1cm5zLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFpvZEVycm9yKFttYWtlUmV0dXJuc0lzc3VlKHJlc3VsdCwgcGFyc2VkUmV0dXJucy5lcnJvcildKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlZFJldHVybnMuZGF0YTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIHBhcmFtZXRlcnMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuYXJncztcbiAgICB9XG4gICAgcmV0dXJuVHlwZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5yZXR1cm5zO1xuICAgIH1cbiAgICBhcmdzKC4uLml0ZW1zKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kRnVuY3Rpb24oe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgYXJnczogWm9kVHVwbGUuY3JlYXRlKGl0ZW1zKS5yZXN0KFpvZFVua25vd24uY3JlYXRlKCkpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJucyhyZXR1cm5UeXBlKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kRnVuY3Rpb24oe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgcmV0dXJuczogcmV0dXJuVHlwZSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGltcGxlbWVudChmdW5jKSB7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRlZEZ1bmMgPSB0aGlzLnBhcnNlKGZ1bmMpO1xuICAgICAgICByZXR1cm4gdmFsaWRhdGVkRnVuYztcbiAgICB9XG4gICAgc3RyaWN0SW1wbGVtZW50KGZ1bmMpIHtcbiAgICAgICAgY29uc3QgdmFsaWRhdGVkRnVuYyA9IHRoaXMucGFyc2UoZnVuYyk7XG4gICAgICAgIHJldHVybiB2YWxpZGF0ZWRGdW5jO1xuICAgIH1cbiAgICBzdGF0aWMgY3JlYXRlKGFyZ3MsIHJldHVybnMsIHBhcmFtcykge1xuICAgICAgICByZXR1cm4gbmV3IFpvZEZ1bmN0aW9uKHtcbiAgICAgICAgICAgIGFyZ3M6IChhcmdzID8gYXJncyA6IFpvZFR1cGxlLmNyZWF0ZShbXSkucmVzdChab2RVbmtub3duLmNyZWF0ZSgpKSksXG4gICAgICAgICAgICByZXR1cm5zOiByZXR1cm5zIHx8IFpvZFVua25vd24uY3JlYXRlKCksXG4gICAgICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZEZ1bmN0aW9uLFxuICAgICAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgICAgICB9KTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgWm9kTGF6eSBleHRlbmRzIFpvZFR5cGUge1xuICAgIGdldCBzY2hlbWEoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuZ2V0dGVyKCk7XG4gICAgfVxuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgY29uc3QgbGF6eVNjaGVtYSA9IHRoaXMuX2RlZi5nZXR0ZXIoKTtcbiAgICAgICAgcmV0dXJuIGxhenlTY2hlbWEuX3BhcnNlKHsgZGF0YTogY3R4LmRhdGEsIHBhdGg6IGN0eC5wYXRoLCBwYXJlbnQ6IGN0eCB9KTtcbiAgICB9XG59XG5ab2RMYXp5LmNyZWF0ZSA9IChnZXR0ZXIsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kTGF6eSh7XG4gICAgICAgIGdldHRlcjogZ2V0dGVyLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZExhenksXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kTGl0ZXJhbCBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBpZiAoaW5wdXQuZGF0YSAhPT0gdGhpcy5fZGVmLnZhbHVlKSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfbGl0ZXJhbCxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogdGhpcy5fZGVmLnZhbHVlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzdGF0dXM6IFwidmFsaWRcIiwgdmFsdWU6IGlucHV0LmRhdGEgfTtcbiAgICB9XG4gICAgZ2V0IHZhbHVlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnZhbHVlO1xuICAgIH1cbn1cblpvZExpdGVyYWwuY3JlYXRlID0gKHZhbHVlLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZExpdGVyYWwoe1xuICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kTGl0ZXJhbCxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmZ1bmN0aW9uIGNyZWF0ZVpvZEVudW0odmFsdWVzLCBwYXJhbXMpIHtcbiAgICByZXR1cm4gbmV3IFpvZEVudW0oe1xuICAgICAgICB2YWx1ZXMsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kRW51bSxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufVxuZXhwb3J0IGNsYXNzIFpvZEVudW0gZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBpbnB1dC5kYXRhICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgICAgICBjb25zdCBleHBlY3RlZFZhbHVlcyA9IHRoaXMuX2RlZi52YWx1ZXM7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogdXRpbC5qb2luVmFsdWVzKGV4cGVjdGVkVmFsdWVzKSxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLl9jYWNoZSkge1xuICAgICAgICAgICAgdGhpcy5fY2FjaGUgPSBuZXcgU2V0KHRoaXMuX2RlZi52YWx1ZXMpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGhpcy5fY2FjaGUuaGFzKGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgICAgICBjb25zdCBleHBlY3RlZFZhbHVlcyA9IHRoaXMuX2RlZi52YWx1ZXM7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfZW51bV92YWx1ZSxcbiAgICAgICAgICAgICAgICBvcHRpb25zOiBleHBlY3RlZFZhbHVlcyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIE9LKGlucHV0LmRhdGEpO1xuICAgIH1cbiAgICBnZXQgb3B0aW9ucygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi52YWx1ZXM7XG4gICAgfVxuICAgIGdldCBlbnVtKCkge1xuICAgICAgICBjb25zdCBlbnVtVmFsdWVzID0ge307XG4gICAgICAgIGZvciAoY29uc3QgdmFsIG9mIHRoaXMuX2RlZi52YWx1ZXMpIHtcbiAgICAgICAgICAgIGVudW1WYWx1ZXNbdmFsXSA9IHZhbDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZW51bVZhbHVlcztcbiAgICB9XG4gICAgZ2V0IFZhbHVlcygpIHtcbiAgICAgICAgY29uc3QgZW51bVZhbHVlcyA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IHZhbCBvZiB0aGlzLl9kZWYudmFsdWVzKSB7XG4gICAgICAgICAgICBlbnVtVmFsdWVzW3ZhbF0gPSB2YWw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGVudW1WYWx1ZXM7XG4gICAgfVxuICAgIGdldCBFbnVtKCkge1xuICAgICAgICBjb25zdCBlbnVtVmFsdWVzID0ge307XG4gICAgICAgIGZvciAoY29uc3QgdmFsIG9mIHRoaXMuX2RlZi52YWx1ZXMpIHtcbiAgICAgICAgICAgIGVudW1WYWx1ZXNbdmFsXSA9IHZhbDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZW51bVZhbHVlcztcbiAgICB9XG4gICAgZXh0cmFjdCh2YWx1ZXMsIG5ld0RlZiA9IHRoaXMuX2RlZikge1xuICAgICAgICByZXR1cm4gWm9kRW51bS5jcmVhdGUodmFsdWVzLCB7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICAuLi5uZXdEZWYsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBleGNsdWRlKHZhbHVlcywgbmV3RGVmID0gdGhpcy5fZGVmKSB7XG4gICAgICAgIHJldHVybiBab2RFbnVtLmNyZWF0ZSh0aGlzLm9wdGlvbnMuZmlsdGVyKChvcHQpID0+ICF2YWx1ZXMuaW5jbHVkZXMob3B0KSksIHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIC4uLm5ld0RlZixcbiAgICAgICAgfSk7XG4gICAgfVxufVxuWm9kRW51bS5jcmVhdGUgPSBjcmVhdGVab2RFbnVtO1xuZXhwb3J0IGNsYXNzIFpvZE5hdGl2ZUVudW0gZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgbmF0aXZlRW51bVZhbHVlcyA9IHV0aWwuZ2V0VmFsaWRFbnVtVmFsdWVzKHRoaXMuX2RlZi52YWx1ZXMpO1xuICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgIGlmIChjdHgucGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5zdHJpbmcgJiYgY3R4LnBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUubnVtYmVyKSB7XG4gICAgICAgICAgICBjb25zdCBleHBlY3RlZFZhbHVlcyA9IHV0aWwub2JqZWN0VmFsdWVzKG5hdGl2ZUVudW1WYWx1ZXMpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IHV0aWwuam9pblZhbHVlcyhleHBlY3RlZFZhbHVlcyksXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGhpcy5fY2FjaGUpIHtcbiAgICAgICAgICAgIHRoaXMuX2NhY2hlID0gbmV3IFNldCh1dGlsLmdldFZhbGlkRW51bVZhbHVlcyh0aGlzLl9kZWYudmFsdWVzKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLl9jYWNoZS5oYXMoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgIGNvbnN0IGV4cGVjdGVkVmFsdWVzID0gdXRpbC5vYmplY3RWYWx1ZXMobmF0aXZlRW51bVZhbHVlcyk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfZW51bV92YWx1ZSxcbiAgICAgICAgICAgICAgICBvcHRpb25zOiBleHBlY3RlZFZhbHVlcyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIE9LKGlucHV0LmRhdGEpO1xuICAgIH1cbiAgICBnZXQgZW51bSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi52YWx1ZXM7XG4gICAgfVxufVxuWm9kTmF0aXZlRW51bS5jcmVhdGUgPSAodmFsdWVzLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZE5hdGl2ZUVudW0oe1xuICAgICAgICB2YWx1ZXM6IHZhbHVlcyxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2ROYXRpdmVFbnVtLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZFByb21pc2UgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICB1bndyYXAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYudHlwZTtcbiAgICB9XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBpZiAoY3R4LnBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUucHJvbWlzZSAmJiBjdHguY29tbW9uLmFzeW5jID09PSBmYWxzZSkge1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5wcm9taXNlLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcHJvbWlzaWZpZWQgPSBjdHgucGFyc2VkVHlwZSA9PT0gWm9kUGFyc2VkVHlwZS5wcm9taXNlID8gY3R4LmRhdGEgOiBQcm9taXNlLnJlc29sdmUoY3R4LmRhdGEpO1xuICAgICAgICByZXR1cm4gT0socHJvbWlzaWZpZWQudGhlbigoZGF0YSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi50eXBlLnBhcnNlQXN5bmMoZGF0YSwge1xuICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgIGVycm9yTWFwOiBjdHguY29tbW9uLmNvbnRleHR1YWxFcnJvck1hcCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KSk7XG4gICAgfVxufVxuWm9kUHJvbWlzZS5jcmVhdGUgPSAoc2NoZW1hLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZFByb21pc2Uoe1xuICAgICAgICB0eXBlOiBzY2hlbWEsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kUHJvbWlzZSxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RFZmZlY3RzIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgaW5uZXJUeXBlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnNjaGVtYTtcbiAgICB9XG4gICAgc291cmNlVHlwZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5zY2hlbWEuX2RlZi50eXBlTmFtZSA9PT0gWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZEVmZmVjdHNcbiAgICAgICAgICAgID8gdGhpcy5fZGVmLnNjaGVtYS5zb3VyY2VUeXBlKClcbiAgICAgICAgICAgIDogdGhpcy5fZGVmLnNjaGVtYTtcbiAgICB9XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgc3RhdHVzLCBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGNvbnN0IGVmZmVjdCA9IHRoaXMuX2RlZi5lZmZlY3QgfHwgbnVsbDtcbiAgICAgICAgY29uc3QgY2hlY2tDdHggPSB7XG4gICAgICAgICAgICBhZGRJc3N1ZTogKGFyZykgPT4ge1xuICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwgYXJnKTtcbiAgICAgICAgICAgICAgICBpZiAoYXJnLmZhdGFsKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5hYm9ydCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGdldCBwYXRoKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjdHgucGF0aDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICAgIGNoZWNrQ3R4LmFkZElzc3VlID0gY2hlY2tDdHguYWRkSXNzdWUuYmluZChjaGVja0N0eCk7XG4gICAgICAgIGlmIChlZmZlY3QudHlwZSA9PT0gXCJwcmVwcm9jZXNzXCIpIHtcbiAgICAgICAgICAgIGNvbnN0IHByb2Nlc3NlZCA9IGVmZmVjdC50cmFuc2Zvcm0oY3R4LmRhdGEsIGNoZWNrQ3R4KTtcbiAgICAgICAgICAgIGlmIChjdHguY29tbW9uLmFzeW5jKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShwcm9jZXNzZWQpLnRoZW4oYXN5bmMgKHByb2Nlc3NlZCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdHVzLnZhbHVlID09PSBcImFib3J0ZWRcIilcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9kZWYuc2NoZW1hLl9wYXJzZUFzeW5jKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IHByb2Nlc3NlZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnN0YXR1cyA9PT0gXCJhYm9ydGVkXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5zdGF0dXMgPT09IFwiZGlydHlcIilcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBESVJUWShyZXN1bHQudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdHVzLnZhbHVlID09PSBcImRpcnR5XCIpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gRElSVFkocmVzdWx0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChzdGF0dXMudmFsdWUgPT09IFwiYWJvcnRlZFwiKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLl9kZWYuc2NoZW1hLl9wYXJzZVN5bmMoe1xuICAgICAgICAgICAgICAgICAgICBkYXRhOiBwcm9jZXNzZWQsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnN0YXR1cyA9PT0gXCJhYm9ydGVkXCIpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSBcImRpcnR5XCIpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBESVJUWShyZXN1bHQudmFsdWUpO1xuICAgICAgICAgICAgICAgIGlmIChzdGF0dXMudmFsdWUgPT09IFwiZGlydHlcIilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIERJUlRZKHJlc3VsdC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoZWZmZWN0LnR5cGUgPT09IFwicmVmaW5lbWVudFwiKSB7XG4gICAgICAgICAgICBjb25zdCBleGVjdXRlUmVmaW5lbWVudCA9IChhY2MpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBlZmZlY3QucmVmaW5lbWVudChhY2MsIGNoZWNrQ3R4KTtcbiAgICAgICAgICAgICAgICBpZiAoY3R4LmNvbW1vbi5hc3luYykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkFzeW5jIHJlZmluZW1lbnQgZW5jb3VudGVyZWQgZHVyaW5nIHN5bmNocm9ub3VzIHBhcnNlIG9wZXJhdGlvbi4gVXNlIC5wYXJzZUFzeW5jIGluc3RlYWQuXCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChjdHguY29tbW9uLmFzeW5jID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGlubmVyID0gdGhpcy5fZGVmLnNjaGVtYS5fcGFyc2VTeW5jKHtcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAoaW5uZXIuc3RhdHVzID09PSBcImFib3J0ZWRcIilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICAgICAgaWYgKGlubmVyLnN0YXR1cyA9PT0gXCJkaXJ0eVwiKVxuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICAvLyByZXR1cm4gdmFsdWUgaXMgaWdub3JlZFxuICAgICAgICAgICAgICAgIGV4ZWN1dGVSZWZpbmVtZW50KGlubmVyLnZhbHVlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdGF0dXM6IHN0YXR1cy52YWx1ZSwgdmFsdWU6IGlubmVyLnZhbHVlIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnNjaGVtYS5fcGFyc2VBc3luYyh7IGRhdGE6IGN0eC5kYXRhLCBwYXRoOiBjdHgucGF0aCwgcGFyZW50OiBjdHggfSkudGhlbigoaW5uZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlubmVyLnN0YXR1cyA9PT0gXCJhYm9ydGVkXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlubmVyLnN0YXR1cyA9PT0gXCJkaXJ0eVwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBleGVjdXRlUmVmaW5lbWVudChpbm5lci52YWx1ZSkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdGF0dXM6IHN0YXR1cy52YWx1ZSwgdmFsdWU6IGlubmVyLnZhbHVlIH07XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChlZmZlY3QudHlwZSA9PT0gXCJ0cmFuc2Zvcm1cIikge1xuICAgICAgICAgICAgaWYgKGN0eC5jb21tb24uYXN5bmMgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYmFzZSA9IHRoaXMuX2RlZi5zY2hlbWEuX3BhcnNlU3luYyh7XG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKCFpc1ZhbGlkKGJhc2UpKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBlZmZlY3QudHJhbnNmb3JtKGJhc2UudmFsdWUsIGNoZWNrQ3R4KTtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0IGluc3RhbmNlb2YgUHJvbWlzZSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEFzeW5jaHJvbm91cyB0cmFuc2Zvcm0gZW5jb3VudGVyZWQgZHVyaW5nIHN5bmNocm9ub3VzIHBhcnNlIG9wZXJhdGlvbi4gVXNlIC5wYXJzZUFzeW5jIGluc3RlYWQuYCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB7IHN0YXR1czogc3RhdHVzLnZhbHVlLCB2YWx1ZTogcmVzdWx0IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnNjaGVtYS5fcGFyc2VBc3luYyh7IGRhdGE6IGN0eC5kYXRhLCBwYXRoOiBjdHgucGF0aCwgcGFyZW50OiBjdHggfSkudGhlbigoYmFzZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWlzVmFsaWQoYmFzZSkpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShlZmZlY3QudHJhbnNmb3JtKGJhc2UudmFsdWUsIGNoZWNrQ3R4KSkudGhlbigocmVzdWx0KSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdHVzOiBzdGF0dXMudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogcmVzdWx0LFxuICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdXRpbC5hc3NlcnROZXZlcihlZmZlY3QpO1xuICAgIH1cbn1cblpvZEVmZmVjdHMuY3JlYXRlID0gKHNjaGVtYSwgZWZmZWN0LCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZEVmZmVjdHMoe1xuICAgICAgICBzY2hlbWEsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kRWZmZWN0cyxcbiAgICAgICAgZWZmZWN0LFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuWm9kRWZmZWN0cy5jcmVhdGVXaXRoUHJlcHJvY2VzcyA9IChwcmVwcm9jZXNzLCBzY2hlbWEsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kRWZmZWN0cyh7XG4gICAgICAgIHNjaGVtYSxcbiAgICAgICAgZWZmZWN0OiB7IHR5cGU6IFwicHJlcHJvY2Vzc1wiLCB0cmFuc2Zvcm06IHByZXByb2Nlc3MgfSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RFZmZlY3RzLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IHsgWm9kRWZmZWN0cyBhcyBab2RUcmFuc2Zvcm1lciB9O1xuZXhwb3J0IGNsYXNzIFpvZE9wdGlvbmFsIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZFR5cGUgPSB0aGlzLl9nZXRUeXBlKGlucHV0KTtcbiAgICAgICAgaWYgKHBhcnNlZFR5cGUgPT09IFpvZFBhcnNlZFR5cGUudW5kZWZpbmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gT0sodW5kZWZpbmVkKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLmlubmVyVHlwZS5fcGFyc2UoaW5wdXQpO1xuICAgIH1cbiAgICB1bndyYXAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuaW5uZXJUeXBlO1xuICAgIH1cbn1cblpvZE9wdGlvbmFsLmNyZWF0ZSA9ICh0eXBlLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZE9wdGlvbmFsKHtcbiAgICAgICAgaW5uZXJUeXBlOiB0eXBlLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZE9wdGlvbmFsLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZE51bGxhYmxlIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZFR5cGUgPSB0aGlzLl9nZXRUeXBlKGlucHV0KTtcbiAgICAgICAgaWYgKHBhcnNlZFR5cGUgPT09IFpvZFBhcnNlZFR5cGUubnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIE9LKG51bGwpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuaW5uZXJUeXBlLl9wYXJzZShpbnB1dCk7XG4gICAgfVxuICAgIHVud3JhcCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5pbm5lclR5cGU7XG4gICAgfVxufVxuWm9kTnVsbGFibGUuY3JlYXRlID0gKHR5cGUsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kTnVsbGFibGUoe1xuICAgICAgICBpbm5lclR5cGU6IHR5cGUsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kTnVsbGFibGUsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kRGVmYXVsdCBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgbGV0IGRhdGEgPSBjdHguZGF0YTtcbiAgICAgICAgaWYgKGN0eC5wYXJzZWRUeXBlID09PSBab2RQYXJzZWRUeXBlLnVuZGVmaW5lZCkge1xuICAgICAgICAgICAgZGF0YSA9IHRoaXMuX2RlZi5kZWZhdWx0VmFsdWUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLmlubmVyVHlwZS5fcGFyc2Uoe1xuICAgICAgICAgICAgZGF0YSxcbiAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZW1vdmVEZWZhdWx0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLmlubmVyVHlwZTtcbiAgICB9XG59XG5ab2REZWZhdWx0LmNyZWF0ZSA9ICh0eXBlLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZERlZmF1bHQoe1xuICAgICAgICBpbm5lclR5cGU6IHR5cGUsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kRGVmYXVsdCxcbiAgICAgICAgZGVmYXVsdFZhbHVlOiB0eXBlb2YgcGFyYW1zLmRlZmF1bHQgPT09IFwiZnVuY3Rpb25cIiA/IHBhcmFtcy5kZWZhdWx0IDogKCkgPT4gcGFyYW1zLmRlZmF1bHQsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kQ2F0Y2ggZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIC8vIG5ld0N0eCBpcyB1c2VkIHRvIG5vdCBjb2xsZWN0IGlzc3VlcyBmcm9tIGlubmVyIHR5cGVzIGluIGN0eFxuICAgICAgICBjb25zdCBuZXdDdHggPSB7XG4gICAgICAgICAgICAuLi5jdHgsXG4gICAgICAgICAgICBjb21tb246IHtcbiAgICAgICAgICAgICAgICAuLi5jdHguY29tbW9uLFxuICAgICAgICAgICAgICAgIGlzc3VlczogW10sXG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLl9kZWYuaW5uZXJUeXBlLl9wYXJzZSh7XG4gICAgICAgICAgICBkYXRhOiBuZXdDdHguZGF0YSxcbiAgICAgICAgICAgIHBhdGg6IG5ld0N0eC5wYXRoLFxuICAgICAgICAgICAgcGFyZW50OiB7XG4gICAgICAgICAgICAgICAgLi4ubmV3Q3R4LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChpc0FzeW5jKHJlc3VsdCkpIHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQudGhlbigocmVzdWx0KSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzOiBcInZhbGlkXCIsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiByZXN1bHQuc3RhdHVzID09PSBcInZhbGlkXCJcbiAgICAgICAgICAgICAgICAgICAgICAgID8gcmVzdWx0LnZhbHVlXG4gICAgICAgICAgICAgICAgICAgICAgICA6IHRoaXMuX2RlZi5jYXRjaFZhbHVlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZXQgZXJyb3IoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgWm9kRXJyb3IobmV3Q3R4LmNvbW1vbi5pc3N1ZXMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5wdXQ6IG5ld0N0eC5kYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdGF0dXM6IFwidmFsaWRcIixcbiAgICAgICAgICAgICAgICB2YWx1ZTogcmVzdWx0LnN0YXR1cyA9PT0gXCJ2YWxpZFwiXG4gICAgICAgICAgICAgICAgICAgID8gcmVzdWx0LnZhbHVlXG4gICAgICAgICAgICAgICAgICAgIDogdGhpcy5fZGVmLmNhdGNoVmFsdWUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgZ2V0IGVycm9yKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgWm9kRXJyb3IobmV3Q3R4LmNvbW1vbi5pc3N1ZXMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0OiBuZXdDdHguZGF0YSxcbiAgICAgICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuICAgIHJlbW92ZUNhdGNoKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLmlubmVyVHlwZTtcbiAgICB9XG59XG5ab2RDYXRjaC5jcmVhdGUgPSAodHlwZSwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RDYXRjaCh7XG4gICAgICAgIGlubmVyVHlwZTogdHlwZSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RDYXRjaCxcbiAgICAgICAgY2F0Y2hWYWx1ZTogdHlwZW9mIHBhcmFtcy5jYXRjaCA9PT0gXCJmdW5jdGlvblwiID8gcGFyYW1zLmNhdGNoIDogKCkgPT4gcGFyYW1zLmNhdGNoLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZE5hTiBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCBwYXJzZWRUeXBlID0gdGhpcy5fZ2V0VHlwZShpbnB1dCk7XG4gICAgICAgIGlmIChwYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLm5hbikge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5uYW4sXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzdGF0dXM6IFwidmFsaWRcIiwgdmFsdWU6IGlucHV0LmRhdGEgfTtcbiAgICB9XG59XG5ab2ROYU4uY3JlYXRlID0gKHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kTmFOKHtcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2ROYU4sXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY29uc3QgQlJBTkQgPSBTeW1ib2woXCJ6b2RfYnJhbmRcIik7XG5leHBvcnQgY2xhc3MgWm9kQnJhbmRlZCBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgY29uc3QgZGF0YSA9IGN0eC5kYXRhO1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnR5cGUuX3BhcnNlKHtcbiAgICAgICAgICAgIGRhdGEsXG4gICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgdW53cmFwKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnR5cGU7XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFpvZFBpcGVsaW5lIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgc3RhdHVzLCBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGlmIChjdHguY29tbW9uLmFzeW5jKSB7XG4gICAgICAgICAgICBjb25zdCBoYW5kbGVBc3luYyA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBpblJlc3VsdCA9IGF3YWl0IHRoaXMuX2RlZi5pbi5fcGFyc2VBc3luYyh7XG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKGluUmVzdWx0LnN0YXR1cyA9PT0gXCJhYm9ydGVkXCIpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgICAgIGlmIChpblJlc3VsdC5zdGF0dXMgPT09IFwiZGlydHlcIikge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIERJUlRZKGluUmVzdWx0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9kZWYub3V0Ll9wYXJzZUFzeW5jKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IGluUmVzdWx0LnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiBoYW5kbGVBc3luYygpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgaW5SZXN1bHQgPSB0aGlzLl9kZWYuaW4uX3BhcnNlU3luYyh7XG4gICAgICAgICAgICAgICAgZGF0YTogY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChpblJlc3VsdC5zdGF0dXMgPT09IFwiYWJvcnRlZFwiKVxuICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgaWYgKGluUmVzdWx0LnN0YXR1cyA9PT0gXCJkaXJ0eVwiKSB7XG4gICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzOiBcImRpcnR5XCIsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBpblJlc3VsdC52YWx1ZSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5vdXQuX3BhcnNlU3luYyh7XG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IGluUmVzdWx0LnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgc3RhdGljIGNyZWF0ZShhLCBiKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kUGlwZWxpbmUoe1xuICAgICAgICAgICAgaW46IGEsXG4gICAgICAgICAgICBvdXQ6IGIsXG4gICAgICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZFBpcGVsaW5lLFxuICAgICAgICB9KTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgWm9kUmVhZG9ubHkgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5fZGVmLmlubmVyVHlwZS5fcGFyc2UoaW5wdXQpO1xuICAgICAgICBjb25zdCBmcmVlemUgPSAoZGF0YSkgPT4ge1xuICAgICAgICAgICAgaWYgKGlzVmFsaWQoZGF0YSkpIHtcbiAgICAgICAgICAgICAgICBkYXRhLnZhbHVlID0gT2JqZWN0LmZyZWV6ZShkYXRhLnZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBkYXRhO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gaXNBc3luYyhyZXN1bHQpID8gcmVzdWx0LnRoZW4oKGRhdGEpID0+IGZyZWV6ZShkYXRhKSkgOiBmcmVlemUocmVzdWx0KTtcbiAgICB9XG4gICAgdW53cmFwKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLmlubmVyVHlwZTtcbiAgICB9XG59XG5ab2RSZWFkb25seS5jcmVhdGUgPSAodHlwZSwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RSZWFkb25seSh7XG4gICAgICAgIGlubmVyVHlwZTogdHlwZSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RSZWFkb25seSxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vLy8vLy8vLy8gICAgICAgICAgICAgICAgICAgIC8vLy8vLy8vLy9cbi8vLy8vLy8vLy8gICAgICB6LmN1c3RvbSAgICAgIC8vLy8vLy8vLy9cbi8vLy8vLy8vLy8gICAgICAgICAgICAgICAgICAgIC8vLy8vLy8vLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbmZ1bmN0aW9uIGNsZWFuUGFyYW1zKHBhcmFtcywgZGF0YSkge1xuICAgIGNvbnN0IHAgPSB0eXBlb2YgcGFyYW1zID09PSBcImZ1bmN0aW9uXCIgPyBwYXJhbXMoZGF0YSkgOiB0eXBlb2YgcGFyYW1zID09PSBcInN0cmluZ1wiID8geyBtZXNzYWdlOiBwYXJhbXMgfSA6IHBhcmFtcztcbiAgICBjb25zdCBwMiA9IHR5cGVvZiBwID09PSBcInN0cmluZ1wiID8geyBtZXNzYWdlOiBwIH0gOiBwO1xuICAgIHJldHVybiBwMjtcbn1cbmV4cG9ydCBmdW5jdGlvbiBjdXN0b20oY2hlY2ssIF9wYXJhbXMgPSB7fSwgXG4vKipcbiAqIEBkZXByZWNhdGVkXG4gKlxuICogUGFzcyBgZmF0YWxgIGludG8gdGhlIHBhcmFtcyBvYmplY3QgaW5zdGVhZDpcbiAqXG4gKiBgYGB0c1xuICogei5zdHJpbmcoKS5jdXN0b20oKHZhbCkgPT4gdmFsLmxlbmd0aCA+IDUsIHsgZmF0YWw6IGZhbHNlIH0pXG4gKiBgYGBcbiAqXG4gKi9cbmZhdGFsKSB7XG4gICAgaWYgKGNoZWNrKVxuICAgICAgICByZXR1cm4gWm9kQW55LmNyZWF0ZSgpLnN1cGVyUmVmaW5lKChkYXRhLCBjdHgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHIgPSBjaGVjayhkYXRhKTtcbiAgICAgICAgICAgIGlmIChyIGluc3RhbmNlb2YgUHJvbWlzZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByLnRoZW4oKHIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJhbXMgPSBjbGVhblBhcmFtcyhfcGFyYW1zLCBkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IF9mYXRhbCA9IHBhcmFtcy5mYXRhbCA/PyBmYXRhbCA/PyB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgY3R4LmFkZElzc3VlKHsgY29kZTogXCJjdXN0b21cIiwgLi4ucGFyYW1zLCBmYXRhbDogX2ZhdGFsIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJhbXMgPSBjbGVhblBhcmFtcyhfcGFyYW1zLCBkYXRhKTtcbiAgICAgICAgICAgICAgICBjb25zdCBfZmF0YWwgPSBwYXJhbXMuZmF0YWwgPz8gZmF0YWwgPz8gdHJ1ZTtcbiAgICAgICAgICAgICAgICBjdHguYWRkSXNzdWUoeyBjb2RlOiBcImN1c3RvbVwiLCAuLi5wYXJhbXMsIGZhdGFsOiBfZmF0YWwgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0pO1xuICAgIHJldHVybiBab2RBbnkuY3JlYXRlKCk7XG59XG5leHBvcnQgeyBab2RUeXBlIGFzIFNjaGVtYSwgWm9kVHlwZSBhcyBab2RTY2hlbWEgfTtcbmV4cG9ydCBjb25zdCBsYXRlID0ge1xuICAgIG9iamVjdDogWm9kT2JqZWN0LmxhenljcmVhdGUsXG59O1xuZXhwb3J0IHZhciBab2RGaXJzdFBhcnR5VHlwZUtpbmQ7XG4oZnVuY3Rpb24gKFpvZEZpcnN0UGFydHlUeXBlS2luZCkge1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZFN0cmluZ1wiXSA9IFwiWm9kU3RyaW5nXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kTnVtYmVyXCJdID0gXCJab2ROdW1iZXJcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2ROYU5cIl0gPSBcIlpvZE5hTlwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZEJpZ0ludFwiXSA9IFwiWm9kQmlnSW50XCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kQm9vbGVhblwiXSA9IFwiWm9kQm9vbGVhblwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZERhdGVcIl0gPSBcIlpvZERhdGVcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RTeW1ib2xcIl0gPSBcIlpvZFN5bWJvbFwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZFVuZGVmaW5lZFwiXSA9IFwiWm9kVW5kZWZpbmVkXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kTnVsbFwiXSA9IFwiWm9kTnVsbFwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZEFueVwiXSA9IFwiWm9kQW55XCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kVW5rbm93blwiXSA9IFwiWm9kVW5rbm93blwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZE5ldmVyXCJdID0gXCJab2ROZXZlclwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZFZvaWRcIl0gPSBcIlpvZFZvaWRcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RBcnJheVwiXSA9IFwiWm9kQXJyYXlcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RPYmplY3RcIl0gPSBcIlpvZE9iamVjdFwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZFVuaW9uXCJdID0gXCJab2RVbmlvblwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZERpc2NyaW1pbmF0ZWRVbmlvblwiXSA9IFwiWm9kRGlzY3JpbWluYXRlZFVuaW9uXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kSW50ZXJzZWN0aW9uXCJdID0gXCJab2RJbnRlcnNlY3Rpb25cIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RUdXBsZVwiXSA9IFwiWm9kVHVwbGVcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RSZWNvcmRcIl0gPSBcIlpvZFJlY29yZFwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZE1hcFwiXSA9IFwiWm9kTWFwXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kU2V0XCJdID0gXCJab2RTZXRcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RGdW5jdGlvblwiXSA9IFwiWm9kRnVuY3Rpb25cIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RMYXp5XCJdID0gXCJab2RMYXp5XCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kTGl0ZXJhbFwiXSA9IFwiWm9kTGl0ZXJhbFwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZEVudW1cIl0gPSBcIlpvZEVudW1cIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RFZmZlY3RzXCJdID0gXCJab2RFZmZlY3RzXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kTmF0aXZlRW51bVwiXSA9IFwiWm9kTmF0aXZlRW51bVwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZE9wdGlvbmFsXCJdID0gXCJab2RPcHRpb25hbFwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZE51bGxhYmxlXCJdID0gXCJab2ROdWxsYWJsZVwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZERlZmF1bHRcIl0gPSBcIlpvZERlZmF1bHRcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RDYXRjaFwiXSA9IFwiWm9kQ2F0Y2hcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RQcm9taXNlXCJdID0gXCJab2RQcm9taXNlXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kQnJhbmRlZFwiXSA9IFwiWm9kQnJhbmRlZFwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZFBpcGVsaW5lXCJdID0gXCJab2RQaXBlbGluZVwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZFJlYWRvbmx5XCJdID0gXCJab2RSZWFkb25seVwiO1xufSkoWm9kRmlyc3RQYXJ0eVR5cGVLaW5kIHx8IChab2RGaXJzdFBhcnR5VHlwZUtpbmQgPSB7fSkpO1xuLy8gcmVxdWlyZXMgVFMgNC40K1xuY2xhc3MgQ2xhc3Mge1xuICAgIGNvbnN0cnVjdG9yKC4uLl8pIHsgfVxufVxuY29uc3QgaW5zdGFuY2VPZlR5cGUgPSAoXG4vLyBjb25zdCBpbnN0YW5jZU9mVHlwZSA9IDxUIGV4dGVuZHMgbmV3ICguLi5hcmdzOiBhbnlbXSkgPT4gYW55PihcbmNscywgcGFyYW1zID0ge1xuICAgIG1lc3NhZ2U6IGBJbnB1dCBub3QgaW5zdGFuY2Ugb2YgJHtjbHMubmFtZX1gLFxufSkgPT4gY3VzdG9tKChkYXRhKSA9PiBkYXRhIGluc3RhbmNlb2YgY2xzLCBwYXJhbXMpO1xuY29uc3Qgc3RyaW5nVHlwZSA9IFpvZFN0cmluZy5jcmVhdGU7XG5jb25zdCBudW1iZXJUeXBlID0gWm9kTnVtYmVyLmNyZWF0ZTtcbmNvbnN0IG5hblR5cGUgPSBab2ROYU4uY3JlYXRlO1xuY29uc3QgYmlnSW50VHlwZSA9IFpvZEJpZ0ludC5jcmVhdGU7XG5jb25zdCBib29sZWFuVHlwZSA9IFpvZEJvb2xlYW4uY3JlYXRlO1xuY29uc3QgZGF0ZVR5cGUgPSBab2REYXRlLmNyZWF0ZTtcbmNvbnN0IHN5bWJvbFR5cGUgPSBab2RTeW1ib2wuY3JlYXRlO1xuY29uc3QgdW5kZWZpbmVkVHlwZSA9IFpvZFVuZGVmaW5lZC5jcmVhdGU7XG5jb25zdCBudWxsVHlwZSA9IFpvZE51bGwuY3JlYXRlO1xuY29uc3QgYW55VHlwZSA9IFpvZEFueS5jcmVhdGU7XG5jb25zdCB1bmtub3duVHlwZSA9IFpvZFVua25vd24uY3JlYXRlO1xuY29uc3QgbmV2ZXJUeXBlID0gWm9kTmV2ZXIuY3JlYXRlO1xuY29uc3Qgdm9pZFR5cGUgPSBab2RWb2lkLmNyZWF0ZTtcbmNvbnN0IGFycmF5VHlwZSA9IFpvZEFycmF5LmNyZWF0ZTtcbmNvbnN0IG9iamVjdFR5cGUgPSBab2RPYmplY3QuY3JlYXRlO1xuY29uc3Qgc3RyaWN0T2JqZWN0VHlwZSA9IFpvZE9iamVjdC5zdHJpY3RDcmVhdGU7XG5jb25zdCB1bmlvblR5cGUgPSBab2RVbmlvbi5jcmVhdGU7XG5jb25zdCBkaXNjcmltaW5hdGVkVW5pb25UeXBlID0gWm9kRGlzY3JpbWluYXRlZFVuaW9uLmNyZWF0ZTtcbmNvbnN0IGludGVyc2VjdGlvblR5cGUgPSBab2RJbnRlcnNlY3Rpb24uY3JlYXRlO1xuY29uc3QgdHVwbGVUeXBlID0gWm9kVHVwbGUuY3JlYXRlO1xuY29uc3QgcmVjb3JkVHlwZSA9IFpvZFJlY29yZC5jcmVhdGU7XG5jb25zdCBtYXBUeXBlID0gWm9kTWFwLmNyZWF0ZTtcbmNvbnN0IHNldFR5cGUgPSBab2RTZXQuY3JlYXRlO1xuY29uc3QgZnVuY3Rpb25UeXBlID0gWm9kRnVuY3Rpb24uY3JlYXRlO1xuY29uc3QgbGF6eVR5cGUgPSBab2RMYXp5LmNyZWF0ZTtcbmNvbnN0IGxpdGVyYWxUeXBlID0gWm9kTGl0ZXJhbC5jcmVhdGU7XG5jb25zdCBlbnVtVHlwZSA9IFpvZEVudW0uY3JlYXRlO1xuY29uc3QgbmF0aXZlRW51bVR5cGUgPSBab2ROYXRpdmVFbnVtLmNyZWF0ZTtcbmNvbnN0IHByb21pc2VUeXBlID0gWm9kUHJvbWlzZS5jcmVhdGU7XG5jb25zdCBlZmZlY3RzVHlwZSA9IFpvZEVmZmVjdHMuY3JlYXRlO1xuY29uc3Qgb3B0aW9uYWxUeXBlID0gWm9kT3B0aW9uYWwuY3JlYXRlO1xuY29uc3QgbnVsbGFibGVUeXBlID0gWm9kTnVsbGFibGUuY3JlYXRlO1xuY29uc3QgcHJlcHJvY2Vzc1R5cGUgPSBab2RFZmZlY3RzLmNyZWF0ZVdpdGhQcmVwcm9jZXNzO1xuY29uc3QgcGlwZWxpbmVUeXBlID0gWm9kUGlwZWxpbmUuY3JlYXRlO1xuY29uc3Qgb3N0cmluZyA9ICgpID0+IHN0cmluZ1R5cGUoKS5vcHRpb25hbCgpO1xuY29uc3Qgb251bWJlciA9ICgpID0+IG51bWJlclR5cGUoKS5vcHRpb25hbCgpO1xuY29uc3Qgb2Jvb2xlYW4gPSAoKSA9PiBib29sZWFuVHlwZSgpLm9wdGlvbmFsKCk7XG5leHBvcnQgY29uc3QgY29lcmNlID0ge1xuICAgIHN0cmluZzogKChhcmcpID0+IFpvZFN0cmluZy5jcmVhdGUoeyAuLi5hcmcsIGNvZXJjZTogdHJ1ZSB9KSksXG4gICAgbnVtYmVyOiAoKGFyZykgPT4gWm9kTnVtYmVyLmNyZWF0ZSh7IC4uLmFyZywgY29lcmNlOiB0cnVlIH0pKSxcbiAgICBib29sZWFuOiAoKGFyZykgPT4gWm9kQm9vbGVhbi5jcmVhdGUoe1xuICAgICAgICAuLi5hcmcsXG4gICAgICAgIGNvZXJjZTogdHJ1ZSxcbiAgICB9KSksXG4gICAgYmlnaW50OiAoKGFyZykgPT4gWm9kQmlnSW50LmNyZWF0ZSh7IC4uLmFyZywgY29lcmNlOiB0cnVlIH0pKSxcbiAgICBkYXRlOiAoKGFyZykgPT4gWm9kRGF0ZS5jcmVhdGUoeyAuLi5hcmcsIGNvZXJjZTogdHJ1ZSB9KSksXG59O1xuZXhwb3J0IHsgYW55VHlwZSBhcyBhbnksIGFycmF5VHlwZSBhcyBhcnJheSwgYmlnSW50VHlwZSBhcyBiaWdpbnQsIGJvb2xlYW5UeXBlIGFzIGJvb2xlYW4sIGRhdGVUeXBlIGFzIGRhdGUsIGRpc2NyaW1pbmF0ZWRVbmlvblR5cGUgYXMgZGlzY3JpbWluYXRlZFVuaW9uLCBlZmZlY3RzVHlwZSBhcyBlZmZlY3QsIGVudW1UeXBlIGFzIGVudW0sIGZ1bmN0aW9uVHlwZSBhcyBmdW5jdGlvbiwgaW5zdGFuY2VPZlR5cGUgYXMgaW5zdGFuY2VvZiwgaW50ZXJzZWN0aW9uVHlwZSBhcyBpbnRlcnNlY3Rpb24sIGxhenlUeXBlIGFzIGxhenksIGxpdGVyYWxUeXBlIGFzIGxpdGVyYWwsIG1hcFR5cGUgYXMgbWFwLCBuYW5UeXBlIGFzIG5hbiwgbmF0aXZlRW51bVR5cGUgYXMgbmF0aXZlRW51bSwgbmV2ZXJUeXBlIGFzIG5ldmVyLCBudWxsVHlwZSBhcyBudWxsLCBudWxsYWJsZVR5cGUgYXMgbnVsbGFibGUsIG51bWJlclR5cGUgYXMgbnVtYmVyLCBvYmplY3RUeXBlIGFzIG9iamVjdCwgb2Jvb2xlYW4sIG9udW1iZXIsIG9wdGlvbmFsVHlwZSBhcyBvcHRpb25hbCwgb3N0cmluZywgcGlwZWxpbmVUeXBlIGFzIHBpcGVsaW5lLCBwcmVwcm9jZXNzVHlwZSBhcyBwcmVwcm9jZXNzLCBwcm9taXNlVHlwZSBhcyBwcm9taXNlLCByZWNvcmRUeXBlIGFzIHJlY29yZCwgc2V0VHlwZSBhcyBzZXQsIHN0cmljdE9iamVjdFR5cGUgYXMgc3RyaWN0T2JqZWN0LCBzdHJpbmdUeXBlIGFzIHN0cmluZywgc3ltYm9sVHlwZSBhcyBzeW1ib2wsIGVmZmVjdHNUeXBlIGFzIHRyYW5zZm9ybWVyLCB0dXBsZVR5cGUgYXMgdHVwbGUsIHVuZGVmaW5lZFR5cGUgYXMgdW5kZWZpbmVkLCB1bmlvblR5cGUgYXMgdW5pb24sIHVua25vd25UeXBlIGFzIHVua25vd24sIHZvaWRUeXBlIGFzIHZvaWQsIH07XG5leHBvcnQgY29uc3QgTkVWRVIgPSBJTlZBTElEO1xuIiwiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBFUlJPUl9LSU5EUyB9IGZyb20gJy4vZXJyb3JzJztcblxuLyoqXG4gKiDmjIHkuYXljJbmlbDmja7kuI7mqKHlnovlk43lupTlhbHnlKjnmoQgWm9kIFNjaGVtYeOAglxuICog5a2Y5YKoIGtleSDop4EgZG9jcy/mioDmnK/mnrbmnoTmlrnmoYgg56ysIDEwIOiKgu+8mlxuICogc2V0dGluZ3M6bW9kZWwgLyBqb2I6Y3VycmVudCAvIHNjYW46Y3VycmVudCAvIHBsYW46Y3VycmVudCAvIHVuZG86bGF0ZXN0XG4gKi9cblxuZXhwb3J0IGNvbnN0IFNUT1JBR0VfS0VZUyA9IHtcbiAgbW9kZWxTZXR0aW5nczogJ3NldHRpbmdzOm1vZGVsJyxcbiAgam9iOiAnam9iOmN1cnJlbnQnLFxuICBzY2FuOiAnc2NhbjpjdXJyZW50JyxcbiAgcGxhbjogJ3BsYW46Y3VycmVudCcsXG4gIHVuZG86ICd1bmRvOmxhdGVzdCcsXG59IGFzIGNvbnN0O1xuXG4vKiog5YaZ5YWlIGNocm9tZS5zdG9yYWdlLmxvY2FsIOWJjeWFgeiuuOeahOacgOWkp+W3sueUqOepuumXtO+8iOaOpei/kSAxMCBNQiDphY3pop3ml7blgZzmraLvvInjgIIgKi9cbmV4cG9ydCBjb25zdCBTVE9SQUdFX1FVT1RBX0xJTUlUX0JZVEVTID0gOS41ICogMTAyNCAqIDEwMjQ7XG5cbi8vIC0tLS0tLS0tLS0g5qih5Z6L6K6+572uIC0tLS0tLS0tLS1cblxuZXhwb3J0IGNvbnN0IE1vZGVsU2V0dGluZ3NTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGJhc2VVcmw6IHpcbiAgICAuc3RyaW5nKClcbiAgICAudXJsKClcbiAgICAucmVmaW5lKCh1KSA9PiB1LnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJyksIHsgbWVzc2FnZTogJ+S7heaUr+aMgSBIVFRQUyDnmoQgQVBJIEJhc2UgVVJMJyB9KSxcbiAgYXBpS2V5OiB6LnN0cmluZygpLm1pbigxKSxcbiAgbW9kZWw6IHouc3RyaW5nKCkubWluKDEpLFxufSk7XG5leHBvcnQgdHlwZSBNb2RlbFNldHRpbmdzID0gei5pbmZlcjx0eXBlb2YgTW9kZWxTZXR0aW5nc1NjaGVtYT47XG5cbi8vIC0tLS0tLS0tLS0g5omr5o+P57uT5p6cIC0tLS0tLS0tLS1cblxuZXhwb3J0IGNvbnN0IFNjYW5Sb290U2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgdGl0bGU6IHouc3RyaW5nKCksXG59KTtcbmV4cG9ydCB0eXBlIFNjYW5Sb290ID0gei5pbmZlcjx0eXBlb2YgU2NhblJvb3RTY2hlbWE+O1xuXG5leHBvcnQgY29uc3QgU2NhbkZvbGRlclNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIHBhcmVudElkOiB6LnN0cmluZygpLFxuICByb290SWQ6IHouc3RyaW5nKCksXG4gIHRpdGxlOiB6LnN0cmluZygpLFxuICAvKiog55u45a+55LqO5omA5Zyo5qC555uu5b2V55qE55uu5b2V5ZCN6Lev5b6E77yI5LiN5ZCr5qC555uu5b2V6Ieq6Lqr77yJ44CCICovXG4gIHBhdGg6IHouYXJyYXkoei5zdHJpbmcoKSksXG4gIGRlcHRoOiB6Lm51bWJlcigpLmludCgpLm5vbm5lZ2F0aXZlKCksXG59KTtcbmV4cG9ydCB0eXBlIFNjYW5Gb2xkZXIgPSB6LmluZmVyPHR5cGVvZiBTY2FuRm9sZGVyU2NoZW1hPjtcblxuZXhwb3J0IGNvbnN0IFNjYW5uZWRCb29rbWFya1NjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIHRpdGxlOiB6LnN0cmluZygpLFxuICB1cmw6IHouc3RyaW5nKCksXG4gIHBhcmVudElkOiB6LnN0cmluZygpLFxuICByb290SWQ6IHouc3RyaW5nKCksXG4gIC8qKiDkuabnrb7miYDlnKjnm67lvZXnm7jlr7nkuo7moLnnm67lvZXnmoTnm67lvZXlkI3ot6/lvoTvvIjkuI3lkKvmoLnnm67lvZXoh6rouqvvvInjgIIgKi9cbiAgcGF0aDogei5hcnJheSh6LnN0cmluZygpKSxcbn0pO1xuZXhwb3J0IHR5cGUgU2Nhbm5lZEJvb2ttYXJrID0gei5pbmZlcjx0eXBlb2YgU2Nhbm5lZEJvb2ttYXJrU2NoZW1hPjtcblxuZXhwb3J0IGNvbnN0IFNjYW5SZXN1bHRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNjYW5JZDogei5zdHJpbmcoKSxcbiAgc2Nhbm5lZEF0OiB6Lm51bWJlcigpLFxuICByb290czogei5hcnJheShTY2FuUm9vdFNjaGVtYSksXG4gIGZvbGRlcnM6IHouYXJyYXkoU2NhbkZvbGRlclNjaGVtYSksXG4gIGJvb2ttYXJrczogei5hcnJheShTY2FubmVkQm9va21hcmtTY2hlbWEpLFxufSk7XG5leHBvcnQgdHlwZSBTY2FuUmVzdWx0ID0gei5pbmZlcjx0eXBlb2YgU2NhblJlc3VsdFNjaGVtYT47XG5cbi8vIC0tLS0tLS0tLS0g5YiG57G75pa55qGIIC0tLS0tLS0tLS1cblxuY29uc3QgUGF0aFNlZ21lbnRTY2hlbWEgPSB6LnN0cmluZygpLm1pbigxKS5tYXgoMTAwKTtcbi8qKiBBSSDot6/lvoTmnIDlpJrkuKTnuqfjgIHoh7PlsJHkuIDnuqfvvIjigJzmnKrliIbnsbvigJ3nrYnljZXnuqfnm67lvZXkuZ/lkIjms5XvvInjgIIgKi9cbmV4cG9ydCBjb25zdCBUYXJnZXRQYXRoU2NoZW1hID0gei5hcnJheShQYXRoU2VnbWVudFNjaGVtYSkubWluKDEpLm1heCgyKTtcblxuZXhwb3J0IGNvbnN0IEFzc2lnbm1lbnRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGJvb2ttYXJrSWQ6IHouc3RyaW5nKCksXG4gIHRhcmdldFBhdGg6IFRhcmdldFBhdGhTY2hlbWEsXG4gIHJlYXNvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxufSk7XG5leHBvcnQgdHlwZSBBc3NpZ25tZW50ID0gei5pbmZlcjx0eXBlb2YgQXNzaWdubWVudFNjaGVtYT47XG5cbmV4cG9ydCBjb25zdCBQbGFuUmVjb3JkU2NoZW1hID0gei5vYmplY3Qoe1xuICBqb2JJZDogei5zdHJpbmcoKSxcbiAgY3JlYXRlZEF0OiB6Lm51bWJlcigpLFxuICBwaGFzZTogei5lbnVtKFsndGF4b25vbXknLCAnYXNzaWduJywgJ2RvbmUnXSksXG4gIC8qKiDliIbnsbvkvZPns7vpmLbmrrXlkITmibnmrKHkuqflh7rnmoTlgJnpgInnm67lvZXvvIznlKjkuo7mlq3ngrnnu63ot5HjgIIgKi9cbiAgdGF4b25vbXlDYW5kaWRhdGVzOiB6LmFycmF5KHouYXJyYXkoUGF0aFNlZ21lbnRTY2hlbWEpLm1pbigxKS5tYXgoMikpLmRlZmF1bHQoW10pLFxuICAvKiog5bey5a6M5oiQ55qE5YiG57G75L2T57O75om55qyh5pWw44CCICovXG4gIHRheG9ub215Q3Vyc29yOiB6Lm51bWJlcigpLmludCgpLm5vbm5lZ2F0aXZlKCkuZGVmYXVsdCgwKSxcbiAgLyoqIOWQiOW5tuWQjueahOacgOe7iOebruW9leS9k+ezu++8jOWFqOmDqOS4uuS4jei2hei/h+S4pOe6p+eahOi3r+W+hOOAgiAqL1xuICB0YXhvbm9teTogei5hcnJheShUYXJnZXRQYXRoU2NoZW1hKS5kZWZhdWx0KFtdKSxcbiAgYXNzaWdubWVudHM6IHouYXJyYXkoQXNzaWdubWVudFNjaGVtYSkuZGVmYXVsdChbXSksXG4gIC8qKiDlt7LlrozmiJDliIbphY3nmoTkuabnrb7mlbDmuLjmoIfvvIzmgaLlpI3ml7bku47ov5nph4znu6fnu63jgIIgKi9cbiAgYXNzaWduQ3Vyc29yOiB6Lm51bWJlcigpLmludCgpLm5vbm5lZ2F0aXZlKCkuZGVmYXVsdCgwKSxcbn0pO1xuZXhwb3J0IHR5cGUgUGxhblJlY29yZCA9IHouaW5mZXI8dHlwZW9mIFBsYW5SZWNvcmRTY2hlbWE+O1xuXG4vLyAtLS0tLS0tLS0tIOS7u+WKoeeKtuaAgSAtLS0tLS0tLS0tXG5cbmV4cG9ydCBjb25zdCBKT0JfU1RBVFVTRVMgPSBbXG4gICdpZGxlJyxcbiAgJ3NjYW5uaW5nJyxcbiAgJ3BsYW5uaW5nJyxcbiAgJ2NsYXNzaWZ5aW5nJyxcbiAgJ3Jldmlld2luZycsXG4gICdhcHBseWluZycsXG4gICdjb21wbGV0ZWQnLFxuICAnaW50ZXJydXB0ZWQnLFxuICAndW5kb2luZycsXG4gICd1bmRvbmUnLFxuICAncGFydGlhbGx5X3VuZG9uZScsXG4gICdmYWlsZWQnLFxuXSBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIEpvYlN0YXR1cyA9ICh0eXBlb2YgSk9CX1NUQVRVU0VTKVtudW1iZXJdO1xuXG5leHBvcnQgY29uc3QgRmFpbHVyZUl0ZW1TY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGJvb2ttYXJrSWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAga2luZDogei5lbnVtKEVSUk9SX0tJTkRTKSxcbiAgbWVzc2FnZTogei5zdHJpbmcoKSxcbn0pO1xuZXhwb3J0IHR5cGUgRmFpbHVyZUl0ZW0gPSB6LmluZmVyPHR5cGVvZiBGYWlsdXJlSXRlbVNjaGVtYT47XG5cbmV4cG9ydCBjb25zdCBKb2JTdGF0ZVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgam9iSWQ6IHouc3RyaW5nKCksXG4gIHN0YXR1czogei5lbnVtKEpPQl9TVEFUVVNFUyksXG4gIHVwZGF0ZWRBdDogei5udW1iZXIoKSxcbiAgLyoqIGFwcGx5IOmYtuauteaIkOWKn+enu+WKqOeahOS5puetvuaVsOa4uOagh+OAgiAqL1xuICBhcHBseUN1cnNvcjogei5udW1iZXIoKS5pbnQoKS5ub25uZWdhdGl2ZSgpLmRlZmF1bHQoMCksXG4gIGFwcGxpZWRJZHM6IHouYXJyYXkoei5zdHJpbmcoKSkuZGVmYXVsdChbXSksXG4gIC8qKiBhcHBseSDpmLbmrrXmlrDlu7rnmoTnm67lvZUgSUTvvIjmkqTplIDml7blj6rliKDpmaTov5nkupvnm67lvZXkuK3nmoTnqbrnm67lvZXvvInjgIIgKi9cbiAgY3JlYXRlZEZvbGRlcklkczogei5hcnJheSh6LnN0cmluZygpKS5kZWZhdWx0KFtdKSxcbiAgLyoqIOeUqOaIt+ivt+axguS4reaWreWGmeWFpeeahOagh+W/l++8jFNlcnZpY2UgV29ya2VyIOWcqOavj+adoeWGmeWFpeS5i+mXtOajgOafpeOAgiAqL1xuICBjYW5jZWxSZXF1ZXN0ZWQ6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLFxuICBmYWlsdXJlczogei5hcnJheShGYWlsdXJlSXRlbVNjaGVtYSkuZGVmYXVsdChbXSksXG4gIGVycm9yOiBGYWlsdXJlSXRlbVNjaGVtYS5vcHRpb25hbCgpLFxufSk7XG5leHBvcnQgdHlwZSBKb2JTdGF0ZSA9IHouaW5mZXI8dHlwZW9mIEpvYlN0YXRlU2NoZW1hPjtcblxuLy8gLS0tLS0tLS0tLSDmkqTplIDlv6vnhacgLS0tLS0tLS0tLVxuXG5leHBvcnQgY29uc3QgVW5kb01vdmVTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGJvb2ttYXJrSWQ6IHouc3RyaW5nKCksXG4gIGZyb21QYXJlbnRJZDogei5zdHJpbmcoKSxcbiAgZnJvbUluZGV4OiB6Lm51bWJlcigpLmludCgpLm5vbm5lZ2F0aXZlKCksXG4gIHRvRm9sZGVySWQ6IHouc3RyaW5nKCksXG59KTtcbmV4cG9ydCB0eXBlIFVuZG9Nb3ZlID0gei5pbmZlcjx0eXBlb2YgVW5kb01vdmVTY2hlbWE+O1xuXG5leHBvcnQgY29uc3QgVW5kb1NuYXBzaG90U2NoZW1hID0gei5vYmplY3Qoe1xuICBqb2JJZDogei5zdHJpbmcoKSxcbiAgY3JlYXRlZEF0OiB6Lm51bWJlcigpLFxuICBtb3Zlczogei5hcnJheShVbmRvTW92ZVNjaGVtYSksXG4gIGNyZWF0ZWRGb2xkZXJzOiB6LmFycmF5KFxuICAgIHoub2JqZWN0KHsgaWQ6IHouc3RyaW5nKCksIGRlcHRoOiB6Lm51bWJlcigpLmludCgpLm5vbm5lZ2F0aXZlKCkgfSksXG4gICksXG59KTtcbmV4cG9ydCB0eXBlIFVuZG9TbmFwc2hvdCA9IHouaW5mZXI8dHlwZW9mIFVuZG9TbmFwc2hvdFNjaGVtYT47XG5cbi8vIC0tLS0tLS0tLS0g5qih5Z6L5ZON5bqUIC0tLS0tLS0tLS1cblxuLyoqIOaooeWei+aMieaJueasoei/lOWbnueahOWAmemAieebruW9leOAgiAqL1xuZXhwb3J0IGNvbnN0IE1vZGVsQ2FuZGlkYXRlQmF0Y2hTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGNhbmRpZGF0ZXM6IHouYXJyYXkoei5hcnJheSh6LnN0cmluZygpKS5taW4oMSkubWF4KDIpKSxcbn0pO1xuZXhwb3J0IHR5cGUgTW9kZWxDYW5kaWRhdGVCYXRjaCA9IHouaW5mZXI8dHlwZW9mIE1vZGVsQ2FuZGlkYXRlQmF0Y2hTY2hlbWE+O1xuXG4vKiog5ZCI5bm25ZCO55qE5pyA57uI55uu5b2V5L2T57O744CCICovXG5leHBvcnQgY29uc3QgTW9kZWxUYXhvbm9teVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgY2F0ZWdvcmllczogei5hcnJheSh6LmFycmF5KHouc3RyaW5nKCkpLm1pbigxKS5tYXgoMikpLFxufSk7XG5leHBvcnQgdHlwZSBNb2RlbFRheG9ub215ID0gei5pbmZlcjx0eXBlb2YgTW9kZWxUYXhvbm9teVNjaGVtYT47XG5cbi8qKiDliIbphY3pmLbmrrXmqKHlnovlj6rog73ov5Tlm57ov5nkuInkuKrlrZfmrrXvvIzkuI3og73ov5Tlm57ku7vkvZUgQ2hyb21lIOiKgueCuSBJROOAgiAqL1xuZXhwb3J0IGNvbnN0IE1vZGVsQXNzaWdubWVudEJhdGNoU2NoZW1hID0gei5vYmplY3Qoe1xuICBhc3NpZ25tZW50czogei5hcnJheShcbiAgICB6Lm9iamVjdCh7XG4gICAgICBib29rbWFya0lkOiB6LnN0cmluZygpLFxuICAgICAgdGFyZ2V0UGF0aDogei5hcnJheSh6LnN0cmluZygpKS5taW4oMSkubWF4KDIpLFxuICAgICAgcmVhc29uOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgfSksXG4gICksXG59KTtcbmV4cG9ydCB0eXBlIE1vZGVsQXNzaWdubWVudEJhdGNoID0gei5pbmZlcjx0eXBlb2YgTW9kZWxBc3NpZ25tZW50QmF0Y2hTY2hlbWE+O1xuIiwiaW1wb3J0IHR5cGUgeyBTdG9yYWdlUG9ydCB9IGZyb20gJy4uLy4uL2FwcGxpY2F0aW9uL3BvcnRzJztcbmltcG9ydCB7IEFwcEVycm9yIH0gZnJvbSAnLi4vLi4vc2hhcmVkL2Vycm9ycyc7XG5pbXBvcnQge1xuICBKb2JTdGF0ZVNjaGVtYSxcbiAgTW9kZWxTZXR0aW5nc1NjaGVtYSxcbiAgUGxhblJlY29yZFNjaGVtYSxcbiAgU2NhblJlc3VsdFNjaGVtYSxcbiAgU1RPUkFHRV9LRVlTLFxuICBTVE9SQUdFX1FVT1RBX0xJTUlUX0JZVEVTLFxuICBVbmRvU25hcHNob3RTY2hlbWEsXG4gIHR5cGUgSm9iU3RhdGUsXG4gIHR5cGUgTW9kZWxTZXR0aW5ncyxcbiAgdHlwZSBQbGFuUmVjb3JkLFxuICB0eXBlIFNjYW5SZXN1bHQsXG4gIHR5cGUgVW5kb1NuYXBzaG90LFxufSBmcm9tICcuLi8uLi9zaGFyZWQvc2NoZW1hcyc7XG5cbmltcG9ydCB0eXBlIHsgeiB9IGZyb20gJ3pvZCc7XG5cbi8qKlxuICogY2hyb21lLnN0b3JhZ2UubG9jYWwg6YCC6YWN5a6e546w44CCXG4gKiAtIOivu+WPluaXtue7jyBab2Qg5qCh6aqM77yM5o2f5Z2P5pWw5o2u6L+U5ZueIG51bGwg6ICM5LiN5piv5oqb5Ye677ybXG4gKiAtIOWGmeWFpeWJjeajgOafpeW3sueUqOepuumXtO+8jOaOpei/kemFjemineaXtuaLkue7neW5tuaPkOekuu+8iOaetuaehOaWueahiOesrCAxMCDoioLvvInjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVN0b3JhZ2VSZXBvc2l0b3J5KGFyZWE6IGNocm9tZS5zdG9yYWdlLlN0b3JhZ2VBcmVhKTogU3RvcmFnZVBvcnQge1xuICAvLyDms5vlnovnuqbmnZ/liLDlhbfkvZMgU2NoZW1hIOexu+Wei++8jOinhOmBvyBab2RUeXBlPE91dHB1dCwgSW5wdXQ+IOWcqCAuZGVmYXVsdCgpIOS4iueahOWPmOWei+mXrumimOOAglxuICBhc3luYyBmdW5jdGlvbiByZWFkPFMgZXh0ZW5kcyB6LlpvZFR5cGVBbnk+KGtleTogc3RyaW5nLCBzY2hlbWE6IFMpOiBQcm9taXNlPHouaW5mZXI8Uz4gfCBudWxsPiB7XG4gICAgY29uc3QgcmF3ID0gKGF3YWl0IGFyZWEuZ2V0KGtleSkpW2tleV07XG4gICAgaWYgKHJhdyA9PT0gdW5kZWZpbmVkIHx8IHJhdyA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcGFyc2VkID0gc2NoZW1hLnNhZmVQYXJzZShyYXcpO1xuICAgIHJldHVybiBwYXJzZWQuc3VjY2VzcyA/IHBhcnNlZC5kYXRhIDogbnVsbDtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIHdyaXRlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHVzZWQgPSBhd2FpdCBhcmVhLmdldEJ5dGVzSW5Vc2UobnVsbCk7XG4gICAgaWYgKHVzZWQgPj0gU1RPUkFHRV9RVU9UQV9MSU1JVF9CWVRFUykge1xuICAgICAgdGhyb3cgbmV3IEFwcEVycm9yKFxuICAgICAgICAnc3RvcmFnZV9xdW90YScsXG4gICAgICAgICfmnKzlnLDlrZjlgqjnqbrpl7TkuI3otrPvvIzor7fnvKnlsI/mlbTnkIbojIPlm7TvvIhjaHJvbWUuc3RvcmFnZS5sb2NhbCDphY3pop3nuqYgMTAgTULvvIknLFxuICAgICAgKTtcbiAgICB9XG4gICAgYXdhaXQgYXJlYS5zZXQoeyBba2V5XTogdmFsdWUgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGxvYWRNb2RlbFNldHRpbmdzOiAoKSA9PiByZWFkKFNUT1JBR0VfS0VZUy5tb2RlbFNldHRpbmdzLCBNb2RlbFNldHRpbmdzU2NoZW1hKSxcbiAgICBzYXZlTW9kZWxTZXR0aW5nczogKHNldHRpbmdzOiBNb2RlbFNldHRpbmdzKSA9PlxuICAgICAgd3JpdGUoU1RPUkFHRV9LRVlTLm1vZGVsU2V0dGluZ3MsIE1vZGVsU2V0dGluZ3NTY2hlbWEucGFyc2Uoc2V0dGluZ3MpKSxcblxuICAgIGxvYWRKb2I6ICgpID0+IHJlYWQoU1RPUkFHRV9LRVlTLmpvYiwgSm9iU3RhdGVTY2hlbWEpLFxuICAgIHNhdmVKb2I6IChqb2I6IEpvYlN0YXRlKSA9PiB3cml0ZShTVE9SQUdFX0tFWVMuam9iLCBKb2JTdGF0ZVNjaGVtYS5wYXJzZShqb2IpKSxcblxuICAgIGxvYWRTY2FuOiAoKSA9PiByZWFkKFNUT1JBR0VfS0VZUy5zY2FuLCBTY2FuUmVzdWx0U2NoZW1hKSxcbiAgICBzYXZlU2NhbjogKHNjYW46IFNjYW5SZXN1bHQpID0+IHdyaXRlKFNUT1JBR0VfS0VZUy5zY2FuLCBTY2FuUmVzdWx0U2NoZW1hLnBhcnNlKHNjYW4pKSxcblxuICAgIGxvYWRQbGFuOiAoKSA9PiByZWFkKFNUT1JBR0VfS0VZUy5wbGFuLCBQbGFuUmVjb3JkU2NoZW1hKSxcbiAgICBzYXZlUGxhbjogKHBsYW46IFBsYW5SZWNvcmQpID0+IHdyaXRlKFNUT1JBR0VfS0VZUy5wbGFuLCBQbGFuUmVjb3JkU2NoZW1hLnBhcnNlKHBsYW4pKSxcblxuICAgIGxvYWRVbmRvOiAoKSA9PiByZWFkKFNUT1JBR0VfS0VZUy51bmRvLCBVbmRvU25hcHNob3RTY2hlbWEpLFxuICAgIHNhdmVVbmRvOiAoc25hcHNob3Q6IFVuZG9TbmFwc2hvdCkgPT5cbiAgICAgIHdyaXRlKFNUT1JBR0VfS0VZUy51bmRvLCBVbmRvU25hcHNob3RTY2hlbWEucGFyc2Uoc25hcHNob3QpKSxcblxuICAgIGFzeW5jIGNsZWFyKGtleXMpIHtcbiAgICAgIGNvbnN0IHN0b3JhZ2VLZXlzID0ga2V5cy5tYXAoKGspID0+IFNUT1JBR0VfS0VZU1trXSk7XG4gICAgICBhd2FpdCBhcmVhLnJlbW92ZShzdG9yYWdlS2V5cyk7XG4gICAgfSxcbiAgfTtcbn1cblxuLyoqIOaJqeWxleWQr+WKqOaXtuiwg+eUqO+8mumZkOWItiBzdG9yYWdlLmxvY2FsIOS7heWPr+S/oeS4iuS4i+aWh+WPr+iuv+mXruOAgiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGVuZm9yY2VUcnVzdGVkQ29udGV4dHMoKTogUHJvbWlzZTx2b2lkPiB7XG4gIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldEFjY2Vzc0xldmVsKHsgYWNjZXNzTGV2ZWw6ICdUUlVTVEVEX0NPTlRFWFRTJyB9KTtcbn1cbiIsImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHtcbiAgSm9iU3RhdGVTY2hlbWEsXG4gIFNjYW5SZXN1bHRTY2hlbWEsXG4gIEZhaWx1cmVJdGVtU2NoZW1hLFxuICBKT0JfU1RBVFVTRVMsXG59IGZyb20gJy4vc2NoZW1hcyc7XG5cbi8qKlxuICogRGFzaGJvYXJkIOS4jiBTZXJ2aWNlIFdvcmtlciDkuYvpl7TnmoTnsbvlnovljJbljY/orq7jgIJcbiAqIOaJgOaciea2iOaBr+mDveW/hemhu+mAmui/hyBab2Qg5qCh6aqM77yM5pyq55+l5ZG95Luk55u05o6l5ouS57ud77yI6KeB5p625p6E5pa55qGI56ysIDEx44CBMTIg6IqC77yJ44CCXG4gKi9cblxuLy8gLS0tLS0tLS0tLSDor7fmsYLvvIhEYXNoYm9hcmQg4oaSIFNlcnZpY2UgV29ya2Vy77yJIC0tLS0tLS0tLS1cblxuZXhwb3J0IGNvbnN0IEdldFN0YXR1c1JlcXVlc3RTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR5cGU6IHoubGl0ZXJhbCgnR0VUX1NUQVRVUycpLFxuICByZXF1ZXN0SWQ6IHouc3RyaW5nKCksXG59KTtcblxuZXhwb3J0IGNvbnN0IFNjYW5Cb29rbWFya3NSZXF1ZXN0U2NoZW1hID0gei5vYmplY3Qoe1xuICB0eXBlOiB6LmxpdGVyYWwoJ1NDQU5fQk9PS01BUktTJyksXG4gIHJlcXVlc3RJZDogei5zdHJpbmcoKSxcbiAgam9iSWQ6IHouc3RyaW5nKCksXG59KTtcblxuZXhwb3J0IGNvbnN0IEFwcGx5UGxhblJlcXVlc3RTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR5cGU6IHoubGl0ZXJhbCgnQVBQTFlfUExBTicpLFxuICByZXF1ZXN0SWQ6IHouc3RyaW5nKCksXG4gIGpvYklkOiB6LnN0cmluZygpLFxufSk7XG5cbmV4cG9ydCBjb25zdCBSZXRyeUZhaWxlZFJlcXVlc3RTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR5cGU6IHoubGl0ZXJhbCgnUkVUUllfRkFJTEVEJyksXG4gIHJlcXVlc3RJZDogei5zdHJpbmcoKSxcbiAgam9iSWQ6IHouc3RyaW5nKCksXG59KTtcblxuZXhwb3J0IGNvbnN0IFVuZG9MYXN0QXBwbHlSZXF1ZXN0U2NoZW1hID0gei5vYmplY3Qoe1xuICB0eXBlOiB6LmxpdGVyYWwoJ1VORE9fTEFTVF9BUFBMWScpLFxuICByZXF1ZXN0SWQ6IHouc3RyaW5nKCksXG4gIGpvYklkOiB6LnN0cmluZygpLFxufSk7XG5cbmV4cG9ydCBjb25zdCBDYW5jZWxKb2JSZXF1ZXN0U2NoZW1hID0gei5vYmplY3Qoe1xuICB0eXBlOiB6LmxpdGVyYWwoJ0NBTkNFTF9KT0InKSxcbiAgcmVxdWVzdElkOiB6LnN0cmluZygpLFxuICBqb2JJZDogei5zdHJpbmcoKSxcbn0pO1xuXG5leHBvcnQgY29uc3QgUmVxdWVzdFNjaGVtYSA9IHouZGlzY3JpbWluYXRlZFVuaW9uKCd0eXBlJywgW1xuICBHZXRTdGF0dXNSZXF1ZXN0U2NoZW1hLFxuICBTY2FuQm9va21hcmtzUmVxdWVzdFNjaGVtYSxcbiAgQXBwbHlQbGFuUmVxdWVzdFNjaGVtYSxcbiAgUmV0cnlGYWlsZWRSZXF1ZXN0U2NoZW1hLFxuICBVbmRvTGFzdEFwcGx5UmVxdWVzdFNjaGVtYSxcbiAgQ2FuY2VsSm9iUmVxdWVzdFNjaGVtYSxcbl0pO1xuZXhwb3J0IHR5cGUgUmVxdWVzdE1lc3NhZ2UgPSB6LmluZmVyPHR5cGVvZiBSZXF1ZXN0U2NoZW1hPjtcblxuLy8gLS0tLS0tLS0tLSDlk43lupTvvIhTZXJ2aWNlIFdvcmtlciDihpIgRGFzaGJvYXJk77yJIC0tLS0tLS0tLS1cblxuZXhwb3J0IGNvbnN0IFJlc3BvbnNlU2NoZW1hID0gei51bmlvbihbXG4gIHoub2JqZWN0KHsgb2s6IHoubGl0ZXJhbCh0cnVlKSwgcmVxdWVzdElkOiB6LnN0cmluZygpLCBwYXlsb2FkOiB6LnVua25vd24oKSB9KSxcbiAgei5vYmplY3Qoe1xuICAgIG9rOiB6LmxpdGVyYWwoZmFsc2UpLFxuICAgIHJlcXVlc3RJZDogei5zdHJpbmcoKSxcbiAgICBlcnJvcjogRmFpbHVyZUl0ZW1TY2hlbWEsXG4gIH0pLFxuXSk7XG5leHBvcnQgdHlwZSBSZXNwb25zZU1lc3NhZ2UgPSB6LmluZmVyPHR5cGVvZiBSZXNwb25zZVNjaGVtYT47XG5cbi8vIC0tLS0tLS0tLS0g5LqL5Lu277yIU2VydmljZSBXb3JrZXIg4oaSIERhc2hib2FyZCDlub/mkq3vvIkgLS0tLS0tLS0tLVxuXG5leHBvcnQgY29uc3QgSm9iUHJvZ3Jlc3NFdmVudFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgdHlwZTogei5saXRlcmFsKCdKT0JfUFJPR1JFU1MnKSxcbiAgam9iSWQ6IHouc3RyaW5nKCksXG4gIHN0YXR1czogei5lbnVtKEpPQl9TVEFUVVNFUyksXG4gIHByb2Nlc3NlZDogei5udW1iZXIoKSxcbiAgdG90YWw6IHoubnVtYmVyKCksXG59KTtcblxuZXhwb3J0IGNvbnN0IEpvYkNvbXBsZXRlZEV2ZW50U2NoZW1hID0gei5vYmplY3Qoe1xuICB0eXBlOiB6LmxpdGVyYWwoJ0pPQl9DT01QTEVURUQnKSxcbiAgam9iSWQ6IHouc3RyaW5nKCksXG4gIGpvYjogSm9iU3RhdGVTY2hlbWEsXG59KTtcblxuZXhwb3J0IGNvbnN0IEpvYkludGVycnVwdGVkRXZlbnRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR5cGU6IHoubGl0ZXJhbCgnSk9CX0lOVEVSUlVQVEVEJyksXG4gIGpvYklkOiB6LnN0cmluZygpLFxuICBqb2I6IEpvYlN0YXRlU2NoZW1hLFxufSk7XG5cbmV4cG9ydCBjb25zdCBKb2JGYWlsZWRFdmVudFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgdHlwZTogei5saXRlcmFsKCdKT0JfRkFJTEVEJyksXG4gIGpvYklkOiB6LnN0cmluZygpLFxuICBqb2I6IEpvYlN0YXRlU2NoZW1hLFxufSk7XG5cbmV4cG9ydCBjb25zdCBFdmVudFNjaGVtYSA9IHouZGlzY3JpbWluYXRlZFVuaW9uKCd0eXBlJywgW1xuICBKb2JQcm9ncmVzc0V2ZW50U2NoZW1hLFxuICBKb2JDb21wbGV0ZWRFdmVudFNjaGVtYSxcbiAgSm9iSW50ZXJydXB0ZWRFdmVudFNjaGVtYSxcbiAgSm9iRmFpbGVkRXZlbnRTY2hlbWEsXG5dKTtcbmV4cG9ydCB0eXBlIEV2ZW50TWVzc2FnZSA9IHouaW5mZXI8dHlwZW9mIEV2ZW50U2NoZW1hPjtcblxuLyoqXG4gKiDmoKHpqozlhaXnq5nmtojmga/vvJvpnZ7ms5XmiJbmnKrnn6Xnsbvlnovov5Tlm54gbnVsbO+8jOeUseiwg+eUqOaWueebtOaOpeaLkue7neOAglxuICog6L+Z5piv6L6555WM5qCh6aqM77yM5raI5oGv5p2l6Ieq5ZCM5LiA5omp5bGV5YaF55qE6aG16Z2i77yM5L2G5LuN5oyJ5p625p6E5pa55qGI6KaB5rGC5Lil5qC85qCh6aqM44CCXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVJlcXVlc3QocmF3OiB1bmtub3duKTogUmVxdWVzdE1lc3NhZ2UgfCBudWxsIHtcbiAgY29uc3QgcmVzdWx0ID0gUmVxdWVzdFNjaGVtYS5zYWZlUGFyc2UocmF3KTtcbiAgcmV0dXJuIHJlc3VsdC5zdWNjZXNzID8gcmVzdWx0LmRhdGEgOiBudWxsO1xufVxuXG4vKiogR0VUX1NUQVRVUyDnmoTlk43lupTovb3ojbfvvJrku7vliqHjgIHmiavmj4/lkozmkqTplIDlj6/nlKjmgKfjgIIgKi9cbmV4cG9ydCBpbnRlcmZhY2UgU3RhdHVzUGF5bG9hZCB7XG4gIGpvYjogSm9iU3RhdGVTY2hlbWFUeXBlO1xuICBzY2FuOiBTY2FuUmVzdWx0U2NoZW1hVHlwZSB8IG51bGw7XG4gIGhhc1VuZG9TbmFwc2hvdDogYm9vbGVhbjtcbn1cbnR5cGUgSm9iU3RhdGVTY2hlbWFUeXBlID0gei5pbmZlcjx0eXBlb2YgSm9iU3RhdGVTY2hlbWE+O1xudHlwZSBTY2FuUmVzdWx0U2NoZW1hVHlwZSA9IHouaW5mZXI8dHlwZW9mIFNjYW5SZXN1bHRTY2hlbWE+O1xuIiwiaW1wb3J0IHsgZGVmaW5lQmFja2dyb3VuZCB9IGZyb20gJ3d4dC91dGlscy9kZWZpbmUtYmFja2dyb3VuZCc7XG5pbXBvcnQgeyBzY2FuQm9va21hcmtzIH0gZnJvbSAnQC9zcmMvYXBwbGljYXRpb24vc2NhbkJvb2ttYXJrcyc7XG5pbXBvcnQgeyBhcHBseVBsYW4gfSBmcm9tICdAL3NyYy9hcHBsaWNhdGlvbi9hcHBseVBsYW4nO1xuaW1wb3J0IHsgdW5kb0xhc3RBcHBseSB9IGZyb20gJ0Avc3JjL2FwcGxpY2F0aW9uL3VuZG9MYXN0QXBwbHknO1xuaW1wb3J0IHsgcmVzdW1lSm9iIH0gZnJvbSAnQC9zcmMvYXBwbGljYXRpb24vcmVzdW1lSm9iJztcbmltcG9ydCB0eXBlIHsgRXZlbnRzUG9ydCwgU3RvcmFnZVBvcnQgfSBmcm9tICdAL3NyYy9hcHBsaWNhdGlvbi9wb3J0cyc7XG5pbXBvcnQgeyBjcmVhdGVCb29rbWFya3NSZXBvc2l0b3J5IH0gZnJvbSAnQC9zcmMvaW5mcmFzdHJ1Y3R1cmUvY2hyb21lL2Jvb2ttYXJrc1JlcG9zaXRvcnknO1xuaW1wb3J0IHtcbiAgY3JlYXRlU3RvcmFnZVJlcG9zaXRvcnksXG4gIGVuZm9yY2VUcnVzdGVkQ29udGV4dHMsXG59IGZyb20gJ0Avc3JjL2luZnJhc3RydWN0dXJlL2Nocm9tZS9zdG9yYWdlUmVwb3NpdG9yeSc7XG5pbXBvcnQgeyBjYW5UcmFuc2l0aW9uIH0gZnJvbSAnQC9zcmMvZG9tYWluL29yZ2FuaXplL3N0YXRlTWFjaGluZSc7XG5pbXBvcnQgeyBjbGFzc2lmeUVycm9yIH0gZnJvbSAnQC9zcmMvc2hhcmVkL2Vycm9ycyc7XG5pbXBvcnQgeyBwYXJzZVJlcXVlc3QsIHR5cGUgUmVxdWVzdE1lc3NhZ2UgfSBmcm9tICdAL3NyYy9zaGFyZWQvbWVzc2FnZXMnO1xuaW1wb3J0IHR5cGUgeyBKb2JTdGF0ZSB9IGZyb20gJ0Avc3JjL3NoYXJlZC9zY2hlbWFzJztcblxuY29uc3QgREFTSEJPQVJEX1VSTCA9IGNocm9tZS5ydW50aW1lLmdldFVSTCgnL2Rhc2hib2FyZC5odG1sJyk7XG5cbi8qKlxuICogU2VydmljZSBXb3JrZXLvvJrmiYDmnInkuabnrb7lhpnmk43kvZznmoTllK/kuIDlhaXlj6PvvIjmnrbmnoTmlrnmoYjnrKwgMy4yIOiKgu+8ieOAglxuICogLSDngrnlh7vmianlsZXlm77moIfml7bmiZPlvIDmiJblpI3nlKggRGFzaGJvYXJkIOagh+etvumhte+8m1xuICogLSDmtojmga/ot6/nlLHvvJrmiYDmnInlhaXnq5nmtojmga/nu48gWm9kIOagoemqjO+8jOacquefpeWRveS7pOebtOaOpeaLkue7ne+8m1xuICogLSDov5vluqYv57uT5p6c5LqL5Lu2IGZpcmUtYW5kLWZvcmdldCDlub/mkq3vvIxEYXNoYm9hcmQg5LiN5Zyo57q/5pe25b+955Wl5Y+R6YCB5aSx6LSl44CCXG4gKi9cblxuZnVuY3Rpb24gY3JlYXRlRXZlbnRzUG9ydCgpOiBFdmVudHNQb3J0IHtcbiAgY29uc3QgZmlyZUFuZEZvcmdldCA9IChtZXNzYWdlOiB1bmtub3duKTogdm9pZCA9PiB7XG4gICAgdm9pZCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZShtZXNzYWdlKS5jYXRjaCgoKSA9PiB7XG4gICAgICAvLyDmsqHmnInmjqXmlLbmlrnvvIhEYXNoYm9hcmQg5YWz6Zet77yJ5pe25b+955Wl44CCXG4gICAgfSk7XG4gIH07XG4gIHJldHVybiB7XG4gICAgcHJvZ3Jlc3M6IChqb2JJZCwgc3RhdHVzLCBwcm9jZXNzZWQsIHRvdGFsKSA9PlxuICAgICAgZmlyZUFuZEZvcmdldCh7IHR5cGU6ICdKT0JfUFJPR1JFU1MnLCBqb2JJZCwgc3RhdHVzLCBwcm9jZXNzZWQsIHRvdGFsIH0pLFxuICAgIGNvbXBsZXRlZDogKGpvYikgPT4gZmlyZUFuZEZvcmdldCh7IHR5cGU6ICdKT0JfQ09NUExFVEVEJywgam9iSWQ6IGpvYi5qb2JJZCwgam9iIH0pLFxuICAgIGludGVycnVwdGVkOiAoam9iKSA9PiBmaXJlQW5kRm9yZ2V0KHsgdHlwZTogJ0pPQl9JTlRFUlJVUFRFRCcsIGpvYklkOiBqb2Iuam9iSWQsIGpvYiB9KSxcbiAgICBmYWlsZWQ6IChqb2IpID0+IGZpcmVBbmRGb3JnZXQoeyB0eXBlOiAnSk9CX0ZBSUxFRCcsIGpvYklkOiBqb2Iuam9iSWQsIGpvYiB9KSxcbiAgfTtcbn1cblxuLyoqIOaJk+W8gOaIluWkjeeUqOWUr+S4gOeahOWFqOmhtSBEYXNoYm9hcmQg5qCH562+6aG177yI5omp5bGV5a+56Ieq5bex55qEIG9yaWdpbiDmnInorr/pl67mnYPvvIzml6DpnIAgdGFicyDmnYPpmZDvvInjgIIgKi9cbmFzeW5jIGZ1bmN0aW9uIG9wZW5EYXNoYm9hcmQoKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7IHVybDogYCR7REFTSEJPQVJEX1VSTH0qYCB9KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB0YWJzWzBdO1xuICBpZiAoZXhpc3Rpbmc/LmlkICE9PSB1bmRlZmluZWQpIHtcbiAgICBhd2FpdCBjaHJvbWUudGFicy51cGRhdGUoZXhpc3RpbmcuaWQsIHsgYWN0aXZlOiB0cnVlIH0pO1xuICAgIGlmIChleGlzdGluZy53aW5kb3dJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBhd2FpdCBjaHJvbWUud2luZG93cy51cGRhdGUoZXhpc3Rpbmcud2luZG93SWQsIHsgZm9jdXNlZDogdHJ1ZSB9KS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cbiAgYXdhaXQgY2hyb21lLnRhYnMuY3JlYXRlKHsgdXJsOiBEQVNIQk9BUkRfVVJMLCBhY3RpdmU6IHRydWUgfSk7XG59XG5cbi8qKiDmiavmj4/or7fmsYLnmoTku7vliqHop6PmnpDvvJrlj6/ku47lvZPliY3nirbmgIHnu6fnu63ml7blpI3nlKjvvIzlkKbliJnmjaLmlrDku7vliqHph43mlrDlvIDlp4vjgIIgKi9cbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVKb2JGb3JTY2FuKHN0b3JhZ2U6IFN0b3JhZ2VQb3J0LCBqb2JJZDogc3RyaW5nKTogUHJvbWlzZTxKb2JTdGF0ZT4ge1xuICBjb25zdCBleGlzdGluZyA9IGF3YWl0IHN0b3JhZ2UubG9hZEpvYigpO1xuICBpZiAoZXhpc3RpbmcgJiYgZXhpc3Rpbmcuam9iSWQgPT09IGpvYklkICYmIGNhblRyYW5zaXRpb24oZXhpc3Rpbmcuc3RhdHVzLCAnc2Nhbm5pbmcnKSkge1xuICAgIHJldHVybiBleGlzdGluZztcbiAgfVxuICByZXR1cm4ge1xuICAgIGpvYklkLFxuICAgIHN0YXR1czogJ2lkbGUnLFxuICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICBhcHBseUN1cnNvcjogMCxcbiAgICBhcHBsaWVkSWRzOiBbXSxcbiAgICBjcmVhdGVkRm9sZGVySWRzOiBbXSxcbiAgICBjYW5jZWxSZXF1ZXN0ZWQ6IGZhbHNlLFxuICAgIGZhaWx1cmVzOiBbXSxcbiAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlU2NhbihzdG9yYWdlOiBTdG9yYWdlUG9ydCwgam9iSWQ6IHN0cmluZyk6IFByb21pc2U8dW5rbm93bj4ge1xuICBjb25zdCBqb2IgPSBhd2FpdCByZXNvbHZlSm9iRm9yU2NhbihzdG9yYWdlLCBqb2JJZCk7XG4gIGNvbnN0IHNjYW4gPSBhd2FpdCBzY2FuQm9va21hcmtzKFxuICAgIHsgYm9va21hcmtzOiBjcmVhdGVCb29rbWFya3NSZXBvc2l0b3J5KCksIHN0b3JhZ2UsIGV2ZW50czogY3JlYXRlRXZlbnRzUG9ydCgpIH0sXG4gICAgam9iLFxuICApO1xuICBjb25zdCBzYXZlZCA9IGF3YWl0IHN0b3JhZ2UubG9hZEpvYigpO1xuICByZXR1cm4geyBzY2FuLCBqb2I6IHNhdmVkID8/IGpvYiB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVBcHBseShzdG9yYWdlOiBTdG9yYWdlUG9ydCwgam9iSWQ6IHN0cmluZyk6IFByb21pc2U8dW5rbm93bj4ge1xuICBjb25zdCBqb2IgPSBhd2FpdCBzdG9yYWdlLmxvYWRKb2IoKTtcbiAgY29uc3Qgc2NhbiA9IGF3YWl0IHN0b3JhZ2UubG9hZFNjYW4oKTtcbiAgY29uc3QgcGxhbiA9IGF3YWl0IHN0b3JhZ2UubG9hZFBsYW4oKTtcbiAgaWYgKCFqb2IgfHwgam9iLmpvYklkICE9PSBqb2JJZCkge1xuICAgIHRocm93IG5ldyBFcnJvcign5Lu75Yqh5LiN5a2Y5Zyo5oiW5bey6L+H5pyf77yM6K+36YeN5paw5omr5o+PJyk7XG4gIH1cbiAgaWYgKCFzY2FuKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCfmsqHmnInlj6/nlKjnmoTmiavmj4/nu5PmnpzvvIzor7flhYjmiavmj48nKTtcbiAgfVxuICBpZiAoIXBsYW4gfHwgcGxhbi5qb2JJZCAhPT0gam9iLmpvYklkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCfmsqHmnInlj6/nlKjnmoTliIbnsbvmlrnmoYjvvIzor7flhYjnlJ/miJDmlrnmoYgnKTtcbiAgfVxuICBjb25zdCByZXN1bHQgPSBhd2FpdCBhcHBseVBsYW4oXG4gICAgeyBib29rbWFya3M6IGNyZWF0ZUJvb2ttYXJrc1JlcG9zaXRvcnkoKSwgc3RvcmFnZSwgZXZlbnRzOiBjcmVhdGVFdmVudHNQb3J0KCkgfSxcbiAgICBqb2IsXG4gICAgc2Nhbi5ib29rbWFya3MsXG4gICAgcGxhbi5hc3NpZ25tZW50cyxcbiAgKTtcbiAgcmV0dXJuIHsgam9iOiByZXN1bHQuam9iIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVVuZG8oc3RvcmFnZTogU3RvcmFnZVBvcnQsIGpvYklkOiBzdHJpbmcpOiBQcm9taXNlPHVua25vd24+IHtcbiAgY29uc3Qgam9iID0gYXdhaXQgc3RvcmFnZS5sb2FkSm9iKCk7XG4gIGlmICgham9iIHx8IGpvYi5qb2JJZCAhPT0gam9iSWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ+S7u+WKoeS4jeWtmOWcqOaIluW3sui/h+acnycpO1xuICB9XG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHVuZG9MYXN0QXBwbHkoXG4gICAgeyBib29rbWFya3M6IGNyZWF0ZUJvb2ttYXJrc1JlcG9zaXRvcnkoKSwgc3RvcmFnZSwgZXZlbnRzOiBjcmVhdGVFdmVudHNQb3J0KCkgfSxcbiAgICBqb2IsXG4gICk7XG4gIHJldHVybiB7IGpvYjogcmVzdWx0LmpvYiwgY29uZmxpY3RzOiByZXN1bHQuY29uZmxpY3RzIH07XG59XG5cbi8qKiDmoIforrDlj5bmtojvvJrlhpnlhaXmjIHkuYXljJbmoIflv5fvvIzlupTnlKgv5pKk6ZSA5b6q546v5Zyo5q+P5Liq5Lmm562+5LmL6Ze06YeN6K+75qOA5p+l44CCICovXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVDYW5jZWwoc3RvcmFnZTogU3RvcmFnZVBvcnQsIGpvYklkOiBzdHJpbmcpOiBQcm9taXNlPHVua25vd24+IHtcbiAgY29uc3Qgam9iID0gYXdhaXQgc3RvcmFnZS5sb2FkSm9iKCk7XG4gIGlmICgham9iIHx8IGpvYi5qb2JJZCAhPT0gam9iSWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ+S7u+WKoeS4jeWtmOWcqOaIluW3sui/h+acnycpO1xuICB9XG4gIGNvbnN0IGNhbmNlbGxlZDogSm9iU3RhdGUgPSB7IC4uLmpvYiwgY2FuY2VsUmVxdWVzdGVkOiB0cnVlLCB1cGRhdGVkQXQ6IERhdGUubm93KCkgfTtcbiAgYXdhaXQgc3RvcmFnZS5zYXZlSm9iKGNhbmNlbGxlZCk7XG4gIHJldHVybiB7IGpvYjogY2FuY2VsbGVkIH07XG59XG5cbi8qKiDlpLHotKXml7bmiorku7vliqHokL3kuLogZmFpbGVkIOeKtuaAgeW5tuW5v+aSre+8jOS/neivgSBEYXNoYm9hcmQg6YeN5byA5ZCO5Y+v5oGi5aSN44CCICovXG5hc3luYyBmdW5jdGlvbiBtYXJrRmFpbGVkKHN0b3JhZ2U6IFN0b3JhZ2VQb3J0LCBqb2JJZDogc3RyaW5nIHwgbnVsbCwgZXJyb3I6IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcbiAgaWYgKCFqb2JJZCkgcmV0dXJuO1xuICBjb25zdCBqb2IgPSBhd2FpdCBzdG9yYWdlLmxvYWRKb2IoKTtcbiAgaWYgKCFqb2IgfHwgam9iLmpvYklkICE9PSBqb2JJZCkgcmV0dXJuO1xuICBjb25zdCBjbGFzc2lmaWVkID0gY2xhc3NpZnlFcnJvcihlcnJvcik7XG4gIGNvbnN0IGZhaWxlZDogSm9iU3RhdGUgPSB7XG4gICAgLi4uam9iLFxuICAgIHN0YXR1czogJ2ZhaWxlZCcsXG4gICAgZXJyb3I6IHsga2luZDogY2xhc3NpZmllZC5raW5kLCBtZXNzYWdlOiBjbGFzc2lmaWVkLm1lc3NhZ2UgfSxcbiAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gIH07XG4gIHRyeSB7XG4gICAgYXdhaXQgc3RvcmFnZS5zYXZlSm9iKGZhaWxlZCk7XG4gICAgY3JlYXRlRXZlbnRzUG9ydCgpLmZhaWxlZChmYWlsZWQpO1xuICB9IGNhdGNoIHtcbiAgICAvLyDnirbmgIHokL3nm5jlpLHotKXml7blj6rog73mlL7lvIPvvIzpgb/lhY3plJnor6/lvqrnjq/jgIJcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVCYWNrZ3JvdW5kKCgpID0+IHtcbiAgdm9pZCBlbmZvcmNlVHJ1c3RlZENvbnRleHRzKCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblxuICBjaHJvbWUuYWN0aW9uLm9uQ2xpY2tlZC5hZGRMaXN0ZW5lcigoKSA9PiB7XG4gICAgdm9pZCBvcGVuRGFzaGJvYXJkKCk7XG4gIH0pO1xuXG4gIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigocmF3OiB1bmtub3duLCBfc2VuZGVyLCBzZW5kUmVzcG9uc2UpID0+IHtcbiAgICBjb25zdCByZXF1ZXN0OiBSZXF1ZXN0TWVzc2FnZSB8IG51bGwgPSBwYXJzZVJlcXVlc3QocmF3KTtcbiAgICBpZiAoIXJlcXVlc3QpIHtcbiAgICAgIHNlbmRSZXNwb25zZSh7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgcmVxdWVzdElkOiB0eXBlb2YgKHJhdyBhcyB7IHJlcXVlc3RJZD86IHVua25vd24gfSk/LnJlcXVlc3RJZCA9PT0gJ3N0cmluZydcbiAgICAgICAgICA/IChyYXcgYXMgeyByZXF1ZXN0SWQ6IHN0cmluZyB9KS5yZXF1ZXN0SWRcbiAgICAgICAgICA6ICcnLFxuICAgICAgICBlcnJvcjogeyBraW5kOiAndmFsaWRhdGlvbicsIG1lc3NhZ2U6ICfmnKrnn6XmiJbpnZ7ms5XnmoTlkb3ku6QnIH0sXG4gICAgICB9KTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBzdG9yYWdlID0gY3JlYXRlU3RvcmFnZVJlcG9zaXRvcnkoY2hyb21lLnN0b3JhZ2UubG9jYWwpO1xuICAgIGNvbnN0IHJlcXVlc3RJZCA9IHJlcXVlc3QucmVxdWVzdElkO1xuICAgIGNvbnN0IGpvYklkID0gJ2pvYklkJyBpbiByZXF1ZXN0ID8gcmVxdWVzdC5qb2JJZCA6IG51bGw7XG5cbiAgICB2b2lkIChhc3luYyAoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBsZXQgcGF5bG9hZDogdW5rbm93bjtcbiAgICAgICAgc3dpdGNoIChyZXF1ZXN0LnR5cGUpIHtcbiAgICAgICAgICBjYXNlICdHRVRfU1RBVFVTJzpcbiAgICAgICAgICAgIHBheWxvYWQgPSBhd2FpdCByZXN1bWVKb2IoeyBzdG9yYWdlIH0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnU0NBTl9CT09LTUFSS1MnOlxuICAgICAgICAgICAgcGF5bG9hZCA9IGF3YWl0IGhhbmRsZVNjYW4oc3RvcmFnZSwgcmVxdWVzdC5qb2JJZCk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdBUFBMWV9QTEFOJzpcbiAgICAgICAgICBjYXNlICdSRVRSWV9GQUlMRUQnOlxuICAgICAgICAgICAgcGF5bG9hZCA9IGF3YWl0IGhhbmRsZUFwcGx5KHN0b3JhZ2UsIHJlcXVlc3Quam9iSWQpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnVU5ET19MQVNUX0FQUExZJzpcbiAgICAgICAgICAgIHBheWxvYWQgPSBhd2FpdCBoYW5kbGVVbmRvKHN0b3JhZ2UsIHJlcXVlc3Quam9iSWQpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnQ0FOQ0VMX0pPQic6XG4gICAgICAgICAgICBwYXlsb2FkID0gYXdhaXQgaGFuZGxlQ2FuY2VsKHN0b3JhZ2UsIHJlcXVlc3Quam9iSWQpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUsIHJlcXVlc3RJZCwgcGF5bG9hZCB9KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGF3YWl0IG1hcmtGYWlsZWQoc3RvcmFnZSwgam9iSWQsIGVycm9yKTtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCByZXF1ZXN0SWQsIGVycm9yOiBjbGFzc2lmeUVycm9yKGVycm9yKSB9KTtcbiAgICAgIH1cbiAgICB9KSgpO1xuXG4gICAgLy8g5byC5q2l5ZON5bqU77ya5L+d5oyB5raI5oGv6YCa6YGT5byA5pS+44CCXG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xufSk7XG4iLCIvLyAjcmVnaW9uIHNuaXBwZXRcbmV4cG9ydCBjb25zdCBicm93c2VyID0gZ2xvYmFsVGhpcy5icm93c2VyPy5ydW50aW1lPy5pZFxuICA/IGdsb2JhbFRoaXMuYnJvd3NlclxuICA6IGdsb2JhbFRoaXMuY2hyb21lO1xuLy8gI2VuZHJlZ2lvbiBzbmlwcGV0XG4iLCJpbXBvcnQgeyBicm93c2VyIGFzIGJyb3dzZXIkMSB9IGZyb20gXCJAd3h0LWRldi9icm93c2VyXCI7XG4vLyNyZWdpb24gc3JjL2Jyb3dzZXIudHNcbi8qKlxuKiBDb250YWlucyB0aGUgYGJyb3dzZXJgIGV4cG9ydCB3aGljaCB5b3Ugc2hvdWxkIHVzZSB0byBhY2Nlc3MgdGhlIGV4dGVuc2lvblxuKiBBUElzIGluIHlvdXIgcHJvamVjdDpcbipcbiogYGBgdHNcbiogaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gJ3d4dC9icm93c2VyJztcbipcbiogYnJvd3Nlci5ydW50aW1lLm9uSW5zdGFsbGVkLmFkZExpc3RlbmVyKCgpID0+IHtcbiogICAvLyAuLi5cbiogfSk7XG4qIGBgYFxuKlxuKiBAbW9kdWxlIHd4dC9icm93c2VyXG4qL1xuY29uc3QgYnJvd3NlciA9IGJyb3dzZXIkMTtcbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgYnJvd3NlciB9O1xuIiwiLy8jcmVnaW9uIHNyYy9pbmRleC50c1xuLyoqXG4qIENsYXNzIGZvciBwYXJzaW5nIGFuZCBwZXJmb3JtaW5nIG9wZXJhdGlvbnMgb24gbWF0Y2ggcGF0dGVybnMuXG4qXG4qIEBleGFtcGxlXG4qICAgY29uc3QgcGF0dGVybiA9IG5ldyBNYXRjaFBhdHRlcm4oJyo6Ly9nb29nbGUuY29tLyonKTtcbipcbiogICBwYXR0ZXJuLmluY2x1ZGVzKCdodHRwczovL2dvb2dsZS5jb20nKTsgLy8gdHJ1ZVxuKiAgIHBhdHRlcm4uaW5jbHVkZXMoJ2h0dHA6Ly95b3V0dWJlLmNvbS93YXRjaD92PTEyMycpOyAvLyBmYWxzZVxuKi9cbnZhciBNYXRjaFBhdHRlcm4gPSBjbGFzcyBNYXRjaFBhdHRlcm4ge1xuXHRzdGF0aWMge1xuXHRcdHRoaXMuUFJPVE9DT0xTID0gW1xuXHRcdFx0XCJodHRwXCIsXG5cdFx0XHRcImh0dHBzXCIsXG5cdFx0XHRcImZpbGVcIixcblx0XHRcdFwiZnRwXCIsXG5cdFx0XHRcInVyblwiLFxuXHRcdFx0XCJ3c1wiLFxuXHRcdFx0XCJ3c3NcIlxuXHRcdF07XG5cdH1cblx0LyoqXG5cdCogUGFyc2UgYSBtYXRjaCBwYXR0ZXJuIHN0cmluZy4gSWYgaXQgaXMgaW52YWxpZCwgdGhlIGNvbnN0cnVjdG9yIHdpbGwgdGhyb3cgYW5cblx0KiBgSW52YWxpZE1hdGNoUGF0dGVybmAgZXJyb3IuXG5cdCpcblx0KiBAcGFyYW0gbWF0Y2hQYXR0ZXJuIFRoZSBtYXRjaCBwYXR0ZXJuIHRvIHBhcnNlLlxuXHQqL1xuXHRjb25zdHJ1Y3RvcihtYXRjaFBhdHRlcm4pIHtcblx0XHRpZiAobWF0Y2hQYXR0ZXJuID09PSBcIjxhbGxfdXJscz5cIikge1xuXHRcdFx0dGhpcy5pc0FsbFVybHMgPSB0cnVlO1xuXHRcdFx0dGhpcy5wcm90b2NvbE1hdGNoZXMgPSBbLi4uTWF0Y2hQYXR0ZXJuLlBST1RPQ09MU107XG5cdFx0XHR0aGlzLmhvc3RuYW1lTWF0Y2ggPSBcIipcIjtcblx0XHRcdHRoaXMucGF0aG5hbWVNYXRjaCA9IFwiKlwiO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBncm91cHMgPSAvKC4qKTpcXC9cXC8oLio/KShcXC8uKikvLmV4ZWMobWF0Y2hQYXR0ZXJuKTtcblx0XHRcdGlmIChncm91cHMgPT0gbnVsbCkgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4obWF0Y2hQYXR0ZXJuLCBcIkluY29ycmVjdCBmb3JtYXRcIik7XG5cdFx0XHRjb25zdCBbXywgcHJvdG9jb2wsIGhvc3RuYW1lLCBwYXRobmFtZV0gPSBncm91cHM7XG5cdFx0XHR2YWxpZGF0ZVByb3RvY29sKG1hdGNoUGF0dGVybiwgcHJvdG9jb2wpO1xuXHRcdFx0dmFsaWRhdGVIb3N0bmFtZShtYXRjaFBhdHRlcm4sIGhvc3RuYW1lKTtcblx0XHRcdHRoaXMucHJvdG9jb2xNYXRjaGVzID0gcHJvdG9jb2wgPT09IFwiKlwiID8gW1wiaHR0cFwiLCBcImh0dHBzXCJdIDogW3Byb3RvY29sXTtcblx0XHRcdHRoaXMuaG9zdG5hbWVNYXRjaCA9IGhvc3RuYW1lO1xuXHRcdFx0dGhpcy5wYXRobmFtZU1hdGNoID0gcGF0aG5hbWU7XG5cdFx0fVxuXHR9XG5cdC8qKiBDaGVjayBpZiBhIFVSTCBpcyBpbmNsdWRlZCBpbiBhIHBhdHRlcm4uICovXG5cdGluY2x1ZGVzKHVybCkge1xuXHRcdGNvbnN0IHUgPSB0eXBlb2YgdXJsID09PSBcInN0cmluZ1wiID8gbmV3IFVSTCh1cmwpIDogdXJsIGluc3RhbmNlb2YgTG9jYXRpb24gPyBuZXcgVVJMKHVybC5ocmVmKSA6IHVybDtcblx0XHRpZiAodGhpcy5pc0FsbFVybHMpIHJldHVybiAhdGhpcy5pc1Vua25vd25Qcm90b2NvbCh1KTtcblx0XHRyZXR1cm4gISF0aGlzLnByb3RvY29sTWF0Y2hlcy5maW5kKChwcm90b2NvbCkgPT4ge1xuXHRcdFx0aWYgKHByb3RvY29sID09PSBcImh0dHBcIikgcmV0dXJuIHRoaXMuaXNIdHRwTWF0Y2godSk7XG5cdFx0XHRpZiAocHJvdG9jb2wgPT09IFwiaHR0cHNcIikgcmV0dXJuIHRoaXMuaXNIdHRwc01hdGNoKHUpO1xuXHRcdFx0aWYgKHByb3RvY29sID09PSBcImZpbGVcIikgcmV0dXJuIHRoaXMuaXNGaWxlTWF0Y2godSk7XG5cdFx0XHRpZiAocHJvdG9jb2wgPT09IFwiZnRwXCIpIHJldHVybiB0aGlzLmlzRnRwTWF0Y2godSk7XG5cdFx0XHRpZiAocHJvdG9jb2wgPT09IFwidXJuXCIpIHJldHVybiB0aGlzLmlzVXJuTWF0Y2godSk7XG5cdFx0fSk7XG5cdH1cblx0aXNIdHRwTWF0Y2godXJsKSB7XG5cdFx0cmV0dXJuIHVybC5wcm90b2NvbCA9PT0gXCJodHRwOlwiICYmIHRoaXMuaXNIb3N0UGF0aE1hdGNoKHVybCk7XG5cdH1cblx0aXNIdHRwc01hdGNoKHVybCkge1xuXHRcdHJldHVybiB1cmwucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgJiYgdGhpcy5pc0hvc3RQYXRoTWF0Y2godXJsKTtcblx0fVxuXHRpc0hvc3RQYXRoTWF0Y2godXJsKSB7XG5cdFx0aWYgKCF0aGlzLmhvc3RuYW1lTWF0Y2ggfHwgIXRoaXMucGF0aG5hbWVNYXRjaCkgcmV0dXJuIGZhbHNlO1xuXHRcdGNvbnN0IGhvc3RuYW1lTWF0Y2hSZWdleHMgPSBbdGhpcy5jb252ZXJ0UGF0dGVyblRvUmVnZXgodGhpcy5ob3N0bmFtZU1hdGNoKSwgdGhpcy5jb252ZXJ0UGF0dGVyblRvUmVnZXgodGhpcy5ob3N0bmFtZU1hdGNoLnJlcGxhY2UoL15cXCpcXC4vLCBcIlwiKSldO1xuXHRcdGNvbnN0IHBhdGhuYW1lTWF0Y2hSZWdleCA9IHRoaXMuY29udmVydFBhdHRlcm5Ub1JlZ2V4KHRoaXMucGF0aG5hbWVNYXRjaCk7XG5cdFx0cmV0dXJuICEhaG9zdG5hbWVNYXRjaFJlZ2V4cy5maW5kKChyZWdleCkgPT4gcmVnZXgudGVzdCh1cmwuaG9zdG5hbWUpKSAmJiBwYXRobmFtZU1hdGNoUmVnZXgudGVzdCh1cmwucGF0aG5hbWUpO1xuXHR9XG5cdGlzVW5rbm93blByb3RvY29sKHVybCkge1xuXHRcdHJldHVybiAhdGhpcy5wcm90b2NvbE1hdGNoZXMuaW5jbHVkZXModXJsLnByb3RvY29sLnNsaWNlKDAsIC0xKSk7XG5cdH1cblx0aXNQYXRoTWF0Y2godXJsKSB7XG5cdFx0aWYgKCF0aGlzLnBhdGhuYW1lTWF0Y2gpIHJldHVybiBmYWxzZTtcblx0XHRyZXR1cm4gdGhpcy5jb252ZXJ0UGF0dGVyblRvUmVnZXgodGhpcy5wYXRobmFtZU1hdGNoKS50ZXN0KHVybC5wYXRobmFtZSk7XG5cdH1cblx0aXNGaWxlTWF0Y2godXJsKSB7XG5cdFx0cmV0dXJuIHVybC5wcm90b2NvbCA9PT0gXCJmaWxlOlwiICYmIHRoaXMuaXNQYXRoTWF0Y2godXJsKTtcblx0fVxuXHRpc0Z0cE1hdGNoKF91cmwpIHtcblx0XHR0aHJvdyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZDogZnRwOi8vIHBhdHRlcm4gbWF0Y2hpbmcuIE9wZW4gYSBQUiB0byBhZGQgc3VwcG9ydFwiKTtcblx0fVxuXHRpc1Vybk1hdGNoKF91cmwpIHtcblx0XHR0aHJvdyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZDogdXJuOi8vIHBhdHRlcm4gbWF0Y2hpbmcuIE9wZW4gYSBQUiB0byBhZGQgc3VwcG9ydFwiKTtcblx0fVxuXHRjb252ZXJ0UGF0dGVyblRvUmVnZXgocGF0dGVybikge1xuXHRcdGNvbnN0IHN0YXJzUmVwbGFjZWQgPSB0aGlzLmVzY2FwZUZvclJlZ2V4KHBhdHRlcm4pLnJlcGxhY2UoL1xcXFxcXCovZywgXCIuKlwiKTtcblx0XHRyZXR1cm4gUmVnRXhwKGBeJHtzdGFyc1JlcGxhY2VkfSRgKTtcblx0fVxuXHRlc2NhcGVGb3JSZWdleChzdHJpbmcpIHtcblx0XHRyZXR1cm4gc3RyaW5nLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCBcIlxcXFwkJlwiKTtcblx0fVxufTtcbnZhciBJbnZhbGlkTWF0Y2hQYXR0ZXJuID0gY2xhc3MgZXh0ZW5kcyBFcnJvciB7XG5cdGNvbnN0cnVjdG9yKG1hdGNoUGF0dGVybiwgcmVhc29uKSB7XG5cdFx0c3VwZXIoYEludmFsaWQgbWF0Y2ggcGF0dGVybiBcIiR7bWF0Y2hQYXR0ZXJufVwiOiAke3JlYXNvbn1gKTtcblx0fVxufTtcbmZ1bmN0aW9uIHZhbGlkYXRlUHJvdG9jb2wobWF0Y2hQYXR0ZXJuLCBwcm90b2NvbCkge1xuXHRpZiAoIU1hdGNoUGF0dGVybi5QUk9UT0NPTFMuaW5jbHVkZXMocHJvdG9jb2wpICYmIHByb3RvY29sICE9PSBcIipcIikgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4obWF0Y2hQYXR0ZXJuLCBgJHtwcm90b2NvbH0gbm90IGEgdmFsaWQgcHJvdG9jb2wgKCR7TWF0Y2hQYXR0ZXJuLlBST1RPQ09MUy5qb2luKFwiLCBcIil9KWApO1xufVxuZnVuY3Rpb24gdmFsaWRhdGVIb3N0bmFtZShtYXRjaFBhdHRlcm4sIGhvc3RuYW1lKSB7XG5cdGlmIChob3N0bmFtZS5pbmNsdWRlcyhcIjpcIikpIHRocm93IG5ldyBJbnZhbGlkTWF0Y2hQYXR0ZXJuKG1hdGNoUGF0dGVybiwgYEhvc3RuYW1lIGNhbm5vdCBpbmNsdWRlIGEgcG9ydGApO1xuXHRpZiAoaG9zdG5hbWUuaW5jbHVkZXMoXCIqXCIpICYmIGhvc3RuYW1lLmxlbmd0aCA+IDEgJiYgIWhvc3RuYW1lLnN0YXJ0c1dpdGgoXCIqLlwiKSkgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4obWF0Y2hQYXR0ZXJuLCBgSWYgdXNpbmcgYSB3aWxkY2FyZCAoKiksIGl0IG11c3QgZ28gYXQgdGhlIHN0YXJ0IG9mIHRoZSBob3N0bmFtZWApO1xufVxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBJbnZhbGlkTWF0Y2hQYXR0ZXJuLCBNYXRjaFBhdHRlcm4gfTtcbiJdLCJ4X2dvb2dsZV9pZ25vcmVMaXN0IjpbMCwxMSwxMiwxMywxNCwxNSwxNiwxNywyMiwyMywyNF0sIm1hcHBpbmdzIjoiOztDQUNBLFNBQVMsaUJBQWlCLEtBQUs7RUFDOUIsSUFBSSxPQUFPLFFBQVEsT0FBTyxRQUFRLFlBQVksT0FBTyxFQUFFLE1BQU0sSUFBSTtFQUNqRSxPQUFPO0NBQ1I7OztDQ1lBLFNBQWdCLFNBQVMsTUFBNkI7RUFDcEQsT0FBTyxLQUFLLFFBQVEsS0FBQTtDQUN0QjtDQUVBLFNBQWdCLGVBQWUsTUFBNkI7RUFDMUQsT0FBTyxLQUFLLGlCQUFpQixLQUFBLEtBQWEsS0FBSyxpQkFBaUI7Q0FDbEU7Ozs7Ozs7O0NDYkEsU0FBZ0IsY0FBYyxNQUFzQztFQUNsRSxJQUFJLEtBQUssV0FBVyxLQUFLLEtBQUssRUFBRSxFQUFFLFVBQVUsUUFBUTtHQUNsRCxNQUFNLE1BQU0sS0FBSztHQUNqQixNQUFNLFdBQVcsSUFBSTtHQUVyQixJQUFJLENBQUMsSUFBSSxZQUFZLFlBQVksU0FBUyxPQUFPLE1BQU0sU0FBUyxDQUFDLENBQUMsR0FDaEUsT0FBTztFQUVYO0VBQ0EsT0FBTyxLQUFLLFFBQVEsTUFBTSxDQUFDLEVBQUUsWUFBWSxTQUFTLENBQUMsQ0FBQztD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QUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLEtBQUs7RUFDNUQ7RUFDQSxJQUFJLFVBQVU7R0FDVixPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLE9BQU87RUFDOUQ7RUFDQSxJQUFJLFNBQVM7R0FDVCxPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLE1BQU07RUFDN0Q7RUFDQSxJQUFJLFdBQVc7R0FDWCxPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLFFBQVE7RUFDL0Q7RUFDQSxJQUFJLFNBQVM7R0FDVCxPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLE1BQU07RUFDN0Q7RUFDQSxJQUFJLFVBQVU7R0FDVixPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLE9BQU87RUFDOUQ7RUFDQSxJQUFJLFNBQVM7R0FDVCxPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLE1BQU07RUFDN0Q7RUFDQSxJQUFJLE9BQU87R0FDUCxPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLElBQUk7RUFDM0Q7RUFDQSxJQUFJLFNBQVM7R0FDVCxPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLE1BQU07RUFDN0Q7RUFDQSxJQUFJLFdBQVc7R0FDWCxPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLFFBQVE7RUFDL0Q7RUFDQSxJQUFJLGNBQWM7R0FFZCxPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLFdBQVc7RUFDbEU7RUFDQSxJQUFJLFlBQVk7R0FDWixJQUFJLE1BQU07R0FDVixLQUFLLE1BQU0s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