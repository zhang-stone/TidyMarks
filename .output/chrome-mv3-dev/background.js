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
					dateAdded: child.dateAdded,
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
	//#region src/shared/i18n/index.ts
	var DICTS = {
		"zh-CN": {
			app: {
				title: "TidyMarks",
				steps: {
					scan: "扫描",
					select: "选择",
					organizing: "整理",
					preview: "预览",
					result: "完成"
				}
			},
			common: {
				back: "返回",
				settings: "设置",
				closeSettings: "关闭设置",
				save: "保存",
				cancel: "取消",
				untitled: "无标题",
				loading: "正在加载...",
				deleting: "正在删除...",
				scanningAction: "正在扫描...",
				unorganized: "未整理",
				countBookmarks: "{n} 条"
			},
			busy: {
				scan: "正在扫描书签...",
				deleteEmptyFolders: "正在删除空文件夹...",
				deleteDuplicates: "正在删除重复书签...",
				generatePlan: "正在生成整理方案...",
				applyPlan: "正在应用整理方案...",
				retry: "正在重试失败项...",
				undo: "正在撤销最近一次整理...",
				cancel: "正在请求中断..."
			},
			settings: {
				title: "模型设置",
				subtitle: "配置你自己的 OpenAI 兼容 API，所有请求直接从浏览器发出。",
				baseUrlLabel: "Base URL",
				baseUrlPlaceholder: "https://api.openai.com/v1",
				baseUrlHelper: "仅支持 HTTPS；保存时会向浏览器申请该地址的访问权限。",
				apiKeyLabel: "API Key",
				apiKeyPlaceholder: "sk-...",
				apiKeyHelper: "只存储在本地 chrome.storage，不会上传到任何服务器。",
				modelLabel: "模型名",
				modelPlaceholder: "gpt-4o-mini",
				modelHelper: "需要支持 JSON 结构化输出的对话模型。",
				invalidForm: "请填写合法的 HTTPS Base URL、API Key 和模型名",
				permissionDenied: "未授予该 API 地址的访问权限",
				testing: "测试中...",
				testConnection: "测试连接",
				testSuccess: "连接成功，模型支持结构化输出",
				testFailed: "连接失败：{msg}",
				testPrompt: "请回复 ok",
				needSettings: "请先完成模型设置"
			},
			scan: {
				titleIdle: "扫描书签",
				titleDone: "扫描完成，查看书签统计信息",
				subtitleIdle: "正在读取你的书签树...",
				start: "开始扫描",
				totalBookmarks: "书签总数",
				folders: "文件夹",
				organizable: "可整理书签",
				noTitle: "无标题",
				chooseFeature: "选择功能",
				organize: "整理书签",
				organizeDesc: "AI 自动分类，重建目录结构",
				selectScope: "选择范围 →",
				duplicates: "检查重复书签",
				duplicatesDesc: "找出相同或相似的重复项",
				duplicateResults: "查看 {n} 组结果 →",
				noDuplicates: "未发现重复项",
				emptyFolders: "清理空文件夹",
				emptyFoldersDesc: "删除不含任何书签的空目录",
				emptyFolderResults: "发现 {n} 个空文件夹 →",
				noEmptyFolders: "没有空文件夹",
				deleteSummary: "{deleted} 个已删除，{failed} 个删除失败",
				settingsRequired: "请先完成模型设置",
				progressDone: "扫描完成"
			},
			duplicates: {
				back: "返回",
				foundSummary: "共发现 {n} 个重复",
				title: "重复书签",
				subtitle: "每组保留一项，其余可删除。可先忽略不处理的组。",
				empty: "没有发现重复书签",
				labelSameUrl: "相同网址",
				labelSimilarUrl: "相似网址",
				labelSameTitle: "相同标题",
				ignore: "忽略",
				restore: "恢复",
				keepAria: "保留 {title}",
				willDelete: "将删除 {n} 个重复书签",
				deleteAction: "删除重复项"
			},
			emptyFolders: {
				back: "返回",
				foundSummary: "共发现 {n} 个空文件夹",
				title: "清理空文件夹",
				subtitle: "只删除不包含任何书签的空目录。",
				empty: "没有空文件夹",
				deleteAria: "删除 {path}",
				willDelete: "将删除 {n} 个空文件夹",
				deleteAction: "删除空文件夹"
			},
			select: {
				title: "选择整理范围",
				subtitle: "点击文件夹查看书签，勾选要整理的内容",
				folderTree: "书签文件夹",
				loadingTree: "正在加载文件夹树...",
				viewOnly: "书签仅供查看",
				noBookmarks: "该文件夹下无书签",
				clickFolder: "点击左侧文件夹查看书签",
				modeTitle: "选择整理模式",
				conservative: "保守整理",
				conservativeDesc: "保留现有目录结构，只把书签归入已有文件夹",
				reorganize: "重新规划目录",
				reorganizeDesc: "AI 自由设计全新的目录体系，重组所有选中书签",
				nameStyleTitle: "文件夹命名风格",
				emojiText: "图标 + 文字",
				emojiTextDesc: "用 emoji 前缀区分目录，一眼辨认",
				textOnly: "纯文字",
				textOnlyDesc: "保持简洁，不添加 emoji",
				selectedSummary: "已选 {folders} 个文件夹，共 {count} 条书签",
				startAnalysis: "AI 开始分析 ({n} 条) →",
				exampleEmojiFolder: "📚 学习资料",
				exampleTextFolder: "学习资料"
			},
			organizing: {
				title: "AI 正在分析",
				subtitle: "根据标题、URL 和当前目录生成分类建议",
				stepRead: "读取书签数据...",
				stepReadDesc: "仅读取标题、URL 和当前目录，不访问网页",
				stepDesign: "生成目录体系",
				stepDesignDesc: "AI 根据书签内容设计分类目录",
				stepAssign: "分配书签",
				stepAssignDesc: "把每条书签归入最合适的目录",
				stepValidate: "校验结果",
				stepValidateDesc: "检查目录层级与书签归属是否合法",
				stepDone: "方案就绪",
				stepDoneDesc: "即将进入预览，可确认后再写入",
				taxonomy: "生成目录体系",
				assign: "分配书签",
				privacy: "隐私说明：书签的标题、URL 与目录路径会发送给你配置的模型服务用于分类；扩展自身不收集、不上传到任何其他服务器。",
				prevStep: "← 上一步"
			},
			preview: {
				title: "预览整理建议",
				subtitle: "书签仅供查看。文件夹标注「新」表示将新建该目录。",
				willMove: "将移动",
				newFolders: "新建目录",
				cleanupScope: "清理范围",
				treeTitle: "整理后的书签目录树",
				cleanupDesc: "仅清理所选文件夹范围内的空目录，可一键撤销",
				back: "返回",
				applyAction: "应用方案并清理空目录 ({n} 条) →",
				badgeNew: "新",
				viewOnly: "书签仅供查看"
			},
			result: {
				writingTitle: "正在写入书签",
				writingDesc: "逐条移动书签，并清理所选范围内的空文件夹",
				doneTitle: "整理完成",
				doneDesc: "成功移动 {n} 条书签到新目录",
				undoneTitle: "已撤销",
				undoneDesc: "已撤销最近一次整理，书签已还原",
				interruptedTitle: "已中断",
				interruptedDesc: "可以从断点继续应用，或撤销已应用的部分",
				failedTitle: "应用失败",
				failedDesc: "可重试或撤销",
				partialUndoneTitle: "部分撤销",
				partialUndoneDesc: "部分撤销成功，存在冲突项，可再次尝试",
				progressOf: "{applied} / {total} 完成",
				statCompleted: "已完成",
				statPending: "待处理",
				statFailed: "失败",
				snapshotHint: "已保存恢复快照。完成后可在结果页一键撤销本次整理，还原所有书签至原始位置。",
				failureDetails: "失败详情 ({n})",
				interrupt: "中断",
				resume: "从断点继续",
				undo: "撤销本次整理",
				startOver: "开始新一轮整理"
			},
			errors: {
				aborted: "请求已取消",
				network: "网络请求失败",
				networkCheckBaseUrl: "网络请求失败，请检查 Base URL 与网络连接",
				rateLimited: "模型限流（HTTP 429），已自动重试仍失败",
				serverError: "模型服务异常（HTTP {status}），已自动重试仍失败",
				authFailed: "API 鉴权失败（HTTP {status}），请检查 API Key",
				httpError: "模型接口返回 HTTP {status}：{detail}",
				emptyContent: "模型响应缺少内容",
				invalidJson: "模型响应不是有效的 JSON",
				invalidFormat: "模型响应不符合{what}的格式要求",
				noCategories: "模型没有产出任何可用目录",
				conservativeNoFolders: "保守模式下，部分所选书签所在区域没有可用的现有文件夹",
				invalidBaseUrl: "Base URL 格式不正确",
				httpsOnly: "仅支持 HTTPS 的 API Base URL",
				storageQuota: "本地存储空间不足，请缩小整理范围（chrome.storage.local 配额约 10 MB）",
				messagingUnreachable: "无法联系后台服务，请重新打开扩展页面",
				unknownResponse: "后台服务返回了无法识别的响应",
				unknownCommand: "未知或非法的命令",
				jobNotFound: "任务不存在或已过期，请重新扫描",
				jobExpired: "任务不存在或已过期",
				noScan: "没有可用的扫描结果，请先扫描",
				noPlan: "没有可用的分类方案，请先生成方案",
				cannotApplyInState: "当前任务状态为 {status}，无法开始应用",
				cannotUndoInState: "当前任务状态为 {status}，无法开始撤销",
				bookmarkMissing: "书签已不存在，跳过",
				bookmarkGoneDuringApply: "书签在应用过程中被删除",
				conservativeFolderGone: "保守模式的目标文件夹已不存在，已跳过",
				cleanupFolderFailed: "清理空文件夹“{title}”失败：{message}",
				notScannedEmptyFolder: "待删除项不是当前扫描识别出的空文件夹，请重新检查",
				notScannedDuplicate: "待删除项不是当前扫描识别出的重复书签，请重新检查",
				keepOnePerGroup: "每组重复书签至少需要保留一项",
				folderAlreadyHasBookmarks: "文件夹内已存在书签，已跳过",
				deleteFailed: "删除失败",
				undoMovedByUser: "书签已被再次移动，跳过以不覆盖用户的新操作",
				undoBookmarkMissing: "书签已删除，无法恢复",
				undoParentMissing: "原父目录已不存在，无法恢复",
				restoreFailed: "恢复失败：{message}",
				noUndoSnapshot: "没有可用于撤销的最近一次整理快照",
				undoInterrupted: "已按用户请求中断撤销，可重新发起撤销",
				testPing: "请回复 ok",
				whatCandidateTaxonomy: "候选目录批次",
				whatTaxonomy: "目录体系",
				whatAssignment: "书签分配批次",
				illegalTransition: "非法任务状态迁移: {from} -> {to}"
			}
		},
		en: {
			app: {
				title: "TidyMarks",
				steps: {
					scan: "Scan",
					select: "Select",
					organizing: "Organize",
					preview: "Preview",
					result: "Done"
				}
			},
			common: {
				back: "Back",
				settings: "Settings",
				closeSettings: "Close settings",
				save: "Save",
				cancel: "Cancel",
				untitled: "Untitled",
				loading: "Loading...",
				deleting: "Deleting...",
				scanningAction: "Scanning...",
				unorganized: "Unorganized",
				countBookmarks: "{n} bookmarks"
			},
			busy: {
				scan: "Scanning bookmarks...",
				deleteEmptyFolders: "Deleting empty folders...",
				deleteDuplicates: "Deleting duplicate bookmarks...",
				generatePlan: "Generating organize plan...",
				applyPlan: "Applying organize plan...",
				retry: "Retrying failed items...",
				undo: "Undoing the last organize...",
				cancel: "Requesting interruption..."
			},
			settings: {
				title: "Model Settings",
				subtitle: "Configure your own OpenAI-compatible API. All requests are sent directly from your browser.",
				baseUrlLabel: "Base URL",
				baseUrlPlaceholder: "https://api.openai.com/v1",
				baseUrlHelper: "HTTPS only. Access permission for this origin will be requested when saving.",
				apiKeyLabel: "API Key",
				apiKeyPlaceholder: "sk-...",
				apiKeyHelper: "Stored only in local chrome.storage; never uploaded to any server.",
				modelLabel: "Model",
				modelPlaceholder: "gpt-4o-mini",
				modelHelper: "A chat model that supports JSON structured output.",
				invalidForm: "Please enter a valid HTTPS Base URL, API Key and model name",
				permissionDenied: "Access permission for this API origin was not granted",
				testing: "Testing...",
				testConnection: "Test connection",
				testSuccess: "Connected. The model supports structured output",
				testFailed: "Connection failed: {msg}",
				testPrompt: "Please reply with ok",
				needSettings: "Please complete the model settings first"
			},
			scan: {
				titleIdle: "Scan bookmarks",
				titleDone: "Scan complete. View bookmark stats",
				subtitleIdle: "Reading your bookmark tree...",
				start: "Start scan",
				totalBookmarks: "Total bookmarks",
				folders: "Folders",
				organizable: "Organizable",
				noTitle: "Untitled",
				chooseFeature: "Choose a feature",
				organize: "Organize bookmarks",
				organizeDesc: "AI auto-categorizes and rebuilds the folder structure",
				selectScope: "Select scope →",
				duplicates: "Check duplicates",
				duplicatesDesc: "Find identical or similar duplicate items",
				duplicateResults: "View {n} groups →",
				noDuplicates: "No duplicates found",
				emptyFolders: "Clean empty folders",
				emptyFoldersDesc: "Delete empty folders that contain no bookmarks",
				emptyFolderResults: "Found {n} empty folders →",
				noEmptyFolders: "No empty folders",
				deleteSummary: "{deleted} deleted, {failed} failed",
				settingsRequired: "Please complete the model settings first",
				progressDone: "Scan complete"
			},
			duplicates: {
				back: "Back",
				foundSummary: "{n} duplicates found in total",
				title: "Duplicate bookmarks",
				subtitle: "Keep one item per group; the rest can be deleted. You can ignore groups for now.",
				empty: "No duplicate bookmarks found",
				labelSameUrl: "Same URL",
				labelSimilarUrl: "Similar URL",
				labelSameTitle: "Same title",
				ignore: "Ignore",
				restore: "Restore",
				keepAria: "Keep {title}",
				willDelete: "Will delete {n} duplicate bookmarks",
				deleteAction: "Delete duplicates"
			},
			emptyFolders: {
				back: "Back",
				foundSummary: "{n} empty folders found in total",
				title: "Clean empty folders",
				subtitle: "Only delete empty folders that contain no bookmarks.",
				empty: "No empty folders",
				deleteAria: "Delete {path}",
				willDelete: "Will delete {n} empty folders",
				deleteAction: "Delete empty folders"
			},
			select: {
				title: "Select organize scope",
				subtitle: "Click a folder to view bookmarks; check what to organize",
				folderTree: "Bookmark folders",
				loadingTree: "Loading folder tree...",
				viewOnly: "Bookmarks are view-only",
				noBookmarks: "No bookmarks in this folder",
				clickFolder: "Click a folder on the left to view bookmarks",
				modeTitle: "Choose organize mode",
				conservative: "Conservative organize",
				conservativeDesc: "Keep the existing structure; only file bookmarks into existing folders",
				reorganize: "Rebuild the structure",
				reorganizeDesc: "AI freely designs a brand-new folder system and reorganizes all selected bookmarks",
				nameStyleTitle: "Folder naming style",
				emojiText: "Icon + text",
				emojiTextDesc: "Distinguish folders with emoji prefixes at a glance",
				textOnly: "Text only",
				textOnlyDesc: "Keep it clean, no emoji",
				selectedSummary: "{folders} folders selected, {count} bookmarks in total",
				startAnalysis: "Start AI analysis ({n} bookmarks) →",
				exampleEmojiFolder: "📚 Reading",
				exampleTextFolder: "Reading"
			},
			organizing: {
				title: "AI is analyzing",
				subtitle: "Generating category suggestions from titles, URLs and current folders",
				stepRead: "Reading bookmark data...",
				stepReadDesc: "Only titles, URLs and current folders are read; pages are never visited",
				stepDesign: "Designing folder system",
				stepDesignDesc: "AI designs category folders from your bookmark content",
				stepAssign: "Assigning bookmarks",
				stepAssignDesc: "Filing each bookmark into the most suitable folder",
				stepValidate: "Validating results",
				stepValidateDesc: "Checking folder depth and bookmark assignments",
				stepDone: "Plan ready",
				stepDoneDesc: "Entering preview; nothing is written until you confirm",
				taxonomy: "Designing folder system",
				assign: "Assigning bookmarks",
				privacy: "Privacy note: bookmark titles, URLs and folder paths are sent to the model service you configured for categorization. This extension itself collects nothing and uploads nowhere else.",
				prevStep: "← Previous"
			},
			preview: {
				title: "Preview the organize plan",
				subtitle: "Bookmarks are view-only. Folders marked “New” will be created.",
				willMove: "Will move",
				newFolders: "New folders",
				cleanupScope: "Cleanup scope",
				treeTitle: "Bookmark tree after organizing",
				cleanupDesc: "Only empty folders within the selected scope are cleaned; undoable in one click",
				back: "Back",
				applyAction: "Apply plan and clean empty folders ({n} bookmarks) →",
				badgeNew: "New",
				viewOnly: "Bookmarks are view-only"
			},
			result: {
				writingTitle: "Writing bookmarks",
				writingDesc: "Moving bookmarks one by one and cleaning empty folders in scope",
				doneTitle: "Organize complete",
				doneDesc: "Successfully moved {n} bookmarks to new folders",
				undoneTitle: "Undone",
				undoneDesc: "The last organize has been undone and bookmarks restored",
				interruptedTitle: "Interrupted",
				interruptedDesc: "You can resume applying from the cursor, or undo what has been applied",
				failedTitle: "Apply failed",
				failedDesc: "You can retry or undo",
				partialUndoneTitle: "Partially undone",
				partialUndoneDesc: "Undo partially succeeded with conflicts; you can try again",
				progressOf: "{applied} / {total} done",
				statCompleted: "Done",
				statPending: "Pending",
				statFailed: "Failed",
				snapshotHint: "A restore snapshot has been saved. When finished, you can undo this organize in one click and restore all bookmarks to their original locations.",
				failureDetails: "Failure details ({n})",
				interrupt: "Interrupt",
				resume: "Resume from cursor",
				undo: "Undo this organize",
				startOver: "Start a new round"
			},
			errors: {
				aborted: "Request aborted",
				network: "Network request failed",
				networkCheckBaseUrl: "Network request failed. Check the Base URL and your connection",
				rateLimited: "Model rate-limited (HTTP 429); automatic retries exhausted",
				serverError: "Model service error (HTTP {status}); automatic retries exhausted",
				authFailed: "API authentication failed (HTTP {status}). Check your API Key",
				httpError: "Model API returned HTTP {status}: {detail}",
				emptyContent: "Model response contained no content",
				invalidJson: "Model response is not valid JSON",
				invalidFormat: "Model response does not match the required format: {what}",
				noCategories: "The model produced no usable folders",
				conservativeNoFolders: "In conservative mode, some selected bookmarks have no existing folders available",
				invalidBaseUrl: "Invalid Base URL format",
				httpsOnly: "Only HTTPS Base URLs are supported",
				storageQuota: "Not enough local storage. Reduce the organize scope (chrome.storage.local quota is about 10 MB)",
				messagingUnreachable: "Cannot reach the background service. Please reopen the extension page",
				unknownResponse: "The background service returned an unrecognized response",
				unknownCommand: "Unknown or invalid command",
				jobNotFound: "Job not found or expired. Please scan again",
				jobExpired: "Job not found or expired",
				noScan: "No scan result available. Please scan first",
				noPlan: "No organize plan available. Please generate a plan first",
				cannotApplyInState: "Cannot start applying while job status is {status}",
				cannotUndoInState: "Cannot start undo while job status is {status}",
				bookmarkMissing: "Bookmark no longer exists; skipped",
				bookmarkGoneDuringApply: "Bookmark was deleted while applying",
				conservativeFolderGone: "Target folder for conservative mode no longer exists; skipped",
				cleanupFolderFailed: "Failed to clean up empty folder “{title}”: {message}",
				notScannedEmptyFolder: "Items to delete are not empty folders from the current scan. Please re-check",
				notScannedDuplicate: "Items to delete are not duplicates from the current scan. Please re-check",
				keepOnePerGroup: "Each duplicate group must keep at least one bookmark",
				folderAlreadyHasBookmarks: "Folder already contains bookmarks; skipped",
				deleteFailed: "Delete failed",
				undoMovedByUser: "Bookmark was moved again by the user; skipped to avoid overwriting",
				undoBookmarkMissing: "Bookmark was deleted and cannot be restored",
				undoParentMissing: "Original parent folder no longer exists; cannot restore",
				restoreFailed: "Restore failed: {message}",
				noUndoSnapshot: "No undo snapshot is available for the last organize",
				undoInterrupted: "Undo was interrupted as requested; you can start it again",
				testPing: "Please reply with ok",
				whatCandidateTaxonomy: "candidate folder batch",
				whatTaxonomy: "the folder taxonomy",
				whatAssignment: "the assignment batch",
				illegalTransition: "Illegal job state transition: {from} -> {to}"
			}
		}
	};
	function detectLocale() {
		try {
			return chrome.i18n.getUILanguage().toLowerCase().startsWith("zh") ? "zh-CN" : "en";
		} catch {
			return "zh-CN";
		}
	}
	var currentLocale = detectLocale();
	var localeListeners = /* @__PURE__ */ new Set();
	function notifyLocaleChange() {
		for (const listener of localeListeners) listener(currentLocale);
	}
	function setCurrentLocale(locale, silent) {
		if (currentLocale === locale) return;
		currentLocale = locale;
		if (!silent) notifyLocaleChange();
	}
	var LOCALE_STORAGE_KEY = "tidymarks.locale";
	function normalizeLocale(value) {
		if (!value) return void 0;
		const lower = value.toLowerCase();
		if (lower.startsWith("zh")) return "zh-CN";
		if (lower.startsWith("en")) return "en";
	}
	function getChromeStorage() {
		try {
			return typeof chrome !== "undefined" && chrome.storage ? chrome.storage.local : void 0;
		} catch {
			return;
		}
	}
	/** 异步从 chrome.storage 读一次语言覆盖，命中则切换；可幂等调用。 */
	async function bootstrapLocaleFromStorage() {
		const storage = getChromeStorage();
		if (!storage) return;
		try {
			const stored = normalizeLocale((await storage.get(LOCALE_STORAGE_KEY))?.[LOCALE_STORAGE_KEY]);
			if (stored) setCurrentLocale(stored);
		} catch (error) {
			console.warn("[i18n] 读取语言覆盖失败", error);
		}
	}
	bootstrapLocaleFromStorage();
	function interpolate(template, params) {
		if (!params) return template;
		return template.replace(/\{(\w+)\}/g, (match, key) => {
			const value = params[key];
			return value === void 0 ? match : String(value);
		});
	}
	function lookup(dict, key) {
		let node = dict;
		for (const part of key.split(".")) {
			if (node === null || typeof node !== "object") return void 0;
			node = node[part];
		}
		return typeof node === "string" ? node : void 0;
	}
	/**
	* 按当前语言取文案，支持 {name} 占位符。
	* 缺失键时回退简体中文并告警，避免界面出现空白。
	*/
	function t(key, params) {
		const hit = lookup(DICTS[currentLocale], key);
		if (hit !== void 0) return interpolate(hit, params);
		const fallback = lookup(DICTS["zh-CN"], key);
		if (fallback !== void 0) {
			console.warn(`[i18n] missing key "${key}" for locale "${currentLocale}", fallback to zh-CN`);
			return interpolate(fallback, params);
		}
		console.warn(`[i18n] missing key "${key}"`);
		return key;
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
			super(t("errors.illegalTransition", {
				from,
				to
			}));
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
		i18nKey;
		params;
		constructor(kind, i18nKey, params) {
			super(t(i18nKey, params));
			this.name = "AppError";
			this.kind = kind;
			this.i18nKey = i18nKey;
			this.params = params;
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
	* 5. 从深到浅清理用户选中范围内的空目录；
	* 6. 完成置 completed 并展示失败与重试入口。
	*
	* 中断恢复：同一 jobId 重复进入时跳过已 applied 的书签，从持久化游标继续。
	*/
	async function applyPlan(deps, job, bookmarks, assignments, options = {}) {
		const { storage, events } = deps;
		const now = deps.now ?? (() => Date.now());
		const createMissingFolders = options.createMissingFolders ?? true;
		const cleanupFolderIds = new Set(options.cleanupFolderIds ?? []);
		if (isWriteLocked(job.status) && job.status !== "applying") throw new AppError("user_conflict", "errors.cannotApplyInState", { status: job.status });
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
			message: t("errors.bookmarkMissing")
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
					if (!createMissingFolders) return null;
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
		const resolutionFailures = [];
		for (const { bookmark, assignment } of ordered) {
			if (working.appliedIds.includes(bookmark.id) || missing.has(bookmark.id)) continue;
			const target = await resolveFolder(bookmark.rootId, assignment.targetPath);
			if (!target) {
				resolutionFailures.push({
					bookmarkId: bookmark.id,
					kind: "validation",
					message: t("errors.conservativeFolderGone")
				});
				continue;
			}
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
		if (resolutionFailures.length > 0) {
			working = {
				...working,
				failures: [...working.failures, ...resolutionFailures],
				updatedAt: now()
			};
			await storage.saveJob(working);
		}
		const snapshot = {
			jobId: job.jobId,
			createdAt: now(),
			moves: moves.filter((m) => m.toFolderId.length > 0),
			createdFolders,
			deletedFolders: undoExisting && undoExisting.jobId === job.jobId ? [...undoExisting.deletedFolders] : []
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
					message: t("errors.bookmarkGoneDuringApply")
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
		const cleanup = await cleanupSelectedEmptyFolders(deps.bookmarks, storage, snapshot, /* @__PURE__ */ new Set([...cleanupFolderIds, ...createdIds]), createdIds);
		failures.push(...cleanup.failures);
		working = {
			...working,
			failures,
			updatedAt: now()
		};
		if (cleanup.cancelled) {
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
				failures
			};
		}
		const completed = {
			...working,
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
	/**
	* 按最新树深度从深到浅清理候选目录。
	* 候选集合由用户明确选中的原文件夹和本轮新建目录组成；未选目录即使为空也不触碰。
	* 使用 remove 而不是 removeTree，使并发新增内容时由 Chrome 安全拒绝删除。
	*/
	async function cleanupSelectedEmptyFolders(bookmarks, storage, snapshot, candidateIds, createdIds) {
		const tree = await bookmarks.getTree();
		const candidates = [];
		const visit = (node, depth) => {
			if (candidateIds.has(node.id) && node.url === void 0) candidates.push({
				node,
				depth
			});
			for (const child of node.children ?? []) visit(child, depth + 1);
		};
		for (const root of tree) visit(root, 0);
		candidates.sort((a, b) => b.depth - a.depth);
		const deletedFolders = [...snapshot.deletedFolders];
		const recordedIds = new Set(deletedFolders.map((folder) => folder.id));
		const failures = [];
		for (const candidate of candidates) {
			if ((await storage.loadJob())?.cancelRequested) return {
				deletedFolders,
				failures,
				cancelled: true
			};
			const node = await bookmarks.get(candidate.node.id);
			if (!node || node.url !== void 0) continue;
			if (!node.parentId || node.parentId === "0" || isUnmodifiable(node)) continue;
			if ((await bookmarks.getChildren(node.id)).length > 0) continue;
			if (!createdIds.has(node.id) && !recordedIds.has(node.id)) {
				recordedIds.add(node.id);
				deletedFolders.push({
					id: node.id,
					parentId: node.parentId,
					title: node.title,
					index: node.index ?? 0
				});
				await storage.saveUndo({
					...snapshot,
					deletedFolders: [...deletedFolders]
				});
			}
			try {
				await bookmarks.remove(node.id);
			} catch (error) {
				const classified = classifyError(error);
				failures.push({
					folderId: node.id,
					kind: classified.kind,
					message: t("errors.cleanupFolderFailed", {
						title: node.title,
						message: classified.message
					})
				});
			}
		}
		return {
			deletedFolders,
			failures,
			cancelled: false
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
	/**
	* 被删原文件夹的重建顺序：父目录先于子目录。
	* 按 parentId 拓扑排序——parentId 不在待建集合中（即外部已有目录或已重建）的先建，
	* 逐轮推进；出现环（理论上不会）时残余按原序追加，避免死循环。
	*/
	function orderFoldersForRecreation(folders) {
		const remaining = [...folders];
		const ordered = [];
		let progressed = true;
		while (remaining.length > 0 && progressed) {
			progressed = false;
			for (let i = remaining.length - 1; i >= 0; i--) {
				const folder = remaining[i];
				if (!remaining.some((r) => r.id === folder.parentId)) {
					ordered.push(folder);
					remaining.splice(i, 1);
					progressed = true;
				}
			}
		}
		ordered.push(...remaining);
		return ordered;
	}
	//#endregion
	//#region src/application/undoLastApply.ts
	var CONFLICT_REASON_KEYS = {
		moved_by_user: "errors.undoMovedByUser",
		bookmark_missing: "errors.undoBookmarkMissing",
		parent_missing: "errors.undoParentMissing"
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
		if (isWriteLocked(job.status)) throw new AppError("user_conflict", "errors.cannotUndoInState", { status: job.status });
		assertTransition(job.status, "undoing");
		const snapshot = await storage.loadUndo();
		if (!snapshot || snapshot.jobId !== job.jobId) throw new AppError("validation", "errors.noUndoSnapshot");
		let working = {
			...job,
			status: "undoing",
			updatedAt: now(),
			cancelRequested: false
		};
		await storage.saveJob(working);
		const conflicts = [];
		let cancelled = false;
		const folderIdMap = /* @__PURE__ */ new Map();
		for (const folder of orderFoldersForRecreation(snapshot.deletedFolders)) {
			const parentId = folderIdMap.get(folder.parentId) ?? folder.parentId;
			try {
				const original = await bookmarks.get(folder.id);
				if (original && original.url === void 0) {
					folderIdMap.set(folder.id, original.id);
					continue;
				}
				const existing = (await bookmarks.getChildren(parentId)).find((node) => node.url === void 0 && node.title === folder.title);
				if (existing) {
					folderIdMap.set(folder.id, existing.id);
					continue;
				}
				const created = await bookmarks.createFolder(parentId, folder.title, folder.index);
				folderIdMap.set(folder.id, created.id);
			} catch {}
		}
		const moves = snapshot.moves.map((move) => folderIdMap.has(move.fromParentId) ? {
			...move,
			fromParentId: folderIdMap.get(move.fromParentId)
		} : move);
		const decisions = [];
		for (const move of moves) {
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
					message: t("errors.restoreFailed", { message: classified.message })
				});
			}
		}
		for (const decision of decisions) {
			if (decision.action !== "skip") continue;
			conflicts.push({
				bookmarkId: decision.move.bookmarkId,
				kind: "user_conflict",
				message: t(CONFLICT_REASON_KEYS[decision.reason])
			});
		}
		for (const folderId of orderFoldersForDeletion(snapshot.createdFolders)) {
			if (cancelled) break;
			try {
				if ((await bookmarks.getChildren(folderId)).length === 0) await bookmarks.remove(folderId);
			} catch {}
		}
		if (cancelled) conflicts.push({
			kind: "user_conflict",
			message: t("errors.undoInterrupted")
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
	//#region src/domain/bookmarks/duplicates.ts
	function exactUrlKey(value) {
		return value.trim();
	}
	function looseUrlKey(value) {
		try {
			const url = new URL(value);
			return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "") || "/"}${url.search}`.toLowerCase();
		} catch {
			return null;
		}
	}
	function commonPrefixRatio(left, right) {
		let length = 0;
		const max = Math.min(left.length, right.length);
		while (length < max && left[length] === right[length]) length += 1;
		return 2 * length / (left.length + right.length);
	}
	function similarUrl(left, right) {
		const a = looseUrlKey(left);
		const b = looseUrlKey(right);
		if (!a || !b) return false;
		if (a === b) return true;
		return a.split("/")[0] === b.split("/")[0] && commonPrefixRatio(a, b) >= .8;
	}
	function normalizedTitle(value) {
		return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
	}
	/** 按匹配置信度分组，同一个书签只进入一个分组。 */
	function findDuplicateGroups(bookmarks) {
		const groups = [];
		const used = /* @__PURE__ */ new Set();
		const addBuckets = (kind, keyFor) => {
			const buckets = /* @__PURE__ */ new Map();
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
				groups.push({
					id: `${kind}:${key}`,
					kind,
					bookmarks: bucket
				});
			}
		};
		addBuckets("same-url", (bookmark) => exactUrlKey(bookmark.url));
		const remaining = bookmarks.filter((bookmark) => !used.has(bookmark.id));
		const visited = /* @__PURE__ */ new Set();
		for (const bookmark of remaining) {
			if (visited.has(bookmark.id)) continue;
			const component = [];
			const queue = [bookmark];
			visited.add(bookmark.id);
			while (queue.length) {
				const current = queue.shift();
				component.push(current);
				for (const candidate of remaining) if (!visited.has(candidate.id) && similarUrl(current.url, candidate.url)) {
					visited.add(candidate.id);
					queue.push(candidate);
				}
			}
			if (component.length > 1) {
				component.forEach((item) => used.add(item.id));
				groups.push({
					id: `similar-url:${component.map((item) => item.id).join(",")}`,
					kind: "similar-url",
					bookmarks: component
				});
			}
		}
		addBuckets("same-title", (bookmark) => normalizedTitle(bookmark.title) || null);
		return groups;
	}
	//#endregion
	//#region src/application/deleteDuplicateBookmarks.ts
	/** 只允许删除最近一次扫描中出现的书签 ID，并在删除后重新扫描以同步持久化状态。 */
	async function deleteDuplicateBookmarks(deps, bookmarkIds) {
		const previous = await deps.storage.loadScan();
		if (!previous) throw new AppError("validation", "errors.noScan");
		const ids = [...new Set(bookmarkIds)];
		const requested = new Set(ids);
		const groups = findDuplicateGroups(previous.bookmarks);
		const duplicateIds = new Set(groups.flatMap((group) => group.bookmarks.map((bookmark) => bookmark.id)));
		if (ids.some((id) => !duplicateIds.has(id))) throw new AppError("validation", "errors.notScannedDuplicate");
		if (groups.some((group) => group.bookmarks.every((bookmark) => requested.has(bookmark.id)))) throw new AppError("validation", "errors.keepOnePerGroup");
		const deletedIds = [];
		const failures = [];
		for (const id of ids) try {
			await deps.bookmarks.remove(id);
			deletedIds.push(id);
		} catch (error) {
			failures.push({
				bookmarkId: id,
				message: error instanceof Error ? error.message : t("errors.deleteFailed")
			});
		}
		const scan = buildScanResult(await deps.bookmarks.getTree(), (deps.newId ?? (() => crypto.randomUUID()))(), (deps.now ?? (() => Date.now()))());
		await deps.storage.saveScan(scan);
		return {
			scan,
			deletedIds,
			failures
		};
	}
	//#endregion
	//#region src/domain/bookmarks/emptyFolders.ts
	/**
	* 找出所有空文件夹：自身及全部后代目录中都没有任何书签的目录。
	* 顶级根目录（书签栏/其他书签）不在 scan.folders 中，天然不会被清理。
	*/
	function findEmptyFolders(scan) {
		const parentById = new Map(scan.folders.map((folder) => [folder.id, folder.parentId]));
		const nonEmptyIds = /* @__PURE__ */ new Set();
		for (const bookmark of scan.bookmarks) {
			let id = bookmark.parentId;
			while (id !== void 0 && !nonEmptyIds.has(id)) {
				nonEmptyIds.add(id);
				id = parentById.get(id);
			}
		}
		return scan.folders.filter((folder) => !nonEmptyIds.has(folder.id)).sort((a, b) => b.depth - a.depth);
	}
	//#endregion
	//#region src/application/deleteEmptyFolders.ts
	/** 实时检查目录子树内是否仍有书签，防止扫描结果被用户手动改动后误删书签。 */
	async function subtreeHasBookmarks(bookmarks, folderId) {
		const queue = await bookmarks.getChildren(folderId);
		while (queue.length) {
			const node = queue.shift();
			if (node.url !== void 0) return true;
			if (node.children) queue.push(...node.children);
			else queue.push(...await bookmarks.getChildren(node.id));
		}
		return false;
	}
	/** 只允许删除最近一次扫描中识别出的空文件夹，删除后重新扫描以同步持久化状态。 */
	async function deleteEmptyFolders(deps, folderIds) {
		const previous = await deps.storage.loadScan();
		if (!previous) throw new AppError("validation", "errors.noScan");
		const ids = [...new Set(folderIds)];
		const emptyFolderIds = new Set(findEmptyFolders(previous).map((folder) => folder.id));
		if (ids.some((id) => !emptyFolderIds.has(id))) throw new AppError("validation", "errors.notScannedEmptyFolder");
		const depthById = new Map(previous.folders.map((folder) => [folder.id, folder.depth]));
		const ordered = [...ids].sort((a, b) => (depthById.get(b) ?? 0) - (depthById.get(a) ?? 0));
		const deletedIds = [];
		const failures = [];
		for (const id of ordered) try {
			if (!await deps.bookmarks.get(id)) {
				deletedIds.push(id);
				continue;
			}
			if (await subtreeHasBookmarks(deps.bookmarks, id)) {
				failures.push({
					folderId: id,
					message: t("errors.folderAlreadyHasBookmarks")
				});
				continue;
			}
			await deps.bookmarks.removeTree(id);
			deletedIds.push(id);
		} catch (error) {
			failures.push({
				folderId: id,
				message: error instanceof Error ? error.message : t("errors.deleteFailed")
			});
		}
		const scan = buildScanResult(await deps.bookmarks.getTree(), (deps.newId ?? (() => crypto.randomUUID()))(), (deps.now ?? (() => Date.now()))());
		await deps.storage.saveScan(scan);
		return {
			scan,
			deletedIds,
			failures
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
			async createFolder(parentId, title, index) {
				return { id: (await chrome.bookmarks.create({
					parentId,
					title,
					index
				})).id };
			},
			async move(id, destination) {
				await chrome.bookmarks.move(id, destination);
			},
			async remove(id) {
				await chrome.bookmarks.remove(id);
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
		dateAdded: numberType().optional(),
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
	/**
	* 保守模式需要完整复用用户已有的深层目录；重新规划模式仍在业务层限制为最多两级。
	* 这里保留一个宽松但有上限的持久化边界，避免合法的现有目录在读取时被丢弃。
	*/
	var TargetPathSchema = arrayType(PathSegmentSchema).min(1).max(100);
	var OrganizeModeSchema = enumType(["conservative", "reorganize"]);
	var FolderNameStyleSchema = enumType(["emoji", "text"]);
	var AssignmentSchema = objectType({
		bookmarkId: stringType(),
		targetPath: TargetPathSchema,
		reason: stringType().optional()
	});
	var PlanRecordSchema = objectType({
		jobId: stringType(),
		createdAt: numberType(),
		/** 用户明确选中的文件夹范围；旧方案默认不清理任何原文件夹。 */
		selectedFolderIds: arrayType(stringType()).default([]),
		/** 旧方案默认按历史行为视为“重新规划目录”。 */
		mode: OrganizeModeSchema.default("reorganize"),
		/** 旧方案的目录名均为纯文字。 */
		folderNameStyle: FolderNameStyleSchema.default("text"),
		phase: enumType([
			"taxonomy",
			"assign",
			"done"
		]),
		/** 分类体系阶段各批次产出的候选目录，用于断点续跑。 */
		taxonomyCandidates: arrayType(arrayType(PathSegmentSchema).min(1).max(2)).default([]),
		/** 已完成的分类体系批次数。 */
		taxonomyCursor: numberType().int().nonnegative().default(0),
		/** 最终目录体系；重新规划模式最多两级，保守模式可保留现有深层路径。 */
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
		folderId: stringType().optional(),
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
	/** 应用时被搬空并删除的原文件夹，撤销时据此重建以还原书签位置。 */
	var DeletedFolderSchema = objectType({
		id: stringType(),
		parentId: stringType(),
		title: stringType(),
		index: numberType().int().nonnegative()
	});
	var UndoSnapshotSchema = objectType({
		jobId: stringType(),
		createdAt: numberType(),
		moves: arrayType(UndoMoveSchema),
		createdFolders: arrayType(objectType({
			id: stringType(),
			depth: numberType().int().nonnegative()
		})),
		deletedFolders: arrayType(DeletedFolderSchema).default([])
	});
	objectType({ candidates: arrayType(arrayType(stringType()).min(1).max(2)) });
	objectType({ categories: arrayType(arrayType(stringType()).min(1).max(2)) });
	objectType({ assignments: arrayType(objectType({
		bookmarkId: stringType(),
		targetPath: arrayType(stringType()).min(1).max(2),
		reason: stringType().optional()
	})) });
	objectType({ assignments: arrayType(objectType({
		bookmarkId: stringType(),
		targetPath: arrayType(stringType()).min(1).max(100),
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
			if (await area.getBytesInUse(null) >= 9961472) throw new AppError("storage_quota", "errors.storageQuota");
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
		}),
		objectType({
			type: literalType("DELETE_DUPLICATE_BOOKMARKS"),
			requestId: stringType(),
			bookmarkIds: arrayType(stringType()).min(1)
		}),
		objectType({
			type: literalType("DELETE_EMPTY_FOLDERS"),
			requestId: stringType(),
			folderIds: arrayType(stringType()).min(1)
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
		}, job, scan.bookmarks, plan.assignments, {
			createMissingFolders: plan.mode !== "conservative",
			cleanupFolderIds: plan.selectedFolderIds
		})).job };
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
						case "CANCEL_JOB":
							payload = await handleCancel(storage, request.jobId);
							break;
						case "DELETE_DUPLICATE_BOOKMARKS":
							payload = await deleteDuplicateBookmarks({
								bookmarks: createBookmarksRepository(),
								storage
							}, request.bookmarkIds);
							break;
						case "DELETE_EMPTY_FOLDERS": payload = await deleteEmptyFolders({
							bookmarks: createBookmarksRepository(),
							storage
						}, request.folderIds);
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

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2dyb3VuZC5qcyIsIm5hbWVzIjpbImRlZmF1bHRFcnJvck1hcCIsImRlZmF1bHRFcnJvck1hcCIsInJlZ2V4IiwiZGVmYXVsdEVycm9yTWFwIiwiYnJvd3NlciJdLCJzb3VyY2VzIjpbIi4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9kZWZpbmUtYmFja2dyb3VuZC5tanMiLCIuLi8uLi9zcmMvZG9tYWluL2Jvb2ttYXJrcy90eXBlcy50cyIsIi4uLy4uL3NyYy9kb21haW4vYm9va21hcmtzL3RyZWUudHMiLCIuLi8uLi9zcmMvc2hhcmVkL2kxOG4vemgtQ04udHMiLCIuLi8uLi9zcmMvc2hhcmVkL2kxOG4vZW4udHMiLCIuLi8uLi9zcmMvc2hhcmVkL2kxOG4vaW5kZXgudHMiLCIuLi8uLi9zcmMvZG9tYWluL29yZ2FuaXplL3N0YXRlTWFjaGluZS50cyIsIi4uLy4uL3NyYy9hcHBsaWNhdGlvbi9zY2FuQm9va21hcmtzLnRzIiwiLi4vLi4vc3JjL3NoYXJlZC9lcnJvcnMudHMiLCIuLi8uLi9zcmMvYXBwbGljYXRpb24vYXBwbHlQbGFuLnRzIiwiLi4vLi4vc3JjL2RvbWFpbi91bmRvL3NuYXBzaG90LnRzIiwiLi4vLi4vc3JjL2FwcGxpY2F0aW9uL3VuZG9MYXN0QXBwbHkudHMiLCIuLi8uLi9zcmMvYXBwbGljYXRpb24vcmVzdW1lSm9iLnRzIiwiLi4vLi4vc3JjL2RvbWFpbi9ib29rbWFya3MvZHVwbGljYXRlcy50cyIsIi4uLy4uL3NyYy9hcHBsaWNhdGlvbi9kZWxldGVEdXBsaWNhdGVCb29rbWFya3MudHMiLCIuLi8uLi9zcmMvZG9tYWluL2Jvb2ttYXJrcy9lbXB0eUZvbGRlcnMudHMiLCIuLi8uLi9zcmMvYXBwbGljYXRpb24vZGVsZXRlRW1wdHlGb2xkZXJzLnRzIiwiLi4vLi4vc3JjL2luZnJhc3RydWN0dXJlL2Nocm9tZS9ib29rbWFya3NSZXBvc2l0b3J5LnRzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3pvZC92My9oZWxwZXJzL3V0aWwuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvem9kL3YzL1pvZEVycm9yLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3pvZC92My9sb2NhbGVzL2VuLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3pvZC92My9lcnJvcnMuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvem9kL3YzL2hlbHBlcnMvcGFyc2VVdGlsLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3pvZC92My9oZWxwZXJzL2Vycm9yVXRpbC5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy96b2QvdjMvdHlwZXMuanMiLCIuLi8uLi9zcmMvc2hhcmVkL3NjaGVtYXMudHMiLCIuLi8uLi9zcmMvaW5mcmFzdHJ1Y3R1cmUvY2hyb21lL3N0b3JhZ2VSZXBvc2l0b3J5LnRzIiwiLi4vLi4vc3JjL3NoYXJlZC9tZXNzYWdlcy50cyIsIi4uLy4uL2VudHJ5cG9pbnRzL2JhY2tncm91bmQudHMiLCIuLi8uLi9ub2RlX21vZHVsZXMvQHd4dC1kZXYvYnJvd3Nlci9zcmMvaW5kZXgubWpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIubWpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL0B3ZWJleHQtY29yZS9tYXRjaC1wYXR0ZXJucy9saWIvaW5kZXgubWpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vI3JlZ2lvbiBzcmMvdXRpbHMvZGVmaW5lLWJhY2tncm91bmQudHNcbmZ1bmN0aW9uIGRlZmluZUJhY2tncm91bmQoYXJnKSB7XG5cdGlmIChhcmcgPT0gbnVsbCB8fCB0eXBlb2YgYXJnID09PSBcImZ1bmN0aW9uXCIpIHJldHVybiB7IG1haW46IGFyZyB9O1xuXHRyZXR1cm4gYXJnO1xufVxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBkZWZpbmVCYWNrZ3JvdW5kIH07XG4iLCIvKipcbiAqIENocm9tZSDkuabnrb7moJHnmoTnuq/mlbDmja7ooajnpLrvvIzkuI4gY2hyb21lLmJvb2ttYXJrcy5Cb29rbWFya1RyZWVOb2RlIOe7k+aehOWFvOWuue+8jFxuICog5L2G5LiN5Y+N5ZCR5L6d6LWW5rWP6KeI5ZmoIEFQSe+8iOaetuaehOaWueahiOesrCA0IOiKguS+nei1luaWueWQkee6puadn++8ieOAglxuICovXG5leHBvcnQgaW50ZXJmYWNlIEJvb2ttYXJrTm9kZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHBhcmVudElkPzogc3RyaW5nO1xuICBpbmRleD86IG51bWJlcjtcbiAgdGl0bGU6IHN0cmluZztcbiAgLyoqIOWtmOWcqCB1cmwg6KGo56S65Lmm562+6IqC54K577yM5ZCm5YiZ5piv55uu5b2V6IqC54K544CCICovXG4gIHVybD86IHN0cmluZztcbiAgZGF0ZUFkZGVkPzogbnVtYmVyO1xuICB1bm1vZGlmaWFibGU/OiBib29sZWFuIHwgc3RyaW5nO1xuICBmb2xkZXJUeXBlPzogc3RyaW5nO1xuICBjaGlsZHJlbj86IEJvb2ttYXJrTm9kZVtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNGb2xkZXIobm9kZTogQm9va21hcmtOb2RlKTogYm9vbGVhbiB7XG4gIHJldHVybiBub2RlLnVybCA9PT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNVbm1vZGlmaWFibGUobm9kZTogQm9va21hcmtOb2RlKTogYm9vbGVhbiB7XG4gIHJldHVybiBub2RlLnVubW9kaWZpYWJsZSAhPT0gdW5kZWZpbmVkICYmIG5vZGUudW5tb2RpZmlhYmxlICE9PSBmYWxzZTtcbn1cbiIsImltcG9ydCB0eXBlIHsgU2NhbkZvbGRlciwgU2NhblJlc3VsdCwgU2Nhbm5lZEJvb2ttYXJrIH0gZnJvbSAnLi4vLi4vc2hhcmVkL3NjaGVtYXMnO1xuaW1wb3J0IHR5cGUgeyBCb29rbWFya05vZGUgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IGlzRm9sZGVyLCBpc1VubW9kaWZpYWJsZSB9IGZyb20gJy4vdHlwZXMnO1xuXG4vKipcbiAqIOivhuWIqyBDaHJvbWUg57O757uf5qC555uu5b2V77yI5Lmm562+5qCPIC8g5YW25LuW5Lmm562+IC8g56e75Yqo6K6+5aSH5Lmm562+562J77yJ44CCXG4gKiDkuI3noaznvJbnoIHmoLnnm67lvZUgSUTvvJpnZXRUcmVlKCkg6aG25bGC6IqC54K555qE55u05o6l5a2Q6IqC54K55Y2z5Li657O757uf5qC555uu5b2V77yI5bimIGZvbGRlclR5cGXvvInvvIxcbiAqIOiLpemhtuWxguacrOi6q+W3suaYr+WkmuS4quiKgueCueWImeWPluaJgOacieaXoCBwYXJlbnRJZCDnmoToioLngrnjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlkZW50aWZ5Um9vdHModHJlZTogQm9va21hcmtOb2RlW10pOiBCb29rbWFya05vZGVbXSB7XG4gIGlmICh0cmVlLmxlbmd0aCA9PT0gMSAmJiB0cmVlWzBdPy5jaGlsZHJlbj8ubGVuZ3RoKSB7XG4gICAgY29uc3QgdG9wID0gdHJlZVswXTtcbiAgICBjb25zdCBjaGlsZHJlbiA9IHRvcC5jaGlsZHJlbjtcbiAgICAvLyDop6bkuI3lj6/kv67mlLnnmoTomZrmi5/moLnvvIhpZCDpgJrluLjkuLogXCIwXCLvvInvvIzlhbblrZDoioLngrnkuLrns7vnu5/moLnnm67lvZXjgIJcbiAgICBpZiAoIXRvcC5wYXJlbnRJZCAmJiBjaGlsZHJlbiAmJiBjaGlsZHJlbi5ldmVyeSgoYykgPT4gaXNGb2xkZXIoYykpKSB7XG4gICAgICByZXR1cm4gY2hpbGRyZW47XG4gICAgfVxuICB9XG4gIHJldHVybiB0cmVlLmZpbHRlcigobikgPT4gIW4ucGFyZW50SWQgJiYgaXNGb2xkZXIobikpO1xufVxuXG5pbnRlcmZhY2UgV2Fsa0NvbnRleHQge1xuICByb290SWQ6IHN0cmluZztcbiAgLyoqIOW9k+WJjeebruW9leebuOWvueagueebruW9leeahOebruW9leWQjei3r+W+hO+8iOS4jeWQq+agueebruW9leiHqui6q++8ieOAgiAqL1xuICBwYXRoOiBzdHJpbmdbXTtcbiAgZGVwdGg6IG51bWJlcjtcbn1cblxuLyoqXG4gKiDlsIbkuabnrb7moJHmiYHlubPljJbkuLrkuIDmrKHkuIDoh7TnmoTmiavmj4/nu5PmnpzjgIJcbiAqIC0g5Lul6IqC54K5IElEIOS4uuWGhemDqOS4u+mUru+8jOS4jeS7peagh+mimOaIliBVUkwg5L2c6Lqr5Lu95qCH6K+G77ybXG4gKiAtIOi3s+i/h+S4jeWPr+S/ruaUueiKgueCueWPiuWFtuaVtOS4quWtkOagke+8iOaetuaehOaWueahiOesrCA3IOiKgu+8ieOAglxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRTY2FuUmVzdWx0KFxuICB0cmVlOiBCb29rbWFya05vZGVbXSxcbiAgc2NhbklkOiBzdHJpbmcsXG4gIHNjYW5uZWRBdCA9IERhdGUubm93KCksXG4pOiBTY2FuUmVzdWx0IHtcbiAgY29uc3Qgcm9vdHMgPSBpZGVudGlmeVJvb3RzKHRyZWUpLm1hcCgocikgPT4gKHsgaWQ6IHIuaWQsIHRpdGxlOiByLnRpdGxlIH0pKTtcbiAgY29uc3Qgcm9vdElkcyA9IG5ldyBTZXQocm9vdHMubWFwKChyKSA9PiByLmlkKSk7XG4gIGNvbnN0IGZvbGRlcnM6IFNjYW5Gb2xkZXJbXSA9IFtdO1xuICBjb25zdCBib29rbWFya3M6IFNjYW5uZWRCb29rbWFya1tdID0gW107XG5cbiAgY29uc3Qgd2FsayA9IChub2RlOiBCb29rbWFya05vZGUsIGN0eDogV2Fsa0NvbnRleHQpOiB2b2lkID0+IHtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4gPz8gW10pIHtcbiAgICAgIGlmIChpc1VubW9kaWZpYWJsZShjaGlsZCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoaXNGb2xkZXIoY2hpbGQpKSB7XG4gICAgICAgIGNvbnN0IGZvbGRlclBhdGggPSBbLi4uY3R4LnBhdGgsIGNoaWxkLnRpdGxlXTtcbiAgICAgICAgZm9sZGVycy5wdXNoKHtcbiAgICAgICAgICBpZDogY2hpbGQuaWQsXG4gICAgICAgICAgcGFyZW50SWQ6IG5vZGUuaWQsXG4gICAgICAgICAgcm9vdElkOiBjdHgucm9vdElkLFxuICAgICAgICAgIHRpdGxlOiBjaGlsZC50aXRsZSxcbiAgICAgICAgICBwYXRoOiBmb2xkZXJQYXRoLFxuICAgICAgICAgIGRlcHRoOiBjdHguZGVwdGggKyAxLFxuICAgICAgICB9KTtcbiAgICAgICAgd2FsayhjaGlsZCwgeyByb290SWQ6IGN0eC5yb290SWQsIHBhdGg6IGZvbGRlclBhdGgsIGRlcHRoOiBjdHguZGVwdGggKyAxIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYm9va21hcmtzLnB1c2goe1xuICAgICAgICAgIGlkOiBjaGlsZC5pZCxcbiAgICAgICAgICB0aXRsZTogY2hpbGQudGl0bGUsXG4gICAgICAgICAgdXJsOiBjaGlsZC51cmwgPz8gJycsXG4gICAgICAgICAgZGF0ZUFkZGVkOiBjaGlsZC5kYXRlQWRkZWQsXG4gICAgICAgICAgcGFyZW50SWQ6IG5vZGUuaWQsXG4gICAgICAgICAgcm9vdElkOiBjdHgucm9vdElkLFxuICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgZm9yIChjb25zdCByb290IG9mIGlkZW50aWZ5Um9vdHModHJlZSkpIHtcbiAgICBpZiAoIXJvb3RJZHMuaGFzKHJvb3QuaWQpKSBjb250aW51ZTtcbiAgICB3YWxrKHJvb3QsIHsgcm9vdElkOiByb290LmlkLCBwYXRoOiBbXSwgZGVwdGg6IDAgfSk7XG4gIH1cblxuICByZXR1cm4geyBzY2FuSWQsIHNjYW5uZWRBdCwgcm9vdHMsIGZvbGRlcnMsIGJvb2ttYXJrcyB9O1xufVxuIiwiaW1wb3J0IHR5cGUgeyBNZXNzYWdlcyB9IGZyb20gJy4vdHlwZXMnO1xuXG5jb25zdCB6aENOOiBNZXNzYWdlcyA9IHtcbiAgYXBwOiB7XG4gICAgdGl0bGU6ICdUaWR5TWFya3MnLFxuICAgIHN0ZXBzOiB7XG4gICAgICBzY2FuOiAn5omr5o+PJyxcbiAgICAgIHNlbGVjdDogJ+mAieaLqScsXG4gICAgICBvcmdhbml6aW5nOiAn5pW055CGJyxcbiAgICAgIHByZXZpZXc6ICfpooTop4gnLFxuICAgICAgcmVzdWx0OiAn5a6M5oiQJyxcbiAgICB9LFxuICB9LFxuICBjb21tb246IHtcbiAgICBiYWNrOiAn6L+U5ZueJyxcbiAgICBzZXR0aW5nczogJ+iuvue9ricsXG4gICAgY2xvc2VTZXR0aW5nczogJ+WFs+mXreiuvue9ricsXG4gICAgc2F2ZTogJ+S/neWtmCcsXG4gICAgY2FuY2VsOiAn5Y+W5raIJyxcbiAgICB1bnRpdGxlZDogJ+aXoOagh+mimCcsXG4gICAgbG9hZGluZzogJ+ato+WcqOWKoOi9vS4uLicsXG4gICAgZGVsZXRpbmc6ICfmraPlnKjliKDpmaQuLi4nLFxuICAgIHNjYW5uaW5nQWN0aW9uOiAn5q2j5Zyo5omr5o+PLi4uJyxcbiAgICB1bm9yZ2FuaXplZDogJ+acquaVtOeQhicsXG4gICAgY291bnRCb29rbWFya3M6ICd7bn0g5p2hJyxcbiAgfSxcbiAgYnVzeToge1xuICAgIHNjYW46ICfmraPlnKjmiavmj4/kuabnrb4uLi4nLFxuICAgIGRlbGV0ZUVtcHR5Rm9sZGVyczogJ+ato+WcqOWIoOmZpOepuuaWh+S7tuWkuS4uLicsXG4gICAgZGVsZXRlRHVwbGljYXRlczogJ+ato+WcqOWIoOmZpOmHjeWkjeS5puetvi4uLicsXG4gICAgZ2VuZXJhdGVQbGFuOiAn5q2j5Zyo55Sf5oiQ5pW055CG5pa55qGILi4uJyxcbiAgICBhcHBseVBsYW46ICfmraPlnKjlupTnlKjmlbTnkIbmlrnmoYguLi4nLFxuICAgIHJldHJ5OiAn5q2j5Zyo6YeN6K+V5aSx6LSl6aG5Li4uJyxcbiAgICB1bmRvOiAn5q2j5Zyo5pKk6ZSA5pyA6L+R5LiA5qyh5pW055CGLi4uJyxcbiAgICBjYW5jZWw6ICfmraPlnKjor7fmsYLkuK3mlq0uLi4nLFxuICB9LFxuICBzZXR0aW5nczoge1xuICAgIHRpdGxlOiAn5qih5Z6L6K6+572uJyxcbiAgICBzdWJ0aXRsZTogJ+mFjee9ruS9oOiHquW3seeahCBPcGVuQUkg5YW85a65IEFQSe+8jOaJgOacieivt+axguebtOaOpeS7jua1j+iniOWZqOWPkeWHuuOAgicsXG4gICAgYmFzZVVybExhYmVsOiAnQmFzZSBVUkwnLFxuICAgIGJhc2VVcmxQbGFjZWhvbGRlcjogJ2h0dHBzOi8vYXBpLm9wZW5haS5jb20vdjEnLFxuICAgIGJhc2VVcmxIZWxwZXI6ICfku4XmlK/mjIEgSFRUUFPvvJvkv53lrZjml7bkvJrlkJHmtY/op4jlmajnlLPor7for6XlnLDlnYDnmoTorr/pl67mnYPpmZDjgIInLFxuICAgIGFwaUtleUxhYmVsOiAnQVBJIEtleScsXG4gICAgYXBpS2V5UGxhY2Vob2xkZXI6ICdzay0uLi4nLFxuICAgIGFwaUtleUhlbHBlcjogJ+WPquWtmOWCqOWcqOacrOWcsCBjaHJvbWUuc3RvcmFnZe+8jOS4jeS8muS4iuS8oOWIsOS7u+S9leacjeWKoeWZqOOAgicsXG4gICAgbW9kZWxMYWJlbDogJ+aooeWei+WQjScsXG4gICAgbW9kZWxQbGFjZWhvbGRlcjogJ2dwdC00by1taW5pJyxcbiAgICBtb2RlbEhlbHBlcjogJ+mcgOimgeaUr+aMgSBKU09OIOe7k+aehOWMlui+k+WHuueahOWvueivneaooeWei+OAgicsXG4gICAgaW52YWxpZEZvcm06ICfor7floavlhpnlkIjms5XnmoQgSFRUUFMgQmFzZSBVUkzjgIFBUEkgS2V5IOWSjOaooeWei+WQjScsXG4gICAgcGVybWlzc2lvbkRlbmllZDogJ+acquaOiOS6iOivpSBBUEkg5Zyw5Z2A55qE6K6/6Zeu5p2D6ZmQJyxcbiAgICB0ZXN0aW5nOiAn5rWL6K+V5LitLi4uJyxcbiAgICB0ZXN0Q29ubmVjdGlvbjogJ+a1i+ivlei/nuaOpScsXG4gICAgdGVzdFN1Y2Nlc3M6ICfov57mjqXmiJDlip/vvIzmqKHlnovmlK/mjIHnu5PmnoTljJbovpPlh7onLFxuICAgIHRlc3RGYWlsZWQ6ICfov57mjqXlpLHotKXvvJp7bXNnfScsXG4gICAgdGVzdFByb21wdDogJ+ivt+WbnuWkjSBvaycsXG4gICAgbmVlZFNldHRpbmdzOiAn6K+35YWI5a6M5oiQ5qih5Z6L6K6+572uJyxcbiAgfSxcbiAgc2Nhbjoge1xuICAgIHRpdGxlSWRsZTogJ+aJq+aPj+S5puetvicsXG4gICAgdGl0bGVEb25lOiAn5omr5o+P5a6M5oiQ77yM5p+l55yL5Lmm562+57uf6K6h5L+h5oGvJyxcbiAgICBzdWJ0aXRsZUlkbGU6ICfmraPlnKjor7vlj5bkvaDnmoTkuabnrb7moJEuLi4nLFxuICAgIHN0YXJ0OiAn5byA5aeL5omr5o+PJyxcbiAgICB0b3RhbEJvb2ttYXJrczogJ+S5puetvuaAu+aVsCcsXG4gICAgZm9sZGVyczogJ+aWh+S7tuWkuScsXG4gICAgb3JnYW5pemFibGU6ICflj6/mlbTnkIbkuabnrb4nLFxuICAgIG5vVGl0bGU6ICfml6DmoIfpopgnLFxuICAgIGNob29zZUZlYXR1cmU6ICfpgInmi6nlip/og70nLFxuICAgIG9yZ2FuaXplOiAn5pW055CG5Lmm562+JyxcbiAgICBvcmdhbml6ZURlc2M6ICdBSSDoh6rliqjliIbnsbvvvIzph43lu7rnm67lvZXnu5PmnoQnLFxuICAgIHNlbGVjdFNjb3BlOiAn6YCJ5oup6IyD5Zu0IOKGkicsXG4gICAgZHVwbGljYXRlczogJ+ajgOafpemHjeWkjeS5puetvicsXG4gICAgZHVwbGljYXRlc0Rlc2M6ICfmib7lh7rnm7jlkIzmiJbnm7jkvLznmoTph43lpI3pobknLFxuICAgIGR1cGxpY2F0ZVJlc3VsdHM6ICfmn6XnnIsge259IOe7hOe7k+aenCDihpInLFxuICAgIG5vRHVwbGljYXRlczogJ+acquWPkeeOsOmHjeWkjemhuScsXG4gICAgZW1wdHlGb2xkZXJzOiAn5riF55CG56m65paH5Lu25aS5JyxcbiAgICBlbXB0eUZvbGRlcnNEZXNjOiAn5Yig6Zmk5LiN5ZCr5Lu75L2V5Lmm562+55qE56m655uu5b2VJyxcbiAgICBlbXB0eUZvbGRlclJlc3VsdHM6ICflj5HnjrAge259IOS4quepuuaWh+S7tuWkuSDihpInLFxuICAgIG5vRW1wdHlGb2xkZXJzOiAn5rKh5pyJ56m65paH5Lu25aS5JyxcbiAgICBkZWxldGVTdW1tYXJ5OiAne2RlbGV0ZWR9IOS4quW3suWIoOmZpO+8jHtmYWlsZWR9IOS4quWIoOmZpOWksei0pScsXG4gICAgc2V0dGluZ3NSZXF1aXJlZDogJ+ivt+WFiOWujOaIkOaooeWei+iuvue9ricsXG4gICAgcHJvZ3Jlc3NEb25lOiAn5omr5o+P5a6M5oiQJyxcbiAgfSxcbiAgZHVwbGljYXRlczoge1xuICAgIGJhY2s6ICfov5Tlm54nLFxuICAgIGZvdW5kU3VtbWFyeTogJ+WFseWPkeeOsCB7bn0g5Liq6YeN5aSNJyxcbiAgICB0aXRsZTogJ+mHjeWkjeS5puetvicsXG4gICAgc3VidGl0bGU6ICfmr4/nu4Tkv53nlZnkuIDpobnvvIzlhbbkvZnlj6/liKDpmaTjgILlj6/lhYjlv73nlaXkuI3lpITnkIbnmoTnu4TjgIInLFxuICAgIGVtcHR5OiAn5rKh5pyJ5Y+R546w6YeN5aSN5Lmm562+JyxcbiAgICBsYWJlbFNhbWVVcmw6ICfnm7jlkIznvZHlnYAnLFxuICAgIGxhYmVsU2ltaWxhclVybDogJ+ebuOS8vOe9keWdgCcsXG4gICAgbGFiZWxTYW1lVGl0bGU6ICfnm7jlkIzmoIfpopgnLFxuICAgIGlnbm9yZTogJ+W/veeVpScsXG4gICAgcmVzdG9yZTogJ+aBouWkjScsXG4gICAga2VlcEFyaWE6ICfkv53nlZkge3RpdGxlfScsXG4gICAgd2lsbERlbGV0ZTogJ+WwhuWIoOmZpCB7bn0g5Liq6YeN5aSN5Lmm562+JyxcbiAgICBkZWxldGVBY3Rpb246ICfliKDpmaTph43lpI3pobknLFxuICB9LFxuICBlbXB0eUZvbGRlcnM6IHtcbiAgICBiYWNrOiAn6L+U5ZueJyxcbiAgICBmb3VuZFN1bW1hcnk6ICflhbHlj5HnjrAge259IOS4quepuuaWh+S7tuWkuScsXG4gICAgdGl0bGU6ICfmuIXnkIbnqbrmlofku7blpLknLFxuICAgIHN1YnRpdGxlOiAn5Y+q5Yig6Zmk5LiN5YyF5ZCr5Lu75L2V5Lmm562+55qE56m655uu5b2V44CCJyxcbiAgICBlbXB0eTogJ+ayoeacieepuuaWh+S7tuWkuScsXG4gICAgZGVsZXRlQXJpYTogJ+WIoOmZpCB7cGF0aH0nLFxuICAgIHdpbGxEZWxldGU6ICflsIbliKDpmaQge259IOS4quepuuaWh+S7tuWkuScsXG4gICAgZGVsZXRlQWN0aW9uOiAn5Yig6Zmk56m65paH5Lu25aS5JyxcbiAgfSxcbiAgc2VsZWN0OiB7XG4gICAgdGl0bGU6ICfpgInmi6nmlbTnkIbojIPlm7QnLFxuICAgIHN1YnRpdGxlOiAn54K55Ye75paH5Lu25aS55p+l55yL5Lmm562+77yM5Yu+6YCJ6KaB5pW055CG55qE5YaF5a65JyxcbiAgICBmb2xkZXJUcmVlOiAn5Lmm562+5paH5Lu25aS5JyxcbiAgICBsb2FkaW5nVHJlZTogJ+ato+WcqOWKoOi9veaWh+S7tuWkueagkS4uLicsXG4gICAgdmlld09ubHk6ICfkuabnrb7ku4Xkvpvmn6XnnIsnLFxuICAgIG5vQm9va21hcmtzOiAn6K+l5paH5Lu25aS55LiL5peg5Lmm562+JyxcbiAgICBjbGlja0ZvbGRlcjogJ+eCueWHu+W3puS+p+aWh+S7tuWkueafpeeci+S5puetvicsXG4gICAgbW9kZVRpdGxlOiAn6YCJ5oup5pW055CG5qih5byPJyxcbiAgICBjb25zZXJ2YXRpdmU6ICfkv53lrojmlbTnkIYnLFxuICAgIGNvbnNlcnZhdGl2ZURlc2M6ICfkv53nlZnnjrDmnInnm67lvZXnu5PmnoTvvIzlj6rmiorkuabnrb7lvZLlhaXlt7LmnInmlofku7blpLknLFxuICAgIHJlb3JnYW5pemU6ICfph43mlrDop4TliJLnm67lvZUnLFxuICAgIHJlb3JnYW5pemVEZXNjOiAnQUkg6Ieq55Sx6K6+6K6h5YWo5paw55qE55uu5b2V5L2T57O777yM6YeN57uE5omA5pyJ6YCJ5Lit5Lmm562+JyxcbiAgICBuYW1lU3R5bGVUaXRsZTogJ+aWh+S7tuWkueWRveWQjemjjuagvCcsXG4gICAgZW1vamlUZXh0OiAn5Zu+5qCHICsg5paH5a2XJyxcbiAgICBlbW9qaVRleHREZXNjOiAn55SoIGVtb2ppIOWJjee8gOWMuuWIhuebruW9le+8jOS4gOecvOi+qOiupCcsXG4gICAgdGV4dE9ubHk6ICfnuq/mloflrZcnLFxuICAgIHRleHRPbmx5RGVzYzogJ+S/neaMgeeugOa0ge+8jOS4jea3u+WKoCBlbW9qaScsXG4gICAgc2VsZWN0ZWRTdW1tYXJ5OiAn5bey6YCJIHtmb2xkZXJzfSDkuKrmlofku7blpLnvvIzlhbEge2NvdW50fSDmnaHkuabnrb4nLFxuICAgIHN0YXJ0QW5hbHlzaXM6ICdBSSDlvIDlp4vliIbmnpAgKHtufSDmnaEpIOKGkicsXG4gICAgZXhhbXBsZUVtb2ppRm9sZGVyOiAn8J+TmiDlrabkuaDotYTmlpknLFxuICAgIGV4YW1wbGVUZXh0Rm9sZGVyOiAn5a2m5Lmg6LWE5paZJyxcbiAgfSxcbiAgb3JnYW5pemluZzoge1xuICAgIHRpdGxlOiAnQUkg5q2j5Zyo5YiG5p6QJyxcbiAgICBzdWJ0aXRsZTogJ+agueaNruagh+mimOOAgVVSTCDlkozlvZPliY3nm67lvZXnlJ/miJDliIbnsbvlu7rorq4nLFxuICAgIHN0ZXBSZWFkOiAn6K+75Y+W5Lmm562+5pWw5o2uLi4uJyxcbiAgICBzdGVwUmVhZERlc2M6ICfku4Xor7vlj5bmoIfpopjjgIFVUkwg5ZKM5b2T5YmN55uu5b2V77yM5LiN6K6/6Zeu572R6aG1JyxcbiAgICBzdGVwRGVzaWduOiAn55Sf5oiQ55uu5b2V5L2T57O7JyxcbiAgICBzdGVwRGVzaWduRGVzYzogJ0FJIOagueaNruS5puetvuWGheWuueiuvuiuoeWIhuexu+ebruW9lScsXG4gICAgc3RlcEFzc2lnbjogJ+WIhumFjeS5puetvicsXG4gICAgc3RlcEFzc2lnbkRlc2M6ICfmiormr4/mnaHkuabnrb7lvZLlhaXmnIDlkIjpgILnmoTnm67lvZUnLFxuICAgIHN0ZXBWYWxpZGF0ZTogJ+agoemqjOe7k+aenCcsXG4gICAgc3RlcFZhbGlkYXRlRGVzYzogJ+ajgOafpeebruW9leWxgue6p+S4juS5puetvuW9kuWxnuaYr+WQpuWQiOazlScsXG4gICAgc3RlcERvbmU6ICfmlrnmoYjlsLHnu6onLFxuICAgIHN0ZXBEb25lRGVzYzogJ+WNs+Wwhui/m+WFpemihOiniO+8jOWPr+ehruiupOWQjuWGjeWGmeWFpScsXG4gICAgdGF4b25vbXk6ICfnlJ/miJDnm67lvZXkvZPns7snLFxuICAgIGFzc2lnbjogJ+WIhumFjeS5puetvicsXG4gICAgcHJpdmFjeTogJ+makOengeivtOaYju+8muS5puetvueahOagh+mimOOAgVVSTCDkuI7nm67lvZXot6/lvoTkvJrlj5HpgIHnu5nkvaDphY3nva7nmoTmqKHlnovmnI3liqHnlKjkuo7liIbnsbvvvJvmianlsZXoh6rouqvkuI3mlLbpm4bjgIHkuI3kuIrkvKDliLDku7vkvZXlhbbku5bmnI3liqHlmajjgIInLFxuICAgIHByZXZTdGVwOiAn4oaQIOS4iuS4gOatpScsXG4gIH0sXG4gIHByZXZpZXc6IHtcbiAgICB0aXRsZTogJ+mihOiniOaVtOeQhuW7uuiuricsXG4gICAgc3VidGl0bGU6ICfkuabnrb7ku4Xkvpvmn6XnnIvjgILmlofku7blpLnmoIfms6jjgIzmlrDjgI3ooajnpLrlsIbmlrDlu7ror6Xnm67lvZXjgIInLFxuICAgIHdpbGxNb3ZlOiAn5bCG56e75YqoJyxcbiAgICBuZXdGb2xkZXJzOiAn5paw5bu655uu5b2VJyxcbiAgICBjbGVhbnVwU2NvcGU6ICfmuIXnkIbojIPlm7QnLFxuICAgIHRyZWVUaXRsZTogJ+aVtOeQhuWQjueahOS5puetvuebruW9leagkScsXG4gICAgY2xlYW51cERlc2M6ICfku4XmuIXnkIbmiYDpgInmlofku7blpLnojIPlm7TlhoXnmoTnqbrnm67lvZXvvIzlj6/kuIDplK7mkqTplIAnLFxuICAgIGJhY2s6ICfov5Tlm54nLFxuICAgIGFwcGx5QWN0aW9uOiAn5bqU55So5pa55qGI5bm25riF55CG56m655uu5b2VICh7bn0g5p2hKSDihpInLFxuICAgIGJhZGdlTmV3OiAn5pawJyxcbiAgICB2aWV3T25seTogJ+S5puetvuS7heS+m+afpeeciycsXG4gIH0sXG4gIHJlc3VsdDoge1xuICAgIHdyaXRpbmdUaXRsZTogJ+ato+WcqOWGmeWFpeS5puetvicsXG4gICAgd3JpdGluZ0Rlc2M6ICfpgJDmnaHnp7vliqjkuabnrb7vvIzlubbmuIXnkIbmiYDpgInojIPlm7TlhoXnmoTnqbrmlofku7blpLknLFxuICAgIGRvbmVUaXRsZTogJ+aVtOeQhuWujOaIkCcsXG4gICAgZG9uZURlc2M6ICfmiJDlip/np7vliqgge259IOadoeS5puetvuWIsOaWsOebruW9lScsXG4gICAgdW5kb25lVGl0bGU6ICflt7LmkqTplIAnLFxuICAgIHVuZG9uZURlc2M6ICflt7LmkqTplIDmnIDov5HkuIDmrKHmlbTnkIbvvIzkuabnrb7lt7Lov5jljp8nLFxuICAgIGludGVycnVwdGVkVGl0bGU6ICflt7LkuK3mlq0nLFxuICAgIGludGVycnVwdGVkRGVzYzogJ+WPr+S7peS7juaWreeCuee7p+e7reW6lOeUqO+8jOaIluaSpOmUgOW3suW6lOeUqOeahOmDqOWIhicsXG4gICAgZmFpbGVkVGl0bGU6ICflupTnlKjlpLHotKUnLFxuICAgIGZhaWxlZERlc2M6ICflj6/ph43or5XmiJbmkqTplIAnLFxuICAgIHBhcnRpYWxVbmRvbmVUaXRsZTogJ+mDqOWIhuaSpOmUgCcsXG4gICAgcGFydGlhbFVuZG9uZURlc2M6ICfpg6jliIbmkqTplIDmiJDlip/vvIzlrZjlnKjlhrLnqoHpobnvvIzlj6/lho3mrKHlsJ3or5UnLFxuICAgIHByb2dyZXNzT2Y6ICd7YXBwbGllZH0gLyB7dG90YWx9IOWujOaIkCcsXG4gICAgc3RhdENvbXBsZXRlZDogJ+W3suWujOaIkCcsXG4gICAgc3RhdFBlbmRpbmc6ICflvoXlpITnkIYnLFxuICAgIHN0YXRGYWlsZWQ6ICflpLHotKUnLFxuICAgIHNuYXBzaG90SGludDogJ+W3suS/neWtmOaBouWkjeW/q+eFp+OAguWujOaIkOWQjuWPr+WcqOe7k+aenOmhteS4gOmUruaSpOmUgOacrOasoeaVtOeQhu+8jOi/mOWOn+aJgOacieS5puetvuiHs+WOn+Wni+S9jee9ruOAgicsXG4gICAgZmFpbHVyZURldGFpbHM6ICflpLHotKXor6bmg4UgKHtufSknLFxuICAgIGludGVycnVwdDogJ+S4reaWrScsXG4gICAgcmVzdW1lOiAn5LuO5pat54K557un57utJyxcbiAgICB1bmRvOiAn5pKk6ZSA5pys5qyh5pW055CGJyxcbiAgICBzdGFydE92ZXI6ICflvIDlp4vmlrDkuIDova7mlbTnkIYnLFxuICB9LFxuICBlcnJvcnM6IHtcbiAgICBhYm9ydGVkOiAn6K+35rGC5bey5Y+W5raIJyxcbiAgICBuZXR3b3JrOiAn572R57uc6K+35rGC5aSx6LSlJyxcbiAgICBuZXR3b3JrQ2hlY2tCYXNlVXJsOiAn572R57uc6K+35rGC5aSx6LSl77yM6K+35qOA5p+lIEJhc2UgVVJMIOS4jue9kee7nOi/nuaOpScsXG4gICAgcmF0ZUxpbWl0ZWQ6ICfmqKHlnovpmZDmtYHvvIhIVFRQIDQyOe+8ie+8jOW3suiHquWKqOmHjeivleS7jeWksei0pScsXG4gICAgc2VydmVyRXJyb3I6ICfmqKHlnovmnI3liqHlvILluLjvvIhIVFRQIHtzdGF0dXN977yJ77yM5bey6Ieq5Yqo6YeN6K+V5LuN5aSx6LSlJyxcbiAgICBhdXRoRmFpbGVkOiAnQVBJIOmJtOadg+Wksei0pe+8iEhUVFAge3N0YXR1c33vvInvvIzor7fmo4Dmn6UgQVBJIEtleScsXG4gICAgaHR0cEVycm9yOiAn5qih5Z6L5o6l5Y+j6L+U5ZueIEhUVFAge3N0YXR1c33vvJp7ZGV0YWlsfScsXG4gICAgZW1wdHlDb250ZW50OiAn5qih5Z6L5ZON5bqU57y65bCR5YaF5a65JyxcbiAgICBpbnZhbGlkSnNvbjogJ+aooeWei+WTjeW6lOS4jeaYr+acieaViOeahCBKU09OJyxcbiAgICBpbnZhbGlkRm9ybWF0OiAn5qih5Z6L5ZON5bqU5LiN56ym5ZCIe3doYXR955qE5qC85byP6KaB5rGCJyxcbiAgICBub0NhdGVnb3JpZXM6ICfmqKHlnovmsqHmnInkuqflh7rku7vkvZXlj6/nlKjnm67lvZUnLFxuICAgIGNvbnNlcnZhdGl2ZU5vRm9sZGVyczogJ+S/neWuiOaooeW8j+S4i++8jOmDqOWIhuaJgOmAieS5puetvuaJgOWcqOWMuuWfn+ayoeacieWPr+eUqOeahOeOsOacieaWh+S7tuWkuScsXG4gICAgaW52YWxpZEJhc2VVcmw6ICdCYXNlIFVSTCDmoLzlvI/kuI3mraPnoa4nLFxuICAgIGh0dHBzT25seTogJ+S7heaUr+aMgSBIVFRQUyDnmoQgQVBJIEJhc2UgVVJMJyxcbiAgICBzdG9yYWdlUXVvdGE6ICfmnKzlnLDlrZjlgqjnqbrpl7TkuI3otrPvvIzor7fnvKnlsI/mlbTnkIbojIPlm7TvvIhjaHJvbWUuc3RvcmFnZS5sb2NhbCDphY3pop3nuqYgMTAgTULvvIknLFxuICAgIG1lc3NhZ2luZ1VucmVhY2hhYmxlOiAn5peg5rOV6IGU57O75ZCO5Y+w5pyN5Yqh77yM6K+36YeN5paw5omT5byA5omp5bGV6aG16Z2iJyxcbiAgICB1bmtub3duUmVzcG9uc2U6ICflkI7lj7DmnI3liqHov5Tlm57kuobml6Dms5Xor4bliKvnmoTlk43lupQnLFxuICAgIHVua25vd25Db21tYW5kOiAn5pyq55+l5oiW6Z2e5rOV55qE5ZG95LukJyxcbiAgICBqb2JOb3RGb3VuZDogJ+S7u+WKoeS4jeWtmOWcqOaIluW3sui/h+acn++8jOivt+mHjeaWsOaJq+aPjycsXG4gICAgam9iRXhwaXJlZDogJ+S7u+WKoeS4jeWtmOWcqOaIluW3sui/h+acnycsXG4gICAgbm9TY2FuOiAn5rKh5pyJ5Y+v55So55qE5omr5o+P57uT5p6c77yM6K+35YWI5omr5o+PJyxcbiAgICBub1BsYW46ICfmsqHmnInlj6/nlKjnmoTliIbnsbvmlrnmoYjvvIzor7flhYjnlJ/miJDmlrnmoYgnLFxuICAgIGNhbm5vdEFwcGx5SW5TdGF0ZTogJ+W9k+WJjeS7u+WKoeeKtuaAgeS4uiB7c3RhdHVzfe+8jOaXoOazleW8gOWni+W6lOeUqCcsXG4gICAgY2Fubm90VW5kb0luU3RhdGU6ICflvZPliY3ku7vliqHnirbmgIHkuLoge3N0YXR1c33vvIzml6Dms5XlvIDlp4vmkqTplIAnLFxuICAgIGJvb2ttYXJrTWlzc2luZzogJ+S5puetvuW3suS4jeWtmOWcqO+8jOi3s+i/hycsXG4gICAgYm9va21hcmtHb25lRHVyaW5nQXBwbHk6ICfkuabnrb7lnKjlupTnlKjov4fnqIvkuK3ooqvliKDpmaQnLFxuICAgIGNvbnNlcnZhdGl2ZUZvbGRlckdvbmU6ICfkv53lrojmqKHlvI/nmoTnm67moIfmlofku7blpLnlt7LkuI3lrZjlnKjvvIzlt7Lot7Pov4cnLFxuICAgIGNsZWFudXBGb2xkZXJGYWlsZWQ6ICfmuIXnkIbnqbrmlofku7blpLnigJx7dGl0bGV94oCd5aSx6LSl77yae21lc3NhZ2V9JyxcbiAgICBub3RTY2FubmVkRW1wdHlGb2xkZXI6ICflvoXliKDpmaTpobnkuI3mmK/lvZPliY3miavmj4/or4bliKvlh7rnmoTnqbrmlofku7blpLnvvIzor7fph43mlrDmo4Dmn6UnLFxuICAgIG5vdFNjYW5uZWREdXBsaWNhdGU6ICflvoXliKDpmaTpobnkuI3mmK/lvZPliY3miavmj4/or4bliKvlh7rnmoTph43lpI3kuabnrb7vvIzor7fph43mlrDmo4Dmn6UnLFxuICAgIGtlZXBPbmVQZXJHcm91cDogJ+avj+e7hOmHjeWkjeS5puetvuiHs+WwkemcgOimgeS/neeVmeS4gOmhuScsXG4gICAgZm9sZGVyQWxyZWFkeUhhc0Jvb2ttYXJrczogJ+aWh+S7tuWkueWGheW3suWtmOWcqOS5puetvu+8jOW3sui3s+i/hycsXG4gICAgZGVsZXRlRmFpbGVkOiAn5Yig6Zmk5aSx6LSlJyxcbiAgICB1bmRvTW92ZWRCeVVzZXI6ICfkuabnrb7lt7Looqvlho3mrKHnp7vliqjvvIzot7Pov4fku6XkuI3opobnm5bnlKjmiLfnmoTmlrDmk43kvZwnLFxuICAgIHVuZG9Cb29rbWFya01pc3Npbmc6ICfkuabnrb7lt7LliKDpmaTvvIzml6Dms5XmgaLlpI0nLFxuICAgIHVuZG9QYXJlbnRNaXNzaW5nOiAn5Y6f54i255uu5b2V5bey5LiN5a2Y5Zyo77yM5peg5rOV5oGi5aSNJyxcbiAgICByZXN0b3JlRmFpbGVkOiAn5oGi5aSN5aSx6LSl77yae21lc3NhZ2V9JyxcbiAgICBub1VuZG9TbmFwc2hvdDogJ+ayoeacieWPr+eUqOS6juaSpOmUgOeahOacgOi/keS4gOasoeaVtOeQhuW/q+eFpycsXG4gICAgdW5kb0ludGVycnVwdGVkOiAn5bey5oyJ55So5oi36K+35rGC5Lit5pat5pKk6ZSA77yM5Y+v6YeN5paw5Y+R6LW35pKk6ZSAJyxcbiAgICB0ZXN0UGluZzogJ+ivt+WbnuWkjSBvaycsXG4gICAgd2hhdENhbmRpZGF0ZVRheG9ub215OiAn5YCZ6YCJ55uu5b2V5om55qyhJyxcbiAgICB3aGF0VGF4b25vbXk6ICfnm67lvZXkvZPns7snLFxuICAgIHdoYXRBc3NpZ25tZW50OiAn5Lmm562+5YiG6YWN5om55qyhJyxcbiAgICBpbGxlZ2FsVHJhbnNpdGlvbjogJ+mdnuazleS7u+WKoeeKtuaAgei/geenuzoge2Zyb219IC0+IHt0b30nLFxuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgemhDTjtcbiIsImltcG9ydCB0eXBlIHsgTWVzc2FnZXMgfSBmcm9tICcuL3R5cGVzJztcblxuY29uc3QgZW46IE1lc3NhZ2VzID0ge1xuICBhcHA6IHtcbiAgICB0aXRsZTogJ1RpZHlNYXJrcycsXG4gICAgc3RlcHM6IHtcbiAgICAgIHNjYW46ICdTY2FuJyxcbiAgICAgIHNlbGVjdDogJ1NlbGVjdCcsXG4gICAgICBvcmdhbml6aW5nOiAnT3JnYW5pemUnLFxuICAgICAgcHJldmlldzogJ1ByZXZpZXcnLFxuICAgICAgcmVzdWx0OiAnRG9uZScsXG4gICAgfSxcbiAgfSxcbiAgY29tbW9uOiB7XG4gICAgYmFjazogJ0JhY2snLFxuICAgIHNldHRpbmdzOiAnU2V0dGluZ3MnLFxuICAgIGNsb3NlU2V0dGluZ3M6ICdDbG9zZSBzZXR0aW5ncycsXG4gICAgc2F2ZTogJ1NhdmUnLFxuICAgIGNhbmNlbDogJ0NhbmNlbCcsXG4gICAgdW50aXRsZWQ6ICdVbnRpdGxlZCcsXG4gICAgbG9hZGluZzogJ0xvYWRpbmcuLi4nLFxuICAgIGRlbGV0aW5nOiAnRGVsZXRpbmcuLi4nLFxuICAgIHNjYW5uaW5nQWN0aW9uOiAnU2Nhbm5pbmcuLi4nLFxuICAgIHVub3JnYW5pemVkOiAnVW5vcmdhbml6ZWQnLFxuICAgIGNvdW50Qm9va21hcmtzOiAne259IGJvb2ttYXJrcycsXG4gIH0sXG4gIGJ1c3k6IHtcbiAgICBzY2FuOiAnU2Nhbm5pbmcgYm9va21hcmtzLi4uJyxcbiAgICBkZWxldGVFbXB0eUZvbGRlcnM6ICdEZWxldGluZyBlbXB0eSBmb2xkZXJzLi4uJyxcbiAgICBkZWxldGVEdXBsaWNhdGVzOiAnRGVsZXRpbmcgZHVwbGljYXRlIGJvb2ttYXJrcy4uLicsXG4gICAgZ2VuZXJhdGVQbGFuOiAnR2VuZXJhdGluZyBvcmdhbml6ZSBwbGFuLi4uJyxcbiAgICBhcHBseVBsYW46ICdBcHBseWluZyBvcmdhbml6ZSBwbGFuLi4uJyxcbiAgICByZXRyeTogJ1JldHJ5aW5nIGZhaWxlZCBpdGVtcy4uLicsXG4gICAgdW5kbzogJ1VuZG9pbmcgdGhlIGxhc3Qgb3JnYW5pemUuLi4nLFxuICAgIGNhbmNlbDogJ1JlcXVlc3RpbmcgaW50ZXJydXB0aW9uLi4uJyxcbiAgfSxcbiAgc2V0dGluZ3M6IHtcbiAgICB0aXRsZTogJ01vZGVsIFNldHRpbmdzJyxcbiAgICBzdWJ0aXRsZTogJ0NvbmZpZ3VyZSB5b3VyIG93biBPcGVuQUktY29tcGF0aWJsZSBBUEkuIEFsbCByZXF1ZXN0cyBhcmUgc2VudCBkaXJlY3RseSBmcm9tIHlvdXIgYnJvd3Nlci4nLFxuICAgIGJhc2VVcmxMYWJlbDogJ0Jhc2UgVVJMJyxcbiAgICBiYXNlVXJsUGxhY2Vob2xkZXI6ICdodHRwczovL2FwaS5vcGVuYWkuY29tL3YxJyxcbiAgICBiYXNlVXJsSGVscGVyOiAnSFRUUFMgb25seS4gQWNjZXNzIHBlcm1pc3Npb24gZm9yIHRoaXMgb3JpZ2luIHdpbGwgYmUgcmVxdWVzdGVkIHdoZW4gc2F2aW5nLicsXG4gICAgYXBpS2V5TGFiZWw6ICdBUEkgS2V5JyxcbiAgICBhcGlLZXlQbGFjZWhvbGRlcjogJ3NrLS4uLicsXG4gICAgYXBpS2V5SGVscGVyOiAnU3RvcmVkIG9ubHkgaW4gbG9jYWwgY2hyb21lLnN0b3JhZ2U7IG5ldmVyIHVwbG9hZGVkIHRvIGFueSBzZXJ2ZXIuJyxcbiAgICBtb2RlbExhYmVsOiAnTW9kZWwnLFxuICAgIG1vZGVsUGxhY2Vob2xkZXI6ICdncHQtNG8tbWluaScsXG4gICAgbW9kZWxIZWxwZXI6ICdBIGNoYXQgbW9kZWwgdGhhdCBzdXBwb3J0cyBKU09OIHN0cnVjdHVyZWQgb3V0cHV0LicsXG4gICAgaW52YWxpZEZvcm06ICdQbGVhc2UgZW50ZXIgYSB2YWxpZCBIVFRQUyBCYXNlIFVSTCwgQVBJIEtleSBhbmQgbW9kZWwgbmFtZScsXG4gICAgcGVybWlzc2lvbkRlbmllZDogJ0FjY2VzcyBwZXJtaXNzaW9uIGZvciB0aGlzIEFQSSBvcmlnaW4gd2FzIG5vdCBncmFudGVkJyxcbiAgICB0ZXN0aW5nOiAnVGVzdGluZy4uLicsXG4gICAgdGVzdENvbm5lY3Rpb246ICdUZXN0IGNvbm5lY3Rpb24nLFxuICAgIHRlc3RTdWNjZXNzOiAnQ29ubmVjdGVkLiBUaGUgbW9kZWwgc3VwcG9ydHMgc3RydWN0dXJlZCBvdXRwdXQnLFxuICAgIHRlc3RGYWlsZWQ6ICdDb25uZWN0aW9uIGZhaWxlZDoge21zZ30nLFxuICAgIHRlc3RQcm9tcHQ6ICdQbGVhc2UgcmVwbHkgd2l0aCBvaycsXG4gICAgbmVlZFNldHRpbmdzOiAnUGxlYXNlIGNvbXBsZXRlIHRoZSBtb2RlbCBzZXR0aW5ncyBmaXJzdCcsXG4gIH0sXG4gIHNjYW46IHtcbiAgICB0aXRsZUlkbGU6ICdTY2FuIGJvb2ttYXJrcycsXG4gICAgdGl0bGVEb25lOiAnU2NhbiBjb21wbGV0ZS4gVmlldyBib29rbWFyayBzdGF0cycsXG4gICAgc3VidGl0bGVJZGxlOiAnUmVhZGluZyB5b3VyIGJvb2ttYXJrIHRyZWUuLi4nLFxuICAgIHN0YXJ0OiAnU3RhcnQgc2NhbicsXG4gICAgdG90YWxCb29rbWFya3M6ICdUb3RhbCBib29rbWFya3MnLFxuICAgIGZvbGRlcnM6ICdGb2xkZXJzJyxcbiAgICBvcmdhbml6YWJsZTogJ09yZ2FuaXphYmxlJyxcbiAgICBub1RpdGxlOiAnVW50aXRsZWQnLFxuICAgIGNob29zZUZlYXR1cmU6ICdDaG9vc2UgYSBmZWF0dXJlJyxcbiAgICBvcmdhbml6ZTogJ09yZ2FuaXplIGJvb2ttYXJrcycsXG4gICAgb3JnYW5pemVEZXNjOiAnQUkgYXV0by1jYXRlZ29yaXplcyBhbmQgcmVidWlsZHMgdGhlIGZvbGRlciBzdHJ1Y3R1cmUnLFxuICAgIHNlbGVjdFNjb3BlOiAnU2VsZWN0IHNjb3BlIOKGkicsXG4gICAgZHVwbGljYXRlczogJ0NoZWNrIGR1cGxpY2F0ZXMnLFxuICAgIGR1cGxpY2F0ZXNEZXNjOiAnRmluZCBpZGVudGljYWwgb3Igc2ltaWxhciBkdXBsaWNhdGUgaXRlbXMnLFxuICAgIGR1cGxpY2F0ZVJlc3VsdHM6ICdWaWV3IHtufSBncm91cHMg4oaSJyxcbiAgICBub0R1cGxpY2F0ZXM6ICdObyBkdXBsaWNhdGVzIGZvdW5kJyxcbiAgICBlbXB0eUZvbGRlcnM6ICdDbGVhbiBlbXB0eSBmb2xkZXJzJyxcbiAgICBlbXB0eUZvbGRlcnNEZXNjOiAnRGVsZXRlIGVtcHR5IGZvbGRlcnMgdGhhdCBjb250YWluIG5vIGJvb2ttYXJrcycsXG4gICAgZW1wdHlGb2xkZXJSZXN1bHRzOiAnRm91bmQge259IGVtcHR5IGZvbGRlcnMg4oaSJyxcbiAgICBub0VtcHR5Rm9sZGVyczogJ05vIGVtcHR5IGZvbGRlcnMnLFxuICAgIGRlbGV0ZVN1bW1hcnk6ICd7ZGVsZXRlZH0gZGVsZXRlZCwge2ZhaWxlZH0gZmFpbGVkJyxcbiAgICBzZXR0aW5nc1JlcXVpcmVkOiAnUGxlYXNlIGNvbXBsZXRlIHRoZSBtb2RlbCBzZXR0aW5ncyBmaXJzdCcsXG4gICAgcHJvZ3Jlc3NEb25lOiAnU2NhbiBjb21wbGV0ZScsXG4gIH0sXG4gIGR1cGxpY2F0ZXM6IHtcbiAgICBiYWNrOiAnQmFjaycsXG4gICAgZm91bmRTdW1tYXJ5OiAne259IGR1cGxpY2F0ZXMgZm91bmQgaW4gdG90YWwnLFxuICAgIHRpdGxlOiAnRHVwbGljYXRlIGJvb2ttYXJrcycsXG4gICAgc3VidGl0bGU6ICdLZWVwIG9uZSBpdGVtIHBlciBncm91cDsgdGhlIHJlc3QgY2FuIGJlIGRlbGV0ZWQuIFlvdSBjYW4gaWdub3JlIGdyb3VwcyBmb3Igbm93LicsXG4gICAgZW1wdHk6ICdObyBkdXBsaWNhdGUgYm9va21hcmtzIGZvdW5kJyxcbiAgICBsYWJlbFNhbWVVcmw6ICdTYW1lIFVSTCcsXG4gICAgbGFiZWxTaW1pbGFyVXJsOiAnU2ltaWxhciBVUkwnLFxuICAgIGxhYmVsU2FtZVRpdGxlOiAnU2FtZSB0aXRsZScsXG4gICAgaWdub3JlOiAnSWdub3JlJyxcbiAgICByZXN0b3JlOiAnUmVzdG9yZScsXG4gICAga2VlcEFyaWE6ICdLZWVwIHt0aXRsZX0nLFxuICAgIHdpbGxEZWxldGU6ICdXaWxsIGRlbGV0ZSB7bn0gZHVwbGljYXRlIGJvb2ttYXJrcycsXG4gICAgZGVsZXRlQWN0aW9uOiAnRGVsZXRlIGR1cGxpY2F0ZXMnLFxuICB9LFxuICBlbXB0eUZvbGRlcnM6IHtcbiAgICBiYWNrOiAnQmFjaycsXG4gICAgZm91bmRTdW1tYXJ5OiAne259IGVtcHR5IGZvbGRlcnMgZm91bmQgaW4gdG90YWwnLFxuICAgIHRpdGxlOiAnQ2xlYW4gZW1wdHkgZm9sZGVycycsXG4gICAgc3VidGl0bGU6ICdPbmx5IGRlbGV0ZSBlbXB0eSBmb2xkZXJzIHRoYXQgY29udGFpbiBubyBib29rbWFya3MuJyxcbiAgICBlbXB0eTogJ05vIGVtcHR5IGZvbGRlcnMnLFxuICAgIGRlbGV0ZUFyaWE6ICdEZWxldGUge3BhdGh9JyxcbiAgICB3aWxsRGVsZXRlOiAnV2lsbCBkZWxldGUge259IGVtcHR5IGZvbGRlcnMnLFxuICAgIGRlbGV0ZUFjdGlvbjogJ0RlbGV0ZSBlbXB0eSBmb2xkZXJzJyxcbiAgfSxcbiAgc2VsZWN0OiB7XG4gICAgdGl0bGU6ICdTZWxlY3Qgb3JnYW5pemUgc2NvcGUnLFxuICAgIHN1YnRpdGxlOiAnQ2xpY2sgYSBmb2xkZXIgdG8gdmlldyBib29rbWFya3M7IGNoZWNrIHdoYXQgdG8gb3JnYW5pemUnLFxuICAgIGZvbGRlclRyZWU6ICdCb29rbWFyayBmb2xkZXJzJyxcbiAgICBsb2FkaW5nVHJlZTogJ0xvYWRpbmcgZm9sZGVyIHRyZWUuLi4nLFxuICAgIHZpZXdPbmx5OiAnQm9va21hcmtzIGFyZSB2aWV3LW9ubHknLFxuICAgIG5vQm9va21hcmtzOiAnTm8gYm9va21hcmtzIGluIHRoaXMgZm9sZGVyJyxcbiAgICBjbGlja0ZvbGRlcjogJ0NsaWNrIGEgZm9sZGVyIG9uIHRoZSBsZWZ0IHRvIHZpZXcgYm9va21hcmtzJyxcbiAgICBtb2RlVGl0bGU6ICdDaG9vc2Ugb3JnYW5pemUgbW9kZScsXG4gICAgY29uc2VydmF0aXZlOiAnQ29uc2VydmF0aXZlIG9yZ2FuaXplJyxcbiAgICBjb25zZXJ2YXRpdmVEZXNjOiAnS2VlcCB0aGUgZXhpc3Rpbmcgc3RydWN0dXJlOyBvbmx5IGZpbGUgYm9va21hcmtzIGludG8gZXhpc3RpbmcgZm9sZGVycycsXG4gICAgcmVvcmdhbml6ZTogJ1JlYnVpbGQgdGhlIHN0cnVjdHVyZScsXG4gICAgcmVvcmdhbml6ZURlc2M6ICdBSSBmcmVlbHkgZGVzaWducyBhIGJyYW5kLW5ldyBmb2xkZXIgc3lzdGVtIGFuZCByZW9yZ2FuaXplcyBhbGwgc2VsZWN0ZWQgYm9va21hcmtzJyxcbiAgICBuYW1lU3R5bGVUaXRsZTogJ0ZvbGRlciBuYW1pbmcgc3R5bGUnLFxuICAgIGVtb2ppVGV4dDogJ0ljb24gKyB0ZXh0JyxcbiAgICBlbW9qaVRleHREZXNjOiAnRGlzdGluZ3Vpc2ggZm9sZGVycyB3aXRoIGVtb2ppIHByZWZpeGVzIGF0IGEgZ2xhbmNlJyxcbiAgICB0ZXh0T25seTogJ1RleHQgb25seScsXG4gICAgdGV4dE9ubHlEZXNjOiAnS2VlcCBpdCBjbGVhbiwgbm8gZW1vamknLFxuICAgIHNlbGVjdGVkU3VtbWFyeTogJ3tmb2xkZXJzfSBmb2xkZXJzIHNlbGVjdGVkLCB7Y291bnR9IGJvb2ttYXJrcyBpbiB0b3RhbCcsXG4gICAgc3RhcnRBbmFseXNpczogJ1N0YXJ0IEFJIGFuYWx5c2lzICh7bn0gYm9va21hcmtzKSDihpInLFxuICAgIGV4YW1wbGVFbW9qaUZvbGRlcjogJ/Cfk5ogUmVhZGluZycsXG4gICAgZXhhbXBsZVRleHRGb2xkZXI6ICdSZWFkaW5nJyxcbiAgfSxcbiAgb3JnYW5pemluZzoge1xuICAgIHRpdGxlOiAnQUkgaXMgYW5hbHl6aW5nJyxcbiAgICBzdWJ0aXRsZTogJ0dlbmVyYXRpbmcgY2F0ZWdvcnkgc3VnZ2VzdGlvbnMgZnJvbSB0aXRsZXMsIFVSTHMgYW5kIGN1cnJlbnQgZm9sZGVycycsXG4gICAgc3RlcFJlYWQ6ICdSZWFkaW5nIGJvb2ttYXJrIGRhdGEuLi4nLFxuICAgIHN0ZXBSZWFkRGVzYzogJ09ubHkgdGl0bGVzLCBVUkxzIGFuZCBjdXJyZW50IGZvbGRlcnMgYXJlIHJlYWQ7IHBhZ2VzIGFyZSBuZXZlciB2aXNpdGVkJyxcbiAgICBzdGVwRGVzaWduOiAnRGVzaWduaW5nIGZvbGRlciBzeXN0ZW0nLFxuICAgIHN0ZXBEZXNpZ25EZXNjOiAnQUkgZGVzaWducyBjYXRlZ29yeSBmb2xkZXJzIGZyb20geW91ciBib29rbWFyayBjb250ZW50JyxcbiAgICBzdGVwQXNzaWduOiAnQXNzaWduaW5nIGJvb2ttYXJrcycsXG4gICAgc3RlcEFzc2lnbkRlc2M6ICdGaWxpbmcgZWFjaCBib29rbWFyayBpbnRvIHRoZSBtb3N0IHN1aXRhYmxlIGZvbGRlcicsXG4gICAgc3RlcFZhbGlkYXRlOiAnVmFsaWRhdGluZyByZXN1bHRzJyxcbiAgICBzdGVwVmFsaWRhdGVEZXNjOiAnQ2hlY2tpbmcgZm9sZGVyIGRlcHRoIGFuZCBib29rbWFyayBhc3NpZ25tZW50cycsXG4gICAgc3RlcERvbmU6ICdQbGFuIHJlYWR5JyxcbiAgICBzdGVwRG9uZURlc2M6ICdFbnRlcmluZyBwcmV2aWV3OyBub3RoaW5nIGlzIHdyaXR0ZW4gdW50aWwgeW91IGNvbmZpcm0nLFxuICAgIHRheG9ub215OiAnRGVzaWduaW5nIGZvbGRlciBzeXN0ZW0nLFxuICAgIGFzc2lnbjogJ0Fzc2lnbmluZyBib29rbWFya3MnLFxuICAgIHByaXZhY3k6ICdQcml2YWN5IG5vdGU6IGJvb2ttYXJrIHRpdGxlcywgVVJMcyBhbmQgZm9sZGVyIHBhdGhzIGFyZSBzZW50IHRvIHRoZSBtb2RlbCBzZXJ2aWNlIHlvdSBjb25maWd1cmVkIGZvciBjYXRlZ29yaXphdGlvbi4gVGhpcyBleHRlbnNpb24gaXRzZWxmIGNvbGxlY3RzIG5vdGhpbmcgYW5kIHVwbG9hZHMgbm93aGVyZSBlbHNlLicsXG4gICAgcHJldlN0ZXA6ICfihpAgUHJldmlvdXMnLFxuICB9LFxuICBwcmV2aWV3OiB7XG4gICAgdGl0bGU6ICdQcmV2aWV3IHRoZSBvcmdhbml6ZSBwbGFuJyxcbiAgICBzdWJ0aXRsZTogJ0Jvb2ttYXJrcyBhcmUgdmlldy1vbmx5LiBGb2xkZXJzIG1hcmtlZCDigJxOZXfigJ0gd2lsbCBiZSBjcmVhdGVkLicsXG4gICAgd2lsbE1vdmU6ICdXaWxsIG1vdmUnLFxuICAgIG5ld0ZvbGRlcnM6ICdOZXcgZm9sZGVycycsXG4gICAgY2xlYW51cFNjb3BlOiAnQ2xlYW51cCBzY29wZScsXG4gICAgdHJlZVRpdGxlOiAnQm9va21hcmsgdHJlZSBhZnRlciBvcmdhbml6aW5nJyxcbiAgICBjbGVhbnVwRGVzYzogJ09ubHkgZW1wdHkgZm9sZGVycyB3aXRoaW4gdGhlIHNlbGVjdGVkIHNjb3BlIGFyZSBjbGVhbmVkOyB1bmRvYWJsZSBpbiBvbmUgY2xpY2snLFxuICAgIGJhY2s6ICdCYWNrJyxcbiAgICBhcHBseUFjdGlvbjogJ0FwcGx5IHBsYW4gYW5kIGNsZWFuIGVtcHR5IGZvbGRlcnMgKHtufSBib29rbWFya3MpIOKGkicsXG4gICAgYmFkZ2VOZXc6ICdOZXcnLFxuICAgIHZpZXdPbmx5OiAnQm9va21hcmtzIGFyZSB2aWV3LW9ubHknLFxuICB9LFxuICByZXN1bHQ6IHtcbiAgICB3cml0aW5nVGl0bGU6ICdXcml0aW5nIGJvb2ttYXJrcycsXG4gICAgd3JpdGluZ0Rlc2M6ICdNb3ZpbmcgYm9va21hcmtzIG9uZSBieSBvbmUgYW5kIGNsZWFuaW5nIGVtcHR5IGZvbGRlcnMgaW4gc2NvcGUnLFxuICAgIGRvbmVUaXRsZTogJ09yZ2FuaXplIGNvbXBsZXRlJyxcbiAgICBkb25lRGVzYzogJ1N1Y2Nlc3NmdWxseSBtb3ZlZCB7bn0gYm9va21hcmtzIHRvIG5ldyBmb2xkZXJzJyxcbiAgICB1bmRvbmVUaXRsZTogJ1VuZG9uZScsXG4gICAgdW5kb25lRGVzYzogJ1RoZSBsYXN0IG9yZ2FuaXplIGhhcyBiZWVuIHVuZG9uZSBhbmQgYm9va21hcmtzIHJlc3RvcmVkJyxcbiAgICBpbnRlcnJ1cHRlZFRpdGxlOiAnSW50ZXJydXB0ZWQnLFxuICAgIGludGVycnVwdGVkRGVzYzogJ1lvdSBjYW4gcmVzdW1lIGFwcGx5aW5nIGZyb20gdGhlIGN1cnNvciwgb3IgdW5kbyB3aGF0IGhhcyBiZWVuIGFwcGxpZWQnLFxuICAgIGZhaWxlZFRpdGxlOiAnQXBwbHkgZmFpbGVkJyxcbiAgICBmYWlsZWREZXNjOiAnWW91IGNhbiByZXRyeSBvciB1bmRvJyxcbiAgICBwYXJ0aWFsVW5kb25lVGl0bGU6ICdQYXJ0aWFsbHkgdW5kb25lJyxcbiAgICBwYXJ0aWFsVW5kb25lRGVzYzogJ1VuZG8gcGFydGlhbGx5IHN1Y2NlZWRlZCB3aXRoIGNvbmZsaWN0czsgeW91IGNhbiB0cnkgYWdhaW4nLFxuICAgIHByb2dyZXNzT2Y6ICd7YXBwbGllZH0gLyB7dG90YWx9IGRvbmUnLFxuICAgIHN0YXRDb21wbGV0ZWQ6ICdEb25lJyxcbiAgICBzdGF0UGVuZGluZzogJ1BlbmRpbmcnLFxuICAgIHN0YXRGYWlsZWQ6ICdGYWlsZWQnLFxuICAgIHNuYXBzaG90SGludDogJ0EgcmVzdG9yZSBzbmFwc2hvdCBoYXMgYmVlbiBzYXZlZC4gV2hlbiBmaW5pc2hlZCwgeW91IGNhbiB1bmRvIHRoaXMgb3JnYW5pemUgaW4gb25lIGNsaWNrIGFuZCByZXN0b3JlIGFsbCBib29rbWFya3MgdG8gdGhlaXIgb3JpZ2luYWwgbG9jYXRpb25zLicsXG4gICAgZmFpbHVyZURldGFpbHM6ICdGYWlsdXJlIGRldGFpbHMgKHtufSknLFxuICAgIGludGVycnVwdDogJ0ludGVycnVwdCcsXG4gICAgcmVzdW1lOiAnUmVzdW1lIGZyb20gY3Vyc29yJyxcbiAgICB1bmRvOiAnVW5kbyB0aGlzIG9yZ2FuaXplJyxcbiAgICBzdGFydE92ZXI6ICdTdGFydCBhIG5ldyByb3VuZCcsXG4gIH0sXG4gIGVycm9yczoge1xuICAgIGFib3J0ZWQ6ICdSZXF1ZXN0IGFib3J0ZWQnLFxuICAgIG5ldHdvcms6ICdOZXR3b3JrIHJlcXVlc3QgZmFpbGVkJyxcbiAgICBuZXR3b3JrQ2hlY2tCYXNlVXJsOiAnTmV0d29yayByZXF1ZXN0IGZhaWxlZC4gQ2hlY2sgdGhlIEJhc2UgVVJMIGFuZCB5b3VyIGNvbm5lY3Rpb24nLFxuICAgIHJhdGVMaW1pdGVkOiAnTW9kZWwgcmF0ZS1saW1pdGVkIChIVFRQIDQyOSk7IGF1dG9tYXRpYyByZXRyaWVzIGV4aGF1c3RlZCcsXG4gICAgc2VydmVyRXJyb3I6ICdNb2RlbCBzZXJ2aWNlIGVycm9yIChIVFRQIHtzdGF0dXN9KTsgYXV0b21hdGljIHJldHJpZXMgZXhoYXVzdGVkJyxcbiAgICBhdXRoRmFpbGVkOiAnQVBJIGF1dGhlbnRpY2F0aW9uIGZhaWxlZCAoSFRUUCB7c3RhdHVzfSkuIENoZWNrIHlvdXIgQVBJIEtleScsXG4gICAgaHR0cEVycm9yOiAnTW9kZWwgQVBJIHJldHVybmVkIEhUVFAge3N0YXR1c306IHtkZXRhaWx9JyxcbiAgICBlbXB0eUNvbnRlbnQ6ICdNb2RlbCByZXNwb25zZSBjb250YWluZWQgbm8gY29udGVudCcsXG4gICAgaW52YWxpZEpzb246ICdNb2RlbCByZXNwb25zZSBpcyBub3QgdmFsaWQgSlNPTicsXG4gICAgaW52YWxpZEZvcm1hdDogJ01vZGVsIHJlc3BvbnNlIGRvZXMgbm90IG1hdGNoIHRoZSByZXF1aXJlZCBmb3JtYXQ6IHt3aGF0fScsXG4gICAgbm9DYXRlZ29yaWVzOiAnVGhlIG1vZGVsIHByb2R1Y2VkIG5vIHVzYWJsZSBmb2xkZXJzJyxcbiAgICBjb25zZXJ2YXRpdmVOb0ZvbGRlcnM6ICdJbiBjb25zZXJ2YXRpdmUgbW9kZSwgc29tZSBzZWxlY3RlZCBib29rbWFya3MgaGF2ZSBubyBleGlzdGluZyBmb2xkZXJzIGF2YWlsYWJsZScsXG4gICAgaW52YWxpZEJhc2VVcmw6ICdJbnZhbGlkIEJhc2UgVVJMIGZvcm1hdCcsXG4gICAgaHR0cHNPbmx5OiAnT25seSBIVFRQUyBCYXNlIFVSTHMgYXJlIHN1cHBvcnRlZCcsXG4gICAgc3RvcmFnZVF1b3RhOiAnTm90IGVub3VnaCBsb2NhbCBzdG9yYWdlLiBSZWR1Y2UgdGhlIG9yZ2FuaXplIHNjb3BlIChjaHJvbWUuc3RvcmFnZS5sb2NhbCBxdW90YSBpcyBhYm91dCAxMCBNQiknLFxuICAgIG1lc3NhZ2luZ1VucmVhY2hhYmxlOiAnQ2Fubm90IHJlYWNoIHRoZSBiYWNrZ3JvdW5kIHNlcnZpY2UuIFBsZWFzZSByZW9wZW4gdGhlIGV4dGVuc2lvbiBwYWdlJyxcbiAgICB1bmtub3duUmVzcG9uc2U6ICdUaGUgYmFja2dyb3VuZCBzZXJ2aWNlIHJldHVybmVkIGFuIHVucmVjb2duaXplZCByZXNwb25zZScsXG4gICAgdW5rbm93bkNvbW1hbmQ6ICdVbmtub3duIG9yIGludmFsaWQgY29tbWFuZCcsXG4gICAgam9iTm90Rm91bmQ6ICdKb2Igbm90IGZvdW5kIG9yIGV4cGlyZWQuIFBsZWFzZSBzY2FuIGFnYWluJyxcbiAgICBqb2JFeHBpcmVkOiAnSm9iIG5vdCBmb3VuZCBvciBleHBpcmVkJyxcbiAgICBub1NjYW46ICdObyBzY2FuIHJlc3VsdCBhdmFpbGFibGUuIFBsZWFzZSBzY2FuIGZpcnN0JyxcbiAgICBub1BsYW46ICdObyBvcmdhbml6ZSBwbGFuIGF2YWlsYWJsZS4gUGxlYXNlIGdlbmVyYXRlIGEgcGxhbiBmaXJzdCcsXG4gICAgY2Fubm90QXBwbHlJblN0YXRlOiAnQ2Fubm90IHN0YXJ0IGFwcGx5aW5nIHdoaWxlIGpvYiBzdGF0dXMgaXMge3N0YXR1c30nLFxuICAgIGNhbm5vdFVuZG9JblN0YXRlOiAnQ2Fubm90IHN0YXJ0IHVuZG8gd2hpbGUgam9iIHN0YXR1cyBpcyB7c3RhdHVzfScsXG4gICAgYm9va21hcmtNaXNzaW5nOiAnQm9va21hcmsgbm8gbG9uZ2VyIGV4aXN0czsgc2tpcHBlZCcsXG4gICAgYm9va21hcmtHb25lRHVyaW5nQXBwbHk6ICdCb29rbWFyayB3YXMgZGVsZXRlZCB3aGlsZSBhcHBseWluZycsXG4gICAgY29uc2VydmF0aXZlRm9sZGVyR29uZTogJ1RhcmdldCBmb2xkZXIgZm9yIGNvbnNlcnZhdGl2ZSBtb2RlIG5vIGxvbmdlciBleGlzdHM7IHNraXBwZWQnLFxuICAgIGNsZWFudXBGb2xkZXJGYWlsZWQ6ICdGYWlsZWQgdG8gY2xlYW4gdXAgZW1wdHkgZm9sZGVyIOKAnHt0aXRsZX3igJ06IHttZXNzYWdlfScsXG4gICAgbm90U2Nhbm5lZEVtcHR5Rm9sZGVyOiAnSXRlbXMgdG8gZGVsZXRlIGFyZSBub3QgZW1wdHkgZm9sZGVycyBmcm9tIHRoZSBjdXJyZW50IHNjYW4uIFBsZWFzZSByZS1jaGVjaycsXG4gICAgbm90U2Nhbm5lZER1cGxpY2F0ZTogJ0l0ZW1zIHRvIGRlbGV0ZSBhcmUgbm90IGR1cGxpY2F0ZXMgZnJvbSB0aGUgY3VycmVudCBzY2FuLiBQbGVhc2UgcmUtY2hlY2snLFxuICAgIGtlZXBPbmVQZXJHcm91cDogJ0VhY2ggZHVwbGljYXRlIGdyb3VwIG11c3Qga2VlcCBhdCBsZWFzdCBvbmUgYm9va21hcmsnLFxuICAgIGZvbGRlckFscmVhZHlIYXNCb29rbWFya3M6ICdGb2xkZXIgYWxyZWFkeSBjb250YWlucyBib29rbWFya3M7IHNraXBwZWQnLFxuICAgIGRlbGV0ZUZhaWxlZDogJ0RlbGV0ZSBmYWlsZWQnLFxuICAgIHVuZG9Nb3ZlZEJ5VXNlcjogJ0Jvb2ttYXJrIHdhcyBtb3ZlZCBhZ2FpbiBieSB0aGUgdXNlcjsgc2tpcHBlZCB0byBhdm9pZCBvdmVyd3JpdGluZycsXG4gICAgdW5kb0Jvb2ttYXJrTWlzc2luZzogJ0Jvb2ttYXJrIHdhcyBkZWxldGVkIGFuZCBjYW5ub3QgYmUgcmVzdG9yZWQnLFxuICAgIHVuZG9QYXJlbnRNaXNzaW5nOiAnT3JpZ2luYWwgcGFyZW50IGZvbGRlciBubyBsb25nZXIgZXhpc3RzOyBjYW5ub3QgcmVzdG9yZScsXG4gICAgcmVzdG9yZUZhaWxlZDogJ1Jlc3RvcmUgZmFpbGVkOiB7bWVzc2FnZX0nLFxuICAgIG5vVW5kb1NuYXBzaG90OiAnTm8gdW5kbyBzbmFwc2hvdCBpcyBhdmFpbGFibGUgZm9yIHRoZSBsYXN0IG9yZ2FuaXplJyxcbiAgICB1bmRvSW50ZXJydXB0ZWQ6ICdVbmRvIHdhcyBpbnRlcnJ1cHRlZCBhcyByZXF1ZXN0ZWQ7IHlvdSBjYW4gc3RhcnQgaXQgYWdhaW4nLFxuICAgIHRlc3RQaW5nOiAnUGxlYXNlIHJlcGx5IHdpdGggb2snLFxuICAgIHdoYXRDYW5kaWRhdGVUYXhvbm9teTogJ2NhbmRpZGF0ZSBmb2xkZXIgYmF0Y2gnLFxuICAgIHdoYXRUYXhvbm9teTogJ3RoZSBmb2xkZXIgdGF4b25vbXknLFxuICAgIHdoYXRBc3NpZ25tZW50OiAndGhlIGFzc2lnbm1lbnQgYmF0Y2gnLFxuICAgIGlsbGVnYWxUcmFuc2l0aW9uOiAnSWxsZWdhbCBqb2Igc3RhdGUgdHJhbnNpdGlvbjoge2Zyb219IC0+IHt0b30nLFxuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgZW47XG4iLCJpbXBvcnQgemhDTiBmcm9tICcuL3poLUNOJztcbmltcG9ydCBlbiBmcm9tICcuL2VuJztcbmltcG9ydCB0eXBlIHsgTGFuZ3VhZ2VPcHRpb24sIExvY2FsZSwgTWVzc2FnZXMgfSBmcm9tICcuL3R5cGVzJztcblxuZXhwb3J0IHR5cGUgeyBMb2NhbGUsIE1lc3NhZ2VzLCBMYW5ndWFnZU9wdGlvbiB9IGZyb20gJy4vdHlwZXMnO1xuXG4vKiog6K+t6KiA5LiL5ouJ6aG577yb5LiO5Lia5Yqh6YC76L6R6Kej6ICm77yM5o+P6L+w5paH5qGI5omA5Zyo5paH5Lu25Y2V5LiA5p2l5rqQ44CCICovXG5leHBvcnQgY29uc3QgU1VQUE9SVEVEX0xPQ0FMRVM6IExhbmd1YWdlT3B0aW9uW10gPSBbXG4gIHsgdmFsdWU6ICd6aC1DTicsIGZsYWc6ICfwn4eo8J+HsycsIHNob3J0TGFiZWw6ICfkuK3mlocnLCBvcHRpb25MYWJlbDogJ+S4reaWhycgfSxcbiAgeyB2YWx1ZTogJ2VuJywgZmxhZzogJ/Cfh7rwn4e4Jywgc2hvcnRMYWJlbDogJ0VOJywgb3B0aW9uTGFiZWw6ICdFbmdsaXNoJyB9LFxuXTtcblxuY29uc3QgRElDVFM6IFJlY29yZDxMb2NhbGUsIE1lc3NhZ2VzPiA9IHtcbiAgJ3poLUNOJzogemhDTixcbiAgZW4sXG59O1xuXG50eXBlIFBhcmFtVmFsdWUgPSBzdHJpbmcgfCBudW1iZXI7XG5leHBvcnQgdHlwZSBUcmFuc2xhdGVQYXJhbXMgPSBSZWNvcmQ8c3RyaW5nLCBQYXJhbVZhbHVlPjtcblxuZnVuY3Rpb24gZGV0ZWN0TG9jYWxlKCk6IExvY2FsZSB7XG4gIHRyeSB7XG4gICAgY29uc3QgbGFuZyA9IGNocm9tZS5pMThuLmdldFVJTGFuZ3VhZ2UoKTtcbiAgICByZXR1cm4gbGFuZy50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ3poJykgPyAnemgtQ04nIDogJ2VuJztcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuICd6aC1DTic7XG4gIH1cbn1cblxubGV0IGN1cnJlbnRMb2NhbGU6IExvY2FsZSA9IGRldGVjdExvY2FsZSgpO1xuXG50eXBlIExvY2FsZUxpc3RlbmVyID0gKGxvY2FsZTogTG9jYWxlKSA9PiB2b2lkO1xuY29uc3QgbG9jYWxlTGlzdGVuZXJzID0gbmV3IFNldDxMb2NhbGVMaXN0ZW5lcj4oKTtcblxuZnVuY3Rpb24gbm90aWZ5TG9jYWxlQ2hhbmdlKCk6IHZvaWQge1xuICBmb3IgKGNvbnN0IGxpc3RlbmVyIG9mIGxvY2FsZUxpc3RlbmVycykge1xuICAgIGxpc3RlbmVyKGN1cnJlbnRMb2NhbGUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNldEN1cnJlbnRMb2NhbGUobG9jYWxlOiBMb2NhbGUsIHNpbGVudD86IGJvb2xlYW4pOiB2b2lkIHtcbiAgaWYgKGN1cnJlbnRMb2NhbGUgPT09IGxvY2FsZSkgcmV0dXJuO1xuICBjdXJyZW50TG9jYWxlID0gbG9jYWxlO1xuICBpZiAoIXNpbGVudCkgbm90aWZ5TG9jYWxlQ2hhbmdlKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMb2NhbGUoKTogTG9jYWxlIHtcbiAgcmV0dXJuIGN1cnJlbnRMb2NhbGU7XG59XG5cbi8qKiDorqLpmIXor63oqIDlj5jljJbvvJvov5Tlm57lj5bmtojorqLpmIXlh73mlbDjgIIgKi9cbmV4cG9ydCBmdW5jdGlvbiBvbkxvY2FsZUNoYW5nZShsaXN0ZW5lcjogTG9jYWxlTGlzdGVuZXIpOiAoKSA9PiB2b2lkIHtcbiAgbG9jYWxlTGlzdGVuZXJzLmFkZChsaXN0ZW5lcik7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgbG9jYWxlTGlzdGVuZXJzLmRlbGV0ZShsaXN0ZW5lcik7XG4gIH07XG59XG5cbmNvbnN0IExPQ0FMRV9TVE9SQUdFX0tFWSA9ICd0aWR5bWFya3MubG9jYWxlJztcblxuZnVuY3Rpb24gbm9ybWFsaXplTG9jYWxlKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBMb2NhbGUgfCB1bmRlZmluZWQge1xuICBpZiAoIXZhbHVlKSByZXR1cm4gdW5kZWZpbmVkO1xuICBjb25zdCBsb3dlciA9IHZhbHVlLnRvTG93ZXJDYXNlKCk7XG4gIGlmIChsb3dlci5zdGFydHNXaXRoKCd6aCcpKSByZXR1cm4gJ3poLUNOJztcbiAgaWYgKGxvd2VyLnN0YXJ0c1dpdGgoJ2VuJykpIHJldHVybiAnZW4nO1xuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBnZXRDaHJvbWVTdG9yYWdlKCk6IHR5cGVvZiBjaHJvbWUuc3RvcmFnZS5sb2NhbCB8IHVuZGVmaW5lZCB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHR5cGVvZiBjaHJvbWUgIT09ICd1bmRlZmluZWQnICYmIGNocm9tZS5zdG9yYWdlID8gY2hyb21lLnN0b3JhZ2UubG9jYWwgOiB1bmRlZmluZWQ7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbn1cblxuLyoqIOW8guatpeS7jiBjaHJvbWUuc3RvcmFnZSDor7vkuIDmrKHor63oqIDopobnm5bvvIzlkb3kuK3liJnliIfmjaLvvJvlj6/luYLnrYnosIPnlKjjgIIgKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBib290c3RyYXBMb2NhbGVGcm9tU3RvcmFnZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldENocm9tZVN0b3JhZ2UoKTtcbiAgaWYgKCFzdG9yYWdlKSByZXR1cm47XG4gIHRyeSB7XG4gICAgY29uc3QgdmFsdWVzID0gYXdhaXQgc3RvcmFnZS5nZXQoTE9DQUxFX1NUT1JBR0VfS0VZKTtcbiAgICBjb25zdCBzdG9yZWQgPSBub3JtYWxpemVMb2NhbGUodmFsdWVzPy5bTE9DQUxFX1NUT1JBR0VfS0VZXSBhcyBzdHJpbmcgfCB1bmRlZmluZWQpO1xuICAgIGlmIChzdG9yZWQpIHNldEN1cnJlbnRMb2NhbGUoc3RvcmVkKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLndhcm4oJ1tpMThuXSDor7vlj5bor63oqIDopobnm5blpLHotKUnLCBlcnJvcik7XG4gIH1cbn1cblxuLyoqIOawuOS5heWIh+aNouivreiogO+8muWFiOeri+WNs+eUn+aViO+8jOWGjeWGmSBjaHJvbWUuc3RvcmFnZS5sb2NhbCDmjIHkuYXljJbjgIIgKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXRMb2NhbGUobG9jYWxlOiBMb2NhbGUpOiBQcm9taXNlPHZvaWQ+IHtcbiAgc2V0Q3VycmVudExvY2FsZShsb2NhbGUpO1xuICBjb25zdCBzdG9yYWdlID0gZ2V0Q2hyb21lU3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBhd2FpdCBzdG9yYWdlLnNldCh7IFtMT0NBTEVfU1RPUkFHRV9LRVldOiBsb2NhbGUgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS53YXJuKCdbaTE4bl0g5oyB5LmF5YyW6K+t6KiA5aSx6LSlJywgZXJyb3IpO1xuICB9XG59XG5cbi8qKiDmuIXpmaTmiYvliqjor63oqIDopobnm5bvvIzlm57pgIDliLDmtY/op4jlmaggVUkg6K+t6KiA44CCICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzZXRMb2NhbGVUb1N5c3RlbSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3Qgc3RvcmFnZSA9IGdldENocm9tZVN0b3JhZ2UoKTtcbiAgaWYgKHN0b3JhZ2UpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgc3RvcmFnZS5yZW1vdmUoTE9DQUxFX1NUT1JBR0VfS0VZKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKCdbaTE4bl0g5riF6Zmk6K+t6KiA6KaG55uW5aSx6LSlJywgZXJyb3IpO1xuICAgIH1cbiAgfVxuICBzZXRDdXJyZW50TG9jYWxlKGRldGVjdExvY2FsZSgpKTtcbn1cblxuLy8g5qih5Z2X5Yqg6L295ZCO56uL5Y2z5byC5q2lIGJvb3RzdHJhcCDkuIDmrKHvvIxVSSDkvJrmuLLmn5PkuKTmrKHvvJrpppbmrKHnlKjmtY/op4jlmajor63oqIDvvIxib290c3RyYXAg5YiH5Yiw5oyB5LmF5YyW6K+t6KiA44CCXG4vLyDoi6XkuKTogIXkuIDoh7Qgc2V0Q3VycmVudExvY2FsZSDkuI3kvJrop6blj5Hnm5HlkKzlmajvvIzlm6DmraTml6DlvIDplIDjgIJcbnZvaWQgYm9vdHN0cmFwTG9jYWxlRnJvbVN0b3JhZ2UoKTtcblxuLyoqIOS7hea1i+ivleS9v+eUqO+8muWIh+aNouivreiogOW5tui/lOWbnui/mOWOn+WHveaVsOOAgiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldExvY2FsZUZvclRlc3RpbmcobG9jYWxlOiBMb2NhbGUpOiAoKSA9PiB2b2lkIHtcbiAgY29uc3QgcHJldmlvdXMgPSBjdXJyZW50TG9jYWxlO1xuICBjdXJyZW50TG9jYWxlID0gbG9jYWxlO1xuICByZXR1cm4gKCkgPT4ge1xuICAgIGN1cnJlbnRMb2NhbGUgPSBwcmV2aW91cztcbiAgfTtcbn1cblxudHlwZSBQYXRoPFQsIFByZWZpeCBleHRlbmRzIHN0cmluZyA9ICcnPiA9IHtcbiAgW0sgaW4ga2V5b2YgVCAmIHN0cmluZ106IFRbS10gZXh0ZW5kcyBzdHJpbmdcbiAgICA/IGAke1ByZWZpeH0ke0t9YFxuICAgIDogUGF0aDxUW0tdLCBgJHtQcmVmaXh9JHtLfS5gPjtcbn1ba2V5b2YgVCAmIHN0cmluZ107XG5cbmV4cG9ydCB0eXBlIE1lc3NhZ2VLZXkgPSBQYXRoPE1lc3NhZ2VzPjtcblxuZnVuY3Rpb24gaW50ZXJwb2xhdGUodGVtcGxhdGU6IHN0cmluZywgcGFyYW1zPzogVHJhbnNsYXRlUGFyYW1zKTogc3RyaW5nIHtcbiAgaWYgKCFwYXJhbXMpIHJldHVybiB0ZW1wbGF0ZTtcbiAgcmV0dXJuIHRlbXBsYXRlLnJlcGxhY2UoL1xceyhcXHcrKVxcfS9nLCAobWF0Y2gsIGtleTogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBwYXJhbXNba2V5XTtcbiAgICByZXR1cm4gdmFsdWUgPT09IHVuZGVmaW5lZCA/IG1hdGNoIDogU3RyaW5nKHZhbHVlKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGxvb2t1cChkaWN0OiBNZXNzYWdlcywga2V5OiBNZXNzYWdlS2V5KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgbGV0IG5vZGU6IHVua25vd24gPSBkaWN0O1xuICBmb3IgKGNvbnN0IHBhcnQgb2Yga2V5LnNwbGl0KCcuJykpIHtcbiAgICBpZiAobm9kZSA9PT0gbnVsbCB8fCB0eXBlb2Ygbm9kZSAhPT0gJ29iamVjdCcpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgbm9kZSA9IChub2RlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwYXJ0XTtcbiAgfVxuICByZXR1cm4gdHlwZW9mIG5vZGUgPT09ICdzdHJpbmcnID8gbm9kZSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiDmjInlvZPliY3or63oqIDlj5bmlofmoYjvvIzmlK/mjIEge25hbWV9IOWNoOS9jeespuOAglxuICog57y65aSx6ZSu5pe25Zue6YCA566A5L2T5Lit5paH5bm25ZGK6K2m77yM6YG/5YWN55WM6Z2i5Ye6546w56m655m944CCXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0KGtleTogTWVzc2FnZUtleSwgcGFyYW1zPzogVHJhbnNsYXRlUGFyYW1zKTogc3RyaW5nIHtcbiAgY29uc3QgaGl0ID0gbG9va3VwKERJQ1RTW2N1cnJlbnRMb2NhbGVdLCBrZXkpO1xuICBpZiAoaGl0ICE9PSB1bmRlZmluZWQpIHJldHVybiBpbnRlcnBvbGF0ZShoaXQsIHBhcmFtcyk7XG4gIGNvbnN0IGZhbGxiYWNrID0gbG9va3VwKERJQ1RTWyd6aC1DTiddLCBrZXkpO1xuICBpZiAoZmFsbGJhY2sgIT09IHVuZGVmaW5lZCkge1xuICAgIGNvbnNvbGUud2FybihgW2kxOG5dIG1pc3Npbmcga2V5IFwiJHtrZXl9XCIgZm9yIGxvY2FsZSBcIiR7Y3VycmVudExvY2FsZX1cIiwgZmFsbGJhY2sgdG8gemgtQ05gKTtcbiAgICByZXR1cm4gaW50ZXJwb2xhdGUoZmFsbGJhY2ssIHBhcmFtcyk7XG4gIH1cbiAgY29uc29sZS53YXJuKGBbaTE4bl0gbWlzc2luZyBrZXkgXCIke2tleX1cImApO1xuICByZXR1cm4ga2V5O1xufVxuIiwiaW1wb3J0IHsgdCB9IGZyb20gJy4uLy4uL3NoYXJlZC9pMThuJztcbmltcG9ydCB0eXBlIHsgSm9iU3RhdHVzIH0gZnJvbSAnLi4vLi4vc2hhcmVkL3NjaGVtYXMnO1xuXG4vKipcbiAqIOS7u+WKoeeKtuaAgeacuu+8iOaetuaehOaWueahiOesrCA1IOiKgu+8ieOAglxuICogZmFpbGVkIOS5i+WQjuWFgeiuuOmHjeaWsOW8gOWni+aJq+aPj++8jOS5n+WFgeiuuOS7juaMgeS5heWMlua4uOagh+mHjeivleWksei0peeahOW6lOeUqO+8iE1WUCDmiafooYznu5PmnpzpobXnmoTigJzph43or5XigJ3lhaXlj6PvvInvvJtcbiAqIHVuZG9uZS9wYXJ0aWFsbHlfdW5kb25lIOS4uue7iOaAgeaIluWFgeiuuOmHjeivleaSpOmUgOOAglxuICovXG5jb25zdCBUUkFOU0lUSU9OUzogUmVhZG9ubHk8UmVjb3JkPEpvYlN0YXR1cywgcmVhZG9ubHkgSm9iU3RhdHVzW10+PiA9IHtcbiAgaWRsZTogWydzY2FubmluZyddLFxuICBzY2FubmluZzogWydwbGFubmluZycsICdmYWlsZWQnXSxcbiAgcGxhbm5pbmc6IFsnY2xhc3NpZnlpbmcnLCAnZmFpbGVkJ10sXG4gIGNsYXNzaWZ5aW5nOiBbJ3Jldmlld2luZycsICdmYWlsZWQnXSxcbiAgcmV2aWV3aW5nOiBbJ2FwcGx5aW5nJywgJ3NjYW5uaW5nJ10sXG4gIGFwcGx5aW5nOiBbJ2NvbXBsZXRlZCcsICdpbnRlcnJ1cHRlZCcsICdmYWlsZWQnXSxcbiAgaW50ZXJydXB0ZWQ6IFsnYXBwbHlpbmcnLCAndW5kb2luZyddLFxuICBjb21wbGV0ZWQ6IFsndW5kb2luZyddLFxuICB1bmRvaW5nOiBbJ3VuZG9uZScsICdwYXJ0aWFsbHlfdW5kb25lJywgJ2ZhaWxlZCddLFxuICB1bmRvbmU6IFsnc2Nhbm5pbmcnXSxcbiAgcGFydGlhbGx5X3VuZG9uZTogWyd1bmRvaW5nJywgJ3NjYW5uaW5nJ10sXG4gIGZhaWxlZDogWydzY2FubmluZycsICdhcHBseWluZyddLFxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNhblRyYW5zaXRpb24oZnJvbTogSm9iU3RhdHVzLCB0bzogSm9iU3RhdHVzKTogYm9vbGVhbiB7XG4gIHJldHVybiBUUkFOU0lUSU9OU1tmcm9tXS5pbmNsdWRlcyh0byk7XG59XG5cbmV4cG9ydCBjbGFzcyBJbGxlZ2FsVHJhbnNpdGlvbkVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihcbiAgICByZWFkb25seSBmcm9tOiBKb2JTdGF0dXMsXG4gICAgcmVhZG9ubHkgdG86IEpvYlN0YXR1cyxcbiAgKSB7XG4gICAgc3VwZXIodCgnZXJyb3JzLmlsbGVnYWxUcmFuc2l0aW9uJywgeyBmcm9tLCB0byB9KSk7XG4gICAgdGhpcy5uYW1lID0gJ0lsbGVnYWxUcmFuc2l0aW9uRXJyb3InO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnRUcmFuc2l0aW9uKGZyb206IEpvYlN0YXR1cywgdG86IEpvYlN0YXR1cyk6IHZvaWQge1xuICBpZiAoIWNhblRyYW5zaXRpb24oZnJvbSwgdG8pKSB7XG4gICAgdGhyb3cgbmV3IElsbGVnYWxUcmFuc2l0aW9uRXJyb3IoZnJvbSwgdG8pO1xuICB9XG59XG5cbi8qKiDlkIzkuIDml7bpl7Tlj6rlhYHorrjkuIDkuKrkvJrkv67mlLnkuabnrb7nmoTku7vliqHvvJrov5nkuKTkuKrnirbmgIHmnJ/pl7Tmi5Lnu53mlrDnmoTlupTnlKjor7fmsYLjgIIgKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1dyaXRlTG9ja2VkKHN0YXR1czogSm9iU3RhdHVzKTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGF0dXMgPT09ICdhcHBseWluZycgfHwgc3RhdHVzID09PSAndW5kb2luZyc7XG59XG4iLCJpbXBvcnQgdHlwZSB7IEJvb2ttYXJrc1BvcnQsIEV2ZW50c1BvcnQsIFN0b3JhZ2VQb3J0IH0gZnJvbSAnLi9wb3J0cyc7XG5pbXBvcnQgeyBidWlsZFNjYW5SZXN1bHQgfSBmcm9tICcuLi9kb21haW4vYm9va21hcmtzL3RyZWUnO1xuaW1wb3J0IHsgYXNzZXJ0VHJhbnNpdGlvbiB9IGZyb20gJy4uL2RvbWFpbi9vcmdhbml6ZS9zdGF0ZU1hY2hpbmUnO1xuaW1wb3J0IHR5cGUgeyBKb2JTdGF0ZSwgU2NhblJlc3VsdCB9IGZyb20gJy4uL3NoYXJlZC9zY2hlbWFzJztcblxuZXhwb3J0IGludGVyZmFjZSBTY2FuRGVwcyB7XG4gIGJvb2ttYXJrczogQm9va21hcmtzUG9ydDtcbiAgc3RvcmFnZTogU3RvcmFnZVBvcnQ7XG4gIGV2ZW50cz86IEV2ZW50c1BvcnQ7XG4gIG5vdz86ICgpID0+IG51bWJlcjtcbiAgbmV3SWQ/OiAoKSA9PiBzdHJpbmc7XG59XG5cbi8qKlxuICog5omr5o+P5pW05qO15Lmm562+5qCR5bm25oyB5LmF5YyW5LiA5qyh5LiA6Ie055qE57uT5p6c44CCXG4gKiDnlLEgU2VydmljZSBXb3JrZXIg6LCD55So77ybRGFzaGJvYXJkIOmAmui/h+a2iOaBr+inpuWPkeOAglxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2NhbkJvb2ttYXJrcyhkZXBzOiBTY2FuRGVwcywgam9iOiBKb2JTdGF0ZSk6IFByb21pc2U8U2NhblJlc3VsdD4ge1xuICBjb25zdCB7IHN0b3JhZ2UsIGJvb2ttYXJrcywgZXZlbnRzIH0gPSBkZXBzO1xuICBjb25zdCBub3cgPSBkZXBzLm5vdyA/PyAoKCkgPT4gRGF0ZS5ub3coKSk7XG4gIGNvbnN0IG5ld0lkID0gZGVwcy5uZXdJZCA/PyAoKCkgPT4gY3J5cHRvLnJhbmRvbVVVSUQoKSk7XG5cbiAgYXNzZXJ0VHJhbnNpdGlvbihqb2Iuc3RhdHVzLCAnc2Nhbm5pbmcnKTtcbiAgY29uc3Qgd29ya2luZzogSm9iU3RhdGUgPSB7IC4uLmpvYiwgc3RhdHVzOiAnc2Nhbm5pbmcnLCB1cGRhdGVkQXQ6IG5vdygpIH07XG4gIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYih3b3JraW5nKTtcblxuICBjb25zdCB0cmVlID0gYXdhaXQgYm9va21hcmtzLmdldFRyZWUoKTtcbiAgY29uc3Qgc2NhbiA9IGJ1aWxkU2NhblJlc3VsdCh0cmVlLCBuZXdJZCgpLCBub3coKSk7XG4gIGF3YWl0IHN0b3JhZ2Uuc2F2ZVNjYW4oc2Nhbik7XG5cbiAgY29uc3QgZG9uZTogSm9iU3RhdGUgPSB7IC4uLndvcmtpbmcsIHN0YXR1czogJ3BsYW5uaW5nJywgdXBkYXRlZEF0OiBub3coKSB9O1xuICBhd2FpdCBzdG9yYWdlLnNhdmVKb2IoZG9uZSk7XG4gIGV2ZW50cz8ucHJvZ3Jlc3MoZG9uZS5qb2JJZCwgZG9uZS5zdGF0dXMsIHNjYW4uYm9va21hcmtzLmxlbmd0aCwgc2Nhbi5ib29rbWFya3MubGVuZ3RoKTtcbiAgcmV0dXJuIHNjYW47XG59XG4iLCJpbXBvcnQgeyB0LCB0eXBlIE1lc3NhZ2VLZXksIHR5cGUgVHJhbnNsYXRlUGFyYW1zIH0gZnJvbSAnLi9pMThuJztcblxuLyoqXG4gKiDlj6/lsZXnpLrnmoTplJnor6/liIbnsbvjgIJcbiAqIOazqOaEj++8mmVycm9yS2luZCDmnprkuL7lv4XpobvkuI4gZG9jcy/mioDmnK/mnrbmnoTmlrnmoYgg56ysIDUg6IqC55qE5aSx6LSl6aG56K+t5LmJ5L+d5oyB5LiA6Ie077yMXG4gKiDkuJTku7vkvZXliIbmlK/pg73kuI3lvpfmkLrluKYgQVBJIEtleSDnrYnmlY/mhJ/kv6Hmga/jgIJcbiAqL1xuZXhwb3J0IGNvbnN0IEVSUk9SX0tJTkRTID0gW1xuICAnbm90X2NvbmZpZ3VyZWQnLFxuICAnbmV0d29yaycsXG4gICdyYXRlX2xpbWl0ZWQnLFxuICAnaW52YWxpZF9yZXNwb25zZScsXG4gICd2YWxpZGF0aW9uJyxcbiAgJ3Blcm1pc3Npb24nLFxuICAnc3RvcmFnZV9xdW90YScsXG4gICd1c2VyX2NvbmZsaWN0JyxcbiAgJ2Fib3J0ZWQnLFxuICAndW5rbm93bicsXG5dIGFzIGNvbnN0O1xuXG5leHBvcnQgdHlwZSBFcnJvcktpbmQgPSAodHlwZW9mIEVSUk9SX0tJTkRTKVtudW1iZXJdO1xuXG5leHBvcnQgaW50ZXJmYWNlIENsYXNzaWZpZWRFcnJvciB7XG4gIGtpbmQ6IEVycm9yS2luZDtcbiAgbWVzc2FnZTogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQXBwRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIHJlYWRvbmx5IGtpbmQ6IEVycm9yS2luZDtcbiAgcmVhZG9ubHkgaTE4bktleTogTWVzc2FnZUtleTtcbiAgcmVhZG9ubHkgcGFyYW1zPzogVHJhbnNsYXRlUGFyYW1zO1xuXG4gIGNvbnN0cnVjdG9yKGtpbmQ6IEVycm9yS2luZCwgaTE4bktleTogTWVzc2FnZUtleSwgcGFyYW1zPzogVHJhbnNsYXRlUGFyYW1zKSB7XG4gICAgc3VwZXIodChpMThuS2V5LCBwYXJhbXMpKTtcbiAgICB0aGlzLm5hbWUgPSAnQXBwRXJyb3InO1xuICAgIHRoaXMua2luZCA9IGtpbmQ7XG4gICAgdGhpcy5pMThuS2V5ID0gaTE4bktleTtcbiAgICB0aGlzLnBhcmFtcyA9IHBhcmFtcztcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBcHBFcnJvcihlcnJvcjogdW5rbm93bik6IGVycm9yIGlzIEFwcEVycm9yIHtcbiAgcmV0dXJuIGVycm9yIGluc3RhbmNlb2YgQXBwRXJyb3I7XG59XG5cbi8qKiDlsIbku7vmhI/lvILluLjlvZLkuIDljJbkuLrlj6/lsZXnpLrplJnor6/vvIzpgb/lhY3lkJHkuIrlsYLmipvlh7rljp/lp4vlr7nosaHjgIIgKi9cbmV4cG9ydCBmdW5jdGlvbiBjbGFzc2lmeUVycm9yKGVycm9yOiB1bmtub3duKTogQ2xhc3NpZmllZEVycm9yIHtcbiAgaWYgKGlzQXBwRXJyb3IoZXJyb3IpKSB7XG4gICAgcmV0dXJuIHsga2luZDogZXJyb3Iua2luZCwgbWVzc2FnZTogZXJyb3IubWVzc2FnZSB9O1xuICB9XG4gIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgcmV0dXJuIHsga2luZDogJ3Vua25vd24nLCBtZXNzYWdlOiBlcnJvci5tZXNzYWdlIH07XG4gIH1cbiAgcmV0dXJuIHsga2luZDogJ3Vua25vd24nLCBtZXNzYWdlOiBTdHJpbmcoZXJyb3IpIH07XG59XG4iLCJpbXBvcnQgdHlwZSB7IEJvb2ttYXJrc1BvcnQsIEV2ZW50c1BvcnQsIFN0b3JhZ2VQb3J0IH0gZnJvbSAnLi9wb3J0cyc7XG5pbXBvcnQgeyBhc3NlcnRUcmFuc2l0aW9uLCBpc1dyaXRlTG9ja2VkIH0gZnJvbSAnLi4vZG9tYWluL29yZ2FuaXplL3N0YXRlTWFjaGluZSc7XG5pbXBvcnQgeyBpc1VubW9kaWZpYWJsZSwgdHlwZSBCb29rbWFya05vZGUgfSBmcm9tICcuLi9kb21haW4vYm9va21hcmtzL3R5cGVzJztcbmltcG9ydCB7IEFwcEVycm9yLCBjbGFzc2lmeUVycm9yIH0gZnJvbSAnLi4vc2hhcmVkL2Vycm9ycyc7XG5pbXBvcnQgeyB0IH0gZnJvbSAnLi4vc2hhcmVkL2kxOG4nO1xuaW1wb3J0IHR5cGUge1xuICBBc3NpZ25tZW50LFxuICBEZWxldGVkRm9sZGVyLFxuICBGYWlsdXJlSXRlbSxcbiAgSm9iU3RhdGUsXG4gIFNjYW5uZWRCb29rbWFyayxcbiAgVW5kb01vdmUsXG4gIFVuZG9TbmFwc2hvdCxcbn0gZnJvbSAnLi4vc2hhcmVkL3NjaGVtYXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEFwcGx5RGVwcyB7XG4gIGJvb2ttYXJrczogQm9va21hcmtzUG9ydDtcbiAgc3RvcmFnZTogU3RvcmFnZVBvcnQ7XG4gIGV2ZW50cz86IEV2ZW50c1BvcnQ7XG4gIG5vdz86ICgpID0+IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcHBseVJlc3VsdCB7XG4gIGpvYjogSm9iU3RhdGU7XG4gIGFwcGxpZWRJZHM6IHN0cmluZ1tdO1xuICBmYWlsdXJlczogRmFpbHVyZUl0ZW1bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcHBseVBsYW5PcHRpb25zIHtcbiAgLyoqIOS/neWuiOaooeW8j+WFs+mXreebruW9leWIm+W7uu+8m+ebruagh+ebruW9leW3suS4jeWtmOWcqOaXtuWPqui3s+i/h+WvueW6lOS5puetvuOAgiAqL1xuICBjcmVhdGVNaXNzaW5nRm9sZGVycz86IGJvb2xlYW47XG4gIC8qKiDlj6rmnInov5nkupvljp/mlofku7blpLnlhYHorrjlnKjlj5jnqbrlkI7ooqvmuIXnkIbjgIIgKi9cbiAgY2xlYW51cEZvbGRlcklkcz86IHN0cmluZ1tdO1xufVxuXG5pbnRlcmZhY2UgUmVzb2x2ZWRUYXJnZXQge1xuICByb290SWQ6IHN0cmluZztcbiAgLyoqIOebruagh+WPtuWtkOebruW9lSBJROOAgiAqL1xuICBmb2xkZXJJZDogc3RyaW5nO1xufVxuXG4vKipcbiAqIOS4gOmUruW6lOeUqO+8iOaetuaehOaWueahiOesrCA4IOiKgu+8ieOAglNlcnZpY2UgV29ya2VyIOaYr+WUr+S4gOiwg+eUqOWFpeWPo+OAglxuICpcbiAqIOmhuuW6j++8mlxuICogMS4g5bu656uL5Lu75Yqh6ZSB77yIYXBwbHlpbmfvvInvvJtcbiAqIDIuIOWfuuS6juacgOaWsOS5puetvueKtuaAgeaehOW7uuaSpOmUgOW/q+eFp++8iOavj+adoeW+heenu+WKqOS5puetvueahCBpZCAvIHBhcmVudElkIC8gaW5kZXjvvInvvJtcbiAqIDMuIOaMiei3r+W+hOmAkOe6p+ino+aekOaIluWIm+W7uuebruW9le+8iOaMiSBwYXJlbnRJZCArIHRpdGxlIOafpeaJvuS/neivgeW5guetie+8ie+8m1xuICogNC4g6aG65bqPIG1vdmXvvIzmr4/mnaHmiJDlip/ljbPmm7TmlrDmuLjmoIfkuI4gYXBwbGllZElkc++8m+WNleadoeWksei0peWFpeWIl+e7p+e7re+8m1xuICogNS4g5LuO5rex5Yiw5rWF5riF55CG55So5oi36YCJ5Lit6IyD5Zu05YaF55qE56m655uu5b2V77ybXG4gKiA2LiDlrozmiJDnva4gY29tcGxldGVkIOW5tuWxleekuuWksei0peS4jumHjeivleWFpeWPo+OAglxuICpcbiAqIOS4reaWreaBouWkje+8muWQjOS4gCBqb2JJZCDph43lpI3ov5vlhaXml7bot7Pov4flt7IgYXBwbGllZCDnmoTkuabnrb7vvIzku47mjIHkuYXljJbmuLjmoIfnu6fnu63jgIJcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFwcGx5UGxhbihcbiAgZGVwczogQXBwbHlEZXBzLFxuICBqb2I6IEpvYlN0YXRlLFxuICBib29rbWFya3M6IFNjYW5uZWRCb29rbWFya1tdLFxuICBhc3NpZ25tZW50czogQXNzaWdubWVudFtdLFxuICBvcHRpb25zOiBBcHBseVBsYW5PcHRpb25zID0ge30sXG4pOiBQcm9taXNlPEFwcGx5UmVzdWx0PiB7XG4gIGNvbnN0IHsgc3RvcmFnZSwgZXZlbnRzIH0gPSBkZXBzO1xuICBjb25zdCBub3cgPSBkZXBzLm5vdyA/PyAoKCkgPT4gRGF0ZS5ub3coKSk7XG4gIGNvbnN0IGNyZWF0ZU1pc3NpbmdGb2xkZXJzID0gb3B0aW9ucy5jcmVhdGVNaXNzaW5nRm9sZGVycyA/PyB0cnVlO1xuICBjb25zdCBjbGVhbnVwRm9sZGVySWRzID0gbmV3IFNldChvcHRpb25zLmNsZWFudXBGb2xkZXJJZHMgPz8gW10pO1xuXG4gIGlmIChpc1dyaXRlTG9ja2VkKGpvYi5zdGF0dXMpICYmIGpvYi5zdGF0dXMgIT09ICdhcHBseWluZycpIHtcbiAgICAvLyB1bmRvaW5nIOacn+mXtOaLkue7neaWsOeahOW6lOeUqOivt+axguOAglxuICAgIHRocm93IG5ldyBBcHBFcnJvcigndXNlcl9jb25mbGljdCcsICdlcnJvcnMuY2Fubm90QXBwbHlJblN0YXRlJywgeyBzdGF0dXM6IGpvYi5zdGF0dXMgfSk7XG4gIH1cbiAgaWYgKGpvYi5zdGF0dXMgIT09ICdhcHBseWluZycpIHtcbiAgICBhc3NlcnRUcmFuc2l0aW9uKGpvYi5zdGF0dXMsICdhcHBseWluZycpO1xuICB9XG5cbiAgY29uc3QgYnlJZCA9IG5ldyBNYXAoYm9va21hcmtzLm1hcCgoYikgPT4gW2IuaWQsIGJdIGFzIGNvbnN0KSk7XG4gIGNvbnN0IG9yZGVyZWQ6IEFycmF5PHsgYm9va21hcms6IFNjYW5uZWRCb29rbWFyazsgYXNzaWdubWVudDogQXNzaWdubWVudCB9PiA9IFtdO1xuICBmb3IgKGNvbnN0IGFzc2lnbm1lbnQgb2YgYXNzaWdubWVudHMpIHtcbiAgICBjb25zdCBib29rbWFyayA9IGJ5SWQuZ2V0KGFzc2lnbm1lbnQuYm9va21hcmtJZCk7XG4gICAgaWYgKGJvb2ttYXJrKSBvcmRlcmVkLnB1c2goeyBib29rbWFyaywgYXNzaWdubWVudCB9KTtcbiAgfVxuXG4gIGxldCB3b3JraW5nOiBKb2JTdGF0ZSA9IHtcbiAgICAuLi5qb2IsXG4gICAgc3RhdHVzOiAnYXBwbHlpbmcnLFxuICAgIHVwZGF0ZWRBdDogbm93KCksXG4gICAgZmFpbHVyZXM6IGpvYi5zdGF0dXMgPT09ICdhcHBseWluZycgPyBqb2IuZmFpbHVyZXMgOiBbXSxcbiAgfTtcbiAgYXdhaXQgc3RvcmFnZS5zYXZlSm9iKHdvcmtpbmcpO1xuXG4gIC8vIC0tLS0gMS4g5bqU55So5YmN6YeN5paw6K+75Y+W55u45YWz5Lmm562+77yM5LiN6IO95L+h5Lu75omr5o+P6Zi25q6155qE5pen5L2N572uIC0tLS1cbiAgY29uc3QgZnJlc2ggPSBuZXcgTWFwPHN0cmluZywgeyBwYXJlbnRJZDogc3RyaW5nOyBpbmRleDogbnVtYmVyIH0+KCk7XG4gIGNvbnN0IG1pc3NpbmcgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCB7IGJvb2ttYXJrIH0gb2Ygb3JkZXJlZCkge1xuICAgIGlmICh3b3JraW5nLmFwcGxpZWRJZHMuaW5jbHVkZXMoYm9va21hcmsuaWQpKSBjb250aW51ZTtcbiAgICBjb25zdCBub2RlID0gYXdhaXQgZGVwcy5ib29rbWFya3MuZ2V0KGJvb2ttYXJrLmlkKTtcbiAgICBpZiAoIW5vZGUgfHwgbm9kZS51cmwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgbWlzc2luZy5hZGQoYm9va21hcmsuaWQpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGZyZXNoLnNldChib29rbWFyay5pZCwgeyBwYXJlbnRJZDogbm9kZS5wYXJlbnRJZCA/PyAnJywgaW5kZXg6IG5vZGUuaW5kZXggPz8gMCB9KTtcbiAgfVxuXG4gIGNvbnN0IGV4aXN0aW5nRmFpbHVyZXM6IEZhaWx1cmVJdGVtW10gPSB3b3JraW5nLmZhaWx1cmVzLmZpbHRlcigoZikgPT4gZi5ib29rbWFya0lkID09PSB1bmRlZmluZWQpO1xuICBmb3IgKGNvbnN0IGlkIG9mIG1pc3NpbmcpIHtcbiAgICBleGlzdGluZ0ZhaWx1cmVzLnB1c2goeyBib29rbWFya0lkOiBpZCwga2luZDogJ3ZhbGlkYXRpb24nLCBtZXNzYWdlOiB0KCdlcnJvcnMuYm9va21hcmtNaXNzaW5nJykgfSk7XG4gIH1cbiAgd29ya2luZyA9IHsgLi4ud29ya2luZywgZmFpbHVyZXM6IGV4aXN0aW5nRmFpbHVyZXMgfTtcblxuICAvLyAtLS0tIDIuIOW7uueri+aSpOmUgOW/q+eFp++8iOS7heWMheWQq+WwmuacquW6lOeUqOeahOenu+WKqO+8m+W3suW6lOeUqOmDqOWIhuS/neeVmeWcqCB1bmRvOmxhdGVzdCDkuK3vvIkgLS0tLVxuICBjb25zdCB1bmRvRXhpc3RpbmcgPSBhd2FpdCBzdG9yYWdlLmxvYWRVbmRvKCk7XG4gIGNvbnN0IG1vdmVzOiBVbmRvTW92ZVtdID1cbiAgICB1bmRvRXhpc3RpbmcgJiYgdW5kb0V4aXN0aW5nLmpvYklkID09PSBqb2Iuam9iSWQgPyBbLi4udW5kb0V4aXN0aW5nLm1vdmVzXSA6IFtdO1xuICBjb25zdCBrbm93bk1vdmVJZHMgPSBuZXcgU2V0KG1vdmVzLm1hcCgobSkgPT4gbS5ib29rbWFya0lkKSk7XG4gIGZvciAoY29uc3QgeyBib29rbWFyayB9IG9mIG9yZGVyZWQpIHtcbiAgICBpZiAod29ya2luZy5hcHBsaWVkSWRzLmluY2x1ZGVzKGJvb2ttYXJrLmlkKSkgY29udGludWU7XG4gICAgaWYgKGtub3duTW92ZUlkcy5oYXMoYm9va21hcmsuaWQpKSBjb250aW51ZTtcbiAgICBjb25zdCBwb3MgPSBmcmVzaC5nZXQoYm9va21hcmsuaWQpO1xuICAgIGlmICghcG9zKSBjb250aW51ZTtcbiAgICBtb3Zlcy5wdXNoKHtcbiAgICAgIGJvb2ttYXJrSWQ6IGJvb2ttYXJrLmlkLFxuICAgICAgZnJvbVBhcmVudElkOiBwb3MucGFyZW50SWQsXG4gICAgICBmcm9tSW5kZXg6IHBvcy5pbmRleCxcbiAgICAgIHRvRm9sZGVySWQ6ICcnLCAvLyDop6PmnpDnm67moIfnm67lvZXlkI7lm57loatcbiAgICB9KTtcbiAgfVxuXG4gIC8vIC0tLS0gMy4g6Kej5p6Q5oiW5Yib5bu655uu5qCH55uu5b2VIC0tLS1cbiAgLy8g5oOw5oCn5oyJ6ZyA6K+75Y+W55uu5b2V57uT5p6E77yaZ2V0Q2hpbGRyZW4ocGFyZW50SWQpICsg57yT5a2Y77yM6YG/5YWN5q+P5qyh5YWo5qCR5omr5o+P44CCXG4gIGNvbnN0IGNoaWxkcmVuQnlQYXJlbnQgPSBuZXcgTWFwPHN0cmluZywgQm9va21hcmtOb2RlW10+KCk7XG5cbiAgY29uc3QgY3JlYXRlZEZvbGRlcnMgPVxuICAgIHVuZG9FeGlzdGluZyAmJiB1bmRvRXhpc3Rpbmcuam9iSWQgPT09IGpvYi5qb2JJZCA/IFsuLi51bmRvRXhpc3RpbmcuY3JlYXRlZEZvbGRlcnNdIDogW107XG4gIGNvbnN0IGNyZWF0ZWRJZHMgPSBuZXcgU2V0KGNyZWF0ZWRGb2xkZXJzLm1hcCgoZikgPT4gZi5pZCkpO1xuICBjb25zdCBmb2xkZXJDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7IC8vIGAke3Jvb3RJZH18JHtwYXRoLmpvaW4oJy8nKX1gIC0+IGZvbGRlcklkXG5cbiAgY29uc3QgcmVzb2x2ZUZvbGRlciA9IGFzeW5jIChyb290SWQ6IHN0cmluZywgcGF0aDogc3RyaW5nW10pOiBQcm9taXNlPFJlc29sdmVkVGFyZ2V0IHwgbnVsbD4gPT4ge1xuICAgIGNvbnN0IGtleSA9IGAke3Jvb3RJZH18JHtwYXRoLm1hcCgocykgPT4gcy50b0xvd2VyQ2FzZSgpKS5qb2luKCcgJyl9YDtcbiAgICBjb25zdCBjYWNoZWQgPSBmb2xkZXJDYWNoZS5nZXQoa2V5KTtcbiAgICBpZiAoY2FjaGVkKSByZXR1cm4geyByb290SWQsIGZvbGRlcklkOiBjYWNoZWQgfTtcblxuICAgIGxldCBwYXJlbnRJZCA9IHJvb3RJZDtcbiAgICBsZXQgZGVwdGggPSAwO1xuICAgIGZvciAoY29uc3Qgc2VnbWVudCBvZiBwYXRoKSB7XG4gICAgICBkZXB0aCArPSAxO1xuICAgICAgY29uc3QgY2hpbGRyZW4gPSBjaGlsZHJlbkJ5UGFyZW50LmdldChwYXJlbnRJZCkgPz8gKGF3YWl0IGRlcHMuYm9va21hcmtzLmdldENoaWxkcmVuKHBhcmVudElkKSk7XG4gICAgICBjaGlsZHJlbkJ5UGFyZW50LnNldChwYXJlbnRJZCwgY2hpbGRyZW4pO1xuICAgICAgY29uc3QgaGl0ID0gY2hpbGRyZW4uZmluZChcbiAgICAgICAgKGMpID0+IGMudXJsID09PSB1bmRlZmluZWQgJiYgYy50aXRsZS50b0xvd2VyQ2FzZSgpID09PSBzZWdtZW50LnRvTG93ZXJDYXNlKCksXG4gICAgICApO1xuICAgICAgaWYgKGhpdCkge1xuICAgICAgICBwYXJlbnRJZCA9IGhpdC5pZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICghY3JlYXRlTWlzc2luZ0ZvbGRlcnMpIHJldHVybiBudWxsO1xuICAgICAgICBjb25zdCBjcmVhdGVkID0gYXdhaXQgZGVwcy5ib29rbWFya3MuY3JlYXRlRm9sZGVyKHBhcmVudElkLCBzZWdtZW50KTtcbiAgICAgICAgY29uc3Qgbm9kZTogQm9va21hcmtOb2RlID0geyBpZDogY3JlYXRlZC5pZCwgcGFyZW50SWQsIHRpdGxlOiBzZWdtZW50IH07XG4gICAgICAgIGNoaWxkcmVuQnlQYXJlbnQuc2V0KGNyZWF0ZWQuaWQsIFtdKTtcbiAgICAgICAgY29uc3Qgc2libGluZ3MgPSBjaGlsZHJlbkJ5UGFyZW50LmdldChwYXJlbnRJZCkgPz8gW107XG4gICAgICAgIHNpYmxpbmdzLnB1c2gobm9kZSk7XG4gICAgICAgIGNoaWxkcmVuQnlQYXJlbnQuc2V0KHBhcmVudElkLCBzaWJsaW5ncyk7XG4gICAgICAgIGlmICghY3JlYXRlZElkcy5oYXMoY3JlYXRlZC5pZCkpIHtcbiAgICAgICAgICBjcmVhdGVkSWRzLmFkZChjcmVhdGVkLmlkKTtcbiAgICAgICAgICBjcmVhdGVkRm9sZGVycy5wdXNoKHsgaWQ6IGNyZWF0ZWQuaWQsIGRlcHRoIH0pO1xuICAgICAgICB9XG4gICAgICAgIHBhcmVudElkID0gY3JlYXRlZC5pZDtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9sZGVyQ2FjaGUuc2V0KGtleSwgcGFyZW50SWQpO1xuICAgIHJldHVybiB7IHJvb3RJZCwgZm9sZGVySWQ6IHBhcmVudElkIH07XG4gIH07XG5cbiAgY29uc3QgcmVzb2x2ZWRUYXJnZXRzID0gbmV3IE1hcDxzdHJpbmcsIFJlc29sdmVkVGFyZ2V0PigpO1xuICBjb25zdCByZXNvbHV0aW9uRmFpbHVyZXM6IEZhaWx1cmVJdGVtW10gPSBbXTtcbiAgZm9yIChjb25zdCB7IGJvb2ttYXJrLCBhc3NpZ25tZW50IH0gb2Ygb3JkZXJlZCkge1xuICAgIGlmICh3b3JraW5nLmFwcGxpZWRJZHMuaW5jbHVkZXMoYm9va21hcmsuaWQpIHx8IG1pc3NpbmcuaGFzKGJvb2ttYXJrLmlkKSkgY29udGludWU7XG4gICAgY29uc3QgdGFyZ2V0ID0gYXdhaXQgcmVzb2x2ZUZvbGRlcihib29rbWFyay5yb290SWQsIGFzc2lnbm1lbnQudGFyZ2V0UGF0aCk7XG4gICAgaWYgKCF0YXJnZXQpIHtcbiAgICAgIHJlc29sdXRpb25GYWlsdXJlcy5wdXNoKHtcbiAgICAgICAgYm9va21hcmtJZDogYm9va21hcmsuaWQsXG4gICAgICAgIGtpbmQ6ICd2YWxpZGF0aW9uJyxcbiAgICAgICAgbWVzc2FnZTogdCgnZXJyb3JzLmNvbnNlcnZhdGl2ZUZvbGRlckdvbmUnKSxcbiAgICAgIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHJlc29sdmVkVGFyZ2V0cy5zZXQoYm9va21hcmsuaWQsIHRhcmdldCk7XG4gICAgY29uc3QgbW92ZSA9IG1vdmVzLmZpbmQoKG0pID0+IG0uYm9va21hcmtJZCA9PT0gYm9va21hcmsuaWQpO1xuICAgIGlmIChtb3ZlKSBtb3ZlLnRvRm9sZGVySWQgPSB0YXJnZXQuZm9sZGVySWQ7XG4gICAgLy8g5paw5bu655uu5b2V5Y2z5pe25oyB5LmF5YyW77yM5L+d6K+B5Lit5pat5ZCO55uu5b2V5LiN5Lii44CCXG4gICAgd29ya2luZyA9IHsgLi4ud29ya2luZywgY3JlYXRlZEZvbGRlcklkczogY3JlYXRlZEZvbGRlcnMubWFwKChmKSA9PiBmLmlkKSwgdXBkYXRlZEF0OiBub3coKSB9O1xuICAgIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYih3b3JraW5nKTtcbiAgfVxuICBpZiAocmVzb2x1dGlvbkZhaWx1cmVzLmxlbmd0aCA+IDApIHtcbiAgICB3b3JraW5nID0ge1xuICAgICAgLi4ud29ya2luZyxcbiAgICAgIGZhaWx1cmVzOiBbLi4ud29ya2luZy5mYWlsdXJlcywgLi4ucmVzb2x1dGlvbkZhaWx1cmVzXSxcbiAgICAgIHVwZGF0ZWRBdDogbm93KCksXG4gICAgfTtcbiAgICBhd2FpdCBzdG9yYWdlLnNhdmVKb2Iod29ya2luZyk7XG4gIH1cblxuICAvLyAtLS0tIOW/q+eFp+S/neWtmOaIkOWKn+WQjuaJjeimhuebluS4iuS4gOS7veaSpOmUgOW/q+eFp++8iOaetuaehOaWueahiOesrCA5IOiKgu+8iSAtLS0tXG4gIGNvbnN0IHNuYXBzaG90OiBVbmRvU25hcHNob3QgPSB7XG4gICAgam9iSWQ6IGpvYi5qb2JJZCxcbiAgICBjcmVhdGVkQXQ6IG5vdygpLFxuICAgIG1vdmVzOiBtb3Zlcy5maWx0ZXIoKG0pID0+IG0udG9Gb2xkZXJJZC5sZW5ndGggPiAwKSxcbiAgICBjcmVhdGVkRm9sZGVycyxcbiAgICBkZWxldGVkRm9sZGVyczpcbiAgICAgIHVuZG9FeGlzdGluZyAmJiB1bmRvRXhpc3Rpbmcuam9iSWQgPT09IGpvYi5qb2JJZCA/IFsuLi51bmRvRXhpc3RpbmcuZGVsZXRlZEZvbGRlcnNdIDogW10sXG4gIH07XG4gIGF3YWl0IHN0b3JhZ2Uuc2F2ZVVuZG8oc25hcHNob3QpO1xuXG4gIC8vIC0tLS0gNC4g6aG65bqP56e75YqoIC0tLS1cbiAgY29uc3QgZmFpbHVyZXM6IEZhaWx1cmVJdGVtW10gPSBbLi4ud29ya2luZy5mYWlsdXJlc107XG4gIGNvbnN0IHRvdGFsID0gb3JkZXJlZC5sZW5ndGg7XG4gIGxldCBwcm9jZXNzZWQgPSAwO1xuXG4gIGZvciAoY29uc3QgeyBib29rbWFyayB9IG9mIG9yZGVyZWQpIHtcbiAgICBwcm9jZXNzZWQgKz0gMTtcbiAgICAvLyDlj5bmtojmo4Dmn6XvvJrph43or7vmjIHkuYXljJbmoIflv5fvvIxDQU5DRUxfSk9CIOabtOaWsOWtmOWCqOWQjueri+WNs+eUn+aViOOAglxuICAgIGNvbnN0IHBlcnNpc3RlZCA9IGF3YWl0IHN0b3JhZ2UubG9hZEpvYigpO1xuICAgIGlmIChwZXJzaXN0ZWQ/LmNhbmNlbFJlcXVlc3RlZCkge1xuICAgICAgY29uc3QgaW50ZXJydXB0ZWQ6IEpvYlN0YXRlID0ge1xuICAgICAgICAuLi53b3JraW5nLFxuICAgICAgICBzdGF0dXM6ICdpbnRlcnJ1cHRlZCcsXG4gICAgICAgIGNhbmNlbFJlcXVlc3RlZDogdHJ1ZSxcbiAgICAgICAgdXBkYXRlZEF0OiBub3coKSxcbiAgICAgIH07XG4gICAgICBhd2FpdCBzdG9yYWdlLnNhdmVKb2IoaW50ZXJydXB0ZWQpO1xuICAgICAgZXZlbnRzPy5pbnRlcnJ1cHRlZChpbnRlcnJ1cHRlZCk7XG4gICAgICByZXR1cm4geyBqb2I6IGludGVycnVwdGVkLCBhcHBsaWVkSWRzOiBpbnRlcnJ1cHRlZC5hcHBsaWVkSWRzLCBmYWlsdXJlczogaW50ZXJydXB0ZWQuZmFpbHVyZXMgfTtcbiAgICB9XG4gICAgaWYgKHdvcmtpbmcuYXBwbGllZElkcy5pbmNsdWRlcyhib29rbWFyay5pZCkpIHtcbiAgICAgIGV2ZW50cz8ucHJvZ3Jlc3Moam9iLmpvYklkLCAnYXBwbHlpbmcnLCBwcm9jZXNzZWQsIHRvdGFsKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAobWlzc2luZy5oYXMoYm9va21hcmsuaWQpKSBjb250aW51ZTtcblxuICAgIGNvbnN0IHRhcmdldCA9IHJlc29sdmVkVGFyZ2V0cy5nZXQoYm9va21hcmsuaWQpO1xuICAgIGlmICghdGFyZ2V0KSBjb250aW51ZTtcblxuICAgIC8vIOW5guetie+8muenu+WKqOWJjeajgOafpeW9k+WJjeS9jee9ru+8jOW3suWcqOebruagh+ebruW9leaXtuebtOaOpeagh+iusOWujOaIkOOAglxuICAgIGNvbnN0IGN1cnJlbnQgPSBhd2FpdCBkZXBzLmJvb2ttYXJrcy5nZXQoYm9va21hcmsuaWQpO1xuICAgIGlmICghY3VycmVudCkge1xuICAgICAgZmFpbHVyZXMucHVzaCh7IGJvb2ttYXJrSWQ6IGJvb2ttYXJrLmlkLCBraW5kOiAndmFsaWRhdGlvbicsIG1lc3NhZ2U6IHQoJ2Vycm9ycy5ib29rbWFya0dvbmVEdXJpbmdBcHBseScpIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChjdXJyZW50LnBhcmVudElkID09PSB0YXJnZXQuZm9sZGVySWQpIHtcbiAgICAgIHdvcmtpbmcgPSB7XG4gICAgICAgIC4uLndvcmtpbmcsXG4gICAgICAgIGFwcGxpZWRJZHM6IFsuLi53b3JraW5nLmFwcGxpZWRJZHMsIGJvb2ttYXJrLmlkXSxcbiAgICAgICAgYXBwbHlDdXJzb3I6IHByb2Nlc3NlZCxcbiAgICAgICAgdXBkYXRlZEF0OiBub3coKSxcbiAgICAgIH07XG4gICAgICBhd2FpdCBzdG9yYWdlLnNhdmVKb2Iod29ya2luZyk7XG4gICAgICBldmVudHM/LnByb2dyZXNzKGpvYi5qb2JJZCwgJ2FwcGx5aW5nJywgcHJvY2Vzc2VkLCB0b3RhbCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgYXdhaXQgZGVwcy5ib29rbWFya3MubW92ZShib29rbWFyay5pZCwgeyBwYXJlbnRJZDogdGFyZ2V0LmZvbGRlcklkIH0pO1xuICAgICAgd29ya2luZyA9IHtcbiAgICAgICAgLi4ud29ya2luZyxcbiAgICAgICAgYXBwbGllZElkczogWy4uLndvcmtpbmcuYXBwbGllZElkcywgYm9va21hcmsuaWRdLFxuICAgICAgICBhcHBseUN1cnNvcjogcHJvY2Vzc2VkLFxuICAgICAgICB1cGRhdGVkQXQ6IG5vdygpLFxuICAgICAgfTtcbiAgICAgIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYih3b3JraW5nKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgY2xhc3NpZmllZCA9IGNsYXNzaWZ5RXJyb3IoZXJyb3IpO1xuICAgICAgZmFpbHVyZXMucHVzaCh7IGJvb2ttYXJrSWQ6IGJvb2ttYXJrLmlkLCBraW5kOiBjbGFzc2lmaWVkLmtpbmQsIG1lc3NhZ2U6IGNsYXNzaWZpZWQubWVzc2FnZSB9KTtcbiAgICAgIHdvcmtpbmcgPSB7IC4uLndvcmtpbmcsIGZhaWx1cmVzLCBhcHBseUN1cnNvcjogcHJvY2Vzc2VkLCB1cGRhdGVkQXQ6IG5vdygpIH07XG4gICAgICBhd2FpdCBzdG9yYWdlLnNhdmVKb2Iod29ya2luZyk7XG4gICAgfVxuICAgIGV2ZW50cz8ucHJvZ3Jlc3Moam9iLmpvYklkLCAnYXBwbHlpbmcnLCBwcm9jZXNzZWQsIHRvdGFsKTtcbiAgfVxuXG4gIC8vIC0tLS0gNS4g5LuF5riF55CG55So5oi36YCJ5Lit6IyD5Zu05LiO5pys6L2u5paw5bu655qE56m65paH5Lu25aS5IC0tLS1cbiAgY29uc3QgY2xlYW51cCA9IGF3YWl0IGNsZWFudXBTZWxlY3RlZEVtcHR5Rm9sZGVycyhcbiAgICBkZXBzLmJvb2ttYXJrcyxcbiAgICBzdG9yYWdlLFxuICAgIHNuYXBzaG90LFxuICAgIG5ldyBTZXQoWy4uLmNsZWFudXBGb2xkZXJJZHMsIC4uLmNyZWF0ZWRJZHNdKSxcbiAgICBjcmVhdGVkSWRzLFxuICApO1xuICBmYWlsdXJlcy5wdXNoKC4uLmNsZWFudXAuZmFpbHVyZXMpO1xuICB3b3JraW5nID0geyAuLi53b3JraW5nLCBmYWlsdXJlcywgdXBkYXRlZEF0OiBub3coKSB9O1xuICBpZiAoY2xlYW51cC5jYW5jZWxsZWQpIHtcbiAgICBjb25zdCBpbnRlcnJ1cHRlZDogSm9iU3RhdGUgPSB7XG4gICAgICAuLi53b3JraW5nLFxuICAgICAgc3RhdHVzOiAnaW50ZXJydXB0ZWQnLFxuICAgICAgY2FuY2VsUmVxdWVzdGVkOiB0cnVlLFxuICAgICAgdXBkYXRlZEF0OiBub3coKSxcbiAgICB9O1xuICAgIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYihpbnRlcnJ1cHRlZCk7XG4gICAgZXZlbnRzPy5pbnRlcnJ1cHRlZChpbnRlcnJ1cHRlZCk7XG4gICAgcmV0dXJuIHsgam9iOiBpbnRlcnJ1cHRlZCwgYXBwbGllZElkczogaW50ZXJydXB0ZWQuYXBwbGllZElkcywgZmFpbHVyZXMgfTtcbiAgfVxuXG4gIGNvbnN0IGNvbXBsZXRlZDogSm9iU3RhdGUgPSB7IC4uLndvcmtpbmcsIHN0YXR1czogJ2NvbXBsZXRlZCcsIHVwZGF0ZWRBdDogbm93KCkgfTtcbiAgYXdhaXQgc3RvcmFnZS5zYXZlSm9iKGNvbXBsZXRlZCk7XG4gIGV2ZW50cz8uY29tcGxldGVkKGNvbXBsZXRlZCk7XG4gIHJldHVybiB7IGpvYjogY29tcGxldGVkLCBhcHBsaWVkSWRzOiBjb21wbGV0ZWQuYXBwbGllZElkcywgZmFpbHVyZXMgfTtcbn1cblxuLyoqXG4gKiDmjInmnIDmlrDmoJHmt7Hluqbku47mt7HliLDmtYXmuIXnkIblgJnpgInnm67lvZXjgIJcbiAqIOWAmemAiembhuWQiOeUseeUqOaIt+aYjuehrumAieS4reeahOWOn+aWh+S7tuWkueWSjOacrOi9ruaWsOW7uuebruW9lee7hOaIkO+8m+acqumAieebruW9leWNs+S9v+S4uuepuuS5n+S4jeinpueisOOAglxuICog5L2/55SoIHJlbW92ZSDogIzkuI3mmK8gcmVtb3ZlVHJlZe+8jOS9v+W5tuWPkeaWsOWinuWGheWuueaXtueUsSBDaHJvbWUg5a6J5YWo5ouS57ud5Yig6Zmk44CCXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGNsZWFudXBTZWxlY3RlZEVtcHR5Rm9sZGVycyhcbiAgYm9va21hcmtzOiBCb29rbWFya3NQb3J0LFxuICBzdG9yYWdlOiBTdG9yYWdlUG9ydCxcbiAgc25hcHNob3Q6IFVuZG9TbmFwc2hvdCxcbiAgY2FuZGlkYXRlSWRzOiBTZXQ8c3RyaW5nPixcbiAgY3JlYXRlZElkczogU2V0PHN0cmluZz4sXG4pOiBQcm9taXNlPHsgZGVsZXRlZEZvbGRlcnM6IERlbGV0ZWRGb2xkZXJbXTsgZmFpbHVyZXM6IEZhaWx1cmVJdGVtW107IGNhbmNlbGxlZDogYm9vbGVhbiB9PiB7XG4gIGNvbnN0IHRyZWUgPSBhd2FpdCBib29rbWFya3MuZ2V0VHJlZSgpO1xuICBjb25zdCBjYW5kaWRhdGVzOiBBcnJheTx7IG5vZGU6IEJvb2ttYXJrTm9kZTsgZGVwdGg6IG51bWJlciB9PiA9IFtdO1xuICBjb25zdCB2aXNpdCA9IChub2RlOiBCb29rbWFya05vZGUsIGRlcHRoOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICBpZiAoY2FuZGlkYXRlSWRzLmhhcyhub2RlLmlkKSAmJiBub2RlLnVybCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBjYW5kaWRhdGVzLnB1c2goeyBub2RlLCBkZXB0aCB9KTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuID8/IFtdKSB2aXNpdChjaGlsZCwgZGVwdGggKyAxKTtcbiAgfTtcbiAgZm9yIChjb25zdCByb290IG9mIHRyZWUpIHZpc2l0KHJvb3QsIDApO1xuICBjYW5kaWRhdGVzLnNvcnQoKGEsIGIpID0+IGIuZGVwdGggLSBhLmRlcHRoKTtcblxuICBjb25zdCBkZWxldGVkRm9sZGVycyA9IFsuLi5zbmFwc2hvdC5kZWxldGVkRm9sZGVyc107XG4gIGNvbnN0IHJlY29yZGVkSWRzID0gbmV3IFNldChkZWxldGVkRm9sZGVycy5tYXAoKGZvbGRlcikgPT4gZm9sZGVyLmlkKSk7XG4gIGNvbnN0IGZhaWx1cmVzOiBGYWlsdXJlSXRlbVtdID0gW107XG5cbiAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuICAgIGNvbnN0IHBlcnNpc3RlZCA9IGF3YWl0IHN0b3JhZ2UubG9hZEpvYigpO1xuICAgIGlmIChwZXJzaXN0ZWQ/LmNhbmNlbFJlcXVlc3RlZCkge1xuICAgICAgcmV0dXJuIHsgZGVsZXRlZEZvbGRlcnMsIGZhaWx1cmVzLCBjYW5jZWxsZWQ6IHRydWUgfTtcbiAgICB9XG5cbiAgICBjb25zdCBub2RlID0gYXdhaXQgYm9va21hcmtzLmdldChjYW5kaWRhdGUubm9kZS5pZCk7XG4gICAgaWYgKCFub2RlIHx8IG5vZGUudXJsICE9PSB1bmRlZmluZWQpIGNvbnRpbnVlO1xuICAgIGlmICghbm9kZS5wYXJlbnRJZCB8fCBub2RlLnBhcmVudElkID09PSAnMCcgfHwgaXNVbm1vZGlmaWFibGUobm9kZSkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgYm9va21hcmtzLmdldENoaWxkcmVuKG5vZGUuaWQpO1xuICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPiAwKSBjb250aW51ZTtcblxuICAgIC8vIOWFiOiusOW9leWGjeWIoOmZpO+8muWNs+S9vyBTZXJ2aWNlIFdvcmtlciDlnKjkuKTkuKrmk43kvZzkuYvpl7Tooqvlm57mlLbvvIzmkqTplIDkuZ/og73or4bliKvku43lrZjlnKjnmoTljp/nm67lvZXjgIJcbiAgICBpZiAoIWNyZWF0ZWRJZHMuaGFzKG5vZGUuaWQpICYmICFyZWNvcmRlZElkcy5oYXMobm9kZS5pZCkpIHtcbiAgICAgIHJlY29yZGVkSWRzLmFkZChub2RlLmlkKTtcbiAgICAgIGRlbGV0ZWRGb2xkZXJzLnB1c2goe1xuICAgICAgICBpZDogbm9kZS5pZCxcbiAgICAgICAgcGFyZW50SWQ6IG5vZGUucGFyZW50SWQsXG4gICAgICAgIHRpdGxlOiBub2RlLnRpdGxlLFxuICAgICAgICBpbmRleDogbm9kZS5pbmRleCA/PyAwLFxuICAgICAgfSk7XG4gICAgICBhd2FpdCBzdG9yYWdlLnNhdmVVbmRvKHsgLi4uc25hcHNob3QsIGRlbGV0ZWRGb2xkZXJzOiBbLi4uZGVsZXRlZEZvbGRlcnNdIH0pO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBib29rbWFya3MucmVtb3ZlKG5vZGUuaWQpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zdCBjbGFzc2lmaWVkID0gY2xhc3NpZnlFcnJvcihlcnJvcik7XG4gICAgICBmYWlsdXJlcy5wdXNoKHtcbiAgICAgICAgZm9sZGVySWQ6IG5vZGUuaWQsXG4gICAgICAgIGtpbmQ6IGNsYXNzaWZpZWQua2luZCxcbiAgICAgICAgbWVzc2FnZTogdCgnZXJyb3JzLmNsZWFudXBGb2xkZXJGYWlsZWQnLCB7IHRpdGxlOiBub2RlLnRpdGxlLCBtZXNzYWdlOiBjbGFzc2lmaWVkLm1lc3NhZ2UgfSksXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBkZWxldGVkRm9sZGVycywgZmFpbHVyZXMsIGNhbmNlbGxlZDogZmFsc2UgfTtcbn1cbiIsImltcG9ydCB0eXBlIHsgRGVsZXRlZEZvbGRlciwgVW5kb01vdmUsIFVuZG9TbmFwc2hvdCB9IGZyb20gJy4uLy4uL3NoYXJlZC9zY2hlbWFzJztcblxuLyoqIOaSpOmUgOaXtuWNleadoeenu+WKqOeahOWPr+aJp+ihjOaAp+WIpOWumuOAgiAqL1xuZXhwb3J0IHR5cGUgUmVzdG9yZURlY2lzaW9uID1cbiAgfCB7IGFjdGlvbjogJ3Jlc3RvcmUnOyBtb3ZlOiBVbmRvTW92ZSB9XG4gIHwgeyBhY3Rpb246ICdza2lwJzsgbW92ZTogVW5kb01vdmU7IHJlYXNvbjogJ21vdmVkX2J5X3VzZXInIHwgJ2Jvb2ttYXJrX21pc3NpbmcnIHwgJ3BhcmVudF9taXNzaW5nJyB9O1xuXG4vKipcbiAqIOWIpOWumuS4gOadoeW/q+eFp+iusOW9leaYr+WQpuW6lOaBouWkje+8iOaetuaehOaWueahiOesrCA5IOiKgu+8ie+8mlxuICog5Lmm562+5b2T5YmN5LuN5Zyo5pys5qyh5bqU55So55qE55uu5qCH55uu5b2V5pe25omN5oGi5aSN77ybXG4gKiDlt7LooqvnlKjmiLflho3mrKHnp7vliqjmiJblt7LliKDpmaTliJnot7Pov4flubbmiqXlhrLnqoHvvIzkuI3opobnm5bnlKjmiLfnmoTmlrDmk43kvZzjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlY2lkZVJlc3RvcmUoXG4gIG1vdmU6IFVuZG9Nb3ZlLFxuICBjdXJyZW50Qm9va21hcms6IHsgcGFyZW50SWQ/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCxcbiAgcGFyZW50RXhpc3RzOiBib29sZWFuLFxuKTogUmVzdG9yZURlY2lzaW9uIHtcbiAgaWYgKCFjdXJyZW50Qm9va21hcmspIHtcbiAgICByZXR1cm4geyBhY3Rpb246ICdza2lwJywgbW92ZSwgcmVhc29uOiAnYm9va21hcmtfbWlzc2luZycgfTtcbiAgfVxuICBpZiAoIXBhcmVudEV4aXN0cykge1xuICAgIHJldHVybiB7IGFjdGlvbjogJ3NraXAnLCBtb3ZlLCByZWFzb246ICdwYXJlbnRfbWlzc2luZycgfTtcbiAgfVxuICBpZiAoY3VycmVudEJvb2ttYXJrLnBhcmVudElkICE9PSBtb3ZlLnRvRm9sZGVySWQpIHtcbiAgICByZXR1cm4geyBhY3Rpb246ICdza2lwJywgbW92ZSwgcmVhc29uOiAnbW92ZWRfYnlfdXNlcicgfTtcbiAgfVxuICByZXR1cm4geyBhY3Rpb246ICdyZXN0b3JlJywgbW92ZSB9O1xufVxuXG4vKipcbiAqIOaBouWkjemhuuW6j++8muaMieWOnyBwYXJlbnRJZCDliIbnu4TvvIznu4TlhoXmjInljp8gaW5kZXgg5Y2H5bqP56e75Zue77yMXG4gKiDkvb/nm67lvZXlhoXnmoTnm7jlr7npobrluo/lsL3ph4/mgaLlpI3liLDlupTnlKjliY3nirbmgIHjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9yZGVyUmVzdG9yZXMobW92ZXM6IFVuZG9Nb3ZlW10pOiBVbmRvTW92ZVtdIHtcbiAgY29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIFVuZG9Nb3ZlW10+KCk7XG4gIGZvciAoY29uc3QgbW92ZSBvZiBtb3Zlcykge1xuICAgIGNvbnN0IGdyb3VwID0gZ3JvdXBzLmdldChtb3ZlLmZyb21QYXJlbnRJZCk7XG4gICAgaWYgKGdyb3VwKSB7XG4gICAgICBncm91cC5wdXNoKG1vdmUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBncm91cHMuc2V0KG1vdmUuZnJvbVBhcmVudElkLCBbbW92ZV0pO1xuICAgIH1cbiAgfVxuICBjb25zdCBvcmRlcmVkOiBVbmRvTW92ZVtdID0gW107XG4gIGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzLnZhbHVlcygpKSB7XG4gICAgb3JkZXJlZC5wdXNoKC4uLlsuLi5ncm91cF0uc29ydCgoYSwgYikgPT4gYS5mcm9tSW5kZXggLSBiLmZyb21JbmRleCkpO1xuICB9XG4gIHJldHVybiBvcmRlcmVkO1xufVxuXG4vKipcbiAqIOaWsOW7uuebruW9leeahOWIoOmZpOmhuuW6j++8muaMiea3seW6puS7jua3seWIsOa1heOAglxuICog5Y+q5Yig6Zmk56m655uu5b2V55Sx6LCD55So5pa56YCQ5p2h56Gu6K6k77yb5o6S5bqP5L+d6K+B5a2Q55uu5b2V5YWI5LqO54i255uu5b2V6KKr5qOA5p+l44CCXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvcmRlckZvbGRlcnNGb3JEZWxldGlvbihcbiAgY3JlYXRlZEZvbGRlcnM6IFVuZG9TbmFwc2hvdFsnY3JlYXRlZEZvbGRlcnMnXSxcbik6IHN0cmluZ1tdIHtcbiAgcmV0dXJuIFsuLi5jcmVhdGVkRm9sZGVyc10uc29ydCgoYSwgYikgPT4gYi5kZXB0aCAtIGEuZGVwdGgpLm1hcCgoZikgPT4gZi5pZCk7XG59XG5cbi8qKlxuICog6KKr5Yig5Y6f5paH5Lu25aS555qE6YeN5bu66aG65bqP77ya54i255uu5b2V5YWI5LqO5a2Q55uu5b2V44CCXG4gKiDmjIkgcGFyZW50SWQg5ouT5omR5o6S5bqP4oCU4oCUcGFyZW50SWQg5LiN5Zyo5b6F5bu66ZuG5ZCI5Lit77yI5Y2z5aSW6YOo5bey5pyJ55uu5b2V5oiW5bey6YeN5bu677yJ55qE5YWI5bu677yMXG4gKiDpgJDova7mjqjov5vvvJvlh7rnjrDnjq/vvIjnkIborrrkuIrkuI3kvJrvvInml7bmrovkvZnmjInljp/luo/ov73liqDvvIzpgb/lhY3mrbvlvqrnjq/jgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9yZGVyRm9sZGVyc0ZvclJlY3JlYXRpb24oZm9sZGVyczogRGVsZXRlZEZvbGRlcltdKTogRGVsZXRlZEZvbGRlcltdIHtcbiAgY29uc3QgcmVtYWluaW5nID0gWy4uLmZvbGRlcnNdO1xuICBjb25zdCBvcmRlcmVkOiBEZWxldGVkRm9sZGVyW10gPSBbXTtcbiAgbGV0IHByb2dyZXNzZWQgPSB0cnVlO1xuICB3aGlsZSAocmVtYWluaW5nLmxlbmd0aCA+IDAgJiYgcHJvZ3Jlc3NlZCkge1xuICAgIHByb2dyZXNzZWQgPSBmYWxzZTtcbiAgICBmb3IgKGxldCBpID0gcmVtYWluaW5nLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICBjb25zdCBmb2xkZXIgPSByZW1haW5pbmdbaV0hO1xuICAgICAgY29uc3QgcGFyZW50U3RpbGxQZW5kaW5nID0gcmVtYWluaW5nLnNvbWUoKHIpID0+IHIuaWQgPT09IGZvbGRlci5wYXJlbnRJZCk7XG4gICAgICBpZiAoIXBhcmVudFN0aWxsUGVuZGluZykge1xuICAgICAgICBvcmRlcmVkLnB1c2goZm9sZGVyKTtcbiAgICAgICAgcmVtYWluaW5nLnNwbGljZShpLCAxKTtcbiAgICAgICAgcHJvZ3Jlc3NlZCA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIG9yZGVyZWQucHVzaCguLi5yZW1haW5pbmcpO1xuICByZXR1cm4gb3JkZXJlZDtcbn1cbiIsImltcG9ydCB0eXBlIHsgQm9va21hcmtzUG9ydCwgRXZlbnRzUG9ydCwgU3RvcmFnZVBvcnQgfSBmcm9tICcuL3BvcnRzJztcbmltcG9ydCB7IGFzc2VydFRyYW5zaXRpb24sIGlzV3JpdGVMb2NrZWQgfSBmcm9tICcuLi9kb21haW4vb3JnYW5pemUvc3RhdGVNYWNoaW5lJztcbmltcG9ydCB7XG4gIGRlY2lkZVJlc3RvcmUsXG4gIG9yZGVyRm9sZGVyc0ZvckRlbGV0aW9uLFxuICBvcmRlckZvbGRlcnNGb3JSZWNyZWF0aW9uLFxuICBvcmRlclJlc3RvcmVzLFxuICB0eXBlIFJlc3RvcmVEZWNpc2lvbixcbn0gZnJvbSAnLi4vZG9tYWluL3VuZG8vc25hcHNob3QnO1xuaW1wb3J0IHsgQXBwRXJyb3IsIGNsYXNzaWZ5RXJyb3IgfSBmcm9tICcuLi9zaGFyZWQvZXJyb3JzJztcbmltcG9ydCB7IHQsIHR5cGUgTWVzc2FnZUtleSB9IGZyb20gJy4uL3NoYXJlZC9pMThuJztcbmltcG9ydCB0eXBlIHsgRmFpbHVyZUl0ZW0sIEpvYlN0YXRlLCBVbmRvTW92ZSwgVW5kb1NuYXBzaG90IH0gZnJvbSAnLi4vc2hhcmVkL3NjaGVtYXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFVuZG9EZXBzIHtcbiAgYm9va21hcmtzOiBCb29rbWFya3NQb3J0O1xuICBzdG9yYWdlOiBTdG9yYWdlUG9ydDtcbiAgZXZlbnRzPzogRXZlbnRzUG9ydDtcbiAgbm93PzogKCkgPT4gbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFVuZG9SZXN1bHQge1xuICBqb2I6IEpvYlN0YXRlO1xuICAvKiog5Yay56qB5LiO5aSx6LSl6K+m5oOF77yb5YWo6YOo5oiQ5Yqf5pe25Li656m644CCICovXG4gIGNvbmZsaWN0czogRmFpbHVyZUl0ZW1bXTtcbn1cblxuY29uc3QgQ09ORkxJQ1RfUkVBU09OX0tFWVMgPSB7XG4gIG1vdmVkX2J5X3VzZXI6ICdlcnJvcnMudW5kb01vdmVkQnlVc2VyJyxcbiAgYm9va21hcmtfbWlzc2luZzogJ2Vycm9ycy51bmRvQm9va21hcmtNaXNzaW5nJyxcbiAgcGFyZW50X21pc3Npbmc6ICdlcnJvcnMudW5kb1BhcmVudE1pc3NpbmcnLFxufSBzYXRpc2ZpZXMgUmVjb3JkPHN0cmluZywgTWVzc2FnZUtleT47XG5cbi8qKlxuICog5LiA6ZSu5pKk6ZSA5pyA6L+R5LiA5qyh5pW055CG77yI5p625p6E5pa55qGI56ysIDkg6IqC77yJ44CCU2VydmljZSBXb3JrZXIg5piv5ZSv5LiA6LCD55So5YWl5Y+j44CCXG4gKlxuICogMS4g5LuF5aSE55CG5b+r54WnIG1vdmVzIOS4reaIkOWKn+enu+WKqOi/h+eahOS5puetvu+8m1xuICogMi4g5q+P5p2h5YWI5Yik5a6a5Y+v5oGi5aSN5oCn77yI5LuN5Zyo5pys5qyh5bqU55So55qE55uu5qCH55uu5b2V5omN5oGi5aSN77yb55So5oi35LqM5qyh56e75Yqo44CBXG4gKiAgICDlt7LliKDpmaTmiJbljp/niLbnm67lvZXkuI3lrZjlnKjliJnot7Pov4flubbmiqXlhrLnqoHvvIzkuI3opobnm5bnlKjmiLfnmoTmlrDmk43kvZzvvInvvJtcbiAqIDMuIOaBouWkjemhuuW6j++8muaMieWOnyBwYXJlbnRJZCDliIbnu4TjgIHnu4TlhoXmjInljp8gaW5kZXgg5Y2H5bqP56e75Zue77ybXG4gKiA0LiDmgaLlpI3lkI7lsIbmnKzmrKHmlrDlu7rnm67lvZXmjInmt7Hluqbku47mt7HliLDmtYXliKDpmaTvvIzkvYblj6rliKDpmaTnqbrnm67lvZXvvJtcbiAqIDUuIOacieWGsueqgeaXtueKtuaAgeS4uiBwYXJ0aWFsbHlfdW5kb25l77yM5L+d55WZ5b+r54Wn5L6b55So5oi36YeN6K+V44CCXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1bmRvTGFzdEFwcGx5KGRlcHM6IFVuZG9EZXBzLCBqb2I6IEpvYlN0YXRlKTogUHJvbWlzZTxVbmRvUmVzdWx0PiB7XG4gIGNvbnN0IHsgc3RvcmFnZSwgZXZlbnRzLCBib29rbWFya3MgfSA9IGRlcHM7XG4gIGNvbnN0IG5vdyA9IGRlcHMubm93ID8/ICgoKSA9PiBEYXRlLm5vdygpKTtcblxuICBpZiAoaXNXcml0ZUxvY2tlZChqb2Iuc3RhdHVzKSkge1xuICAgIHRocm93IG5ldyBBcHBFcnJvcigndXNlcl9jb25mbGljdCcsICdlcnJvcnMuY2Fubm90VW5kb0luU3RhdGUnLCB7IHN0YXR1czogam9iLnN0YXR1cyB9KTtcbiAgfVxuICBhc3NlcnRUcmFuc2l0aW9uKGpvYi5zdGF0dXMsICd1bmRvaW5nJyk7XG5cbiAgY29uc3Qgc25hcHNob3Q6IFVuZG9TbmFwc2hvdCB8IG51bGwgPSBhd2FpdCBzdG9yYWdlLmxvYWRVbmRvKCk7XG4gIGlmICghc25hcHNob3QgfHwgc25hcHNob3Quam9iSWQgIT09IGpvYi5qb2JJZCkge1xuICAgIHRocm93IG5ldyBBcHBFcnJvcigndmFsaWRhdGlvbicsICdlcnJvcnMubm9VbmRvU25hcHNob3QnKTtcbiAgfVxuXG4gIGxldCB3b3JraW5nOiBKb2JTdGF0ZSA9IHsgLi4uam9iLCBzdGF0dXM6ICd1bmRvaW5nJywgdXBkYXRlZEF0OiBub3coKSwgY2FuY2VsUmVxdWVzdGVkOiBmYWxzZSB9O1xuICBhd2FpdCBzdG9yYWdlLnNhdmVKb2Iod29ya2luZyk7XG5cbiAgY29uc3QgY29uZmxpY3RzOiBGYWlsdXJlSXRlbVtdID0gW107XG4gIGxldCBjYW5jZWxsZWQgPSBmYWxzZTtcblxuICAvLyAtLS0tIDAuIOmHjeW7uuW6lOeUqOaXtuiiq+aQrOepuuWIoOmZpOeahOWOn+aWh+S7tuWkue+8jOW5tuaKiiBmcm9tUGFyZW50SWQg6YeN5pig5bCE5Yiw5pawIGlkIC0tLS1cbiAgLy8g54i255uu5b2V5YWI5LqO5a2Q55uu5b2V6YeN5bu677yb5Yib5bu65aSx6LSl55qE55uu5b2V77yM5YW25Lmm562+5Lya5Zyo5LiL6Z2i5oqlIHBhcmVudF9taXNzaW5nIOWGsueqgeOAglxuICBjb25zdCBmb2xkZXJJZE1hcCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgZm9sZGVyIG9mIG9yZGVyRm9sZGVyc0ZvclJlY3JlYXRpb24oc25hcHNob3QuZGVsZXRlZEZvbGRlcnMpKSB7XG4gICAgY29uc3QgcGFyZW50SWQgPSBmb2xkZXJJZE1hcC5nZXQoZm9sZGVyLnBhcmVudElkKSA/PyBmb2xkZXIucGFyZW50SWQ7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG9yaWdpbmFsID0gYXdhaXQgYm9va21hcmtzLmdldChmb2xkZXIuaWQpO1xuICAgICAgaWYgKG9yaWdpbmFsICYmIG9yaWdpbmFsLnVybCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGZvbGRlcklkTWFwLnNldChmb2xkZXIuaWQsIG9yaWdpbmFsLmlkKTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBzaWJsaW5ncyA9IGF3YWl0IGJvb2ttYXJrcy5nZXRDaGlsZHJlbihwYXJlbnRJZCk7XG4gICAgICBjb25zdCBleGlzdGluZyA9IHNpYmxpbmdzLmZpbmQoXG4gICAgICAgIChub2RlKSA9PiBub2RlLnVybCA9PT0gdW5kZWZpbmVkICYmIG5vZGUudGl0bGUgPT09IGZvbGRlci50aXRsZSxcbiAgICAgICk7XG4gICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgZm9sZGVySWRNYXAuc2V0KGZvbGRlci5pZCwgZXhpc3RpbmcuaWQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBib29rbWFya3MuY3JlYXRlRm9sZGVyKHBhcmVudElkLCBmb2xkZXIudGl0bGUsIGZvbGRlci5pbmRleCk7XG4gICAgICBmb2xkZXJJZE1hcC5zZXQoZm9sZGVyLmlkLCBjcmVhdGVkLmlkKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIOWOn+eItuebruW9leW3suS4jeWtmOWcqOaIluWIm+W7uuWksei0pe+8muW/veeVpe+8jOS6pOeUseWQjue7reWGsueqgeWIpOWumuWkhOeQhuOAglxuICAgIH1cbiAgfVxuICBjb25zdCBtb3ZlczogVW5kb01vdmVbXSA9IHNuYXBzaG90Lm1vdmVzLm1hcCgobW92ZSkgPT5cbiAgICBmb2xkZXJJZE1hcC5oYXMobW92ZS5mcm9tUGFyZW50SWQpXG4gICAgICA/IHsgLi4ubW92ZSwgZnJvbVBhcmVudElkOiBmb2xkZXJJZE1hcC5nZXQobW92ZS5mcm9tUGFyZW50SWQpISB9XG4gICAgICA6IG1vdmUsXG4gICk7XG5cbiAgLy8gLS0tLSAxLiDpgJDmnaHliKTlrprlj6/mgaLlpI3mgKcgLS0tLVxuICBjb25zdCBkZWNpc2lvbnM6IFJlc3RvcmVEZWNpc2lvbltdID0gW107XG4gIGZvciAoY29uc3QgbW92ZSBvZiBtb3Zlcykge1xuICAgIGNvbnN0IGN1cnJlbnQgPSBhd2FpdCBib29rbWFya3MuZ2V0KG1vdmUuYm9va21hcmtJZCk7XG4gICAgLy8g5Y6f54i255uu5b2V5a2Y5Zyo5oCn5Y2V54us56Gu6K6k77yI5Lmm562+5b2T5YmN5LiN5Zyo55uu5qCH55uu5b2V5pe25Lmf5qOA5p+l77yM5L6/5LqO5oql5ZGK5Yay56qB5Y6f5Zug77yJ44CCXG4gICAgY29uc3Qgb3JpZ2luYWxQYXJlbnQgPSBhd2FpdCBib29rbWFya3MuZ2V0KG1vdmUuZnJvbVBhcmVudElkKTtcbiAgICBjb25zdCBwYXJlbnRFeGlzdHMgPSBvcmlnaW5hbFBhcmVudCAhPT0gdW5kZWZpbmVkICYmIG9yaWdpbmFsUGFyZW50LnVybCA9PT0gdW5kZWZpbmVkO1xuICAgIGRlY2lzaW9ucy5wdXNoKGRlY2lkZVJlc3RvcmUobW92ZSwgY3VycmVudCwgcGFyZW50RXhpc3RzKSk7XG4gIH1cblxuICAvLyAtLS0tIDIuIOaMieaBouWkjemhuuW6j+enu+WbniAtLS0tXG4gIGZvciAoY29uc3QgZGVjaXNpb24gb2Ygb3JkZXJSZXN0b3JlcyhcbiAgICBkZWNpc2lvbnMuZmlsdGVyKChkKTogZCBpcyBFeHRyYWN0PFJlc3RvcmVEZWNpc2lvbiwgeyBhY3Rpb246ICdyZXN0b3JlJyB9PiA9PlxuICAgICAgZC5hY3Rpb24gPT09ICdyZXN0b3JlJyxcbiAgICApLm1hcCgoZCkgPT4gZC5tb3ZlKSxcbiAgKSkge1xuICAgIC8vIOWPlua2iOajgOafpe+8mumHjeivu+aMgeS5heWMluagh+W/l++8jENBTkNFTF9KT0Ig5pu05paw5a2Y5YKo5ZCO56uL5Y2z55Sf5pWI44CCXG4gICAgY29uc3QgcGVyc2lzdGVkID0gYXdhaXQgc3RvcmFnZS5sb2FkSm9iKCk7XG4gICAgaWYgKHBlcnNpc3RlZD8uY2FuY2VsUmVxdWVzdGVkKSB7XG4gICAgICBjYW5jZWxsZWQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBib29rbWFya3MubW92ZShkZWNpc2lvbi5ib29rbWFya0lkLCB7XG4gICAgICAgIHBhcmVudElkOiBkZWNpc2lvbi5mcm9tUGFyZW50SWQsXG4gICAgICAgIGluZGV4OiBkZWNpc2lvbi5mcm9tSW5kZXgsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgY2xhc3NpZmllZCA9IGNsYXNzaWZ5RXJyb3IoZXJyb3IpO1xuICAgICAgY29uZmxpY3RzLnB1c2goe1xuICAgICAgICBib29rbWFya0lkOiBkZWNpc2lvbi5ib29rbWFya0lkLFxuICAgICAgICBraW5kOiBjbGFzc2lmaWVkLmtpbmQsXG4gICAgICAgIG1lc3NhZ2U6IHQoJ2Vycm9ycy5yZXN0b3JlRmFpbGVkJywgeyBtZXNzYWdlOiBjbGFzc2lmaWVkLm1lc3NhZ2UgfSksXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICAvLyAtLS0tIDMuIOWGsueqgeaUtumbhu+8iOi3s+i/h+mhue+8iSAtLS0tXG4gIGZvciAoY29uc3QgZGVjaXNpb24gb2YgZGVjaXNpb25zKSB7XG4gICAgaWYgKGRlY2lzaW9uLmFjdGlvbiAhPT0gJ3NraXAnKSBjb250aW51ZTtcbiAgICBjb25mbGljdHMucHVzaCh7XG4gICAgICBib29rbWFya0lkOiBkZWNpc2lvbi5tb3ZlLmJvb2ttYXJrSWQsXG4gICAgICBraW5kOiAndXNlcl9jb25mbGljdCcsXG4gICAgICBtZXNzYWdlOiB0KENPTkZMSUNUX1JFQVNPTl9LRVlTW2RlY2lzaW9uLnJlYXNvbl0pLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gLS0tLSA0LiDliKDpmaTmnKzmrKHmlrDlu7rnmoTnqbrnm67lvZXvvIjmt7HliLDmtYXvvIkgLS0tLVxuICBmb3IgKGNvbnN0IGZvbGRlcklkIG9mIG9yZGVyRm9sZGVyc0ZvckRlbGV0aW9uKHNuYXBzaG90LmNyZWF0ZWRGb2xkZXJzKSkge1xuICAgIGlmIChjYW5jZWxsZWQpIGJyZWFrO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBjaGlsZHJlbiA9IGF3YWl0IGJvb2ttYXJrcy5nZXRDaGlsZHJlbihmb2xkZXJJZCk7XG4gICAgICBpZiAoY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIGF3YWl0IGJvb2ttYXJrcy5yZW1vdmUoZm9sZGVySWQpO1xuICAgICAgfVxuICAgIH0gY2F0Y2gge1xuICAgICAgLy8g55uu5b2V5bey6KKr55So5oi35omL5Yqo5Yig6Zmk5oiW56e75Yqo77ya5b+955Wl77yM5LiN5b2x5ZON5pKk6ZSA57uT5p6c44CCXG4gICAgfVxuICB9XG5cbiAgLy8g55So5oi35Y+W5raI5pe25L+d55WZ5b+r54Wn5LiO5oql5ZGK77yM54q25oCB5Li6IHBhcnRpYWxseV91bmRvbmUg5Lul5L6/6YeN6K+V5pKk6ZSA44CCXG4gIGlmIChjYW5jZWxsZWQpIHtcbiAgICBjb25mbGljdHMucHVzaCh7IGtpbmQ6ICd1c2VyX2NvbmZsaWN0JywgbWVzc2FnZTogdCgnZXJyb3JzLnVuZG9JbnRlcnJ1cHRlZCcpIH0pO1xuICB9XG5cbiAgY29uc3QgZmluYWw6IEpvYlN0YXRlID0ge1xuICAgIC4uLndvcmtpbmcsXG4gICAgc3RhdHVzOiBjb25mbGljdHMubGVuZ3RoID4gMCA/ICdwYXJ0aWFsbHlfdW5kb25lJyA6ICd1bmRvbmUnLFxuICAgIGZhaWx1cmVzOiBjb25mbGljdHMsXG4gICAgdXBkYXRlZEF0OiBub3coKSxcbiAgfTtcbiAgYXdhaXQgc3RvcmFnZS5zYXZlSm9iKGZpbmFsKTtcbiAgaWYgKGNvbmZsaWN0cy5sZW5ndGggPiAwKSB7XG4gICAgZXZlbnRzPy5mYWlsZWQoZmluYWwpO1xuICB9IGVsc2Uge1xuICAgIGV2ZW50cz8uY29tcGxldGVkKGZpbmFsKTtcbiAgfVxuICByZXR1cm4geyBqb2I6IGZpbmFsLCBjb25mbGljdHMgfTtcbn1cbiIsImltcG9ydCB0eXBlIHsgU3RvcmFnZVBvcnQgfSBmcm9tICcuL3BvcnRzJztcbmltcG9ydCB0eXBlIHsgSm9iU3RhdGUsIFBsYW5SZWNvcmQgfSBmcm9tICcuLi9zaGFyZWQvc2NoZW1hcyc7XG5pbXBvcnQgdHlwZSB7IFN0YXR1c1BheWxvYWQgfSBmcm9tICcuLi9zaGFyZWQvbWVzc2FnZXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJlc3VtZURlcHMge1xuICBzdG9yYWdlOiBTdG9yYWdlUG9ydDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZXN1bWVWaWV3IGV4dGVuZHMgU3RhdHVzUGF5bG9hZCB7XG4gIHBsYW46IFBsYW5SZWNvcmQgfCBudWxsO1xuICAvKiog5b2T5YmN5Lu75Yqh5piv5ZCm5Y+v5Lul5LuO5oyB5LmF5YyW5ri45qCH57un57ut5YaZ5YWl44CCICovXG4gIGNhblJlc3VtZUFwcGx5OiBib29sZWFuO1xuICAvKiog5piv5ZCm5a2Y5Zyo5bGe5LqO5b2T5YmN5Lu75Yqh55qE44CB5Y+v57un57ut55qE5qih5Z6L566h57q/44CCICovXG4gIGNhblJlc3VtZVBsYW5uaW5nOiBib29sZWFuO1xufVxuXG4vKipcbiAqIERhc2hib2FyZCDph43lvIDlkI7nmoTnirbmgIHmgaLlpI3vvIjmnrbmnoTmlrnmoYjnrKwgMTIg6IqC77yJ77yaXG4gKiDpgJrov4cgR0VUX1NUQVRVUyDmi4npvZAgam9iIC8gc2NhbiAvIHBsYW4gLyB1bmRvIOW/q+eFp++8jOmHjeW7uueVjOmdouaJgOmcgOeahOS4gOWIh++8jFxuICog5LiN5L6d6LWW6ZW/6L+e5o6l5oiW5YaF5a2Y54q25oCB44CCXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXN1bWVKb2IoZGVwczogUmVzdW1lRGVwcyk6IFByb21pc2U8UmVzdW1lVmlldz4ge1xuICBjb25zdCBbam9iLCBzY2FuLCBwbGFuLCB1bmRvXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICBkZXBzLnN0b3JhZ2UubG9hZEpvYigpLFxuICAgIGRlcHMuc3RvcmFnZS5sb2FkU2NhbigpLFxuICAgIGRlcHMuc3RvcmFnZS5sb2FkUGxhbigpLFxuICAgIGRlcHMuc3RvcmFnZS5sb2FkVW5kbygpLFxuICBdKTtcblxuICBjb25zdCBjdXJyZW50Sm9iOiBKb2JTdGF0ZSA9XG4gICAgam9iID8/IHtcbiAgICAgIGpvYklkOiBjcnlwdG8ucmFuZG9tVVVJRCgpLFxuICAgICAgc3RhdHVzOiAnaWRsZScsXG4gICAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gICAgICBhcHBseUN1cnNvcjogMCxcbiAgICAgIGFwcGxpZWRJZHM6IFtdLFxuICAgICAgY3JlYXRlZEZvbGRlcklkczogW10sXG4gICAgICBjYW5jZWxSZXF1ZXN0ZWQ6IGZhbHNlLFxuICAgICAgZmFpbHVyZXM6IFtdLFxuICAgIH07XG5cbiAgY29uc3Qgam9iTWF0Y2hlcyA9IChyZWNvcmQ6IHsgam9iSWQ6IHN0cmluZyB9IHwgbnVsbCk6IGJvb2xlYW4gPT5cbiAgICByZWNvcmQgIT09IG51bGwgJiYgcmVjb3JkLmpvYklkID09PSBjdXJyZW50Sm9iLmpvYklkO1xuXG4gIHJldHVybiB7XG4gICAgam9iOiBjdXJyZW50Sm9iLFxuICAgIC8vIHNjYW4g57uT5p6c5LiN5pC65bimIGpvYklk77yM55u05o6l6L+U5Zue77yb5paw5LiA6L2u5omr5o+P5Lya6KaG55uW5a6D44CCXG4gICAgc2NhbixcbiAgICBoYXNVbmRvU25hcHNob3Q6IHVuZG8gIT09IG51bGwgJiYgam9iTWF0Y2hlcyh1bmRvKSxcbiAgICBwbGFuOiBwbGFuICYmIGpvYk1hdGNoZXMocGxhbikgPyBwbGFuIDogbnVsbCxcbiAgICAvLyBpbnRlcnJ1cHRlZCA9IOeUqOaIt+S4reaWre+8m2FwcGx5aW5nID0gU1cg5Zyo5YaZ5YWl5Lit6YCU6KKr5Zue5pS277yM5Lik6ICF6YO95Y+v5LuO5oyB5LmF5YyW5ri45qCH57ut6LeR44CCXG4gICAgY2FuUmVzdW1lQXBwbHk6IGN1cnJlbnRKb2Iuc3RhdHVzID09PSAnaW50ZXJydXB0ZWQnIHx8IGN1cnJlbnRKb2Iuc3RhdHVzID09PSAnYXBwbHlpbmcnLFxuICAgIGNhblJlc3VtZVBsYW5uaW5nOlxuICAgICAgcGxhbiAhPT0gbnVsbCAmJlxuICAgICAgam9iTWF0Y2hlcyhwbGFuKSAmJlxuICAgICAgcGxhbi5waGFzZSAhPT0gJ2RvbmUnICYmXG4gICAgICAoY3VycmVudEpvYi5zdGF0dXMgPT09ICdwbGFubmluZycgfHxcbiAgICAgICAgY3VycmVudEpvYi5zdGF0dXMgPT09ICdjbGFzc2lmeWluZycgfHxcbiAgICAgICAgY3VycmVudEpvYi5zdGF0dXMgPT09ICdmYWlsZWQnIHx8XG4gICAgICAgIGN1cnJlbnRKb2Iuc3RhdHVzID09PSAncmV2aWV3aW5nJyksXG4gIH07XG59XG4iLCJpbXBvcnQgdHlwZSB7IFNjYW5uZWRCb29rbWFyayB9IGZyb20gJy4uLy4uL3NoYXJlZC9zY2hlbWFzJztcblxuZXhwb3J0IHR5cGUgRHVwbGljYXRlS2luZCA9ICdzYW1lLXVybCcgfCAnc2ltaWxhci11cmwnIHwgJ3NhbWUtdGl0bGUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIER1cGxpY2F0ZUdyb3VwIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogRHVwbGljYXRlS2luZDtcbiAgYm9va21hcmtzOiBTY2FubmVkQm9va21hcmtbXTtcbn1cblxuZnVuY3Rpb24gZXhhY3RVcmxLZXkodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB2YWx1ZS50cmltKCk7XG59XG5cbmZ1bmN0aW9uIGxvb3NlVXJsS2V5KHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcbiAgdHJ5IHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHZhbHVlKTtcbiAgICBjb25zdCBob3N0bmFtZSA9IHVybC5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL153d3dcXC4vLCAnJyk7XG4gICAgY29uc3QgcGF0aG5hbWUgPSB1cmwucGF0aG5hbWUucmVwbGFjZSgvXFwvKyQvLCAnJykgfHwgJy8nO1xuICAgIHJldHVybiBgJHtob3N0bmFtZX0ke3BhdGhuYW1lfSR7dXJsLnNlYXJjaH1gLnRvTG93ZXJDYXNlKCk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNvbW1vblByZWZpeFJhdGlvKGxlZnQ6IHN0cmluZywgcmlnaHQ6IHN0cmluZyk6IG51bWJlciB7XG4gIGxldCBsZW5ndGggPSAwO1xuICBjb25zdCBtYXggPSBNYXRoLm1pbihsZWZ0Lmxlbmd0aCwgcmlnaHQubGVuZ3RoKTtcbiAgd2hpbGUgKGxlbmd0aCA8IG1heCAmJiBsZWZ0W2xlbmd0aF0gPT09IHJpZ2h0W2xlbmd0aF0pIGxlbmd0aCArPSAxO1xuICByZXR1cm4gKDIgKiBsZW5ndGgpIC8gKGxlZnQubGVuZ3RoICsgcmlnaHQubGVuZ3RoKTtcbn1cblxuZnVuY3Rpb24gc2ltaWxhclVybChsZWZ0OiBzdHJpbmcsIHJpZ2h0OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgYSA9IGxvb3NlVXJsS2V5KGxlZnQpO1xuICBjb25zdCBiID0gbG9vc2VVcmxLZXkocmlnaHQpO1xuICBpZiAoIWEgfHwgIWIpIHJldHVybiBmYWxzZTtcbiAgaWYgKGEgPT09IGIpIHJldHVybiB0cnVlO1xuICByZXR1cm4gYS5zcGxpdCgnLycpWzBdID09PSBiLnNwbGl0KCcvJylbMF0gJiYgY29tbW9uUHJlZml4UmF0aW8oYSwgYikgPj0gMC44O1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVkVGl0bGUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB2YWx1ZS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRvTG9jYWxlTG93ZXJDYXNlKCk7XG59XG5cbi8qKiDmjInljLnphY3nva7kv6HluqbliIbnu4TvvIzlkIzkuIDkuKrkuabnrb7lj6rov5vlhaXkuIDkuKrliIbnu4TjgIIgKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kRHVwbGljYXRlR3JvdXBzKGJvb2ttYXJrczogU2Nhbm5lZEJvb2ttYXJrW10pOiBEdXBsaWNhdGVHcm91cFtdIHtcbiAgY29uc3QgZ3JvdXBzOiBEdXBsaWNhdGVHcm91cFtdID0gW107XG4gIGNvbnN0IHVzZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICBjb25zdCBhZGRCdWNrZXRzID0gKGtpbmQ6IER1cGxpY2F0ZUtpbmQsIGtleUZvcjogKGJvb2ttYXJrOiBTY2FubmVkQm9va21hcmspID0+IHN0cmluZyB8IG51bGwpID0+IHtcbiAgICBjb25zdCBidWNrZXRzID0gbmV3IE1hcDxzdHJpbmcsIFNjYW5uZWRCb29rbWFya1tdPigpO1xuICAgIGZvciAoY29uc3QgYm9va21hcmsgb2YgYm9va21hcmtzKSB7XG4gICAgICBpZiAodXNlZC5oYXMoYm9va21hcmsuaWQpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGtleSA9IGtleUZvcihib29rbWFyayk7XG4gICAgICBpZiAoIWtleSkgY29udGludWU7XG4gICAgICBjb25zdCBidWNrZXQgPSBidWNrZXRzLmdldChrZXkpID8/IFtdO1xuICAgICAgYnVja2V0LnB1c2goYm9va21hcmspO1xuICAgICAgYnVja2V0cy5zZXQoa2V5LCBidWNrZXQpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFtrZXksIGJ1Y2tldF0gb2YgYnVja2V0cykge1xuICAgICAgaWYgKGJ1Y2tldC5sZW5ndGggPCAyKSBjb250aW51ZTtcbiAgICAgIGJ1Y2tldC5mb3JFYWNoKChib29rbWFyaykgPT4gdXNlZC5hZGQoYm9va21hcmsuaWQpKTtcbiAgICAgIGdyb3Vwcy5wdXNoKHsgaWQ6IGAke2tpbmR9OiR7a2V5fWAsIGtpbmQsIGJvb2ttYXJrczogYnVja2V0IH0pO1xuICAgIH1cbiAgfTtcblxuICBhZGRCdWNrZXRzKCdzYW1lLXVybCcsIChib29rbWFyaykgPT4gZXhhY3RVcmxLZXkoYm9va21hcmsudXJsKSk7XG5cbiAgY29uc3QgcmVtYWluaW5nID0gYm9va21hcmtzLmZpbHRlcigoYm9va21hcmspID0+ICF1c2VkLmhhcyhib29rbWFyay5pZCkpO1xuICBjb25zdCB2aXNpdGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgYm9va21hcmsgb2YgcmVtYWluaW5nKSB7XG4gICAgaWYgKHZpc2l0ZWQuaGFzKGJvb2ttYXJrLmlkKSkgY29udGludWU7XG4gICAgY29uc3QgY29tcG9uZW50OiBTY2FubmVkQm9va21hcmtbXSA9IFtdO1xuICAgIGNvbnN0IHF1ZXVlID0gW2Jvb2ttYXJrXTtcbiAgICB2aXNpdGVkLmFkZChib29rbWFyay5pZCk7XG4gICAgd2hpbGUgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgY29uc3QgY3VycmVudCA9IHF1ZXVlLnNoaWZ0KCkhO1xuICAgICAgY29tcG9uZW50LnB1c2goY3VycmVudCk7XG4gICAgICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiByZW1haW5pbmcpIHtcbiAgICAgICAgaWYgKCF2aXNpdGVkLmhhcyhjYW5kaWRhdGUuaWQpICYmIHNpbWlsYXJVcmwoY3VycmVudC51cmwsIGNhbmRpZGF0ZS51cmwpKSB7XG4gICAgICAgICAgdmlzaXRlZC5hZGQoY2FuZGlkYXRlLmlkKTtcbiAgICAgICAgICBxdWV1ZS5wdXNoKGNhbmRpZGF0ZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGNvbXBvbmVudC5sZW5ndGggPiAxKSB7XG4gICAgICBjb21wb25lbnQuZm9yRWFjaCgoaXRlbSkgPT4gdXNlZC5hZGQoaXRlbS5pZCkpO1xuICAgICAgZ3JvdXBzLnB1c2goe1xuICAgICAgICBpZDogYHNpbWlsYXItdXJsOiR7Y29tcG9uZW50Lm1hcCgoaXRlbSkgPT4gaXRlbS5pZCkuam9pbignLCcpfWAsXG4gICAgICAgIGtpbmQ6ICdzaW1pbGFyLXVybCcsXG4gICAgICAgIGJvb2ttYXJrczogY29tcG9uZW50LFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgYWRkQnVja2V0cygnc2FtZS10aXRsZScsIChib29rbWFyaykgPT4gbm9ybWFsaXplZFRpdGxlKGJvb2ttYXJrLnRpdGxlKSB8fCBudWxsKTtcbiAgcmV0dXJuIGdyb3Vwcztcbn1cbiIsImltcG9ydCB7IGJ1aWxkU2NhblJlc3VsdCB9IGZyb20gJy4uL2RvbWFpbi9ib29rbWFya3MvdHJlZSc7XG5pbXBvcnQgeyBmaW5kRHVwbGljYXRlR3JvdXBzIH0gZnJvbSAnLi4vZG9tYWluL2Jvb2ttYXJrcy9kdXBsaWNhdGVzJztcbmltcG9ydCB7IEFwcEVycm9yIH0gZnJvbSAnLi4vc2hhcmVkL2Vycm9ycyc7XG5pbXBvcnQgeyB0IH0gZnJvbSAnLi4vc2hhcmVkL2kxOG4nO1xuaW1wb3J0IHR5cGUgeyBTY2FuUmVzdWx0IH0gZnJvbSAnLi4vc2hhcmVkL3NjaGVtYXMnO1xuaW1wb3J0IHR5cGUgeyBCb29rbWFya3NQb3J0LCBTdG9yYWdlUG9ydCB9IGZyb20gJy4vcG9ydHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIERlbGV0ZUR1cGxpY2F0ZUJvb2ttYXJrc1Jlc3VsdCB7XG4gIHNjYW46IFNjYW5SZXN1bHQ7XG4gIGRlbGV0ZWRJZHM6IHN0cmluZ1tdO1xuICBmYWlsdXJlczogQXJyYXk8eyBib29rbWFya0lkOiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZyB9Pjtcbn1cblxuLyoqIOWPquWFgeiuuOWIoOmZpOacgOi/keS4gOasoeaJq+aPj+S4reWHuueOsOeahOS5puetviBJRO+8jOW5tuWcqOWIoOmZpOWQjumHjeaWsOaJq+aPj+S7peWQjOatpeaMgeS5heWMlueKtuaAgeOAgiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRlbGV0ZUR1cGxpY2F0ZUJvb2ttYXJrcyhcbiAgZGVwczogeyBib29rbWFya3M6IEJvb2ttYXJrc1BvcnQ7IHN0b3JhZ2U6IFN0b3JhZ2VQb3J0OyBub3c/OiAoKSA9PiBudW1iZXI7IG5ld0lkPzogKCkgPT4gc3RyaW5nIH0sXG4gIGJvb2ttYXJrSWRzOiBzdHJpbmdbXSxcbik6IFByb21pc2U8RGVsZXRlRHVwbGljYXRlQm9va21hcmtzUmVzdWx0PiB7XG4gIGNvbnN0IHByZXZpb3VzID0gYXdhaXQgZGVwcy5zdG9yYWdlLmxvYWRTY2FuKCk7XG4gIGlmICghcHJldmlvdXMpIHRocm93IG5ldyBBcHBFcnJvcigndmFsaWRhdGlvbicsICdlcnJvcnMubm9TY2FuJyk7XG5cbiAgY29uc3QgaWRzID0gWy4uLm5ldyBTZXQoYm9va21hcmtJZHMpXTtcbiAgY29uc3QgcmVxdWVzdGVkID0gbmV3IFNldChpZHMpO1xuICBjb25zdCBncm91cHMgPSBmaW5kRHVwbGljYXRlR3JvdXBzKHByZXZpb3VzLmJvb2ttYXJrcyk7XG4gIGNvbnN0IGR1cGxpY2F0ZUlkcyA9IG5ldyBTZXQoZ3JvdXBzLmZsYXRNYXAoKGdyb3VwKSA9PiBncm91cC5ib29rbWFya3MubWFwKChib29rbWFyaykgPT4gYm9va21hcmsuaWQpKSk7XG4gIGlmIChpZHMuc29tZSgoaWQpID0+ICFkdXBsaWNhdGVJZHMuaGFzKGlkKSkpIHtcbiAgICB0aHJvdyBuZXcgQXBwRXJyb3IoJ3ZhbGlkYXRpb24nLCAnZXJyb3JzLm5vdFNjYW5uZWREdXBsaWNhdGUnKTtcbiAgfVxuICBpZiAoZ3JvdXBzLnNvbWUoKGdyb3VwKSA9PiBncm91cC5ib29rbWFya3MuZXZlcnkoKGJvb2ttYXJrKSA9PiByZXF1ZXN0ZWQuaGFzKGJvb2ttYXJrLmlkKSkpKSB7XG4gICAgdGhyb3cgbmV3IEFwcEVycm9yKCd2YWxpZGF0aW9uJywgJ2Vycm9ycy5rZWVwT25lUGVyR3JvdXAnKTtcbiAgfVxuXG4gIGNvbnN0IGRlbGV0ZWRJZHM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGZhaWx1cmVzOiBBcnJheTx7IGJvb2ttYXJrSWQ6IHN0cmluZzsgbWVzc2FnZTogc3RyaW5nIH0+ID0gW107XG4gIGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGRlcHMuYm9va21hcmtzLnJlbW92ZShpZCk7XG4gICAgICBkZWxldGVkSWRzLnB1c2goaWQpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBmYWlsdXJlcy5wdXNoKHtcbiAgICAgICAgYm9va21hcmtJZDogaWQsXG4gICAgICAgIG1lc3NhZ2U6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogdCgnZXJyb3JzLmRlbGV0ZUZhaWxlZCcpLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgdHJlZSA9IGF3YWl0IGRlcHMuYm9va21hcmtzLmdldFRyZWUoKTtcbiAgY29uc3Qgc2NhbiA9IGJ1aWxkU2NhblJlc3VsdChcbiAgICB0cmVlLFxuICAgIChkZXBzLm5ld0lkID8/ICgoKSA9PiBjcnlwdG8ucmFuZG9tVVVJRCgpKSkoKSxcbiAgICAoZGVwcy5ub3cgPz8gKCgpID0+IERhdGUubm93KCkpKSgpLFxuICApO1xuICBhd2FpdCBkZXBzLnN0b3JhZ2Uuc2F2ZVNjYW4oc2Nhbik7XG4gIHJldHVybiB7IHNjYW4sIGRlbGV0ZWRJZHMsIGZhaWx1cmVzIH07XG59XG4iLCJpbXBvcnQgdHlwZSB7IFNjYW5Gb2xkZXIsIFNjYW5SZXN1bHQgfSBmcm9tICcuLi8uLi9zaGFyZWQvc2NoZW1hcyc7XG5cbi8qKlxuICog5om+5Ye65omA5pyJ56m65paH5Lu25aS577ya6Ieq6Lqr5Y+K5YWo6YOo5ZCO5Luj55uu5b2V5Lit6YO95rKh5pyJ5Lu75L2V5Lmm562+55qE55uu5b2V44CCXG4gKiDpobbnuqfmoLnnm67lvZXvvIjkuabnrb7moI8v5YW25LuW5Lmm562+77yJ5LiN5ZyoIHNjYW4uZm9sZGVycyDkuK3vvIzlpKnnhLbkuI3kvJrooqvmuIXnkIbjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmRFbXB0eUZvbGRlcnMoc2NhbjogU2NhblJlc3VsdCk6IFNjYW5Gb2xkZXJbXSB7XG4gIGNvbnN0IHBhcmVudEJ5SWQgPSBuZXcgTWFwKHNjYW4uZm9sZGVycy5tYXAoKGZvbGRlcikgPT4gW2ZvbGRlci5pZCwgZm9sZGVyLnBhcmVudElkXSkpO1xuICBjb25zdCBub25FbXB0eUlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IGJvb2ttYXJrIG9mIHNjYW4uYm9va21hcmtzKSB7XG4gICAgbGV0IGlkOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBib29rbWFyay5wYXJlbnRJZDtcbiAgICB3aGlsZSAoaWQgIT09IHVuZGVmaW5lZCAmJiAhbm9uRW1wdHlJZHMuaGFzKGlkKSkge1xuICAgICAgbm9uRW1wdHlJZHMuYWRkKGlkKTtcbiAgICAgIGlkID0gcGFyZW50QnlJZC5nZXQoaWQpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc2Nhbi5mb2xkZXJzXG4gICAgLmZpbHRlcigoZm9sZGVyKSA9PiAhbm9uRW1wdHlJZHMuaGFzKGZvbGRlci5pZCkpXG4gICAgLnNvcnQoKGEsIGIpID0+IGIuZGVwdGggLSBhLmRlcHRoKTtcbn1cbiIsImltcG9ydCB7IGZpbmRFbXB0eUZvbGRlcnMgfSBmcm9tICcuLi9kb21haW4vYm9va21hcmtzL2VtcHR5Rm9sZGVycyc7XG5pbXBvcnQgeyBidWlsZFNjYW5SZXN1bHQgfSBmcm9tICcuLi9kb21haW4vYm9va21hcmtzL3RyZWUnO1xuaW1wb3J0IHR5cGUgeyBCb29rbWFya05vZGUgfSBmcm9tICcuLi9kb21haW4vYm9va21hcmtzL3R5cGVzJztcbmltcG9ydCB7IEFwcEVycm9yIH0gZnJvbSAnLi4vc2hhcmVkL2Vycm9ycyc7XG5pbXBvcnQgeyB0IH0gZnJvbSAnLi4vc2hhcmVkL2kxOG4nO1xuaW1wb3J0IHR5cGUgeyBTY2FuUmVzdWx0IH0gZnJvbSAnLi4vc2hhcmVkL3NjaGVtYXMnO1xuaW1wb3J0IHR5cGUgeyBCb29rbWFya3NQb3J0LCBTdG9yYWdlUG9ydCB9IGZyb20gJy4vcG9ydHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIERlbGV0ZUVtcHR5Rm9sZGVyc1Jlc3VsdCB7XG4gIHNjYW46IFNjYW5SZXN1bHQ7XG4gIGRlbGV0ZWRJZHM6IHN0cmluZ1tdO1xuICBmYWlsdXJlczogQXJyYXk8eyBmb2xkZXJJZDogc3RyaW5nOyBtZXNzYWdlOiBzdHJpbmcgfT47XG59XG5cbi8qKiDlrp7ml7bmo4Dmn6Xnm67lvZXlrZDmoJHlhoXmmK/lkKbku43mnInkuabnrb7vvIzpmLLmraLmiavmj4/nu5PmnpzooqvnlKjmiLfmiYvliqjmlLnliqjlkI7or6/liKDkuabnrb7jgIIgKi9cbmFzeW5jIGZ1bmN0aW9uIHN1YnRyZWVIYXNCb29rbWFya3MoYm9va21hcmtzOiBCb29rbWFya3NQb3J0LCBmb2xkZXJJZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGNvbnN0IHF1ZXVlOiBCb29rbWFya05vZGVbXSA9IGF3YWl0IGJvb2ttYXJrcy5nZXRDaGlsZHJlbihmb2xkZXJJZCk7XG4gIHdoaWxlIChxdWV1ZS5sZW5ndGgpIHtcbiAgICBjb25zdCBub2RlID0gcXVldWUuc2hpZnQoKSE7XG4gICAgaWYgKG5vZGUudXJsICE9PSB1bmRlZmluZWQpIHJldHVybiB0cnVlO1xuICAgIGlmIChub2RlLmNoaWxkcmVuKSBxdWV1ZS5wdXNoKC4uLm5vZGUuY2hpbGRyZW4pO1xuICAgIGVsc2UgcXVldWUucHVzaCguLi4oYXdhaXQgYm9va21hcmtzLmdldENoaWxkcmVuKG5vZGUuaWQpKSk7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKiog5Y+q5YWB6K645Yig6Zmk5pyA6L+R5LiA5qyh5omr5o+P5Lit6K+G5Yir5Ye655qE56m65paH5Lu25aS577yM5Yig6Zmk5ZCO6YeN5paw5omr5o+P5Lul5ZCM5q2l5oyB5LmF5YyW54q25oCB44CCICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGVsZXRlRW1wdHlGb2xkZXJzKFxuICBkZXBzOiB7IGJvb2ttYXJrczogQm9va21hcmtzUG9ydDsgc3RvcmFnZTogU3RvcmFnZVBvcnQ7IG5vdz86ICgpID0+IG51bWJlcjsgbmV3SWQ/OiAoKSA9PiBzdHJpbmcgfSxcbiAgZm9sZGVySWRzOiBzdHJpbmdbXSxcbik6IFByb21pc2U8RGVsZXRlRW1wdHlGb2xkZXJzUmVzdWx0PiB7XG4gIGNvbnN0IHByZXZpb3VzID0gYXdhaXQgZGVwcy5zdG9yYWdlLmxvYWRTY2FuKCk7XG4gIGlmICghcHJldmlvdXMpIHRocm93IG5ldyBBcHBFcnJvcigndmFsaWRhdGlvbicsICdlcnJvcnMubm9TY2FuJyk7XG5cbiAgY29uc3QgaWRzID0gWy4uLm5ldyBTZXQoZm9sZGVySWRzKV07XG4gIGNvbnN0IGVtcHR5Rm9sZGVySWRzID0gbmV3IFNldChmaW5kRW1wdHlGb2xkZXJzKHByZXZpb3VzKS5tYXAoKGZvbGRlcikgPT4gZm9sZGVyLmlkKSk7XG4gIGlmIChpZHMuc29tZSgoaWQpID0+ICFlbXB0eUZvbGRlcklkcy5oYXMoaWQpKSkge1xuICAgIHRocm93IG5ldyBBcHBFcnJvcigndmFsaWRhdGlvbicsICdlcnJvcnMubm90U2Nhbm5lZEVtcHR5Rm9sZGVyJyk7XG4gIH1cblxuICBjb25zdCBkZXB0aEJ5SWQgPSBuZXcgTWFwKHByZXZpb3VzLmZvbGRlcnMubWFwKChmb2xkZXIpID0+IFtmb2xkZXIuaWQsIGZvbGRlci5kZXB0aF0pKTtcbiAgLy8g5YWI5Yig5rex5bGC77ya54i255uu5b2V5Yig6Zmk5ZCO77yM5YW25Lit55qE56m65a2Q55uu5b2V6IqC54K55bey5LiN5a2Y5Zyo77yM5ZCO57ut6L+t5Luj6Ieq5Yqo6Lez6L+HXG4gIGNvbnN0IG9yZGVyZWQgPSBbLi4uaWRzXS5zb3J0KChhLCBiKSA9PiAoZGVwdGhCeUlkLmdldChiKSA/PyAwKSAtIChkZXB0aEJ5SWQuZ2V0KGEpID8/IDApKTtcblxuICBjb25zdCBkZWxldGVkSWRzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCBmYWlsdXJlczogQXJyYXk8eyBmb2xkZXJJZDogc3RyaW5nOyBtZXNzYWdlOiBzdHJpbmcgfT4gPSBbXTtcbiAgZm9yIChjb25zdCBpZCBvZiBvcmRlcmVkKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG5vZGUgPSBhd2FpdCBkZXBzLmJvb2ttYXJrcy5nZXQoaWQpO1xuICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgIC8vIOiKgueCueW3sumaj+eItuebruW9leS4gOW5tuWIoOmZpFxuICAgICAgICBkZWxldGVkSWRzLnB1c2goaWQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChhd2FpdCBzdWJ0cmVlSGFzQm9va21hcmtzKGRlcHMuYm9va21hcmtzLCBpZCkpIHtcbiAgICAgICAgZmFpbHVyZXMucHVzaCh7IGZvbGRlcklkOiBpZCwgbWVzc2FnZTogdCgnZXJyb3JzLmZvbGRlckFscmVhZHlIYXNCb29rbWFya3MnKSB9KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBhd2FpdCBkZXBzLmJvb2ttYXJrcy5yZW1vdmVUcmVlKGlkKTtcbiAgICAgIGRlbGV0ZWRJZHMucHVzaChpZCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGZhaWx1cmVzLnB1c2goe1xuICAgICAgICBmb2xkZXJJZDogaWQsXG4gICAgICAgIG1lc3NhZ2U6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogdCgnZXJyb3JzLmRlbGV0ZUZhaWxlZCcpLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgdHJlZSA9IGF3YWl0IGRlcHMuYm9va21hcmtzLmdldFRyZWUoKTtcbiAgY29uc3Qgc2NhbiA9IGJ1aWxkU2NhblJlc3VsdChcbiAgICB0cmVlLFxuICAgIChkZXBzLm5ld0lkID8/ICgoKSA9PiBjcnlwdG8ucmFuZG9tVVVJRCgpKSkoKSxcbiAgICAoZGVwcy5ub3cgPz8gKCgpID0+IERhdGUubm93KCkpKSgpLFxuICApO1xuICBhd2FpdCBkZXBzLnN0b3JhZ2Uuc2F2ZVNjYW4oc2Nhbik7XG4gIHJldHVybiB7IHNjYW4sIGRlbGV0ZWRJZHMsIGZhaWx1cmVzIH07XG59XG4iLCJpbXBvcnQgdHlwZSB7IEJvb2ttYXJrc1BvcnQgfSBmcm9tICcuLi8uLi9hcHBsaWNhdGlvbi9wb3J0cyc7XG5pbXBvcnQgdHlwZSB7IEJvb2ttYXJrTm9kZSB9IGZyb20gJy4uLy4uL2RvbWFpbi9ib29rbWFya3MvdHlwZXMnO1xuXG4vKiogY2hyb21lLmJvb2ttYXJrcyDnmoTpgILphY3lrp7njrDjgIIgKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVCb29rbWFya3NSZXBvc2l0b3J5KCk6IEJvb2ttYXJrc1BvcnQge1xuICByZXR1cm4ge1xuICAgIGFzeW5jIGdldFRyZWUoKSB7XG4gICAgICBjb25zdCB0cmVlID0gYXdhaXQgY2hyb21lLmJvb2ttYXJrcy5nZXRUcmVlKCk7XG4gICAgICByZXR1cm4gdHJlZSBhcyB1bmtub3duIGFzIEJvb2ttYXJrTm9kZVtdO1xuICAgIH0sXG5cbiAgICBhc3luYyBnZXQoaWQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IG5vZGVzID0gYXdhaXQgY2hyb21lLmJvb2ttYXJrcy5nZXQoaWQpO1xuICAgICAgICByZXR1cm4gKG5vZGVzWzBdIGFzIHVua25vd24gYXMgQm9va21hcmtOb2RlKSA/PyB1bmRlZmluZWQ7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgYXN5bmMgZ2V0Q2hpbGRyZW4ocGFyZW50SWQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgY2hyb21lLmJvb2ttYXJrcy5nZXRDaGlsZHJlbihwYXJlbnRJZCk7XG4gICAgICAgIHJldHVybiBjaGlsZHJlbiBhcyB1bmtub3duIGFzIEJvb2ttYXJrTm9kZVtdO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgYXN5bmMgY3JlYXRlRm9sZGVyKHBhcmVudElkLCB0aXRsZSwgaW5kZXgpIHtcbiAgICAgIGNvbnN0IG5vZGUgPSBhd2FpdCBjaHJvbWUuYm9va21hcmtzLmNyZWF0ZSh7IHBhcmVudElkLCB0aXRsZSwgaW5kZXggfSk7XG4gICAgICByZXR1cm4geyBpZDogbm9kZS5pZCB9O1xuICAgIH0sXG5cbiAgICBhc3luYyBtb3ZlKGlkLCBkZXN0aW5hdGlvbikge1xuICAgICAgYXdhaXQgY2hyb21lLmJvb2ttYXJrcy5tb3ZlKGlkLCBkZXN0aW5hdGlvbik7XG4gICAgfSxcblxuICAgIGFzeW5jIHJlbW92ZShpZCkge1xuICAgICAgYXdhaXQgY2hyb21lLmJvb2ttYXJrcy5yZW1vdmUoaWQpO1xuICAgIH0sXG5cbiAgICBhc3luYyByZW1vdmVUcmVlKGlkKSB7XG4gICAgICBhd2FpdCBjaHJvbWUuYm9va21hcmtzLnJlbW92ZVRyZWUoaWQpO1xuICAgIH0sXG4gIH07XG59XG4iLCJleHBvcnQgdmFyIHV0aWw7XG4oZnVuY3Rpb24gKHV0aWwpIHtcbiAgICB1dGlsLmFzc2VydEVxdWFsID0gKF8pID0+IHsgfTtcbiAgICBmdW5jdGlvbiBhc3NlcnRJcyhfYXJnKSB7IH1cbiAgICB1dGlsLmFzc2VydElzID0gYXNzZXJ0SXM7XG4gICAgZnVuY3Rpb24gYXNzZXJ0TmV2ZXIoX3gpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCk7XG4gICAgfVxuICAgIHV0aWwuYXNzZXJ0TmV2ZXIgPSBhc3NlcnROZXZlcjtcbiAgICB1dGlsLmFycmF5VG9FbnVtID0gKGl0ZW1zKSA9PiB7XG4gICAgICAgIGNvbnN0IG9iaiA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcbiAgICAgICAgICAgIG9ialtpdGVtXSA9IGl0ZW07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG9iajtcbiAgICB9O1xuICAgIHV0aWwuZ2V0VmFsaWRFbnVtVmFsdWVzID0gKG9iaikgPT4ge1xuICAgICAgICBjb25zdCB2YWxpZEtleXMgPSB1dGlsLm9iamVjdEtleXMob2JqKS5maWx0ZXIoKGspID0+IHR5cGVvZiBvYmpbb2JqW2tdXSAhPT0gXCJudW1iZXJcIik7XG4gICAgICAgIGNvbnN0IGZpbHRlcmVkID0ge307XG4gICAgICAgIGZvciAoY29uc3QgayBvZiB2YWxpZEtleXMpIHtcbiAgICAgICAgICAgIGZpbHRlcmVkW2tdID0gb2JqW2tdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1dGlsLm9iamVjdFZhbHVlcyhmaWx0ZXJlZCk7XG4gICAgfTtcbiAgICB1dGlsLm9iamVjdFZhbHVlcyA9IChvYmopID0+IHtcbiAgICAgICAgcmV0dXJuIHV0aWwub2JqZWN0S2V5cyhvYmopLm1hcChmdW5jdGlvbiAoZSkge1xuICAgICAgICAgICAgcmV0dXJuIG9ialtlXTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICB1dGlsLm9iamVjdEtleXMgPSB0eXBlb2YgT2JqZWN0LmtleXMgPT09IFwiZnVuY3Rpb25cIiAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIGJhbi9iYW5cbiAgICAgICAgPyAob2JqKSA9PiBPYmplY3Qua2V5cyhvYmopIC8vIGVzbGludC1kaXNhYmxlLWxpbmUgYmFuL2JhblxuICAgICAgICA6IChvYmplY3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGtleXMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgICAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCBrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgIGtleXMucHVzaChrZXkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBrZXlzO1xuICAgICAgICB9O1xuICAgIHV0aWwuZmluZCA9IChhcnIsIGNoZWNrZXIpID0+IHtcbiAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGFycikge1xuICAgICAgICAgICAgaWYgKGNoZWNrZXIoaXRlbSkpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGl0ZW07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9O1xuICAgIHV0aWwuaXNJbnRlZ2VyID0gdHlwZW9mIE51bWJlci5pc0ludGVnZXIgPT09IFwiZnVuY3Rpb25cIlxuICAgICAgICA/ICh2YWwpID0+IE51bWJlci5pc0ludGVnZXIodmFsKSAvLyBlc2xpbnQtZGlzYWJsZS1saW5lIGJhbi9iYW5cbiAgICAgICAgOiAodmFsKSA9PiB0eXBlb2YgdmFsID09PSBcIm51bWJlclwiICYmIE51bWJlci5pc0Zpbml0ZSh2YWwpICYmIE1hdGguZmxvb3IodmFsKSA9PT0gdmFsO1xuICAgIGZ1bmN0aW9uIGpvaW5WYWx1ZXMoYXJyYXksIHNlcGFyYXRvciA9IFwiIHwgXCIpIHtcbiAgICAgICAgcmV0dXJuIGFycmF5Lm1hcCgodmFsKSA9PiAodHlwZW9mIHZhbCA9PT0gXCJzdHJpbmdcIiA/IGAnJHt2YWx9J2AgOiB2YWwpKS5qb2luKHNlcGFyYXRvcik7XG4gICAgfVxuICAgIHV0aWwuam9pblZhbHVlcyA9IGpvaW5WYWx1ZXM7XG4gICAgdXRpbC5qc29uU3RyaW5naWZ5UmVwbGFjZXIgPSAoXywgdmFsdWUpID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJiaWdpbnRcIikge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnRvU3RyaW5nKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH07XG59KSh1dGlsIHx8ICh1dGlsID0ge30pKTtcbmV4cG9ydCB2YXIgb2JqZWN0VXRpbDtcbihmdW5jdGlvbiAob2JqZWN0VXRpbCkge1xuICAgIG9iamVjdFV0aWwubWVyZ2VTaGFwZXMgPSAoZmlyc3QsIHNlY29uZCkgPT4ge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uZmlyc3QsXG4gICAgICAgICAgICAuLi5zZWNvbmQsIC8vIHNlY29uZCBvdmVyd3JpdGVzIGZpcnN0XG4gICAgICAgIH07XG4gICAgfTtcbn0pKG9iamVjdFV0aWwgfHwgKG9iamVjdFV0aWwgPSB7fSkpO1xuZXhwb3J0IGNvbnN0IFpvZFBhcnNlZFR5cGUgPSB1dGlsLmFycmF5VG9FbnVtKFtcbiAgICBcInN0cmluZ1wiLFxuICAgIFwibmFuXCIsXG4gICAgXCJudW1iZXJcIixcbiAgICBcImludGVnZXJcIixcbiAgICBcImZsb2F0XCIsXG4gICAgXCJib29sZWFuXCIsXG4gICAgXCJkYXRlXCIsXG4gICAgXCJiaWdpbnRcIixcbiAgICBcInN5bWJvbFwiLFxuICAgIFwiZnVuY3Rpb25cIixcbiAgICBcInVuZGVmaW5lZFwiLFxuICAgIFwibnVsbFwiLFxuICAgIFwiYXJyYXlcIixcbiAgICBcIm9iamVjdFwiLFxuICAgIFwidW5rbm93blwiLFxuICAgIFwicHJvbWlzZVwiLFxuICAgIFwidm9pZFwiLFxuICAgIFwibmV2ZXJcIixcbiAgICBcIm1hcFwiLFxuICAgIFwic2V0XCIsXG5dKTtcbmV4cG9ydCBjb25zdCBnZXRQYXJzZWRUeXBlID0gKGRhdGEpID0+IHtcbiAgICBjb25zdCB0ID0gdHlwZW9mIGRhdGE7XG4gICAgc3dpdGNoICh0KSB7XG4gICAgICAgIGNhc2UgXCJ1bmRlZmluZWRcIjpcbiAgICAgICAgICAgIHJldHVybiBab2RQYXJzZWRUeXBlLnVuZGVmaW5lZDtcbiAgICAgICAgY2FzZSBcInN0cmluZ1wiOlxuICAgICAgICAgICAgcmV0dXJuIFpvZFBhcnNlZFR5cGUuc3RyaW5nO1xuICAgICAgICBjYXNlIFwibnVtYmVyXCI6XG4gICAgICAgICAgICByZXR1cm4gTnVtYmVyLmlzTmFOKGRhdGEpID8gWm9kUGFyc2VkVHlwZS5uYW4gOiBab2RQYXJzZWRUeXBlLm51bWJlcjtcbiAgICAgICAgY2FzZSBcImJvb2xlYW5cIjpcbiAgICAgICAgICAgIHJldHVybiBab2RQYXJzZWRUeXBlLmJvb2xlYW47XG4gICAgICAgIGNhc2UgXCJmdW5jdGlvblwiOlxuICAgICAgICAgICAgcmV0dXJuIFpvZFBhcnNlZFR5cGUuZnVuY3Rpb247XG4gICAgICAgIGNhc2UgXCJiaWdpbnRcIjpcbiAgICAgICAgICAgIHJldHVybiBab2RQYXJzZWRUeXBlLmJpZ2ludDtcbiAgICAgICAgY2FzZSBcInN5bWJvbFwiOlxuICAgICAgICAgICAgcmV0dXJuIFpvZFBhcnNlZFR5cGUuc3ltYm9sO1xuICAgICAgICBjYXNlIFwib2JqZWN0XCI6XG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBab2RQYXJzZWRUeXBlLmFycmF5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGRhdGEgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gWm9kUGFyc2VkVHlwZS5udWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGRhdGEudGhlbiAmJiB0eXBlb2YgZGF0YS50aGVuID09PSBcImZ1bmN0aW9uXCIgJiYgZGF0YS5jYXRjaCAmJiB0eXBlb2YgZGF0YS5jYXRjaCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFpvZFBhcnNlZFR5cGUucHJvbWlzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0eXBlb2YgTWFwICE9PSBcInVuZGVmaW5lZFwiICYmIGRhdGEgaW5zdGFuY2VvZiBNYXApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gWm9kUGFyc2VkVHlwZS5tYXA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZW9mIFNldCAhPT0gXCJ1bmRlZmluZWRcIiAmJiBkYXRhIGluc3RhbmNlb2YgU2V0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFpvZFBhcnNlZFR5cGUuc2V0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHR5cGVvZiBEYXRlICE9PSBcInVuZGVmaW5lZFwiICYmIGRhdGEgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFpvZFBhcnNlZFR5cGUuZGF0ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBab2RQYXJzZWRUeXBlLm9iamVjdDtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiBab2RQYXJzZWRUeXBlLnVua25vd247XG4gICAgfVxufTtcbiIsImltcG9ydCB7IHV0aWwgfSBmcm9tIFwiLi9oZWxwZXJzL3V0aWwuanNcIjtcbmV4cG9ydCBjb25zdCBab2RJc3N1ZUNvZGUgPSB1dGlsLmFycmF5VG9FbnVtKFtcbiAgICBcImludmFsaWRfdHlwZVwiLFxuICAgIFwiaW52YWxpZF9saXRlcmFsXCIsXG4gICAgXCJjdXN0b21cIixcbiAgICBcImludmFsaWRfdW5pb25cIixcbiAgICBcImludmFsaWRfdW5pb25fZGlzY3JpbWluYXRvclwiLFxuICAgIFwiaW52YWxpZF9lbnVtX3ZhbHVlXCIsXG4gICAgXCJ1bnJlY29nbml6ZWRfa2V5c1wiLFxuICAgIFwiaW52YWxpZF9hcmd1bWVudHNcIixcbiAgICBcImludmFsaWRfcmV0dXJuX3R5cGVcIixcbiAgICBcImludmFsaWRfZGF0ZVwiLFxuICAgIFwiaW52YWxpZF9zdHJpbmdcIixcbiAgICBcInRvb19zbWFsbFwiLFxuICAgIFwidG9vX2JpZ1wiLFxuICAgIFwiaW52YWxpZF9pbnRlcnNlY3Rpb25fdHlwZXNcIixcbiAgICBcIm5vdF9tdWx0aXBsZV9vZlwiLFxuICAgIFwibm90X2Zpbml0ZVwiLFxuXSk7XG5leHBvcnQgY29uc3QgcXVvdGVsZXNzSnNvbiA9IChvYmopID0+IHtcbiAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkob2JqLCBudWxsLCAyKTtcbiAgICByZXR1cm4ganNvbi5yZXBsYWNlKC9cIihbXlwiXSspXCI6L2csIFwiJDE6XCIpO1xufTtcbmV4cG9ydCBjbGFzcyBab2RFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgICBnZXQgZXJyb3JzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5pc3N1ZXM7XG4gICAgfVxuICAgIGNvbnN0cnVjdG9yKGlzc3Vlcykge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICB0aGlzLmlzc3VlcyA9IFtdO1xuICAgICAgICB0aGlzLmFkZElzc3VlID0gKHN1YikgPT4ge1xuICAgICAgICAgICAgdGhpcy5pc3N1ZXMgPSBbLi4udGhpcy5pc3N1ZXMsIHN1Yl07XG4gICAgICAgIH07XG4gICAgICAgIHRoaXMuYWRkSXNzdWVzID0gKHN1YnMgPSBbXSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5pc3N1ZXMgPSBbLi4udGhpcy5pc3N1ZXMsIC4uLnN1YnNdO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBhY3R1YWxQcm90byA9IG5ldy50YXJnZXQucHJvdG90eXBlO1xuICAgICAgICBpZiAoT2JqZWN0LnNldFByb3RvdHlwZU9mKSB7XG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgYmFuL2JhblxuICAgICAgICAgICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKHRoaXMsIGFjdHVhbFByb3RvKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX19wcm90b19fID0gYWN0dWFsUHJvdG87XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5uYW1lID0gXCJab2RFcnJvclwiO1xuICAgICAgICB0aGlzLmlzc3VlcyA9IGlzc3VlcztcbiAgICB9XG4gICAgZm9ybWF0KF9tYXBwZXIpIHtcbiAgICAgICAgY29uc3QgbWFwcGVyID0gX21hcHBlciB8fFxuICAgICAgICAgICAgZnVuY3Rpb24gKGlzc3VlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGlzc3VlLm1lc3NhZ2U7XG4gICAgICAgICAgICB9O1xuICAgICAgICBjb25zdCBmaWVsZEVycm9ycyA9IHsgX2Vycm9yczogW10gfTtcbiAgICAgICAgY29uc3QgcHJvY2Vzc0Vycm9yID0gKGVycm9yKSA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGlzc3VlIG9mIGVycm9yLmlzc3Vlcykge1xuICAgICAgICAgICAgICAgIGlmIChpc3N1ZS5jb2RlID09PSBcImludmFsaWRfdW5pb25cIikge1xuICAgICAgICAgICAgICAgICAgICBpc3N1ZS51bmlvbkVycm9ycy5tYXAocHJvY2Vzc0Vycm9yKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoaXNzdWUuY29kZSA9PT0gXCJpbnZhbGlkX3JldHVybl90eXBlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJvY2Vzc0Vycm9yKGlzc3VlLnJldHVyblR5cGVFcnJvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGlzc3VlLmNvZGUgPT09IFwiaW52YWxpZF9hcmd1bWVudHNcIikge1xuICAgICAgICAgICAgICAgICAgICBwcm9jZXNzRXJyb3IoaXNzdWUuYXJndW1lbnRzRXJyb3IpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChpc3N1ZS5wYXRoLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBmaWVsZEVycm9ycy5fZXJyb3JzLnB1c2gobWFwcGVyKGlzc3VlKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBsZXQgY3VyciA9IGZpZWxkRXJyb3JzO1xuICAgICAgICAgICAgICAgICAgICBsZXQgaSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIHdoaWxlIChpIDwgaXNzdWUucGF0aC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGVsID0gaXNzdWUucGF0aFtpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHRlcm1pbmFsID0gaSA9PT0gaXNzdWUucGF0aC5sZW5ndGggLSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF0ZXJtaW5hbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJbZWxdID0gY3VycltlbF0gfHwgeyBfZXJyb3JzOiBbXSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmICh0eXBlb2YgZWwgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgIGN1cnJbZWxdID0gY3VycltlbF0gfHwgeyBfZXJyb3JzOiBbXSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIH0gZWxzZSBpZiAodHlwZW9mIGVsID09PSBcIm51bWJlclwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICBjb25zdCBlcnJvckFycmF5OiBhbnkgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgIGVycm9yQXJyYXkuX2Vycm9ycyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgY3VycltlbF0gPSBjdXJyW2VsXSB8fCBlcnJvckFycmF5O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJbZWxdID0gY3VycltlbF0gfHwgeyBfZXJyb3JzOiBbXSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJbZWxdLl9lcnJvcnMucHVzaChtYXBwZXIoaXNzdWUpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnIgPSBjdXJyW2VsXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGkrKztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcHJvY2Vzc0Vycm9yKHRoaXMpO1xuICAgICAgICByZXR1cm4gZmllbGRFcnJvcnM7XG4gICAgfVxuICAgIHN0YXRpYyBhc3NlcnQodmFsdWUpIHtcbiAgICAgICAgaWYgKCEodmFsdWUgaW5zdGFuY2VvZiBab2RFcnJvcikpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTm90IGEgWm9kRXJyb3I6ICR7dmFsdWV9YCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm1lc3NhZ2U7XG4gICAgfVxuICAgIGdldCBtZXNzYWdlKCkge1xuICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodGhpcy5pc3N1ZXMsIHV0aWwuanNvblN0cmluZ2lmeVJlcGxhY2VyLCAyKTtcbiAgICB9XG4gICAgZ2V0IGlzRW1wdHkoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmlzc3Vlcy5sZW5ndGggPT09IDA7XG4gICAgfVxuICAgIGZsYXR0ZW4obWFwcGVyID0gKGlzc3VlKSA9PiBpc3N1ZS5tZXNzYWdlKSB7XG4gICAgICAgIGNvbnN0IGZpZWxkRXJyb3JzID0ge307XG4gICAgICAgIGNvbnN0IGZvcm1FcnJvcnMgPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBzdWIgb2YgdGhpcy5pc3N1ZXMpIHtcbiAgICAgICAgICAgIGlmIChzdWIucGF0aC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlyc3RFbCA9IHN1Yi5wYXRoWzBdO1xuICAgICAgICAgICAgICAgIGZpZWxkRXJyb3JzW2ZpcnN0RWxdID0gZmllbGRFcnJvcnNbZmlyc3RFbF0gfHwgW107XG4gICAgICAgICAgICAgICAgZmllbGRFcnJvcnNbZmlyc3RFbF0ucHVzaChtYXBwZXIoc3ViKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBmb3JtRXJyb3JzLnB1c2gobWFwcGVyKHN1YikpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IGZvcm1FcnJvcnMsIGZpZWxkRXJyb3JzIH07XG4gICAgfVxuICAgIGdldCBmb3JtRXJyb3JzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5mbGF0dGVuKCk7XG4gICAgfVxufVxuWm9kRXJyb3IuY3JlYXRlID0gKGlzc3VlcykgPT4ge1xuICAgIGNvbnN0IGVycm9yID0gbmV3IFpvZEVycm9yKGlzc3Vlcyk7XG4gICAgcmV0dXJuIGVycm9yO1xufTtcbiIsImltcG9ydCB7IFpvZElzc3VlQ29kZSB9IGZyb20gXCIuLi9ab2RFcnJvci5qc1wiO1xuaW1wb3J0IHsgdXRpbCwgWm9kUGFyc2VkVHlwZSB9IGZyb20gXCIuLi9oZWxwZXJzL3V0aWwuanNcIjtcbmNvbnN0IGVycm9yTWFwID0gKGlzc3VlLCBfY3R4KSA9PiB7XG4gICAgbGV0IG1lc3NhZ2U7XG4gICAgc3dpdGNoIChpc3N1ZS5jb2RlKSB7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZTpcbiAgICAgICAgICAgIGlmIChpc3N1ZS5yZWNlaXZlZCA9PT0gWm9kUGFyc2VkVHlwZS51bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gXCJSZXF1aXJlZFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IGBFeHBlY3RlZCAke2lzc3VlLmV4cGVjdGVkfSwgcmVjZWl2ZWQgJHtpc3N1ZS5yZWNlaXZlZH1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLmludmFsaWRfbGl0ZXJhbDpcbiAgICAgICAgICAgIG1lc3NhZ2UgPSBgSW52YWxpZCBsaXRlcmFsIHZhbHVlLCBleHBlY3RlZCAke0pTT04uc3RyaW5naWZ5KGlzc3VlLmV4cGVjdGVkLCB1dGlsLmpzb25TdHJpbmdpZnlSZXBsYWNlcil9YDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS51bnJlY29nbml6ZWRfa2V5czpcbiAgICAgICAgICAgIG1lc3NhZ2UgPSBgVW5yZWNvZ25pemVkIGtleShzKSBpbiBvYmplY3Q6ICR7dXRpbC5qb2luVmFsdWVzKGlzc3VlLmtleXMsIFwiLCBcIil9YDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS5pbnZhbGlkX3VuaW9uOlxuICAgICAgICAgICAgbWVzc2FnZSA9IGBJbnZhbGlkIGlucHV0YDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS5pbnZhbGlkX3VuaW9uX2Rpc2NyaW1pbmF0b3I6XG4gICAgICAgICAgICBtZXNzYWdlID0gYEludmFsaWQgZGlzY3JpbWluYXRvciB2YWx1ZS4gRXhwZWN0ZWQgJHt1dGlsLmpvaW5WYWx1ZXMoaXNzdWUub3B0aW9ucyl9YDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS5pbnZhbGlkX2VudW1fdmFsdWU6XG4gICAgICAgICAgICBtZXNzYWdlID0gYEludmFsaWQgZW51bSB2YWx1ZS4gRXhwZWN0ZWQgJHt1dGlsLmpvaW5WYWx1ZXMoaXNzdWUub3B0aW9ucyl9LCByZWNlaXZlZCAnJHtpc3N1ZS5yZWNlaXZlZH0nYDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS5pbnZhbGlkX2FyZ3VtZW50czpcbiAgICAgICAgICAgIG1lc3NhZ2UgPSBgSW52YWxpZCBmdW5jdGlvbiBhcmd1bWVudHNgO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLmludmFsaWRfcmV0dXJuX3R5cGU6XG4gICAgICAgICAgICBtZXNzYWdlID0gYEludmFsaWQgZnVuY3Rpb24gcmV0dXJuIHR5cGVgO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLmludmFsaWRfZGF0ZTpcbiAgICAgICAgICAgIG1lc3NhZ2UgPSBgSW52YWxpZCBkYXRlYDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZzpcbiAgICAgICAgICAgIGlmICh0eXBlb2YgaXNzdWUudmFsaWRhdGlvbiA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgIGlmIChcImluY2x1ZGVzXCIgaW4gaXNzdWUudmFsaWRhdGlvbikge1xuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlID0gYEludmFsaWQgaW5wdXQ6IG11c3QgaW5jbHVkZSBcIiR7aXNzdWUudmFsaWRhdGlvbi5pbmNsdWRlc31cImA7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaXNzdWUudmFsaWRhdGlvbi5wb3NpdGlvbiA9PT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZSA9IGAke21lc3NhZ2V9IGF0IG9uZSBvciBtb3JlIHBvc2l0aW9ucyBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gJHtpc3N1ZS52YWxpZGF0aW9uLnBvc2l0aW9ufWA7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoXCJzdGFydHNXaXRoXCIgaW4gaXNzdWUudmFsaWRhdGlvbikge1xuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlID0gYEludmFsaWQgaW5wdXQ6IG11c3Qgc3RhcnQgd2l0aCBcIiR7aXNzdWUudmFsaWRhdGlvbi5zdGFydHNXaXRofVwiYDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoXCJlbmRzV2l0aFwiIGluIGlzc3VlLnZhbGlkYXRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZSA9IGBJbnZhbGlkIGlucHV0OiBtdXN0IGVuZCB3aXRoIFwiJHtpc3N1ZS52YWxpZGF0aW9uLmVuZHNXaXRofVwiYDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHV0aWwuYXNzZXJ0TmV2ZXIoaXNzdWUudmFsaWRhdGlvbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoaXNzdWUudmFsaWRhdGlvbiAhPT0gXCJyZWdleFwiKSB7XG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IGBJbnZhbGlkICR7aXNzdWUudmFsaWRhdGlvbn1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IFwiSW52YWxpZFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLnRvb19zbWFsbDpcbiAgICAgICAgICAgIGlmIChpc3N1ZS50eXBlID09PSBcImFycmF5XCIpXG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IGBBcnJheSBtdXN0IGNvbnRhaW4gJHtpc3N1ZS5leGFjdCA/IFwiZXhhY3RseVwiIDogaXNzdWUuaW5jbHVzaXZlID8gYGF0IGxlYXN0YCA6IGBtb3JlIHRoYW5gfSAke2lzc3VlLm1pbmltdW19IGVsZW1lbnQocylgO1xuICAgICAgICAgICAgZWxzZSBpZiAoaXNzdWUudHlwZSA9PT0gXCJzdHJpbmdcIilcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gYFN0cmluZyBtdXN0IGNvbnRhaW4gJHtpc3N1ZS5leGFjdCA/IFwiZXhhY3RseVwiIDogaXNzdWUuaW5jbHVzaXZlID8gYGF0IGxlYXN0YCA6IGBvdmVyYH0gJHtpc3N1ZS5taW5pbXVtfSBjaGFyYWN0ZXIocylgO1xuICAgICAgICAgICAgZWxzZSBpZiAoaXNzdWUudHlwZSA9PT0gXCJudW1iZXJcIilcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gYE51bWJlciBtdXN0IGJlICR7aXNzdWUuZXhhY3QgPyBgZXhhY3RseSBlcXVhbCB0byBgIDogaXNzdWUuaW5jbHVzaXZlID8gYGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byBgIDogYGdyZWF0ZXIgdGhhbiBgfSR7aXNzdWUubWluaW11bX1gO1xuICAgICAgICAgICAgZWxzZSBpZiAoaXNzdWUudHlwZSA9PT0gXCJiaWdpbnRcIilcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gYE51bWJlciBtdXN0IGJlICR7aXNzdWUuZXhhY3QgPyBgZXhhY3RseSBlcXVhbCB0byBgIDogaXNzdWUuaW5jbHVzaXZlID8gYGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byBgIDogYGdyZWF0ZXIgdGhhbiBgfSR7aXNzdWUubWluaW11bX1gO1xuICAgICAgICAgICAgZWxzZSBpZiAoaXNzdWUudHlwZSA9PT0gXCJkYXRlXCIpXG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IGBEYXRlIG11c3QgYmUgJHtpc3N1ZS5leGFjdCA/IGBleGFjdGx5IGVxdWFsIHRvIGAgOiBpc3N1ZS5pbmNsdXNpdmUgPyBgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIGAgOiBgZ3JlYXRlciB0aGFuIGB9JHtuZXcgRGF0ZShOdW1iZXIoaXNzdWUubWluaW11bSkpfWA7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IFwiSW52YWxpZCBpbnB1dFwiO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLnRvb19iaWc6XG4gICAgICAgICAgICBpZiAoaXNzdWUudHlwZSA9PT0gXCJhcnJheVwiKVxuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgQXJyYXkgbXVzdCBjb250YWluICR7aXNzdWUuZXhhY3QgPyBgZXhhY3RseWAgOiBpc3N1ZS5pbmNsdXNpdmUgPyBgYXQgbW9zdGAgOiBgbGVzcyB0aGFuYH0gJHtpc3N1ZS5tYXhpbXVtfSBlbGVtZW50KHMpYDtcbiAgICAgICAgICAgIGVsc2UgaWYgKGlzc3VlLnR5cGUgPT09IFwic3RyaW5nXCIpXG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IGBTdHJpbmcgbXVzdCBjb250YWluICR7aXNzdWUuZXhhY3QgPyBgZXhhY3RseWAgOiBpc3N1ZS5pbmNsdXNpdmUgPyBgYXQgbW9zdGAgOiBgdW5kZXJgfSAke2lzc3VlLm1heGltdW19IGNoYXJhY3RlcihzKWA7XG4gICAgICAgICAgICBlbHNlIGlmIChpc3N1ZS50eXBlID09PSBcIm51bWJlclwiKVxuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgTnVtYmVyIG11c3QgYmUgJHtpc3N1ZS5leGFjdCA/IGBleGFjdGx5YCA6IGlzc3VlLmluY2x1c2l2ZSA/IGBsZXNzIHRoYW4gb3IgZXF1YWwgdG9gIDogYGxlc3MgdGhhbmB9ICR7aXNzdWUubWF4aW11bX1gO1xuICAgICAgICAgICAgZWxzZSBpZiAoaXNzdWUudHlwZSA9PT0gXCJiaWdpbnRcIilcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gYEJpZ0ludCBtdXN0IGJlICR7aXNzdWUuZXhhY3QgPyBgZXhhY3RseWAgOiBpc3N1ZS5pbmNsdXNpdmUgPyBgbGVzcyB0aGFuIG9yIGVxdWFsIHRvYCA6IGBsZXNzIHRoYW5gfSAke2lzc3VlLm1heGltdW19YDtcbiAgICAgICAgICAgIGVsc2UgaWYgKGlzc3VlLnR5cGUgPT09IFwiZGF0ZVwiKVxuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgRGF0ZSBtdXN0IGJlICR7aXNzdWUuZXhhY3QgPyBgZXhhY3RseWAgOiBpc3N1ZS5pbmNsdXNpdmUgPyBgc21hbGxlciB0aGFuIG9yIGVxdWFsIHRvYCA6IGBzbWFsbGVyIHRoYW5gfSAke25ldyBEYXRlKE51bWJlcihpc3N1ZS5tYXhpbXVtKSl9YDtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gXCJJbnZhbGlkIGlucHV0XCI7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUuY3VzdG9tOlxuICAgICAgICAgICAgbWVzc2FnZSA9IGBJbnZhbGlkIGlucHV0YDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS5pbnZhbGlkX2ludGVyc2VjdGlvbl90eXBlczpcbiAgICAgICAgICAgIG1lc3NhZ2UgPSBgSW50ZXJzZWN0aW9uIHJlc3VsdHMgY291bGQgbm90IGJlIG1lcmdlZGA7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUubm90X211bHRpcGxlX29mOlxuICAgICAgICAgICAgbWVzc2FnZSA9IGBOdW1iZXIgbXVzdCBiZSBhIG11bHRpcGxlIG9mICR7aXNzdWUubXVsdGlwbGVPZn1gO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLm5vdF9maW5pdGU6XG4gICAgICAgICAgICBtZXNzYWdlID0gXCJOdW1iZXIgbXVzdCBiZSBmaW5pdGVcIjtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgbWVzc2FnZSA9IF9jdHguZGVmYXVsdEVycm9yO1xuICAgICAgICAgICAgdXRpbC5hc3NlcnROZXZlcihpc3N1ZSk7XG4gICAgfVxuICAgIHJldHVybiB7IG1lc3NhZ2UgfTtcbn07XG5leHBvcnQgZGVmYXVsdCBlcnJvck1hcDtcbiIsImltcG9ydCBkZWZhdWx0RXJyb3JNYXAgZnJvbSBcIi4vbG9jYWxlcy9lbi5qc1wiO1xubGV0IG92ZXJyaWRlRXJyb3JNYXAgPSBkZWZhdWx0RXJyb3JNYXA7XG5leHBvcnQgeyBkZWZhdWx0RXJyb3JNYXAgfTtcbmV4cG9ydCBmdW5jdGlvbiBzZXRFcnJvck1hcChtYXApIHtcbiAgICBvdmVycmlkZUVycm9yTWFwID0gbWFwO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGdldEVycm9yTWFwKCkge1xuICAgIHJldHVybiBvdmVycmlkZUVycm9yTWFwO1xufVxuIiwiaW1wb3J0IHsgZ2V0RXJyb3JNYXAgfSBmcm9tIFwiLi4vZXJyb3JzLmpzXCI7XG5pbXBvcnQgZGVmYXVsdEVycm9yTWFwIGZyb20gXCIuLi9sb2NhbGVzL2VuLmpzXCI7XG5leHBvcnQgY29uc3QgbWFrZUlzc3VlID0gKHBhcmFtcykgPT4ge1xuICAgIGNvbnN0IHsgZGF0YSwgcGF0aCwgZXJyb3JNYXBzLCBpc3N1ZURhdGEgfSA9IHBhcmFtcztcbiAgICBjb25zdCBmdWxsUGF0aCA9IFsuLi5wYXRoLCAuLi4oaXNzdWVEYXRhLnBhdGggfHwgW10pXTtcbiAgICBjb25zdCBmdWxsSXNzdWUgPSB7XG4gICAgICAgIC4uLmlzc3VlRGF0YSxcbiAgICAgICAgcGF0aDogZnVsbFBhdGgsXG4gICAgfTtcbiAgICBpZiAoaXNzdWVEYXRhLm1lc3NhZ2UgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uaXNzdWVEYXRhLFxuICAgICAgICAgICAgcGF0aDogZnVsbFBhdGgsXG4gICAgICAgICAgICBtZXNzYWdlOiBpc3N1ZURhdGEubWVzc2FnZSxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgbGV0IGVycm9yTWVzc2FnZSA9IFwiXCI7XG4gICAgY29uc3QgbWFwcyA9IGVycm9yTWFwc1xuICAgICAgICAuZmlsdGVyKChtKSA9PiAhIW0pXG4gICAgICAgIC5zbGljZSgpXG4gICAgICAgIC5yZXZlcnNlKCk7XG4gICAgZm9yIChjb25zdCBtYXAgb2YgbWFwcykge1xuICAgICAgICBlcnJvck1lc3NhZ2UgPSBtYXAoZnVsbElzc3VlLCB7IGRhdGEsIGRlZmF1bHRFcnJvcjogZXJyb3JNZXNzYWdlIH0pLm1lc3NhZ2U7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIC4uLmlzc3VlRGF0YSxcbiAgICAgICAgcGF0aDogZnVsbFBhdGgsXG4gICAgICAgIG1lc3NhZ2U6IGVycm9yTWVzc2FnZSxcbiAgICB9O1xufTtcbmV4cG9ydCBjb25zdCBFTVBUWV9QQVRIID0gW107XG5leHBvcnQgZnVuY3Rpb24gYWRkSXNzdWVUb0NvbnRleHQoY3R4LCBpc3N1ZURhdGEpIHtcbiAgICBjb25zdCBvdmVycmlkZU1hcCA9IGdldEVycm9yTWFwKCk7XG4gICAgY29uc3QgaXNzdWUgPSBtYWtlSXNzdWUoe1xuICAgICAgICBpc3N1ZURhdGE6IGlzc3VlRGF0YSxcbiAgICAgICAgZGF0YTogY3R4LmRhdGEsXG4gICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICBlcnJvck1hcHM6IFtcbiAgICAgICAgICAgIGN0eC5jb21tb24uY29udGV4dHVhbEVycm9yTWFwLCAvLyBjb250ZXh0dWFsIGVycm9yIG1hcCBpcyBmaXJzdCBwcmlvcml0eVxuICAgICAgICAgICAgY3R4LnNjaGVtYUVycm9yTWFwLCAvLyB0aGVuIHNjaGVtYS1ib3VuZCBtYXAgaWYgYXZhaWxhYmxlXG4gICAgICAgICAgICBvdmVycmlkZU1hcCwgLy8gdGhlbiBnbG9iYWwgb3ZlcnJpZGUgbWFwXG4gICAgICAgICAgICBvdmVycmlkZU1hcCA9PT0gZGVmYXVsdEVycm9yTWFwID8gdW5kZWZpbmVkIDogZGVmYXVsdEVycm9yTWFwLCAvLyB0aGVuIGdsb2JhbCBkZWZhdWx0IG1hcFxuICAgICAgICBdLmZpbHRlcigoeCkgPT4gISF4KSxcbiAgICB9KTtcbiAgICBjdHguY29tbW9uLmlzc3Vlcy5wdXNoKGlzc3VlKTtcbn1cbmV4cG9ydCBjbGFzcyBQYXJzZVN0YXR1cyB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMudmFsdWUgPSBcInZhbGlkXCI7XG4gICAgfVxuICAgIGRpcnR5KCkge1xuICAgICAgICBpZiAodGhpcy52YWx1ZSA9PT0gXCJ2YWxpZFwiKVxuICAgICAgICAgICAgdGhpcy52YWx1ZSA9IFwiZGlydHlcIjtcbiAgICB9XG4gICAgYWJvcnQoKSB7XG4gICAgICAgIGlmICh0aGlzLnZhbHVlICE9PSBcImFib3J0ZWRcIilcbiAgICAgICAgICAgIHRoaXMudmFsdWUgPSBcImFib3J0ZWRcIjtcbiAgICB9XG4gICAgc3RhdGljIG1lcmdlQXJyYXkoc3RhdHVzLCByZXN1bHRzKSB7XG4gICAgICAgIGNvbnN0IGFycmF5VmFsdWUgPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBzIG9mIHJlc3VsdHMpIHtcbiAgICAgICAgICAgIGlmIChzLnN0YXR1cyA9PT0gXCJhYm9ydGVkXCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICBpZiAocy5zdGF0dXMgPT09IFwiZGlydHlcIilcbiAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgIGFycmF5VmFsdWUucHVzaChzLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzdGF0dXM6IHN0YXR1cy52YWx1ZSwgdmFsdWU6IGFycmF5VmFsdWUgfTtcbiAgICB9XG4gICAgc3RhdGljIGFzeW5jIG1lcmdlT2JqZWN0QXN5bmMoc3RhdHVzLCBwYWlycykge1xuICAgICAgICBjb25zdCBzeW5jUGFpcnMgPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBwYWlyIG9mIHBhaXJzKSB7XG4gICAgICAgICAgICBjb25zdCBrZXkgPSBhd2FpdCBwYWlyLmtleTtcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gYXdhaXQgcGFpci52YWx1ZTtcbiAgICAgICAgICAgIHN5bmNQYWlycy5wdXNoKHtcbiAgICAgICAgICAgICAgICBrZXksXG4gICAgICAgICAgICAgICAgdmFsdWUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gUGFyc2VTdGF0dXMubWVyZ2VPYmplY3RTeW5jKHN0YXR1cywgc3luY1BhaXJzKTtcbiAgICB9XG4gICAgc3RhdGljIG1lcmdlT2JqZWN0U3luYyhzdGF0dXMsIHBhaXJzKSB7XG4gICAgICAgIGNvbnN0IGZpbmFsT2JqZWN0ID0ge307XG4gICAgICAgIGZvciAoY29uc3QgcGFpciBvZiBwYWlycykge1xuICAgICAgICAgICAgY29uc3QgeyBrZXksIHZhbHVlIH0gPSBwYWlyO1xuICAgICAgICAgICAgaWYgKGtleS5zdGF0dXMgPT09IFwiYWJvcnRlZFwiKVxuICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgaWYgKHZhbHVlLnN0YXR1cyA9PT0gXCJhYm9ydGVkXCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICBpZiAoa2V5LnN0YXR1cyA9PT0gXCJkaXJ0eVwiKVxuICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgaWYgKHZhbHVlLnN0YXR1cyA9PT0gXCJkaXJ0eVwiKVxuICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgaWYgKGtleS52YWx1ZSAhPT0gXCJfX3Byb3RvX19cIiAmJiAodHlwZW9mIHZhbHVlLnZhbHVlICE9PSBcInVuZGVmaW5lZFwiIHx8IHBhaXIuYWx3YXlzU2V0KSkge1xuICAgICAgICAgICAgICAgIGZpbmFsT2JqZWN0W2tleS52YWx1ZV0gPSB2YWx1ZS52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzdGF0dXM6IHN0YXR1cy52YWx1ZSwgdmFsdWU6IGZpbmFsT2JqZWN0IH07XG4gICAgfVxufVxuZXhwb3J0IGNvbnN0IElOVkFMSUQgPSBPYmplY3QuZnJlZXplKHtcbiAgICBzdGF0dXM6IFwiYWJvcnRlZFwiLFxufSk7XG5leHBvcnQgY29uc3QgRElSVFkgPSAodmFsdWUpID0+ICh7IHN0YXR1czogXCJkaXJ0eVwiLCB2YWx1ZSB9KTtcbmV4cG9ydCBjb25zdCBPSyA9ICh2YWx1ZSkgPT4gKHsgc3RhdHVzOiBcInZhbGlkXCIsIHZhbHVlIH0pO1xuZXhwb3J0IGNvbnN0IGlzQWJvcnRlZCA9ICh4KSA9PiB4LnN0YXR1cyA9PT0gXCJhYm9ydGVkXCI7XG5leHBvcnQgY29uc3QgaXNEaXJ0eSA9ICh4KSA9PiB4LnN0YXR1cyA9PT0gXCJkaXJ0eVwiO1xuZXhwb3J0IGNvbnN0IGlzVmFsaWQgPSAoeCkgPT4geC5zdGF0dXMgPT09IFwidmFsaWRcIjtcbmV4cG9ydCBjb25zdCBpc0FzeW5jID0gKHgpID0+IHR5cGVvZiBQcm9taXNlICE9PSBcInVuZGVmaW5lZFwiICYmIHggaW5zdGFuY2VvZiBQcm9taXNlO1xuIiwiZXhwb3J0IHZhciBlcnJvclV0aWw7XG4oZnVuY3Rpb24gKGVycm9yVXRpbCkge1xuICAgIGVycm9yVXRpbC5lcnJUb09iaiA9IChtZXNzYWdlKSA9PiB0eXBlb2YgbWVzc2FnZSA9PT0gXCJzdHJpbmdcIiA/IHsgbWVzc2FnZSB9IDogbWVzc2FnZSB8fCB7fTtcbiAgICAvLyBiaW9tZS1pZ25vcmUgbGludDpcbiAgICBlcnJvclV0aWwudG9TdHJpbmcgPSAobWVzc2FnZSkgPT4gdHlwZW9mIG1lc3NhZ2UgPT09IFwic3RyaW5nXCIgPyBtZXNzYWdlIDogbWVzc2FnZT8ubWVzc2FnZTtcbn0pKGVycm9yVXRpbCB8fCAoZXJyb3JVdGlsID0ge30pKTtcbiIsImltcG9ydCB7IFpvZEVycm9yLCBab2RJc3N1ZUNvZGUsIH0gZnJvbSBcIi4vWm9kRXJyb3IuanNcIjtcbmltcG9ydCB7IGRlZmF1bHRFcnJvck1hcCwgZ2V0RXJyb3JNYXAgfSBmcm9tIFwiLi9lcnJvcnMuanNcIjtcbmltcG9ydCB7IGVycm9yVXRpbCB9IGZyb20gXCIuL2hlbHBlcnMvZXJyb3JVdGlsLmpzXCI7XG5pbXBvcnQgeyBESVJUWSwgSU5WQUxJRCwgT0ssIFBhcnNlU3RhdHVzLCBhZGRJc3N1ZVRvQ29udGV4dCwgaXNBYm9ydGVkLCBpc0FzeW5jLCBpc0RpcnR5LCBpc1ZhbGlkLCBtYWtlSXNzdWUsIH0gZnJvbSBcIi4vaGVscGVycy9wYXJzZVV0aWwuanNcIjtcbmltcG9ydCB7IHV0aWwsIFpvZFBhcnNlZFR5cGUsIGdldFBhcnNlZFR5cGUgfSBmcm9tIFwiLi9oZWxwZXJzL3V0aWwuanNcIjtcbmNsYXNzIFBhcnNlSW5wdXRMYXp5UGF0aCB7XG4gICAgY29uc3RydWN0b3IocGFyZW50LCB2YWx1ZSwgcGF0aCwga2V5KSB7XG4gICAgICAgIHRoaXMuX2NhY2hlZFBhdGggPSBbXTtcbiAgICAgICAgdGhpcy5wYXJlbnQgPSBwYXJlbnQ7XG4gICAgICAgIHRoaXMuZGF0YSA9IHZhbHVlO1xuICAgICAgICB0aGlzLl9wYXRoID0gcGF0aDtcbiAgICAgICAgdGhpcy5fa2V5ID0ga2V5O1xuICAgIH1cbiAgICBnZXQgcGF0aCgpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9jYWNoZWRQYXRoLmxlbmd0aCkge1xuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkodGhpcy5fa2V5KSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX2NhY2hlZFBhdGgucHVzaCguLi50aGlzLl9wYXRoLCAuLi50aGlzLl9rZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY2FjaGVkUGF0aC5wdXNoKC4uLnRoaXMuX3BhdGgsIHRoaXMuX2tleSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhY2hlZFBhdGg7XG4gICAgfVxufVxuY29uc3QgaGFuZGxlUmVzdWx0ID0gKGN0eCwgcmVzdWx0KSA9PiB7XG4gICAgaWYgKGlzVmFsaWQocmVzdWx0KSkge1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiByZXN1bHQudmFsdWUgfTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGlmICghY3R4LmNvbW1vbi5pc3N1ZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJWYWxpZGF0aW9uIGZhaWxlZCBidXQgbm8gaXNzdWVzIGRldGVjdGVkLlwiKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICBnZXQgZXJyb3IoKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX2Vycm9yKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fZXJyb3I7XG4gICAgICAgICAgICAgICAgY29uc3QgZXJyb3IgPSBuZXcgWm9kRXJyb3IoY3R4LmNvbW1vbi5pc3N1ZXMpO1xuICAgICAgICAgICAgICAgIHRoaXMuX2Vycm9yID0gZXJyb3I7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2Vycm9yO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICB9XG59O1xuZnVuY3Rpb24gcHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpIHtcbiAgICBpZiAoIXBhcmFtcylcbiAgICAgICAgcmV0dXJuIHt9O1xuICAgIGNvbnN0IHsgZXJyb3JNYXAsIGludmFsaWRfdHlwZV9lcnJvciwgcmVxdWlyZWRfZXJyb3IsIGRlc2NyaXB0aW9uIH0gPSBwYXJhbXM7XG4gICAgaWYgKGVycm9yTWFwICYmIChpbnZhbGlkX3R5cGVfZXJyb3IgfHwgcmVxdWlyZWRfZXJyb3IpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2FuJ3QgdXNlIFwiaW52YWxpZF90eXBlX2Vycm9yXCIgb3IgXCJyZXF1aXJlZF9lcnJvclwiIGluIGNvbmp1bmN0aW9uIHdpdGggY3VzdG9tIGVycm9yIG1hcC5gKTtcbiAgICB9XG4gICAgaWYgKGVycm9yTWFwKVxuICAgICAgICByZXR1cm4geyBlcnJvck1hcDogZXJyb3JNYXAsIGRlc2NyaXB0aW9uIH07XG4gICAgY29uc3QgY3VzdG9tTWFwID0gKGlzcywgY3R4KSA9PiB7XG4gICAgICAgIGNvbnN0IHsgbWVzc2FnZSB9ID0gcGFyYW1zO1xuICAgICAgICBpZiAoaXNzLmNvZGUgPT09IFwiaW52YWxpZF9lbnVtX3ZhbHVlXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG1lc3NhZ2U6IG1lc3NhZ2UgPz8gY3R4LmRlZmF1bHRFcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2YgY3R4LmRhdGEgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB7IG1lc3NhZ2U6IG1lc3NhZ2UgPz8gcmVxdWlyZWRfZXJyb3IgPz8gY3R4LmRlZmF1bHRFcnJvciB9O1xuICAgICAgICB9XG4gICAgICAgIGlmIChpc3MuY29kZSAhPT0gXCJpbnZhbGlkX3R5cGVcIilcbiAgICAgICAgICAgIHJldHVybiB7IG1lc3NhZ2U6IGN0eC5kZWZhdWx0RXJyb3IgfTtcbiAgICAgICAgcmV0dXJuIHsgbWVzc2FnZTogbWVzc2FnZSA/PyBpbnZhbGlkX3R5cGVfZXJyb3IgPz8gY3R4LmRlZmF1bHRFcnJvciB9O1xuICAgIH07XG4gICAgcmV0dXJuIHsgZXJyb3JNYXA6IGN1c3RvbU1hcCwgZGVzY3JpcHRpb24gfTtcbn1cbmV4cG9ydCBjbGFzcyBab2RUeXBlIHtcbiAgICBnZXQgZGVzY3JpcHRpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuZGVzY3JpcHRpb247XG4gICAgfVxuICAgIF9nZXRUeXBlKGlucHV0KSB7XG4gICAgICAgIHJldHVybiBnZXRQYXJzZWRUeXBlKGlucHV0LmRhdGEpO1xuICAgIH1cbiAgICBfZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCkge1xuICAgICAgICByZXR1cm4gKGN0eCB8fCB7XG4gICAgICAgICAgICBjb21tb246IGlucHV0LnBhcmVudC5jb21tb24sXG4gICAgICAgICAgICBkYXRhOiBpbnB1dC5kYXRhLFxuICAgICAgICAgICAgcGFyc2VkVHlwZTogZ2V0UGFyc2VkVHlwZShpbnB1dC5kYXRhKSxcbiAgICAgICAgICAgIHNjaGVtYUVycm9yTWFwOiB0aGlzLl9kZWYuZXJyb3JNYXAsXG4gICAgICAgICAgICBwYXRoOiBpbnB1dC5wYXRoLFxuICAgICAgICAgICAgcGFyZW50OiBpbnB1dC5wYXJlbnQsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBfcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdGF0dXM6IG5ldyBQYXJzZVN0YXR1cygpLFxuICAgICAgICAgICAgY3R4OiB7XG4gICAgICAgICAgICAgICAgY29tbW9uOiBpbnB1dC5wYXJlbnQuY29tbW9uLFxuICAgICAgICAgICAgICAgIGRhdGE6IGlucHV0LmRhdGEsXG4gICAgICAgICAgICAgICAgcGFyc2VkVHlwZTogZ2V0UGFyc2VkVHlwZShpbnB1dC5kYXRhKSxcbiAgICAgICAgICAgICAgICBzY2hlbWFFcnJvck1hcDogdGhpcy5fZGVmLmVycm9yTWFwLFxuICAgICAgICAgICAgICAgIHBhdGg6IGlucHV0LnBhdGgsXG4gICAgICAgICAgICAgICAgcGFyZW50OiBpbnB1dC5wYXJlbnQsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH1cbiAgICBfcGFyc2VTeW5jKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuX3BhcnNlKGlucHV0KTtcbiAgICAgICAgaWYgKGlzQXN5bmMocmVzdWx0KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiU3luY2hyb25vdXMgcGFyc2UgZW5jb3VudGVyZWQgcHJvbWlzZS5cIik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgX3BhcnNlQXN5bmMoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5fcGFyc2UoaW5wdXQpO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgfVxuICAgIHBhcnNlKGRhdGEsIHBhcmFtcykge1xuICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLnNhZmVQYXJzZShkYXRhLCBwYXJhbXMpO1xuICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0LmRhdGE7XG4gICAgICAgIHRocm93IHJlc3VsdC5lcnJvcjtcbiAgICB9XG4gICAgc2FmZVBhcnNlKGRhdGEsIHBhcmFtcykge1xuICAgICAgICBjb25zdCBjdHggPSB7XG4gICAgICAgICAgICBjb21tb246IHtcbiAgICAgICAgICAgICAgICBpc3N1ZXM6IFtdLFxuICAgICAgICAgICAgICAgIGFzeW5jOiBwYXJhbXM/LmFzeW5jID8/IGZhbHNlLFxuICAgICAgICAgICAgICAgIGNvbnRleHR1YWxFcnJvck1hcDogcGFyYW1zPy5lcnJvck1hcCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBwYXRoOiBwYXJhbXM/LnBhdGggfHwgW10sXG4gICAgICAgICAgICBzY2hlbWFFcnJvck1hcDogdGhpcy5fZGVmLmVycm9yTWFwLFxuICAgICAgICAgICAgcGFyZW50OiBudWxsLFxuICAgICAgICAgICAgZGF0YSxcbiAgICAgICAgICAgIHBhcnNlZFR5cGU6IGdldFBhcnNlZFR5cGUoZGF0YSksXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuX3BhcnNlU3luYyh7IGRhdGEsIHBhdGg6IGN0eC5wYXRoLCBwYXJlbnQ6IGN0eCB9KTtcbiAgICAgICAgcmV0dXJuIGhhbmRsZVJlc3VsdChjdHgsIHJlc3VsdCk7XG4gICAgfVxuICAgIFwifnZhbGlkYXRlXCIoZGF0YSkge1xuICAgICAgICBjb25zdCBjdHggPSB7XG4gICAgICAgICAgICBjb21tb246IHtcbiAgICAgICAgICAgICAgICBpc3N1ZXM6IFtdLFxuICAgICAgICAgICAgICAgIGFzeW5jOiAhIXRoaXNbXCJ+c3RhbmRhcmRcIl0uYXN5bmMsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcGF0aDogW10sXG4gICAgICAgICAgICBzY2hlbWFFcnJvck1hcDogdGhpcy5fZGVmLmVycm9yTWFwLFxuICAgICAgICAgICAgcGFyZW50OiBudWxsLFxuICAgICAgICAgICAgZGF0YSxcbiAgICAgICAgICAgIHBhcnNlZFR5cGU6IGdldFBhcnNlZFR5cGUoZGF0YSksXG4gICAgICAgIH07XG4gICAgICAgIGlmICghdGhpc1tcIn5zdGFuZGFyZFwiXS5hc3luYykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLl9wYXJzZVN5bmMoeyBkYXRhLCBwYXRoOiBbXSwgcGFyZW50OiBjdHggfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGlzVmFsaWQocmVzdWx0KVxuICAgICAgICAgICAgICAgICAgICA/IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiByZXN1bHQudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpc3N1ZXM6IGN0eC5jb21tb24uaXNzdWVzLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIGlmIChlcnI/Lm1lc3NhZ2U/LnRvTG93ZXJDYXNlKCk/LmluY2x1ZGVzKFwiZW5jb3VudGVyZWRcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpc1tcIn5zdGFuZGFyZFwiXS5hc3luYyA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGN0eC5jb21tb24gPSB7XG4gICAgICAgICAgICAgICAgICAgIGlzc3VlczogW10sXG4gICAgICAgICAgICAgICAgICAgIGFzeW5jOiB0cnVlLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX3BhcnNlQXN5bmMoeyBkYXRhLCBwYXRoOiBbXSwgcGFyZW50OiBjdHggfSkudGhlbigocmVzdWx0KSA9PiBpc1ZhbGlkKHJlc3VsdClcbiAgICAgICAgICAgID8ge1xuICAgICAgICAgICAgICAgIHZhbHVlOiByZXN1bHQudmFsdWUsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICA6IHtcbiAgICAgICAgICAgICAgICBpc3N1ZXM6IGN0eC5jb21tb24uaXNzdWVzLFxuICAgICAgICAgICAgfSk7XG4gICAgfVxuICAgIGFzeW5jIHBhcnNlQXN5bmMoZGF0YSwgcGFyYW1zKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2FmZVBhcnNlQXN5bmMoZGF0YSwgcGFyYW1zKTtcbiAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzKVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdC5kYXRhO1xuICAgICAgICB0aHJvdyByZXN1bHQuZXJyb3I7XG4gICAgfVxuICAgIGFzeW5jIHNhZmVQYXJzZUFzeW5jKGRhdGEsIHBhcmFtcykge1xuICAgICAgICBjb25zdCBjdHggPSB7XG4gICAgICAgICAgICBjb21tb246IHtcbiAgICAgICAgICAgICAgICBpc3N1ZXM6IFtdLFxuICAgICAgICAgICAgICAgIGNvbnRleHR1YWxFcnJvck1hcDogcGFyYW1zPy5lcnJvck1hcCxcbiAgICAgICAgICAgICAgICBhc3luYzogdHJ1ZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBwYXRoOiBwYXJhbXM/LnBhdGggfHwgW10sXG4gICAgICAgICAgICBzY2hlbWFFcnJvck1hcDogdGhpcy5fZGVmLmVycm9yTWFwLFxuICAgICAgICAgICAgcGFyZW50OiBudWxsLFxuICAgICAgICAgICAgZGF0YSxcbiAgICAgICAgICAgIHBhcnNlZFR5cGU6IGdldFBhcnNlZFR5cGUoZGF0YSksXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IG1heWJlQXN5bmNSZXN1bHQgPSB0aGlzLl9wYXJzZSh7IGRhdGEsIHBhdGg6IGN0eC5wYXRoLCBwYXJlbnQ6IGN0eCB9KTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgKGlzQXN5bmMobWF5YmVBc3luY1Jlc3VsdCkgPyBtYXliZUFzeW5jUmVzdWx0IDogUHJvbWlzZS5yZXNvbHZlKG1heWJlQXN5bmNSZXN1bHQpKTtcbiAgICAgICAgcmV0dXJuIGhhbmRsZVJlc3VsdChjdHgsIHJlc3VsdCk7XG4gICAgfVxuICAgIHJlZmluZShjaGVjaywgbWVzc2FnZSkge1xuICAgICAgICBjb25zdCBnZXRJc3N1ZVByb3BlcnRpZXMgPSAodmFsKSA9PiB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG1lc3NhZ2UgPT09IFwic3RyaW5nXCIgfHwgdHlwZW9mIG1lc3NhZ2UgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBtZXNzYWdlIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh0eXBlb2YgbWVzc2FnZSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1lc3NhZ2UodmFsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBtZXNzYWdlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gdGhpcy5fcmVmaW5lbWVudCgodmFsLCBjdHgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGNoZWNrKHZhbCk7XG4gICAgICAgICAgICBjb25zdCBzZXRFcnJvciA9ICgpID0+IGN0eC5hZGRJc3N1ZSh7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmN1c3RvbSxcbiAgICAgICAgICAgICAgICAuLi5nZXRJc3N1ZVByb3BlcnRpZXModmFsKSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBQcm9taXNlICE9PSBcInVuZGVmaW5lZFwiICYmIHJlc3VsdCBpbnN0YW5jZW9mIFByb21pc2UpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0LnRoZW4oKGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFkYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXRFcnJvcigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgc2V0RXJyb3IoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJlZmluZW1lbnQoY2hlY2ssIHJlZmluZW1lbnREYXRhKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9yZWZpbmVtZW50KCh2YWwsIGN0eCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFjaGVjayh2YWwpKSB7XG4gICAgICAgICAgICAgICAgY3R4LmFkZElzc3VlKHR5cGVvZiByZWZpbmVtZW50RGF0YSA9PT0gXCJmdW5jdGlvblwiID8gcmVmaW5lbWVudERhdGEodmFsLCBjdHgpIDogcmVmaW5lbWVudERhdGEpO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgX3JlZmluZW1lbnQocmVmaW5lbWVudCkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZEVmZmVjdHMoe1xuICAgICAgICAgICAgc2NoZW1hOiB0aGlzLFxuICAgICAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RFZmZlY3RzLFxuICAgICAgICAgICAgZWZmZWN0OiB7IHR5cGU6IFwicmVmaW5lbWVudFwiLCByZWZpbmVtZW50IH0sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBzdXBlclJlZmluZShyZWZpbmVtZW50KSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9yZWZpbmVtZW50KHJlZmluZW1lbnQpO1xuICAgIH1cbiAgICBjb25zdHJ1Y3RvcihkZWYpIHtcbiAgICAgICAgLyoqIEFsaWFzIG9mIHNhZmVQYXJzZUFzeW5jICovXG4gICAgICAgIHRoaXMuc3BhID0gdGhpcy5zYWZlUGFyc2VBc3luYztcbiAgICAgICAgdGhpcy5fZGVmID0gZGVmO1xuICAgICAgICB0aGlzLnBhcnNlID0gdGhpcy5wYXJzZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnNhZmVQYXJzZSA9IHRoaXMuc2FmZVBhcnNlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMucGFyc2VBc3luYyA9IHRoaXMucGFyc2VBc3luYy5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnNhZmVQYXJzZUFzeW5jID0gdGhpcy5zYWZlUGFyc2VBc3luYy5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnNwYSA9IHRoaXMuc3BhLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMucmVmaW5lID0gdGhpcy5yZWZpbmUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5yZWZpbmVtZW50ID0gdGhpcy5yZWZpbmVtZW50LmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuc3VwZXJSZWZpbmUgPSB0aGlzLnN1cGVyUmVmaW5lLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMub3B0aW9uYWwgPSB0aGlzLm9wdGlvbmFsLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMubnVsbGFibGUgPSB0aGlzLm51bGxhYmxlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMubnVsbGlzaCA9IHRoaXMubnVsbGlzaC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmFycmF5ID0gdGhpcy5hcnJheS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnByb21pc2UgPSB0aGlzLnByb21pc2UuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5vciA9IHRoaXMub3IuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5hbmQgPSB0aGlzLmFuZC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnRyYW5zZm9ybSA9IHRoaXMudHJhbnNmb3JtLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYnJhbmQgPSB0aGlzLmJyYW5kLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuZGVmYXVsdCA9IHRoaXMuZGVmYXVsdC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmNhdGNoID0gdGhpcy5jYXRjaC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmRlc2NyaWJlID0gdGhpcy5kZXNjcmliZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnBpcGUgPSB0aGlzLnBpcGUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5yZWFkb25seSA9IHRoaXMucmVhZG9ubHkuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5pc051bGxhYmxlID0gdGhpcy5pc051bGxhYmxlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuaXNPcHRpb25hbCA9IHRoaXMuaXNPcHRpb25hbC5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzW1wifnN0YW5kYXJkXCJdID0ge1xuICAgICAgICAgICAgdmVyc2lvbjogMSxcbiAgICAgICAgICAgIHZlbmRvcjogXCJ6b2RcIixcbiAgICAgICAgICAgIHZhbGlkYXRlOiAoZGF0YSkgPT4gdGhpc1tcIn52YWxpZGF0ZVwiXShkYXRhKSxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgb3B0aW9uYWwoKSB7XG4gICAgICAgIHJldHVybiBab2RPcHRpb25hbC5jcmVhdGUodGhpcywgdGhpcy5fZGVmKTtcbiAgICB9XG4gICAgbnVsbGFibGUoKSB7XG4gICAgICAgIHJldHVybiBab2ROdWxsYWJsZS5jcmVhdGUodGhpcywgdGhpcy5fZGVmKTtcbiAgICB9XG4gICAgbnVsbGlzaCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubnVsbGFibGUoKS5vcHRpb25hbCgpO1xuICAgIH1cbiAgICBhcnJheSgpIHtcbiAgICAgICAgcmV0dXJuIFpvZEFycmF5LmNyZWF0ZSh0aGlzKTtcbiAgICB9XG4gICAgcHJvbWlzZSgpIHtcbiAgICAgICAgcmV0dXJuIFpvZFByb21pc2UuY3JlYXRlKHRoaXMsIHRoaXMuX2RlZik7XG4gICAgfVxuICAgIG9yKG9wdGlvbikge1xuICAgICAgICByZXR1cm4gWm9kVW5pb24uY3JlYXRlKFt0aGlzLCBvcHRpb25dLCB0aGlzLl9kZWYpO1xuICAgIH1cbiAgICBhbmQoaW5jb21pbmcpIHtcbiAgICAgICAgcmV0dXJuIFpvZEludGVyc2VjdGlvbi5jcmVhdGUodGhpcywgaW5jb21pbmcsIHRoaXMuX2RlZik7XG4gICAgfVxuICAgIHRyYW5zZm9ybSh0cmFuc2Zvcm0pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RFZmZlY3RzKHtcbiAgICAgICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXModGhpcy5fZGVmKSxcbiAgICAgICAgICAgIHNjaGVtYTogdGhpcyxcbiAgICAgICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kRWZmZWN0cyxcbiAgICAgICAgICAgIGVmZmVjdDogeyB0eXBlOiBcInRyYW5zZm9ybVwiLCB0cmFuc2Zvcm0gfSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGRlZmF1bHQoZGVmKSB7XG4gICAgICAgIGNvbnN0IGRlZmF1bHRWYWx1ZUZ1bmMgPSB0eXBlb2YgZGVmID09PSBcImZ1bmN0aW9uXCIgPyBkZWYgOiAoKSA9PiBkZWY7XG4gICAgICAgIHJldHVybiBuZXcgWm9kRGVmYXVsdCh7XG4gICAgICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHRoaXMuX2RlZiksXG4gICAgICAgICAgICBpbm5lclR5cGU6IHRoaXMsXG4gICAgICAgICAgICBkZWZhdWx0VmFsdWU6IGRlZmF1bHRWYWx1ZUZ1bmMsXG4gICAgICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZERlZmF1bHQsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBicmFuZCgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RCcmFuZGVkKHtcbiAgICAgICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kQnJhbmRlZCxcbiAgICAgICAgICAgIHR5cGU6IHRoaXMsXG4gICAgICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHRoaXMuX2RlZiksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBjYXRjaChkZWYpIHtcbiAgICAgICAgY29uc3QgY2F0Y2hWYWx1ZUZ1bmMgPSB0eXBlb2YgZGVmID09PSBcImZ1bmN0aW9uXCIgPyBkZWYgOiAoKSA9PiBkZWY7XG4gICAgICAgIHJldHVybiBuZXcgWm9kQ2F0Y2goe1xuICAgICAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyh0aGlzLl9kZWYpLFxuICAgICAgICAgICAgaW5uZXJUeXBlOiB0aGlzLFxuICAgICAgICAgICAgY2F0Y2hWYWx1ZTogY2F0Y2hWYWx1ZUZ1bmMsXG4gICAgICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZENhdGNoLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZGVzY3JpYmUoZGVzY3JpcHRpb24pIHtcbiAgICAgICAgY29uc3QgVGhpcyA9IHRoaXMuY29uc3RydWN0b3I7XG4gICAgICAgIHJldHVybiBuZXcgVGhpcyh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbixcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHBpcGUodGFyZ2V0KSB7XG4gICAgICAgIHJldHVybiBab2RQaXBlbGluZS5jcmVhdGUodGhpcywgdGFyZ2V0KTtcbiAgICB9XG4gICAgcmVhZG9ubHkoKSB7XG4gICAgICAgIHJldHVybiBab2RSZWFkb25seS5jcmVhdGUodGhpcyk7XG4gICAgfVxuICAgIGlzT3B0aW9uYWwoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNhZmVQYXJzZSh1bmRlZmluZWQpLnN1Y2Nlc3M7XG4gICAgfVxuICAgIGlzTnVsbGFibGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNhZmVQYXJzZShudWxsKS5zdWNjZXNzO1xuICAgIH1cbn1cbmNvbnN0IGN1aWRSZWdleCA9IC9eY1teXFxzLV17OCx9JC9pO1xuY29uc3QgY3VpZDJSZWdleCA9IC9eWzAtOWEtel0rJC87XG5jb25zdCB1bGlkUmVnZXggPSAvXlswLTlBLUhKS01OUC1UVi1aXXsyNn0kL2k7XG4vLyBjb25zdCB1dWlkUmVnZXggPVxuLy8gICAvXihbYS1mMC05XXs4fS1bYS1mMC05XXs0fS1bMS01XVthLWYwLTldezN9LVthLWYwLTldezR9LVthLWYwLTldezEyfXwwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDApJC9pO1xuY29uc3QgdXVpZFJlZ2V4ID0gL15bMC05YS1mQS1GXXs4fVxcYi1bMC05YS1mQS1GXXs0fVxcYi1bMC05YS1mQS1GXXs0fVxcYi1bMC05YS1mQS1GXXs0fVxcYi1bMC05YS1mQS1GXXsxMn0kL2k7XG5jb25zdCBuYW5vaWRSZWdleCA9IC9eW2EtejAtOV8tXXsyMX0kL2k7XG5jb25zdCBqd3RSZWdleCA9IC9eW0EtWmEtejAtOS1fXStcXC5bQS1aYS16MC05LV9dK1xcLltBLVphLXowLTktX10qJC87XG5jb25zdCBkdXJhdGlvblJlZ2V4ID0gL15bLStdP1AoPyEkKSg/Oig/OlstK10/XFxkK1kpfCg/OlstK10/XFxkK1suLF1cXGQrWSQpKT8oPzooPzpbLStdP1xcZCtNKXwoPzpbLStdP1xcZCtbLixdXFxkK00kKSk/KD86KD86Wy0rXT9cXGQrVyl8KD86Wy0rXT9cXGQrWy4sXVxcZCtXJCkpPyg/Oig/OlstK10/XFxkK0QpfCg/OlstK10/XFxkK1suLF1cXGQrRCQpKT8oPzpUKD89W1xcZCstXSkoPzooPzpbLStdP1xcZCtIKXwoPzpbLStdP1xcZCtbLixdXFxkK0gkKSk/KD86KD86Wy0rXT9cXGQrTSl8KD86Wy0rXT9cXGQrWy4sXVxcZCtNJCkpPyg/OlstK10/XFxkKyg/OlsuLF1cXGQrKT9TKT8pPz8kLztcbi8vIGZyb20gaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzQ2MTgxLzE1NTAxNTVcbi8vIG9sZCB2ZXJzaW9uOiB0b28gc2xvdywgZGlkbid0IHN1cHBvcnQgdW5pY29kZVxuLy8gY29uc3QgZW1haWxSZWdleCA9IC9eKCgoW2Etel18XFxkfFshI1xcJCUmJ1xcKlxcK1xcLVxcLz1cXD9cXF5fYHtcXHx9fl18W1xcdTAwQTAtXFx1RDdGRlxcdUY5MDAtXFx1RkRDRlxcdUZERjAtXFx1RkZFRl0pKyhcXC4oW2Etel18XFxkfFshI1xcJCUmJ1xcKlxcK1xcLVxcLz1cXD9cXF5fYHtcXHx9fl18W1xcdTAwQTAtXFx1RDdGRlxcdUY5MDAtXFx1RkRDRlxcdUZERjAtXFx1RkZFRl0pKykqKXwoKFxceDIyKSgoKChcXHgyMHxcXHgwOSkqKFxceDBkXFx4MGEpKT8oXFx4MjB8XFx4MDkpKyk/KChbXFx4MDEtXFx4MDhcXHgwYlxceDBjXFx4MGUtXFx4MWZcXHg3Zl18XFx4MjF8W1xceDIzLVxceDViXXxbXFx4NWQtXFx4N2VdfFtcXHUwMEEwLVxcdUQ3RkZcXHVGOTAwLVxcdUZEQ0ZcXHVGREYwLVxcdUZGRUZdKXwoXFxcXChbXFx4MDEtXFx4MDlcXHgwYlxceDBjXFx4MGQtXFx4N2ZdfFtcXHUwMEEwLVxcdUQ3RkZcXHVGOTAwLVxcdUZEQ0ZcXHVGREYwLVxcdUZGRUZdKSkpKSooKChcXHgyMHxcXHgwOSkqKFxceDBkXFx4MGEpKT8oXFx4MjB8XFx4MDkpKyk/KFxceDIyKSkpQCgoKFthLXpdfFxcZHxbXFx1MDBBMC1cXHVEN0ZGXFx1RjkwMC1cXHVGRENGXFx1RkRGMC1cXHVGRkVGXSl8KChbYS16XXxcXGR8W1xcdTAwQTAtXFx1RDdGRlxcdUY5MDAtXFx1RkRDRlxcdUZERjAtXFx1RkZFRl0pKFthLXpdfFxcZHwtfFxcLnxffH58W1xcdTAwQTAtXFx1RDdGRlxcdUY5MDAtXFx1RkRDRlxcdUZERjAtXFx1RkZFRl0pKihbYS16XXxcXGR8W1xcdTAwQTAtXFx1RDdGRlxcdUY5MDAtXFx1RkRDRlxcdUZERjAtXFx1RkZFRl0pKSlcXC4pKygoW2Etel18W1xcdTAwQTAtXFx1RDdGRlxcdUY5MDAtXFx1RkRDRlxcdUZERjAtXFx1RkZFRl0pfCgoW2Etel18W1xcdTAwQTAtXFx1RDdGRlxcdUY5MDAtXFx1RkRDRlxcdUZERjAtXFx1RkZFRl0pKFthLXpdfFxcZHwtfFxcLnxffH58W1xcdTAwQTAtXFx1RDdGRlxcdUY5MDAtXFx1RkRDRlxcdUZERjAtXFx1RkZFRl0pKihbYS16XXxbXFx1MDBBMC1cXHVEN0ZGXFx1RjkwMC1cXHVGRENGXFx1RkRGMC1cXHVGRkVGXSkpKSQvaTtcbi8vb2xkIGVtYWlsIHJlZ2V4XG4vLyBjb25zdCBlbWFpbFJlZ2V4ID0gL14oKFtePD4oKVtcXF0uLDs6XFxzQFwiXSsoXFwuW148PigpW1xcXS4sOzpcXHNAXCJdKykqKXwoXCIuK1wiKSlAKCg/IS0pKFtePD4oKVtcXF0uLDs6XFxzQFwiXStcXC4pK1tePD4oKVtcXF0uLDs6XFxzQFwiXXsxLH0pW14tPD4oKVtcXF0uLDs6XFxzQFwiXSQvaTtcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZVxuLy8gY29uc3QgZW1haWxSZWdleCA9XG4vLyAgIC9eKChbXjw+KClbXFxdXFxcXC4sOzpcXHNAXFxcIl0rKFxcLltePD4oKVtcXF1cXFxcLiw7Olxcc0BcXFwiXSspKil8KFxcXCIuK1xcXCIpKUAoKFxcWygoKDI1WzAtNV0pfCgyWzAtNF1bMC05XSl8KDFbMC05XXsyfSl8KFswLTldezEsMn0pKVxcLil7M30oKDI1WzAtNV0pfCgyWzAtNF1bMC05XSl8KDFbMC05XXsyfSl8KFswLTldezEsMn0pKVxcXSl8KFxcW0lQdjY6KChbYS1mMC05XXsxLDR9Oil7N318OjooW2EtZjAtOV17MSw0fTopezAsNn18KFthLWYwLTldezEsNH06KXsxfTooW2EtZjAtOV17MSw0fTopezAsNX18KFthLWYwLTldezEsNH06KXsyfTooW2EtZjAtOV17MSw0fTopezAsNH18KFthLWYwLTldezEsNH06KXszfTooW2EtZjAtOV17MSw0fTopezAsM318KFthLWYwLTldezEsNH06KXs0fTooW2EtZjAtOV17MSw0fTopezAsMn18KFthLWYwLTldezEsNH06KXs1fTooW2EtZjAtOV17MSw0fTopezAsMX0pKFthLWYwLTldezEsNH18KCgoMjVbMC01XSl8KDJbMC00XVswLTldKXwoMVswLTldezJ9KXwoWzAtOV17MSwyfSkpXFwuKXszfSgoMjVbMC01XSl8KDJbMC00XVswLTldKXwoMVswLTldezJ9KXwoWzAtOV17MSwyfSkpKVxcXSl8KFtBLVphLXowLTldKFtBLVphLXowLTktXSpbQS1aYS16MC05XSkqKFxcLltBLVphLXpdezIsfSkrKSkkLztcbi8vIGNvbnN0IGVtYWlsUmVnZXggPVxuLy8gICAvXlthLXpBLVowLTlcXC5cXCFcXCNcXCRcXCVcXCZcXCdcXCpcXCtcXC9cXD1cXD9cXF5cXF9cXGBcXHtcXHxcXH1cXH5cXC1dK0BbYS16QS1aMC05XSg/OlthLXpBLVowLTktXXswLDYxfVthLXpBLVowLTldKT8oPzpcXC5bYS16QS1aMC05XSg/OlthLXpBLVowLTktXXswLDYxfVthLXpBLVowLTldKT8pKiQvO1xuLy8gY29uc3QgZW1haWxSZWdleCA9XG4vLyAgIC9eKD86W2EtejAtOSEjJCUmJyorLz0/Xl9ge3x9fi1dKyg/OlxcLlthLXowLTkhIyQlJicqKy89P15fYHt8fX4tXSspKnxcIig/OltcXHgwMS1cXHgwOFxceDBiXFx4MGNcXHgwZS1cXHgxZlxceDIxXFx4MjMtXFx4NWJcXHg1ZC1cXHg3Zl18XFxcXFtcXHgwMS1cXHgwOVxceDBiXFx4MGNcXHgwZS1cXHg3Zl0pKlwiKUAoPzooPzpbYS16MC05XSg/OlthLXowLTktXSpbYS16MC05XSk/XFwuKStbYS16MC05XSg/OlthLXowLTktXSpbYS16MC05XSk/fFxcWyg/Oig/OjI1WzAtNV18MlswLTRdWzAtOV18WzAxXT9bMC05XVswLTldPylcXC4pezN9KD86MjVbMC01XXwyWzAtNF1bMC05XXxbMDFdP1swLTldWzAtOV0/fFthLXowLTktXSpbYS16MC05XTooPzpbXFx4MDEtXFx4MDhcXHgwYlxceDBjXFx4MGUtXFx4MWZcXHgyMS1cXHg1YVxceDUzLVxceDdmXXxcXFxcW1xceDAxLVxceDA5XFx4MGJcXHgwY1xceDBlLVxceDdmXSkrKVxcXSkkL2k7XG5jb25zdCBlbWFpbFJlZ2V4ID0gL14oPyFcXC4pKD8hLipcXC5cXC4pKFtBLVowLTlfJytcXC1cXC5dKilbQS1aMC05XystXUAoW0EtWjAtOV1bQS1aMC05XFwtXSpcXC4pK1tBLVpdezIsfSQvaTtcbi8vIGNvbnN0IGVtYWlsUmVnZXggPVxuLy8gICAvXlthLXowLTkuISMkJSbigJkqKy89P15fYHt8fX4tXStAW2EtejAtOS1dKyg/OlxcLlthLXowLTlcXC1dKykqJC9pO1xuLy8gZnJvbSBodHRwczovL3RoZWtldmluc2NvdHQuY29tL2Vtb2ppcy1pbi1qYXZhc2NyaXB0LyN3cml0aW5nLWEtcmVndWxhci1leHByZXNzaW9uXG5jb25zdCBfZW1vamlSZWdleCA9IGBeKFxcXFxwe0V4dGVuZGVkX1BpY3RvZ3JhcGhpY318XFxcXHB7RW1vamlfQ29tcG9uZW50fSkrJGA7XG5sZXQgZW1vamlSZWdleDtcbi8vIGZhc3Rlciwgc2ltcGxlciwgc2FmZXJcbmNvbnN0IGlwdjRSZWdleCA9IC9eKD86KD86MjVbMC01XXwyWzAtNF1bMC05XXwxWzAtOV1bMC05XXxbMS05XVswLTldfFswLTldKVxcLil7M30oPzoyNVswLTVdfDJbMC00XVswLTldfDFbMC05XVswLTldfFsxLTldWzAtOV18WzAtOV0pJC87XG5jb25zdCBpcHY0Q2lkclJlZ2V4ID0gL14oPzooPzoyNVswLTVdfDJbMC00XVswLTldfDFbMC05XVswLTldfFsxLTldWzAtOV18WzAtOV0pXFwuKXszfSg/OjI1WzAtNV18MlswLTRdWzAtOV18MVswLTldWzAtOV18WzEtOV1bMC05XXxbMC05XSlcXC8oM1swLTJdfFsxMl0/WzAtOV0pJC87XG4vLyBjb25zdCBpcHY2UmVnZXggPVxuLy8gL14oKFthLWYwLTldezEsNH06KXs3fXw6OihbYS1mMC05XXsxLDR9Oil7MCw2fXwoW2EtZjAtOV17MSw0fTopezF9OihbYS1mMC05XXsxLDR9Oil7MCw1fXwoW2EtZjAtOV17MSw0fTopezJ9OihbYS1mMC05XXsxLDR9Oil7MCw0fXwoW2EtZjAtOV17MSw0fTopezN9OihbYS1mMC05XXsxLDR9Oil7MCwzfXwoW2EtZjAtOV17MSw0fTopezR9OihbYS1mMC05XXsxLDR9Oil7MCwyfXwoW2EtZjAtOV17MSw0fTopezV9OihbYS1mMC05XXsxLDR9Oil7MCwxfSkoW2EtZjAtOV17MSw0fXwoKCgyNVswLTVdKXwoMlswLTRdWzAtOV0pfCgxWzAtOV17Mn0pfChbMC05XXsxLDJ9KSlcXC4pezN9KCgyNVswLTVdKXwoMlswLTRdWzAtOV0pfCgxWzAtOV17Mn0pfChbMC05XXsxLDJ9KSkpJC87XG5jb25zdCBpcHY2UmVnZXggPSAvXigoWzAtOWEtZkEtRl17MSw0fTopezcsN31bMC05YS1mQS1GXXsxLDR9fChbMC05YS1mQS1GXXsxLDR9Oil7MSw3fTp8KFswLTlhLWZBLUZdezEsNH06KXsxLDZ9OlswLTlhLWZBLUZdezEsNH18KFswLTlhLWZBLUZdezEsNH06KXsxLDV9KDpbMC05YS1mQS1GXXsxLDR9KXsxLDJ9fChbMC05YS1mQS1GXXsxLDR9Oil7MSw0fSg6WzAtOWEtZkEtRl17MSw0fSl7MSwzfXwoWzAtOWEtZkEtRl17MSw0fTopezEsM30oOlswLTlhLWZBLUZdezEsNH0pezEsNH18KFswLTlhLWZBLUZdezEsNH06KXsxLDJ9KDpbMC05YS1mQS1GXXsxLDR9KXsxLDV9fFswLTlhLWZBLUZdezEsNH06KCg6WzAtOWEtZkEtRl17MSw0fSl7MSw2fSl8OigoOlswLTlhLWZBLUZdezEsNH0pezEsN318Oil8ZmU4MDooOlswLTlhLWZBLUZdezAsNH0pezAsNH0lWzAtOWEtekEtWl17MSx9fDo6KGZmZmYoOjB7MSw0fSl7MCwxfTopezAsMX0oKDI1WzAtNV18KDJbMC00XXwxezAsMX1bMC05XSl7MCwxfVswLTldKVxcLil7MywzfSgyNVswLTVdfCgyWzAtNF18MXswLDF9WzAtOV0pezAsMX1bMC05XSl8KFswLTlhLWZBLUZdezEsNH06KXsxLDR9OigoMjVbMC01XXwoMlswLTRdfDF7MCwxfVswLTldKXswLDF9WzAtOV0pXFwuKXszLDN9KDI1WzAtNV18KDJbMC00XXwxezAsMX1bMC05XSl7MCwxfVswLTldKSkkLztcbmNvbnN0IGlwdjZDaWRyUmVnZXggPSAvXigoWzAtOWEtZkEtRl17MSw0fTopezcsN31bMC05YS1mQS1GXXsxLDR9fChbMC05YS1mQS1GXXsxLDR9Oil7MSw3fTp8KFswLTlhLWZBLUZdezEsNH06KXsxLDZ9OlswLTlhLWZBLUZdezEsNH18KFswLTlhLWZBLUZdezEsNH06KXsxLDV9KDpbMC05YS1mQS1GXXsxLDR9KXsxLDJ9fChbMC05YS1mQS1GXXsxLDR9Oil7MSw0fSg6WzAtOWEtZkEtRl17MSw0fSl7MSwzfXwoWzAtOWEtZkEtRl17MSw0fTopezEsM30oOlswLTlhLWZBLUZdezEsNH0pezEsNH18KFswLTlhLWZBLUZdezEsNH06KXsxLDJ9KDpbMC05YS1mQS1GXXsxLDR9KXsxLDV9fFswLTlhLWZBLUZdezEsNH06KCg6WzAtOWEtZkEtRl17MSw0fSl7MSw2fSl8OigoOlswLTlhLWZBLUZdezEsNH0pezEsN318Oil8ZmU4MDooOlswLTlhLWZBLUZdezAsNH0pezAsNH0lWzAtOWEtekEtWl17MSx9fDo6KGZmZmYoOjB7MSw0fSl7MCwxfTopezAsMX0oKDI1WzAtNV18KDJbMC00XXwxezAsMX1bMC05XSl7MCwxfVswLTldKVxcLil7MywzfSgyNVswLTVdfCgyWzAtNF18MXswLDF9WzAtOV0pezAsMX1bMC05XSl8KFswLTlhLWZBLUZdezEsNH06KXsxLDR9OigoMjVbMC01XXwoMlswLTRdfDF7MCwxfVswLTldKXswLDF9WzAtOV0pXFwuKXszLDN9KDI1WzAtNV18KDJbMC00XXwxezAsMX1bMC05XSl7MCwxfVswLTldKSlcXC8oMTJbMC04XXwxWzAxXVswLTldfFsxLTldP1swLTldKSQvO1xuLy8gaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvNzg2MDM5Mi9kZXRlcm1pbmUtaWYtc3RyaW5nLWlzLWluLWJhc2U2NC11c2luZy1qYXZhc2NyaXB0XG5jb25zdCBiYXNlNjRSZWdleCA9IC9eKFswLTlhLXpBLVorL117NH0pKigoWzAtOWEtekEtWisvXXsyfT09KXwoWzAtOWEtekEtWisvXXszfT0pKT8kLztcbi8vIGh0dHBzOi8vYmFzZTY0Lmd1cnUvc3RhbmRhcmRzL2Jhc2U2NHVybFxuY29uc3QgYmFzZTY0dXJsUmVnZXggPSAvXihbMC05YS16QS1aLV9dezR9KSooKFswLTlhLXpBLVotX117Mn0oPT0pPyl8KFswLTlhLXpBLVotX117M30oPSk/KSk/JC87XG4vLyBzaW1wbGVcbi8vIGNvbnN0IGRhdGVSZWdleFNvdXJjZSA9IGBcXFxcZHs0fS1cXFxcZHsyfS1cXFxcZHsyfWA7XG4vLyBubyBsZWFwIHllYXIgdmFsaWRhdGlvblxuLy8gY29uc3QgZGF0ZVJlZ2V4U291cmNlID0gYFxcXFxkezR9LSgoMFsxMzU3OF18MTB8MTIpLTMxfCgwWzEzLTldfDFbMC0yXSktMzB8KDBbMS05XXwxWzAtMl0pLSgwWzEtOV18MVxcXFxkfDJcXFxcZCkpYDtcbi8vIHdpdGggbGVhcCB5ZWFyIHZhbGlkYXRpb25cbmNvbnN0IGRhdGVSZWdleFNvdXJjZSA9IGAoKFxcXFxkXFxcXGRbMjQ2OF1bMDQ4XXxcXFxcZFxcXFxkWzEzNTc5XVsyNl18XFxcXGRcXFxcZDBbNDhdfFswMjQ2OF1bMDQ4XTAwfFsxMzU3OV1bMjZdMDApLTAyLTI5fFxcXFxkezR9LSgoMFsxMzU3OF18MVswMl0pLSgwWzEtOV18WzEyXVxcXFxkfDNbMDFdKXwoMFs0NjldfDExKS0oMFsxLTldfFsxMl1cXFxcZHwzMCl8KDAyKS0oMFsxLTldfDFcXFxcZHwyWzAtOF0pKSlgO1xuY29uc3QgZGF0ZVJlZ2V4ID0gbmV3IFJlZ0V4cChgXiR7ZGF0ZVJlZ2V4U291cmNlfSRgKTtcbmZ1bmN0aW9uIHRpbWVSZWdleFNvdXJjZShhcmdzKSB7XG4gICAgbGV0IHNlY29uZHNSZWdleFNvdXJjZSA9IGBbMC01XVxcXFxkYDtcbiAgICBpZiAoYXJncy5wcmVjaXNpb24pIHtcbiAgICAgICAgc2Vjb25kc1JlZ2V4U291cmNlID0gYCR7c2Vjb25kc1JlZ2V4U291cmNlfVxcXFwuXFxcXGR7JHthcmdzLnByZWNpc2lvbn19YDtcbiAgICB9XG4gICAgZWxzZSBpZiAoYXJncy5wcmVjaXNpb24gPT0gbnVsbCkge1xuICAgICAgICBzZWNvbmRzUmVnZXhTb3VyY2UgPSBgJHtzZWNvbmRzUmVnZXhTb3VyY2V9KFxcXFwuXFxcXGQrKT9gO1xuICAgIH1cbiAgICBjb25zdCBzZWNvbmRzUXVhbnRpZmllciA9IGFyZ3MucHJlY2lzaW9uID8gXCIrXCIgOiBcIj9cIjsgLy8gcmVxdWlyZSBzZWNvbmRzIGlmIHByZWNpc2lvbiBpcyBub256ZXJvXG4gICAgcmV0dXJuIGAoWzAxXVxcXFxkfDJbMC0zXSk6WzAtNV1cXFxcZCg6JHtzZWNvbmRzUmVnZXhTb3VyY2V9KSR7c2Vjb25kc1F1YW50aWZpZXJ9YDtcbn1cbmZ1bmN0aW9uIHRpbWVSZWdleChhcmdzKSB7XG4gICAgcmV0dXJuIG5ldyBSZWdFeHAoYF4ke3RpbWVSZWdleFNvdXJjZShhcmdzKX0kYCk7XG59XG4vLyBBZGFwdGVkIGZyb20gaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzMxNDMyMzFcbmV4cG9ydCBmdW5jdGlvbiBkYXRldGltZVJlZ2V4KGFyZ3MpIHtcbiAgICBsZXQgcmVnZXggPSBgJHtkYXRlUmVnZXhTb3VyY2V9VCR7dGltZVJlZ2V4U291cmNlKGFyZ3MpfWA7XG4gICAgY29uc3Qgb3B0cyA9IFtdO1xuICAgIG9wdHMucHVzaChhcmdzLmxvY2FsID8gYFo/YCA6IGBaYCk7XG4gICAgaWYgKGFyZ3Mub2Zmc2V0KVxuICAgICAgICBvcHRzLnB1c2goYChbKy1dXFxcXGR7Mn06P1xcXFxkezJ9KWApO1xuICAgIHJlZ2V4ID0gYCR7cmVnZXh9KCR7b3B0cy5qb2luKFwifFwiKX0pYDtcbiAgICByZXR1cm4gbmV3IFJlZ0V4cChgXiR7cmVnZXh9JGApO1xufVxuZnVuY3Rpb24gaXNWYWxpZElQKGlwLCB2ZXJzaW9uKSB7XG4gICAgaWYgKCh2ZXJzaW9uID09PSBcInY0XCIgfHwgIXZlcnNpb24pICYmIGlwdjRSZWdleC50ZXN0KGlwKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKCh2ZXJzaW9uID09PSBcInY2XCIgfHwgIXZlcnNpb24pICYmIGlwdjZSZWdleC50ZXN0KGlwKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuZnVuY3Rpb24gaXNWYWxpZEpXVChqd3QsIGFsZykge1xuICAgIGlmICghand0UmVnZXgudGVzdChqd3QpKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgW2hlYWRlcl0gPSBqd3Quc3BsaXQoXCIuXCIpO1xuICAgICAgICBpZiAoIWhlYWRlcilcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgLy8gQ29udmVydCBiYXNlNjR1cmwgdG8gYmFzZTY0XG4gICAgICAgIGNvbnN0IGJhc2U2NCA9IGhlYWRlclxuICAgICAgICAgICAgLnJlcGxhY2UoLy0vZywgXCIrXCIpXG4gICAgICAgICAgICAucmVwbGFjZSgvXy9nLCBcIi9cIilcbiAgICAgICAgICAgIC5wYWRFbmQoaGVhZGVyLmxlbmd0aCArICgoNCAtIChoZWFkZXIubGVuZ3RoICUgNCkpICUgNCksIFwiPVwiKTtcbiAgICAgICAgY29uc3QgZGVjb2RlZCA9IEpTT04ucGFyc2UoYXRvYihiYXNlNjQpKTtcbiAgICAgICAgaWYgKHR5cGVvZiBkZWNvZGVkICE9PSBcIm9iamVjdFwiIHx8IGRlY29kZWQgPT09IG51bGwpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmIChcInR5cFwiIGluIGRlY29kZWQgJiYgZGVjb2RlZD8udHlwICE9PSBcIkpXVFwiKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAoIWRlY29kZWQuYWxnKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAoYWxnICYmIGRlY29kZWQuYWxnICE9PSBhbGcpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjYXRjaCB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5mdW5jdGlvbiBpc1ZhbGlkQ2lkcihpcCwgdmVyc2lvbikge1xuICAgIGlmICgodmVyc2lvbiA9PT0gXCJ2NFwiIHx8ICF2ZXJzaW9uKSAmJiBpcHY0Q2lkclJlZ2V4LnRlc3QoaXApKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBpZiAoKHZlcnNpb24gPT09IFwidjZcIiB8fCAhdmVyc2lvbikgJiYgaXB2NkNpZHJSZWdleC50ZXN0KGlwKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuZXhwb3J0IGNsYXNzIFpvZFN0cmluZyBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBpZiAodGhpcy5fZGVmLmNvZXJjZSkge1xuICAgICAgICAgICAgaW5wdXQuZGF0YSA9IFN0cmluZyhpbnB1dC5kYXRhKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYXJzZWRUeXBlID0gdGhpcy5fZ2V0VHlwZShpbnB1dCk7XG4gICAgICAgIGlmIChwYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLnN0cmluZykge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5zdHJpbmcsXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzdGF0dXMgPSBuZXcgUGFyc2VTdGF0dXMoKTtcbiAgICAgICAgbGV0IGN0eCA9IHVuZGVmaW5lZDtcbiAgICAgICAgZm9yIChjb25zdCBjaGVjayBvZiB0aGlzLl9kZWYuY2hlY2tzKSB7XG4gICAgICAgICAgICBpZiAoY2hlY2sua2luZCA9PT0gXCJtaW5cIikge1xuICAgICAgICAgICAgICAgIGlmIChpbnB1dC5kYXRhLmxlbmd0aCA8IGNoZWNrLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fc21hbGwsXG4gICAgICAgICAgICAgICAgICAgICAgICBtaW5pbXVtOiBjaGVjay52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBleGFjdDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJtYXhcIikge1xuICAgICAgICAgICAgICAgIGlmIChpbnB1dC5kYXRhLmxlbmd0aCA+IGNoZWNrLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fYmlnLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWF4aW11bTogY2hlY2sudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXhhY3Q6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwibGVuZ3RoXCIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0b29CaWcgPSBpbnB1dC5kYXRhLmxlbmd0aCA+IGNoZWNrLnZhbHVlO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRvb1NtYWxsID0gaW5wdXQuZGF0YS5sZW5ndGggPCBjaGVjay52YWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAodG9vQmlnIHx8IHRvb1NtYWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAodG9vQmlnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX2JpZyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXhpbXVtOiBjaGVjay52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGFjdDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAodG9vU21hbGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fc21hbGwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWluaW11bTogY2hlY2sudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhhY3Q6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwiZW1haWxcIikge1xuICAgICAgICAgICAgICAgIGlmICghZW1haWxSZWdleC50ZXN0KGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwiZW1haWxcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImVtb2ppXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWVtb2ppUmVnZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgZW1vamlSZWdleCA9IG5ldyBSZWdFeHAoX2Vtb2ppUmVnZXgsIFwidVwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFlbW9qaVJlZ2V4LnRlc3QoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJlbW9qaVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwidXVpZFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCF1dWlkUmVnZXgudGVzdChpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcInV1aWRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcIm5hbm9pZFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFuYW5vaWRSZWdleC50ZXN0KGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwibmFub2lkXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJjdWlkXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWN1aWRSZWdleC50ZXN0KGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwiY3VpZFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwiY3VpZDJcIikge1xuICAgICAgICAgICAgICAgIGlmICghY3VpZDJSZWdleC50ZXN0KGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwiY3VpZDJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcInVsaWRcIikge1xuICAgICAgICAgICAgICAgIGlmICghdWxpZFJlZ2V4LnRlc3QoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJ1bGlkXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJ1cmxcIikge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIG5ldyBVUkwoaW5wdXQuZGF0YSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJ1cmxcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcInJlZ2V4XCIpIHtcbiAgICAgICAgICAgICAgICBjaGVjay5yZWdleC5sYXN0SW5kZXggPSAwO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRlc3RSZXN1bHQgPSBjaGVjay5yZWdleC50ZXN0KGlucHV0LmRhdGEpO1xuICAgICAgICAgICAgICAgIGlmICghdGVzdFJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcInJlZ2V4XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJ0cmltXCIpIHtcbiAgICAgICAgICAgICAgICBpbnB1dC5kYXRhID0gaW5wdXQuZGF0YS50cmltKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImluY2x1ZGVzXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWlucHV0LmRhdGEuaW5jbHVkZXMoY2hlY2sudmFsdWUsIGNoZWNrLnBvc2l0aW9uKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiB7IGluY2x1ZGVzOiBjaGVjay52YWx1ZSwgcG9zaXRpb246IGNoZWNrLnBvc2l0aW9uIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJ0b0xvd2VyQ2FzZVwiKSB7XG4gICAgICAgICAgICAgICAgaW5wdXQuZGF0YSA9IGlucHV0LmRhdGEudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwidG9VcHBlckNhc2VcIikge1xuICAgICAgICAgICAgICAgIGlucHV0LmRhdGEgPSBpbnB1dC5kYXRhLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcInN0YXJ0c1dpdGhcIikge1xuICAgICAgICAgICAgICAgIGlmICghaW5wdXQuZGF0YS5zdGFydHNXaXRoKGNoZWNrLnZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiB7IHN0YXJ0c1dpdGg6IGNoZWNrLnZhbHVlIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJlbmRzV2l0aFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFpbnB1dC5kYXRhLmVuZHNXaXRoKGNoZWNrLnZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiB7IGVuZHNXaXRoOiBjaGVjay52YWx1ZSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwiZGF0ZXRpbWVcIikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gZGF0ZXRpbWVSZWdleChjaGVjayk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZWdleC50ZXN0KGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwiZGF0ZXRpbWVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImRhdGVcIikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gZGF0ZVJlZ2V4O1xuICAgICAgICAgICAgICAgIGlmICghcmVnZXgudGVzdChpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcImRhdGVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcInRpbWVcIikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlZ2V4ID0gdGltZVJlZ2V4KGNoZWNrKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlZ2V4LnRlc3QoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJ0aW1lXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJkdXJhdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFkdXJhdGlvblJlZ2V4LnRlc3QoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJkdXJhdGlvblwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwiaXBcIikge1xuICAgICAgICAgICAgICAgIGlmICghaXNWYWxpZElQKGlucHV0LmRhdGEsIGNoZWNrLnZlcnNpb24pKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwiaXBcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImp3dFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFpc1ZhbGlkSldUKGlucHV0LmRhdGEsIGNoZWNrLmFsZykpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJqd3RcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImNpZHJcIikge1xuICAgICAgICAgICAgICAgIGlmICghaXNWYWxpZENpZHIoaW5wdXQuZGF0YSwgY2hlY2sudmVyc2lvbikpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJjaWRyXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJiYXNlNjRcIikge1xuICAgICAgICAgICAgICAgIGlmICghYmFzZTY0UmVnZXgudGVzdChpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcImJhc2U2NFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwiYmFzZTY0dXJsXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWJhc2U2NHVybFJlZ2V4LnRlc3QoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJiYXNlNjR1cmxcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB1dGlsLmFzc2VydE5ldmVyKGNoZWNrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzdGF0dXM6IHN0YXR1cy52YWx1ZSwgdmFsdWU6IGlucHV0LmRhdGEgfTtcbiAgICB9XG4gICAgX3JlZ2V4KHJlZ2V4LCB2YWxpZGF0aW9uLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlZmluZW1lbnQoKGRhdGEpID0+IHJlZ2V4LnRlc3QoZGF0YSksIHtcbiAgICAgICAgICAgIHZhbGlkYXRpb24sXG4gICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBfYWRkQ2hlY2soY2hlY2spIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RTdHJpbmcoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgY2hlY2tzOiBbLi4udGhpcy5fZGVmLmNoZWNrcywgY2hlY2tdLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZW1haWwobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soeyBraW5kOiBcImVtYWlsXCIsIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSB9KTtcbiAgICB9XG4gICAgdXJsKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHsga2luZDogXCJ1cmxcIiwgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpIH0pO1xuICAgIH1cbiAgICBlbW9qaShtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7IGtpbmQ6IFwiZW1vamlcIiwgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpIH0pO1xuICAgIH1cbiAgICB1dWlkKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHsga2luZDogXCJ1dWlkXCIsIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSB9KTtcbiAgICB9XG4gICAgbmFub2lkKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHsga2luZDogXCJuYW5vaWRcIiwgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpIH0pO1xuICAgIH1cbiAgICBjdWlkKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHsga2luZDogXCJjdWlkXCIsIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSB9KTtcbiAgICB9XG4gICAgY3VpZDIobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soeyBraW5kOiBcImN1aWQyXCIsIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSB9KTtcbiAgICB9XG4gICAgdWxpZChtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7IGtpbmQ6IFwidWxpZFwiLCAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSkgfSk7XG4gICAgfVxuICAgIGJhc2U2NChtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7IGtpbmQ6IFwiYmFzZTY0XCIsIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSB9KTtcbiAgICB9XG4gICAgYmFzZTY0dXJsKG1lc3NhZ2UpIHtcbiAgICAgICAgLy8gYmFzZTY0dXJsIGVuY29kaW5nIGlzIGEgbW9kaWZpY2F0aW9uIG9mIGJhc2U2NCB0aGF0IGNhbiBzYWZlbHkgYmUgdXNlZCBpbiBVUkxzIGFuZCBmaWxlbmFtZXNcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwiYmFzZTY0dXJsXCIsXG4gICAgICAgICAgICAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBqd3Qob3B0aW9ucykge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soeyBraW5kOiBcImp3dFwiLCAuLi5lcnJvclV0aWwuZXJyVG9PYmoob3B0aW9ucykgfSk7XG4gICAgfVxuICAgIGlwKG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHsga2luZDogXCJpcFwiLCAuLi5lcnJvclV0aWwuZXJyVG9PYmoob3B0aW9ucykgfSk7XG4gICAgfVxuICAgIGNpZHIob3B0aW9ucykge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soeyBraW5kOiBcImNpZHJcIiwgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG9wdGlvbnMpIH0pO1xuICAgIH1cbiAgICBkYXRldGltZShvcHRpb25zKSB7XG4gICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgICAgICBraW5kOiBcImRhdGV0aW1lXCIsXG4gICAgICAgICAgICAgICAgcHJlY2lzaW9uOiBudWxsLFxuICAgICAgICAgICAgICAgIG9mZnNldDogZmFsc2UsXG4gICAgICAgICAgICAgICAgbG9jYWw6IGZhbHNlLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IG9wdGlvbnMsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJkYXRldGltZVwiLFxuICAgICAgICAgICAgcHJlY2lzaW9uOiB0eXBlb2Ygb3B0aW9ucz8ucHJlY2lzaW9uID09PSBcInVuZGVmaW5lZFwiID8gbnVsbCA6IG9wdGlvbnM/LnByZWNpc2lvbixcbiAgICAgICAgICAgIG9mZnNldDogb3B0aW9ucz8ub2Zmc2V0ID8/IGZhbHNlLFxuICAgICAgICAgICAgbG9jYWw6IG9wdGlvbnM/LmxvY2FsID8/IGZhbHNlLFxuICAgICAgICAgICAgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG9wdGlvbnM/Lm1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZGF0ZShtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7IGtpbmQ6IFwiZGF0ZVwiLCBtZXNzYWdlIH0pO1xuICAgIH1cbiAgICB0aW1lKG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAgICAgIGtpbmQ6IFwidGltZVwiLFxuICAgICAgICAgICAgICAgIHByZWNpc2lvbjogbnVsbCxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBvcHRpb25zLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwidGltZVwiLFxuICAgICAgICAgICAgcHJlY2lzaW9uOiB0eXBlb2Ygb3B0aW9ucz8ucHJlY2lzaW9uID09PSBcInVuZGVmaW5lZFwiID8gbnVsbCA6IG9wdGlvbnM/LnByZWNpc2lvbixcbiAgICAgICAgICAgIC4uLmVycm9yVXRpbC5lcnJUb09iaihvcHRpb25zPy5tZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGR1cmF0aW9uKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHsga2luZDogXCJkdXJhdGlvblwiLCAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSkgfSk7XG4gICAgfVxuICAgIHJlZ2V4KHJlZ2V4LCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcInJlZ2V4XCIsXG4gICAgICAgICAgICByZWdleDogcmVnZXgsXG4gICAgICAgICAgICAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBpbmNsdWRlcyh2YWx1ZSwgb3B0aW9ucykge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJpbmNsdWRlc1wiLFxuICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICAgICAgcG9zaXRpb246IG9wdGlvbnM/LnBvc2l0aW9uLFxuICAgICAgICAgICAgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG9wdGlvbnM/Lm1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgc3RhcnRzV2l0aCh2YWx1ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJzdGFydHNXaXRoXCIsXG4gICAgICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgICAgICAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBlbmRzV2l0aCh2YWx1ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJlbmRzV2l0aFwiLFxuICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICAgICAgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbWluKG1pbkxlbmd0aCwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtaW5cIixcbiAgICAgICAgICAgIHZhbHVlOiBtaW5MZW5ndGgsXG4gICAgICAgICAgICAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBtYXgobWF4TGVuZ3RoLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm1heFwiLFxuICAgICAgICAgICAgdmFsdWU6IG1heExlbmd0aCxcbiAgICAgICAgICAgIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGxlbmd0aChsZW4sIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibGVuZ3RoXCIsXG4gICAgICAgICAgICB2YWx1ZTogbGVuLFxuICAgICAgICAgICAgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogRXF1aXZhbGVudCB0byBgLm1pbigxKWBcbiAgICAgKi9cbiAgICBub25lbXB0eShtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm1pbigxLCBlcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSkpO1xuICAgIH1cbiAgICB0cmltKCkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZFN0cmluZyh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBjaGVja3M6IFsuLi50aGlzLl9kZWYuY2hlY2tzLCB7IGtpbmQ6IFwidHJpbVwiIH1dLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgdG9Mb3dlckNhc2UoKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kU3RyaW5nKHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIGNoZWNrczogWy4uLnRoaXMuX2RlZi5jaGVja3MsIHsga2luZDogXCJ0b0xvd2VyQ2FzZVwiIH1dLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgdG9VcHBlckNhc2UoKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kU3RyaW5nKHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIGNoZWNrczogWy4uLnRoaXMuX2RlZi5jaGVja3MsIHsga2luZDogXCJ0b1VwcGVyQ2FzZVwiIH1dLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZ2V0IGlzRGF0ZXRpbWUoKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwiZGF0ZXRpbWVcIik7XG4gICAgfVxuICAgIGdldCBpc0RhdGUoKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwiZGF0ZVwiKTtcbiAgICB9XG4gICAgZ2V0IGlzVGltZSgpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJ0aW1lXCIpO1xuICAgIH1cbiAgICBnZXQgaXNEdXJhdGlvbigpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJkdXJhdGlvblwiKTtcbiAgICB9XG4gICAgZ2V0IGlzRW1haWwoKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwiZW1haWxcIik7XG4gICAgfVxuICAgIGdldCBpc1VSTCgpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJ1cmxcIik7XG4gICAgfVxuICAgIGdldCBpc0Vtb2ppKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcImVtb2ppXCIpO1xuICAgIH1cbiAgICBnZXQgaXNVVUlEKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcInV1aWRcIik7XG4gICAgfVxuICAgIGdldCBpc05BTk9JRCgpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJuYW5vaWRcIik7XG4gICAgfVxuICAgIGdldCBpc0NVSUQoKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwiY3VpZFwiKTtcbiAgICB9XG4gICAgZ2V0IGlzQ1VJRDIoKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwiY3VpZDJcIik7XG4gICAgfVxuICAgIGdldCBpc1VMSUQoKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwidWxpZFwiKTtcbiAgICB9XG4gICAgZ2V0IGlzSVAoKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwiaXBcIik7XG4gICAgfVxuICAgIGdldCBpc0NJRFIoKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwiY2lkclwiKTtcbiAgICB9XG4gICAgZ2V0IGlzQmFzZTY0KCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcImJhc2U2NFwiKTtcbiAgICB9XG4gICAgZ2V0IGlzQmFzZTY0dXJsKCkge1xuICAgICAgICAvLyBiYXNlNjR1cmwgZW5jb2RpbmcgaXMgYSBtb2RpZmljYXRpb24gb2YgYmFzZTY0IHRoYXQgY2FuIHNhZmVseSBiZSB1c2VkIGluIFVSTHMgYW5kIGZpbGVuYW1lc1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcImJhc2U2NHVybFwiKTtcbiAgICB9XG4gICAgZ2V0IG1pbkxlbmd0aCgpIHtcbiAgICAgICAgbGV0IG1pbiA9IG51bGw7XG4gICAgICAgIGZvciAoY29uc3QgY2ggb2YgdGhpcy5fZGVmLmNoZWNrcykge1xuICAgICAgICAgICAgaWYgKGNoLmtpbmQgPT09IFwibWluXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAobWluID09PSBudWxsIHx8IGNoLnZhbHVlID4gbWluKVxuICAgICAgICAgICAgICAgICAgICBtaW4gPSBjaC52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWluO1xuICAgIH1cbiAgICBnZXQgbWF4TGVuZ3RoKCkge1xuICAgICAgICBsZXQgbWF4ID0gbnVsbDtcbiAgICAgICAgZm9yIChjb25zdCBjaCBvZiB0aGlzLl9kZWYuY2hlY2tzKSB7XG4gICAgICAgICAgICBpZiAoY2gua2luZCA9PT0gXCJtYXhcIikge1xuICAgICAgICAgICAgICAgIGlmIChtYXggPT09IG51bGwgfHwgY2gudmFsdWUgPCBtYXgpXG4gICAgICAgICAgICAgICAgICAgIG1heCA9IGNoLnZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXg7XG4gICAgfVxufVxuWm9kU3RyaW5nLmNyZWF0ZSA9IChwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZFN0cmluZyh7XG4gICAgICAgIGNoZWNrczogW10sXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kU3RyaW5nLFxuICAgICAgICBjb2VyY2U6IHBhcmFtcz8uY29lcmNlID8/IGZhbHNlLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuLy8gaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMzk2NjQ4NC93aHktZG9lcy1tb2R1bHVzLW9wZXJhdG9yLXJldHVybi1mcmFjdGlvbmFsLW51bWJlci1pbi1qYXZhc2NyaXB0LzMxNzExMDM0IzMxNzExMDM0XG5mdW5jdGlvbiBmbG9hdFNhZmVSZW1haW5kZXIodmFsLCBzdGVwKSB7XG4gICAgY29uc3QgdmFsRGVjQ291bnQgPSAodmFsLnRvU3RyaW5nKCkuc3BsaXQoXCIuXCIpWzFdIHx8IFwiXCIpLmxlbmd0aDtcbiAgICBjb25zdCBzdGVwRGVjQ291bnQgPSAoc3RlcC50b1N0cmluZygpLnNwbGl0KFwiLlwiKVsxXSB8fCBcIlwiKS5sZW5ndGg7XG4gICAgY29uc3QgZGVjQ291bnQgPSB2YWxEZWNDb3VudCA+IHN0ZXBEZWNDb3VudCA/IHZhbERlY0NvdW50IDogc3RlcERlY0NvdW50O1xuICAgIGNvbnN0IHZhbEludCA9IE51bWJlci5wYXJzZUludCh2YWwudG9GaXhlZChkZWNDb3VudCkucmVwbGFjZShcIi5cIiwgXCJcIikpO1xuICAgIGNvbnN0IHN0ZXBJbnQgPSBOdW1iZXIucGFyc2VJbnQoc3RlcC50b0ZpeGVkKGRlY0NvdW50KS5yZXBsYWNlKFwiLlwiLCBcIlwiKSk7XG4gICAgcmV0dXJuICh2YWxJbnQgJSBzdGVwSW50KSAvIDEwICoqIGRlY0NvdW50O1xufVxuZXhwb3J0IGNsYXNzIFpvZE51bWJlciBleHRlbmRzIFpvZFR5cGUge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzdXBlciguLi5hcmd1bWVudHMpO1xuICAgICAgICB0aGlzLm1pbiA9IHRoaXMuZ3RlO1xuICAgICAgICB0aGlzLm1heCA9IHRoaXMubHRlO1xuICAgICAgICB0aGlzLnN0ZXAgPSB0aGlzLm11bHRpcGxlT2Y7XG4gICAgfVxuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBpZiAodGhpcy5fZGVmLmNvZXJjZSkge1xuICAgICAgICAgICAgaW5wdXQuZGF0YSA9IE51bWJlcihpbnB1dC5kYXRhKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYXJzZWRUeXBlID0gdGhpcy5fZ2V0VHlwZShpbnB1dCk7XG4gICAgICAgIGlmIChwYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLm51bWJlcikge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5udW1iZXIsXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBsZXQgY3R4ID0gdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBzdGF0dXMgPSBuZXcgUGFyc2VTdGF0dXMoKTtcbiAgICAgICAgZm9yIChjb25zdCBjaGVjayBvZiB0aGlzLl9kZWYuY2hlY2tzKSB7XG4gICAgICAgICAgICBpZiAoY2hlY2sua2luZCA9PT0gXCJpbnRcIikge1xuICAgICAgICAgICAgICAgIGlmICghdXRpbC5pc0ludGVnZXIoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBcImludGVnZXJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBcImZsb2F0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJtaW5cIikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRvb1NtYWxsID0gY2hlY2suaW5jbHVzaXZlID8gaW5wdXQuZGF0YSA8IGNoZWNrLnZhbHVlIDogaW5wdXQuZGF0YSA8PSBjaGVjay52YWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAodG9vU21hbGwpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19zbWFsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1pbmltdW06IGNoZWNrLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJudW1iZXJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogY2hlY2suaW5jbHVzaXZlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXhhY3Q6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwibWF4XCIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0b29CaWcgPSBjaGVjay5pbmNsdXNpdmUgPyBpbnB1dC5kYXRhID4gY2hlY2sudmFsdWUgOiBpbnB1dC5kYXRhID49IGNoZWNrLnZhbHVlO1xuICAgICAgICAgICAgICAgIGlmICh0b29CaWcpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19iaWcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXhpbXVtOiBjaGVjay52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwibnVtYmVyXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IGNoZWNrLmluY2x1c2l2ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4YWN0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcIm11bHRpcGxlT2ZcIikge1xuICAgICAgICAgICAgICAgIGlmIChmbG9hdFNhZmVSZW1haW5kZXIoaW5wdXQuZGF0YSwgY2hlY2sudmFsdWUpICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5ub3RfbXVsdGlwbGVfb2YsXG4gICAgICAgICAgICAgICAgICAgICAgICBtdWx0aXBsZU9mOiBjaGVjay52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImZpbml0ZVwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLm5vdF9maW5pdGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdXRpbC5hc3NlcnROZXZlcihjaGVjayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBzdGF0dXMudmFsdWUsIHZhbHVlOiBpbnB1dC5kYXRhIH07XG4gICAgfVxuICAgIGd0ZSh2YWx1ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXRMaW1pdChcIm1pblwiLCB2YWx1ZSwgdHJ1ZSwgZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpKTtcbiAgICB9XG4gICAgZ3QodmFsdWUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0TGltaXQoXCJtaW5cIiwgdmFsdWUsIGZhbHNlLCBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSkpO1xuICAgIH1cbiAgICBsdGUodmFsdWUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0TGltaXQoXCJtYXhcIiwgdmFsdWUsIHRydWUsIGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSk7XG4gICAgfVxuICAgIGx0KHZhbHVlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldExpbWl0KFwibWF4XCIsIHZhbHVlLCBmYWxzZSwgZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpKTtcbiAgICB9XG4gICAgc2V0TGltaXQoa2luZCwgdmFsdWUsIGluY2x1c2l2ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZE51bWJlcih7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBjaGVja3M6IFtcbiAgICAgICAgICAgICAgICAuLi50aGlzLl9kZWYuY2hlY2tzLFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAga2luZCxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBdLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgX2FkZENoZWNrKGNoZWNrKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kTnVtYmVyKHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIGNoZWNrczogWy4uLnRoaXMuX2RlZi5jaGVja3MsIGNoZWNrXSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGludChtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcImludFwiLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcG9zaXRpdmUobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtaW5cIixcbiAgICAgICAgICAgIHZhbHVlOiAwLFxuICAgICAgICAgICAgaW5jbHVzaXZlOiBmYWxzZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG5lZ2F0aXZlKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibWF4XCIsXG4gICAgICAgICAgICB2YWx1ZTogMCxcbiAgICAgICAgICAgIGluY2x1c2l2ZTogZmFsc2UsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBub25wb3NpdGl2ZShtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm1heFwiLFxuICAgICAgICAgICAgdmFsdWU6IDAsXG4gICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBub25uZWdhdGl2ZShtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm1pblwiLFxuICAgICAgICAgICAgdmFsdWU6IDAsXG4gICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBtdWx0aXBsZU9mKHZhbHVlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm11bHRpcGxlT2ZcIixcbiAgICAgICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGZpbml0ZShtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcImZpbml0ZVwiLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgc2FmZShtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm1pblwiLFxuICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgdmFsdWU6IE51bWJlci5NSU5fU0FGRV9JTlRFR0VSLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KS5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtYXhcIixcbiAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgIHZhbHVlOiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUixcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGdldCBtaW5WYWx1ZSgpIHtcbiAgICAgICAgbGV0IG1pbiA9IG51bGw7XG4gICAgICAgIGZvciAoY29uc3QgY2ggb2YgdGhpcy5fZGVmLmNoZWNrcykge1xuICAgICAgICAgICAgaWYgKGNoLmtpbmQgPT09IFwibWluXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAobWluID09PSBudWxsIHx8IGNoLnZhbHVlID4gbWluKVxuICAgICAgICAgICAgICAgICAgICBtaW4gPSBjaC52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWluO1xuICAgIH1cbiAgICBnZXQgbWF4VmFsdWUoKSB7XG4gICAgICAgIGxldCBtYXggPSBudWxsO1xuICAgICAgICBmb3IgKGNvbnN0IGNoIG9mIHRoaXMuX2RlZi5jaGVja3MpIHtcbiAgICAgICAgICAgIGlmIChjaC5raW5kID09PSBcIm1heFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1heCA9PT0gbnVsbCB8fCBjaC52YWx1ZSA8IG1heClcbiAgICAgICAgICAgICAgICAgICAgbWF4ID0gY2gudmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1heDtcbiAgICB9XG4gICAgZ2V0IGlzSW50KCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcImludFwiIHx8IChjaC5raW5kID09PSBcIm11bHRpcGxlT2ZcIiAmJiB1dGlsLmlzSW50ZWdlcihjaC52YWx1ZSkpKTtcbiAgICB9XG4gICAgZ2V0IGlzRmluaXRlKCkge1xuICAgICAgICBsZXQgbWF4ID0gbnVsbDtcbiAgICAgICAgbGV0IG1pbiA9IG51bGw7XG4gICAgICAgIGZvciAoY29uc3QgY2ggb2YgdGhpcy5fZGVmLmNoZWNrcykge1xuICAgICAgICAgICAgaWYgKGNoLmtpbmQgPT09IFwiZmluaXRlXCIgfHwgY2gua2luZCA9PT0gXCJpbnRcIiB8fCBjaC5raW5kID09PSBcIm11bHRpcGxlT2ZcIikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2gua2luZCA9PT0gXCJtaW5cIikge1xuICAgICAgICAgICAgICAgIGlmIChtaW4gPT09IG51bGwgfHwgY2gudmFsdWUgPiBtaW4pXG4gICAgICAgICAgICAgICAgICAgIG1pbiA9IGNoLnZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2gua2luZCA9PT0gXCJtYXhcIikge1xuICAgICAgICAgICAgICAgIGlmIChtYXggPT09IG51bGwgfHwgY2gudmFsdWUgPCBtYXgpXG4gICAgICAgICAgICAgICAgICAgIG1heCA9IGNoLnZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBOdW1iZXIuaXNGaW5pdGUobWluKSAmJiBOdW1iZXIuaXNGaW5pdGUobWF4KTtcbiAgICB9XG59XG5ab2ROdW1iZXIuY3JlYXRlID0gKHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kTnVtYmVyKHtcbiAgICAgICAgY2hlY2tzOiBbXSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2ROdW1iZXIsXG4gICAgICAgIGNvZXJjZTogcGFyYW1zPy5jb2VyY2UgfHwgZmFsc2UsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kQmlnSW50IGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHN1cGVyKC4uLmFyZ3VtZW50cyk7XG4gICAgICAgIHRoaXMubWluID0gdGhpcy5ndGU7XG4gICAgICAgIHRoaXMubWF4ID0gdGhpcy5sdGU7XG4gICAgfVxuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBpZiAodGhpcy5fZGVmLmNvZXJjZSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBpbnB1dC5kYXRhID0gQmlnSW50KGlucHV0LmRhdGEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2gge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9nZXRJbnZhbGlkSW5wdXQoaW5wdXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhcnNlZFR5cGUgPSB0aGlzLl9nZXRUeXBlKGlucHV0KTtcbiAgICAgICAgaWYgKHBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUuYmlnaW50KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZ2V0SW52YWxpZElucHV0KGlucHV0KTtcbiAgICAgICAgfVxuICAgICAgICBsZXQgY3R4ID0gdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBzdGF0dXMgPSBuZXcgUGFyc2VTdGF0dXMoKTtcbiAgICAgICAgZm9yIChjb25zdCBjaGVjayBvZiB0aGlzLl9kZWYuY2hlY2tzKSB7XG4gICAgICAgICAgICBpZiAoY2hlY2sua2luZCA9PT0gXCJtaW5cIikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRvb1NtYWxsID0gY2hlY2suaW5jbHVzaXZlID8gaW5wdXQuZGF0YSA8IGNoZWNrLnZhbHVlIDogaW5wdXQuZGF0YSA8PSBjaGVjay52YWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAodG9vU21hbGwpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19zbWFsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiYmlnaW50XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBtaW5pbXVtOiBjaGVjay52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogY2hlY2suaW5jbHVzaXZlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwibWF4XCIpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0b29CaWcgPSBjaGVjay5pbmNsdXNpdmUgPyBpbnB1dC5kYXRhID4gY2hlY2sudmFsdWUgOiBpbnB1dC5kYXRhID49IGNoZWNrLnZhbHVlO1xuICAgICAgICAgICAgICAgIGlmICh0b29CaWcpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19iaWcsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcImJpZ2ludFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWF4aW11bTogY2hlY2sudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IGNoZWNrLmluY2x1c2l2ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcIm11bHRpcGxlT2ZcIikge1xuICAgICAgICAgICAgICAgIGlmIChpbnB1dC5kYXRhICUgY2hlY2sudmFsdWUgIT09IEJpZ0ludCgwKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUubm90X211bHRpcGxlX29mLFxuICAgICAgICAgICAgICAgICAgICAgICAgbXVsdGlwbGVPZjogY2hlY2sudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdXRpbC5hc3NlcnROZXZlcihjaGVjayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBzdGF0dXMudmFsdWUsIHZhbHVlOiBpbnB1dC5kYXRhIH07XG4gICAgfVxuICAgIF9nZXRJbnZhbGlkSW5wdXQoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5iaWdpbnQsXG4gICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICB9XG4gICAgZ3RlKHZhbHVlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldExpbWl0KFwibWluXCIsIHZhbHVlLCB0cnVlLCBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSkpO1xuICAgIH1cbiAgICBndCh2YWx1ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXRMaW1pdChcIm1pblwiLCB2YWx1ZSwgZmFsc2UsIGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSk7XG4gICAgfVxuICAgIGx0ZSh2YWx1ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXRMaW1pdChcIm1heFwiLCB2YWx1ZSwgdHJ1ZSwgZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpKTtcbiAgICB9XG4gICAgbHQodmFsdWUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0TGltaXQoXCJtYXhcIiwgdmFsdWUsIGZhbHNlLCBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSkpO1xuICAgIH1cbiAgICBzZXRMaW1pdChraW5kLCB2YWx1ZSwgaW5jbHVzaXZlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kQmlnSW50KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIGNoZWNrczogW1xuICAgICAgICAgICAgICAgIC4uLnRoaXMuX2RlZi5jaGVja3MsXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBraW5kLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBfYWRkQ2hlY2soY2hlY2spIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RCaWdJbnQoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgY2hlY2tzOiBbLi4udGhpcy5fZGVmLmNoZWNrcywgY2hlY2tdLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcG9zaXRpdmUobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtaW5cIixcbiAgICAgICAgICAgIHZhbHVlOiBCaWdJbnQoMCksXG4gICAgICAgICAgICBpbmNsdXNpdmU6IGZhbHNlLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbmVnYXRpdmUobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtYXhcIixcbiAgICAgICAgICAgIHZhbHVlOiBCaWdJbnQoMCksXG4gICAgICAgICAgICBpbmNsdXNpdmU6IGZhbHNlLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbm9ucG9zaXRpdmUobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtYXhcIixcbiAgICAgICAgICAgIHZhbHVlOiBCaWdJbnQoMCksXG4gICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBub25uZWdhdGl2ZShtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm1pblwiLFxuICAgICAgICAgICAgdmFsdWU6IEJpZ0ludCgwKSxcbiAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG11bHRpcGxlT2YodmFsdWUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibXVsdGlwbGVPZlwiLFxuICAgICAgICAgICAgdmFsdWUsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBnZXQgbWluVmFsdWUoKSB7XG4gICAgICAgIGxldCBtaW4gPSBudWxsO1xuICAgICAgICBmb3IgKGNvbnN0IGNoIG9mIHRoaXMuX2RlZi5jaGVja3MpIHtcbiAgICAgICAgICAgIGlmIChjaC5raW5kID09PSBcIm1pblwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1pbiA9PT0gbnVsbCB8fCBjaC52YWx1ZSA+IG1pbilcbiAgICAgICAgICAgICAgICAgICAgbWluID0gY2gudmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1pbjtcbiAgICB9XG4gICAgZ2V0IG1heFZhbHVlKCkge1xuICAgICAgICBsZXQgbWF4ID0gbnVsbDtcbiAgICAgICAgZm9yIChjb25zdCBjaCBvZiB0aGlzLl9kZWYuY2hlY2tzKSB7XG4gICAgICAgICAgICBpZiAoY2gua2luZCA9PT0gXCJtYXhcIikge1xuICAgICAgICAgICAgICAgIGlmIChtYXggPT09IG51bGwgfHwgY2gudmFsdWUgPCBtYXgpXG4gICAgICAgICAgICAgICAgICAgIG1heCA9IGNoLnZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXg7XG4gICAgfVxufVxuWm9kQmlnSW50LmNyZWF0ZSA9IChwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZEJpZ0ludCh7XG4gICAgICAgIGNoZWNrczogW10sXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kQmlnSW50LFxuICAgICAgICBjb2VyY2U6IHBhcmFtcz8uY29lcmNlID8/IGZhbHNlLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZEJvb2xlYW4gZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgaWYgKHRoaXMuX2RlZi5jb2VyY2UpIHtcbiAgICAgICAgICAgIGlucHV0LmRhdGEgPSBCb29sZWFuKGlucHV0LmRhdGEpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhcnNlZFR5cGUgPSB0aGlzLl9nZXRUeXBlKGlucHV0KTtcbiAgICAgICAgaWYgKHBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUuYm9vbGVhbikge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5ib29sZWFuLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIE9LKGlucHV0LmRhdGEpO1xuICAgIH1cbn1cblpvZEJvb2xlYW4uY3JlYXRlID0gKHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kQm9vbGVhbih7XG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kQm9vbGVhbixcbiAgICAgICAgY29lcmNlOiBwYXJhbXM/LmNvZXJjZSB8fCBmYWxzZSxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2REYXRlIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGlmICh0aGlzLl9kZWYuY29lcmNlKSB7XG4gICAgICAgICAgICBpbnB1dC5kYXRhID0gbmV3IERhdGUoaW5wdXQuZGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFyc2VkVHlwZSA9IHRoaXMuX2dldFR5cGUoaW5wdXQpO1xuICAgICAgICBpZiAocGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5kYXRlKSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLmRhdGUsXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoTnVtYmVyLmlzTmFOKGlucHV0LmRhdGEuZ2V0VGltZSgpKSkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfZGF0ZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc3RhdHVzID0gbmV3IFBhcnNlU3RhdHVzKCk7XG4gICAgICAgIGxldCBjdHggPSB1bmRlZmluZWQ7XG4gICAgICAgIGZvciAoY29uc3QgY2hlY2sgb2YgdGhpcy5fZGVmLmNoZWNrcykge1xuICAgICAgICAgICAgaWYgKGNoZWNrLmtpbmQgPT09IFwibWluXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoaW5wdXQuZGF0YS5nZXRUaW1lKCkgPCBjaGVjay52YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX3NtYWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4YWN0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1pbmltdW06IGNoZWNrLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJkYXRlXCIsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcIm1heFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlucHV0LmRhdGEuZ2V0VGltZSgpID4gY2hlY2sudmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19iaWcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXhhY3Q6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWF4aW11bTogY2hlY2sudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcImRhdGVcIixcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHV0aWwuYXNzZXJ0TmV2ZXIoY2hlY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdGF0dXM6IHN0YXR1cy52YWx1ZSxcbiAgICAgICAgICAgIHZhbHVlOiBuZXcgRGF0ZShpbnB1dC5kYXRhLmdldFRpbWUoKSksXG4gICAgICAgIH07XG4gICAgfVxuICAgIF9hZGRDaGVjayhjaGVjaykge1xuICAgICAgICByZXR1cm4gbmV3IFpvZERhdGUoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgY2hlY2tzOiBbLi4udGhpcy5fZGVmLmNoZWNrcywgY2hlY2tdLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbWluKG1pbkRhdGUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibWluXCIsXG4gICAgICAgICAgICB2YWx1ZTogbWluRGF0ZS5nZXRUaW1lKCksXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBtYXgobWF4RGF0ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtYXhcIixcbiAgICAgICAgICAgIHZhbHVlOiBtYXhEYXRlLmdldFRpbWUoKSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGdldCBtaW5EYXRlKCkge1xuICAgICAgICBsZXQgbWluID0gbnVsbDtcbiAgICAgICAgZm9yIChjb25zdCBjaCBvZiB0aGlzLl9kZWYuY2hlY2tzKSB7XG4gICAgICAgICAgICBpZiAoY2gua2luZCA9PT0gXCJtaW5cIikge1xuICAgICAgICAgICAgICAgIGlmIChtaW4gPT09IG51bGwgfHwgY2gudmFsdWUgPiBtaW4pXG4gICAgICAgICAgICAgICAgICAgIG1pbiA9IGNoLnZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtaW4gIT0gbnVsbCA/IG5ldyBEYXRlKG1pbikgOiBudWxsO1xuICAgIH1cbiAgICBnZXQgbWF4RGF0ZSgpIHtcbiAgICAgICAgbGV0IG1heCA9IG51bGw7XG4gICAgICAgIGZvciAoY29uc3QgY2ggb2YgdGhpcy5fZGVmLmNoZWNrcykge1xuICAgICAgICAgICAgaWYgKGNoLmtpbmQgPT09IFwibWF4XCIpIHtcbiAgICAgICAgICAgICAgICBpZiAobWF4ID09PSBudWxsIHx8IGNoLnZhbHVlIDwgbWF4KVxuICAgICAgICAgICAgICAgICAgICBtYXggPSBjaC52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWF4ICE9IG51bGwgPyBuZXcgRGF0ZShtYXgpIDogbnVsbDtcbiAgICB9XG59XG5ab2REYXRlLmNyZWF0ZSA9IChwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZERhdGUoe1xuICAgICAgICBjaGVja3M6IFtdLFxuICAgICAgICBjb2VyY2U6IHBhcmFtcz8uY29lcmNlIHx8IGZhbHNlLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZERhdGUsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kU3ltYm9sIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZFR5cGUgPSB0aGlzLl9nZXRUeXBlKGlucHV0KTtcbiAgICAgICAgaWYgKHBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUuc3ltYm9sKSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLnN5bWJvbCxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBPSyhpbnB1dC5kYXRhKTtcbiAgICB9XG59XG5ab2RTeW1ib2wuY3JlYXRlID0gKHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kU3ltYm9sKHtcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RTeW1ib2wsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kVW5kZWZpbmVkIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZFR5cGUgPSB0aGlzLl9nZXRUeXBlKGlucHV0KTtcbiAgICAgICAgaWYgKHBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUudW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLnVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBPSyhpbnB1dC5kYXRhKTtcbiAgICB9XG59XG5ab2RVbmRlZmluZWQuY3JlYXRlID0gKHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kVW5kZWZpbmVkKHtcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RVbmRlZmluZWQsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kTnVsbCBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCBwYXJzZWRUeXBlID0gdGhpcy5fZ2V0VHlwZShpbnB1dCk7XG4gICAgICAgIGlmIChwYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLm51bGwpIHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUubnVsbCxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBPSyhpbnB1dC5kYXRhKTtcbiAgICB9XG59XG5ab2ROdWxsLmNyZWF0ZSA9IChwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZE51bGwoe1xuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZE51bGwsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kQW55IGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHN1cGVyKC4uLmFyZ3VtZW50cyk7XG4gICAgICAgIC8vIHRvIHByZXZlbnQgaW5zdGFuY2VzIG9mIG90aGVyIGNsYXNzZXMgZnJvbSBleHRlbmRpbmcgWm9kQW55LiB0aGlzIGNhdXNlcyBpc3N1ZXMgd2l0aCBjYXRjaGFsbCBpbiBab2RPYmplY3QuXG4gICAgICAgIHRoaXMuX2FueSA9IHRydWU7XG4gICAgfVxuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICByZXR1cm4gT0soaW5wdXQuZGF0YSk7XG4gICAgfVxufVxuWm9kQW55LmNyZWF0ZSA9IChwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZEFueSh7XG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kQW55LFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZFVua25vd24gZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoLi4uYXJndW1lbnRzKTtcbiAgICAgICAgLy8gcmVxdWlyZWRcbiAgICAgICAgdGhpcy5fdW5rbm93biA9IHRydWU7XG4gICAgfVxuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICByZXR1cm4gT0soaW5wdXQuZGF0YSk7XG4gICAgfVxufVxuWm9kVW5rbm93bi5jcmVhdGUgPSAocGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RVbmtub3duKHtcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RVbmtub3duLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZE5ldmVyIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUubmV2ZXIsXG4gICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICB9XG59XG5ab2ROZXZlci5jcmVhdGUgPSAocGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2ROZXZlcih7XG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kTmV2ZXIsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kVm9pZCBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCBwYXJzZWRUeXBlID0gdGhpcy5fZ2V0VHlwZShpbnB1dCk7XG4gICAgICAgIGlmIChwYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLnVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS52b2lkLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIE9LKGlucHV0LmRhdGEpO1xuICAgIH1cbn1cblpvZFZvaWQuY3JlYXRlID0gKHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kVm9pZCh7XG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kVm9pZCxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RBcnJheSBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IGN0eCwgc3RhdHVzIH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBjb25zdCBkZWYgPSB0aGlzLl9kZWY7XG4gICAgICAgIGlmIChjdHgucGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5hcnJheSkge1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5hcnJheSxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGlmIChkZWYuZXhhY3RMZW5ndGggIT09IG51bGwpIHtcbiAgICAgICAgICAgIGNvbnN0IHRvb0JpZyA9IGN0eC5kYXRhLmxlbmd0aCA+IGRlZi5leGFjdExlbmd0aC52YWx1ZTtcbiAgICAgICAgICAgIGNvbnN0IHRvb1NtYWxsID0gY3R4LmRhdGEubGVuZ3RoIDwgZGVmLmV4YWN0TGVuZ3RoLnZhbHVlO1xuICAgICAgICAgICAgaWYgKHRvb0JpZyB8fCB0b29TbWFsbCkge1xuICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICBjb2RlOiB0b29CaWcgPyBab2RJc3N1ZUNvZGUudG9vX2JpZyA6IFpvZElzc3VlQ29kZS50b29fc21hbGwsXG4gICAgICAgICAgICAgICAgICAgIG1pbmltdW06ICh0b29TbWFsbCA/IGRlZi5leGFjdExlbmd0aC52YWx1ZSA6IHVuZGVmaW5lZCksXG4gICAgICAgICAgICAgICAgICAgIG1heGltdW06ICh0b29CaWcgPyBkZWYuZXhhY3RMZW5ndGgudmFsdWUgOiB1bmRlZmluZWQpLFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZXhhY3Q6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGRlZi5leGFjdExlbmd0aC5tZXNzYWdlLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChkZWYubWluTGVuZ3RoICE9PSBudWxsKSB7XG4gICAgICAgICAgICBpZiAoY3R4LmRhdGEubGVuZ3RoIDwgZGVmLm1pbkxlbmd0aC52YWx1ZSkge1xuICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX3NtYWxsLFxuICAgICAgICAgICAgICAgICAgICBtaW5pbXVtOiBkZWYubWluTGVuZ3RoLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZXhhY3Q6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBkZWYubWluTGVuZ3RoLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRlZi5tYXhMZW5ndGggIT09IG51bGwpIHtcbiAgICAgICAgICAgIGlmIChjdHguZGF0YS5sZW5ndGggPiBkZWYubWF4TGVuZ3RoLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fYmlnLFxuICAgICAgICAgICAgICAgICAgICBtYXhpbXVtOiBkZWYubWF4TGVuZ3RoLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZXhhY3Q6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBkZWYubWF4TGVuZ3RoLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGN0eC5jb21tb24uYXN5bmMpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChbLi4uY3R4LmRhdGFdLm1hcCgoaXRlbSwgaSkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBkZWYudHlwZS5fcGFyc2VBc3luYyhuZXcgUGFyc2VJbnB1dExhenlQYXRoKGN0eCwgaXRlbSwgY3R4LnBhdGgsIGkpKTtcbiAgICAgICAgICAgIH0pKS50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gUGFyc2VTdGF0dXMubWVyZ2VBcnJheShzdGF0dXMsIHJlc3VsdCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXN1bHQgPSBbLi4uY3R4LmRhdGFdLm1hcCgoaXRlbSwgaSkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGRlZi50eXBlLl9wYXJzZVN5bmMobmV3IFBhcnNlSW5wdXRMYXp5UGF0aChjdHgsIGl0ZW0sIGN0eC5wYXRoLCBpKSk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gUGFyc2VTdGF0dXMubWVyZ2VBcnJheShzdGF0dXMsIHJlc3VsdCk7XG4gICAgfVxuICAgIGdldCBlbGVtZW50KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnR5cGU7XG4gICAgfVxuICAgIG1pbihtaW5MZW5ndGgsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RBcnJheSh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBtaW5MZW5ndGg6IHsgdmFsdWU6IG1pbkxlbmd0aCwgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpIH0sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBtYXgobWF4TGVuZ3RoLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kQXJyYXkoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgbWF4TGVuZ3RoOiB7IHZhbHVlOiBtYXhMZW5ndGgsIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSB9LFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbGVuZ3RoKGxlbiwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZEFycmF5KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIGV4YWN0TGVuZ3RoOiB7IHZhbHVlOiBsZW4sIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSB9LFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbm9uZW1wdHkobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5taW4oMSwgbWVzc2FnZSk7XG4gICAgfVxufVxuWm9kQXJyYXkuY3JlYXRlID0gKHNjaGVtYSwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RBcnJheSh7XG4gICAgICAgIHR5cGU6IHNjaGVtYSxcbiAgICAgICAgbWluTGVuZ3RoOiBudWxsLFxuICAgICAgICBtYXhMZW5ndGg6IG51bGwsXG4gICAgICAgIGV4YWN0TGVuZ3RoOiBudWxsLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZEFycmF5LFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZnVuY3Rpb24gZGVlcFBhcnRpYWxpZnkoc2NoZW1hKSB7XG4gICAgaWYgKHNjaGVtYSBpbnN0YW5jZW9mIFpvZE9iamVjdCkge1xuICAgICAgICBjb25zdCBuZXdTaGFwZSA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBzY2hlbWEuc2hhcGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkU2NoZW1hID0gc2NoZW1hLnNoYXBlW2tleV07XG4gICAgICAgICAgICBuZXdTaGFwZVtrZXldID0gWm9kT3B0aW9uYWwuY3JlYXRlKGRlZXBQYXJ0aWFsaWZ5KGZpZWxkU2NoZW1hKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBab2RPYmplY3Qoe1xuICAgICAgICAgICAgLi4uc2NoZW1hLl9kZWYsXG4gICAgICAgICAgICBzaGFwZTogKCkgPT4gbmV3U2hhcGUsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBlbHNlIGlmIChzY2hlbWEgaW5zdGFuY2VvZiBab2RBcnJheSkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZEFycmF5KHtcbiAgICAgICAgICAgIC4uLnNjaGVtYS5fZGVmLFxuICAgICAgICAgICAgdHlwZTogZGVlcFBhcnRpYWxpZnkoc2NoZW1hLmVsZW1lbnQpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZWxzZSBpZiAoc2NoZW1hIGluc3RhbmNlb2YgWm9kT3B0aW9uYWwpIHtcbiAgICAgICAgcmV0dXJuIFpvZE9wdGlvbmFsLmNyZWF0ZShkZWVwUGFydGlhbGlmeShzY2hlbWEudW53cmFwKCkpKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoc2NoZW1hIGluc3RhbmNlb2YgWm9kTnVsbGFibGUpIHtcbiAgICAgICAgcmV0dXJuIFpvZE51bGxhYmxlLmNyZWF0ZShkZWVwUGFydGlhbGlmeShzY2hlbWEudW53cmFwKCkpKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoc2NoZW1hIGluc3RhbmNlb2YgWm9kVHVwbGUpIHtcbiAgICAgICAgcmV0dXJuIFpvZFR1cGxlLmNyZWF0ZShzY2hlbWEuaXRlbXMubWFwKChpdGVtKSA9PiBkZWVwUGFydGlhbGlmeShpdGVtKSkpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHNjaGVtYTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgWm9kT2JqZWN0IGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHN1cGVyKC4uLmFyZ3VtZW50cyk7XG4gICAgICAgIHRoaXMuX2NhY2hlZCA9IG51bGw7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZGVwcmVjYXRlZCBJbiBtb3N0IGNhc2VzLCB0aGlzIGlzIG5vIGxvbmdlciBuZWVkZWQgLSB1bmtub3duIHByb3BlcnRpZXMgYXJlIG5vdyBzaWxlbnRseSBzdHJpcHBlZC5cbiAgICAgICAgICogSWYgeW91IHdhbnQgdG8gcGFzcyB0aHJvdWdoIHVua25vd24gcHJvcGVydGllcywgdXNlIGAucGFzc3Rocm91Z2goKWAgaW5zdGVhZC5cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMubm9uc3RyaWN0ID0gdGhpcy5wYXNzdGhyb3VnaDtcbiAgICAgICAgLy8gZXh0ZW5kPFxuICAgICAgICAvLyAgIEF1Z21lbnRhdGlvbiBleHRlbmRzIFpvZFJhd1NoYXBlLFxuICAgICAgICAvLyAgIE5ld091dHB1dCBleHRlbmRzIHV0aWwuZmxhdHRlbjx7XG4gICAgICAgIC8vICAgICBbayBpbiBrZXlvZiBBdWdtZW50YXRpb24gfCBrZXlvZiBPdXRwdXRdOiBrIGV4dGVuZHMga2V5b2YgQXVnbWVudGF0aW9uXG4gICAgICAgIC8vICAgICAgID8gQXVnbWVudGF0aW9uW2tdW1wiX291dHB1dFwiXVxuICAgICAgICAvLyAgICAgICA6IGsgZXh0ZW5kcyBrZXlvZiBPdXRwdXRcbiAgICAgICAgLy8gICAgICAgPyBPdXRwdXRba11cbiAgICAgICAgLy8gICAgICAgOiBuZXZlcjtcbiAgICAgICAgLy8gICB9PixcbiAgICAgICAgLy8gICBOZXdJbnB1dCBleHRlbmRzIHV0aWwuZmxhdHRlbjx7XG4gICAgICAgIC8vICAgICBbayBpbiBrZXlvZiBBdWdtZW50YXRpb24gfCBrZXlvZiBJbnB1dF06IGsgZXh0ZW5kcyBrZXlvZiBBdWdtZW50YXRpb25cbiAgICAgICAgLy8gICAgICAgPyBBdWdtZW50YXRpb25ba11bXCJfaW5wdXRcIl1cbiAgICAgICAgLy8gICAgICAgOiBrIGV4dGVuZHMga2V5b2YgSW5wdXRcbiAgICAgICAgLy8gICAgICAgPyBJbnB1dFtrXVxuICAgICAgICAvLyAgICAgICA6IG5ldmVyO1xuICAgICAgICAvLyAgIH0+XG4gICAgICAgIC8vID4oXG4gICAgICAgIC8vICAgYXVnbWVudGF0aW9uOiBBdWdtZW50YXRpb25cbiAgICAgICAgLy8gKTogWm9kT2JqZWN0PFxuICAgICAgICAvLyAgIGV4dGVuZFNoYXBlPFQsIEF1Z21lbnRhdGlvbj4sXG4gICAgICAgIC8vICAgVW5rbm93bktleXMsXG4gICAgICAgIC8vICAgQ2F0Y2hhbGwsXG4gICAgICAgIC8vICAgTmV3T3V0cHV0LFxuICAgICAgICAvLyAgIE5ld0lucHV0XG4gICAgICAgIC8vID4ge1xuICAgICAgICAvLyAgIHJldHVybiBuZXcgWm9kT2JqZWN0KHtcbiAgICAgICAgLy8gICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgLy8gICAgIHNoYXBlOiAoKSA9PiAoe1xuICAgICAgICAvLyAgICAgICAuLi50aGlzLl9kZWYuc2hhcGUoKSxcbiAgICAgICAgLy8gICAgICAgLi4uYXVnbWVudGF0aW9uLFxuICAgICAgICAvLyAgICAgfSksXG4gICAgICAgIC8vICAgfSkgYXMgYW55O1xuICAgICAgICAvLyB9XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZGVwcmVjYXRlZCBVc2UgYC5leHRlbmRgIGluc3RlYWRcbiAgICAgICAgICogICovXG4gICAgICAgIHRoaXMuYXVnbWVudCA9IHRoaXMuZXh0ZW5kO1xuICAgIH1cbiAgICBfZ2V0Q2FjaGVkKCkge1xuICAgICAgICBpZiAodGhpcy5fY2FjaGVkICE9PSBudWxsKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NhY2hlZDtcbiAgICAgICAgY29uc3Qgc2hhcGUgPSB0aGlzLl9kZWYuc2hhcGUoKTtcbiAgICAgICAgY29uc3Qga2V5cyA9IHV0aWwub2JqZWN0S2V5cyhzaGFwZSk7XG4gICAgICAgIHRoaXMuX2NhY2hlZCA9IHsgc2hhcGUsIGtleXMgfTtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2NhY2hlZDtcbiAgICB9XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZFR5cGUgPSB0aGlzLl9nZXRUeXBlKGlucHV0KTtcbiAgICAgICAgaWYgKHBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUub2JqZWN0KSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLm9iamVjdCxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHsgc3RhdHVzLCBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGNvbnN0IHsgc2hhcGUsIGtleXM6IHNoYXBlS2V5cyB9ID0gdGhpcy5fZ2V0Q2FjaGVkKCk7XG4gICAgICAgIGNvbnN0IGV4dHJhS2V5cyA9IFtdO1xuICAgICAgICBpZiAoISh0aGlzLl9kZWYuY2F0Y2hhbGwgaW5zdGFuY2VvZiBab2ROZXZlciAmJiB0aGlzLl9kZWYudW5rbm93bktleXMgPT09IFwic3RyaXBcIikpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGN0eC5kYXRhKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzaGFwZUtleXMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgICAgICAgICAgICAgICBleHRyYUtleXMucHVzaChrZXkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYWlycyA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBzaGFwZUtleXMpIHtcbiAgICAgICAgICAgIGNvbnN0IGtleVZhbGlkYXRvciA9IHNoYXBlW2tleV07XG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IGN0eC5kYXRhW2tleV07XG4gICAgICAgICAgICBwYWlycy5wdXNoKHtcbiAgICAgICAgICAgICAgICBrZXk6IHsgc3RhdHVzOiBcInZhbGlkXCIsIHZhbHVlOiBrZXkgfSxcbiAgICAgICAgICAgICAgICB2YWx1ZToga2V5VmFsaWRhdG9yLl9wYXJzZShuZXcgUGFyc2VJbnB1dExhenlQYXRoKGN0eCwgdmFsdWUsIGN0eC5wYXRoLCBrZXkpKSxcbiAgICAgICAgICAgICAgICBhbHdheXNTZXQ6IGtleSBpbiBjdHguZGF0YSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLl9kZWYuY2F0Y2hhbGwgaW5zdGFuY2VvZiBab2ROZXZlcikge1xuICAgICAgICAgICAgY29uc3QgdW5rbm93bktleXMgPSB0aGlzLl9kZWYudW5rbm93bktleXM7XG4gICAgICAgICAgICBpZiAodW5rbm93bktleXMgPT09IFwicGFzc3Rocm91Z2hcIikge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IG9mIGV4dHJhS2V5cykge1xuICAgICAgICAgICAgICAgICAgICBwYWlycy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleTogeyBzdGF0dXM6IFwidmFsaWRcIiwgdmFsdWU6IGtleSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHsgc3RhdHVzOiBcInZhbGlkXCIsIHZhbHVlOiBjdHguZGF0YVtrZXldIH0sXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHVua25vd25LZXlzID09PSBcInN0cmljdFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKGV4dHJhS2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnVucmVjb2duaXplZF9rZXlzLFxuICAgICAgICAgICAgICAgICAgICAgICAga2V5czogZXh0cmFLZXlzLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodW5rbm93bktleXMgPT09IFwic3RyaXBcIikge1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnRlcm5hbCBab2RPYmplY3QgZXJyb3I6IGludmFsaWQgdW5rbm93bktleXMgdmFsdWUuYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAvLyBydW4gY2F0Y2hhbGwgdmFsaWRhdGlvblxuICAgICAgICAgICAgY29uc3QgY2F0Y2hhbGwgPSB0aGlzLl9kZWYuY2F0Y2hhbGw7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBleHRyYUtleXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IGN0eC5kYXRhW2tleV07XG4gICAgICAgICAgICAgICAgcGFpcnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGtleTogeyBzdGF0dXM6IFwidmFsaWRcIiwgdmFsdWU6IGtleSB9LFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogY2F0Y2hhbGwuX3BhcnNlKG5ldyBQYXJzZUlucHV0TGF6eVBhdGgoY3R4LCB2YWx1ZSwgY3R4LnBhdGgsIGtleSkgLy8sIGN0eC5jaGlsZChrZXkpLCB2YWx1ZSwgZ2V0UGFyc2VkVHlwZSh2YWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICAgICAgYWx3YXlzU2V0OiBrZXkgaW4gY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGN0eC5jb21tb24uYXN5bmMpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgICAgICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBzeW5jUGFpcnMgPSBbXTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHBhaXIgb2YgcGFpcnMpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gYXdhaXQgcGFpci5rZXk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gYXdhaXQgcGFpci52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgc3luY1BhaXJzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5LFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBhbHdheXNTZXQ6IHBhaXIuYWx3YXlzU2V0LFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHN5bmNQYWlycztcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnRoZW4oKHN5bmNQYWlycykgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBQYXJzZVN0YXR1cy5tZXJnZU9iamVjdFN5bmMoc3RhdHVzLCBzeW5jUGFpcnMpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gUGFyc2VTdGF0dXMubWVyZ2VPYmplY3RTeW5jKHN0YXR1cywgcGFpcnMpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGdldCBzaGFwZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5zaGFwZSgpO1xuICAgIH1cbiAgICBzdHJpY3QobWVzc2FnZSkge1xuICAgICAgICBlcnJvclV0aWwuZXJyVG9PYmo7XG4gICAgICAgIHJldHVybiBuZXcgWm9kT2JqZWN0KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIHVua25vd25LZXlzOiBcInN0cmljdFwiLFxuICAgICAgICAgICAgLi4uKG1lc3NhZ2UgIT09IHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgID8ge1xuICAgICAgICAgICAgICAgICAgICBlcnJvck1hcDogKGlzc3VlLCBjdHgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGRlZmF1bHRFcnJvciA9IHRoaXMuX2RlZi5lcnJvck1hcD8uKGlzc3VlLCBjdHgpLm1lc3NhZ2UgPz8gY3R4LmRlZmF1bHRFcnJvcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc3N1ZS5jb2RlID09PSBcInVucmVjb2duaXplZF9rZXlzXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpLm1lc3NhZ2UgPz8gZGVmYXVsdEVycm9yLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGRlZmF1bHRFcnJvcixcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIDoge30pLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgc3RyaXAoKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kT2JqZWN0KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIHVua25vd25LZXlzOiBcInN0cmlwXCIsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBwYXNzdGhyb3VnaCgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RPYmplY3Qoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgdW5rbm93bktleXM6IFwicGFzc3Rocm91Z2hcIixcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8vIGNvbnN0IEF1Z21lbnRGYWN0b3J5ID1cbiAgICAvLyAgIDxEZWYgZXh0ZW5kcyBab2RPYmplY3REZWY+KGRlZjogRGVmKSA9PlxuICAgIC8vICAgPEF1Z21lbnRhdGlvbiBleHRlbmRzIFpvZFJhd1NoYXBlPihcbiAgICAvLyAgICAgYXVnbWVudGF0aW9uOiBBdWdtZW50YXRpb25cbiAgICAvLyAgICk6IFpvZE9iamVjdDxcbiAgICAvLyAgICAgZXh0ZW5kU2hhcGU8UmV0dXJuVHlwZTxEZWZbXCJzaGFwZVwiXT4sIEF1Z21lbnRhdGlvbj4sXG4gICAgLy8gICAgIERlZltcInVua25vd25LZXlzXCJdLFxuICAgIC8vICAgICBEZWZbXCJjYXRjaGFsbFwiXVxuICAgIC8vICAgPiA9PiB7XG4gICAgLy8gICAgIHJldHVybiBuZXcgWm9kT2JqZWN0KHtcbiAgICAvLyAgICAgICAuLi5kZWYsXG4gICAgLy8gICAgICAgc2hhcGU6ICgpID0+ICh7XG4gICAgLy8gICAgICAgICAuLi5kZWYuc2hhcGUoKSxcbiAgICAvLyAgICAgICAgIC4uLmF1Z21lbnRhdGlvbixcbiAgICAvLyAgICAgICB9KSxcbiAgICAvLyAgICAgfSkgYXMgYW55O1xuICAgIC8vICAgfTtcbiAgICBleHRlbmQoYXVnbWVudGF0aW9uKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kT2JqZWN0KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIHNoYXBlOiAoKSA9PiAoe1xuICAgICAgICAgICAgICAgIC4uLnRoaXMuX2RlZi5zaGFwZSgpLFxuICAgICAgICAgICAgICAgIC4uLmF1Z21lbnRhdGlvbixcbiAgICAgICAgICAgIH0pLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUHJpb3IgdG8gem9kQDEuMC4xMiB0aGVyZSB3YXMgYSBidWcgaW4gdGhlXG4gICAgICogaW5mZXJyZWQgdHlwZSBvZiBtZXJnZWQgb2JqZWN0cy4gUGxlYXNlXG4gICAgICogdXBncmFkZSBpZiB5b3UgYXJlIGV4cGVyaWVuY2luZyBpc3N1ZXMuXG4gICAgICovXG4gICAgbWVyZ2UobWVyZ2luZykge1xuICAgICAgICBjb25zdCBtZXJnZWQgPSBuZXcgWm9kT2JqZWN0KHtcbiAgICAgICAgICAgIHVua25vd25LZXlzOiBtZXJnaW5nLl9kZWYudW5rbm93bktleXMsXG4gICAgICAgICAgICBjYXRjaGFsbDogbWVyZ2luZy5fZGVmLmNhdGNoYWxsLFxuICAgICAgICAgICAgc2hhcGU6ICgpID0+ICh7XG4gICAgICAgICAgICAgICAgLi4udGhpcy5fZGVmLnNoYXBlKCksXG4gICAgICAgICAgICAgICAgLi4ubWVyZ2luZy5fZGVmLnNoYXBlKCksXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kT2JqZWN0LFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIG1lcmdlZDtcbiAgICB9XG4gICAgLy8gbWVyZ2U8XG4gICAgLy8gICBJbmNvbWluZyBleHRlbmRzIEFueVpvZE9iamVjdCxcbiAgICAvLyAgIEF1Z21lbnRhdGlvbiBleHRlbmRzIEluY29taW5nW1wic2hhcGVcIl0sXG4gICAgLy8gICBOZXdPdXRwdXQgZXh0ZW5kcyB7XG4gICAgLy8gICAgIFtrIGluIGtleW9mIEF1Z21lbnRhdGlvbiB8IGtleW9mIE91dHB1dF06IGsgZXh0ZW5kcyBrZXlvZiBBdWdtZW50YXRpb25cbiAgICAvLyAgICAgICA/IEF1Z21lbnRhdGlvbltrXVtcIl9vdXRwdXRcIl1cbiAgICAvLyAgICAgICA6IGsgZXh0ZW5kcyBrZXlvZiBPdXRwdXRcbiAgICAvLyAgICAgICA/IE91dHB1dFtrXVxuICAgIC8vICAgICAgIDogbmV2ZXI7XG4gICAgLy8gICB9LFxuICAgIC8vICAgTmV3SW5wdXQgZXh0ZW5kcyB7XG4gICAgLy8gICAgIFtrIGluIGtleW9mIEF1Z21lbnRhdGlvbiB8IGtleW9mIElucHV0XTogayBleHRlbmRzIGtleW9mIEF1Z21lbnRhdGlvblxuICAgIC8vICAgICAgID8gQXVnbWVudGF0aW9uW2tdW1wiX2lucHV0XCJdXG4gICAgLy8gICAgICAgOiBrIGV4dGVuZHMga2V5b2YgSW5wdXRcbiAgICAvLyAgICAgICA/IElucHV0W2tdXG4gICAgLy8gICAgICAgOiBuZXZlcjtcbiAgICAvLyAgIH1cbiAgICAvLyA+KFxuICAgIC8vICAgbWVyZ2luZzogSW5jb21pbmdcbiAgICAvLyApOiBab2RPYmplY3Q8XG4gICAgLy8gICBleHRlbmRTaGFwZTxULCBSZXR1cm5UeXBlPEluY29taW5nW1wiX2RlZlwiXVtcInNoYXBlXCJdPj4sXG4gICAgLy8gICBJbmNvbWluZ1tcIl9kZWZcIl1bXCJ1bmtub3duS2V5c1wiXSxcbiAgICAvLyAgIEluY29taW5nW1wiX2RlZlwiXVtcImNhdGNoYWxsXCJdLFxuICAgIC8vICAgTmV3T3V0cHV0LFxuICAgIC8vICAgTmV3SW5wdXRcbiAgICAvLyA+IHtcbiAgICAvLyAgIGNvbnN0IG1lcmdlZDogYW55ID0gbmV3IFpvZE9iamVjdCh7XG4gICAgLy8gICAgIHVua25vd25LZXlzOiBtZXJnaW5nLl9kZWYudW5rbm93bktleXMsXG4gICAgLy8gICAgIGNhdGNoYWxsOiBtZXJnaW5nLl9kZWYuY2F0Y2hhbGwsXG4gICAgLy8gICAgIHNoYXBlOiAoKSA9PlxuICAgIC8vICAgICAgIG9iamVjdFV0aWwubWVyZ2VTaGFwZXModGhpcy5fZGVmLnNoYXBlKCksIG1lcmdpbmcuX2RlZi5zaGFwZSgpKSxcbiAgICAvLyAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RPYmplY3QsXG4gICAgLy8gICB9KSBhcyBhbnk7XG4gICAgLy8gICByZXR1cm4gbWVyZ2VkO1xuICAgIC8vIH1cbiAgICBzZXRLZXkoa2V5LCBzY2hlbWEpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXVnbWVudCh7IFtrZXldOiBzY2hlbWEgfSk7XG4gICAgfVxuICAgIC8vIG1lcmdlPEluY29taW5nIGV4dGVuZHMgQW55Wm9kT2JqZWN0PihcbiAgICAvLyAgIG1lcmdpbmc6IEluY29taW5nXG4gICAgLy8gKTogLy9ab2RPYmplY3Q8VCAmIEluY29taW5nW1wiX3NoYXBlXCJdLCBVbmtub3duS2V5cywgQ2F0Y2hhbGw+ID0gKG1lcmdpbmcpID0+IHtcbiAgICAvLyBab2RPYmplY3Q8XG4gICAgLy8gICBleHRlbmRTaGFwZTxULCBSZXR1cm5UeXBlPEluY29taW5nW1wiX2RlZlwiXVtcInNoYXBlXCJdPj4sXG4gICAgLy8gICBJbmNvbWluZ1tcIl9kZWZcIl1bXCJ1bmtub3duS2V5c1wiXSxcbiAgICAvLyAgIEluY29taW5nW1wiX2RlZlwiXVtcImNhdGNoYWxsXCJdXG4gICAgLy8gPiB7XG4gICAgLy8gICAvLyBjb25zdCBtZXJnZWRTaGFwZSA9IG9iamVjdFV0aWwubWVyZ2VTaGFwZXMoXG4gICAgLy8gICAvLyAgIHRoaXMuX2RlZi5zaGFwZSgpLFxuICAgIC8vICAgLy8gICBtZXJnaW5nLl9kZWYuc2hhcGUoKVxuICAgIC8vICAgLy8gKTtcbiAgICAvLyAgIGNvbnN0IG1lcmdlZDogYW55ID0gbmV3IFpvZE9iamVjdCh7XG4gICAgLy8gICAgIHVua25vd25LZXlzOiBtZXJnaW5nLl9kZWYudW5rbm93bktleXMsXG4gICAgLy8gICAgIGNhdGNoYWxsOiBtZXJnaW5nLl9kZWYuY2F0Y2hhbGwsXG4gICAgLy8gICAgIHNoYXBlOiAoKSA9PlxuICAgIC8vICAgICAgIG9iamVjdFV0aWwubWVyZ2VTaGFwZXModGhpcy5fZGVmLnNoYXBlKCksIG1lcmdpbmcuX2RlZi5zaGFwZSgpKSxcbiAgICAvLyAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RPYmplY3QsXG4gICAgLy8gICB9KSBhcyBhbnk7XG4gICAgLy8gICByZXR1cm4gbWVyZ2VkO1xuICAgIC8vIH1cbiAgICBjYXRjaGFsbChpbmRleCkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZE9iamVjdCh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBjYXRjaGFsbDogaW5kZXgsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBwaWNrKG1hc2spIHtcbiAgICAgICAgY29uc3Qgc2hhcGUgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgdXRpbC5vYmplY3RLZXlzKG1hc2spKSB7XG4gICAgICAgICAgICBpZiAobWFza1trZXldICYmIHRoaXMuc2hhcGVba2V5XSkge1xuICAgICAgICAgICAgICAgIHNoYXBlW2tleV0gPSB0aGlzLnNoYXBlW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBab2RPYmplY3Qoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgc2hhcGU6ICgpID0+IHNoYXBlLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgb21pdChtYXNrKSB7XG4gICAgICAgIGNvbnN0IHNoYXBlID0ge307XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIHV0aWwub2JqZWN0S2V5cyh0aGlzLnNoYXBlKSkge1xuICAgICAgICAgICAgaWYgKCFtYXNrW2tleV0pIHtcbiAgICAgICAgICAgICAgICBzaGFwZVtrZXldID0gdGhpcy5zaGFwZVtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgWm9kT2JqZWN0KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIHNoYXBlOiAoKSA9PiBzaGFwZSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEBkZXByZWNhdGVkXG4gICAgICovXG4gICAgZGVlcFBhcnRpYWwoKSB7XG4gICAgICAgIHJldHVybiBkZWVwUGFydGlhbGlmeSh0aGlzKTtcbiAgICB9XG4gICAgcGFydGlhbChtYXNrKSB7XG4gICAgICAgIGNvbnN0IG5ld1NoYXBlID0ge307XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIHV0aWwub2JqZWN0S2V5cyh0aGlzLnNoYXBlKSkge1xuICAgICAgICAgICAgY29uc3QgZmllbGRTY2hlbWEgPSB0aGlzLnNoYXBlW2tleV07XG4gICAgICAgICAgICBpZiAobWFzayAmJiAhbWFza1trZXldKSB7XG4gICAgICAgICAgICAgICAgbmV3U2hhcGVba2V5XSA9IGZpZWxkU2NoZW1hO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgbmV3U2hhcGVba2V5XSA9IGZpZWxkU2NoZW1hLm9wdGlvbmFsKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBab2RPYmplY3Qoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgc2hhcGU6ICgpID0+IG5ld1NoYXBlLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmVxdWlyZWQobWFzaykge1xuICAgICAgICBjb25zdCBuZXdTaGFwZSA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiB1dGlsLm9iamVjdEtleXModGhpcy5zaGFwZSkpIHtcbiAgICAgICAgICAgIGlmIChtYXNrICYmICFtYXNrW2tleV0pIHtcbiAgICAgICAgICAgICAgICBuZXdTaGFwZVtrZXldID0gdGhpcy5zaGFwZVtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmllbGRTY2hlbWEgPSB0aGlzLnNoYXBlW2tleV07XG4gICAgICAgICAgICAgICAgbGV0IG5ld0ZpZWxkID0gZmllbGRTY2hlbWE7XG4gICAgICAgICAgICAgICAgd2hpbGUgKG5ld0ZpZWxkIGluc3RhbmNlb2YgWm9kT3B0aW9uYWwpIHtcbiAgICAgICAgICAgICAgICAgICAgbmV3RmllbGQgPSBuZXdGaWVsZC5fZGVmLmlubmVyVHlwZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbmV3U2hhcGVba2V5XSA9IG5ld0ZpZWxkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgWm9kT2JqZWN0KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIHNoYXBlOiAoKSA9PiBuZXdTaGFwZSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGtleW9mKCkge1xuICAgICAgICByZXR1cm4gY3JlYXRlWm9kRW51bSh1dGlsLm9iamVjdEtleXModGhpcy5zaGFwZSkpO1xuICAgIH1cbn1cblpvZE9iamVjdC5jcmVhdGUgPSAoc2hhcGUsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kT2JqZWN0KHtcbiAgICAgICAgc2hhcGU6ICgpID0+IHNoYXBlLFxuICAgICAgICB1bmtub3duS2V5czogXCJzdHJpcFwiLFxuICAgICAgICBjYXRjaGFsbDogWm9kTmV2ZXIuY3JlYXRlKCksXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kT2JqZWN0LFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuWm9kT2JqZWN0LnN0cmljdENyZWF0ZSA9IChzaGFwZSwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RPYmplY3Qoe1xuICAgICAgICBzaGFwZTogKCkgPT4gc2hhcGUsXG4gICAgICAgIHVua25vd25LZXlzOiBcInN0cmljdFwiLFxuICAgICAgICBjYXRjaGFsbDogWm9kTmV2ZXIuY3JlYXRlKCksXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kT2JqZWN0LFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuWm9kT2JqZWN0LmxhenljcmVhdGUgPSAoc2hhcGUsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kT2JqZWN0KHtcbiAgICAgICAgc2hhcGUsXG4gICAgICAgIHVua25vd25LZXlzOiBcInN0cmlwXCIsXG4gICAgICAgIGNhdGNoYWxsOiBab2ROZXZlci5jcmVhdGUoKSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RPYmplY3QsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kVW5pb24gZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9kZWYub3B0aW9ucztcbiAgICAgICAgZnVuY3Rpb24gaGFuZGxlUmVzdWx0cyhyZXN1bHRzKSB7XG4gICAgICAgICAgICAvLyByZXR1cm4gZmlyc3QgaXNzdWUtZnJlZSB2YWxpZGF0aW9uIGlmIGl0IGV4aXN0c1xuICAgICAgICAgICAgZm9yIChjb25zdCByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQucmVzdWx0LnN0YXR1cyA9PT0gXCJ2YWxpZFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQucmVzdWx0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoY29uc3QgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnJlc3VsdC5zdGF0dXMgPT09IFwiZGlydHlcIikge1xuICAgICAgICAgICAgICAgICAgICAvLyBhZGQgaXNzdWVzIGZyb20gZGlydHkgb3B0aW9uXG4gICAgICAgICAgICAgICAgICAgIGN0eC5jb21tb24uaXNzdWVzLnB1c2goLi4ucmVzdWx0LmN0eC5jb21tb24uaXNzdWVzKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdC5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gcmV0dXJuIGludmFsaWRcbiAgICAgICAgICAgIGNvbnN0IHVuaW9uRXJyb3JzID0gcmVzdWx0cy5tYXAoKHJlc3VsdCkgPT4gbmV3IFpvZEVycm9yKHJlc3VsdC5jdHguY29tbW9uLmlzc3VlcykpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdW5pb24sXG4gICAgICAgICAgICAgICAgdW5pb25FcnJvcnMsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjdHguY29tbW9uLmFzeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwob3B0aW9ucy5tYXAoYXN5bmMgKG9wdGlvbikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNoaWxkQ3R4ID0ge1xuICAgICAgICAgICAgICAgICAgICAuLi5jdHgsXG4gICAgICAgICAgICAgICAgICAgIGNvbW1vbjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgLi4uY3R4LmNvbW1vbixcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzc3VlczogW10sXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogbnVsbCxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdDogYXdhaXQgb3B0aW9uLl9wYXJzZUFzeW5jKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IGNoaWxkQ3R4LFxuICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICAgICAgY3R4OiBjaGlsZEN0eCxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSkpLnRoZW4oaGFuZGxlUmVzdWx0cyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBsZXQgZGlydHkgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICBjb25zdCBpc3N1ZXMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3Qgb3B0aW9uIG9mIG9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjaGlsZEN0eCA9IHtcbiAgICAgICAgICAgICAgICAgICAgLi4uY3R4LFxuICAgICAgICAgICAgICAgICAgICBjb21tb246IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC4uLmN0eC5jb21tb24sXG4gICAgICAgICAgICAgICAgICAgICAgICBpc3N1ZXM6IFtdLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IG51bGwsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBvcHRpb24uX3BhcnNlU3luYyh7XG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBjaGlsZEN0eCxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnN0YXR1cyA9PT0gXCJ2YWxpZFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHJlc3VsdC5zdGF0dXMgPT09IFwiZGlydHlcIiAmJiAhZGlydHkpIHtcbiAgICAgICAgICAgICAgICAgICAgZGlydHkgPSB7IHJlc3VsdCwgY3R4OiBjaGlsZEN0eCB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoY2hpbGRDdHguY29tbW9uLmlzc3Vlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgaXNzdWVzLnB1c2goY2hpbGRDdHguY29tbW9uLmlzc3Vlcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGRpcnR5KSB7XG4gICAgICAgICAgICAgICAgY3R4LmNvbW1vbi5pc3N1ZXMucHVzaCguLi5kaXJ0eS5jdHguY29tbW9uLmlzc3Vlcyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRpcnR5LnJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHVuaW9uRXJyb3JzID0gaXNzdWVzLm1hcCgoaXNzdWVzKSA9PiBuZXcgWm9kRXJyb3IoaXNzdWVzKSk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF91bmlvbixcbiAgICAgICAgICAgICAgICB1bmlvbkVycm9ycyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0IG9wdGlvbnMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYub3B0aW9ucztcbiAgICB9XG59XG5ab2RVbmlvbi5jcmVhdGUgPSAodHlwZXMsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kVW5pb24oe1xuICAgICAgICBvcHRpb25zOiB0eXBlcyxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RVbmlvbixcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8vLy8vLy8vLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vLy8vLy8vLy9cbi8vLy8vLy8vLy8gICAgICBab2REaXNjcmltaW5hdGVkVW5pb24gICAgICAvLy8vLy8vLy8vXG4vLy8vLy8vLy8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8vLy8vLy8vL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5jb25zdCBnZXREaXNjcmltaW5hdG9yID0gKHR5cGUpID0+IHtcbiAgICBpZiAodHlwZSBpbnN0YW5jZW9mIFpvZExhenkpIHtcbiAgICAgICAgcmV0dXJuIGdldERpc2NyaW1pbmF0b3IodHlwZS5zY2hlbWEpO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlIGluc3RhbmNlb2YgWm9kRWZmZWN0cykge1xuICAgICAgICByZXR1cm4gZ2V0RGlzY3JpbWluYXRvcih0eXBlLmlubmVyVHlwZSgpKTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZSBpbnN0YW5jZW9mIFpvZExpdGVyYWwpIHtcbiAgICAgICAgcmV0dXJuIFt0eXBlLnZhbHVlXTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZSBpbnN0YW5jZW9mIFpvZEVudW0pIHtcbiAgICAgICAgcmV0dXJuIHR5cGUub3B0aW9ucztcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZSBpbnN0YW5jZW9mIFpvZE5hdGl2ZUVudW0pIHtcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGJhbi9iYW5cbiAgICAgICAgcmV0dXJuIHV0aWwub2JqZWN0VmFsdWVzKHR5cGUuZW51bSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGUgaW5zdGFuY2VvZiBab2REZWZhdWx0KSB7XG4gICAgICAgIHJldHVybiBnZXREaXNjcmltaW5hdG9yKHR5cGUuX2RlZi5pbm5lclR5cGUpO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlIGluc3RhbmNlb2YgWm9kVW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBbdW5kZWZpbmVkXTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZSBpbnN0YW5jZW9mIFpvZE51bGwpIHtcbiAgICAgICAgcmV0dXJuIFtudWxsXTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZSBpbnN0YW5jZW9mIFpvZE9wdGlvbmFsKSB7XG4gICAgICAgIHJldHVybiBbdW5kZWZpbmVkLCAuLi5nZXREaXNjcmltaW5hdG9yKHR5cGUudW53cmFwKCkpXTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZSBpbnN0YW5jZW9mIFpvZE51bGxhYmxlKSB7XG4gICAgICAgIHJldHVybiBbbnVsbCwgLi4uZ2V0RGlzY3JpbWluYXRvcih0eXBlLnVud3JhcCgpKV07XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGUgaW5zdGFuY2VvZiBab2RCcmFuZGVkKSB7XG4gICAgICAgIHJldHVybiBnZXREaXNjcmltaW5hdG9yKHR5cGUudW53cmFwKCkpO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlIGluc3RhbmNlb2YgWm9kUmVhZG9ubHkpIHtcbiAgICAgICAgcmV0dXJuIGdldERpc2NyaW1pbmF0b3IodHlwZS51bndyYXAoKSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGUgaW5zdGFuY2VvZiBab2RDYXRjaCkge1xuICAgICAgICByZXR1cm4gZ2V0RGlzY3JpbWluYXRvcih0eXBlLl9kZWYuaW5uZXJUeXBlKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG59O1xuZXhwb3J0IGNsYXNzIFpvZERpc2NyaW1pbmF0ZWRVbmlvbiBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgaWYgKGN0eC5wYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLm9iamVjdCkge1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5vYmplY3QsXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkaXNjcmltaW5hdG9yID0gdGhpcy5kaXNjcmltaW5hdG9yO1xuICAgICAgICBjb25zdCBkaXNjcmltaW5hdG9yVmFsdWUgPSBjdHguZGF0YVtkaXNjcmltaW5hdG9yXTtcbiAgICAgICAgY29uc3Qgb3B0aW9uID0gdGhpcy5vcHRpb25zTWFwLmdldChkaXNjcmltaW5hdG9yVmFsdWUpO1xuICAgICAgICBpZiAoIW9wdGlvbikge1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdW5pb25fZGlzY3JpbWluYXRvcixcbiAgICAgICAgICAgICAgICBvcHRpb25zOiBBcnJheS5mcm9tKHRoaXMub3B0aW9uc01hcC5rZXlzKCkpLFxuICAgICAgICAgICAgICAgIHBhdGg6IFtkaXNjcmltaW5hdG9yXSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGN0eC5jb21tb24uYXN5bmMpIHtcbiAgICAgICAgICAgIHJldHVybiBvcHRpb24uX3BhcnNlQXN5bmMoe1xuICAgICAgICAgICAgICAgIGRhdGE6IGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gb3B0aW9uLl9wYXJzZVN5bmMoe1xuICAgICAgICAgICAgICAgIGRhdGE6IGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0IGRpc2NyaW1pbmF0b3IoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuZGlzY3JpbWluYXRvcjtcbiAgICB9XG4gICAgZ2V0IG9wdGlvbnMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYub3B0aW9ucztcbiAgICB9XG4gICAgZ2V0IG9wdGlvbnNNYXAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYub3B0aW9uc01hcDtcbiAgICB9XG4gICAgLyoqXG4gICAgICogVGhlIGNvbnN0cnVjdG9yIG9mIHRoZSBkaXNjcmltaW5hdGVkIHVuaW9uIHNjaGVtYS4gSXRzIGJlaGF2aW91ciBpcyB2ZXJ5IHNpbWlsYXIgdG8gdGhhdCBvZiB0aGUgbm9ybWFsIHoudW5pb24oKSBjb25zdHJ1Y3Rvci5cbiAgICAgKiBIb3dldmVyLCBpdCBvbmx5IGFsbG93cyBhIHVuaW9uIG9mIG9iamVjdHMsIGFsbCBvZiB3aGljaCBuZWVkIHRvIHNoYXJlIGEgZGlzY3JpbWluYXRvciBwcm9wZXJ0eS4gVGhpcyBwcm9wZXJ0eSBtdXN0XG4gICAgICogaGF2ZSBhIGRpZmZlcmVudCB2YWx1ZSBmb3IgZWFjaCBvYmplY3QgaW4gdGhlIHVuaW9uLlxuICAgICAqIEBwYXJhbSBkaXNjcmltaW5hdG9yIHRoZSBuYW1lIG9mIHRoZSBkaXNjcmltaW5hdG9yIHByb3BlcnR5XG4gICAgICogQHBhcmFtIHR5cGVzIGFuIGFycmF5IG9mIG9iamVjdCBzY2hlbWFzXG4gICAgICogQHBhcmFtIHBhcmFtc1xuICAgICAqL1xuICAgIHN0YXRpYyBjcmVhdGUoZGlzY3JpbWluYXRvciwgb3B0aW9ucywgcGFyYW1zKSB7XG4gICAgICAgIC8vIEdldCBhbGwgdGhlIHZhbGlkIGRpc2NyaW1pbmF0b3IgdmFsdWVzXG4gICAgICAgIGNvbnN0IG9wdGlvbnNNYXAgPSBuZXcgTWFwKCk7XG4gICAgICAgIC8vIHRyeSB7XG4gICAgICAgIGZvciAoY29uc3QgdHlwZSBvZiBvcHRpb25zKSB7XG4gICAgICAgICAgICBjb25zdCBkaXNjcmltaW5hdG9yVmFsdWVzID0gZ2V0RGlzY3JpbWluYXRvcih0eXBlLnNoYXBlW2Rpc2NyaW1pbmF0b3JdKTtcbiAgICAgICAgICAgIGlmICghZGlzY3JpbWluYXRvclZhbHVlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEEgZGlzY3JpbWluYXRvciB2YWx1ZSBmb3Iga2V5IFxcYCR7ZGlzY3JpbWluYXRvcn1cXGAgY291bGQgbm90IGJlIGV4dHJhY3RlZCBmcm9tIGFsbCBzY2hlbWEgb3B0aW9uc2ApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCB2YWx1ZSBvZiBkaXNjcmltaW5hdG9yVmFsdWVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbnNNYXAuaGFzKHZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYERpc2NyaW1pbmF0b3IgcHJvcGVydHkgJHtTdHJpbmcoZGlzY3JpbWluYXRvcil9IGhhcyBkdXBsaWNhdGUgdmFsdWUgJHtTdHJpbmcodmFsdWUpfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBvcHRpb25zTWFwLnNldCh2YWx1ZSwgdHlwZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBab2REaXNjcmltaW5hdGVkVW5pb24oe1xuICAgICAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2REaXNjcmltaW5hdGVkVW5pb24sXG4gICAgICAgICAgICBkaXNjcmltaW5hdG9yLFxuICAgICAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgICAgIG9wdGlvbnNNYXAsXG4gICAgICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgICAgIH0pO1xuICAgIH1cbn1cbmZ1bmN0aW9uIG1lcmdlVmFsdWVzKGEsIGIpIHtcbiAgICBjb25zdCBhVHlwZSA9IGdldFBhcnNlZFR5cGUoYSk7XG4gICAgY29uc3QgYlR5cGUgPSBnZXRQYXJzZWRUeXBlKGIpO1xuICAgIGlmIChhID09PSBiKSB7XG4gICAgICAgIHJldHVybiB7IHZhbGlkOiB0cnVlLCBkYXRhOiBhIH07XG4gICAgfVxuICAgIGVsc2UgaWYgKGFUeXBlID09PSBab2RQYXJzZWRUeXBlLm9iamVjdCAmJiBiVHlwZSA9PT0gWm9kUGFyc2VkVHlwZS5vYmplY3QpIHtcbiAgICAgICAgY29uc3QgYktleXMgPSB1dGlsLm9iamVjdEtleXMoYik7XG4gICAgICAgIGNvbnN0IHNoYXJlZEtleXMgPSB1dGlsLm9iamVjdEtleXMoYSkuZmlsdGVyKChrZXkpID0+IGJLZXlzLmluZGV4T2Yoa2V5KSAhPT0gLTEpO1xuICAgICAgICBjb25zdCBuZXdPYmogPSB7IC4uLmEsIC4uLmIgfTtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2Ygc2hhcmVkS2V5cykge1xuICAgICAgICAgICAgY29uc3Qgc2hhcmVkVmFsdWUgPSBtZXJnZVZhbHVlcyhhW2tleV0sIGJba2V5XSk7XG4gICAgICAgICAgICBpZiAoIXNoYXJlZFZhbHVlLnZhbGlkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgdmFsaWQ6IGZhbHNlIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBuZXdPYmpba2V5XSA9IHNoYXJlZFZhbHVlLmRhdGE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgdmFsaWQ6IHRydWUsIGRhdGE6IG5ld09iaiB9O1xuICAgIH1cbiAgICBlbHNlIGlmIChhVHlwZSA9PT0gWm9kUGFyc2VkVHlwZS5hcnJheSAmJiBiVHlwZSA9PT0gWm9kUGFyc2VkVHlwZS5hcnJheSkge1xuICAgICAgICBpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4geyB2YWxpZDogZmFsc2UgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBuZXdBcnJheSA9IFtdO1xuICAgICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYS5sZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1BID0gYVtpbmRleF07XG4gICAgICAgICAgICBjb25zdCBpdGVtQiA9IGJbaW5kZXhdO1xuICAgICAgICAgICAgY29uc3Qgc2hhcmVkVmFsdWUgPSBtZXJnZVZhbHVlcyhpdGVtQSwgaXRlbUIpO1xuICAgICAgICAgICAgaWYgKCFzaGFyZWRWYWx1ZS52YWxpZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHZhbGlkOiBmYWxzZSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbmV3QXJyYXkucHVzaChzaGFyZWRWYWx1ZS5kYXRhKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyB2YWxpZDogdHJ1ZSwgZGF0YTogbmV3QXJyYXkgfTtcbiAgICB9XG4gICAgZWxzZSBpZiAoYVR5cGUgPT09IFpvZFBhcnNlZFR5cGUuZGF0ZSAmJiBiVHlwZSA9PT0gWm9kUGFyc2VkVHlwZS5kYXRlICYmICthID09PSArYikge1xuICAgICAgICByZXR1cm4geyB2YWxpZDogdHJ1ZSwgZGF0YTogYSB9O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgdmFsaWQ6IGZhbHNlIH07XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFpvZEludGVyc2VjdGlvbiBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IHN0YXR1cywgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBjb25zdCBoYW5kbGVQYXJzZWQgPSAocGFyc2VkTGVmdCwgcGFyc2VkUmlnaHQpID0+IHtcbiAgICAgICAgICAgIGlmIChpc0Fib3J0ZWQocGFyc2VkTGVmdCkgfHwgaXNBYm9ydGVkKHBhcnNlZFJpZ2h0KSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgbWVyZ2VkID0gbWVyZ2VWYWx1ZXMocGFyc2VkTGVmdC52YWx1ZSwgcGFyc2VkUmlnaHQudmFsdWUpO1xuICAgICAgICAgICAgaWYgKCFtZXJnZWQudmFsaWQpIHtcbiAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfaW50ZXJzZWN0aW9uX3R5cGVzLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlzRGlydHkocGFyc2VkTGVmdCkgfHwgaXNEaXJ0eShwYXJzZWRSaWdodCkpIHtcbiAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IHN0YXR1czogc3RhdHVzLnZhbHVlLCB2YWx1ZTogbWVyZ2VkLmRhdGEgfTtcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKGN0eC5jb21tb24uYXN5bmMpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICAgICAgdGhpcy5fZGVmLmxlZnQuX3BhcnNlQXN5bmMoe1xuICAgICAgICAgICAgICAgICAgICBkYXRhOiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIHRoaXMuX2RlZi5yaWdodC5fcGFyc2VBc3luYyh7XG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBdKS50aGVuKChbbGVmdCwgcmlnaHRdKSA9PiBoYW5kbGVQYXJzZWQobGVmdCwgcmlnaHQpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBoYW5kbGVQYXJzZWQodGhpcy5fZGVmLmxlZnQuX3BhcnNlU3luYyh7XG4gICAgICAgICAgICAgICAgZGF0YTogY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgICAgICB9KSwgdGhpcy5fZGVmLnJpZ2h0Ll9wYXJzZVN5bmMoe1xuICAgICAgICAgICAgICAgIGRhdGE6IGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG4gICAgfVxufVxuWm9kSW50ZXJzZWN0aW9uLmNyZWF0ZSA9IChsZWZ0LCByaWdodCwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RJbnRlcnNlY3Rpb24oe1xuICAgICAgICBsZWZ0OiBsZWZ0LFxuICAgICAgICByaWdodDogcmlnaHQsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kSW50ZXJzZWN0aW9uLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuLy8gdHlwZSBab2RUdXBsZUl0ZW1zID0gW1pvZFR5cGVBbnksIC4uLlpvZFR5cGVBbnlbXV07XG5leHBvcnQgY2xhc3MgWm9kVHVwbGUgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBzdGF0dXMsIGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgaWYgKGN0eC5wYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLmFycmF5KSB7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLmFycmF5LFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGN0eC5kYXRhLmxlbmd0aCA8IHRoaXMuX2RlZi5pdGVtcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fc21hbGwsXG4gICAgICAgICAgICAgICAgbWluaW11bTogdGhpcy5fZGVmLml0ZW1zLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICAgICAgZXhhY3Q6IGZhbHNlLFxuICAgICAgICAgICAgICAgIHR5cGU6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzdCA9IHRoaXMuX2RlZi5yZXN0O1xuICAgICAgICBpZiAoIXJlc3QgJiYgY3R4LmRhdGEubGVuZ3RoID4gdGhpcy5fZGVmLml0ZW1zLmxlbmd0aCkge1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19iaWcsXG4gICAgICAgICAgICAgICAgbWF4aW11bTogdGhpcy5fZGVmLml0ZW1zLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICAgICAgZXhhY3Q6IGZhbHNlLFxuICAgICAgICAgICAgICAgIHR5cGU6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgaXRlbXMgPSBbLi4uY3R4LmRhdGFdXG4gICAgICAgICAgICAubWFwKChpdGVtLCBpdGVtSW5kZXgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNjaGVtYSA9IHRoaXMuX2RlZi5pdGVtc1tpdGVtSW5kZXhdIHx8IHRoaXMuX2RlZi5yZXN0O1xuICAgICAgICAgICAgaWYgKCFzY2hlbWEpXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICByZXR1cm4gc2NoZW1hLl9wYXJzZShuZXcgUGFyc2VJbnB1dExhenlQYXRoKGN0eCwgaXRlbSwgY3R4LnBhdGgsIGl0ZW1JbmRleCkpO1xuICAgICAgICB9KVxuICAgICAgICAgICAgLmZpbHRlcigoeCkgPT4gISF4KTsgLy8gZmlsdGVyIG51bGxzXG4gICAgICAgIGlmIChjdHguY29tbW9uLmFzeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoaXRlbXMpLnRoZW4oKHJlc3VsdHMpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gUGFyc2VTdGF0dXMubWVyZ2VBcnJheShzdGF0dXMsIHJlc3VsdHMpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gUGFyc2VTdGF0dXMubWVyZ2VBcnJheShzdGF0dXMsIGl0ZW1zKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBnZXQgaXRlbXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuaXRlbXM7XG4gICAgfVxuICAgIHJlc3QocmVzdCkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZFR1cGxlKHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIHJlc3QsXG4gICAgICAgIH0pO1xuICAgIH1cbn1cblpvZFR1cGxlLmNyZWF0ZSA9IChzY2hlbWFzLCBwYXJhbXMpID0+IHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoc2NoZW1hcykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiWW91IG11c3QgcGFzcyBhbiBhcnJheSBvZiBzY2hlbWFzIHRvIHoudHVwbGUoWyAuLi4gXSlcIik7XG4gICAgfVxuICAgIHJldHVybiBuZXcgWm9kVHVwbGUoe1xuICAgICAgICBpdGVtczogc2NoZW1hcyxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RUdXBsZSxcbiAgICAgICAgcmVzdDogbnVsbCxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RSZWNvcmQgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBnZXQga2V5U2NoZW1hKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLmtleVR5cGU7XG4gICAgfVxuICAgIGdldCB2YWx1ZVNjaGVtYSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi52YWx1ZVR5cGU7XG4gICAgfVxuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IHN0YXR1cywgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBpZiAoY3R4LnBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUub2JqZWN0KSB7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLm9iamVjdCxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhaXJzID0gW107XG4gICAgICAgIGNvbnN0IGtleVR5cGUgPSB0aGlzLl9kZWYua2V5VHlwZTtcbiAgICAgICAgY29uc3QgdmFsdWVUeXBlID0gdGhpcy5fZGVmLnZhbHVlVHlwZTtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gY3R4LmRhdGEpIHtcbiAgICAgICAgICAgIHBhaXJzLnB1c2goe1xuICAgICAgICAgICAgICAgIGtleToga2V5VHlwZS5fcGFyc2UobmV3IFBhcnNlSW5wdXRMYXp5UGF0aChjdHgsIGtleSwgY3R4LnBhdGgsIGtleSkpLFxuICAgICAgICAgICAgICAgIHZhbHVlOiB2YWx1ZVR5cGUuX3BhcnNlKG5ldyBQYXJzZUlucHV0TGF6eVBhdGgoY3R4LCBjdHguZGF0YVtrZXldLCBjdHgucGF0aCwga2V5KSksXG4gICAgICAgICAgICAgICAgYWx3YXlzU2V0OiBrZXkgaW4gY3R4LmRhdGEsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY3R4LmNvbW1vbi5hc3luYykge1xuICAgICAgICAgICAgcmV0dXJuIFBhcnNlU3RhdHVzLm1lcmdlT2JqZWN0QXN5bmMoc3RhdHVzLCBwYWlycyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gUGFyc2VTdGF0dXMubWVyZ2VPYmplY3RTeW5jKHN0YXR1cywgcGFpcnMpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGdldCBlbGVtZW50KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnZhbHVlVHlwZTtcbiAgICB9XG4gICAgc3RhdGljIGNyZWF0ZShmaXJzdCwgc2Vjb25kLCB0aGlyZCkge1xuICAgICAgICBpZiAoc2Vjb25kIGluc3RhbmNlb2YgWm9kVHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBab2RSZWNvcmQoe1xuICAgICAgICAgICAgICAgIGtleVR5cGU6IGZpcnN0LFxuICAgICAgICAgICAgICAgIHZhbHVlVHlwZTogc2Vjb25kLFxuICAgICAgICAgICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kUmVjb3JkLFxuICAgICAgICAgICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXModGhpcmQpLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBab2RSZWNvcmQoe1xuICAgICAgICAgICAga2V5VHlwZTogWm9kU3RyaW5nLmNyZWF0ZSgpLFxuICAgICAgICAgICAgdmFsdWVUeXBlOiBmaXJzdCxcbiAgICAgICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kUmVjb3JkLFxuICAgICAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhzZWNvbmQpLFxuICAgICAgICB9KTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgWm9kTWFwIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgZ2V0IGtleVNjaGVtYSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5rZXlUeXBlO1xuICAgIH1cbiAgICBnZXQgdmFsdWVTY2hlbWEoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYudmFsdWVUeXBlO1xuICAgIH1cbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBzdGF0dXMsIGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgaWYgKGN0eC5wYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLm1hcCkge1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5tYXAsXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBrZXlUeXBlID0gdGhpcy5fZGVmLmtleVR5cGU7XG4gICAgICAgIGNvbnN0IHZhbHVlVHlwZSA9IHRoaXMuX2RlZi52YWx1ZVR5cGU7XG4gICAgICAgIGNvbnN0IHBhaXJzID0gWy4uLmN0eC5kYXRhLmVudHJpZXMoKV0ubWFwKChba2V5LCB2YWx1ZV0sIGluZGV4KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGtleToga2V5VHlwZS5fcGFyc2UobmV3IFBhcnNlSW5wdXRMYXp5UGF0aChjdHgsIGtleSwgY3R4LnBhdGgsIFtpbmRleCwgXCJrZXlcIl0pKSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogdmFsdWVUeXBlLl9wYXJzZShuZXcgUGFyc2VJbnB1dExhenlQYXRoKGN0eCwgdmFsdWUsIGN0eC5wYXRoLCBbaW5kZXgsIFwidmFsdWVcIl0pKSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoY3R4LmNvbW1vbi5hc3luYykge1xuICAgICAgICAgICAgY29uc3QgZmluYWxNYXAgPSBuZXcgTWFwKCk7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCkudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBwYWlyIG9mIHBhaXJzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGtleSA9IGF3YWl0IHBhaXIua2V5O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IGF3YWl0IHBhaXIudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGlmIChrZXkuc3RhdHVzID09PSBcImFib3J0ZWRcIiB8fCB2YWx1ZS5zdGF0dXMgPT09IFwiYWJvcnRlZFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoa2V5LnN0YXR1cyA9PT0gXCJkaXJ0eVwiIHx8IHZhbHVlLnN0YXR1cyA9PT0gXCJkaXJ0eVwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBmaW5hbE1hcC5zZXQoa2V5LnZhbHVlLCB2YWx1ZS52YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB7IHN0YXR1czogc3RhdHVzLnZhbHVlLCB2YWx1ZTogZmluYWxNYXAgfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgZmluYWxNYXAgPSBuZXcgTWFwKCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHBhaXIgb2YgcGFpcnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSBwYWlyLmtleTtcbiAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IHBhaXIudmFsdWU7XG4gICAgICAgICAgICAgICAgaWYgKGtleS5zdGF0dXMgPT09IFwiYWJvcnRlZFwiIHx8IHZhbHVlLnN0YXR1cyA9PT0gXCJhYm9ydGVkXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChrZXkuc3RhdHVzID09PSBcImRpcnR5XCIgfHwgdmFsdWUuc3RhdHVzID09PSBcImRpcnR5XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZpbmFsTWFwLnNldChrZXkudmFsdWUsIHZhbHVlLnZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IHN0YXR1czogc3RhdHVzLnZhbHVlLCB2YWx1ZTogZmluYWxNYXAgfTtcbiAgICAgICAgfVxuICAgIH1cbn1cblpvZE1hcC5jcmVhdGUgPSAoa2V5VHlwZSwgdmFsdWVUeXBlLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZE1hcCh7XG4gICAgICAgIHZhbHVlVHlwZSxcbiAgICAgICAga2V5VHlwZSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RNYXAsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kU2V0IGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgc3RhdHVzLCBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGlmIChjdHgucGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5zZXQpIHtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUuc2V0LFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZGVmID0gdGhpcy5fZGVmO1xuICAgICAgICBpZiAoZGVmLm1pblNpemUgIT09IG51bGwpIHtcbiAgICAgICAgICAgIGlmIChjdHguZGF0YS5zaXplIDwgZGVmLm1pblNpemUudmFsdWUpIHtcbiAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19zbWFsbCxcbiAgICAgICAgICAgICAgICAgICAgbWluaW11bTogZGVmLm1pblNpemUudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwic2V0XCIsXG4gICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZXhhY3Q6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBkZWYubWluU2l6ZS5tZXNzYWdlLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChkZWYubWF4U2l6ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgaWYgKGN0eC5kYXRhLnNpemUgPiBkZWYubWF4U2l6ZS52YWx1ZSkge1xuICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX2JpZyxcbiAgICAgICAgICAgICAgICAgICAgbWF4aW11bTogZGVmLm1heFNpemUudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwic2V0XCIsXG4gICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZXhhY3Q6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBkZWYubWF4U2l6ZS5tZXNzYWdlLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHZhbHVlVHlwZSA9IHRoaXMuX2RlZi52YWx1ZVR5cGU7XG4gICAgICAgIGZ1bmN0aW9uIGZpbmFsaXplU2V0KGVsZW1lbnRzKSB7XG4gICAgICAgICAgICBjb25zdCBwYXJzZWRTZXQgPSBuZXcgU2V0KCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGVsZW1lbnQgb2YgZWxlbWVudHMpIHtcbiAgICAgICAgICAgICAgICBpZiAoZWxlbWVudC5zdGF0dXMgPT09IFwiYWJvcnRlZFwiKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgICAgICBpZiAoZWxlbWVudC5zdGF0dXMgPT09IFwiZGlydHlcIilcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgcGFyc2VkU2V0LmFkZChlbGVtZW50LnZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IHN0YXR1czogc3RhdHVzLnZhbHVlLCB2YWx1ZTogcGFyc2VkU2V0IH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZWxlbWVudHMgPSBbLi4uY3R4LmRhdGEudmFsdWVzKCldLm1hcCgoaXRlbSwgaSkgPT4gdmFsdWVUeXBlLl9wYXJzZShuZXcgUGFyc2VJbnB1dExhenlQYXRoKGN0eCwgaXRlbSwgY3R4LnBhdGgsIGkpKSk7XG4gICAgICAgIGlmIChjdHguY29tbW9uLmFzeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoZWxlbWVudHMpLnRoZW4oKGVsZW1lbnRzKSA9PiBmaW5hbGl6ZVNldChlbGVtZW50cykpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZpbmFsaXplU2V0KGVsZW1lbnRzKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBtaW4obWluU2l6ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZFNldCh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBtaW5TaXplOiB7IHZhbHVlOiBtaW5TaXplLCBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSkgfSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG1heChtYXhTaXplLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kU2V0KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIG1heFNpemU6IHsgdmFsdWU6IG1heFNpemUsIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSB9LFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgc2l6ZShzaXplLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm1pbihzaXplLCBtZXNzYWdlKS5tYXgoc2l6ZSwgbWVzc2FnZSk7XG4gICAgfVxuICAgIG5vbmVtcHR5KG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubWluKDEsIG1lc3NhZ2UpO1xuICAgIH1cbn1cblpvZFNldC5jcmVhdGUgPSAodmFsdWVUeXBlLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZFNldCh7XG4gICAgICAgIHZhbHVlVHlwZSxcbiAgICAgICAgbWluU2l6ZTogbnVsbCxcbiAgICAgICAgbWF4U2l6ZTogbnVsbCxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RTZXQsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kRnVuY3Rpb24gZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoLi4uYXJndW1lbnRzKTtcbiAgICAgICAgdGhpcy52YWxpZGF0ZSA9IHRoaXMuaW1wbGVtZW50O1xuICAgIH1cbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGlmIChjdHgucGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5mdW5jdGlvbikge1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5mdW5jdGlvbixcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIG1ha2VBcmdzSXNzdWUoYXJncywgZXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBtYWtlSXNzdWUoe1xuICAgICAgICAgICAgICAgIGRhdGE6IGFyZ3MsXG4gICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgZXJyb3JNYXBzOiBbY3R4LmNvbW1vbi5jb250ZXh0dWFsRXJyb3JNYXAsIGN0eC5zY2hlbWFFcnJvck1hcCwgZ2V0RXJyb3JNYXAoKSwgZGVmYXVsdEVycm9yTWFwXS5maWx0ZXIoKHgpID0+ICEheCksXG4gICAgICAgICAgICAgICAgaXNzdWVEYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX2FyZ3VtZW50cyxcbiAgICAgICAgICAgICAgICAgICAgYXJndW1lbnRzRXJyb3I6IGVycm9yLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBtYWtlUmV0dXJuc0lzc3VlKHJldHVybnMsIGVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4gbWFrZUlzc3VlKHtcbiAgICAgICAgICAgICAgICBkYXRhOiByZXR1cm5zLFxuICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgIGVycm9yTWFwczogW2N0eC5jb21tb24uY29udGV4dHVhbEVycm9yTWFwLCBjdHguc2NoZW1hRXJyb3JNYXAsIGdldEVycm9yTWFwKCksIGRlZmF1bHRFcnJvck1hcF0uZmlsdGVyKCh4KSA9PiAhIXgpLFxuICAgICAgICAgICAgICAgIGlzc3VlRGF0YToge1xuICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9yZXR1cm5fdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuVHlwZUVycm9yOiBlcnJvcixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFyYW1zID0geyBlcnJvck1hcDogY3R4LmNvbW1vbi5jb250ZXh0dWFsRXJyb3JNYXAgfTtcbiAgICAgICAgY29uc3QgZm4gPSBjdHguZGF0YTtcbiAgICAgICAgaWYgKHRoaXMuX2RlZi5yZXR1cm5zIGluc3RhbmNlb2YgWm9kUHJvbWlzZSkge1xuICAgICAgICAgICAgLy8gV291bGQgbG92ZSBhIHdheSB0byBhdm9pZCBkaXNhYmxpbmcgdGhpcyBydWxlLCBidXQgd2UgbmVlZFxuICAgICAgICAgICAgLy8gYW4gYWxpYXMgKHVzaW5nIGFuIGFycm93IGZ1bmN0aW9uIHdhcyB3aGF0IGNhdXNlZCAyNjUxKS5cbiAgICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdGhpcy1hbGlhc1xuICAgICAgICAgICAgY29uc3QgbWUgPSB0aGlzO1xuICAgICAgICAgICAgcmV0dXJuIE9LKGFzeW5jIGZ1bmN0aW9uICguLi5hcmdzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXJyb3IgPSBuZXcgWm9kRXJyb3IoW10pO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlZEFyZ3MgPSBhd2FpdCBtZS5fZGVmLmFyZ3MucGFyc2VBc3luYyhhcmdzLCBwYXJhbXMpLmNhdGNoKChlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yLmFkZElzc3VlKG1ha2VBcmdzSXNzdWUoYXJncywgZSkpO1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBSZWZsZWN0LmFwcGx5KGZuLCB0aGlzLCBwYXJzZWRBcmdzKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJzZWRSZXR1cm5zID0gYXdhaXQgbWUuX2RlZi5yZXR1cm5zLl9kZWYudHlwZVxuICAgICAgICAgICAgICAgICAgICAucGFyc2VBc3luYyhyZXN1bHQsIHBhcmFtcylcbiAgICAgICAgICAgICAgICAgICAgLmNhdGNoKChlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yLmFkZElzc3VlKG1ha2VSZXR1cm5zSXNzdWUocmVzdWx0LCBlKSk7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBwYXJzZWRSZXR1cm5zO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAvLyBXb3VsZCBsb3ZlIGEgd2F5IHRvIGF2b2lkIGRpc2FibGluZyB0aGlzIHJ1bGUsIGJ1dCB3ZSBuZWVkXG4gICAgICAgICAgICAvLyBhbiBhbGlhcyAodXNpbmcgYW4gYXJyb3cgZnVuY3Rpb24gd2FzIHdoYXQgY2F1c2VkIDI2NTEpLlxuICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby10aGlzLWFsaWFzXG4gICAgICAgICAgICBjb25zdCBtZSA9IHRoaXM7XG4gICAgICAgICAgICByZXR1cm4gT0soZnVuY3Rpb24gKC4uLmFyZ3MpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXJzZWRBcmdzID0gbWUuX2RlZi5hcmdzLnNhZmVQYXJzZShhcmdzLCBwYXJhbXMpO1xuICAgICAgICAgICAgICAgIGlmICghcGFyc2VkQXJncy5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBab2RFcnJvcihbbWFrZUFyZ3NJc3N1ZShhcmdzLCBwYXJzZWRBcmdzLmVycm9yKV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBSZWZsZWN0LmFwcGx5KGZuLCB0aGlzLCBwYXJzZWRBcmdzLmRhdGEpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlZFJldHVybnMgPSBtZS5fZGVmLnJldHVybnMuc2FmZVBhcnNlKHJlc3VsdCwgcGFyYW1zKTtcbiAgICAgICAgICAgICAgICBpZiAoIXBhcnNlZFJldHVybnMuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgWm9kRXJyb3IoW21ha2VSZXR1cm5zSXNzdWUocmVzdWx0LCBwYXJzZWRSZXR1cm5zLmVycm9yKV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gcGFyc2VkUmV0dXJucy5kYXRhO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcGFyYW1ldGVycygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5hcmdzO1xuICAgIH1cbiAgICByZXR1cm5UeXBlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnJldHVybnM7XG4gICAgfVxuICAgIGFyZ3MoLi4uaXRlbXMpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RGdW5jdGlvbih7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBhcmdzOiBab2RUdXBsZS5jcmVhdGUoaXRlbXMpLnJlc3QoWm9kVW5rbm93bi5jcmVhdGUoKSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm5zKHJldHVyblR5cGUpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RGdW5jdGlvbih7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICByZXR1cm5zOiByZXR1cm5UeXBlLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgaW1wbGVtZW50KGZ1bmMpIHtcbiAgICAgICAgY29uc3QgdmFsaWRhdGVkRnVuYyA9IHRoaXMucGFyc2UoZnVuYyk7XG4gICAgICAgIHJldHVybiB2YWxpZGF0ZWRGdW5jO1xuICAgIH1cbiAgICBzdHJpY3RJbXBsZW1lbnQoZnVuYykge1xuICAgICAgICBjb25zdCB2YWxpZGF0ZWRGdW5jID0gdGhpcy5wYXJzZShmdW5jKTtcbiAgICAgICAgcmV0dXJuIHZhbGlkYXRlZEZ1bmM7XG4gICAgfVxuICAgIHN0YXRpYyBjcmVhdGUoYXJncywgcmV0dXJucywgcGFyYW1zKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kRnVuY3Rpb24oe1xuICAgICAgICAgICAgYXJnczogKGFyZ3MgPyBhcmdzIDogWm9kVHVwbGUuY3JlYXRlKFtdKS5yZXN0KFpvZFVua25vd24uY3JlYXRlKCkpKSxcbiAgICAgICAgICAgIHJldHVybnM6IHJldHVybnMgfHwgWm9kVW5rbm93bi5jcmVhdGUoKSxcbiAgICAgICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kRnVuY3Rpb24sXG4gICAgICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgICAgIH0pO1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBab2RMYXp5IGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgZ2V0IHNjaGVtYSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5nZXR0ZXIoKTtcbiAgICB9XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBjb25zdCBsYXp5U2NoZW1hID0gdGhpcy5fZGVmLmdldHRlcigpO1xuICAgICAgICByZXR1cm4gbGF6eVNjaGVtYS5fcGFyc2UoeyBkYXRhOiBjdHguZGF0YSwgcGF0aDogY3R4LnBhdGgsIHBhcmVudDogY3R4IH0pO1xuICAgIH1cbn1cblpvZExhenkuY3JlYXRlID0gKGdldHRlciwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RMYXp5KHtcbiAgICAgICAgZ2V0dGVyOiBnZXR0ZXIsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kTGF6eSxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RMaXRlcmFsIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGlmIChpbnB1dC5kYXRhICE9PSB0aGlzLl9kZWYudmFsdWUpIHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9saXRlcmFsLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiB0aGlzLl9kZWYudmFsdWUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN0YXR1czogXCJ2YWxpZFwiLCB2YWx1ZTogaW5wdXQuZGF0YSB9O1xuICAgIH1cbiAgICBnZXQgdmFsdWUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYudmFsdWU7XG4gICAgfVxufVxuWm9kTGl0ZXJhbC5jcmVhdGUgPSAodmFsdWUsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kTGl0ZXJhbCh7XG4gICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RMaXRlcmFsLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZnVuY3Rpb24gY3JlYXRlWm9kRW51bSh2YWx1ZXMsIHBhcmFtcykge1xuICAgIHJldHVybiBuZXcgWm9kRW51bSh7XG4gICAgICAgIHZhbHVlcyxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RFbnVtLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59XG5leHBvcnQgY2xhc3MgWm9kRW51bSBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBpZiAodHlwZW9mIGlucHV0LmRhdGEgIT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgICAgIGNvbnN0IGV4cGVjdGVkVmFsdWVzID0gdGhpcy5fZGVmLnZhbHVlcztcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiB1dGlsLmpvaW5WYWx1ZXMoZXhwZWN0ZWRWYWx1ZXMpLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXRoaXMuX2NhY2hlKSB7XG4gICAgICAgICAgICB0aGlzLl9jYWNoZSA9IG5ldyBTZXQodGhpcy5fZGVmLnZhbHVlcyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLl9jYWNoZS5oYXMoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgICAgIGNvbnN0IGV4cGVjdGVkVmFsdWVzID0gdGhpcy5fZGVmLnZhbHVlcztcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9lbnVtX3ZhbHVlLFxuICAgICAgICAgICAgICAgIG9wdGlvbnM6IGV4cGVjdGVkVmFsdWVzLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gT0soaW5wdXQuZGF0YSk7XG4gICAgfVxuICAgIGdldCBvcHRpb25zKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnZhbHVlcztcbiAgICB9XG4gICAgZ2V0IGVudW0oKSB7XG4gICAgICAgIGNvbnN0IGVudW1WYWx1ZXMgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCB2YWwgb2YgdGhpcy5fZGVmLnZhbHVlcykge1xuICAgICAgICAgICAgZW51bVZhbHVlc1t2YWxdID0gdmFsO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBlbnVtVmFsdWVzO1xuICAgIH1cbiAgICBnZXQgVmFsdWVzKCkge1xuICAgICAgICBjb25zdCBlbnVtVmFsdWVzID0ge307XG4gICAgICAgIGZvciAoY29uc3QgdmFsIG9mIHRoaXMuX2RlZi52YWx1ZXMpIHtcbiAgICAgICAgICAgIGVudW1WYWx1ZXNbdmFsXSA9IHZhbDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZW51bVZhbHVlcztcbiAgICB9XG4gICAgZ2V0IEVudW0oKSB7XG4gICAgICAgIGNvbnN0IGVudW1WYWx1ZXMgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCB2YWwgb2YgdGhpcy5fZGVmLnZhbHVlcykge1xuICAgICAgICAgICAgZW51bVZhbHVlc1t2YWxdID0gdmFsO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBlbnVtVmFsdWVzO1xuICAgIH1cbiAgICBleHRyYWN0KHZhbHVlcywgbmV3RGVmID0gdGhpcy5fZGVmKSB7XG4gICAgICAgIHJldHVybiBab2RFbnVtLmNyZWF0ZSh2YWx1ZXMsIHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIC4uLm5ld0RlZixcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGV4Y2x1ZGUodmFsdWVzLCBuZXdEZWYgPSB0aGlzLl9kZWYpIHtcbiAgICAgICAgcmV0dXJuIFpvZEVudW0uY3JlYXRlKHRoaXMub3B0aW9ucy5maWx0ZXIoKG9wdCkgPT4gIXZhbHVlcy5pbmNsdWRlcyhvcHQpKSwge1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgLi4ubmV3RGVmLFxuICAgICAgICB9KTtcbiAgICB9XG59XG5ab2RFbnVtLmNyZWF0ZSA9IGNyZWF0ZVpvZEVudW07XG5leHBvcnQgY2xhc3MgWm9kTmF0aXZlRW51bSBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCBuYXRpdmVFbnVtVmFsdWVzID0gdXRpbC5nZXRWYWxpZEVudW1WYWx1ZXModGhpcy5fZGVmLnZhbHVlcyk7XG4gICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgaWYgKGN0eC5wYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLnN0cmluZyAmJiBjdHgucGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5udW1iZXIpIHtcbiAgICAgICAgICAgIGNvbnN0IGV4cGVjdGVkVmFsdWVzID0gdXRpbC5vYmplY3RWYWx1ZXMobmF0aXZlRW51bVZhbHVlcyk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogdXRpbC5qb2luVmFsdWVzKGV4cGVjdGVkVmFsdWVzKSxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLl9jYWNoZSkge1xuICAgICAgICAgICAgdGhpcy5fY2FjaGUgPSBuZXcgU2V0KHV0aWwuZ2V0VmFsaWRFbnVtVmFsdWVzKHRoaXMuX2RlZi52YWx1ZXMpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXRoaXMuX2NhY2hlLmhhcyhpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgY29uc3QgZXhwZWN0ZWRWYWx1ZXMgPSB1dGlsLm9iamVjdFZhbHVlcyhuYXRpdmVFbnVtVmFsdWVzKTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9lbnVtX3ZhbHVlLFxuICAgICAgICAgICAgICAgIG9wdGlvbnM6IGV4cGVjdGVkVmFsdWVzLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gT0soaW5wdXQuZGF0YSk7XG4gICAgfVxuICAgIGdldCBlbnVtKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnZhbHVlcztcbiAgICB9XG59XG5ab2ROYXRpdmVFbnVtLmNyZWF0ZSA9ICh2YWx1ZXMsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kTmF0aXZlRW51bSh7XG4gICAgICAgIHZhbHVlczogdmFsdWVzLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZE5hdGl2ZUVudW0sXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kUHJvbWlzZSBleHRlbmRzIFpvZFR5cGUge1xuICAgIHVud3JhcCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi50eXBlO1xuICAgIH1cbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGlmIChjdHgucGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5wcm9taXNlICYmIGN0eC5jb21tb24uYXN5bmMgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLnByb21pc2UsXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwcm9taXNpZmllZCA9IGN0eC5wYXJzZWRUeXBlID09PSBab2RQYXJzZWRUeXBlLnByb21pc2UgPyBjdHguZGF0YSA6IFByb21pc2UucmVzb2x2ZShjdHguZGF0YSk7XG4gICAgICAgIHJldHVybiBPSyhwcm9taXNpZmllZC50aGVuKChkYXRhKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnR5cGUucGFyc2VBc3luYyhkYXRhLCB7XG4gICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgZXJyb3JNYXA6IGN0eC5jb21tb24uY29udGV4dHVhbEVycm9yTWFwLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pKTtcbiAgICB9XG59XG5ab2RQcm9taXNlLmNyZWF0ZSA9IChzY2hlbWEsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kUHJvbWlzZSh7XG4gICAgICAgIHR5cGU6IHNjaGVtYSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RQcm9taXNlLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZEVmZmVjdHMgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBpbm5lclR5cGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuc2NoZW1hO1xuICAgIH1cbiAgICBzb3VyY2VUeXBlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnNjaGVtYS5fZGVmLnR5cGVOYW1lID09PSBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kRWZmZWN0c1xuICAgICAgICAgICAgPyB0aGlzLl9kZWYuc2NoZW1hLnNvdXJjZVR5cGUoKVxuICAgICAgICAgICAgOiB0aGlzLl9kZWYuc2NoZW1hO1xuICAgIH1cbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBzdGF0dXMsIGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgY29uc3QgZWZmZWN0ID0gdGhpcy5fZGVmLmVmZmVjdCB8fCBudWxsO1xuICAgICAgICBjb25zdCBjaGVja0N0eCA9IHtcbiAgICAgICAgICAgIGFkZElzc3VlOiAoYXJnKSA9PiB7XG4gICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCBhcmcpO1xuICAgICAgICAgICAgICAgIGlmIChhcmcuZmF0YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmFib3J0KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZ2V0IHBhdGgoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGN0eC5wYXRoO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgICAgY2hlY2tDdHguYWRkSXNzdWUgPSBjaGVja0N0eC5hZGRJc3N1ZS5iaW5kKGNoZWNrQ3R4KTtcbiAgICAgICAgaWYgKGVmZmVjdC50eXBlID09PSBcInByZXByb2Nlc3NcIikge1xuICAgICAgICAgICAgY29uc3QgcHJvY2Vzc2VkID0gZWZmZWN0LnRyYW5zZm9ybShjdHguZGF0YSwgY2hlY2tDdHgpO1xuICAgICAgICAgICAgaWYgKGN0eC5jb21tb24uYXN5bmMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHByb2Nlc3NlZCkudGhlbihhc3luYyAocHJvY2Vzc2VkKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGF0dXMudmFsdWUgPT09IFwiYWJvcnRlZFwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2RlZi5zY2hlbWEuX3BhcnNlQXN5bmMoe1xuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YTogcHJvY2Vzc2VkLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSBcImFib3J0ZWRcIilcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnN0YXR1cyA9PT0gXCJkaXJ0eVwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIERJUlRZKHJlc3VsdC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGF0dXMudmFsdWUgPT09IFwiZGlydHlcIilcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBESVJUWShyZXN1bHQudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXR1cy52YWx1ZSA9PT0gXCJhYm9ydGVkXCIpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuX2RlZi5zY2hlbWEuX3BhcnNlU3luYyh7XG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IHByb2Nlc3NlZCxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSBcImFib3J0ZWRcIilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5zdGF0dXMgPT09IFwiZGlydHlcIilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIERJUlRZKHJlc3VsdC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXR1cy52YWx1ZSA9PT0gXCJkaXJ0eVwiKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gRElSVFkocmVzdWx0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChlZmZlY3QudHlwZSA9PT0gXCJyZWZpbmVtZW50XCIpIHtcbiAgICAgICAgICAgIGNvbnN0IGV4ZWN1dGVSZWZpbmVtZW50ID0gKGFjYykgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGVmZmVjdC5yZWZpbmVtZW50KGFjYywgY2hlY2tDdHgpO1xuICAgICAgICAgICAgICAgIGlmIChjdHguY29tbW9uLmFzeW5jKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdCBpbnN0YW5jZW9mIFByb21pc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQXN5bmMgcmVmaW5lbWVudCBlbmNvdW50ZXJlZCBkdXJpbmcgc3luY2hyb25vdXMgcGFyc2Ugb3BlcmF0aW9uLiBVc2UgLnBhcnNlQXN5bmMgaW5zdGVhZC5cIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBhY2M7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKGN0eC5jb21tb24uYXN5bmMgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaW5uZXIgPSB0aGlzLl9kZWYuc2NoZW1hLl9wYXJzZVN5bmMoe1xuICAgICAgICAgICAgICAgICAgICBkYXRhOiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmIChpbm5lci5zdGF0dXMgPT09IFwiYWJvcnRlZFwiKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgICAgICBpZiAoaW5uZXIuc3RhdHVzID09PSBcImRpcnR5XCIpXG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIC8vIHJldHVybiB2YWx1ZSBpcyBpZ25vcmVkXG4gICAgICAgICAgICAgICAgZXhlY3V0ZVJlZmluZW1lbnQoaW5uZXIudmFsdWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN0YXR1czogc3RhdHVzLnZhbHVlLCB2YWx1ZTogaW5uZXIudmFsdWUgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9kZWYuc2NoZW1hLl9wYXJzZUFzeW5jKHsgZGF0YTogY3R4LmRhdGEsIHBhdGg6IGN0eC5wYXRoLCBwYXJlbnQ6IGN0eCB9KS50aGVuKChpbm5lcikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaW5uZXIuc3RhdHVzID09PSBcImFib3J0ZWRcIilcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaW5uZXIuc3RhdHVzID09PSBcImRpcnR5XCIpXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGV4ZWN1dGVSZWZpbmVtZW50KGlubmVyLnZhbHVlKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN0YXR1czogc3RhdHVzLnZhbHVlLCB2YWx1ZTogaW5uZXIudmFsdWUgfTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGVmZmVjdC50eXBlID09PSBcInRyYW5zZm9ybVwiKSB7XG4gICAgICAgICAgICBpZiAoY3R4LmNvbW1vbi5hc3luYyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBiYXNlID0gdGhpcy5fZGVmLnNjaGVtYS5fcGFyc2VTeW5jKHtcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAoIWlzVmFsaWQoYmFzZSkpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGVmZmVjdC50cmFuc2Zvcm0oYmFzZS52YWx1ZSwgY2hlY2tDdHgpO1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQXN5bmNocm9ub3VzIHRyYW5zZm9ybSBlbmNvdW50ZXJlZCBkdXJpbmcgc3luY2hyb25vdXMgcGFyc2Ugb3BlcmF0aW9uLiBVc2UgLnBhcnNlQXN5bmMgaW5zdGVhZC5gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBzdGF0dXMudmFsdWUsIHZhbHVlOiByZXN1bHQgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9kZWYuc2NoZW1hLl9wYXJzZUFzeW5jKHsgZGF0YTogY3R4LmRhdGEsIHBhdGg6IGN0eC5wYXRoLCBwYXJlbnQ6IGN0eCB9KS50aGVuKChiYXNlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghaXNWYWxpZChiYXNlKSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGVmZmVjdC50cmFuc2Zvcm0oYmFzZS52YWx1ZSwgY2hlY2tDdHgpKS50aGVuKChyZXN1bHQpID0+ICh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0dXM6IHN0YXR1cy52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiByZXN1bHQsXG4gICAgICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB1dGlsLmFzc2VydE5ldmVyKGVmZmVjdCk7XG4gICAgfVxufVxuWm9kRWZmZWN0cy5jcmVhdGUgPSAoc2NoZW1hLCBlZmZlY3QsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kRWZmZWN0cyh7XG4gICAgICAgIHNjaGVtYSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RFZmZlY3RzLFxuICAgICAgICBlZmZlY3QsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5ab2RFZmZlY3RzLmNyZWF0ZVdpdGhQcmVwcm9jZXNzID0gKHByZXByb2Nlc3MsIHNjaGVtYSwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RFZmZlY3RzKHtcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICBlZmZlY3Q6IHsgdHlwZTogXCJwcmVwcm9jZXNzXCIsIHRyYW5zZm9ybTogcHJlcHJvY2VzcyB9LFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZEVmZmVjdHMsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgeyBab2RFZmZlY3RzIGFzIFpvZFRyYW5zZm9ybWVyIH07XG5leHBvcnQgY2xhc3MgWm9kT3B0aW9uYWwgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgcGFyc2VkVHlwZSA9IHRoaXMuX2dldFR5cGUoaW5wdXQpO1xuICAgICAgICBpZiAocGFyc2VkVHlwZSA9PT0gWm9kUGFyc2VkVHlwZS51bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBPSyh1bmRlZmluZWQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuaW5uZXJUeXBlLl9wYXJzZShpbnB1dCk7XG4gICAgfVxuICAgIHVud3JhcCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5pbm5lclR5cGU7XG4gICAgfVxufVxuWm9kT3B0aW9uYWwuY3JlYXRlID0gKHR5cGUsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kT3B0aW9uYWwoe1xuICAgICAgICBpbm5lclR5cGU6IHR5cGUsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kT3B0aW9uYWwsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kTnVsbGFibGUgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgcGFyc2VkVHlwZSA9IHRoaXMuX2dldFR5cGUoaW5wdXQpO1xuICAgICAgICBpZiAocGFyc2VkVHlwZSA9PT0gWm9kUGFyc2VkVHlwZS5udWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gT0sobnVsbCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5pbm5lclR5cGUuX3BhcnNlKGlucHV0KTtcbiAgICB9XG4gICAgdW53cmFwKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLmlubmVyVHlwZTtcbiAgICB9XG59XG5ab2ROdWxsYWJsZS5jcmVhdGUgPSAodHlwZSwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2ROdWxsYWJsZSh7XG4gICAgICAgIGlubmVyVHlwZTogdHlwZSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2ROdWxsYWJsZSxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2REZWZhdWx0IGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBsZXQgZGF0YSA9IGN0eC5kYXRhO1xuICAgICAgICBpZiAoY3R4LnBhcnNlZFR5cGUgPT09IFpvZFBhcnNlZFR5cGUudW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBkYXRhID0gdGhpcy5fZGVmLmRlZmF1bHRWYWx1ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuaW5uZXJUeXBlLl9wYXJzZSh7XG4gICAgICAgICAgICBkYXRhLFxuICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJlbW92ZURlZmF1bHQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuaW5uZXJUeXBlO1xuICAgIH1cbn1cblpvZERlZmF1bHQuY3JlYXRlID0gKHR5cGUsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kRGVmYXVsdCh7XG4gICAgICAgIGlubmVyVHlwZTogdHlwZSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2REZWZhdWx0LFxuICAgICAgICBkZWZhdWx0VmFsdWU6IHR5cGVvZiBwYXJhbXMuZGVmYXVsdCA9PT0gXCJmdW5jdGlvblwiID8gcGFyYW1zLmRlZmF1bHQgOiAoKSA9PiBwYXJhbXMuZGVmYXVsdCxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RDYXRjaCBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgLy8gbmV3Q3R4IGlzIHVzZWQgdG8gbm90IGNvbGxlY3QgaXNzdWVzIGZyb20gaW5uZXIgdHlwZXMgaW4gY3R4XG4gICAgICAgIGNvbnN0IG5ld0N0eCA9IHtcbiAgICAgICAgICAgIC4uLmN0eCxcbiAgICAgICAgICAgIGNvbW1vbjoge1xuICAgICAgICAgICAgICAgIC4uLmN0eC5jb21tb24sXG4gICAgICAgICAgICAgICAgaXNzdWVzOiBbXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuX2RlZi5pbm5lclR5cGUuX3BhcnNlKHtcbiAgICAgICAgICAgIGRhdGE6IG5ld0N0eC5kYXRhLFxuICAgICAgICAgICAgcGF0aDogbmV3Q3R4LnBhdGgsXG4gICAgICAgICAgICBwYXJlbnQ6IHtcbiAgICAgICAgICAgICAgICAuLi5uZXdDdHgsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKGlzQXN5bmMocmVzdWx0KSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdC50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXM6IFwidmFsaWRcIixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHJlc3VsdC5zdGF0dXMgPT09IFwidmFsaWRcIlxuICAgICAgICAgICAgICAgICAgICAgICAgPyByZXN1bHQudmFsdWVcbiAgICAgICAgICAgICAgICAgICAgICAgIDogdGhpcy5fZGVmLmNhdGNoVmFsdWUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdldCBlcnJvcigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBab2RFcnJvcihuZXdDdHguY29tbW9uLmlzc3Vlcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnB1dDogbmV3Q3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN0YXR1czogXCJ2YWxpZFwiLFxuICAgICAgICAgICAgICAgIHZhbHVlOiByZXN1bHQuc3RhdHVzID09PSBcInZhbGlkXCJcbiAgICAgICAgICAgICAgICAgICAgPyByZXN1bHQudmFsdWVcbiAgICAgICAgICAgICAgICAgICAgOiB0aGlzLl9kZWYuY2F0Y2hWYWx1ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBnZXQgZXJyb3IoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBab2RFcnJvcihuZXdDdHguY29tbW9uLmlzc3Vlcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5wdXQ6IG5ld0N0eC5kYXRhLFxuICAgICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmVtb3ZlQ2F0Y2goKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuaW5uZXJUeXBlO1xuICAgIH1cbn1cblpvZENhdGNoLmNyZWF0ZSA9ICh0eXBlLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZENhdGNoKHtcbiAgICAgICAgaW5uZXJUeXBlOiB0eXBlLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZENhdGNoLFxuICAgICAgICBjYXRjaFZhbHVlOiB0eXBlb2YgcGFyYW1zLmNhdGNoID09PSBcImZ1bmN0aW9uXCIgPyBwYXJhbXMuY2F0Y2ggOiAoKSA9PiBwYXJhbXMuY2F0Y2gsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kTmFOIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZFR5cGUgPSB0aGlzLl9nZXRUeXBlKGlucHV0KTtcbiAgICAgICAgaWYgKHBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUubmFuKSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLm5hbixcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN0YXR1czogXCJ2YWxpZFwiLCB2YWx1ZTogaW5wdXQuZGF0YSB9O1xuICAgIH1cbn1cblpvZE5hTi5jcmVhdGUgPSAocGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2ROYU4oe1xuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZE5hTixcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjb25zdCBCUkFORCA9IFN5bWJvbChcInpvZF9icmFuZFwiKTtcbmV4cG9ydCBjbGFzcyBab2RCcmFuZGVkIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBjb25zdCBkYXRhID0gY3R4LmRhdGE7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYudHlwZS5fcGFyc2Uoe1xuICAgICAgICAgICAgZGF0YSxcbiAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICB1bndyYXAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYudHlwZTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgWm9kUGlwZWxpbmUgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBzdGF0dXMsIGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgaWYgKGN0eC5jb21tb24uYXN5bmMpIHtcbiAgICAgICAgICAgIGNvbnN0IGhhbmRsZUFzeW5jID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGluUmVzdWx0ID0gYXdhaXQgdGhpcy5fZGVmLmluLl9wYXJzZUFzeW5jKHtcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAoaW5SZXN1bHQuc3RhdHVzID09PSBcImFib3J0ZWRcIilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICAgICAgaWYgKGluUmVzdWx0LnN0YXR1cyA9PT0gXCJkaXJ0eVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gRElSVFkoaW5SZXN1bHQudmFsdWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5vdXQuX3BhcnNlQXN5bmMoe1xuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YTogaW5SZXN1bHQudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIGhhbmRsZUFzeW5jKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBpblJlc3VsdCA9IHRoaXMuX2RlZi5pbi5fcGFyc2VTeW5jKHtcbiAgICAgICAgICAgICAgICBkYXRhOiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKGluUmVzdWx0LnN0YXR1cyA9PT0gXCJhYm9ydGVkXCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICBpZiAoaW5SZXN1bHQuc3RhdHVzID09PSBcImRpcnR5XCIpIHtcbiAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXM6IFwiZGlydHlcIixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGluUmVzdWx0LnZhbHVlLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fZGVmLm91dC5fcGFyc2VTeW5jKHtcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogaW5SZXN1bHQudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBzdGF0aWMgY3JlYXRlKGEsIGIpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RQaXBlbGluZSh7XG4gICAgICAgICAgICBpbjogYSxcbiAgICAgICAgICAgIG91dDogYixcbiAgICAgICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kUGlwZWxpbmUsXG4gICAgICAgIH0pO1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBab2RSZWFkb25seSBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLl9kZWYuaW5uZXJUeXBlLl9wYXJzZShpbnB1dCk7XG4gICAgICAgIGNvbnN0IGZyZWV6ZSA9IChkYXRhKSA9PiB7XG4gICAgICAgICAgICBpZiAoaXNWYWxpZChkYXRhKSkge1xuICAgICAgICAgICAgICAgIGRhdGEudmFsdWUgPSBPYmplY3QuZnJlZXplKGRhdGEudmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBpc0FzeW5jKHJlc3VsdCkgPyByZXN1bHQudGhlbigoZGF0YSkgPT4gZnJlZXplKGRhdGEpKSA6IGZyZWV6ZShyZXN1bHQpO1xuICAgIH1cbiAgICB1bndyYXAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuaW5uZXJUeXBlO1xuICAgIH1cbn1cblpvZFJlYWRvbmx5LmNyZWF0ZSA9ICh0eXBlLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZFJlYWRvbmx5KHtcbiAgICAgICAgaW5uZXJUeXBlOiB0eXBlLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZFJlYWRvbmx5LFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8vLy8vLy8vLyAgICAgICAgICAgICAgICAgICAgLy8vLy8vLy8vL1xuLy8vLy8vLy8vLyAgICAgIHouY3VzdG9tICAgICAgLy8vLy8vLy8vL1xuLy8vLy8vLy8vLyAgICAgICAgICAgICAgICAgICAgLy8vLy8vLy8vL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuZnVuY3Rpb24gY2xlYW5QYXJhbXMocGFyYW1zLCBkYXRhKSB7XG4gICAgY29uc3QgcCA9IHR5cGVvZiBwYXJhbXMgPT09IFwiZnVuY3Rpb25cIiA/IHBhcmFtcyhkYXRhKSA6IHR5cGVvZiBwYXJhbXMgPT09IFwic3RyaW5nXCIgPyB7IG1lc3NhZ2U6IHBhcmFtcyB9IDogcGFyYW1zO1xuICAgIGNvbnN0IHAyID0gdHlwZW9mIHAgPT09IFwic3RyaW5nXCIgPyB7IG1lc3NhZ2U6IHAgfSA6IHA7XG4gICAgcmV0dXJuIHAyO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGN1c3RvbShjaGVjaywgX3BhcmFtcyA9IHt9LCBcbi8qKlxuICogQGRlcHJlY2F0ZWRcbiAqXG4gKiBQYXNzIGBmYXRhbGAgaW50byB0aGUgcGFyYW1zIG9iamVjdCBpbnN0ZWFkOlxuICpcbiAqIGBgYHRzXG4gKiB6LnN0cmluZygpLmN1c3RvbSgodmFsKSA9PiB2YWwubGVuZ3RoID4gNSwgeyBmYXRhbDogZmFsc2UgfSlcbiAqIGBgYFxuICpcbiAqL1xuZmF0YWwpIHtcbiAgICBpZiAoY2hlY2spXG4gICAgICAgIHJldHVybiBab2RBbnkuY3JlYXRlKCkuc3VwZXJSZWZpbmUoKGRhdGEsIGN0eCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgciA9IGNoZWNrKGRhdGEpO1xuICAgICAgICAgICAgaWYgKHIgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHIudGhlbigocikgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhcmFtcyA9IGNsZWFuUGFyYW1zKF9wYXJhbXMsIGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgX2ZhdGFsID0gcGFyYW1zLmZhdGFsID8/IGZhdGFsID8/IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdHguYWRkSXNzdWUoeyBjb2RlOiBcImN1c3RvbVwiLCAuLi5wYXJhbXMsIGZhdGFsOiBfZmF0YWwgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmFtcyA9IGNsZWFuUGFyYW1zKF9wYXJhbXMsIGRhdGEpO1xuICAgICAgICAgICAgICAgIGNvbnN0IF9mYXRhbCA9IHBhcmFtcy5mYXRhbCA/PyBmYXRhbCA/PyB0cnVlO1xuICAgICAgICAgICAgICAgIGN0eC5hZGRJc3N1ZSh7IGNvZGU6IFwiY3VzdG9tXCIsIC4uLnBhcmFtcywgZmF0YWw6IF9mYXRhbCB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSk7XG4gICAgcmV0dXJuIFpvZEFueS5jcmVhdGUoKTtcbn1cbmV4cG9ydCB7IFpvZFR5cGUgYXMgU2NoZW1hLCBab2RUeXBlIGFzIFpvZFNjaGVtYSB9O1xuZXhwb3J0IGNvbnN0IGxhdGUgPSB7XG4gICAgb2JqZWN0OiBab2RPYmplY3QubGF6eWNyZWF0ZSxcbn07XG5leHBvcnQgdmFyIFpvZEZpcnN0UGFydHlUeXBlS2luZDtcbihmdW5jdGlvbiAoWm9kRmlyc3RQYXJ0eVR5cGVLaW5kKSB7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kU3RyaW5nXCJdID0gXCJab2RTdHJpbmdcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2ROdW1iZXJcIl0gPSBcIlpvZE51bWJlclwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZE5hTlwiXSA9IFwiWm9kTmFOXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kQmlnSW50XCJdID0gXCJab2RCaWdJbnRcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RCb29sZWFuXCJdID0gXCJab2RCb29sZWFuXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kRGF0ZVwiXSA9IFwiWm9kRGF0ZVwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZFN5bWJvbFwiXSA9IFwiWm9kU3ltYm9sXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kVW5kZWZpbmVkXCJdID0gXCJab2RVbmRlZmluZWRcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2ROdWxsXCJdID0gXCJab2ROdWxsXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kQW55XCJdID0gXCJab2RBbnlcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RVbmtub3duXCJdID0gXCJab2RVbmtub3duXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kTmV2ZXJcIl0gPSBcIlpvZE5ldmVyXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kVm9pZFwiXSA9IFwiWm9kVm9pZFwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZEFycmF5XCJdID0gXCJab2RBcnJheVwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZE9iamVjdFwiXSA9IFwiWm9kT2JqZWN0XCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kVW5pb25cIl0gPSBcIlpvZFVuaW9uXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kRGlzY3JpbWluYXRlZFVuaW9uXCJdID0gXCJab2REaXNjcmltaW5hdGVkVW5pb25cIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RJbnRlcnNlY3Rpb25cIl0gPSBcIlpvZEludGVyc2VjdGlvblwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZFR1cGxlXCJdID0gXCJab2RUdXBsZVwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZFJlY29yZFwiXSA9IFwiWm9kUmVjb3JkXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kTWFwXCJdID0gXCJab2RNYXBcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RTZXRcIl0gPSBcIlpvZFNldFwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZEZ1bmN0aW9uXCJdID0gXCJab2RGdW5jdGlvblwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZExhenlcIl0gPSBcIlpvZExhenlcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RMaXRlcmFsXCJdID0gXCJab2RMaXRlcmFsXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kRW51bVwiXSA9IFwiWm9kRW51bVwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZEVmZmVjdHNcIl0gPSBcIlpvZEVmZmVjdHNcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2ROYXRpdmVFbnVtXCJdID0gXCJab2ROYXRpdmVFbnVtXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kT3B0aW9uYWxcIl0gPSBcIlpvZE9wdGlvbmFsXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kTnVsbGFibGVcIl0gPSBcIlpvZE51bGxhYmxlXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kRGVmYXVsdFwiXSA9IFwiWm9kRGVmYXVsdFwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZENhdGNoXCJdID0gXCJab2RDYXRjaFwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZFByb21pc2VcIl0gPSBcIlpvZFByb21pc2VcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RCcmFuZGVkXCJdID0gXCJab2RCcmFuZGVkXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kUGlwZWxpbmVcIl0gPSBcIlpvZFBpcGVsaW5lXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kUmVhZG9ubHlcIl0gPSBcIlpvZFJlYWRvbmx5XCI7XG59KShab2RGaXJzdFBhcnR5VHlwZUtpbmQgfHwgKFpvZEZpcnN0UGFydHlUeXBlS2luZCA9IHt9KSk7XG4vLyByZXF1aXJlcyBUUyA0LjQrXG5jbGFzcyBDbGFzcyB7XG4gICAgY29uc3RydWN0b3IoLi4uXykgeyB9XG59XG5jb25zdCBpbnN0YW5jZU9mVHlwZSA9IChcbi8vIGNvbnN0IGluc3RhbmNlT2ZUeXBlID0gPFQgZXh0ZW5kcyBuZXcgKC4uLmFyZ3M6IGFueVtdKSA9PiBhbnk+KFxuY2xzLCBwYXJhbXMgPSB7XG4gICAgbWVzc2FnZTogYElucHV0IG5vdCBpbnN0YW5jZSBvZiAke2Nscy5uYW1lfWAsXG59KSA9PiBjdXN0b20oKGRhdGEpID0+IGRhdGEgaW5zdGFuY2VvZiBjbHMsIHBhcmFtcyk7XG5jb25zdCBzdHJpbmdUeXBlID0gWm9kU3RyaW5nLmNyZWF0ZTtcbmNvbnN0IG51bWJlclR5cGUgPSBab2ROdW1iZXIuY3JlYXRlO1xuY29uc3QgbmFuVHlwZSA9IFpvZE5hTi5jcmVhdGU7XG5jb25zdCBiaWdJbnRUeXBlID0gWm9kQmlnSW50LmNyZWF0ZTtcbmNvbnN0IGJvb2xlYW5UeXBlID0gWm9kQm9vbGVhbi5jcmVhdGU7XG5jb25zdCBkYXRlVHlwZSA9IFpvZERhdGUuY3JlYXRlO1xuY29uc3Qgc3ltYm9sVHlwZSA9IFpvZFN5bWJvbC5jcmVhdGU7XG5jb25zdCB1bmRlZmluZWRUeXBlID0gWm9kVW5kZWZpbmVkLmNyZWF0ZTtcbmNvbnN0IG51bGxUeXBlID0gWm9kTnVsbC5jcmVhdGU7XG5jb25zdCBhbnlUeXBlID0gWm9kQW55LmNyZWF0ZTtcbmNvbnN0IHVua25vd25UeXBlID0gWm9kVW5rbm93bi5jcmVhdGU7XG5jb25zdCBuZXZlclR5cGUgPSBab2ROZXZlci5jcmVhdGU7XG5jb25zdCB2b2lkVHlwZSA9IFpvZFZvaWQuY3JlYXRlO1xuY29uc3QgYXJyYXlUeXBlID0gWm9kQXJyYXkuY3JlYXRlO1xuY29uc3Qgb2JqZWN0VHlwZSA9IFpvZE9iamVjdC5jcmVhdGU7XG5jb25zdCBzdHJpY3RPYmplY3RUeXBlID0gWm9kT2JqZWN0LnN0cmljdENyZWF0ZTtcbmNvbnN0IHVuaW9uVHlwZSA9IFpvZFVuaW9uLmNyZWF0ZTtcbmNvbnN0IGRpc2NyaW1pbmF0ZWRVbmlvblR5cGUgPSBab2REaXNjcmltaW5hdGVkVW5pb24uY3JlYXRlO1xuY29uc3QgaW50ZXJzZWN0aW9uVHlwZSA9IFpvZEludGVyc2VjdGlvbi5jcmVhdGU7XG5jb25zdCB0dXBsZVR5cGUgPSBab2RUdXBsZS5jcmVhdGU7XG5jb25zdCByZWNvcmRUeXBlID0gWm9kUmVjb3JkLmNyZWF0ZTtcbmNvbnN0IG1hcFR5cGUgPSBab2RNYXAuY3JlYXRlO1xuY29uc3Qgc2V0VHlwZSA9IFpvZFNldC5jcmVhdGU7XG5jb25zdCBmdW5jdGlvblR5cGUgPSBab2RGdW5jdGlvbi5jcmVhdGU7XG5jb25zdCBsYXp5VHlwZSA9IFpvZExhenkuY3JlYXRlO1xuY29uc3QgbGl0ZXJhbFR5cGUgPSBab2RMaXRlcmFsLmNyZWF0ZTtcbmNvbnN0IGVudW1UeXBlID0gWm9kRW51bS5jcmVhdGU7XG5jb25zdCBuYXRpdmVFbnVtVHlwZSA9IFpvZE5hdGl2ZUVudW0uY3JlYXRlO1xuY29uc3QgcHJvbWlzZVR5cGUgPSBab2RQcm9taXNlLmNyZWF0ZTtcbmNvbnN0IGVmZmVjdHNUeXBlID0gWm9kRWZmZWN0cy5jcmVhdGU7XG5jb25zdCBvcHRpb25hbFR5cGUgPSBab2RPcHRpb25hbC5jcmVhdGU7XG5jb25zdCBudWxsYWJsZVR5cGUgPSBab2ROdWxsYWJsZS5jcmVhdGU7XG5jb25zdCBwcmVwcm9jZXNzVHlwZSA9IFpvZEVmZmVjdHMuY3JlYXRlV2l0aFByZXByb2Nlc3M7XG5jb25zdCBwaXBlbGluZVR5cGUgPSBab2RQaXBlbGluZS5jcmVhdGU7XG5jb25zdCBvc3RyaW5nID0gKCkgPT4gc3RyaW5nVHlwZSgpLm9wdGlvbmFsKCk7XG5jb25zdCBvbnVtYmVyID0gKCkgPT4gbnVtYmVyVHlwZSgpLm9wdGlvbmFsKCk7XG5jb25zdCBvYm9vbGVhbiA9ICgpID0+IGJvb2xlYW5UeXBlKCkub3B0aW9uYWwoKTtcbmV4cG9ydCBjb25zdCBjb2VyY2UgPSB7XG4gICAgc3RyaW5nOiAoKGFyZykgPT4gWm9kU3RyaW5nLmNyZWF0ZSh7IC4uLmFyZywgY29lcmNlOiB0cnVlIH0pKSxcbiAgICBudW1iZXI6ICgoYXJnKSA9PiBab2ROdW1iZXIuY3JlYXRlKHsgLi4uYXJnLCBjb2VyY2U6IHRydWUgfSkpLFxuICAgIGJvb2xlYW46ICgoYXJnKSA9PiBab2RCb29sZWFuLmNyZWF0ZSh7XG4gICAgICAgIC4uLmFyZyxcbiAgICAgICAgY29lcmNlOiB0cnVlLFxuICAgIH0pKSxcbiAgICBiaWdpbnQ6ICgoYXJnKSA9PiBab2RCaWdJbnQuY3JlYXRlKHsgLi4uYXJnLCBjb2VyY2U6IHRydWUgfSkpLFxuICAgIGRhdGU6ICgoYXJnKSA9PiBab2REYXRlLmNyZWF0ZSh7IC4uLmFyZywgY29lcmNlOiB0cnVlIH0pKSxcbn07XG5leHBvcnQgeyBhbnlUeXBlIGFzIGFueSwgYXJyYXlUeXBlIGFzIGFycmF5LCBiaWdJbnRUeXBlIGFzIGJpZ2ludCwgYm9vbGVhblR5cGUgYXMgYm9vbGVhbiwgZGF0ZVR5cGUgYXMgZGF0ZSwgZGlzY3JpbWluYXRlZFVuaW9uVHlwZSBhcyBkaXNjcmltaW5hdGVkVW5pb24sIGVmZmVjdHNUeXBlIGFzIGVmZmVjdCwgZW51bVR5cGUgYXMgZW51bSwgZnVuY3Rpb25UeXBlIGFzIGZ1bmN0aW9uLCBpbnN0YW5jZU9mVHlwZSBhcyBpbnN0YW5jZW9mLCBpbnRlcnNlY3Rpb25UeXBlIGFzIGludGVyc2VjdGlvbiwgbGF6eVR5cGUgYXMgbGF6eSwgbGl0ZXJhbFR5cGUgYXMgbGl0ZXJhbCwgbWFwVHlwZSBhcyBtYXAsIG5hblR5cGUgYXMgbmFuLCBuYXRpdmVFbnVtVHlwZSBhcyBuYXRpdmVFbnVtLCBuZXZlclR5cGUgYXMgbmV2ZXIsIG51bGxUeXBlIGFzIG51bGwsIG51bGxhYmxlVHlwZSBhcyBudWxsYWJsZSwgbnVtYmVyVHlwZSBhcyBudW1iZXIsIG9iamVjdFR5cGUgYXMgb2JqZWN0LCBvYm9vbGVhbiwgb251bWJlciwgb3B0aW9uYWxUeXBlIGFzIG9wdGlvbmFsLCBvc3RyaW5nLCBwaXBlbGluZVR5cGUgYXMgcGlwZWxpbmUsIHByZXByb2Nlc3NUeXBlIGFzIHByZXByb2Nlc3MsIHByb21pc2VUeXBlIGFzIHByb21pc2UsIHJlY29yZFR5cGUgYXMgcmVjb3JkLCBzZXRUeXBlIGFzIHNldCwgc3RyaWN0T2JqZWN0VHlwZSBhcyBzdHJpY3RPYmplY3QsIHN0cmluZ1R5cGUgYXMgc3RyaW5nLCBzeW1ib2xUeXBlIGFzIHN5bWJvbCwgZWZmZWN0c1R5cGUgYXMgdHJhbnNmb3JtZXIsIHR1cGxlVHlwZSBhcyB0dXBsZSwgdW5kZWZpbmVkVHlwZSBhcyB1bmRlZmluZWQsIHVuaW9uVHlwZSBhcyB1bmlvbiwgdW5rbm93blR5cGUgYXMgdW5rbm93biwgdm9pZFR5cGUgYXMgdm9pZCwgfTtcbmV4cG9ydCBjb25zdCBORVZFUiA9IElOVkFMSUQ7XG4iLCJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IEVSUk9SX0tJTkRTIH0gZnJvbSAnLi9lcnJvcnMnO1xuXG4vKipcbiAqIOaMgeS5heWMluaVsOaNruS4juaooeWei+WTjeW6lOWFseeUqOeahCBab2QgU2NoZW1h44CCXG4gKiDlrZjlgqgga2V5IOingSBkb2NzL+aKgOacr+aetuaehOaWueahiCDnrKwgMTAg6IqC77yaXG4gKiBzZXR0aW5nczptb2RlbCAvIGpvYjpjdXJyZW50IC8gc2NhbjpjdXJyZW50IC8gcGxhbjpjdXJyZW50IC8gdW5kbzpsYXRlc3RcbiAqL1xuXG5leHBvcnQgY29uc3QgU1RPUkFHRV9LRVlTID0ge1xuICBtb2RlbFNldHRpbmdzOiAnc2V0dGluZ3M6bW9kZWwnLFxuICBqb2I6ICdqb2I6Y3VycmVudCcsXG4gIHNjYW46ICdzY2FuOmN1cnJlbnQnLFxuICBwbGFuOiAncGxhbjpjdXJyZW50JyxcbiAgdW5kbzogJ3VuZG86bGF0ZXN0Jyxcbn0gYXMgY29uc3Q7XG5cbi8qKiDlhpnlhaUgY2hyb21lLnN0b3JhZ2UubG9jYWwg5YmN5YWB6K6455qE5pyA5aSn5bey55So56m66Ze077yI5o6l6L+RIDEwIE1CIOmFjemineaXtuWBnOatou+8ieOAgiAqL1xuZXhwb3J0IGNvbnN0IFNUT1JBR0VfUVVPVEFfTElNSVRfQllURVMgPSA5LjUgKiAxMDI0ICogMTAyNDtcblxuLy8gLS0tLS0tLS0tLSDmqKHlnovorr7nva4gLS0tLS0tLS0tLVxuXG5leHBvcnQgY29uc3QgTW9kZWxTZXR0aW5nc1NjaGVtYSA9IHoub2JqZWN0KHtcbiAgYmFzZVVybDogelxuICAgIC5zdHJpbmcoKVxuICAgIC51cmwoKVxuICAgIC5yZWZpbmUoKHUpID0+IHUuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKSwgeyBtZXNzYWdlOiAn5LuF5pSv5oyBIEhUVFBTIOeahCBBUEkgQmFzZSBVUkwnIH0pLFxuICBhcGlLZXk6IHouc3RyaW5nKCkubWluKDEpLFxuICBtb2RlbDogei5zdHJpbmcoKS5taW4oMSksXG59KTtcbmV4cG9ydCB0eXBlIE1vZGVsU2V0dGluZ3MgPSB6LmluZmVyPHR5cGVvZiBNb2RlbFNldHRpbmdzU2NoZW1hPjtcblxuLy8gLS0tLS0tLS0tLSDmiavmj4/nu5PmnpwgLS0tLS0tLS0tLVxuXG5leHBvcnQgY29uc3QgU2NhblJvb3RTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICB0aXRsZTogei5zdHJpbmcoKSxcbn0pO1xuZXhwb3J0IHR5cGUgU2NhblJvb3QgPSB6LmluZmVyPHR5cGVvZiBTY2FuUm9vdFNjaGVtYT47XG5cbmV4cG9ydCBjb25zdCBTY2FuRm9sZGVyU2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgcGFyZW50SWQ6IHouc3RyaW5nKCksXG4gIHJvb3RJZDogei5zdHJpbmcoKSxcbiAgdGl0bGU6IHouc3RyaW5nKCksXG4gIC8qKiDnm7jlr7nkuo7miYDlnKjmoLnnm67lvZXnmoTnm67lvZXlkI3ot6/lvoTvvIjkuI3lkKvmoLnnm67lvZXoh6rouqvvvInjgIIgKi9cbiAgcGF0aDogei5hcnJheSh6LnN0cmluZygpKSxcbiAgZGVwdGg6IHoubnVtYmVyKCkuaW50KCkubm9ubmVnYXRpdmUoKSxcbn0pO1xuZXhwb3J0IHR5cGUgU2NhbkZvbGRlciA9IHouaW5mZXI8dHlwZW9mIFNjYW5Gb2xkZXJTY2hlbWE+O1xuXG5leHBvcnQgY29uc3QgU2Nhbm5lZEJvb2ttYXJrU2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgdGl0bGU6IHouc3RyaW5nKCksXG4gIHVybDogei5zdHJpbmcoKSxcbiAgZGF0ZUFkZGVkOiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gIHBhcmVudElkOiB6LnN0cmluZygpLFxuICByb290SWQ6IHouc3RyaW5nKCksXG4gIC8qKiDkuabnrb7miYDlnKjnm67lvZXnm7jlr7nkuo7moLnnm67lvZXnmoTnm67lvZXlkI3ot6/lvoTvvIjkuI3lkKvmoLnnm67lvZXoh6rouqvvvInjgIIgKi9cbiAgcGF0aDogei5hcnJheSh6LnN0cmluZygpKSxcbn0pO1xuZXhwb3J0IHR5cGUgU2Nhbm5lZEJvb2ttYXJrID0gei5pbmZlcjx0eXBlb2YgU2Nhbm5lZEJvb2ttYXJrU2NoZW1hPjtcblxuZXhwb3J0IGNvbnN0IFNjYW5SZXN1bHRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNjYW5JZDogei5zdHJpbmcoKSxcbiAgc2Nhbm5lZEF0OiB6Lm51bWJlcigpLFxuICByb290czogei5hcnJheShTY2FuUm9vdFNjaGVtYSksXG4gIGZvbGRlcnM6IHouYXJyYXkoU2NhbkZvbGRlclNjaGVtYSksXG4gIGJvb2ttYXJrczogei5hcnJheShTY2FubmVkQm9va21hcmtTY2hlbWEpLFxufSk7XG5leHBvcnQgdHlwZSBTY2FuUmVzdWx0ID0gei5pbmZlcjx0eXBlb2YgU2NhblJlc3VsdFNjaGVtYT47XG5cbi8vIC0tLS0tLS0tLS0g5YiG57G75pa55qGIIC0tLS0tLS0tLS1cblxuY29uc3QgUGF0aFNlZ21lbnRTY2hlbWEgPSB6LnN0cmluZygpLm1pbigxKS5tYXgoMTAwKTtcbi8qKlxuICog5L+d5a6I5qih5byP6ZyA6KaB5a6M5pW05aSN55So55So5oi35bey5pyJ55qE5rex5bGC55uu5b2V77yb6YeN5paw6KeE5YiS5qih5byP5LuN5Zyo5Lia5Yqh5bGC6ZmQ5Yi25Li65pyA5aSa5Lik57qn44CCXG4gKiDov5nph4zkv53nlZnkuIDkuKrlrr3mnb7kvYbmnInkuIrpmZDnmoTmjIHkuYXljJbovrnnlYzvvIzpgb/lhY3lkIjms5XnmoTnjrDmnInnm67lvZXlnKjor7vlj5bml7booqvkuKLlvIPjgIJcbiAqL1xuZXhwb3J0IGNvbnN0IFRhcmdldFBhdGhTY2hlbWEgPSB6LmFycmF5KFBhdGhTZWdtZW50U2NoZW1hKS5taW4oMSkubWF4KDEwMCk7XG5cbmV4cG9ydCBjb25zdCBPUkdBTklaRV9NT0RFUyA9IFsnY29uc2VydmF0aXZlJywgJ3Jlb3JnYW5pemUnXSBhcyBjb25zdDtcbmV4cG9ydCBjb25zdCBPcmdhbml6ZU1vZGVTY2hlbWEgPSB6LmVudW0oT1JHQU5JWkVfTU9ERVMpO1xuZXhwb3J0IHR5cGUgT3JnYW5pemVNb2RlID0gei5pbmZlcjx0eXBlb2YgT3JnYW5pemVNb2RlU2NoZW1hPjtcblxuZXhwb3J0IGNvbnN0IEZPTERFUl9OQU1FX1NUWUxFUyA9IFsnZW1vamknLCAndGV4dCddIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IEZvbGRlck5hbWVTdHlsZVNjaGVtYSA9IHouZW51bShGT0xERVJfTkFNRV9TVFlMRVMpO1xuZXhwb3J0IHR5cGUgRm9sZGVyTmFtZVN0eWxlID0gei5pbmZlcjx0eXBlb2YgRm9sZGVyTmFtZVN0eWxlU2NoZW1hPjtcblxuZXhwb3J0IGNvbnN0IEFzc2lnbm1lbnRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGJvb2ttYXJrSWQ6IHouc3RyaW5nKCksXG4gIHRhcmdldFBhdGg6IFRhcmdldFBhdGhTY2hlbWEsXG4gIHJlYXNvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxufSk7XG5leHBvcnQgdHlwZSBBc3NpZ25tZW50ID0gei5pbmZlcjx0eXBlb2YgQXNzaWdubWVudFNjaGVtYT47XG5cbmV4cG9ydCBjb25zdCBQbGFuUmVjb3JkU2NoZW1hID0gei5vYmplY3Qoe1xuICBqb2JJZDogei5zdHJpbmcoKSxcbiAgY3JlYXRlZEF0OiB6Lm51bWJlcigpLFxuICAvKiog55So5oi35piO56Gu6YCJ5Lit55qE5paH5Lu25aS56IyD5Zu077yb5pen5pa55qGI6buY6K6k5LiN5riF55CG5Lu75L2V5Y6f5paH5Lu25aS544CCICovXG4gIHNlbGVjdGVkRm9sZGVySWRzOiB6LmFycmF5KHouc3RyaW5nKCkpLmRlZmF1bHQoW10pLFxuICAvKiog5pen5pa55qGI6buY6K6k5oyJ5Y6G5Y+y6KGM5Li66KeG5Li64oCc6YeN5paw6KeE5YiS55uu5b2V4oCd44CCICovXG4gIG1vZGU6IE9yZ2FuaXplTW9kZVNjaGVtYS5kZWZhdWx0KCdyZW9yZ2FuaXplJyksXG4gIC8qKiDml6fmlrnmoYjnmoTnm67lvZXlkI3lnYfkuLrnuq/mloflrZfjgIIgKi9cbiAgZm9sZGVyTmFtZVN0eWxlOiBGb2xkZXJOYW1lU3R5bGVTY2hlbWEuZGVmYXVsdCgndGV4dCcpLFxuICBwaGFzZTogei5lbnVtKFsndGF4b25vbXknLCAnYXNzaWduJywgJ2RvbmUnXSksXG4gIC8qKiDliIbnsbvkvZPns7vpmLbmrrXlkITmibnmrKHkuqflh7rnmoTlgJnpgInnm67lvZXvvIznlKjkuo7mlq3ngrnnu63ot5HjgIIgKi9cbiAgdGF4b25vbXlDYW5kaWRhdGVzOiB6LmFycmF5KHouYXJyYXkoUGF0aFNlZ21lbnRTY2hlbWEpLm1pbigxKS5tYXgoMikpLmRlZmF1bHQoW10pLFxuICAvKiog5bey5a6M5oiQ55qE5YiG57G75L2T57O75om55qyh5pWw44CCICovXG4gIHRheG9ub215Q3Vyc29yOiB6Lm51bWJlcigpLmludCgpLm5vbm5lZ2F0aXZlKCkuZGVmYXVsdCgwKSxcbiAgLyoqIOacgOe7iOebruW9leS9k+ezu++8m+mHjeaWsOinhOWIkuaooeW8j+acgOWkmuS4pOe6p++8jOS/neWuiOaooeW8j+WPr+S/neeVmeeOsOaciea3seWxgui3r+W+hOOAgiAqL1xuICB0YXhvbm9teTogei5hcnJheShUYXJnZXRQYXRoU2NoZW1hKS5kZWZhdWx0KFtdKSxcbiAgYXNzaWdubWVudHM6IHouYXJyYXkoQXNzaWdubWVudFNjaGVtYSkuZGVmYXVsdChbXSksXG4gIC8qKiDlt7LlrozmiJDliIbphY3nmoTkuabnrb7mlbDmuLjmoIfvvIzmgaLlpI3ml7bku47ov5nph4znu6fnu63jgIIgKi9cbiAgYXNzaWduQ3Vyc29yOiB6Lm51bWJlcigpLmludCgpLm5vbm5lZ2F0aXZlKCkuZGVmYXVsdCgwKSxcbn0pO1xuZXhwb3J0IHR5cGUgUGxhblJlY29yZCA9IHouaW5mZXI8dHlwZW9mIFBsYW5SZWNvcmRTY2hlbWE+O1xuXG4vLyAtLS0tLS0tLS0tIOS7u+WKoeeKtuaAgSAtLS0tLS0tLS0tXG5cbmV4cG9ydCBjb25zdCBKT0JfU1RBVFVTRVMgPSBbXG4gICdpZGxlJyxcbiAgJ3NjYW5uaW5nJyxcbiAgJ3BsYW5uaW5nJyxcbiAgJ2NsYXNzaWZ5aW5nJyxcbiAgJ3Jldmlld2luZycsXG4gICdhcHBseWluZycsXG4gICdjb21wbGV0ZWQnLFxuICAnaW50ZXJydXB0ZWQnLFxuICAndW5kb2luZycsXG4gICd1bmRvbmUnLFxuICAncGFydGlhbGx5X3VuZG9uZScsXG4gICdmYWlsZWQnLFxuXSBhcyBjb25zdDtcbmV4cG9ydCB0eXBlIEpvYlN0YXR1cyA9ICh0eXBlb2YgSk9CX1NUQVRVU0VTKVtudW1iZXJdO1xuXG5leHBvcnQgY29uc3QgRmFpbHVyZUl0ZW1TY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGJvb2ttYXJrSWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgZm9sZGVySWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAga2luZDogei5lbnVtKEVSUk9SX0tJTkRTKSxcbiAgbWVzc2FnZTogei5zdHJpbmcoKSxcbn0pO1xuZXhwb3J0IHR5cGUgRmFpbHVyZUl0ZW0gPSB6LmluZmVyPHR5cGVvZiBGYWlsdXJlSXRlbVNjaGVtYT47XG5cbmV4cG9ydCBjb25zdCBKb2JTdGF0ZVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgam9iSWQ6IHouc3RyaW5nKCksXG4gIHN0YXR1czogei5lbnVtKEpPQl9TVEFUVVNFUyksXG4gIHVwZGF0ZWRBdDogei5udW1iZXIoKSxcbiAgLyoqIGFwcGx5IOmYtuauteaIkOWKn+enu+WKqOeahOS5puetvuaVsOa4uOagh+OAgiAqL1xuICBhcHBseUN1cnNvcjogei5udW1iZXIoKS5pbnQoKS5ub25uZWdhdGl2ZSgpLmRlZmF1bHQoMCksXG4gIGFwcGxpZWRJZHM6IHouYXJyYXkoei5zdHJpbmcoKSkuZGVmYXVsdChbXSksXG4gIC8qKiBhcHBseSDpmLbmrrXmlrDlu7rnmoTnm67lvZUgSUTvvIjmkqTplIDml7blj6rliKDpmaTov5nkupvnm67lvZXkuK3nmoTnqbrnm67lvZXvvInjgIIgKi9cbiAgY3JlYXRlZEZvbGRlcklkczogei5hcnJheSh6LnN0cmluZygpKS5kZWZhdWx0KFtdKSxcbiAgLyoqIOeUqOaIt+ivt+axguS4reaWreWGmeWFpeeahOagh+W/l++8jFNlcnZpY2UgV29ya2VyIOWcqOavj+adoeWGmeWFpeS5i+mXtOajgOafpeOAgiAqL1xuICBjYW5jZWxSZXF1ZXN0ZWQ6IHouYm9vbGVhbigpLmRlZmF1bHQoZmFsc2UpLFxuICBmYWlsdXJlczogei5hcnJheShGYWlsdXJlSXRlbVNjaGVtYSkuZGVmYXVsdChbXSksXG4gIGVycm9yOiBGYWlsdXJlSXRlbVNjaGVtYS5vcHRpb25hbCgpLFxufSk7XG5leHBvcnQgdHlwZSBKb2JTdGF0ZSA9IHouaW5mZXI8dHlwZW9mIEpvYlN0YXRlU2NoZW1hPjtcblxuLy8gLS0tLS0tLS0tLSDmkqTplIDlv6vnhacgLS0tLS0tLS0tLVxuXG5leHBvcnQgY29uc3QgVW5kb01vdmVTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGJvb2ttYXJrSWQ6IHouc3RyaW5nKCksXG4gIGZyb21QYXJlbnRJZDogei5zdHJpbmcoKSxcbiAgZnJvbUluZGV4OiB6Lm51bWJlcigpLmludCgpLm5vbm5lZ2F0aXZlKCksXG4gIHRvRm9sZGVySWQ6IHouc3RyaW5nKCksXG59KTtcbmV4cG9ydCB0eXBlIFVuZG9Nb3ZlID0gei5pbmZlcjx0eXBlb2YgVW5kb01vdmVTY2hlbWE+O1xuXG4vKiog5bqU55So5pe26KKr5pCs56m65bm25Yig6Zmk55qE5Y6f5paH5Lu25aS577yM5pKk6ZSA5pe25o2u5q2k6YeN5bu65Lul6L+Y5Y6f5Lmm562+5L2N572u44CCICovXG5leHBvcnQgY29uc3QgRGVsZXRlZEZvbGRlclNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIHBhcmVudElkOiB6LnN0cmluZygpLFxuICB0aXRsZTogei5zdHJpbmcoKSxcbiAgaW5kZXg6IHoubnVtYmVyKCkuaW50KCkubm9ubmVnYXRpdmUoKSxcbn0pO1xuZXhwb3J0IHR5cGUgRGVsZXRlZEZvbGRlciA9IHouaW5mZXI8dHlwZW9mIERlbGV0ZWRGb2xkZXJTY2hlbWE+O1xuXG5leHBvcnQgY29uc3QgVW5kb1NuYXBzaG90U2NoZW1hID0gei5vYmplY3Qoe1xuICBqb2JJZDogei5zdHJpbmcoKSxcbiAgY3JlYXRlZEF0OiB6Lm51bWJlcigpLFxuICBtb3Zlczogei5hcnJheShVbmRvTW92ZVNjaGVtYSksXG4gIGNyZWF0ZWRGb2xkZXJzOiB6LmFycmF5KFxuICAgIHoub2JqZWN0KHsgaWQ6IHouc3RyaW5nKCksIGRlcHRoOiB6Lm51bWJlcigpLmludCgpLm5vbm5lZ2F0aXZlKCkgfSksXG4gICksXG4gIC8vIOaXp+W/q+eFp+aXoOatpOWtl+aute+8mum7mOiupOepuuaVsOe7hO+8jOS/neivgeWQkeWQjuWFvOWuueOAglxuICBkZWxldGVkRm9sZGVyczogei5hcnJheShEZWxldGVkRm9sZGVyU2NoZW1hKS5kZWZhdWx0KFtdKSxcbn0pO1xuZXhwb3J0IHR5cGUgVW5kb1NuYXBzaG90ID0gei5pbmZlcjx0eXBlb2YgVW5kb1NuYXBzaG90U2NoZW1hPjtcblxuLy8gLS0tLS0tLS0tLSDmqKHlnovlk43lupQgLS0tLS0tLS0tLVxuXG4vKiog5qih5Z6L5oyJ5om55qyh6L+U5Zue55qE5YCZ6YCJ55uu5b2V44CCICovXG5leHBvcnQgY29uc3QgTW9kZWxDYW5kaWRhdGVCYXRjaFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgY2FuZGlkYXRlczogei5hcnJheSh6LmFycmF5KHouc3RyaW5nKCkpLm1pbigxKS5tYXgoMikpLFxufSk7XG5leHBvcnQgdHlwZSBNb2RlbENhbmRpZGF0ZUJhdGNoID0gei5pbmZlcjx0eXBlb2YgTW9kZWxDYW5kaWRhdGVCYXRjaFNjaGVtYT47XG5cbi8qKiDlkIjlubblkI7nmoTmnIDnu4jnm67lvZXkvZPns7vjgIIgKi9cbmV4cG9ydCBjb25zdCBNb2RlbFRheG9ub215U2NoZW1hID0gei5vYmplY3Qoe1xuICBjYXRlZ29yaWVzOiB6LmFycmF5KHouYXJyYXkoei5zdHJpbmcoKSkubWluKDEpLm1heCgyKSksXG59KTtcbmV4cG9ydCB0eXBlIE1vZGVsVGF4b25vbXkgPSB6LmluZmVyPHR5cGVvZiBNb2RlbFRheG9ub215U2NoZW1hPjtcblxuLyoqIOWIhumFjemYtuauteaooeWei+WPquiDvei/lOWbnui/meS4ieS4quWtl+aute+8jOS4jeiDvei/lOWbnuS7u+S9lSBDaHJvbWUg6IqC54K5IElE44CCICovXG5leHBvcnQgY29uc3QgTW9kZWxBc3NpZ25tZW50QmF0Y2hTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGFzc2lnbm1lbnRzOiB6LmFycmF5KFxuICAgIHoub2JqZWN0KHtcbiAgICAgIGJvb2ttYXJrSWQ6IHouc3RyaW5nKCksXG4gICAgICB0YXJnZXRQYXRoOiB6LmFycmF5KHouc3RyaW5nKCkpLm1pbigxKS5tYXgoMiksXG4gICAgICByZWFzb246IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICB9KSxcbiAgKSxcbn0pO1xuZXhwb3J0IHR5cGUgTW9kZWxBc3NpZ25tZW50QmF0Y2ggPSB6LmluZmVyPHR5cGVvZiBNb2RlbEFzc2lnbm1lbnRCYXRjaFNjaGVtYT47XG5cbi8qKiDkv53lrojmqKHlvI/lj6/ov5Tlm57nlKjmiLflt7LmnInnmoTmt7HlsYLot6/lvoTvvIzpmo/lkI7ov5jkvJrpgJDmnaHmoKHpqozmmK/lkKblkb3kuK3nmb3lkI3ljZXjgIIgKi9cbmV4cG9ydCBjb25zdCBNb2RlbENvbnNlcnZhdGl2ZUFzc2lnbm1lbnRCYXRjaFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgYXNzaWdubWVudHM6IHouYXJyYXkoXG4gICAgei5vYmplY3Qoe1xuICAgICAgYm9va21hcmtJZDogei5zdHJpbmcoKSxcbiAgICAgIHRhcmdldFBhdGg6IHouYXJyYXkoei5zdHJpbmcoKSkubWluKDEpLm1heCgxMDApLFxuICAgICAgcmVhc29uOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgfSksXG4gICksXG59KTtcbiIsImltcG9ydCB0eXBlIHsgU3RvcmFnZVBvcnQgfSBmcm9tICcuLi8uLi9hcHBsaWNhdGlvbi9wb3J0cyc7XG5pbXBvcnQgeyBBcHBFcnJvciB9IGZyb20gJy4uLy4uL3NoYXJlZC9lcnJvcnMnO1xuaW1wb3J0IHtcbiAgSm9iU3RhdGVTY2hlbWEsXG4gIE1vZGVsU2V0dGluZ3NTY2hlbWEsXG4gIFBsYW5SZWNvcmRTY2hlbWEsXG4gIFNjYW5SZXN1bHRTY2hlbWEsXG4gIFNUT1JBR0VfS0VZUyxcbiAgU1RPUkFHRV9RVU9UQV9MSU1JVF9CWVRFUyxcbiAgVW5kb1NuYXBzaG90U2NoZW1hLFxuICB0eXBlIEpvYlN0YXRlLFxuICB0eXBlIE1vZGVsU2V0dGluZ3MsXG4gIHR5cGUgUGxhblJlY29yZCxcbiAgdHlwZSBTY2FuUmVzdWx0LFxuICB0eXBlIFVuZG9TbmFwc2hvdCxcbn0gZnJvbSAnLi4vLi4vc2hhcmVkL3NjaGVtYXMnO1xuXG5pbXBvcnQgdHlwZSB7IHogfSBmcm9tICd6b2QnO1xuXG4vKipcbiAqIGNocm9tZS5zdG9yYWdlLmxvY2FsIOmAgumFjeWunueOsOOAglxuICogLSDor7vlj5bml7bnu48gWm9kIOagoemqjO+8jOaNn+Wdj+aVsOaNrui/lOWbniBudWxsIOiAjOS4jeaYr+aKm+WHuu+8m1xuICogLSDlhpnlhaXliY3mo4Dmn6Xlt7LnlKjnqbrpl7TvvIzmjqXov5HphY3pop3ml7bmi5Lnu53lubbmj5DnpLrvvIjmnrbmnoTmlrnmoYjnrKwgMTAg6IqC77yJ44CCXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTdG9yYWdlUmVwb3NpdG9yeShhcmVhOiBjaHJvbWUuc3RvcmFnZS5TdG9yYWdlQXJlYSk6IFN0b3JhZ2VQb3J0IHtcbiAgLy8g5rOb5Z6L57qm5p2f5Yiw5YW35L2TIFNjaGVtYSDnsbvlnovvvIzop4Tpgb8gWm9kVHlwZTxPdXRwdXQsIElucHV0PiDlnKggLmRlZmF1bHQoKSDkuIrnmoTlj5jlnovpl67popjjgIJcbiAgYXN5bmMgZnVuY3Rpb24gcmVhZDxTIGV4dGVuZHMgei5ab2RUeXBlQW55PihrZXk6IHN0cmluZywgc2NoZW1hOiBTKTogUHJvbWlzZTx6LmluZmVyPFM+IHwgbnVsbD4ge1xuICAgIGNvbnN0IHJhdyA9IChhd2FpdCBhcmVhLmdldChrZXkpKVtrZXldO1xuICAgIGlmIChyYXcgPT09IHVuZGVmaW5lZCB8fCByYXcgPT09IG51bGwpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHBhcnNlZCA9IHNjaGVtYS5zYWZlUGFyc2UocmF3KTtcbiAgICByZXR1cm4gcGFyc2VkLnN1Y2Nlc3MgPyBwYXJzZWQuZGF0YSA6IG51bGw7XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiB3cml0ZShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCB1c2VkID0gYXdhaXQgYXJlYS5nZXRCeXRlc0luVXNlKG51bGwpO1xuICAgIGlmICh1c2VkID49IFNUT1JBR0VfUVVPVEFfTElNSVRfQllURVMpIHtcbiAgICAgIHRocm93IG5ldyBBcHBFcnJvcignc3RvcmFnZV9xdW90YScsICdlcnJvcnMuc3RvcmFnZVF1b3RhJyk7XG4gICAgfVxuICAgIGF3YWl0IGFyZWEuc2V0KHsgW2tleV06IHZhbHVlIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBsb2FkTW9kZWxTZXR0aW5nczogKCkgPT4gcmVhZChTVE9SQUdFX0tFWVMubW9kZWxTZXR0aW5ncywgTW9kZWxTZXR0aW5nc1NjaGVtYSksXG4gICAgc2F2ZU1vZGVsU2V0dGluZ3M6IChzZXR0aW5nczogTW9kZWxTZXR0aW5ncykgPT5cbiAgICAgIHdyaXRlKFNUT1JBR0VfS0VZUy5tb2RlbFNldHRpbmdzLCBNb2RlbFNldHRpbmdzU2NoZW1hLnBhcnNlKHNldHRpbmdzKSksXG5cbiAgICBsb2FkSm9iOiAoKSA9PiByZWFkKFNUT1JBR0VfS0VZUy5qb2IsIEpvYlN0YXRlU2NoZW1hKSxcbiAgICBzYXZlSm9iOiAoam9iOiBKb2JTdGF0ZSkgPT4gd3JpdGUoU1RPUkFHRV9LRVlTLmpvYiwgSm9iU3RhdGVTY2hlbWEucGFyc2Uoam9iKSksXG5cbiAgICBsb2FkU2NhbjogKCkgPT4gcmVhZChTVE9SQUdFX0tFWVMuc2NhbiwgU2NhblJlc3VsdFNjaGVtYSksXG4gICAgc2F2ZVNjYW46IChzY2FuOiBTY2FuUmVzdWx0KSA9PiB3cml0ZShTVE9SQUdFX0tFWVMuc2NhbiwgU2NhblJlc3VsdFNjaGVtYS5wYXJzZShzY2FuKSksXG5cbiAgICBsb2FkUGxhbjogKCkgPT4gcmVhZChTVE9SQUdFX0tFWVMucGxhbiwgUGxhblJlY29yZFNjaGVtYSksXG4gICAgc2F2ZVBsYW46IChwbGFuOiBQbGFuUmVjb3JkKSA9PiB3cml0ZShTVE9SQUdFX0tFWVMucGxhbiwgUGxhblJlY29yZFNjaGVtYS5wYXJzZShwbGFuKSksXG5cbiAgICBsb2FkVW5kbzogKCkgPT4gcmVhZChTVE9SQUdFX0tFWVMudW5kbywgVW5kb1NuYXBzaG90U2NoZW1hKSxcbiAgICBzYXZlVW5kbzogKHNuYXBzaG90OiBVbmRvU25hcHNob3QpID0+XG4gICAgICB3cml0ZShTVE9SQUdFX0tFWVMudW5kbywgVW5kb1NuYXBzaG90U2NoZW1hLnBhcnNlKHNuYXBzaG90KSksXG5cbiAgICBhc3luYyBjbGVhcihrZXlzKSB7XG4gICAgICBjb25zdCBzdG9yYWdlS2V5cyA9IGtleXMubWFwKChrKSA9PiBTVE9SQUdFX0tFWVNba10pO1xuICAgICAgYXdhaXQgYXJlYS5yZW1vdmUoc3RvcmFnZUtleXMpO1xuICAgIH0sXG4gIH07XG59XG5cbi8qKiDmianlsZXlkK/liqjml7bosIPnlKjvvJrpmZDliLYgc3RvcmFnZS5sb2NhbCDku4Xlj6/kv6HkuIrkuIvmloflj6/orr/pl67jgIIgKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBlbmZvcmNlVHJ1c3RlZENvbnRleHRzKCk6IFByb21pc2U8dm9pZD4ge1xuICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXRBY2Nlc3NMZXZlbCh7IGFjY2Vzc0xldmVsOiAnVFJVU1RFRF9DT05URVhUUycgfSk7XG59XG4iLCJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7XG4gIEpvYlN0YXRlU2NoZW1hLFxuICBTY2FuUmVzdWx0U2NoZW1hLFxuICBGYWlsdXJlSXRlbVNjaGVtYSxcbiAgSk9CX1NUQVRVU0VTLFxufSBmcm9tICcuL3NjaGVtYXMnO1xuXG4vKipcbiAqIERhc2hib2FyZCDkuI4gU2VydmljZSBXb3JrZXIg5LmL6Ze055qE57G75Z6L5YyW5Y2P6K6u44CCXG4gKiDmiYDmnInmtojmga/pg73lv4XpobvpgJrov4cgWm9kIOagoemqjO+8jOacquefpeWRveS7pOebtOaOpeaLkue7ne+8iOingeaetuaehOaWueahiOesrCAxMeOAgTEyIOiKgu+8ieOAglxuICovXG5cbi8vIC0tLS0tLS0tLS0g6K+35rGC77yIRGFzaGJvYXJkIOKGkiBTZXJ2aWNlIFdvcmtlcu+8iSAtLS0tLS0tLS0tXG5cbmV4cG9ydCBjb25zdCBHZXRTdGF0dXNSZXF1ZXN0U2NoZW1hID0gei5vYmplY3Qoe1xuICB0eXBlOiB6LmxpdGVyYWwoJ0dFVF9TVEFUVVMnKSxcbiAgcmVxdWVzdElkOiB6LnN0cmluZygpLFxufSk7XG5cbmV4cG9ydCBjb25zdCBTY2FuQm9va21hcmtzUmVxdWVzdFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgdHlwZTogei5saXRlcmFsKCdTQ0FOX0JPT0tNQVJLUycpLFxuICByZXF1ZXN0SWQ6IHouc3RyaW5nKCksXG4gIGpvYklkOiB6LnN0cmluZygpLFxufSk7XG5cbmV4cG9ydCBjb25zdCBBcHBseVBsYW5SZXF1ZXN0U2NoZW1hID0gei5vYmplY3Qoe1xuICB0eXBlOiB6LmxpdGVyYWwoJ0FQUExZX1BMQU4nKSxcbiAgcmVxdWVzdElkOiB6LnN0cmluZygpLFxuICBqb2JJZDogei5zdHJpbmcoKSxcbn0pO1xuXG5leHBvcnQgY29uc3QgUmV0cnlGYWlsZWRSZXF1ZXN0U2NoZW1hID0gei5vYmplY3Qoe1xuICB0eXBlOiB6LmxpdGVyYWwoJ1JFVFJZX0ZBSUxFRCcpLFxuICByZXF1ZXN0SWQ6IHouc3RyaW5nKCksXG4gIGpvYklkOiB6LnN0cmluZygpLFxufSk7XG5cbmV4cG9ydCBjb25zdCBVbmRvTGFzdEFwcGx5UmVxdWVzdFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgdHlwZTogei5saXRlcmFsKCdVTkRPX0xBU1RfQVBQTFknKSxcbiAgcmVxdWVzdElkOiB6LnN0cmluZygpLFxuICBqb2JJZDogei5zdHJpbmcoKSxcbn0pO1xuXG5leHBvcnQgY29uc3QgQ2FuY2VsSm9iUmVxdWVzdFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgdHlwZTogei5saXRlcmFsKCdDQU5DRUxfSk9CJyksXG4gIHJlcXVlc3RJZDogei5zdHJpbmcoKSxcbiAgam9iSWQ6IHouc3RyaW5nKCksXG59KTtcblxuZXhwb3J0IGNvbnN0IERlbGV0ZUR1cGxpY2F0ZUJvb2ttYXJrc1JlcXVlc3RTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR5cGU6IHoubGl0ZXJhbCgnREVMRVRFX0RVUExJQ0FURV9CT09LTUFSS1MnKSxcbiAgcmVxdWVzdElkOiB6LnN0cmluZygpLFxuICBib29rbWFya0lkczogei5hcnJheSh6LnN0cmluZygpKS5taW4oMSksXG59KTtcblxuZXhwb3J0IGNvbnN0IERlbGV0ZUVtcHR5Rm9sZGVyc1JlcXVlc3RTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR5cGU6IHoubGl0ZXJhbCgnREVMRVRFX0VNUFRZX0ZPTERFUlMnKSxcbiAgcmVxdWVzdElkOiB6LnN0cmluZygpLFxuICBmb2xkZXJJZHM6IHouYXJyYXkoei5zdHJpbmcoKSkubWluKDEpLFxufSk7XG5cbmV4cG9ydCBjb25zdCBSZXF1ZXN0U2NoZW1hID0gei5kaXNjcmltaW5hdGVkVW5pb24oJ3R5cGUnLCBbXG4gIEdldFN0YXR1c1JlcXVlc3RTY2hlbWEsXG4gIFNjYW5Cb29rbWFya3NSZXF1ZXN0U2NoZW1hLFxuICBBcHBseVBsYW5SZXF1ZXN0U2NoZW1hLFxuICBSZXRyeUZhaWxlZFJlcXVlc3RTY2hlbWEsXG4gIFVuZG9MYXN0QXBwbHlSZXF1ZXN0U2NoZW1hLFxuICBDYW5jZWxKb2JSZXF1ZXN0U2NoZW1hLFxuICBEZWxldGVEdXBsaWNhdGVCb29rbWFya3NSZXF1ZXN0U2NoZW1hLFxuICBEZWxldGVFbXB0eUZvbGRlcnNSZXF1ZXN0U2NoZW1hLFxuXSk7XG5leHBvcnQgdHlwZSBSZXF1ZXN0TWVzc2FnZSA9IHouaW5mZXI8dHlwZW9mIFJlcXVlc3RTY2hlbWE+O1xuXG4vLyAtLS0tLS0tLS0tIOWTjeW6lO+8iFNlcnZpY2UgV29ya2VyIOKGkiBEYXNoYm9hcmTvvIkgLS0tLS0tLS0tLVxuXG5leHBvcnQgY29uc3QgUmVzcG9uc2VTY2hlbWEgPSB6LnVuaW9uKFtcbiAgei5vYmplY3QoeyBvazogei5saXRlcmFsKHRydWUpLCByZXF1ZXN0SWQ6IHouc3RyaW5nKCksIHBheWxvYWQ6IHoudW5rbm93bigpIH0pLFxuICB6Lm9iamVjdCh7XG4gICAgb2s6IHoubGl0ZXJhbChmYWxzZSksXG4gICAgcmVxdWVzdElkOiB6LnN0cmluZygpLFxuICAgIGVycm9yOiBGYWlsdXJlSXRlbVNjaGVtYSxcbiAgfSksXG5dKTtcbmV4cG9ydCB0eXBlIFJlc3BvbnNlTWVzc2FnZSA9IHouaW5mZXI8dHlwZW9mIFJlc3BvbnNlU2NoZW1hPjtcblxuLy8gLS0tLS0tLS0tLSDkuovku7bvvIhTZXJ2aWNlIFdvcmtlciDihpIgRGFzaGJvYXJkIOW5v+aSre+8iSAtLS0tLS0tLS0tXG5cbmV4cG9ydCBjb25zdCBKb2JQcm9ncmVzc0V2ZW50U2NoZW1hID0gei5vYmplY3Qoe1xuICB0eXBlOiB6LmxpdGVyYWwoJ0pPQl9QUk9HUkVTUycpLFxuICBqb2JJZDogei5zdHJpbmcoKSxcbiAgc3RhdHVzOiB6LmVudW0oSk9CX1NUQVRVU0VTKSxcbiAgcHJvY2Vzc2VkOiB6Lm51bWJlcigpLFxuICB0b3RhbDogei5udW1iZXIoKSxcbn0pO1xuXG5leHBvcnQgY29uc3QgSm9iQ29tcGxldGVkRXZlbnRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR5cGU6IHoubGl0ZXJhbCgnSk9CX0NPTVBMRVRFRCcpLFxuICBqb2JJZDogei5zdHJpbmcoKSxcbiAgam9iOiBKb2JTdGF0ZVNjaGVtYSxcbn0pO1xuXG5leHBvcnQgY29uc3QgSm9iSW50ZXJydXB0ZWRFdmVudFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgdHlwZTogei5saXRlcmFsKCdKT0JfSU5URVJSVVBURUQnKSxcbiAgam9iSWQ6IHouc3RyaW5nKCksXG4gIGpvYjogSm9iU3RhdGVTY2hlbWEsXG59KTtcblxuZXhwb3J0IGNvbnN0IEpvYkZhaWxlZEV2ZW50U2NoZW1hID0gei5vYmplY3Qoe1xuICB0eXBlOiB6LmxpdGVyYWwoJ0pPQl9GQUlMRUQnKSxcbiAgam9iSWQ6IHouc3RyaW5nKCksXG4gIGpvYjogSm9iU3RhdGVTY2hlbWEsXG59KTtcblxuZXhwb3J0IGNvbnN0IEV2ZW50U2NoZW1hID0gei5kaXNjcmltaW5hdGVkVW5pb24oJ3R5cGUnLCBbXG4gIEpvYlByb2dyZXNzRXZlbnRTY2hlbWEsXG4gIEpvYkNvbXBsZXRlZEV2ZW50U2NoZW1hLFxuICBKb2JJbnRlcnJ1cHRlZEV2ZW50U2NoZW1hLFxuICBKb2JGYWlsZWRFdmVudFNjaGVtYSxcbl0pO1xuZXhwb3J0IHR5cGUgRXZlbnRNZXNzYWdlID0gei5pbmZlcjx0eXBlb2YgRXZlbnRTY2hlbWE+O1xuXG4vKipcbiAqIOagoemqjOWFpeermea2iOaBr++8m+mdnuazleaIluacquefpeexu+Wei+i/lOWbniBudWxs77yM55Sx6LCD55So5pa555u05o6l5ouS57ud44CCXG4gKiDov5nmmK/ovrnnlYzmoKHpqozvvIzmtojmga/mnaXoh6rlkIzkuIDmianlsZXlhoXnmoTpobXpnaLvvIzkvYbku43mjInmnrbmnoTmlrnmoYjopoHmsYLkuKXmoLzmoKHpqozjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlUmVxdWVzdChyYXc6IHVua25vd24pOiBSZXF1ZXN0TWVzc2FnZSB8IG51bGwge1xuICBjb25zdCByZXN1bHQgPSBSZXF1ZXN0U2NoZW1hLnNhZmVQYXJzZShyYXcpO1xuICByZXR1cm4gcmVzdWx0LnN1Y2Nlc3MgPyByZXN1bHQuZGF0YSA6IG51bGw7XG59XG5cbi8qKiBHRVRfU1RBVFVTIOeahOWTjeW6lOi9veiNt++8muS7u+WKoeOAgeaJq+aPj+WSjOaSpOmUgOWPr+eUqOaAp+OAgiAqL1xuZXhwb3J0IGludGVyZmFjZSBTdGF0dXNQYXlsb2FkIHtcbiAgam9iOiBKb2JTdGF0ZVNjaGVtYVR5cGU7XG4gIHNjYW46IFNjYW5SZXN1bHRTY2hlbWFUeXBlIHwgbnVsbDtcbiAgaGFzVW5kb1NuYXBzaG90OiBib29sZWFuO1xufVxudHlwZSBKb2JTdGF0ZVNjaGVtYVR5cGUgPSB6LmluZmVyPHR5cGVvZiBKb2JTdGF0ZVNjaGVtYT47XG50eXBlIFNjYW5SZXN1bHRTY2hlbWFUeXBlID0gei5pbmZlcjx0eXBlb2YgU2NhblJlc3VsdFNjaGVtYT47XG4iLCJpbXBvcnQgeyBkZWZpbmVCYWNrZ3JvdW5kIH0gZnJvbSAnd3h0L3V0aWxzL2RlZmluZS1iYWNrZ3JvdW5kJztcbmltcG9ydCB7IHNjYW5Cb29rbWFya3MgfSBmcm9tICdAL3NyYy9hcHBsaWNhdGlvbi9zY2FuQm9va21hcmtzJztcbmltcG9ydCB7IGFwcGx5UGxhbiB9IGZyb20gJ0Avc3JjL2FwcGxpY2F0aW9uL2FwcGx5UGxhbic7XG5pbXBvcnQgeyB1bmRvTGFzdEFwcGx5IH0gZnJvbSAnQC9zcmMvYXBwbGljYXRpb24vdW5kb0xhc3RBcHBseSc7XG5pbXBvcnQgeyByZXN1bWVKb2IgfSBmcm9tICdAL3NyYy9hcHBsaWNhdGlvbi9yZXN1bWVKb2InO1xuaW1wb3J0IHsgZGVsZXRlRHVwbGljYXRlQm9va21hcmtzIH0gZnJvbSAnQC9zcmMvYXBwbGljYXRpb24vZGVsZXRlRHVwbGljYXRlQm9va21hcmtzJztcbmltcG9ydCB7IGRlbGV0ZUVtcHR5Rm9sZGVycyB9IGZyb20gJ0Avc3JjL2FwcGxpY2F0aW9uL2RlbGV0ZUVtcHR5Rm9sZGVycyc7XG5pbXBvcnQgdHlwZSB7IEV2ZW50c1BvcnQsIFN0b3JhZ2VQb3J0IH0gZnJvbSAnQC9zcmMvYXBwbGljYXRpb24vcG9ydHMnO1xuaW1wb3J0IHsgY3JlYXRlQm9va21hcmtzUmVwb3NpdG9yeSB9IGZyb20gJ0Avc3JjL2luZnJhc3RydWN0dXJlL2Nocm9tZS9ib29rbWFya3NSZXBvc2l0b3J5JztcbmltcG9ydCB7XG4gIGNyZWF0ZVN0b3JhZ2VSZXBvc2l0b3J5LFxuICBlbmZvcmNlVHJ1c3RlZENvbnRleHRzLFxufSBmcm9tICdAL3NyYy9pbmZyYXN0cnVjdHVyZS9jaHJvbWUvc3RvcmFnZVJlcG9zaXRvcnknO1xuaW1wb3J0IHsgY2FuVHJhbnNpdGlvbiB9IGZyb20gJ0Avc3JjL2RvbWFpbi9vcmdhbml6ZS9zdGF0ZU1hY2hpbmUnO1xuaW1wb3J0IHsgY2xhc3NpZnlFcnJvciB9IGZyb20gJ0Avc3JjL3NoYXJlZC9lcnJvcnMnO1xuaW1wb3J0IHsgcGFyc2VSZXF1ZXN0LCB0eXBlIFJlcXVlc3RNZXNzYWdlIH0gZnJvbSAnQC9zcmMvc2hhcmVkL21lc3NhZ2VzJztcbmltcG9ydCB0eXBlIHsgSm9iU3RhdGUgfSBmcm9tICdAL3NyYy9zaGFyZWQvc2NoZW1hcyc7XG5cbmNvbnN0IERBU0hCT0FSRF9VUkwgPSBjaHJvbWUucnVudGltZS5nZXRVUkwoJy9kYXNoYm9hcmQuaHRtbCcpO1xuXG4vKipcbiAqIFNlcnZpY2UgV29ya2Vy77ya5omA5pyJ5Lmm562+5YaZ5pON5L2c55qE5ZSv5LiA5YWl5Y+j77yI5p625p6E5pa55qGI56ysIDMuMiDoioLvvInjgIJcbiAqIC0g54K55Ye75omp5bGV5Zu+5qCH5pe25omT5byA5oiW5aSN55SoIERhc2hib2FyZCDmoIfnrb7pobXvvJtcbiAqIC0g5raI5oGv6Lev55Sx77ya5omA5pyJ5YWl56uZ5raI5oGv57uPIFpvZCDmoKHpqozvvIzmnKrnn6Xlkb3ku6Tnm7TmjqXmi5Lnu53vvJtcbiAqIC0g6L+b5bqmL+e7k+aenOS6i+S7tiBmaXJlLWFuZC1mb3JnZXQg5bm/5pKt77yMRGFzaGJvYXJkIOS4jeWcqOe6v+aXtuW/veeVpeWPkemAgeWksei0peOAglxuICovXG5cbmZ1bmN0aW9uIGNyZWF0ZUV2ZW50c1BvcnQoKTogRXZlbnRzUG9ydCB7XG4gIGNvbnN0IGZpcmVBbmRGb3JnZXQgPSAobWVzc2FnZTogdW5rbm93bik6IHZvaWQgPT4ge1xuICAgIHZvaWQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UobWVzc2FnZSkuY2F0Y2goKCkgPT4ge1xuICAgICAgLy8g5rKh5pyJ5o6l5pS25pa577yIRGFzaGJvYXJkIOWFs+mXre+8ieaXtuW/veeVpeOAglxuICAgIH0pO1xuICB9O1xuICByZXR1cm4ge1xuICAgIHByb2dyZXNzOiAoam9iSWQsIHN0YXR1cywgcHJvY2Vzc2VkLCB0b3RhbCkgPT5cbiAgICAgIGZpcmVBbmRGb3JnZXQoeyB0eXBlOiAnSk9CX1BST0dSRVNTJywgam9iSWQsIHN0YXR1cywgcHJvY2Vzc2VkLCB0b3RhbCB9KSxcbiAgICBjb21wbGV0ZWQ6IChqb2IpID0+IGZpcmVBbmRGb3JnZXQoeyB0eXBlOiAnSk9CX0NPTVBMRVRFRCcsIGpvYklkOiBqb2Iuam9iSWQsIGpvYiB9KSxcbiAgICBpbnRlcnJ1cHRlZDogKGpvYikgPT4gZmlyZUFuZEZvcmdldCh7IHR5cGU6ICdKT0JfSU5URVJSVVBURUQnLCBqb2JJZDogam9iLmpvYklkLCBqb2IgfSksXG4gICAgZmFpbGVkOiAoam9iKSA9PiBmaXJlQW5kRm9yZ2V0KHsgdHlwZTogJ0pPQl9GQUlMRUQnLCBqb2JJZDogam9iLmpvYklkLCBqb2IgfSksXG4gIH07XG59XG5cbi8qKiDmiZPlvIDmiJblpI3nlKjllK/kuIDnmoTlhajpobUgRGFzaGJvYXJkIOagh+etvumhte+8iOaJqeWxleWvueiHquW3seeahCBvcmlnaW4g5pyJ6K6/6Zeu5p2D77yM5peg6ZyAIHRhYnMg5p2D6ZmQ77yJ44CCICovXG5hc3luYyBmdW5jdGlvbiBvcGVuRGFzaGJvYXJkKCk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoeyB1cmw6IGAke0RBU0hCT0FSRF9VUkx9KmAgfSk7XG4gIGNvbnN0IGV4aXN0aW5nID0gdGFic1swXTtcbiAgaWYgKGV4aXN0aW5nPy5pZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgYXdhaXQgY2hyb21lLnRhYnMudXBkYXRlKGV4aXN0aW5nLmlkLCB7IGFjdGl2ZTogdHJ1ZSB9KTtcbiAgICBpZiAoZXhpc3Rpbmcud2luZG93SWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgYXdhaXQgY2hyb21lLndpbmRvd3MudXBkYXRlKGV4aXN0aW5nLndpbmRvd0lkLCB7IGZvY3VzZWQ6IHRydWUgfSkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IGNocm9tZS50YWJzLmNyZWF0ZSh7IHVybDogREFTSEJPQVJEX1VSTCwgYWN0aXZlOiB0cnVlIH0pO1xufVxuXG4vKiog5omr5o+P6K+35rGC55qE5Lu75Yqh6Kej5p6Q77ya5Y+v5LuO5b2T5YmN54q25oCB57un57ut5pe25aSN55So77yM5ZCm5YiZ5o2i5paw5Lu75Yqh6YeN5paw5byA5aeL44CCICovXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlSm9iRm9yU2NhbihzdG9yYWdlOiBTdG9yYWdlUG9ydCwgam9iSWQ6IHN0cmluZyk6IFByb21pc2U8Sm9iU3RhdGU+IHtcbiAgY29uc3QgZXhpc3RpbmcgPSBhd2FpdCBzdG9yYWdlLmxvYWRKb2IoKTtcbiAgaWYgKGV4aXN0aW5nICYmIGV4aXN0aW5nLmpvYklkID09PSBqb2JJZCAmJiBjYW5UcmFuc2l0aW9uKGV4aXN0aW5nLnN0YXR1cywgJ3NjYW5uaW5nJykpIHtcbiAgICByZXR1cm4gZXhpc3Rpbmc7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBqb2JJZCxcbiAgICBzdGF0dXM6ICdpZGxlJyxcbiAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gICAgYXBwbHlDdXJzb3I6IDAsXG4gICAgYXBwbGllZElkczogW10sXG4gICAgY3JlYXRlZEZvbGRlcklkczogW10sXG4gICAgY2FuY2VsUmVxdWVzdGVkOiBmYWxzZSxcbiAgICBmYWlsdXJlczogW10sXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVNjYW4oc3RvcmFnZTogU3RvcmFnZVBvcnQsIGpvYklkOiBzdHJpbmcpOiBQcm9taXNlPHVua25vd24+IHtcbiAgY29uc3Qgam9iID0gYXdhaXQgcmVzb2x2ZUpvYkZvclNjYW4oc3RvcmFnZSwgam9iSWQpO1xuICBjb25zdCBzY2FuID0gYXdhaXQgc2NhbkJvb2ttYXJrcyhcbiAgICB7IGJvb2ttYXJrczogY3JlYXRlQm9va21hcmtzUmVwb3NpdG9yeSgpLCBzdG9yYWdlLCBldmVudHM6IGNyZWF0ZUV2ZW50c1BvcnQoKSB9LFxuICAgIGpvYixcbiAgKTtcbiAgY29uc3Qgc2F2ZWQgPSBhd2FpdCBzdG9yYWdlLmxvYWRKb2IoKTtcbiAgcmV0dXJuIHsgc2Nhbiwgam9iOiBzYXZlZCA/PyBqb2IgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlQXBwbHkoc3RvcmFnZTogU3RvcmFnZVBvcnQsIGpvYklkOiBzdHJpbmcpOiBQcm9taXNlPHVua25vd24+IHtcbiAgY29uc3Qgam9iID0gYXdhaXQgc3RvcmFnZS5sb2FkSm9iKCk7XG4gIGNvbnN0IHNjYW4gPSBhd2FpdCBzdG9yYWdlLmxvYWRTY2FuKCk7XG4gIGNvbnN0IHBsYW4gPSBhd2FpdCBzdG9yYWdlLmxvYWRQbGFuKCk7XG4gIGlmICgham9iIHx8IGpvYi5qb2JJZCAhPT0gam9iSWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ+S7u+WKoeS4jeWtmOWcqOaIluW3sui/h+acn++8jOivt+mHjeaWsOaJq+aPjycpO1xuICB9XG4gIGlmICghc2Nhbikge1xuICAgIHRocm93IG5ldyBFcnJvcign5rKh5pyJ5Y+v55So55qE5omr5o+P57uT5p6c77yM6K+35YWI5omr5o+PJyk7XG4gIH1cbiAgaWYgKCFwbGFuIHx8IHBsYW4uam9iSWQgIT09IGpvYi5qb2JJZCkge1xuICAgIHRocm93IG5ldyBFcnJvcign5rKh5pyJ5Y+v55So55qE5YiG57G75pa55qGI77yM6K+35YWI55Sf5oiQ5pa55qGIJyk7XG4gIH1cbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgYXBwbHlQbGFuKFxuICAgIHsgYm9va21hcmtzOiBjcmVhdGVCb29rbWFya3NSZXBvc2l0b3J5KCksIHN0b3JhZ2UsIGV2ZW50czogY3JlYXRlRXZlbnRzUG9ydCgpIH0sXG4gICAgam9iLFxuICAgIHNjYW4uYm9va21hcmtzLFxuICAgIHBsYW4uYXNzaWdubWVudHMsXG4gICAge1xuICAgICAgY3JlYXRlTWlzc2luZ0ZvbGRlcnM6IHBsYW4ubW9kZSAhPT0gJ2NvbnNlcnZhdGl2ZScsXG4gICAgICBjbGVhbnVwRm9sZGVySWRzOiBwbGFuLnNlbGVjdGVkRm9sZGVySWRzLFxuICAgIH0sXG4gICk7XG4gIHJldHVybiB7IGpvYjogcmVzdWx0LmpvYiB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVVbmRvKHN0b3JhZ2U6IFN0b3JhZ2VQb3J0LCBqb2JJZDogc3RyaW5nKTogUHJvbWlzZTx1bmtub3duPiB7XG4gIGNvbnN0IGpvYiA9IGF3YWl0IHN0b3JhZ2UubG9hZEpvYigpO1xuICBpZiAoIWpvYiB8fCBqb2Iuam9iSWQgIT09IGpvYklkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCfku7vliqHkuI3lrZjlnKjmiJblt7Lov4fmnJ8nKTtcbiAgfVxuICBjb25zdCByZXN1bHQgPSBhd2FpdCB1bmRvTGFzdEFwcGx5KFxuICAgIHsgYm9va21hcmtzOiBjcmVhdGVCb29rbWFya3NSZXBvc2l0b3J5KCksIHN0b3JhZ2UsIGV2ZW50czogY3JlYXRlRXZlbnRzUG9ydCgpIH0sXG4gICAgam9iLFxuICApO1xuICByZXR1cm4geyBqb2I6IHJlc3VsdC5qb2IsIGNvbmZsaWN0czogcmVzdWx0LmNvbmZsaWN0cyB9O1xufVxuXG4vKiog5qCH6K6w5Y+W5raI77ya5YaZ5YWl5oyB5LmF5YyW5qCH5b+X77yM5bqU55SoL+aSpOmUgOW+queOr+WcqOavj+S4quS5puetvuS5i+mXtOmHjeivu+ajgOafpeOAgiAqL1xuYXN5bmMgZnVuY3Rpb24gaGFuZGxlQ2FuY2VsKHN0b3JhZ2U6IFN0b3JhZ2VQb3J0LCBqb2JJZDogc3RyaW5nKTogUHJvbWlzZTx1bmtub3duPiB7XG4gIGNvbnN0IGpvYiA9IGF3YWl0IHN0b3JhZ2UubG9hZEpvYigpO1xuICBpZiAoIWpvYiB8fCBqb2Iuam9iSWQgIT09IGpvYklkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCfku7vliqHkuI3lrZjlnKjmiJblt7Lov4fmnJ8nKTtcbiAgfVxuICBjb25zdCBjYW5jZWxsZWQ6IEpvYlN0YXRlID0geyAuLi5qb2IsIGNhbmNlbFJlcXVlc3RlZDogdHJ1ZSwgdXBkYXRlZEF0OiBEYXRlLm5vdygpIH07XG4gIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYihjYW5jZWxsZWQpO1xuICByZXR1cm4geyBqb2I6IGNhbmNlbGxlZCB9O1xufVxuXG4vKiog5aSx6LSl5pe25oqK5Lu75Yqh6JC95Li6IGZhaWxlZCDnirbmgIHlubblub/mkq3vvIzkv53or4EgRGFzaGJvYXJkIOmHjeW8gOWQjuWPr+aBouWkjeOAgiAqL1xuYXN5bmMgZnVuY3Rpb24gbWFya0ZhaWxlZChzdG9yYWdlOiBTdG9yYWdlUG9ydCwgam9iSWQ6IHN0cmluZyB8IG51bGwsIGVycm9yOiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG4gIGlmICgham9iSWQpIHJldHVybjtcbiAgY29uc3Qgam9iID0gYXdhaXQgc3RvcmFnZS5sb2FkSm9iKCk7XG4gIGlmICgham9iIHx8IGpvYi5qb2JJZCAhPT0gam9iSWQpIHJldHVybjtcbiAgY29uc3QgY2xhc3NpZmllZCA9IGNsYXNzaWZ5RXJyb3IoZXJyb3IpO1xuICBjb25zdCBmYWlsZWQ6IEpvYlN0YXRlID0ge1xuICAgIC4uLmpvYixcbiAgICBzdGF0dXM6ICdmYWlsZWQnLFxuICAgIGVycm9yOiB7IGtpbmQ6IGNsYXNzaWZpZWQua2luZCwgbWVzc2FnZTogY2xhc3NpZmllZC5tZXNzYWdlIH0sXG4gICAgdXBkYXRlZEF0OiBEYXRlLm5vdygpLFxuICB9O1xuICB0cnkge1xuICAgIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYihmYWlsZWQpO1xuICAgIGNyZWF0ZUV2ZW50c1BvcnQoKS5mYWlsZWQoZmFpbGVkKTtcbiAgfSBjYXRjaCB7XG4gICAgLy8g54q25oCB6JC955uY5aSx6LSl5pe25Y+q6IO95pS+5byD77yM6YG/5YWN6ZSZ6K+v5b6q546v44CCXG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQmFja2dyb3VuZCgoKSA9PiB7XG4gIHZvaWQgZW5mb3JjZVRydXN0ZWRDb250ZXh0cygpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cbiAgY2hyb21lLmFjdGlvbi5vbkNsaWNrZWQuYWRkTGlzdGVuZXIoKCkgPT4ge1xuICAgIHZvaWQgb3BlbkRhc2hib2FyZCgpO1xuICB9KTtcblxuICBjaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKHJhdzogdW5rbm93biwgX3NlbmRlciwgc2VuZFJlc3BvbnNlKSA9PiB7XG4gICAgY29uc3QgcmVxdWVzdDogUmVxdWVzdE1lc3NhZ2UgfCBudWxsID0gcGFyc2VSZXF1ZXN0KHJhdyk7XG4gICAgaWYgKCFyZXF1ZXN0KSB7XG4gICAgICBzZW5kUmVzcG9uc2Uoe1xuICAgICAgICBvazogZmFsc2UsXG4gICAgICAgIHJlcXVlc3RJZDogdHlwZW9mIChyYXcgYXMgeyByZXF1ZXN0SWQ/OiB1bmtub3duIH0pPy5yZXF1ZXN0SWQgPT09ICdzdHJpbmcnXG4gICAgICAgICAgPyAocmF3IGFzIHsgcmVxdWVzdElkOiBzdHJpbmcgfSkucmVxdWVzdElkXG4gICAgICAgICAgOiAnJyxcbiAgICAgICAgZXJyb3I6IHsga2luZDogJ3ZhbGlkYXRpb24nLCBtZXNzYWdlOiAn5pyq55+l5oiW6Z2e5rOV55qE5ZG95LukJyB9LFxuICAgICAgfSk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3Qgc3RvcmFnZSA9IGNyZWF0ZVN0b3JhZ2VSZXBvc2l0b3J5KGNocm9tZS5zdG9yYWdlLmxvY2FsKTtcbiAgICBjb25zdCByZXF1ZXN0SWQgPSByZXF1ZXN0LnJlcXVlc3RJZDtcbiAgICBjb25zdCBqb2JJZCA9ICdqb2JJZCcgaW4gcmVxdWVzdCA/IHJlcXVlc3Quam9iSWQgOiBudWxsO1xuXG4gICAgdm9pZCAoYXN5bmMgKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgbGV0IHBheWxvYWQ6IHVua25vd247XG4gICAgICAgIHN3aXRjaCAocmVxdWVzdC50eXBlKSB7XG4gICAgICAgICAgY2FzZSAnR0VUX1NUQVRVUyc6XG4gICAgICAgICAgICBwYXlsb2FkID0gYXdhaXQgcmVzdW1lSm9iKHsgc3RvcmFnZSB9KTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ1NDQU5fQk9PS01BUktTJzpcbiAgICAgICAgICAgIHBheWxvYWQgPSBhd2FpdCBoYW5kbGVTY2FuKHN0b3JhZ2UsIHJlcXVlc3Quam9iSWQpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnQVBQTFlfUExBTic6XG4gICAgICAgICAgY2FzZSAnUkVUUllfRkFJTEVEJzpcbiAgICAgICAgICAgIHBheWxvYWQgPSBhd2FpdCBoYW5kbGVBcHBseShzdG9yYWdlLCByZXF1ZXN0LmpvYklkKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ1VORE9fTEFTVF9BUFBMWSc6XG4gICAgICAgICAgICBwYXlsb2FkID0gYXdhaXQgaGFuZGxlVW5kbyhzdG9yYWdlLCByZXF1ZXN0LmpvYklkKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ0NBTkNFTF9KT0InOlxuICAgICAgICAgICAgcGF5bG9hZCA9IGF3YWl0IGhhbmRsZUNhbmNlbChzdG9yYWdlLCByZXF1ZXN0LmpvYklkKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ0RFTEVURV9EVVBMSUNBVEVfQk9PS01BUktTJzpcbiAgICAgICAgICAgIHBheWxvYWQgPSBhd2FpdCBkZWxldGVEdXBsaWNhdGVCb29rbWFya3MoXG4gICAgICAgICAgICAgIHsgYm9va21hcmtzOiBjcmVhdGVCb29rbWFya3NSZXBvc2l0b3J5KCksIHN0b3JhZ2UgfSxcbiAgICAgICAgICAgICAgcmVxdWVzdC5ib29rbWFya0lkcyxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdERUxFVEVfRU1QVFlfRk9MREVSUyc6XG4gICAgICAgICAgICBwYXlsb2FkID0gYXdhaXQgZGVsZXRlRW1wdHlGb2xkZXJzKFxuICAgICAgICAgICAgICB7IGJvb2ttYXJrczogY3JlYXRlQm9va21hcmtzUmVwb3NpdG9yeSgpLCBzdG9yYWdlIH0sXG4gICAgICAgICAgICAgIHJlcXVlc3QuZm9sZGVySWRzLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiB0cnVlLCByZXF1ZXN0SWQsIHBheWxvYWQgfSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBhd2FpdCBtYXJrRmFpbGVkKHN0b3JhZ2UsIGpvYklkLCBlcnJvcik7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IG9rOiBmYWxzZSwgcmVxdWVzdElkLCBlcnJvcjogY2xhc3NpZnlFcnJvcihlcnJvcikgfSk7XG4gICAgICB9XG4gICAgfSkoKTtcblxuICAgIC8vIOW8guatpeWTjeW6lO+8muS/neaMgea2iOaBr+mAmumBk+W8gOaUvuOAglxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcbn0pO1xuIiwiLy8gI3JlZ2lvbiBzbmlwcGV0XG5leHBvcnQgY29uc3QgYnJvd3NlciA9IGdsb2JhbFRoaXMuYnJvd3Nlcj8ucnVudGltZT8uaWRcbiAgPyBnbG9iYWxUaGlzLmJyb3dzZXJcbiAgOiBnbG9iYWxUaGlzLmNocm9tZTtcbi8vICNlbmRyZWdpb24gc25pcHBldFxuIiwiaW1wb3J0IHsgYnJvd3NlciBhcyBicm93c2VyJDEgfSBmcm9tIFwiQHd4dC1kZXYvYnJvd3NlclwiO1xuLy8jcmVnaW9uIHNyYy9icm93c2VyLnRzXG4vKipcbiogQ29udGFpbnMgdGhlIGBicm93c2VyYCBleHBvcnQgd2hpY2ggeW91IHNob3VsZCB1c2UgdG8gYWNjZXNzIHRoZSBleHRlbnNpb25cbiogQVBJcyBpbiB5b3VyIHByb2plY3Q6XG4qXG4qIGBgYHRzXG4qIGltcG9ydCB7IGJyb3dzZXIgfSBmcm9tICd3eHQvYnJvd3Nlcic7XG4qXG4qIGJyb3dzZXIucnVudGltZS5vbkluc3RhbGxlZC5hZGRMaXN0ZW5lcigoKSA9PiB7XG4qICAgLy8gLi4uXG4qIH0pO1xuKiBgYGBcbipcbiogQG1vZHVsZSB3eHQvYnJvd3NlclxuKi9cbmNvbnN0IGJyb3dzZXIgPSBicm93c2VyJDE7XG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGJyb3dzZXIgfTtcbiIsIi8vI3JlZ2lvbiBzcmMvaW5kZXgudHNcbi8qKlxuKiBDbGFzcyBmb3IgcGFyc2luZyBhbmQgcGVyZm9ybWluZyBvcGVyYXRpb25zIG9uIG1hdGNoIHBhdHRlcm5zLlxuKlxuKiBAZXhhbXBsZVxuKiAgIGNvbnN0IHBhdHRlcm4gPSBuZXcgTWF0Y2hQYXR0ZXJuKCcqOi8vZ29vZ2xlLmNvbS8qJyk7XG4qXG4qICAgcGF0dGVybi5pbmNsdWRlcygnaHR0cHM6Ly9nb29nbGUuY29tJyk7IC8vIHRydWVcbiogICBwYXR0ZXJuLmluY2x1ZGVzKCdodHRwOi8veW91dHViZS5jb20vd2F0Y2g/dj0xMjMnKTsgLy8gZmFsc2VcbiovXG52YXIgTWF0Y2hQYXR0ZXJuID0gY2xhc3MgTWF0Y2hQYXR0ZXJuIHtcblx0c3RhdGljIHtcblx0XHR0aGlzLlBST1RPQ09MUyA9IFtcblx0XHRcdFwiaHR0cFwiLFxuXHRcdFx0XCJodHRwc1wiLFxuXHRcdFx0XCJmaWxlXCIsXG5cdFx0XHRcImZ0cFwiLFxuXHRcdFx0XCJ1cm5cIixcblx0XHRcdFwid3NcIixcblx0XHRcdFwid3NzXCJcblx0XHRdO1xuXHR9XG5cdC8qKlxuXHQqIFBhcnNlIGEgbWF0Y2ggcGF0dGVybiBzdHJpbmcuIElmIGl0IGlzIGludmFsaWQsIHRoZSBjb25zdHJ1Y3RvciB3aWxsIHRocm93IGFuXG5cdCogYEludmFsaWRNYXRjaFBhdHRlcm5gIGVycm9yLlxuXHQqXG5cdCogQHBhcmFtIG1hdGNoUGF0dGVybiBUaGUgbWF0Y2ggcGF0dGVybiB0byBwYXJzZS5cblx0Ki9cblx0Y29uc3RydWN0b3IobWF0Y2hQYXR0ZXJuKSB7XG5cdFx0aWYgKG1hdGNoUGF0dGVybiA9PT0gXCI8YWxsX3VybHM+XCIpIHtcblx0XHRcdHRoaXMuaXNBbGxVcmxzID0gdHJ1ZTtcblx0XHRcdHRoaXMucHJvdG9jb2xNYXRjaGVzID0gWy4uLk1hdGNoUGF0dGVybi5QUk9UT0NPTFNdO1xuXHRcdFx0dGhpcy5ob3N0bmFtZU1hdGNoID0gXCIqXCI7XG5cdFx0XHR0aGlzLnBhdGhuYW1lTWF0Y2ggPSBcIipcIjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZ3JvdXBzID0gLyguKik6XFwvXFwvKC4qPykoXFwvLiopLy5leGVjKG1hdGNoUGF0dGVybik7XG5cdFx0XHRpZiAoZ3JvdXBzID09IG51bGwpIHRocm93IG5ldyBJbnZhbGlkTWF0Y2hQYXR0ZXJuKG1hdGNoUGF0dGVybiwgXCJJbmNvcnJlY3QgZm9ybWF0XCIpO1xuXHRcdFx0Y29uc3QgW18sIHByb3RvY29sLCBob3N0bmFtZSwgcGF0aG5hbWVdID0gZ3JvdXBzO1xuXHRcdFx0dmFsaWRhdGVQcm90b2NvbChtYXRjaFBhdHRlcm4sIHByb3RvY29sKTtcblx0XHRcdHZhbGlkYXRlSG9zdG5hbWUobWF0Y2hQYXR0ZXJuLCBob3N0bmFtZSk7XG5cdFx0XHR0aGlzLnByb3RvY29sTWF0Y2hlcyA9IHByb3RvY29sID09PSBcIipcIiA/IFtcImh0dHBcIiwgXCJodHRwc1wiXSA6IFtwcm90b2NvbF07XG5cdFx0XHR0aGlzLmhvc3RuYW1lTWF0Y2ggPSBob3N0bmFtZTtcblx0XHRcdHRoaXMucGF0aG5hbWVNYXRjaCA9IHBhdGhuYW1lO1xuXHRcdH1cblx0fVxuXHQvKiogQ2hlY2sgaWYgYSBVUkwgaXMgaW5jbHVkZWQgaW4gYSBwYXR0ZXJuLiAqL1xuXHRpbmNsdWRlcyh1cmwpIHtcblx0XHRjb25zdCB1ID0gdHlwZW9mIHVybCA9PT0gXCJzdHJpbmdcIiA/IG5ldyBVUkwodXJsKSA6IHVybCBpbnN0YW5jZW9mIExvY2F0aW9uID8gbmV3IFVSTCh1cmwuaHJlZikgOiB1cmw7XG5cdFx0aWYgKHRoaXMuaXNBbGxVcmxzKSByZXR1cm4gIXRoaXMuaXNVbmtub3duUHJvdG9jb2wodSk7XG5cdFx0cmV0dXJuICEhdGhpcy5wcm90b2NvbE1hdGNoZXMuZmluZCgocHJvdG9jb2wpID0+IHtcblx0XHRcdGlmIChwcm90b2NvbCA9PT0gXCJodHRwXCIpIHJldHVybiB0aGlzLmlzSHR0cE1hdGNoKHUpO1xuXHRcdFx0aWYgKHByb3RvY29sID09PSBcImh0dHBzXCIpIHJldHVybiB0aGlzLmlzSHR0cHNNYXRjaCh1KTtcblx0XHRcdGlmIChwcm90b2NvbCA9PT0gXCJmaWxlXCIpIHJldHVybiB0aGlzLmlzRmlsZU1hdGNoKHUpO1xuXHRcdFx0aWYgKHByb3RvY29sID09PSBcImZ0cFwiKSByZXR1cm4gdGhpcy5pc0Z0cE1hdGNoKHUpO1xuXHRcdFx0aWYgKHByb3RvY29sID09PSBcInVyblwiKSByZXR1cm4gdGhpcy5pc1Vybk1hdGNoKHUpO1xuXHRcdH0pO1xuXHR9XG5cdGlzSHR0cE1hdGNoKHVybCkge1xuXHRcdHJldHVybiB1cmwucHJvdG9jb2wgPT09IFwiaHR0cDpcIiAmJiB0aGlzLmlzSG9zdFBhdGhNYXRjaCh1cmwpO1xuXHR9XG5cdGlzSHR0cHNNYXRjaCh1cmwpIHtcblx0XHRyZXR1cm4gdXJsLnByb3RvY29sID09PSBcImh0dHBzOlwiICYmIHRoaXMuaXNIb3N0UGF0aE1hdGNoKHVybCk7XG5cdH1cblx0aXNIb3N0UGF0aE1hdGNoKHVybCkge1xuXHRcdGlmICghdGhpcy5ob3N0bmFtZU1hdGNoIHx8ICF0aGlzLnBhdGhuYW1lTWF0Y2gpIHJldHVybiBmYWxzZTtcblx0XHRjb25zdCBob3N0bmFtZU1hdGNoUmVnZXhzID0gW3RoaXMuY29udmVydFBhdHRlcm5Ub1JlZ2V4KHRoaXMuaG9zdG5hbWVNYXRjaCksIHRoaXMuY29udmVydFBhdHRlcm5Ub1JlZ2V4KHRoaXMuaG9zdG5hbWVNYXRjaC5yZXBsYWNlKC9eXFwqXFwuLywgXCJcIikpXTtcblx0XHRjb25zdCBwYXRobmFtZU1hdGNoUmVnZXggPSB0aGlzLmNvbnZlcnRQYXR0ZXJuVG9SZWdleCh0aGlzLnBhdGhuYW1lTWF0Y2gpO1xuXHRcdHJldHVybiAhIWhvc3RuYW1lTWF0Y2hSZWdleHMuZmluZCgocmVnZXgpID0+IHJlZ2V4LnRlc3QodXJsLmhvc3RuYW1lKSkgJiYgcGF0aG5hbWVNYXRjaFJlZ2V4LnRlc3QodXJsLnBhdGhuYW1lKTtcblx0fVxuXHRpc1Vua25vd25Qcm90b2NvbCh1cmwpIHtcblx0XHRyZXR1cm4gIXRoaXMucHJvdG9jb2xNYXRjaGVzLmluY2x1ZGVzKHVybC5wcm90b2NvbC5zbGljZSgwLCAtMSkpO1xuXHR9XG5cdGlzUGF0aE1hdGNoKHVybCkge1xuXHRcdGlmICghdGhpcy5wYXRobmFtZU1hdGNoKSByZXR1cm4gZmFsc2U7XG5cdFx0cmV0dXJuIHRoaXMuY29udmVydFBhdHRlcm5Ub1JlZ2V4KHRoaXMucGF0aG5hbWVNYXRjaCkudGVzdCh1cmwucGF0aG5hbWUpO1xuXHR9XG5cdGlzRmlsZU1hdGNoKHVybCkge1xuXHRcdHJldHVybiB1cmwucHJvdG9jb2wgPT09IFwiZmlsZTpcIiAmJiB0aGlzLmlzUGF0aE1hdGNoKHVybCk7XG5cdH1cblx0aXNGdHBNYXRjaChfdXJsKSB7XG5cdFx0dGhyb3cgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWQ6IGZ0cDovLyBwYXR0ZXJuIG1hdGNoaW5nLiBPcGVuIGEgUFIgdG8gYWRkIHN1cHBvcnRcIik7XG5cdH1cblx0aXNVcm5NYXRjaChfdXJsKSB7XG5cdFx0dGhyb3cgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWQ6IHVybjovLyBwYXR0ZXJuIG1hdGNoaW5nLiBPcGVuIGEgUFIgdG8gYWRkIHN1cHBvcnRcIik7XG5cdH1cblx0Y29udmVydFBhdHRlcm5Ub1JlZ2V4KHBhdHRlcm4pIHtcblx0XHRjb25zdCBzdGFyc1JlcGxhY2VkID0gdGhpcy5lc2NhcGVGb3JSZWdleChwYXR0ZXJuKS5yZXBsYWNlKC9cXFxcXFwqL2csIFwiLipcIik7XG5cdFx0cmV0dXJuIFJlZ0V4cChgXiR7c3RhcnNSZXBsYWNlZH0kYCk7XG5cdH1cblx0ZXNjYXBlRm9yUmVnZXgoc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHN0cmluZy5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgXCJcXFxcJCZcIik7XG5cdH1cbn07XG52YXIgSW52YWxpZE1hdGNoUGF0dGVybiA9IGNsYXNzIGV4dGVuZHMgRXJyb3Ige1xuXHRjb25zdHJ1Y3RvcihtYXRjaFBhdHRlcm4sIHJlYXNvbikge1xuXHRcdHN1cGVyKGBJbnZhbGlkIG1hdGNoIHBhdHRlcm4gXCIke21hdGNoUGF0dGVybn1cIjogJHtyZWFzb259YCk7XG5cdH1cbn07XG5mdW5jdGlvbiB2YWxpZGF0ZVByb3RvY29sKG1hdGNoUGF0dGVybiwgcHJvdG9jb2wpIHtcblx0aWYgKCFNYXRjaFBhdHRlcm4uUFJPVE9DT0xTLmluY2x1ZGVzKHByb3RvY29sKSAmJiBwcm90b2NvbCAhPT0gXCIqXCIpIHRocm93IG5ldyBJbnZhbGlkTWF0Y2hQYXR0ZXJuKG1hdGNoUGF0dGVybiwgYCR7cHJvdG9jb2x9IG5vdCBhIHZhbGlkIHByb3RvY29sICgke01hdGNoUGF0dGVybi5QUk9UT0NPTFMuam9pbihcIiwgXCIpfSlgKTtcbn1cbmZ1bmN0aW9uIHZhbGlkYXRlSG9zdG5hbWUobWF0Y2hQYXR0ZXJuLCBob3N0bmFtZSkge1xuXHRpZiAoaG9zdG5hbWUuaW5jbHVkZXMoXCI6XCIpKSB0aHJvdyBuZXcgSW52YWxpZE1hdGNoUGF0dGVybihtYXRjaFBhdHRlcm4sIGBIb3N0bmFtZSBjYW5ub3QgaW5jbHVkZSBhIHBvcnRgKTtcblx0aWYgKGhvc3RuYW1lLmluY2x1ZGVzKFwiKlwiKSAmJiBob3N0bmFtZS5sZW5ndGggPiAxICYmICFob3N0bmFtZS5zdGFydHNXaXRoKFwiKi5cIikpIHRocm93IG5ldyBJbnZhbGlkTWF0Y2hQYXR0ZXJuKG1hdGNoUGF0dGVybiwgYElmIHVzaW5nIGEgd2lsZGNhcmQgKCopLCBpdCBtdXN0IGdvIGF0IHRoZSBzdGFydCBvZiB0aGUgaG9zdG5hbWVgKTtcbn1cbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgSW52YWxpZE1hdGNoUGF0dGVybiwgTWF0Y2hQYXR0ZXJuIH07XG4iXSwieF9nb29nbGVfaWdub3JlTGlzdCI6WzAsMTgsMTksMjAsMjEsMjIsMjMsMjQsMjksMzAsMzFdLCJtYXBwaW5ncyI6Ijs7Q0FDQSxTQUFTLGlCQUFpQixLQUFLO0VBQzlCLElBQUksT0FBTyxRQUFRLE9BQU8sUUFBUSxZQUFZLE9BQU8sRUFBRSxNQUFNLElBQUk7RUFDakUsT0FBTztDQUNSOzs7Q0NhQSxTQUFnQixTQUFTLE1BQTZCO0VBQ3BELE9BQU8sS0FBSyxRQUFRLEtBQUE7Q0FDdEI7Q0FFQSxTQUFnQixlQUFlLE1BQTZCO0VBQzFELE9BQU8sS0FBSyxpQkFBaUIsS0FBQSxLQUFhLEtBQUssaUJBQWlCO0NBQ2xFOzs7Ozs7OztDQ2RBLFNBQWdCLGNBQWMsTUFBc0M7RUFDbEUsSUFBSSxLQUFLLFdBQVcsS0FB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R0FBRyxTQUFTLE1BQU07RUFDN0Q7RUFDQSxJQUFJLFNBQVM7R0FDVCxPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLE1BQU07RUFDN0Q7RUFDQSxJQUFJLGFBQWE7R0FDYixPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLFVBQVU7RUFDakU7RUFDQSxJQUFJLFVBQVU7R0FDVixPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLE9BQU87RUFDOUQ7RUFDQSxJQUFJLFFBQVE7R0FDUixPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLEtBQUs7RUFDNUQ7RUFDQSxJQUFJLFVBQVU7R0FDVixPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLE9BQU87RUFDOUQ7RUFDQSxJQUFJLFNBQVM7R0FDVCxPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLE1BQU07RUFDN0Q7RUFDQSxJQUFJLFdBQVc7R0FDWCxPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLFFBQVE7RUFDL0Q7RUFDQSxJQUFJLFNBQVM7R0FDVCxPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLE1BQU07RUFDN0Q7RUFDQSxJQUFJLFVBQVU7R0FDVixPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLE9BQU87RUFDOUQ7RUFDQSxJQUFJLFNBQVM7R0FDVCxPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFTLE1BQU07RUFDN0Q7RUFDQSxJQUFJLE9BQU87R0FDUCxPQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxNQUFNLE9BQU8sR0FBRyxTQUFT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