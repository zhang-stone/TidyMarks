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

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2dyb3VuZC5qcyIsIm5hbWVzIjpbImRlZmF1bHRFcnJvck1hcCIsImRlZmF1bHRFcnJvck1hcCIsInJlZ2V4IiwiZGVmYXVsdEVycm9yTWFwIiwiYnJvd3NlciJdLCJzb3VyY2VzIjpbIi4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9kZWZpbmUtYmFja2dyb3VuZC5tanMiLCIuLi8uLi9zcmMvZG9tYWluL2Jvb2ttYXJrcy90eXBlcy50cyIsIi4uLy4uL3NyYy9kb21haW4vYm9va21hcmtzL3RyZWUudHMiLCIuLi8uLi9zcmMvc2hhcmVkL2kxOG4vemgtQ04udHMiLCIuLi8uLi9zcmMvc2hhcmVkL2kxOG4vZW4udHMiLCIuLi8uLi9zcmMvc2hhcmVkL2kxOG4vaW5kZXgudHMiLCIuLi8uLi9zcmMvZG9tYWluL29yZ2FuaXplL3N0YXRlTWFjaGluZS50cyIsIi4uLy4uL3NyYy9hcHBsaWNhdGlvbi9zY2FuQm9va21hcmtzLnRzIiwiLi4vLi4vc3JjL3NoYXJlZC9lcnJvcnMudHMiLCIuLi8uLi9zcmMvYXBwbGljYXRpb24vYXBwbHlQbGFuLnRzIiwiLi4vLi4vc3JjL2RvbWFpbi91bmRvL3NuYXBzaG90LnRzIiwiLi4vLi4vc3JjL2FwcGxpY2F0aW9uL3VuZG9MYXN0QXBwbHkudHMiLCIuLi8uLi9zcmMvYXBwbGljYXRpb24vcmVzdW1lSm9iLnRzIiwiLi4vLi4vc3JjL2RvbWFpbi9ib29rbWFya3MvZHVwbGljYXRlcy50cyIsIi4uLy4uL3NyYy9hcHBsaWNhdGlvbi9kZWxldGVEdXBsaWNhdGVCb29rbWFya3MudHMiLCIuLi8uLi9zcmMvZG9tYWluL2Jvb2ttYXJrcy9lbXB0eUZvbGRlcnMudHMiLCIuLi8uLi9zcmMvYXBwbGljYXRpb24vZGVsZXRlRW1wdHlGb2xkZXJzLnRzIiwiLi4vLi4vc3JjL2luZnJhc3RydWN0dXJlL2Nocm9tZS9ib29rbWFya3NSZXBvc2l0b3J5LnRzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3pvZC92My9oZWxwZXJzL3V0aWwuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvem9kL3YzL1pvZEVycm9yLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3pvZC92My9sb2NhbGVzL2VuLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3pvZC92My9lcnJvcnMuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvem9kL3YzL2hlbHBlcnMvcGFyc2VVdGlsLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3pvZC92My9oZWxwZXJzL2Vycm9yVXRpbC5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy96b2QvdjMvdHlwZXMuanMiLCIuLi8uLi9zcmMvc2hhcmVkL3NjaGVtYXMudHMiLCIuLi8uLi9zcmMvaW5mcmFzdHJ1Y3R1cmUvY2hyb21lL3N0b3JhZ2VSZXBvc2l0b3J5LnRzIiwiLi4vLi4vc3JjL3NoYXJlZC9tZXNzYWdlcy50cyIsIi4uLy4uL2VudHJ5cG9pbnRzL2JhY2tncm91bmQudHMiLCIuLi8uLi9ub2RlX21vZHVsZXMvQHd4dC1kZXYvYnJvd3Nlci9zcmMvaW5kZXgubWpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIubWpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL0B3ZWJleHQtY29yZS9tYXRjaC1wYXR0ZXJucy9saWIvaW5kZXgubWpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vI3JlZ2lvbiBzcmMvdXRpbHMvZGVmaW5lLWJhY2tncm91bmQudHNcbmZ1bmN0aW9uIGRlZmluZUJhY2tncm91bmQoYXJnKSB7XG5cdGlmIChhcmcgPT0gbnVsbCB8fCB0eXBlb2YgYXJnID09PSBcImZ1bmN0aW9uXCIpIHJldHVybiB7IG1haW46IGFyZyB9O1xuXHRyZXR1cm4gYXJnO1xufVxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBkZWZpbmVCYWNrZ3JvdW5kIH07XG4iLCIvKipcbiAqIENocm9tZSDkuabnrb7moJHnmoTnuq/mlbDmja7ooajnpLrvvIzkuI4gY2hyb21lLmJvb2ttYXJrcy5Cb29rbWFya1RyZWVOb2RlIOe7k+aehOWFvOWuue+8jFxuICog5L2G5LiN5Y+N5ZCR5L6d6LWW5rWP6KeI5ZmoIEFQSe+8iOaetuaehOaWueahiOesrCA0IOiKguS+nei1luaWueWQkee6puadn++8ieOAglxuICovXG5leHBvcnQgaW50ZXJmYWNlIEJvb2ttYXJrTm9kZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHBhcmVudElkPzogc3RyaW5nO1xuICBpbmRleD86IG51bWJlcjtcbiAgdGl0bGU6IHN0cmluZztcbiAgLyoqIOWtmOWcqCB1cmwg6KGo56S65Lmm562+6IqC54K577yM5ZCm5YiZ5piv55uu5b2V6IqC54K544CCICovXG4gIHVybD86IHN0cmluZztcbiAgZGF0ZUFkZGVkPzogbnVtYmVyO1xuICB1bm1vZGlmaWFibGU/OiBib29sZWFuIHwgc3RyaW5nO1xuICBmb2xkZXJUeXBlPzogc3RyaW5nO1xuICBjaGlsZHJlbj86IEJvb2ttYXJrTm9kZVtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNGb2xkZXIobm9kZTogQm9va21hcmtOb2RlKTogYm9vbGVhbiB7XG4gIHJldHVybiBub2RlLnVybCA9PT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNVbm1vZGlmaWFibGUobm9kZTogQm9va21hcmtOb2RlKTogYm9vbGVhbiB7XG4gIHJldHVybiBub2RlLnVubW9kaWZpYWJsZSAhPT0gdW5kZWZpbmVkICYmIG5vZGUudW5tb2RpZmlhYmxlICE9PSBmYWxzZTtcbn1cbiIsImltcG9ydCB0eXBlIHsgU2NhbkZvbGRlciwgU2NhblJlc3VsdCwgU2Nhbm5lZEJvb2ttYXJrIH0gZnJvbSAnLi4vLi4vc2hhcmVkL3NjaGVtYXMnO1xuaW1wb3J0IHR5cGUgeyBCb29rbWFya05vZGUgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IGlzRm9sZGVyLCBpc1VubW9kaWZpYWJsZSB9IGZyb20gJy4vdHlwZXMnO1xuXG4vKipcbiAqIOivhuWIqyBDaHJvbWUg57O757uf5qC555uu5b2V77yI5Lmm562+5qCPIC8g5YW25LuW5Lmm562+IC8g56e75Yqo6K6+5aSH5Lmm562+562J77yJ44CCXG4gKiDkuI3noaznvJbnoIHmoLnnm67lvZUgSUTvvJpnZXRUcmVlKCkg6aG25bGC6IqC54K555qE55u05o6l5a2Q6IqC54K55Y2z5Li657O757uf5qC555uu5b2V77yI5bimIGZvbGRlclR5cGXvvInvvIxcbiAqIOiLpemhtuWxguacrOi6q+W3suaYr+WkmuS4quiKgueCueWImeWPluaJgOacieaXoCBwYXJlbnRJZCDnmoToioLngrnjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlkZW50aWZ5Um9vdHModHJlZTogQm9va21hcmtOb2RlW10pOiBCb29rbWFya05vZGVbXSB7XG4gIGlmICh0cmVlLmxlbmd0aCA9PT0gMSAmJiB0cmVlWzBdPy5jaGlsZHJlbj8ubGVuZ3RoKSB7XG4gICAgY29uc3QgdG9wID0gdHJlZVswXTtcbiAgICBjb25zdCBjaGlsZHJlbiA9IHRvcC5jaGlsZHJlbjtcbiAgICAvLyDop6bkuI3lj6/kv67mlLnnmoTomZrmi5/moLnvvIhpZCDpgJrluLjkuLogXCIwXCLvvInvvIzlhbblrZDoioLngrnkuLrns7vnu5/moLnnm67lvZXjgIJcbiAgICBpZiAoIXRvcC5wYXJlbnRJZCAmJiBjaGlsZHJlbiAmJiBjaGlsZHJlbi5ldmVyeSgoYykgPT4gaXNGb2xkZXIoYykpKSB7XG4gICAgICByZXR1cm4gY2hpbGRyZW47XG4gICAgfVxuICB9XG4gIHJldHVybiB0cmVlLmZpbHRlcigobikgPT4gIW4ucGFyZW50SWQgJiYgaXNGb2xkZXIobikpO1xufVxuXG5pbnRlcmZhY2UgV2Fsa0NvbnRleHQge1xuICByb290SWQ6IHN0cmluZztcbiAgLyoqIOW9k+WJjeebruW9leebuOWvueagueebruW9leeahOebruW9leWQjei3r+W+hO+8iOS4jeWQq+agueebruW9leiHqui6q++8ieOAgiAqL1xuICBwYXRoOiBzdHJpbmdbXTtcbiAgZGVwdGg6IG51bWJlcjtcbn1cblxuLyoqXG4gKiDlsIbkuabnrb7moJHmiYHlubPljJbkuLrkuIDmrKHkuIDoh7TnmoTmiavmj4/nu5PmnpzjgIJcbiAqIC0g5Lul6IqC54K5IElEIOS4uuWGhemDqOS4u+mUru+8jOS4jeS7peagh+mimOaIliBVUkwg5L2c6Lqr5Lu95qCH6K+G77ybXG4gKiAtIOi3s+i/h+S4jeWPr+S/ruaUueiKgueCueWPiuWFtuaVtOS4quWtkOagke+8iOaetuaehOaWueahiOesrCA3IOiKgu+8ieOAglxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRTY2FuUmVzdWx0KFxuICB0cmVlOiBCb29rbWFya05vZGVbXSxcbiAgc2NhbklkOiBzdHJpbmcsXG4gIHNjYW5uZWRBdCA9IERhdGUubm93KCksXG4pOiBTY2FuUmVzdWx0IHtcbiAgY29uc3Qgcm9vdHMgPSBpZGVudGlmeVJvb3RzKHRyZWUpLm1hcCgocikgPT4gKHsgaWQ6IHIuaWQsIHRpdGxlOiByLnRpdGxlIH0pKTtcbiAgY29uc3Qgcm9vdElkcyA9IG5ldyBTZXQocm9vdHMubWFwKChyKSA9PiByLmlkKSk7XG4gIGNvbnN0IGZvbGRlcnM6IFNjYW5Gb2xkZXJbXSA9IFtdO1xuICBjb25zdCBib29rbWFya3M6IFNjYW5uZWRCb29rbWFya1tdID0gW107XG5cbiAgY29uc3Qgd2FsayA9IChub2RlOiBCb29rbWFya05vZGUsIGN0eDogV2Fsa0NvbnRleHQpOiB2b2lkID0+IHtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4gPz8gW10pIHtcbiAgICAgIGlmIChpc1VubW9kaWZpYWJsZShjaGlsZCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoaXNGb2xkZXIoY2hpbGQpKSB7XG4gICAgICAgIGNvbnN0IGZvbGRlclBhdGggPSBbLi4uY3R4LnBhdGgsIGNoaWxkLnRpdGxlXTtcbiAgICAgICAgZm9sZGVycy5wdXNoKHtcbiAgICAgICAgICBpZDogY2hpbGQuaWQsXG4gICAgICAgICAgcGFyZW50SWQ6IG5vZGUuaWQsXG4gICAgICAgICAgcm9vdElkOiBjdHgucm9vdElkLFxuICAgICAgICAgIHRpdGxlOiBjaGlsZC50aXRsZSxcbiAgICAgICAgICBwYXRoOiBmb2xkZXJQYXRoLFxuICAgICAgICAgIGRlcHRoOiBjdHguZGVwdGggKyAxLFxuICAgICAgICB9KTtcbiAgICAgICAgd2FsayhjaGlsZCwgeyByb290SWQ6IGN0eC5yb290SWQsIHBhdGg6IGZvbGRlclBhdGgsIGRlcHRoOiBjdHguZGVwdGggKyAxIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYm9va21hcmtzLnB1c2goe1xuICAgICAgICAgIGlkOiBjaGlsZC5pZCxcbiAgICAgICAgICB0aXRsZTogY2hpbGQudGl0bGUsXG4gICAgICAgICAgdXJsOiBjaGlsZC51cmwgPz8gJycsXG4gICAgICAgICAgZGF0ZUFkZGVkOiBjaGlsZC5kYXRlQWRkZWQsXG4gICAgICAgICAgcGFyZW50SWQ6IG5vZGUuaWQsXG4gICAgICAgICAgcm9vdElkOiBjdHgucm9vdElkLFxuICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgZm9yIChjb25zdCByb290IG9mIGlkZW50aWZ5Um9vdHModHJlZSkpIHtcbiAgICBpZiAoIXJvb3RJZHMuaGFzKHJvb3QuaWQpKSBjb250aW51ZTtcbiAgICB3YWxrKHJvb3QsIHsgcm9vdElkOiByb290LmlkLCBwYXRoOiBbXSwgZGVwdGg6IDAgfSk7XG4gIH1cblxuICByZXR1cm4geyBzY2FuSWQsIHNjYW5uZWRBdCwgcm9vdHMsIGZvbGRlcnMsIGJvb2ttYXJrcyB9O1xufVxuIiwiaW1wb3J0IHR5cGUgeyBNZXNzYWdlcyB9IGZyb20gJy4vdHlwZXMnO1xuXG5jb25zdCB6aENOOiBNZXNzYWdlcyA9IHtcbiAgYXBwOiB7XG4gICAgdGl0bGU6ICdUaWR5TWFya3MnLFxuICAgIHN0ZXBzOiB7XG4gICAgICBzY2FuOiAn5omr5o+PJyxcbiAgICAgIHNlbGVjdDogJ+mAieaLqScsXG4gICAgICBvcmdhbml6aW5nOiAn5pW055CGJyxcbiAgICAgIHByZXZpZXc6ICfpooTop4gnLFxuICAgICAgcmVzdWx0OiAn5a6M5oiQJyxcbiAgICB9LFxuICB9LFxuICBjb21tb246IHtcbiAgICBiYWNrOiAn6L+U5ZueJyxcbiAgICBzZXR0aW5nczogJ+iuvue9ricsXG4gICAgY2xvc2VTZXR0aW5nczogJ+WFs+mXreiuvue9ricsXG4gICAgc2F2ZTogJ+S/neWtmCcsXG4gICAgY2FuY2VsOiAn5Y+W5raIJyxcbiAgICB1bnRpdGxlZDogJ+aXoOagh+mimCcsXG4gICAgbG9hZGluZzogJ+ato+WcqOWKoOi9vS4uLicsXG4gICAgZGVsZXRpbmc6ICfmraPlnKjliKDpmaQuLi4nLFxuICAgIHNjYW5uaW5nQWN0aW9uOiAn5q2j5Zyo5omr5o+PLi4uJyxcbiAgICB1bm9yZ2FuaXplZDogJ+acquaVtOeQhicsXG4gICAgY291bnRCb29rbWFya3M6ICd7bn0g5p2hJyxcbiAgfSxcbiAgYnVzeToge1xuICAgIHNjYW46ICfmraPlnKjmiavmj4/kuabnrb4uLi4nLFxuICAgIGRlbGV0ZUVtcHR5Rm9sZGVyczogJ+ato+WcqOWIoOmZpOepuuaWh+S7tuWkuS4uLicsXG4gICAgZGVsZXRlRHVwbGljYXRlczogJ+ato+WcqOWIoOmZpOmHjeWkjeS5puetvi4uLicsXG4gICAgZ2VuZXJhdGVQbGFuOiAn5q2j5Zyo55Sf5oiQ5pW055CG5pa55qGILi4uJyxcbiAgICBhcHBseVBsYW46ICfmraPlnKjlupTnlKjmlbTnkIbmlrnmoYguLi4nLFxuICAgIHJldHJ5OiAn5q2j5Zyo6YeN6K+V5aSx6LSl6aG5Li4uJyxcbiAgICB1bmRvOiAn5q2j5Zyo5pKk6ZSA5pyA6L+R5LiA5qyh5pW055CGLi4uJyxcbiAgICBjYW5jZWw6ICfmraPlnKjor7fmsYLkuK3mlq0uLi4nLFxuICB9LFxuICBzZXR0aW5nczoge1xuICAgIHRpdGxlOiAn5qih5Z6L6K6+572uJyxcbiAgICBzdWJ0aXRsZTogJ+mFjee9ruS9oOiHquW3seeahCBPcGVuQUkg5YW85a65IEFQSe+8jOaJgOacieivt+axguebtOaOpeS7jua1j+iniOWZqOWPkeWHuuOAgicsXG4gICAgYmFzZVVybExhYmVsOiAnQmFzZSBVUkwnLFxuICAgIGJhc2VVcmxQbGFjZWhvbGRlcjogJ2h0dHBzOi8vYXBpLm9wZW5haS5jb20vdjEnLFxuICAgIGJhc2VVcmxIZWxwZXI6ICfku4XmlK/mjIEgSFRUUFPvvJvkv53lrZjml7bkvJrlkJHmtY/op4jlmajnlLPor7for6XlnLDlnYDnmoTorr/pl67mnYPpmZDjgIInLFxuICAgIGFwaUtleUxhYmVsOiAnQVBJIEtleScsXG4gICAgYXBpS2V5UGxhY2Vob2xkZXI6ICdzay0uLi4nLFxuICAgIGFwaUtleUhlbHBlcjogJ+WPquWtmOWCqOWcqOacrOWcsCBjaHJvbWUuc3RvcmFnZe+8jOS4jeS8muS4iuS8oOWIsOS7u+S9leacjeWKoeWZqOOAgicsXG4gICAgbW9kZWxMYWJlbDogJ+aooeWei+WQjScsXG4gICAgbW9kZWxQbGFjZWhvbGRlcjogJ2dwdC00by1taW5pJyxcbiAgICBtb2RlbEhlbHBlcjogJ+mcgOimgeaUr+aMgSBKU09OIOe7k+aehOWMlui+k+WHuueahOWvueivneaooeWei+OAgicsXG4gICAgaW52YWxpZEZvcm06ICfor7floavlhpnlkIjms5XnmoQgSFRUUFMgQmFzZSBVUkzjgIFBUEkgS2V5IOWSjOaooeWei+WQjScsXG4gICAgcGVybWlzc2lvbkRlbmllZDogJ+acquaOiOS6iOivpSBBUEkg5Zyw5Z2A55qE6K6/6Zeu5p2D6ZmQJyxcbiAgICB0ZXN0aW5nOiAn5rWL6K+V5LitLi4uJyxcbiAgICB0ZXN0Q29ubmVjdGlvbjogJ+a1i+ivlei/nuaOpScsXG4gICAgdGVzdFN1Y2Nlc3M6ICfov57mjqXmiJDlip/vvIzmqKHlnovmlK/mjIHnu5PmnoTljJbovpPlh7onLFxuICAgIHRlc3RGYWlsZWQ6ICfov57mjqXlpLHotKXvvJp7bXNnfScsXG4gICAgdGVzdFByb21wdDogJ+ivt+WbnuWkjSBvaycsXG4gICAgbmVlZFNldHRpbmdzOiAn6K+35YWI5a6M5oiQ5qih5Z6L6K6+572uJyxcbiAgfSxcbiAgc2Nhbjoge1xuICAgIHRpdGxlSWRsZTogJ+aJq+aPj+S5puetvicsXG4gICAgdGl0bGVEb25lOiAn5omr5o+P5a6M5oiQ77yM5p+l55yL5Lmm562+57uf6K6h5L+h5oGvJyxcbiAgICBzdWJ0aXRsZUlkbGU6ICfmraPlnKjor7vlj5bkvaDnmoTkuabnrb7moJEuLi4nLFxuICAgIHN0YXJ0OiAn5byA5aeL5omr5o+PJyxcbiAgICB0b3RhbEJvb2ttYXJrczogJ+S5puetvuaAu+aVsCcsXG4gICAgZm9sZGVyczogJ+aWh+S7tuWkuScsXG4gICAgb3JnYW5pemFibGU6ICflj6/mlbTnkIbkuabnrb4nLFxuICAgIG5vVGl0bGU6ICfml6DmoIfpopgnLFxuICAgIGNob29zZUZlYXR1cmU6ICfpgInmi6nlip/og70nLFxuICAgIG9yZ2FuaXplOiAn5pW055CG5Lmm562+JyxcbiAgICBvcmdhbml6ZURlc2M6ICdBSSDoh6rliqjliIbnsbvvvIzph43lu7rnm67lvZXnu5PmnoQnLFxuICAgIHNlbGVjdFNjb3BlOiAn6YCJ5oup6IyD5Zu0IOKGkicsXG4gICAgZHVwbGljYXRlczogJ+ajgOafpemHjeWkjeS5puetvicsXG4gICAgZHVwbGljYXRlc0Rlc2M6ICfmib7lh7rnm7jlkIzmiJbnm7jkvLznmoTph43lpI3pobknLFxuICAgIGR1cGxpY2F0ZVJlc3VsdHM6ICfmn6XnnIsge259IOe7hOe7k+aenCDihpInLFxuICAgIG5vRHVwbGljYXRlczogJ+acquWPkeeOsOmHjeWkjemhuScsXG4gICAgZW1wdHlGb2xkZXJzOiAn5riF55CG56m65paH5Lu25aS5JyxcbiAgICBlbXB0eUZvbGRlcnNEZXNjOiAn5Yig6Zmk5LiN5ZCr5Lu75L2V5Lmm562+55qE56m655uu5b2VJyxcbiAgICBlbXB0eUZvbGRlclJlc3VsdHM6ICflj5HnjrAge259IOS4quepuuaWh+S7tuWkuSDihpInLFxuICAgIG5vRW1wdHlGb2xkZXJzOiAn5rKh5pyJ56m65paH5Lu25aS5JyxcbiAgICBkZWxldGVTdW1tYXJ5OiAne2RlbGV0ZWR9IOS4quW3suWIoOmZpO+8jHtmYWlsZWR9IOS4quWIoOmZpOWksei0pScsXG4gICAgc2V0dGluZ3NSZXF1aXJlZDogJ+ivt+WFiOWujOaIkOaooeWei+iuvue9ricsXG4gICAgcHJvZ3Jlc3NEb25lOiAn5omr5o+P5a6M5oiQJyxcbiAgfSxcbiAgZHVwbGljYXRlczoge1xuICAgIGJhY2s6ICfov5Tlm54nLFxuICAgIGZvdW5kU3VtbWFyeTogJ+WFseWPkeeOsCB7bn0g5Liq6YeN5aSNJyxcbiAgICB0aXRsZTogJ+mHjeWkjeS5puetvicsXG4gICAgc3VidGl0bGU6ICfmr4/nu4Tkv53nlZnkuIDpobnvvIzlhbbkvZnlj6/liKDpmaTjgILlj6/lhYjlv73nlaXkuI3lpITnkIbnmoTnu4TjgIInLFxuICAgIGVtcHR5OiAn5rKh5pyJ5Y+R546w6YeN5aSN5Lmm562+JyxcbiAgICBsYWJlbFNhbWVVcmw6ICfnm7jlkIznvZHlnYAnLFxuICAgIGxhYmVsU2ltaWxhclVybDogJ+ebuOS8vOe9keWdgCcsXG4gICAgbGFiZWxTYW1lVGl0bGU6ICfnm7jlkIzmoIfpopgnLFxuICAgIGlnbm9yZTogJ+W/veeVpScsXG4gICAgcmVzdG9yZTogJ+aBouWkjScsXG4gICAga2VlcEFyaWE6ICfkv53nlZkge3RpdGxlfScsXG4gICAgd2lsbERlbGV0ZTogJ+WwhuWIoOmZpCB7bn0g5Liq6YeN5aSN5Lmm562+JyxcbiAgICBkZWxldGVBY3Rpb246ICfliKDpmaTph43lpI3pobknLFxuICB9LFxuICBlbXB0eUZvbGRlcnM6IHtcbiAgICBiYWNrOiAn6L+U5ZueJyxcbiAgICBmb3VuZFN1bW1hcnk6ICflhbHlj5HnjrAge259IOS4quepuuaWh+S7tuWkuScsXG4gICAgdGl0bGU6ICfmuIXnkIbnqbrmlofku7blpLknLFxuICAgIHN1YnRpdGxlOiAn5Y+q5Yig6Zmk5LiN5YyF5ZCr5Lu75L2V5Lmm562+55qE56m655uu5b2V44CCJyxcbiAgICBlbXB0eTogJ+ayoeacieepuuaWh+S7tuWkuScsXG4gICAgZGVsZXRlQXJpYTogJ+WIoOmZpCB7cGF0aH0nLFxuICAgIHdpbGxEZWxldGU6ICflsIbliKDpmaQge259IOS4quepuuaWh+S7tuWkuScsXG4gICAgZGVsZXRlQWN0aW9uOiAn5Yig6Zmk56m65paH5Lu25aS5JyxcbiAgfSxcbiAgc2VsZWN0OiB7XG4gICAgdGl0bGU6ICfpgInmi6nmlbTnkIbojIPlm7QnLFxuICAgIHN1YnRpdGxlOiAn54K55Ye75paH5Lu25aS55p+l55yL5Lmm562+77yM5Yu+6YCJ6KaB5pW055CG55qE5YaF5a65JyxcbiAgICBmb2xkZXJUcmVlOiAn5Lmm562+5paH5Lu25aS5JyxcbiAgICBsb2FkaW5nVHJlZTogJ+ato+WcqOWKoOi9veaWh+S7tuWkueagkS4uLicsXG4gICAgdmlld09ubHk6ICfkuabnrb7ku4Xkvpvmn6XnnIsnLFxuICAgIG5vQm9va21hcmtzOiAn6K+l5paH5Lu25aS55LiL5peg5Lmm562+JyxcbiAgICBjbGlja0ZvbGRlcjogJ+eCueWHu+W3puS+p+aWh+S7tuWkueafpeeci+S5puetvicsXG4gICAgbW9kZVRpdGxlOiAn6YCJ5oup5pW055CG5qih5byPJyxcbiAgICBjb25zZXJ2YXRpdmU6ICfkv53lrojmlbTnkIYnLFxuICAgIGNvbnNlcnZhdGl2ZURlc2M6ICfkv53nlZnnjrDmnInnm67lvZXnu5PmnoTvvIzlj6rmiorkuabnrb7lvZLlhaXlt7LmnInmlofku7blpLknLFxuICAgIHJlb3JnYW5pemU6ICfph43mlrDop4TliJLnm67lvZUnLFxuICAgIHJlb3JnYW5pemVEZXNjOiAnQUkg6Ieq55Sx6K6+6K6h5YWo5paw55qE55uu5b2V5L2T57O777yM6YeN57uE5omA5pyJ6YCJ5Lit5Lmm562+JyxcbiAgICBuYW1lU3R5bGVUaXRsZTogJ+aWh+S7tuWkueWRveWQjemjjuagvCcsXG4gICAgZW1vamlUZXh0OiAn5Zu+5qCHICsg5paH5a2XJyxcbiAgICBlbW9qaVRleHREZXNjOiAn55SoIGVtb2ppIOWJjee8gOWMuuWIhuebruW9le+8jOS4gOecvOi+qOiupCcsXG4gICAgdGV4dE9ubHk6ICfnuq/mloflrZcnLFxuICAgIHRleHRPbmx5RGVzYzogJ+S/neaMgeeugOa0ge+8jOS4jea3u+WKoCBlbW9qaScsXG4gICAgc2VsZWN0ZWRTdW1tYXJ5OiAn5bey6YCJIHtmb2xkZXJzfSDkuKrmlofku7blpLnvvIzlhbEge2NvdW50fSDmnaHkuabnrb4nLFxuICAgIHN0YXJ0QW5hbHlzaXM6ICdBSSDlvIDlp4vliIbmnpAgKHtufSDmnaEpIOKGkicsXG4gICAgZXhhbXBsZUVtb2ppRm9sZGVyOiAn8J+TmiDlrabkuaDotYTmlpknLFxuICAgIGV4YW1wbGVUZXh0Rm9sZGVyOiAn5a2m5Lmg6LWE5paZJyxcbiAgfSxcbiAgb3JnYW5pemluZzoge1xuICAgIHRpdGxlOiAnQUkg5q2j5Zyo5YiG5p6QJyxcbiAgICBzdWJ0aXRsZTogJ+agueaNruagh+mimOOAgVVSTCDlkozlvZPliY3nm67lvZXnlJ/miJDliIbnsbvlu7rorq4nLFxuICAgIHN0ZXBSZWFkOiAn6K+75Y+W5Lmm562+5pWw5o2uLi4uJyxcbiAgICBzdGVwUmVhZERlc2M6ICfku4Xor7vlj5bmoIfpopjjgIFVUkwg5ZKM5b2T5YmN55uu5b2V77yM5LiN6K6/6Zeu572R6aG1JyxcbiAgICBzdGVwRGVzaWduOiAn55Sf5oiQ55uu5b2V5L2T57O7JyxcbiAgICBzdGVwRGVzaWduRGVzYzogJ0FJIOagueaNruS5puetvuWGheWuueiuvuiuoeWIhuexu+ebruW9lScsXG4gICAgc3RlcEFzc2lnbjogJ+WIhumFjeS5puetvicsXG4gICAgc3RlcEFzc2lnbkRlc2M6ICfmiormr4/mnaHkuabnrb7lvZLlhaXmnIDlkIjpgILnmoTnm67lvZUnLFxuICAgIHN0ZXBWYWxpZGF0ZTogJ+agoemqjOe7k+aenCcsXG4gICAgc3RlcFZhbGlkYXRlRGVzYzogJ+ajgOafpeebruW9leWxgue6p+S4juS5puetvuW9kuWxnuaYr+WQpuWQiOazlScsXG4gICAgc3RlcERvbmU6ICfmlrnmoYjlsLHnu6onLFxuICAgIHN0ZXBEb25lRGVzYzogJ+WNs+Wwhui/m+WFpemihOiniO+8jOWPr+ehruiupOWQjuWGjeWGmeWFpScsXG4gICAgdGF4b25vbXk6ICfnlJ/miJDnm67lvZXkvZPns7snLFxuICAgIGFzc2lnbjogJ+WIhumFjeS5puetvicsXG4gICAgcHJpdmFjeTogJ+makOengeivtOaYju+8muS5puetvueahOagh+mimOOAgVVSTCDkuI7nm67lvZXot6/lvoTkvJrlj5HpgIHnu5nkvaDphY3nva7nmoTmqKHlnovmnI3liqHnlKjkuo7liIbnsbvvvJvmianlsZXoh6rouqvkuI3mlLbpm4bjgIHkuI3kuIrkvKDliLDku7vkvZXlhbbku5bmnI3liqHlmajjgIInLFxuICAgIHByZXZTdGVwOiAn4oaQIOS4iuS4gOatpScsXG4gIH0sXG4gIHByZXZpZXc6IHtcbiAgICB0aXRsZTogJ+mihOiniOaVtOeQhuW7uuiuricsXG4gICAgc3VidGl0bGU6ICfkuabnrb7ku4Xkvpvmn6XnnIvjgILmlofku7blpLnmoIfms6jjgIzmlrDjgI3ooajnpLrlsIbmlrDlu7ror6Xnm67lvZXjgIInLFxuICAgIHdpbGxNb3ZlOiAn5bCG56e75YqoJyxcbiAgICBuZXdGb2xkZXJzOiAn5paw5bu655uu5b2VJyxcbiAgICBjbGVhbnVwU2NvcGU6ICfmuIXnkIbojIPlm7QnLFxuICAgIHRyZWVUaXRsZTogJ+aVtOeQhuWQjueahOS5puetvuebruW9leagkScsXG4gICAgY2xlYW51cERlc2M6ICfku4XmuIXnkIbmiYDpgInmlofku7blpLnojIPlm7TlhoXnmoTnqbrnm67lvZXvvIzlj6/kuIDplK7mkqTplIAnLFxuICAgIGJhY2s6ICfov5Tlm54nLFxuICAgIGFwcGx5QWN0aW9uOiAn5bqU55So5pa55qGI5bm25riF55CG56m655uu5b2VICh7bn0g5p2hKSDihpInLFxuICAgIGJhZGdlTmV3OiAn5pawJyxcbiAgICB2aWV3T25seTogJ+S5puetvuS7heS+m+afpeeciycsXG4gIH0sXG4gIHJlc3VsdDoge1xuICAgIHdyaXRpbmdUaXRsZTogJ+ato+WcqOWGmeWFpeS5puetvicsXG4gICAgd3JpdGluZ0Rlc2M6ICfpgJDmnaHnp7vliqjkuabnrb7vvIzlubbmuIXnkIbmiYDpgInojIPlm7TlhoXnmoTnqbrmlofku7blpLknLFxuICAgIGRvbmVUaXRsZTogJ+aVtOeQhuWujOaIkCcsXG4gICAgZG9uZURlc2M6ICfmiJDlip/np7vliqgge259IOadoeS5puetvuWIsOaWsOebruW9lScsXG4gICAgdW5kb25lVGl0bGU6ICflt7LmkqTplIAnLFxuICAgIHVuZG9uZURlc2M6ICflt7LmkqTplIDmnIDov5HkuIDmrKHmlbTnkIbvvIzkuabnrb7lt7Lov5jljp8nLFxuICAgIGludGVycnVwdGVkVGl0bGU6ICflt7LkuK3mlq0nLFxuICAgIGludGVycnVwdGVkRGVzYzogJ+WPr+S7peS7juaWreeCuee7p+e7reW6lOeUqO+8jOaIluaSpOmUgOW3suW6lOeUqOeahOmDqOWIhicsXG4gICAgZmFpbGVkVGl0bGU6ICflupTnlKjlpLHotKUnLFxuICAgIGZhaWxlZERlc2M6ICflj6/ph43or5XmiJbmkqTplIAnLFxuICAgIHBhcnRpYWxVbmRvbmVUaXRsZTogJ+mDqOWIhuaSpOmUgCcsXG4gICAgcGFydGlhbFVuZG9uZURlc2M6ICfpg6jliIbmkqTplIDmiJDlip/vvIzlrZjlnKjlhrLnqoHpobnvvIzlj6/lho3mrKHlsJ3or5UnLFxuICAgIHByb2dyZXNzT2Y6ICd7YXBwbGllZH0gLyB7dG90YWx9IOWujOaIkCcsXG4gICAgc3RhdENvbXBsZXRlZDogJ+W3suWujOaIkCcsXG4gICAgc3RhdFBlbmRpbmc6ICflvoXlpITnkIYnLFxuICAgIHN0YXRGYWlsZWQ6ICflpLHotKUnLFxuICAgIHNuYXBzaG90SGludDogJ+W3suS/neWtmOaBouWkjeW/q+eFp+OAguWujOaIkOWQjuWPr+WcqOe7k+aenOmhteS4gOmUruaSpOmUgOacrOasoeaVtOeQhu+8jOi/mOWOn+aJgOacieS5puetvuiHs+WOn+Wni+S9jee9ruOAgicsXG4gICAgZmFpbHVyZURldGFpbHM6ICflpLHotKXor6bmg4UgKHtufSknLFxuICAgIGludGVycnVwdDogJ+S4reaWrScsXG4gICAgcmVzdW1lOiAn5LuO5pat54K557un57utJyxcbiAgICB1bmRvOiAn5pKk6ZSA5pys5qyh5pW055CGJyxcbiAgICBzdGFydE92ZXI6ICflvIDlp4vmlrDkuIDova7mlbTnkIYnLFxuICB9LFxuICBlcnJvcnM6IHtcbiAgICBhYm9ydGVkOiAn6K+35rGC5bey5Y+W5raIJyxcbiAgICBuZXR3b3JrOiAn572R57uc6K+35rGC5aSx6LSlJyxcbiAgICBuZXR3b3JrQ2hlY2tCYXNlVXJsOiAn572R57uc6K+35rGC5aSx6LSl77yM6K+35qOA5p+lIEJhc2UgVVJMIOS4jue9kee7nOi/nuaOpScsXG4gICAgcmF0ZUxpbWl0ZWQ6ICfmqKHlnovpmZDmtYHvvIhIVFRQIDQyOe+8ie+8jOW3suiHquWKqOmHjeivleS7jeWksei0pScsXG4gICAgc2VydmVyRXJyb3I6ICfmqKHlnovmnI3liqHlvILluLjvvIhIVFRQIHtzdGF0dXN977yJ77yM5bey6Ieq5Yqo6YeN6K+V5LuN5aSx6LSlJyxcbiAgICBhdXRoRmFpbGVkOiAnQVBJIOmJtOadg+Wksei0pe+8iEhUVFAge3N0YXR1c33vvInvvIzor7fmo4Dmn6UgQVBJIEtleScsXG4gICAgaHR0cEVycm9yOiAn5qih5Z6L5o6l5Y+j6L+U5ZueIEhUVFAge3N0YXR1c33vvJp7ZGV0YWlsfScsXG4gICAgZW1wdHlDb250ZW50OiAn5qih5Z6L5ZON5bqU57y65bCR5YaF5a65JyxcbiAgICBpbnZhbGlkSnNvbjogJ+aooeWei+WTjeW6lOS4jeaYr+acieaViOeahCBKU09OJyxcbiAgICBpbnZhbGlkRm9ybWF0OiAn5qih5Z6L5ZON5bqU5LiN56ym5ZCIe3doYXR955qE5qC85byP6KaB5rGCJyxcbiAgICBub0NhdGVnb3JpZXM6ICfmqKHlnovmsqHmnInkuqflh7rku7vkvZXlj6/nlKjnm67lvZUnLFxuICAgIGNvbnNlcnZhdGl2ZU5vRm9sZGVyczogJ+S/neWuiOaooeW8j+S4i++8jOmDqOWIhuaJgOmAieS5puetvuaJgOWcqOWMuuWfn+ayoeacieWPr+eUqOeahOeOsOacieaWh+S7tuWkuScsXG4gICAgaW52YWxpZEJhc2VVcmw6ICdCYXNlIFVSTCDmoLzlvI/kuI3mraPnoa4nLFxuICAgIGh0dHBzT25seTogJ+S7heaUr+aMgSBIVFRQUyDnmoQgQVBJIEJhc2UgVVJMJyxcbiAgICBzdG9yYWdlUXVvdGE6ICfmnKzlnLDlrZjlgqjnqbrpl7TkuI3otrPvvIzor7fnvKnlsI/mlbTnkIbojIPlm7TvvIhjaHJvbWUuc3RvcmFnZS5sb2NhbCDphY3pop3nuqYgMTAgTULvvIknLFxuICAgIG1lc3NhZ2luZ1VucmVhY2hhYmxlOiAn5peg5rOV6IGU57O75ZCO5Y+w5pyN5Yqh77yM6K+36YeN5paw5omT5byA5omp5bGV6aG16Z2iJyxcbiAgICB1bmtub3duUmVzcG9uc2U6ICflkI7lj7DmnI3liqHov5Tlm57kuobml6Dms5Xor4bliKvnmoTlk43lupQnLFxuICAgIHVua25vd25Db21tYW5kOiAn5pyq55+l5oiW6Z2e5rOV55qE5ZG95LukJyxcbiAgICBqb2JOb3RGb3VuZDogJ+S7u+WKoeS4jeWtmOWcqOaIluW3sui/h+acn++8jOivt+mHjeaWsOaJq+aPjycsXG4gICAgam9iRXhwaXJlZDogJ+S7u+WKoeS4jeWtmOWcqOaIluW3sui/h+acnycsXG4gICAgbm9TY2FuOiAn5rKh5pyJ5Y+v55So55qE5omr5o+P57uT5p6c77yM6K+35YWI5omr5o+PJyxcbiAgICBub1BsYW46ICfmsqHmnInlj6/nlKjnmoTliIbnsbvmlrnmoYjvvIzor7flhYjnlJ/miJDmlrnmoYgnLFxuICAgIGNhbm5vdEFwcGx5SW5TdGF0ZTogJ+W9k+WJjeS7u+WKoeeKtuaAgeS4uiB7c3RhdHVzfe+8jOaXoOazleW8gOWni+W6lOeUqCcsXG4gICAgY2Fubm90VW5kb0luU3RhdGU6ICflvZPliY3ku7vliqHnirbmgIHkuLoge3N0YXR1c33vvIzml6Dms5XlvIDlp4vmkqTplIAnLFxuICAgIGJvb2ttYXJrTWlzc2luZzogJ+S5puetvuW3suS4jeWtmOWcqO+8jOi3s+i/hycsXG4gICAgYm9va21hcmtHb25lRHVyaW5nQXBwbHk6ICfkuabnrb7lnKjlupTnlKjov4fnqIvkuK3ooqvliKDpmaQnLFxuICAgIGNvbnNlcnZhdGl2ZUZvbGRlckdvbmU6ICfkv53lrojmqKHlvI/nmoTnm67moIfmlofku7blpLnlt7LkuI3lrZjlnKjvvIzlt7Lot7Pov4cnLFxuICAgIGNsZWFudXBGb2xkZXJGYWlsZWQ6ICfmuIXnkIbnqbrmlofku7blpLnigJx7dGl0bGV94oCd5aSx6LSl77yae21lc3NhZ2V9JyxcbiAgICBub3RTY2FubmVkRW1wdHlGb2xkZXI6ICflvoXliKDpmaTpobnkuI3mmK/lvZPliY3miavmj4/or4bliKvlh7rnmoTnqbrmlofku7blpLnvvIzor7fph43mlrDmo4Dmn6UnLFxuICAgIG5vdFNjYW5uZWREdXBsaWNhdGU6ICflvoXliKDpmaTpobnkuI3mmK/lvZPliY3miavmj4/or4bliKvlh7rnmoTph43lpI3kuabnrb7vvIzor7fph43mlrDmo4Dmn6UnLFxuICAgIGtlZXBPbmVQZXJHcm91cDogJ+avj+e7hOmHjeWkjeS5puetvuiHs+WwkemcgOimgeS/neeVmeS4gOmhuScsXG4gICAgZm9sZGVyQWxyZWFkeUhhc0Jvb2ttYXJrczogJ+aWh+S7tuWkueWGheW3suWtmOWcqOS5puetvu+8jOW3sui3s+i/hycsXG4gICAgZGVsZXRlRmFpbGVkOiAn5Yig6Zmk5aSx6LSlJyxcbiAgICB1bmRvTW92ZWRCeVVzZXI6ICfkuabnrb7lt7Looqvlho3mrKHnp7vliqjvvIzot7Pov4fku6XkuI3opobnm5bnlKjmiLfnmoTmlrDmk43kvZwnLFxuICAgIHVuZG9Cb29rbWFya01pc3Npbmc6ICfkuabnrb7lt7LliKDpmaTvvIzml6Dms5XmgaLlpI0nLFxuICAgIHVuZG9QYXJlbnRNaXNzaW5nOiAn5Y6f54i255uu5b2V5bey5LiN5a2Y5Zyo77yM5peg5rOV5oGi5aSNJyxcbiAgICByZXN0b3JlRmFpbGVkOiAn5oGi5aSN5aSx6LSl77yae21lc3NhZ2V9JyxcbiAgICBub1VuZG9TbmFwc2hvdDogJ+ayoeacieWPr+eUqOS6juaSpOmUgOeahOacgOi/keS4gOasoeaVtOeQhuW/q+eFpycsXG4gICAgdW5kb0ludGVycnVwdGVkOiAn5bey5oyJ55So5oi36K+35rGC5Lit5pat5pKk6ZSA77yM5Y+v6YeN5paw5Y+R6LW35pKk6ZSAJyxcbiAgICB0ZXN0UGluZzogJ+ivt+WbnuWkjSBvaycsXG4gICAgd2hhdENhbmRpZGF0ZVRheG9ub215OiAn5YCZ6YCJ55uu5b2V5om55qyhJyxcbiAgICB3aGF0VGF4b25vbXk6ICfnm67lvZXkvZPns7snLFxuICAgIHdoYXRBc3NpZ25tZW50OiAn5Lmm562+5YiG6YWN5om55qyhJyxcbiAgICBpbGxlZ2FsVHJhbnNpdGlvbjogJ+mdnuazleS7u+WKoeeKtuaAgei/geenuzoge2Zyb219IC0+IHt0b30nLFxuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgemhDTjtcbiIsImltcG9ydCB0eXBlIHsgTWVzc2FnZXMgfSBmcm9tICcuL3R5cGVzJztcblxuY29uc3QgZW46IE1lc3NhZ2VzID0ge1xuICBhcHA6IHtcbiAgICB0aXRsZTogJ1RpZHlNYXJrcycsXG4gICAgc3RlcHM6IHtcbiAgICAgIHNjYW46ICdTY2FuJyxcbiAgICAgIHNlbGVjdDogJ1NlbGVjdCcsXG4gICAgICBvcmdhbml6aW5nOiAnT3JnYW5pemUnLFxuICAgICAgcHJldmlldzogJ1ByZXZpZXcnLFxuICAgICAgcmVzdWx0OiAnRG9uZScsXG4gICAgfSxcbiAgfSxcbiAgY29tbW9uOiB7XG4gICAgYmFjazogJ0JhY2snLFxuICAgIHNldHRpbmdzOiAnU2V0dGluZ3MnLFxuICAgIGNsb3NlU2V0dGluZ3M6ICdDbG9zZSBzZXR0aW5ncycsXG4gICAgc2F2ZTogJ1NhdmUnLFxuICAgIGNhbmNlbDogJ0NhbmNlbCcsXG4gICAgdW50aXRsZWQ6ICdVbnRpdGxlZCcsXG4gICAgbG9hZGluZzogJ0xvYWRpbmcuLi4nLFxuICAgIGRlbGV0aW5nOiAnRGVsZXRpbmcuLi4nLFxuICAgIHNjYW5uaW5nQWN0aW9uOiAnU2Nhbm5pbmcuLi4nLFxuICAgIHVub3JnYW5pemVkOiAnVW5vcmdhbml6ZWQnLFxuICAgIGNvdW50Qm9va21hcmtzOiAne259IGJvb2ttYXJrcycsXG4gIH0sXG4gIGJ1c3k6IHtcbiAgICBzY2FuOiAnU2Nhbm5pbmcgYm9va21hcmtzLi4uJyxcbiAgICBkZWxldGVFbXB0eUZvbGRlcnM6ICdEZWxldGluZyBlbXB0eSBmb2xkZXJzLi4uJyxcbiAgICBkZWxldGVEdXBsaWNhdGVzOiAnRGVsZXRpbmcgZHVwbGljYXRlIGJvb2ttYXJrcy4uLicsXG4gICAgZ2VuZXJhdGVQbGFuOiAnR2VuZXJhdGluZyBvcmdhbml6ZSBwbGFuLi4uJyxcbiAgICBhcHBseVBsYW46ICdBcHBseWluZyBvcmdhbml6ZSBwbGFuLi4uJyxcbiAgICByZXRyeTogJ1JldHJ5aW5nIGZhaWxlZCBpdGVtcy4uLicsXG4gICAgdW5kbzogJ1VuZG9pbmcgdGhlIGxhc3Qgb3JnYW5pemUuLi4nLFxuICAgIGNhbmNlbDogJ1JlcXVlc3RpbmcgaW50ZXJydXB0aW9uLi4uJyxcbiAgfSxcbiAgc2V0dGluZ3M6IHtcbiAgICB0aXRsZTogJ01vZGVsIFNldHRpbmdzJyxcbiAgICBzdWJ0aXRsZTogJ0NvbmZpZ3VyZSB5b3VyIG93biBPcGVuQUktY29tcGF0aWJsZSBBUEkuIEFsbCByZXF1ZXN0cyBhcmUgc2VudCBkaXJlY3RseSBmcm9tIHlvdXIgYnJvd3Nlci4nLFxuICAgIGJhc2VVcmxMYWJlbDogJ0Jhc2UgVVJMJyxcbiAgICBiYXNlVXJsUGxhY2Vob2xkZXI6ICdodHRwczovL2FwaS5vcGVuYWkuY29tL3YxJyxcbiAgICBiYXNlVXJsSGVscGVyOiAnSFRUUFMgb25seS4gQWNjZXNzIHBlcm1pc3Npb24gZm9yIHRoaXMgb3JpZ2luIHdpbGwgYmUgcmVxdWVzdGVkIHdoZW4gc2F2aW5nLicsXG4gICAgYXBpS2V5TGFiZWw6ICdBUEkgS2V5JyxcbiAgICBhcGlLZXlQbGFjZWhvbGRlcjogJ3NrLS4uLicsXG4gICAgYXBpS2V5SGVscGVyOiAnU3RvcmVkIG9ubHkgaW4gbG9jYWwgY2hyb21lLnN0b3JhZ2U7IG5ldmVyIHVwbG9hZGVkIHRvIGFueSBzZXJ2ZXIuJyxcbiAgICBtb2RlbExhYmVsOiAnTW9kZWwnLFxuICAgIG1vZGVsUGxhY2Vob2xkZXI6ICdncHQtNG8tbWluaScsXG4gICAgbW9kZWxIZWxwZXI6ICdBIGNoYXQgbW9kZWwgdGhhdCBzdXBwb3J0cyBKU09OIHN0cnVjdHVyZWQgb3V0cHV0LicsXG4gICAgaW52YWxpZEZvcm06ICdQbGVhc2UgZW50ZXIgYSB2YWxpZCBIVFRQUyBCYXNlIFVSTCwgQVBJIEtleSBhbmQgbW9kZWwgbmFtZScsXG4gICAgcGVybWlzc2lvbkRlbmllZDogJ0FjY2VzcyBwZXJtaXNzaW9uIGZvciB0aGlzIEFQSSBvcmlnaW4gd2FzIG5vdCBncmFudGVkJyxcbiAgICB0ZXN0aW5nOiAnVGVzdGluZy4uLicsXG4gICAgdGVzdENvbm5lY3Rpb246ICdUZXN0IGNvbm5lY3Rpb24nLFxuICAgIHRlc3RTdWNjZXNzOiAnQ29ubmVjdGVkLiBUaGUgbW9kZWwgc3VwcG9ydHMgc3RydWN0dXJlZCBvdXRwdXQnLFxuICAgIHRlc3RGYWlsZWQ6ICdDb25uZWN0aW9uIGZhaWxlZDoge21zZ30nLFxuICAgIHRlc3RQcm9tcHQ6ICdQbGVhc2UgcmVwbHkgd2l0aCBvaycsXG4gICAgbmVlZFNldHRpbmdzOiAnUGxlYXNlIGNvbXBsZXRlIHRoZSBtb2RlbCBzZXR0aW5ncyBmaXJzdCcsXG4gIH0sXG4gIHNjYW46IHtcbiAgICB0aXRsZUlkbGU6ICdTY2FuIGJvb2ttYXJrcycsXG4gICAgdGl0bGVEb25lOiAnU2NhbiBjb21wbGV0ZS4gVmlldyBib29rbWFyayBzdGF0cycsXG4gICAgc3VidGl0bGVJZGxlOiAnUmVhZGluZyB5b3VyIGJvb2ttYXJrIHRyZWUuLi4nLFxuICAgIHN0YXJ0OiAnU3RhcnQgc2NhbicsXG4gICAgdG90YWxCb29rbWFya3M6ICdUb3RhbCBib29rbWFya3MnLFxuICAgIGZvbGRlcnM6ICdGb2xkZXJzJyxcbiAgICBvcmdhbml6YWJsZTogJ09yZ2FuaXphYmxlJyxcbiAgICBub1RpdGxlOiAnVW50aXRsZWQnLFxuICAgIGNob29zZUZlYXR1cmU6ICdDaG9vc2UgYSBmZWF0dXJlJyxcbiAgICBvcmdhbml6ZTogJ09yZ2FuaXplIGJvb2ttYXJrcycsXG4gICAgb3JnYW5pemVEZXNjOiAnQUkgYXV0by1jYXRlZ29yaXplcyBhbmQgcmVidWlsZHMgdGhlIGZvbGRlciBzdHJ1Y3R1cmUnLFxuICAgIHNlbGVjdFNjb3BlOiAnU2VsZWN0IHNjb3BlIOKGkicsXG4gICAgZHVwbGljYXRlczogJ0NoZWNrIGR1cGxpY2F0ZXMnLFxuICAgIGR1cGxpY2F0ZXNEZXNjOiAnRmluZCBpZGVudGljYWwgb3Igc2ltaWxhciBkdXBsaWNhdGUgaXRlbXMnLFxuICAgIGR1cGxpY2F0ZVJlc3VsdHM6ICdWaWV3IHtufSBncm91cHMg4oaSJyxcbiAgICBub0R1cGxpY2F0ZXM6ICdObyBkdXBsaWNhdGVzIGZvdW5kJyxcbiAgICBlbXB0eUZvbGRlcnM6ICdDbGVhbiBlbXB0eSBmb2xkZXJzJyxcbiAgICBlbXB0eUZvbGRlcnNEZXNjOiAnRGVsZXRlIGVtcHR5IGZvbGRlcnMgdGhhdCBjb250YWluIG5vIGJvb2ttYXJrcycsXG4gICAgZW1wdHlGb2xkZXJSZXN1bHRzOiAnRm91bmQge259IGVtcHR5IGZvbGRlcnMg4oaSJyxcbiAgICBub0VtcHR5Rm9sZGVyczogJ05vIGVtcHR5IGZvbGRlcnMnLFxuICAgIGRlbGV0ZVN1bW1hcnk6ICd7ZGVsZXRlZH0gZGVsZXRlZCwge2ZhaWxlZH0gZmFpbGVkJyxcbiAgICBzZXR0aW5nc1JlcXVpcmVkOiAnUGxlYXNlIGNvbXBsZXRlIHRoZSBtb2RlbCBzZXR0aW5ncyBmaXJzdCcsXG4gICAgcHJvZ3Jlc3NEb25lOiAnU2NhbiBjb21wbGV0ZScsXG4gIH0sXG4gIGR1cGxpY2F0ZXM6IHtcbiAgICBiYWNrOiAnQmFjaycsXG4gICAgZm91bmRTdW1tYXJ5OiAne259IGR1cGxpY2F0ZXMgZm91bmQgaW4gdG90YWwnLFxuICAgIHRpdGxlOiAnRHVwbGljYXRlIGJvb2ttYXJrcycsXG4gICAgc3VidGl0bGU6ICdLZWVwIG9uZSBpdGVtIHBlciBncm91cDsgdGhlIHJlc3QgY2FuIGJlIGRlbGV0ZWQuIFlvdSBjYW4gaWdub3JlIGdyb3VwcyBmb3Igbm93LicsXG4gICAgZW1wdHk6ICdObyBkdXBsaWNhdGUgYm9va21hcmtzIGZvdW5kJyxcbiAgICBsYWJlbFNhbWVVcmw6ICdTYW1lIFVSTCcsXG4gICAgbGFiZWxTaW1pbGFyVXJsOiAnU2ltaWxhciBVUkwnLFxuICAgIGxhYmVsU2FtZVRpdGxlOiAnU2FtZSB0aXRsZScsXG4gICAgaWdub3JlOiAnSWdub3JlJyxcbiAgICByZXN0b3JlOiAnUmVzdG9yZScsXG4gICAga2VlcEFyaWE6ICdLZWVwIHt0aXRsZX0nLFxuICAgIHdpbGxEZWxldGU6ICdXaWxsIGRlbGV0ZSB7bn0gZHVwbGljYXRlIGJvb2ttYXJrcycsXG4gICAgZGVsZXRlQWN0aW9uOiAnRGVsZXRlIGR1cGxpY2F0ZXMnLFxuICB9LFxuICBlbXB0eUZvbGRlcnM6IHtcbiAgICBiYWNrOiAnQmFjaycsXG4gICAgZm91bmRTdW1tYXJ5OiAne259IGVtcHR5IGZvbGRlcnMgZm91bmQgaW4gdG90YWwnLFxuICAgIHRpdGxlOiAnQ2xlYW4gZW1wdHkgZm9sZGVycycsXG4gICAgc3VidGl0bGU6ICdPbmx5IGRlbGV0ZSBlbXB0eSBmb2xkZXJzIHRoYXQgY29udGFpbiBubyBib29rbWFya3MuJyxcbiAgICBlbXB0eTogJ05vIGVtcHR5IGZvbGRlcnMnLFxuICAgIGRlbGV0ZUFyaWE6ICdEZWxldGUge3BhdGh9JyxcbiAgICB3aWxsRGVsZXRlOiAnV2lsbCBkZWxldGUge259IGVtcHR5IGZvbGRlcnMnLFxuICAgIGRlbGV0ZUFjdGlvbjogJ0RlbGV0ZSBlbXB0eSBmb2xkZXJzJyxcbiAgfSxcbiAgc2VsZWN0OiB7XG4gICAgdGl0bGU6ICdTZWxlY3Qgb3JnYW5pemUgc2NvcGUnLFxuICAgIHN1YnRpdGxlOiAnQ2xpY2sgYSBmb2xkZXIgdG8gdmlldyBib29rbWFya3M7IGNoZWNrIHdoYXQgdG8gb3JnYW5pemUnLFxuICAgIGZvbGRlclRyZWU6ICdCb29rbWFyayBmb2xkZXJzJyxcbiAgICBsb2FkaW5nVHJlZTogJ0xvYWRpbmcgZm9sZGVyIHRyZWUuLi4nLFxuICAgIHZpZXdPbmx5OiAnQm9va21hcmtzIGFyZSB2aWV3LW9ubHknLFxuICAgIG5vQm9va21hcmtzOiAnTm8gYm9va21hcmtzIGluIHRoaXMgZm9sZGVyJyxcbiAgICBjbGlja0ZvbGRlcjogJ0NsaWNrIGEgZm9sZGVyIG9uIHRoZSBsZWZ0IHRvIHZpZXcgYm9va21hcmtzJyxcbiAgICBtb2RlVGl0bGU6ICdDaG9vc2Ugb3JnYW5pemUgbW9kZScsXG4gICAgY29uc2VydmF0aXZlOiAnQ29uc2VydmF0aXZlIG9yZ2FuaXplJyxcbiAgICBjb25zZXJ2YXRpdmVEZXNjOiAnS2VlcCB0aGUgZXhpc3Rpbmcgc3RydWN0dXJlOyBvbmx5IGZpbGUgYm9va21hcmtzIGludG8gZXhpc3RpbmcgZm9sZGVycycsXG4gICAgcmVvcmdhbml6ZTogJ1JlYnVpbGQgdGhlIHN0cnVjdHVyZScsXG4gICAgcmVvcmdhbml6ZURlc2M6ICdBSSBmcmVlbHkgZGVzaWducyBhIGJyYW5kLW5ldyBmb2xkZXIgc3lzdGVtIGFuZCByZW9yZ2FuaXplcyBhbGwgc2VsZWN0ZWQgYm9va21hcmtzJyxcbiAgICBuYW1lU3R5bGVUaXRsZTogJ0ZvbGRlciBuYW1pbmcgc3R5bGUnLFxuICAgIGVtb2ppVGV4dDogJ0ljb24gKyB0ZXh0JyxcbiAgICBlbW9qaVRleHREZXNjOiAnRGlzdGluZ3Vpc2ggZm9sZGVycyB3aXRoIGVtb2ppIHByZWZpeGVzIGF0IGEgZ2xhbmNlJyxcbiAgICB0ZXh0T25seTogJ1RleHQgb25seScsXG4gICAgdGV4dE9ubHlEZXNjOiAnS2VlcCBpdCBjbGVhbiwgbm8gZW1vamknLFxuICAgIHNlbGVjdGVkU3VtbWFyeTogJ3tmb2xkZXJzfSBmb2xkZXJzIHNlbGVjdGVkLCB7Y291bnR9IGJvb2ttYXJrcyBpbiB0b3RhbCcsXG4gICAgc3RhcnRBbmFseXNpczogJ1N0YXJ0IEFJIGFuYWx5c2lzICh7bn0gYm9va21hcmtzKSDihpInLFxuICAgIGV4YW1wbGVFbW9qaUZvbGRlcjogJ/Cfk5ogUmVhZGluZycsXG4gICAgZXhhbXBsZVRleHRGb2xkZXI6ICdSZWFkaW5nJyxcbiAgfSxcbiAgb3JnYW5pemluZzoge1xuICAgIHRpdGxlOiAnQUkgaXMgYW5hbHl6aW5nJyxcbiAgICBzdWJ0aXRsZTogJ0dlbmVyYXRpbmcgY2F0ZWdvcnkgc3VnZ2VzdGlvbnMgZnJvbSB0aXRsZXMsIFVSTHMgYW5kIGN1cnJlbnQgZm9sZGVycycsXG4gICAgc3RlcFJlYWQ6ICdSZWFkaW5nIGJvb2ttYXJrIGRhdGEuLi4nLFxuICAgIHN0ZXBSZWFkRGVzYzogJ09ubHkgdGl0bGVzLCBVUkxzIGFuZCBjdXJyZW50IGZvbGRlcnMgYXJlIHJlYWQ7IHBhZ2VzIGFyZSBuZXZlciB2aXNpdGVkJyxcbiAgICBzdGVwRGVzaWduOiAnRGVzaWduaW5nIGZvbGRlciBzeXN0ZW0nLFxuICAgIHN0ZXBEZXNpZ25EZXNjOiAnQUkgZGVzaWducyBjYXRlZ29yeSBmb2xkZXJzIGZyb20geW91ciBib29rbWFyayBjb250ZW50JyxcbiAgICBzdGVwQXNzaWduOiAnQXNzaWduaW5nIGJvb2ttYXJrcycsXG4gICAgc3RlcEFzc2lnbkRlc2M6ICdGaWxpbmcgZWFjaCBib29rbWFyayBpbnRvIHRoZSBtb3N0IHN1aXRhYmxlIGZvbGRlcicsXG4gICAgc3RlcFZhbGlkYXRlOiAnVmFsaWRhdGluZyByZXN1bHRzJyxcbiAgICBzdGVwVmFsaWRhdGVEZXNjOiAnQ2hlY2tpbmcgZm9sZGVyIGRlcHRoIGFuZCBib29rbWFyayBhc3NpZ25tZW50cycsXG4gICAgc3RlcERvbmU6ICdQbGFuIHJlYWR5JyxcbiAgICBzdGVwRG9uZURlc2M6ICdFbnRlcmluZyBwcmV2aWV3OyBub3RoaW5nIGlzIHdyaXR0ZW4gdW50aWwgeW91IGNvbmZpcm0nLFxuICAgIHRheG9ub215OiAnRGVzaWduaW5nIGZvbGRlciBzeXN0ZW0nLFxuICAgIGFzc2lnbjogJ0Fzc2lnbmluZyBib29rbWFya3MnLFxuICAgIHByaXZhY3k6ICdQcml2YWN5IG5vdGU6IGJvb2ttYXJrIHRpdGxlcywgVVJMcyBhbmQgZm9sZGVyIHBhdGhzIGFyZSBzZW50IHRvIHRoZSBtb2RlbCBzZXJ2aWNlIHlvdSBjb25maWd1cmVkIGZvciBjYXRlZ29yaXphdGlvbi4gVGhpcyBleHRlbnNpb24gaXRzZWxmIGNvbGxlY3RzIG5vdGhpbmcgYW5kIHVwbG9hZHMgbm93aGVyZSBlbHNlLicsXG4gICAgcHJldlN0ZXA6ICfihpAgUHJldmlvdXMnLFxuICB9LFxuICBwcmV2aWV3OiB7XG4gICAgdGl0bGU6ICdQcmV2aWV3IHRoZSBvcmdhbml6ZSBwbGFuJyxcbiAgICBzdWJ0aXRsZTogJ0Jvb2ttYXJrcyBhcmUgdmlldy1vbmx5LiBGb2xkZXJzIG1hcmtlZCDigJxOZXfigJ0gd2lsbCBiZSBjcmVhdGVkLicsXG4gICAgd2lsbE1vdmU6ICdXaWxsIG1vdmUnLFxuICAgIG5ld0ZvbGRlcnM6ICdOZXcgZm9sZGVycycsXG4gICAgY2xlYW51cFNjb3BlOiAnQ2xlYW51cCBzY29wZScsXG4gICAgdHJlZVRpdGxlOiAnQm9va21hcmsgdHJlZSBhZnRlciBvcmdhbml6aW5nJyxcbiAgICBjbGVhbnVwRGVzYzogJ09ubHkgZW1wdHkgZm9sZGVycyB3aXRoaW4gdGhlIHNlbGVjdGVkIHNjb3BlIGFyZSBjbGVhbmVkOyB1bmRvYWJsZSBpbiBvbmUgY2xpY2snLFxuICAgIGJhY2s6ICdCYWNrJyxcbiAgICBhcHBseUFjdGlvbjogJ0FwcGx5IHBsYW4gYW5kIGNsZWFuIGVtcHR5IGZvbGRlcnMgKHtufSBib29rbWFya3MpIOKGkicsXG4gICAgYmFkZ2VOZXc6ICdOZXcnLFxuICAgIHZpZXdPbmx5OiAnQm9va21hcmtzIGFyZSB2aWV3LW9ubHknLFxuICB9LFxuICByZXN1bHQ6IHtcbiAgICB3cml0aW5nVGl0bGU6ICdXcml0aW5nIGJvb2ttYXJrcycsXG4gICAgd3JpdGluZ0Rlc2M6ICdNb3ZpbmcgYm9va21hcmtzIG9uZSBieSBvbmUgYW5kIGNsZWFuaW5nIGVtcHR5IGZvbGRlcnMgaW4gc2NvcGUnLFxuICAgIGRvbmVUaXRsZTogJ09yZ2FuaXplIGNvbXBsZXRlJyxcbiAgICBkb25lRGVzYzogJ1N1Y2Nlc3NmdWxseSBtb3ZlZCB7bn0gYm9va21hcmtzIHRvIG5ldyBmb2xkZXJzJyxcbiAgICB1bmRvbmVUaXRsZTogJ1VuZG9uZScsXG4gICAgdW5kb25lRGVzYzogJ1RoZSBsYXN0IG9yZ2FuaXplIGhhcyBiZWVuIHVuZG9uZSBhbmQgYm9va21hcmtzIHJlc3RvcmVkJyxcbiAgICBpbnRlcnJ1cHRlZFRpdGxlOiAnSW50ZXJydXB0ZWQnLFxuICAgIGludGVycnVwdGVkRGVzYzogJ1lvdSBjYW4gcmVzdW1lIGFwcGx5aW5nIGZyb20gdGhlIGN1cnNvciwgb3IgdW5kbyB3aGF0IGhhcyBiZWVuIGFwcGxpZWQnLFxuICAgIGZhaWxlZFRpdGxlOiAnQXBwbHkgZmFpbGVkJyxcbiAgICBmYWlsZWREZXNjOiAnWW91IGNhbiByZXRyeSBvciB1bmRvJyxcbiAgICBwYXJ0aWFsVW5kb25lVGl0bGU6ICdQYXJ0aWFsbHkgdW5kb25lJyxcbiAgICBwYXJ0aWFsVW5kb25lRGVzYzogJ1VuZG8gcGFydGlhbGx5IHN1Y2NlZWRlZCB3aXRoIGNvbmZsaWN0czsgeW91IGNhbiB0cnkgYWdhaW4nLFxuICAgIHByb2dyZXNzT2Y6ICd7YXBwbGllZH0gLyB7dG90YWx9IGRvbmUnLFxuICAgIHN0YXRDb21wbGV0ZWQ6ICdEb25lJyxcbiAgICBzdGF0UGVuZGluZzogJ1BlbmRpbmcnLFxuICAgIHN0YXRGYWlsZWQ6ICdGYWlsZWQnLFxuICAgIHNuYXBzaG90SGludDogJ0EgcmVzdG9yZSBzbmFwc2hvdCBoYXMgYmVlbiBzYXZlZC4gV2hlbiBmaW5pc2hlZCwgeW91IGNhbiB1bmRvIHRoaXMgb3JnYW5pemUgaW4gb25lIGNsaWNrIGFuZCByZXN0b3JlIGFsbCBib29rbWFya3MgdG8gdGhlaXIgb3JpZ2luYWwgbG9jYXRpb25zLicsXG4gICAgZmFpbHVyZURldGFpbHM6ICdGYWlsdXJlIGRldGFpbHMgKHtufSknLFxuICAgIGludGVycnVwdDogJ0ludGVycnVwdCcsXG4gICAgcmVzdW1lOiAnUmVzdW1lIGZyb20gY3Vyc29yJyxcbiAgICB1bmRvOiAnVW5kbyB0aGlzIG9yZ2FuaXplJyxcbiAgICBzdGFydE92ZXI6ICdTdGFydCBhIG5ldyByb3VuZCcsXG4gIH0sXG4gIGVycm9yczoge1xuICAgIGFib3J0ZWQ6ICdSZXF1ZXN0IGFib3J0ZWQnLFxuICAgIG5ldHdvcms6ICdOZXR3b3JrIHJlcXVlc3QgZmFpbGVkJyxcbiAgICBuZXR3b3JrQ2hlY2tCYXNlVXJsOiAnTmV0d29yayByZXF1ZXN0IGZhaWxlZC4gQ2hlY2sgdGhlIEJhc2UgVVJMIGFuZCB5b3VyIGNvbm5lY3Rpb24nLFxuICAgIHJhdGVMaW1pdGVkOiAnTW9kZWwgcmF0ZS1saW1pdGVkIChIVFRQIDQyOSk7IGF1dG9tYXRpYyByZXRyaWVzIGV4aGF1c3RlZCcsXG4gICAgc2VydmVyRXJyb3I6ICdNb2RlbCBzZXJ2aWNlIGVycm9yIChIVFRQIHtzdGF0dXN9KTsgYXV0b21hdGljIHJldHJpZXMgZXhoYXVzdGVkJyxcbiAgICBhdXRoRmFpbGVkOiAnQVBJIGF1dGhlbnRpY2F0aW9uIGZhaWxlZCAoSFRUUCB7c3RhdHVzfSkuIENoZWNrIHlvdXIgQVBJIEtleScsXG4gICAgaHR0cEVycm9yOiAnTW9kZWwgQVBJIHJldHVybmVkIEhUVFAge3N0YXR1c306IHtkZXRhaWx9JyxcbiAgICBlbXB0eUNvbnRlbnQ6ICdNb2RlbCByZXNwb25zZSBjb250YWluZWQgbm8gY29udGVudCcsXG4gICAgaW52YWxpZEpzb246ICdNb2RlbCByZXNwb25zZSBpcyBub3QgdmFsaWQgSlNPTicsXG4gICAgaW52YWxpZEZvcm1hdDogJ01vZGVsIHJlc3BvbnNlIGRvZXMgbm90IG1hdGNoIHRoZSByZXF1aXJlZCBmb3JtYXQ6IHt3aGF0fScsXG4gICAgbm9DYXRlZ29yaWVzOiAnVGhlIG1vZGVsIHByb2R1Y2VkIG5vIHVzYWJsZSBmb2xkZXJzJyxcbiAgICBjb25zZXJ2YXRpdmVOb0ZvbGRlcnM6ICdJbiBjb25zZXJ2YXRpdmUgbW9kZSwgc29tZSBzZWxlY3RlZCBib29rbWFya3MgaGF2ZSBubyBleGlzdGluZyBmb2xkZXJzIGF2YWlsYWJsZScsXG4gICAgaW52YWxpZEJhc2VVcmw6ICdJbnZhbGlkIEJhc2UgVVJMIGZvcm1hdCcsXG4gICAgaHR0cHNPbmx5OiAnT25seSBIVFRQUyBCYXNlIFVSTHMgYXJlIHN1cHBvcnRlZCcsXG4gICAgc3RvcmFnZVF1b3RhOiAnTm90IGVub3VnaCBsb2NhbCBzdG9yYWdlLiBSZWR1Y2UgdGhlIG9yZ2FuaXplIHNjb3BlIChjaHJvbWUuc3RvcmFnZS5sb2NhbCBxdW90YSBpcyBhYm91dCAxMCBNQiknLFxuICAgIG1lc3NhZ2luZ1VucmVhY2hhYmxlOiAnQ2Fubm90IHJlYWNoIHRoZSBiYWNrZ3JvdW5kIHNlcnZpY2UuIFBsZWFzZSByZW9wZW4gdGhlIGV4dGVuc2lvbiBwYWdlJyxcbiAgICB1bmtub3duUmVzcG9uc2U6ICdUaGUgYmFja2dyb3VuZCBzZXJ2aWNlIHJldHVybmVkIGFuIHVucmVjb2duaXplZCByZXNwb25zZScsXG4gICAgdW5rbm93bkNvbW1hbmQ6ICdVbmtub3duIG9yIGludmFsaWQgY29tbWFuZCcsXG4gICAgam9iTm90Rm91bmQ6ICdKb2Igbm90IGZvdW5kIG9yIGV4cGlyZWQuIFBsZWFzZSBzY2FuIGFnYWluJyxcbiAgICBqb2JFeHBpcmVkOiAnSm9iIG5vdCBmb3VuZCBvciBleHBpcmVkJyxcbiAgICBub1NjYW46ICdObyBzY2FuIHJlc3VsdCBhdmFpbGFibGUuIFBsZWFzZSBzY2FuIGZpcnN0JyxcbiAgICBub1BsYW46ICdObyBvcmdhbml6ZSBwbGFuIGF2YWlsYWJsZS4gUGxlYXNlIGdlbmVyYXRlIGEgcGxhbiBmaXJzdCcsXG4gICAgY2Fubm90QXBwbHlJblN0YXRlOiAnQ2Fubm90IHN0YXJ0IGFwcGx5aW5nIHdoaWxlIGpvYiBzdGF0dXMgaXMge3N0YXR1c30nLFxuICAgIGNhbm5vdFVuZG9JblN0YXRlOiAnQ2Fubm90IHN0YXJ0IHVuZG8gd2hpbGUgam9iIHN0YXR1cyBpcyB7c3RhdHVzfScsXG4gICAgYm9va21hcmtNaXNzaW5nOiAnQm9va21hcmsgbm8gbG9uZ2VyIGV4aXN0czsgc2tpcHBlZCcsXG4gICAgYm9va21hcmtHb25lRHVyaW5nQXBwbHk6ICdCb29rbWFyayB3YXMgZGVsZXRlZCB3aGlsZSBhcHBseWluZycsXG4gICAgY29uc2VydmF0aXZlRm9sZGVyR29uZTogJ1RhcmdldCBmb2xkZXIgZm9yIGNvbnNlcnZhdGl2ZSBtb2RlIG5vIGxvbmdlciBleGlzdHM7IHNraXBwZWQnLFxuICAgIGNsZWFudXBGb2xkZXJGYWlsZWQ6ICdGYWlsZWQgdG8gY2xlYW4gdXAgZW1wdHkgZm9sZGVyIOKAnHt0aXRsZX3igJ06IHttZXNzYWdlfScsXG4gICAgbm90U2Nhbm5lZEVtcHR5Rm9sZGVyOiAnSXRlbXMgdG8gZGVsZXRlIGFyZSBub3QgZW1wdHkgZm9sZGVycyBmcm9tIHRoZSBjdXJyZW50IHNjYW4uIFBsZWFzZSByZS1jaGVjaycsXG4gICAgbm90U2Nhbm5lZER1cGxpY2F0ZTogJ0l0ZW1zIHRvIGRlbGV0ZSBhcmUgbm90IGR1cGxpY2F0ZXMgZnJvbSB0aGUgY3VycmVudCBzY2FuLiBQbGVhc2UgcmUtY2hlY2snLFxuICAgIGtlZXBPbmVQZXJHcm91cDogJ0VhY2ggZHVwbGljYXRlIGdyb3VwIG11c3Qga2VlcCBhdCBsZWFzdCBvbmUgYm9va21hcmsnLFxuICAgIGZvbGRlckFscmVhZHlIYXNCb29rbWFya3M6ICdGb2xkZXIgYWxyZWFkeSBjb250YWlucyBib29rbWFya3M7IHNraXBwZWQnLFxuICAgIGRlbGV0ZUZhaWxlZDogJ0RlbGV0ZSBmYWlsZWQnLFxuICAgIHVuZG9Nb3ZlZEJ5VXNlcjogJ0Jvb2ttYXJrIHdhcyBtb3ZlZCBhZ2FpbiBieSB0aGUgdXNlcjsgc2tpcHBlZCB0byBhdm9pZCBvdmVyd3JpdGluZycsXG4gICAgdW5kb0Jvb2ttYXJrTWlzc2luZzogJ0Jvb2ttYXJrIHdhcyBkZWxldGVkIGFuZCBjYW5ub3QgYmUgcmVzdG9yZWQnLFxuICAgIHVuZG9QYXJlbnRNaXNzaW5nOiAnT3JpZ2luYWwgcGFyZW50IGZvbGRlciBubyBsb25nZXIgZXhpc3RzOyBjYW5ub3QgcmVzdG9yZScsXG4gICAgcmVzdG9yZUZhaWxlZDogJ1Jlc3RvcmUgZmFpbGVkOiB7bWVzc2FnZX0nLFxuICAgIG5vVW5kb1NuYXBzaG90OiAnTm8gdW5kbyBzbmFwc2hvdCBpcyBhdmFpbGFibGUgZm9yIHRoZSBsYXN0IG9yZ2FuaXplJyxcbiAgICB1bmRvSW50ZXJydXB0ZWQ6ICdVbmRvIHdhcyBpbnRlcnJ1cHRlZCBhcyByZXF1ZXN0ZWQ7IHlvdSBjYW4gc3RhcnQgaXQgYWdhaW4nLFxuICAgIHRlc3RQaW5nOiAnUGxlYXNlIHJlcGx5IHdpdGggb2snLFxuICAgIHdoYXRDYW5kaWRhdGVUYXhvbm9teTogJ2NhbmRpZGF0ZSBmb2xkZXIgYmF0Y2gnLFxuICAgIHdoYXRUYXhvbm9teTogJ3RoZSBmb2xkZXIgdGF4b25vbXknLFxuICAgIHdoYXRBc3NpZ25tZW50OiAndGhlIGFzc2lnbm1lbnQgYmF0Y2gnLFxuICAgIGlsbGVnYWxUcmFuc2l0aW9uOiAnSWxsZWdhbCBqb2Igc3RhdGUgdHJhbnNpdGlvbjoge2Zyb219IC0+IHt0b30nLFxuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgZW47XG4iLCJpbXBvcnQgemhDTiBmcm9tICcuL3poLUNOJztcbmltcG9ydCBlbiBmcm9tICcuL2VuJztcbmltcG9ydCB0eXBlIHsgTG9jYWxlLCBNZXNzYWdlcyB9IGZyb20gJy4vdHlwZXMnO1xuXG5leHBvcnQgdHlwZSB7IExvY2FsZSwgTWVzc2FnZXMsIExhbmd1YWdlT3B0aW9uIH0gZnJvbSAnLi90eXBlcyc7XG5cbi8qKiDor63oqIDkuIvmi4npobnvvJvkuI7kuJrliqHpgLvovpHop6PogKbvvIzmj4/ov7DmlofmoYjmiYDlnKjmlofku7bljZXkuIDmnaXmupDjgIIgKi9cbmV4cG9ydCBjb25zdCBTVVBQT1JURURfTE9DQUxFUzogTGFuZ3VhZ2VPcHRpb25bXSA9IFtcbiAgeyB2YWx1ZTogJ3poLUNOJywgc2hvcnRMYWJlbDogJ+S4reaWhycsIG9wdGlvbkxhYmVsOiAn5Lit5paHJyB9LFxuICB7IHZhbHVlOiAnZW4nLCBzaG9ydExhYmVsOiAnRU4nLCBvcHRpb25MYWJlbDogJ0VuZ2xpc2gnIH0sXG5dO1xuXG5jb25zdCBESUNUUzogUmVjb3JkPExvY2FsZSwgTWVzc2FnZXM+ID0ge1xuICAnemgtQ04nOiB6aENOLFxuICBlbixcbn07XG5cbnR5cGUgUGFyYW1WYWx1ZSA9IHN0cmluZyB8IG51bWJlcjtcbmV4cG9ydCB0eXBlIFRyYW5zbGF0ZVBhcmFtcyA9IFJlY29yZDxzdHJpbmcsIFBhcmFtVmFsdWU+O1xuXG5mdW5jdGlvbiBkZXRlY3RMb2NhbGUoKTogTG9jYWxlIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBsYW5nID0gY2hyb21lLmkxOG4uZ2V0VUlMYW5ndWFnZSgpO1xuICAgIHJldHVybiBsYW5nLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCgnemgnKSA/ICd6aC1DTicgOiAnZW4nO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gJ3poLUNOJztcbiAgfVxufVxuXG5sZXQgY3VycmVudExvY2FsZTogTG9jYWxlID0gZGV0ZWN0TG9jYWxlKCk7XG5cbnR5cGUgTG9jYWxlTGlzdGVuZXIgPSAobG9jYWxlOiBMb2NhbGUpID0+IHZvaWQ7XG5jb25zdCBsb2NhbGVMaXN0ZW5lcnMgPSBuZXcgU2V0PExvY2FsZUxpc3RlbmVyPigpO1xuXG5mdW5jdGlvbiBub3RpZnlMb2NhbGVDaGFuZ2UoKTogdm9pZCB7XG4gIGZvciAoY29uc3QgbGlzdGVuZXIgb2YgbG9jYWxlTGlzdGVuZXJzKSB7XG4gICAgbGlzdGVuZXIoY3VycmVudExvY2FsZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2V0Q3VycmVudExvY2FsZShsb2NhbGU6IExvY2FsZSwgc2lsZW50PzogYm9vbGVhbik6IHZvaWQge1xuICBpZiAoY3VycmVudExvY2FsZSA9PT0gbG9jYWxlKSByZXR1cm47XG4gIGN1cnJlbnRMb2NhbGUgPSBsb2NhbGU7XG4gIGlmICghc2lsZW50KSBub3RpZnlMb2NhbGVDaGFuZ2UoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldExvY2FsZSgpOiBMb2NhbGUge1xuICByZXR1cm4gY3VycmVudExvY2FsZTtcbn1cblxuLyoqIOiuoumYheivreiogOWPmOWMlu+8m+i/lOWbnuWPlua2iOiuoumYheWHveaVsOOAgiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9uTG9jYWxlQ2hhbmdlKGxpc3RlbmVyOiBMb2NhbGVMaXN0ZW5lcik6ICgpID0+IHZvaWQge1xuICBsb2NhbGVMaXN0ZW5lcnMuYWRkKGxpc3RlbmVyKTtcbiAgcmV0dXJuICgpID0+IHtcbiAgICBsb2NhbGVMaXN0ZW5lcnMuZGVsZXRlKGxpc3RlbmVyKTtcbiAgfTtcbn1cblxuY29uc3QgTE9DQUxFX1NUT1JBR0VfS0VZID0gJ3RpZHltYXJrcy5sb2NhbGUnO1xuXG5mdW5jdGlvbiBub3JtYWxpemVMb2NhbGUodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IExvY2FsZSB8IHVuZGVmaW5lZCB7XG4gIGlmICghdmFsdWUpIHJldHVybiB1bmRlZmluZWQ7XG4gIGNvbnN0IGxvd2VyID0gdmFsdWUudG9Mb3dlckNhc2UoKTtcbiAgaWYgKGxvd2VyLnN0YXJ0c1dpdGgoJ3poJykpIHJldHVybiAnemgtQ04nO1xuICBpZiAobG93ZXIuc3RhcnRzV2l0aCgnZW4nKSkgcmV0dXJuICdlbic7XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGdldENocm9tZVN0b3JhZ2UoKTogdHlwZW9mIGNocm9tZS5zdG9yYWdlLmxvY2FsIHwgdW5kZWZpbmVkIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gdHlwZW9mIGNocm9tZSAhPT0gJ3VuZGVmaW5lZCcgJiYgY2hyb21lLnN0b3JhZ2UgPyBjaHJvbWUuc3RvcmFnZS5sb2NhbCA6IHVuZGVmaW5lZDtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxufVxuXG4vKiog5byC5q2l5LuOIGNocm9tZS5zdG9yYWdlIOivu+S4gOasoeivreiogOimhueblu+8jOWRveS4reWImeWIh+aNou+8m+WPr+W5guetieiwg+eUqOOAgiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGJvb3RzdHJhcExvY2FsZUZyb21TdG9yYWdlKCk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0Q2hyb21lU3RvcmFnZSgpO1xuICBpZiAoIXN0b3JhZ2UpIHJldHVybjtcbiAgdHJ5IHtcbiAgICBjb25zdCB2YWx1ZXMgPSBhd2FpdCBzdG9yYWdlLmdldChMT0NBTEVfU1RPUkFHRV9LRVkpO1xuICAgIGNvbnN0IHN0b3JlZCA9IG5vcm1hbGl6ZUxvY2FsZSh2YWx1ZXM/LltMT0NBTEVfU1RPUkFHRV9LRVldIGFzIHN0cmluZyB8IHVuZGVmaW5lZCk7XG4gICAgaWYgKHN0b3JlZCkgc2V0Q3VycmVudExvY2FsZShzdG9yZWQpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUud2FybignW2kxOG5dIOivu+WPluivreiogOimhuebluWksei0pScsIGVycm9yKTtcbiAgfVxufVxuXG4vKiog5rC45LmF5YiH5o2i6K+t6KiA77ya5YWI56uL5Y2z55Sf5pWI77yM5YaN5YaZIGNocm9tZS5zdG9yYWdlLmxvY2FsIOaMgeS5heWMluOAgiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldExvY2FsZShsb2NhbGU6IExvY2FsZSk6IFByb21pc2U8dm9pZD4ge1xuICBzZXRDdXJyZW50TG9jYWxlKGxvY2FsZSk7XG4gIGNvbnN0IHN0b3JhZ2UgPSBnZXRDaHJvbWVTdG9yYWdlKCk7XG4gIGlmICghc3RvcmFnZSkgcmV0dXJuO1xuICB0cnkge1xuICAgIGF3YWl0IHN0b3JhZ2Uuc2V0KHsgW0xPQ0FMRV9TVE9SQUdFX0tFWV06IGxvY2FsZSB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLndhcm4oJ1tpMThuXSDmjIHkuYXljJbor63oqIDlpLHotKUnLCBlcnJvcik7XG4gIH1cbn1cblxuLyoqIOa4hemZpOaJi+WKqOivreiogOimhueblu+8jOWbnumAgOWIsOa1j+iniOWZqCBVSSDor63oqIDjgIIgKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXNldExvY2FsZVRvU3lzdGVtKCk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBzdG9yYWdlID0gZ2V0Q2hyb21lU3RvcmFnZSgpO1xuICBpZiAoc3RvcmFnZSkge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBzdG9yYWdlLnJlbW92ZShMT0NBTEVfU1RPUkFHRV9LRVkpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oJ1tpMThuXSDmuIXpmaTor63oqIDopobnm5blpLHotKUnLCBlcnJvcik7XG4gICAgfVxuICB9XG4gIHNldEN1cnJlbnRMb2NhbGUoZGV0ZWN0TG9jYWxlKCkpO1xufVxuXG4vLyDmqKHlnZfliqDovb3lkI7nq4vljbPlvILmraUgYm9vdHN0cmFwIOS4gOasoe+8jFVJIOS8mua4suafk+S4pOasoe+8mummluasoeeUqOa1j+iniOWZqOivreiogO+8jGJvb3RzdHJhcCDliIfliLDmjIHkuYXljJbor63oqIDjgIJcbi8vIOiLpeS4pOiAheS4gOiHtCBzZXRDdXJyZW50TG9jYWxlIOS4jeS8muinpuWPkeebkeWQrOWZqO+8jOWboOatpOaXoOW8gOmUgOOAglxudm9pZCBib290c3RyYXBMb2NhbGVGcm9tU3RvcmFnZSgpO1xuXG4vKiog5LuF5rWL6K+V5L2/55So77ya5YiH5o2i6K+t6KiA5bm26L+U5Zue6L+Y5Y6f5Ye95pWw44CCICovXG5leHBvcnQgZnVuY3Rpb24gc2V0TG9jYWxlRm9yVGVzdGluZyhsb2NhbGU6IExvY2FsZSk6ICgpID0+IHZvaWQge1xuICBjb25zdCBwcmV2aW91cyA9IGN1cnJlbnRMb2NhbGU7XG4gIGN1cnJlbnRMb2NhbGUgPSBsb2NhbGU7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgY3VycmVudExvY2FsZSA9IHByZXZpb3VzO1xuICB9O1xufVxuXG50eXBlIFBhdGg8VCwgUHJlZml4IGV4dGVuZHMgc3RyaW5nID0gJyc+ID0ge1xuICBbSyBpbiBrZXlvZiBUICYgc3RyaW5nXTogVFtLXSBleHRlbmRzIHN0cmluZ1xuICAgID8gYCR7UHJlZml4fSR7S31gXG4gICAgOiBQYXRoPFRbS10sIGAke1ByZWZpeH0ke0t9LmA+O1xufVtrZXlvZiBUICYgc3RyaW5nXTtcblxuZXhwb3J0IHR5cGUgTWVzc2FnZUtleSA9IFBhdGg8TWVzc2FnZXM+O1xuXG5mdW5jdGlvbiBpbnRlcnBvbGF0ZSh0ZW1wbGF0ZTogc3RyaW5nLCBwYXJhbXM/OiBUcmFuc2xhdGVQYXJhbXMpOiBzdHJpbmcge1xuICBpZiAoIXBhcmFtcykgcmV0dXJuIHRlbXBsYXRlO1xuICByZXR1cm4gdGVtcGxhdGUucmVwbGFjZSgvXFx7KFxcdyspXFx9L2csIChtYXRjaCwga2V5OiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCB2YWx1ZSA9IHBhcmFtc1trZXldO1xuICAgIHJldHVybiB2YWx1ZSA9PT0gdW5kZWZpbmVkID8gbWF0Y2ggOiBTdHJpbmcodmFsdWUpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gbG9va3VwKGRpY3Q6IE1lc3NhZ2VzLCBrZXk6IE1lc3NhZ2VLZXkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBsZXQgbm9kZTogdW5rbm93biA9IGRpY3Q7XG4gIGZvciAoY29uc3QgcGFydCBvZiBrZXkuc3BsaXQoJy4nKSkge1xuICAgIGlmIChub2RlID09PSBudWxsIHx8IHR5cGVvZiBub2RlICE9PSAnb2JqZWN0JykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICBub2RlID0gKG5vZGUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW3BhcnRdO1xuICB9XG4gIHJldHVybiB0eXBlb2Ygbm9kZSA9PT0gJ3N0cmluZycgPyBub2RlIDogdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIOaMieW9k+WJjeivreiogOWPluaWh+ahiO+8jOaUr+aMgSB7bmFtZX0g5Y2g5L2N56ym44CCXG4gKiDnvLrlpLHplK7ml7blm57pgIDnroDkvZPkuK3mloflubblkYrorabvvIzpgb/lhY3nlYzpnaLlh7rnjrDnqbrnmb3jgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHQoa2V5OiBNZXNzYWdlS2V5LCBwYXJhbXM/OiBUcmFuc2xhdGVQYXJhbXMpOiBzdHJpbmcge1xuICBjb25zdCBoaXQgPSBsb29rdXAoRElDVFNbY3VycmVudExvY2FsZV0sIGtleSk7XG4gIGlmIChoaXQgIT09IHVuZGVmaW5lZCkgcmV0dXJuIGludGVycG9sYXRlKGhpdCwgcGFyYW1zKTtcbiAgY29uc3QgZmFsbGJhY2sgPSBsb29rdXAoRElDVFNbJ3poLUNOJ10sIGtleSk7XG4gIGlmIChmYWxsYmFjayAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc29sZS53YXJuKGBbaTE4bl0gbWlzc2luZyBrZXkgXCIke2tleX1cIiBmb3IgbG9jYWxlIFwiJHtjdXJyZW50TG9jYWxlfVwiLCBmYWxsYmFjayB0byB6aC1DTmApO1xuICAgIHJldHVybiBpbnRlcnBvbGF0ZShmYWxsYmFjaywgcGFyYW1zKTtcbiAgfVxuICBjb25zb2xlLndhcm4oYFtpMThuXSBtaXNzaW5nIGtleSBcIiR7a2V5fVwiYCk7XG4gIHJldHVybiBrZXk7XG59XG4iLCJpbXBvcnQgeyB0IH0gZnJvbSAnLi4vLi4vc2hhcmVkL2kxOG4nO1xuaW1wb3J0IHR5cGUgeyBKb2JTdGF0dXMgfSBmcm9tICcuLi8uLi9zaGFyZWQvc2NoZW1hcyc7XG5cbi8qKlxuICog5Lu75Yqh54q25oCB5py677yI5p625p6E5pa55qGI56ysIDUg6IqC77yJ44CCXG4gKiBmYWlsZWQg5LmL5ZCO5YWB6K646YeN5paw5byA5aeL5omr5o+P77yM5Lmf5YWB6K645LuO5oyB5LmF5YyW5ri45qCH6YeN6K+V5aSx6LSl55qE5bqU55So77yITVZQIOaJp+ihjOe7k+aenOmhteeahOKAnOmHjeivleKAneWFpeWPo++8ie+8m1xuICogdW5kb25lL3BhcnRpYWxseV91bmRvbmUg5Li657uI5oCB5oiW5YWB6K646YeN6K+V5pKk6ZSA44CCXG4gKi9cbmNvbnN0IFRSQU5TSVRJT05TOiBSZWFkb25seTxSZWNvcmQ8Sm9iU3RhdHVzLCByZWFkb25seSBKb2JTdGF0dXNbXT4+ID0ge1xuICBpZGxlOiBbJ3NjYW5uaW5nJ10sXG4gIHNjYW5uaW5nOiBbJ3BsYW5uaW5nJywgJ2ZhaWxlZCddLFxuICBwbGFubmluZzogWydjbGFzc2lmeWluZycsICdmYWlsZWQnXSxcbiAgY2xhc3NpZnlpbmc6IFsncmV2aWV3aW5nJywgJ2ZhaWxlZCddLFxuICByZXZpZXdpbmc6IFsnYXBwbHlpbmcnLCAnc2Nhbm5pbmcnXSxcbiAgYXBwbHlpbmc6IFsnY29tcGxldGVkJywgJ2ludGVycnVwdGVkJywgJ2ZhaWxlZCddLFxuICBpbnRlcnJ1cHRlZDogWydhcHBseWluZycsICd1bmRvaW5nJ10sXG4gIGNvbXBsZXRlZDogWyd1bmRvaW5nJ10sXG4gIHVuZG9pbmc6IFsndW5kb25lJywgJ3BhcnRpYWxseV91bmRvbmUnLCAnZmFpbGVkJ10sXG4gIHVuZG9uZTogWydzY2FubmluZyddLFxuICBwYXJ0aWFsbHlfdW5kb25lOiBbJ3VuZG9pbmcnLCAnc2Nhbm5pbmcnXSxcbiAgZmFpbGVkOiBbJ3NjYW5uaW5nJywgJ2FwcGx5aW5nJ10sXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gY2FuVHJhbnNpdGlvbihmcm9tOiBKb2JTdGF0dXMsIHRvOiBKb2JTdGF0dXMpOiBib29sZWFuIHtcbiAgcmV0dXJuIFRSQU5TSVRJT05TW2Zyb21dLmluY2x1ZGVzKHRvKTtcbn1cblxuZXhwb3J0IGNsYXNzIElsbGVnYWxUcmFuc2l0aW9uRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHJlYWRvbmx5IGZyb206IEpvYlN0YXR1cyxcbiAgICByZWFkb25seSB0bzogSm9iU3RhdHVzLFxuICApIHtcbiAgICBzdXBlcih0KCdlcnJvcnMuaWxsZWdhbFRyYW5zaXRpb24nLCB7IGZyb20sIHRvIH0pKTtcbiAgICB0aGlzLm5hbWUgPSAnSWxsZWdhbFRyYW5zaXRpb25FcnJvcic7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFzc2VydFRyYW5zaXRpb24oZnJvbTogSm9iU3RhdHVzLCB0bzogSm9iU3RhdHVzKTogdm9pZCB7XG4gIGlmICghY2FuVHJhbnNpdGlvbihmcm9tLCB0bykpIHtcbiAgICB0aHJvdyBuZXcgSWxsZWdhbFRyYW5zaXRpb25FcnJvcihmcm9tLCB0byk7XG4gIH1cbn1cblxuLyoqIOWQjOS4gOaXtumXtOWPquWFgeiuuOS4gOS4quS8muS/ruaUueS5puetvueahOS7u+WKoe+8mui/meS4pOS4queKtuaAgeacn+mXtOaLkue7neaWsOeahOW6lOeUqOivt+axguOAgiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzV3JpdGVMb2NrZWQoc3RhdHVzOiBKb2JTdGF0dXMpOiBib29sZWFuIHtcbiAgcmV0dXJuIHN0YXR1cyA9PT0gJ2FwcGx5aW5nJyB8fCBzdGF0dXMgPT09ICd1bmRvaW5nJztcbn1cbiIsImltcG9ydCB0eXBlIHsgQm9va21hcmtzUG9ydCwgRXZlbnRzUG9ydCwgU3RvcmFnZVBvcnQgfSBmcm9tICcuL3BvcnRzJztcbmltcG9ydCB7IGJ1aWxkU2NhblJlc3VsdCB9IGZyb20gJy4uL2RvbWFpbi9ib29rbWFya3MvdHJlZSc7XG5pbXBvcnQgeyBhc3NlcnRUcmFuc2l0aW9uIH0gZnJvbSAnLi4vZG9tYWluL29yZ2FuaXplL3N0YXRlTWFjaGluZSc7XG5pbXBvcnQgdHlwZSB7IEpvYlN0YXRlLCBTY2FuUmVzdWx0IH0gZnJvbSAnLi4vc2hhcmVkL3NjaGVtYXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjYW5EZXBzIHtcbiAgYm9va21hcmtzOiBCb29rbWFya3NQb3J0O1xuICBzdG9yYWdlOiBTdG9yYWdlUG9ydDtcbiAgZXZlbnRzPzogRXZlbnRzUG9ydDtcbiAgbm93PzogKCkgPT4gbnVtYmVyO1xuICBuZXdJZD86ICgpID0+IHN0cmluZztcbn1cblxuLyoqXG4gKiDmiavmj4/mlbTmo7Xkuabnrb7moJHlubbmjIHkuYXljJbkuIDmrKHkuIDoh7TnmoTnu5PmnpzjgIJcbiAqIOeUsSBTZXJ2aWNlIFdvcmtlciDosIPnlKjvvJtEYXNoYm9hcmQg6YCa6L+H5raI5oGv6Kem5Y+R44CCXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzY2FuQm9va21hcmtzKGRlcHM6IFNjYW5EZXBzLCBqb2I6IEpvYlN0YXRlKTogUHJvbWlzZTxTY2FuUmVzdWx0PiB7XG4gIGNvbnN0IHsgc3RvcmFnZSwgYm9va21hcmtzLCBldmVudHMgfSA9IGRlcHM7XG4gIGNvbnN0IG5vdyA9IGRlcHMubm93ID8/ICgoKSA9PiBEYXRlLm5vdygpKTtcbiAgY29uc3QgbmV3SWQgPSBkZXBzLm5ld0lkID8/ICgoKSA9PiBjcnlwdG8ucmFuZG9tVVVJRCgpKTtcblxuICBhc3NlcnRUcmFuc2l0aW9uKGpvYi5zdGF0dXMsICdzY2FubmluZycpO1xuICBjb25zdCB3b3JraW5nOiBKb2JTdGF0ZSA9IHsgLi4uam9iLCBzdGF0dXM6ICdzY2FubmluZycsIHVwZGF0ZWRBdDogbm93KCkgfTtcbiAgYXdhaXQgc3RvcmFnZS5zYXZlSm9iKHdvcmtpbmcpO1xuXG4gIGNvbnN0IHRyZWUgPSBhd2FpdCBib29rbWFya3MuZ2V0VHJlZSgpO1xuICBjb25zdCBzY2FuID0gYnVpbGRTY2FuUmVzdWx0KHRyZWUsIG5ld0lkKCksIG5vdygpKTtcbiAgYXdhaXQgc3RvcmFnZS5zYXZlU2NhbihzY2FuKTtcblxuICBjb25zdCBkb25lOiBKb2JTdGF0ZSA9IHsgLi4ud29ya2luZywgc3RhdHVzOiAncGxhbm5pbmcnLCB1cGRhdGVkQXQ6IG5vdygpIH07XG4gIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYihkb25lKTtcbiAgZXZlbnRzPy5wcm9ncmVzcyhkb25lLmpvYklkLCBkb25lLnN0YXR1cywgc2Nhbi5ib29rbWFya3MubGVuZ3RoLCBzY2FuLmJvb2ttYXJrcy5sZW5ndGgpO1xuICByZXR1cm4gc2Nhbjtcbn1cbiIsImltcG9ydCB7IHQsIHR5cGUgTWVzc2FnZUtleSwgdHlwZSBUcmFuc2xhdGVQYXJhbXMgfSBmcm9tICcuL2kxOG4nO1xuXG4vKipcbiAqIOWPr+WxleekuueahOmUmeivr+WIhuexu+OAglxuICog5rOo5oSP77yaZXJyb3JLaW5kIOaemuS4vuW/hemhu+S4jiBkb2NzL+aKgOacr+aetuaehOaWueahiCDnrKwgNSDoioLnmoTlpLHotKXpobnor63kuYnkv53mjIHkuIDoh7TvvIxcbiAqIOS4lOS7u+S9leWIhuaUr+mDveS4jeW+l+aQuuW4piBBUEkgS2V5IOetieaVj+aEn+S/oeaBr+OAglxuICovXG5leHBvcnQgY29uc3QgRVJST1JfS0lORFMgPSBbXG4gICdub3RfY29uZmlndXJlZCcsXG4gICduZXR3b3JrJyxcbiAgJ3JhdGVfbGltaXRlZCcsXG4gICdpbnZhbGlkX3Jlc3BvbnNlJyxcbiAgJ3ZhbGlkYXRpb24nLFxuICAncGVybWlzc2lvbicsXG4gICdzdG9yYWdlX3F1b3RhJyxcbiAgJ3VzZXJfY29uZmxpY3QnLFxuICAnYWJvcnRlZCcsXG4gICd1bmtub3duJyxcbl0gYXMgY29uc3Q7XG5cbmV4cG9ydCB0eXBlIEVycm9yS2luZCA9ICh0eXBlb2YgRVJST1JfS0lORFMpW251bWJlcl07XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2xhc3NpZmllZEVycm9yIHtcbiAga2luZDogRXJyb3JLaW5kO1xuICBtZXNzYWdlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBBcHBFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgcmVhZG9ubHkga2luZDogRXJyb3JLaW5kO1xuICByZWFkb25seSBpMThuS2V5OiBNZXNzYWdlS2V5O1xuICByZWFkb25seSBwYXJhbXM/OiBUcmFuc2xhdGVQYXJhbXM7XG5cbiAgY29uc3RydWN0b3Ioa2luZDogRXJyb3JLaW5kLCBpMThuS2V5OiBNZXNzYWdlS2V5LCBwYXJhbXM/OiBUcmFuc2xhdGVQYXJhbXMpIHtcbiAgICBzdXBlcih0KGkxOG5LZXksIHBhcmFtcykpO1xuICAgIHRoaXMubmFtZSA9ICdBcHBFcnJvcic7XG4gICAgdGhpcy5raW5kID0ga2luZDtcbiAgICB0aGlzLmkxOG5LZXkgPSBpMThuS2V5O1xuICAgIHRoaXMucGFyYW1zID0gcGFyYW1zO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0FwcEVycm9yKGVycm9yOiB1bmtub3duKTogZXJyb3IgaXMgQXBwRXJyb3Ige1xuICByZXR1cm4gZXJyb3IgaW5zdGFuY2VvZiBBcHBFcnJvcjtcbn1cblxuLyoqIOWwhuS7u+aEj+W8guW4uOW9kuS4gOWMluS4uuWPr+WxleekuumUmeivr++8jOmBv+WFjeWQkeS4iuWxguaKm+WHuuWOn+Wni+WvueixoeOAgiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsYXNzaWZ5RXJyb3IoZXJyb3I6IHVua25vd24pOiBDbGFzc2lmaWVkRXJyb3Ige1xuICBpZiAoaXNBcHBFcnJvcihlcnJvcikpIHtcbiAgICByZXR1cm4geyBraW5kOiBlcnJvci5raW5kLCBtZXNzYWdlOiBlcnJvci5tZXNzYWdlIH07XG4gIH1cbiAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICByZXR1cm4geyBraW5kOiAndW5rbm93bicsIG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UgfTtcbiAgfVxuICByZXR1cm4geyBraW5kOiAndW5rbm93bicsIG1lc3NhZ2U6IFN0cmluZyhlcnJvcikgfTtcbn1cbiIsImltcG9ydCB0eXBlIHsgQm9va21hcmtzUG9ydCwgRXZlbnRzUG9ydCwgU3RvcmFnZVBvcnQgfSBmcm9tICcuL3BvcnRzJztcbmltcG9ydCB7IGFzc2VydFRyYW5zaXRpb24sIGlzV3JpdGVMb2NrZWQgfSBmcm9tICcuLi9kb21haW4vb3JnYW5pemUvc3RhdGVNYWNoaW5lJztcbmltcG9ydCB7IGlzVW5tb2RpZmlhYmxlLCB0eXBlIEJvb2ttYXJrTm9kZSB9IGZyb20gJy4uL2RvbWFpbi9ib29rbWFya3MvdHlwZXMnO1xuaW1wb3J0IHsgQXBwRXJyb3IsIGNsYXNzaWZ5RXJyb3IgfSBmcm9tICcuLi9zaGFyZWQvZXJyb3JzJztcbmltcG9ydCB7IHQgfSBmcm9tICcuLi9zaGFyZWQvaTE4bic7XG5pbXBvcnQgdHlwZSB7XG4gIEFzc2lnbm1lbnQsXG4gIERlbGV0ZWRGb2xkZXIsXG4gIEZhaWx1cmVJdGVtLFxuICBKb2JTdGF0ZSxcbiAgU2Nhbm5lZEJvb2ttYXJrLFxuICBVbmRvTW92ZSxcbiAgVW5kb1NuYXBzaG90LFxufSBmcm9tICcuLi9zaGFyZWQvc2NoZW1hcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXBwbHlEZXBzIHtcbiAgYm9va21hcmtzOiBCb29rbWFya3NQb3J0O1xuICBzdG9yYWdlOiBTdG9yYWdlUG9ydDtcbiAgZXZlbnRzPzogRXZlbnRzUG9ydDtcbiAgbm93PzogKCkgPT4gbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFwcGx5UmVzdWx0IHtcbiAgam9iOiBKb2JTdGF0ZTtcbiAgYXBwbGllZElkczogc3RyaW5nW107XG4gIGZhaWx1cmVzOiBGYWlsdXJlSXRlbVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFwcGx5UGxhbk9wdGlvbnMge1xuICAvKiog5L+d5a6I5qih5byP5YWz6Zet55uu5b2V5Yib5bu677yb55uu5qCH55uu5b2V5bey5LiN5a2Y5Zyo5pe25Y+q6Lez6L+H5a+55bqU5Lmm562+44CCICovXG4gIGNyZWF0ZU1pc3NpbmdGb2xkZXJzPzogYm9vbGVhbjtcbiAgLyoqIOWPquaciei/meS6m+WOn+aWh+S7tuWkueWFgeiuuOWcqOWPmOepuuWQjuiiq+a4heeQhuOAgiAqL1xuICBjbGVhbnVwRm9sZGVySWRzPzogc3RyaW5nW107XG59XG5cbmludGVyZmFjZSBSZXNvbHZlZFRhcmdldCB7XG4gIHJvb3RJZDogc3RyaW5nO1xuICAvKiog55uu5qCH5Y+25a2Q55uu5b2VIElE44CCICovXG4gIGZvbGRlcklkOiBzdHJpbmc7XG59XG5cbi8qKlxuICog5LiA6ZSu5bqU55So77yI5p625p6E5pa55qGI56ysIDgg6IqC77yJ44CCU2VydmljZSBXb3JrZXIg5piv5ZSv5LiA6LCD55So5YWl5Y+j44CCXG4gKlxuICog6aG65bqP77yaXG4gKiAxLiDlu7rnq4vku7vliqHplIHvvIhhcHBseWluZ++8ie+8m1xuICogMi4g5Z+65LqO5pyA5paw5Lmm562+54q25oCB5p6E5bu65pKk6ZSA5b+r54Wn77yI5q+P5p2h5b6F56e75Yqo5Lmm562+55qEIGlkIC8gcGFyZW50SWQgLyBpbmRleO+8ie+8m1xuICogMy4g5oyJ6Lev5b6E6YCQ57qn6Kej5p6Q5oiW5Yib5bu655uu5b2V77yI5oyJIHBhcmVudElkICsgdGl0bGUg5p+l5om+5L+d6K+B5bmC562J77yJ77ybXG4gKiA0LiDpobrluo8gbW92Ze+8jOavj+adoeaIkOWKn+WNs+abtOaWsOa4uOagh+S4jiBhcHBsaWVkSWRz77yb5Y2V5p2h5aSx6LSl5YWl5YiX57un57ut77ybXG4gKiA1LiDku47mt7HliLDmtYXmuIXnkIbnlKjmiLfpgInkuK3ojIPlm7TlhoXnmoTnqbrnm67lvZXvvJtcbiAqIDYuIOWujOaIkOe9riBjb21wbGV0ZWQg5bm25bGV56S65aSx6LSl5LiO6YeN6K+V5YWl5Y+j44CCXG4gKlxuICog5Lit5pat5oGi5aSN77ya5ZCM5LiAIGpvYklkIOmHjeWkjei/m+WFpeaXtui3s+i/h+W3siBhcHBsaWVkIOeahOS5puetvu+8jOS7juaMgeS5heWMlua4uOagh+e7p+e7reOAglxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXBwbHlQbGFuKFxuICBkZXBzOiBBcHBseURlcHMsXG4gIGpvYjogSm9iU3RhdGUsXG4gIGJvb2ttYXJrczogU2Nhbm5lZEJvb2ttYXJrW10sXG4gIGFzc2lnbm1lbnRzOiBBc3NpZ25tZW50W10sXG4gIG9wdGlvbnM6IEFwcGx5UGxhbk9wdGlvbnMgPSB7fSxcbik6IFByb21pc2U8QXBwbHlSZXN1bHQ+IHtcbiAgY29uc3QgeyBzdG9yYWdlLCBldmVudHMgfSA9IGRlcHM7XG4gIGNvbnN0IG5vdyA9IGRlcHMubm93ID8/ICgoKSA9PiBEYXRlLm5vdygpKTtcbiAgY29uc3QgY3JlYXRlTWlzc2luZ0ZvbGRlcnMgPSBvcHRpb25zLmNyZWF0ZU1pc3NpbmdGb2xkZXJzID8/IHRydWU7XG4gIGNvbnN0IGNsZWFudXBGb2xkZXJJZHMgPSBuZXcgU2V0KG9wdGlvbnMuY2xlYW51cEZvbGRlcklkcyA/PyBbXSk7XG5cbiAgaWYgKGlzV3JpdGVMb2NrZWQoam9iLnN0YXR1cykgJiYgam9iLnN0YXR1cyAhPT0gJ2FwcGx5aW5nJykge1xuICAgIC8vIHVuZG9pbmcg5pyf6Ze05ouS57ud5paw55qE5bqU55So6K+35rGC44CCXG4gICAgdGhyb3cgbmV3IEFwcEVycm9yKCd1c2VyX2NvbmZsaWN0JywgJ2Vycm9ycy5jYW5ub3RBcHBseUluU3RhdGUnLCB7IHN0YXR1czogam9iLnN0YXR1cyB9KTtcbiAgfVxuICBpZiAoam9iLnN0YXR1cyAhPT0gJ2FwcGx5aW5nJykge1xuICAgIGFzc2VydFRyYW5zaXRpb24oam9iLnN0YXR1cywgJ2FwcGx5aW5nJyk7XG4gIH1cblxuICBjb25zdCBieUlkID0gbmV3IE1hcChib29rbWFya3MubWFwKChiKSA9PiBbYi5pZCwgYl0gYXMgY29uc3QpKTtcbiAgY29uc3Qgb3JkZXJlZDogQXJyYXk8eyBib29rbWFyazogU2Nhbm5lZEJvb2ttYXJrOyBhc3NpZ25tZW50OiBBc3NpZ25tZW50IH0+ID0gW107XG4gIGZvciAoY29uc3QgYXNzaWdubWVudCBvZiBhc3NpZ25tZW50cykge1xuICAgIGNvbnN0IGJvb2ttYXJrID0gYnlJZC5nZXQoYXNzaWdubWVudC5ib29rbWFya0lkKTtcbiAgICBpZiAoYm9va21hcmspIG9yZGVyZWQucHVzaCh7IGJvb2ttYXJrLCBhc3NpZ25tZW50IH0pO1xuICB9XG5cbiAgbGV0IHdvcmtpbmc6IEpvYlN0YXRlID0ge1xuICAgIC4uLmpvYixcbiAgICBzdGF0dXM6ICdhcHBseWluZycsXG4gICAgdXBkYXRlZEF0OiBub3coKSxcbiAgICBmYWlsdXJlczogam9iLnN0YXR1cyA9PT0gJ2FwcGx5aW5nJyA/IGpvYi5mYWlsdXJlcyA6IFtdLFxuICB9O1xuICBhd2FpdCBzdG9yYWdlLnNhdmVKb2Iod29ya2luZyk7XG5cbiAgLy8gLS0tLSAxLiDlupTnlKjliY3ph43mlrDor7vlj5bnm7jlhbPkuabnrb7vvIzkuI3og73kv6Hku7vmiavmj4/pmLbmrrXnmoTml6fkvY3nva4gLS0tLVxuICBjb25zdCBmcmVzaCA9IG5ldyBNYXA8c3RyaW5nLCB7IHBhcmVudElkOiBzdHJpbmc7IGluZGV4OiBudW1iZXIgfT4oKTtcbiAgY29uc3QgbWlzc2luZyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHsgYm9va21hcmsgfSBvZiBvcmRlcmVkKSB7XG4gICAgaWYgKHdvcmtpbmcuYXBwbGllZElkcy5pbmNsdWRlcyhib29rbWFyay5pZCkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IG5vZGUgPSBhd2FpdCBkZXBzLmJvb2ttYXJrcy5nZXQoYm9va21hcmsuaWQpO1xuICAgIGlmICghbm9kZSB8fCBub2RlLnVybCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBtaXNzaW5nLmFkZChib29rbWFyay5pZCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgZnJlc2guc2V0KGJvb2ttYXJrLmlkLCB7IHBhcmVudElkOiBub2RlLnBhcmVudElkID8/ICcnLCBpbmRleDogbm9kZS5pbmRleCA/PyAwIH0pO1xuICB9XG5cbiAgY29uc3QgZXhpc3RpbmdGYWlsdXJlczogRmFpbHVyZUl0ZW1bXSA9IHdvcmtpbmcuZmFpbHVyZXMuZmlsdGVyKChmKSA9PiBmLmJvb2ttYXJrSWQgPT09IHVuZGVmaW5lZCk7XG4gIGZvciAoY29uc3QgaWQgb2YgbWlzc2luZykge1xuICAgIGV4aXN0aW5nRmFpbHVyZXMucHVzaCh7IGJvb2ttYXJrSWQ6IGlkLCBraW5kOiAndmFsaWRhdGlvbicsIG1lc3NhZ2U6IHQoJ2Vycm9ycy5ib29rbWFya01pc3NpbmcnKSB9KTtcbiAgfVxuICB3b3JraW5nID0geyAuLi53b3JraW5nLCBmYWlsdXJlczogZXhpc3RpbmdGYWlsdXJlcyB9O1xuXG4gIC8vIC0tLS0gMi4g5bu656uL5pKk6ZSA5b+r54Wn77yI5LuF5YyF5ZCr5bCa5pyq5bqU55So55qE56e75Yqo77yb5bey5bqU55So6YOo5YiG5L+d55WZ5ZyoIHVuZG86bGF0ZXN0IOS4re+8iSAtLS0tXG4gIGNvbnN0IHVuZG9FeGlzdGluZyA9IGF3YWl0IHN0b3JhZ2UubG9hZFVuZG8oKTtcbiAgY29uc3QgbW92ZXM6IFVuZG9Nb3ZlW10gPVxuICAgIHVuZG9FeGlzdGluZyAmJiB1bmRvRXhpc3Rpbmcuam9iSWQgPT09IGpvYi5qb2JJZCA/IFsuLi51bmRvRXhpc3RpbmcubW92ZXNdIDogW107XG4gIGNvbnN0IGtub3duTW92ZUlkcyA9IG5ldyBTZXQobW92ZXMubWFwKChtKSA9PiBtLmJvb2ttYXJrSWQpKTtcbiAgZm9yIChjb25zdCB7IGJvb2ttYXJrIH0gb2Ygb3JkZXJlZCkge1xuICAgIGlmICh3b3JraW5nLmFwcGxpZWRJZHMuaW5jbHVkZXMoYm9va21hcmsuaWQpKSBjb250aW51ZTtcbiAgICBpZiAoa25vd25Nb3ZlSWRzLmhhcyhib29rbWFyay5pZCkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IHBvcyA9IGZyZXNoLmdldChib29rbWFyay5pZCk7XG4gICAgaWYgKCFwb3MpIGNvbnRpbnVlO1xuICAgIG1vdmVzLnB1c2goe1xuICAgICAgYm9va21hcmtJZDogYm9va21hcmsuaWQsXG4gICAgICBmcm9tUGFyZW50SWQ6IHBvcy5wYXJlbnRJZCxcbiAgICAgIGZyb21JbmRleDogcG9zLmluZGV4LFxuICAgICAgdG9Gb2xkZXJJZDogJycsIC8vIOino+aekOebruagh+ebruW9leWQjuWbnuWhq1xuICAgIH0pO1xuICB9XG5cbiAgLy8gLS0tLSAzLiDop6PmnpDmiJbliJvlu7rnm67moIfnm67lvZUgLS0tLVxuICAvLyDmg7DmgKfmjInpnIDor7vlj5bnm67lvZXnu5PmnoTvvJpnZXRDaGlsZHJlbihwYXJlbnRJZCkgKyDnvJPlrZjvvIzpgb/lhY3mr4/mrKHlhajmoJHmiavmj4/jgIJcbiAgY29uc3QgY2hpbGRyZW5CeVBhcmVudCA9IG5ldyBNYXA8c3RyaW5nLCBCb29rbWFya05vZGVbXT4oKTtcblxuICBjb25zdCBjcmVhdGVkRm9sZGVycyA9XG4gICAgdW5kb0V4aXN0aW5nICYmIHVuZG9FeGlzdGluZy5qb2JJZCA9PT0gam9iLmpvYklkID8gWy4uLnVuZG9FeGlzdGluZy5jcmVhdGVkRm9sZGVyc10gOiBbXTtcbiAgY29uc3QgY3JlYXRlZElkcyA9IG5ldyBTZXQoY3JlYXRlZEZvbGRlcnMubWFwKChmKSA9PiBmLmlkKSk7XG4gIGNvbnN0IGZvbGRlckNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTsgLy8gYCR7cm9vdElkfXwke3BhdGguam9pbignLycpfWAgLT4gZm9sZGVySWRcblxuICBjb25zdCByZXNvbHZlRm9sZGVyID0gYXN5bmMgKHJvb3RJZDogc3RyaW5nLCBwYXRoOiBzdHJpbmdbXSk6IFByb21pc2U8UmVzb2x2ZWRUYXJnZXQgfCBudWxsPiA9PiB7XG4gICAgY29uc3Qga2V5ID0gYCR7cm9vdElkfXwke3BhdGgubWFwKChzKSA9PiBzLnRvTG93ZXJDYXNlKCkpLmpvaW4oJyAnKX1gO1xuICAgIGNvbnN0IGNhY2hlZCA9IGZvbGRlckNhY2hlLmdldChrZXkpO1xuICAgIGlmIChjYWNoZWQpIHJldHVybiB7IHJvb3RJZCwgZm9sZGVySWQ6IGNhY2hlZCB9O1xuXG4gICAgbGV0IHBhcmVudElkID0gcm9vdElkO1xuICAgIGxldCBkZXB0aCA9IDA7XG4gICAgZm9yIChjb25zdCBzZWdtZW50IG9mIHBhdGgpIHtcbiAgICAgIGRlcHRoICs9IDE7XG4gICAgICBjb25zdCBjaGlsZHJlbiA9IGNoaWxkcmVuQnlQYXJlbnQuZ2V0KHBhcmVudElkKSA/PyAoYXdhaXQgZGVwcy5ib29rbWFya3MuZ2V0Q2hpbGRyZW4ocGFyZW50SWQpKTtcbiAgICAgIGNoaWxkcmVuQnlQYXJlbnQuc2V0KHBhcmVudElkLCBjaGlsZHJlbik7XG4gICAgICBjb25zdCBoaXQgPSBjaGlsZHJlbi5maW5kKFxuICAgICAgICAoYykgPT4gYy51cmwgPT09IHVuZGVmaW5lZCAmJiBjLnRpdGxlLnRvTG93ZXJDYXNlKCkgPT09IHNlZ21lbnQudG9Mb3dlckNhc2UoKSxcbiAgICAgICk7XG4gICAgICBpZiAoaGl0KSB7XG4gICAgICAgIHBhcmVudElkID0gaGl0LmlkO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCFjcmVhdGVNaXNzaW5nRm9sZGVycykgcmV0dXJuIG51bGw7XG4gICAgICAgIGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBkZXBzLmJvb2ttYXJrcy5jcmVhdGVGb2xkZXIocGFyZW50SWQsIHNlZ21lbnQpO1xuICAgICAgICBjb25zdCBub2RlOiBCb29rbWFya05vZGUgPSB7IGlkOiBjcmVhdGVkLmlkLCBwYXJlbnRJZCwgdGl0bGU6IHNlZ21lbnQgfTtcbiAgICAgICAgY2hpbGRyZW5CeVBhcmVudC5zZXQoY3JlYXRlZC5pZCwgW10pO1xuICAgICAgICBjb25zdCBzaWJsaW5ncyA9IGNoaWxkcmVuQnlQYXJlbnQuZ2V0KHBhcmVudElkKSA/PyBbXTtcbiAgICAgICAgc2libGluZ3MucHVzaChub2RlKTtcbiAgICAgICAgY2hpbGRyZW5CeVBhcmVudC5zZXQocGFyZW50SWQsIHNpYmxpbmdzKTtcbiAgICAgICAgaWYgKCFjcmVhdGVkSWRzLmhhcyhjcmVhdGVkLmlkKSkge1xuICAgICAgICAgIGNyZWF0ZWRJZHMuYWRkKGNyZWF0ZWQuaWQpO1xuICAgICAgICAgIGNyZWF0ZWRGb2xkZXJzLnB1c2goeyBpZDogY3JlYXRlZC5pZCwgZGVwdGggfSk7XG4gICAgICAgIH1cbiAgICAgICAgcGFyZW50SWQgPSBjcmVhdGVkLmlkO1xuICAgICAgfVxuICAgIH1cbiAgICBmb2xkZXJDYWNoZS5zZXQoa2V5LCBwYXJlbnRJZCk7XG4gICAgcmV0dXJuIHsgcm9vdElkLCBmb2xkZXJJZDogcGFyZW50SWQgfTtcbiAgfTtcblxuICBjb25zdCByZXNvbHZlZFRhcmdldHMgPSBuZXcgTWFwPHN0cmluZywgUmVzb2x2ZWRUYXJnZXQ+KCk7XG4gIGNvbnN0IHJlc29sdXRpb25GYWlsdXJlczogRmFpbHVyZUl0ZW1bXSA9IFtdO1xuICBmb3IgKGNvbnN0IHsgYm9va21hcmssIGFzc2lnbm1lbnQgfSBvZiBvcmRlcmVkKSB7XG4gICAgaWYgKHdvcmtpbmcuYXBwbGllZElkcy5pbmNsdWRlcyhib29rbWFyay5pZCkgfHwgbWlzc2luZy5oYXMoYm9va21hcmsuaWQpKSBjb250aW51ZTtcbiAgICBjb25zdCB0YXJnZXQgPSBhd2FpdCByZXNvbHZlRm9sZGVyKGJvb2ttYXJrLnJvb3RJZCwgYXNzaWdubWVudC50YXJnZXRQYXRoKTtcbiAgICBpZiAoIXRhcmdldCkge1xuICAgICAgcmVzb2x1dGlvbkZhaWx1cmVzLnB1c2goe1xuICAgICAgICBib29rbWFya0lkOiBib29rbWFyay5pZCxcbiAgICAgICAga2luZDogJ3ZhbGlkYXRpb24nLFxuICAgICAgICBtZXNzYWdlOiB0KCdlcnJvcnMuY29uc2VydmF0aXZlRm9sZGVyR29uZScpLFxuICAgICAgfSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgcmVzb2x2ZWRUYXJnZXRzLnNldChib29rbWFyay5pZCwgdGFyZ2V0KTtcbiAgICBjb25zdCBtb3ZlID0gbW92ZXMuZmluZCgobSkgPT4gbS5ib29rbWFya0lkID09PSBib29rbWFyay5pZCk7XG4gICAgaWYgKG1vdmUpIG1vdmUudG9Gb2xkZXJJZCA9IHRhcmdldC5mb2xkZXJJZDtcbiAgICAvLyDmlrDlu7rnm67lvZXljbPml7bmjIHkuYXljJbvvIzkv53or4HkuK3mlq3lkI7nm67lvZXkuI3kuKLjgIJcbiAgICB3b3JraW5nID0geyAuLi53b3JraW5nLCBjcmVhdGVkRm9sZGVySWRzOiBjcmVhdGVkRm9sZGVycy5tYXAoKGYpID0+IGYuaWQpLCB1cGRhdGVkQXQ6IG5vdygpIH07XG4gICAgYXdhaXQgc3RvcmFnZS5zYXZlSm9iKHdvcmtpbmcpO1xuICB9XG4gIGlmIChyZXNvbHV0aW9uRmFpbHVyZXMubGVuZ3RoID4gMCkge1xuICAgIHdvcmtpbmcgPSB7XG4gICAgICAuLi53b3JraW5nLFxuICAgICAgZmFpbHVyZXM6IFsuLi53b3JraW5nLmZhaWx1cmVzLCAuLi5yZXNvbHV0aW9uRmFpbHVyZXNdLFxuICAgICAgdXBkYXRlZEF0OiBub3coKSxcbiAgICB9O1xuICAgIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYih3b3JraW5nKTtcbiAgfVxuXG4gIC8vIC0tLS0g5b+r54Wn5L+d5a2Y5oiQ5Yqf5ZCO5omN6KaG55uW5LiK5LiA5Lu95pKk6ZSA5b+r54Wn77yI5p625p6E5pa55qGI56ysIDkg6IqC77yJIC0tLS1cbiAgY29uc3Qgc25hcHNob3Q6IFVuZG9TbmFwc2hvdCA9IHtcbiAgICBqb2JJZDogam9iLmpvYklkLFxuICAgIGNyZWF0ZWRBdDogbm93KCksXG4gICAgbW92ZXM6IG1vdmVzLmZpbHRlcigobSkgPT4gbS50b0ZvbGRlcklkLmxlbmd0aCA+IDApLFxuICAgIGNyZWF0ZWRGb2xkZXJzLFxuICAgIGRlbGV0ZWRGb2xkZXJzOlxuICAgICAgdW5kb0V4aXN0aW5nICYmIHVuZG9FeGlzdGluZy5qb2JJZCA9PT0gam9iLmpvYklkID8gWy4uLnVuZG9FeGlzdGluZy5kZWxldGVkRm9sZGVyc10gOiBbXSxcbiAgfTtcbiAgYXdhaXQgc3RvcmFnZS5zYXZlVW5kbyhzbmFwc2hvdCk7XG5cbiAgLy8gLS0tLSA0LiDpobrluo/np7vliqggLS0tLVxuICBjb25zdCBmYWlsdXJlczogRmFpbHVyZUl0ZW1bXSA9IFsuLi53b3JraW5nLmZhaWx1cmVzXTtcbiAgY29uc3QgdG90YWwgPSBvcmRlcmVkLmxlbmd0aDtcbiAgbGV0IHByb2Nlc3NlZCA9IDA7XG5cbiAgZm9yIChjb25zdCB7IGJvb2ttYXJrIH0gb2Ygb3JkZXJlZCkge1xuICAgIHByb2Nlc3NlZCArPSAxO1xuICAgIC8vIOWPlua2iOajgOafpe+8mumHjeivu+aMgeS5heWMluagh+W/l++8jENBTkNFTF9KT0Ig5pu05paw5a2Y5YKo5ZCO56uL5Y2z55Sf5pWI44CCXG4gICAgY29uc3QgcGVyc2lzdGVkID0gYXdhaXQgc3RvcmFnZS5sb2FkSm9iKCk7XG4gICAgaWYgKHBlcnNpc3RlZD8uY2FuY2VsUmVxdWVzdGVkKSB7XG4gICAgICBjb25zdCBpbnRlcnJ1cHRlZDogSm9iU3RhdGUgPSB7XG4gICAgICAgIC4uLndvcmtpbmcsXG4gICAgICAgIHN0YXR1czogJ2ludGVycnVwdGVkJyxcbiAgICAgICAgY2FuY2VsUmVxdWVzdGVkOiB0cnVlLFxuICAgICAgICB1cGRhdGVkQXQ6IG5vdygpLFxuICAgICAgfTtcbiAgICAgIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYihpbnRlcnJ1cHRlZCk7XG4gICAgICBldmVudHM/LmludGVycnVwdGVkKGludGVycnVwdGVkKTtcbiAgICAgIHJldHVybiB7IGpvYjogaW50ZXJydXB0ZWQsIGFwcGxpZWRJZHM6IGludGVycnVwdGVkLmFwcGxpZWRJZHMsIGZhaWx1cmVzOiBpbnRlcnJ1cHRlZC5mYWlsdXJlcyB9O1xuICAgIH1cbiAgICBpZiAod29ya2luZy5hcHBsaWVkSWRzLmluY2x1ZGVzKGJvb2ttYXJrLmlkKSkge1xuICAgICAgZXZlbnRzPy5wcm9ncmVzcyhqb2Iuam9iSWQsICdhcHBseWluZycsIHByb2Nlc3NlZCwgdG90YWwpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGlmIChtaXNzaW5nLmhhcyhib29rbWFyay5pZCkpIGNvbnRpbnVlO1xuXG4gICAgY29uc3QgdGFyZ2V0ID0gcmVzb2x2ZWRUYXJnZXRzLmdldChib29rbWFyay5pZCk7XG4gICAgaWYgKCF0YXJnZXQpIGNvbnRpbnVlO1xuXG4gICAgLy8g5bmC562J77ya56e75Yqo5YmN5qOA5p+l5b2T5YmN5L2N572u77yM5bey5Zyo55uu5qCH55uu5b2V5pe255u05o6l5qCH6K6w5a6M5oiQ44CCXG4gICAgY29uc3QgY3VycmVudCA9IGF3YWl0IGRlcHMuYm9va21hcmtzLmdldChib29rbWFyay5pZCk7XG4gICAgaWYgKCFjdXJyZW50KSB7XG4gICAgICBmYWlsdXJlcy5wdXNoKHsgYm9va21hcmtJZDogYm9va21hcmsuaWQsIGtpbmQ6ICd2YWxpZGF0aW9uJywgbWVzc2FnZTogdCgnZXJyb3JzLmJvb2ttYXJrR29uZUR1cmluZ0FwcGx5JykgfSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKGN1cnJlbnQucGFyZW50SWQgPT09IHRhcmdldC5mb2xkZXJJZCkge1xuICAgICAgd29ya2luZyA9IHtcbiAgICAgICAgLi4ud29ya2luZyxcbiAgICAgICAgYXBwbGllZElkczogWy4uLndvcmtpbmcuYXBwbGllZElkcywgYm9va21hcmsuaWRdLFxuICAgICAgICBhcHBseUN1cnNvcjogcHJvY2Vzc2VkLFxuICAgICAgICB1cGRhdGVkQXQ6IG5vdygpLFxuICAgICAgfTtcbiAgICAgIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYih3b3JraW5nKTtcbiAgICAgIGV2ZW50cz8ucHJvZ3Jlc3Moam9iLmpvYklkLCAnYXBwbHlpbmcnLCBwcm9jZXNzZWQsIHRvdGFsKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBkZXBzLmJvb2ttYXJrcy5tb3ZlKGJvb2ttYXJrLmlkLCB7IHBhcmVudElkOiB0YXJnZXQuZm9sZGVySWQgfSk7XG4gICAgICB3b3JraW5nID0ge1xuICAgICAgICAuLi53b3JraW5nLFxuICAgICAgICBhcHBsaWVkSWRzOiBbLi4ud29ya2luZy5hcHBsaWVkSWRzLCBib29rbWFyay5pZF0sXG4gICAgICAgIGFwcGx5Q3Vyc29yOiBwcm9jZXNzZWQsXG4gICAgICAgIHVwZGF0ZWRBdDogbm93KCksXG4gICAgICB9O1xuICAgICAgYXdhaXQgc3RvcmFnZS5zYXZlSm9iKHdvcmtpbmcpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zdCBjbGFzc2lmaWVkID0gY2xhc3NpZnlFcnJvcihlcnJvcik7XG4gICAgICBmYWlsdXJlcy5wdXNoKHsgYm9va21hcmtJZDogYm9va21hcmsuaWQsIGtpbmQ6IGNsYXNzaWZpZWQua2luZCwgbWVzc2FnZTogY2xhc3NpZmllZC5tZXNzYWdlIH0pO1xuICAgICAgd29ya2luZyA9IHsgLi4ud29ya2luZywgZmFpbHVyZXMsIGFwcGx5Q3Vyc29yOiBwcm9jZXNzZWQsIHVwZGF0ZWRBdDogbm93KCkgfTtcbiAgICAgIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYih3b3JraW5nKTtcbiAgICB9XG4gICAgZXZlbnRzPy5wcm9ncmVzcyhqb2Iuam9iSWQsICdhcHBseWluZycsIHByb2Nlc3NlZCwgdG90YWwpO1xuICB9XG5cbiAgLy8gLS0tLSA1LiDku4XmuIXnkIbnlKjmiLfpgInkuK3ojIPlm7TkuI7mnKzova7mlrDlu7rnmoTnqbrmlofku7blpLkgLS0tLVxuICBjb25zdCBjbGVhbnVwID0gYXdhaXQgY2xlYW51cFNlbGVjdGVkRW1wdHlGb2xkZXJzKFxuICAgIGRlcHMuYm9va21hcmtzLFxuICAgIHN0b3JhZ2UsXG4gICAgc25hcHNob3QsXG4gICAgbmV3IFNldChbLi4uY2xlYW51cEZvbGRlcklkcywgLi4uY3JlYXRlZElkc10pLFxuICAgIGNyZWF0ZWRJZHMsXG4gICk7XG4gIGZhaWx1cmVzLnB1c2goLi4uY2xlYW51cC5mYWlsdXJlcyk7XG4gIHdvcmtpbmcgPSB7IC4uLndvcmtpbmcsIGZhaWx1cmVzLCB1cGRhdGVkQXQ6IG5vdygpIH07XG4gIGlmIChjbGVhbnVwLmNhbmNlbGxlZCkge1xuICAgIGNvbnN0IGludGVycnVwdGVkOiBKb2JTdGF0ZSA9IHtcbiAgICAgIC4uLndvcmtpbmcsXG4gICAgICBzdGF0dXM6ICdpbnRlcnJ1cHRlZCcsXG4gICAgICBjYW5jZWxSZXF1ZXN0ZWQ6IHRydWUsXG4gICAgICB1cGRhdGVkQXQ6IG5vdygpLFxuICAgIH07XG4gICAgYXdhaXQgc3RvcmFnZS5zYXZlSm9iKGludGVycnVwdGVkKTtcbiAgICBldmVudHM/LmludGVycnVwdGVkKGludGVycnVwdGVkKTtcbiAgICByZXR1cm4geyBqb2I6IGludGVycnVwdGVkLCBhcHBsaWVkSWRzOiBpbnRlcnJ1cHRlZC5hcHBsaWVkSWRzLCBmYWlsdXJlcyB9O1xuICB9XG5cbiAgY29uc3QgY29tcGxldGVkOiBKb2JTdGF0ZSA9IHsgLi4ud29ya2luZywgc3RhdHVzOiAnY29tcGxldGVkJywgdXBkYXRlZEF0OiBub3coKSB9O1xuICBhd2FpdCBzdG9yYWdlLnNhdmVKb2IoY29tcGxldGVkKTtcbiAgZXZlbnRzPy5jb21wbGV0ZWQoY29tcGxldGVkKTtcbiAgcmV0dXJuIHsgam9iOiBjb21wbGV0ZWQsIGFwcGxpZWRJZHM6IGNvbXBsZXRlZC5hcHBsaWVkSWRzLCBmYWlsdXJlcyB9O1xufVxuXG4vKipcbiAqIOaMieacgOaWsOagkea3seW6puS7jua3seWIsOa1hea4heeQhuWAmemAieebruW9leOAglxuICog5YCZ6YCJ6ZuG5ZCI55Sx55So5oi35piO56Gu6YCJ5Lit55qE5Y6f5paH5Lu25aS55ZKM5pys6L2u5paw5bu655uu5b2V57uE5oiQ77yb5pyq6YCJ55uu5b2V5Y2z5L2/5Li656m65Lmf5LiN6Kem56Kw44CCXG4gKiDkvb/nlKggcmVtb3ZlIOiAjOS4jeaYryByZW1vdmVUcmVl77yM5L2/5bm25Y+R5paw5aKe5YaF5a655pe255SxIENocm9tZSDlronlhajmi5Lnu53liKDpmaTjgIJcbiAqL1xuYXN5bmMgZnVuY3Rpb24gY2xlYW51cFNlbGVjdGVkRW1wdHlGb2xkZXJzKFxuICBib29rbWFya3M6IEJvb2ttYXJrc1BvcnQsXG4gIHN0b3JhZ2U6IFN0b3JhZ2VQb3J0LFxuICBzbmFwc2hvdDogVW5kb1NuYXBzaG90LFxuICBjYW5kaWRhdGVJZHM6IFNldDxzdHJpbmc+LFxuICBjcmVhdGVkSWRzOiBTZXQ8c3RyaW5nPixcbik6IFByb21pc2U8eyBkZWxldGVkRm9sZGVyczogRGVsZXRlZEZvbGRlcltdOyBmYWlsdXJlczogRmFpbHVyZUl0ZW1bXTsgY2FuY2VsbGVkOiBib29sZWFuIH0+IHtcbiAgY29uc3QgdHJlZSA9IGF3YWl0IGJvb2ttYXJrcy5nZXRUcmVlKCk7XG4gIGNvbnN0IGNhbmRpZGF0ZXM6IEFycmF5PHsgbm9kZTogQm9va21hcmtOb2RlOyBkZXB0aDogbnVtYmVyIH0+ID0gW107XG4gIGNvbnN0IHZpc2l0ID0gKG5vZGU6IEJvb2ttYXJrTm9kZSwgZGVwdGg6IG51bWJlcik6IHZvaWQgPT4ge1xuICAgIGlmIChjYW5kaWRhdGVJZHMuaGFzKG5vZGUuaWQpICYmIG5vZGUudXJsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGNhbmRpZGF0ZXMucHVzaCh7IG5vZGUsIGRlcHRoIH0pO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4gPz8gW10pIHZpc2l0KGNoaWxkLCBkZXB0aCArIDEpO1xuICB9O1xuICBmb3IgKGNvbnN0IHJvb3Qgb2YgdHJlZSkgdmlzaXQocm9vdCwgMCk7XG4gIGNhbmRpZGF0ZXMuc29ydCgoYSwgYikgPT4gYi5kZXB0aCAtIGEuZGVwdGgpO1xuXG4gIGNvbnN0IGRlbGV0ZWRGb2xkZXJzID0gWy4uLnNuYXBzaG90LmRlbGV0ZWRGb2xkZXJzXTtcbiAgY29uc3QgcmVjb3JkZWRJZHMgPSBuZXcgU2V0KGRlbGV0ZWRGb2xkZXJzLm1hcCgoZm9sZGVyKSA9PiBmb2xkZXIuaWQpKTtcbiAgY29uc3QgZmFpbHVyZXM6IEZhaWx1cmVJdGVtW10gPSBbXTtcblxuICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG4gICAgY29uc3QgcGVyc2lzdGVkID0gYXdhaXQgc3RvcmFnZS5sb2FkSm9iKCk7XG4gICAgaWYgKHBlcnNpc3RlZD8uY2FuY2VsUmVxdWVzdGVkKSB7XG4gICAgICByZXR1cm4geyBkZWxldGVkRm9sZGVycywgZmFpbHVyZXMsIGNhbmNlbGxlZDogdHJ1ZSB9O1xuICAgIH1cblxuICAgIGNvbnN0IG5vZGUgPSBhd2FpdCBib29rbWFya3MuZ2V0KGNhbmRpZGF0ZS5ub2RlLmlkKTtcbiAgICBpZiAoIW5vZGUgfHwgbm9kZS51cmwgIT09IHVuZGVmaW5lZCkgY29udGludWU7XG4gICAgaWYgKCFub2RlLnBhcmVudElkIHx8IG5vZGUucGFyZW50SWQgPT09ICcwJyB8fCBpc1VubW9kaWZpYWJsZShub2RlKSkgY29udGludWU7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBhd2FpdCBib29rbWFya3MuZ2V0Q2hpbGRyZW4obm9kZS5pZCk7XG4gICAgaWYgKGNoaWxkcmVuLmxlbmd0aCA+IDApIGNvbnRpbnVlO1xuXG4gICAgLy8g5YWI6K6w5b2V5YaN5Yig6Zmk77ya5Y2z5L2/IFNlcnZpY2UgV29ya2VyIOWcqOS4pOS4quaTjeS9nOS5i+mXtOiiq+WbnuaUtu+8jOaSpOmUgOS5n+iDveivhuWIq+S7jeWtmOWcqOeahOWOn+ebruW9leOAglxuICAgIGlmICghY3JlYXRlZElkcy5oYXMobm9kZS5pZCkgJiYgIXJlY29yZGVkSWRzLmhhcyhub2RlLmlkKSkge1xuICAgICAgcmVjb3JkZWRJZHMuYWRkKG5vZGUuaWQpO1xuICAgICAgZGVsZXRlZEZvbGRlcnMucHVzaCh7XG4gICAgICAgIGlkOiBub2RlLmlkLFxuICAgICAgICBwYXJlbnRJZDogbm9kZS5wYXJlbnRJZCxcbiAgICAgICAgdGl0bGU6IG5vZGUudGl0bGUsXG4gICAgICAgIGluZGV4OiBub2RlLmluZGV4ID8/IDAsXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHN0b3JhZ2Uuc2F2ZVVuZG8oeyAuLi5zbmFwc2hvdCwgZGVsZXRlZEZvbGRlcnM6IFsuLi5kZWxldGVkRm9sZGVyc10gfSk7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGJvb2ttYXJrcy5yZW1vdmUobm9kZS5pZCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnN0IGNsYXNzaWZpZWQgPSBjbGFzc2lmeUVycm9yKGVycm9yKTtcbiAgICAgIGZhaWx1cmVzLnB1c2goe1xuICAgICAgICBmb2xkZXJJZDogbm9kZS5pZCxcbiAgICAgICAga2luZDogY2xhc3NpZmllZC5raW5kLFxuICAgICAgICBtZXNzYWdlOiB0KCdlcnJvcnMuY2xlYW51cEZvbGRlckZhaWxlZCcsIHsgdGl0bGU6IG5vZGUudGl0bGUsIG1lc3NhZ2U6IGNsYXNzaWZpZWQubWVzc2FnZSB9KSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGRlbGV0ZWRGb2xkZXJzLCBmYWlsdXJlcywgY2FuY2VsbGVkOiBmYWxzZSB9O1xufVxuIiwiaW1wb3J0IHR5cGUgeyBEZWxldGVkRm9sZGVyLCBVbmRvTW92ZSwgVW5kb1NuYXBzaG90IH0gZnJvbSAnLi4vLi4vc2hhcmVkL3NjaGVtYXMnO1xuXG4vKiog5pKk6ZSA5pe25Y2V5p2h56e75Yqo55qE5Y+v5omn6KGM5oCn5Yik5a6a44CCICovXG5leHBvcnQgdHlwZSBSZXN0b3JlRGVjaXNpb24gPVxuICB8IHsgYWN0aW9uOiAncmVzdG9yZSc7IG1vdmU6IFVuZG9Nb3ZlIH1cbiAgfCB7IGFjdGlvbjogJ3NraXAnOyBtb3ZlOiBVbmRvTW92ZTsgcmVhc29uOiAnbW92ZWRfYnlfdXNlcicgfCAnYm9va21hcmtfbWlzc2luZycgfCAncGFyZW50X21pc3NpbmcnIH07XG5cbi8qKlxuICog5Yik5a6a5LiA5p2h5b+r54Wn6K6w5b2V5piv5ZCm5bqU5oGi5aSN77yI5p625p6E5pa55qGI56ysIDkg6IqC77yJ77yaXG4gKiDkuabnrb7lvZPliY3ku43lnKjmnKzmrKHlupTnlKjnmoTnm67moIfnm67lvZXml7bmiY3mgaLlpI3vvJtcbiAqIOW3suiiq+eUqOaIt+WGjeasoeenu+WKqOaIluW3suWIoOmZpOWImei3s+i/h+W5tuaKpeWGsueqge+8jOS4jeimhueblueUqOaIt+eahOaWsOaTjeS9nOOAglxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVjaWRlUmVzdG9yZShcbiAgbW92ZTogVW5kb01vdmUsXG4gIGN1cnJlbnRCb29rbWFyazogeyBwYXJlbnRJZD86IHN0cmluZyB9IHwgdW5kZWZpbmVkLFxuICBwYXJlbnRFeGlzdHM6IGJvb2xlYW4sXG4pOiBSZXN0b3JlRGVjaXNpb24ge1xuICBpZiAoIWN1cnJlbnRCb29rbWFyaykge1xuICAgIHJldHVybiB7IGFjdGlvbjogJ3NraXAnLCBtb3ZlLCByZWFzb246ICdib29rbWFya19taXNzaW5nJyB9O1xuICB9XG4gIGlmICghcGFyZW50RXhpc3RzKSB7XG4gICAgcmV0dXJuIHsgYWN0aW9uOiAnc2tpcCcsIG1vdmUsIHJlYXNvbjogJ3BhcmVudF9taXNzaW5nJyB9O1xuICB9XG4gIGlmIChjdXJyZW50Qm9va21hcmsucGFyZW50SWQgIT09IG1vdmUudG9Gb2xkZXJJZCkge1xuICAgIHJldHVybiB7IGFjdGlvbjogJ3NraXAnLCBtb3ZlLCByZWFzb246ICdtb3ZlZF9ieV91c2VyJyB9O1xuICB9XG4gIHJldHVybiB7IGFjdGlvbjogJ3Jlc3RvcmUnLCBtb3ZlIH07XG59XG5cbi8qKlxuICog5oGi5aSN6aG65bqP77ya5oyJ5Y6fIHBhcmVudElkIOWIhue7hO+8jOe7hOWGheaMieWOnyBpbmRleCDljYfluo/np7vlm57vvIxcbiAqIOS9v+ebruW9leWGheeahOebuOWvuemhuuW6j+WwvemHj+aBouWkjeWIsOW6lOeUqOWJjeeKtuaAgeOAglxuICovXG5leHBvcnQgZnVuY3Rpb24gb3JkZXJSZXN0b3Jlcyhtb3ZlczogVW5kb01vdmVbXSk6IFVuZG9Nb3ZlW10ge1xuICBjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgVW5kb01vdmVbXT4oKTtcbiAgZm9yIChjb25zdCBtb3ZlIG9mIG1vdmVzKSB7XG4gICAgY29uc3QgZ3JvdXAgPSBncm91cHMuZ2V0KG1vdmUuZnJvbVBhcmVudElkKTtcbiAgICBpZiAoZ3JvdXApIHtcbiAgICAgIGdyb3VwLnB1c2gobW92ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGdyb3Vwcy5zZXQobW92ZS5mcm9tUGFyZW50SWQsIFttb3ZlXSk7XG4gICAgfVxuICB9XG4gIGNvbnN0IG9yZGVyZWQ6IFVuZG9Nb3ZlW10gPSBbXTtcbiAgZm9yIChjb25zdCBncm91cCBvZiBncm91cHMudmFsdWVzKCkpIHtcbiAgICBvcmRlcmVkLnB1c2goLi4uWy4uLmdyb3VwXS5zb3J0KChhLCBiKSA9PiBhLmZyb21JbmRleCAtIGIuZnJvbUluZGV4KSk7XG4gIH1cbiAgcmV0dXJuIG9yZGVyZWQ7XG59XG5cbi8qKlxuICog5paw5bu655uu5b2V55qE5Yig6Zmk6aG65bqP77ya5oyJ5rex5bqm5LuO5rex5Yiw5rWF44CCXG4gKiDlj6rliKDpmaTnqbrnm67lvZXnlLHosIPnlKjmlrnpgJDmnaHnoa7orqTvvJvmjpLluo/kv53or4HlrZDnm67lvZXlhYjkuo7niLbnm67lvZXooqvmo4Dmn6XjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9yZGVyRm9sZGVyc0ZvckRlbGV0aW9uKFxuICBjcmVhdGVkRm9sZGVyczogVW5kb1NuYXBzaG90WydjcmVhdGVkRm9sZGVycyddLFxuKTogc3RyaW5nW10ge1xuICByZXR1cm4gWy4uLmNyZWF0ZWRGb2xkZXJzXS5zb3J0KChhLCBiKSA9PiBiLmRlcHRoIC0gYS5kZXB0aCkubWFwKChmKSA9PiBmLmlkKTtcbn1cblxuLyoqXG4gKiDooqvliKDljp/mlofku7blpLnnmoTph43lu7rpobrluo/vvJrniLbnm67lvZXlhYjkuo7lrZDnm67lvZXjgIJcbiAqIOaMiSBwYXJlbnRJZCDmi5PmiZHmjpLluo/igJTigJRwYXJlbnRJZCDkuI3lnKjlvoXlu7rpm4blkIjkuK3vvIjljbPlpJbpg6jlt7LmnInnm67lvZXmiJblt7Lph43lu7rvvInnmoTlhYjlu7rvvIxcbiAqIOmAkOi9ruaOqOi/m++8m+WHuueOsOeOr++8iOeQhuiuuuS4iuS4jeS8mu+8ieaXtuaui+S9meaMieWOn+W6j+i/veWKoO+8jOmBv+WFjeatu+W+queOr+OAglxuICovXG5leHBvcnQgZnVuY3Rpb24gb3JkZXJGb2xkZXJzRm9yUmVjcmVhdGlvbihmb2xkZXJzOiBEZWxldGVkRm9sZGVyW10pOiBEZWxldGVkRm9sZGVyW10ge1xuICBjb25zdCByZW1haW5pbmcgPSBbLi4uZm9sZGVyc107XG4gIGNvbnN0IG9yZGVyZWQ6IERlbGV0ZWRGb2xkZXJbXSA9IFtdO1xuICBsZXQgcHJvZ3Jlc3NlZCA9IHRydWU7XG4gIHdoaWxlIChyZW1haW5pbmcubGVuZ3RoID4gMCAmJiBwcm9ncmVzc2VkKSB7XG4gICAgcHJvZ3Jlc3NlZCA9IGZhbHNlO1xuICAgIGZvciAobGV0IGkgPSByZW1haW5pbmcubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIGNvbnN0IGZvbGRlciA9IHJlbWFpbmluZ1tpXSE7XG4gICAgICBjb25zdCBwYXJlbnRTdGlsbFBlbmRpbmcgPSByZW1haW5pbmcuc29tZSgocikgPT4gci5pZCA9PT0gZm9sZGVyLnBhcmVudElkKTtcbiAgICAgIGlmICghcGFyZW50U3RpbGxQZW5kaW5nKSB7XG4gICAgICAgIG9yZGVyZWQucHVzaChmb2xkZXIpO1xuICAgICAgICByZW1haW5pbmcuc3BsaWNlKGksIDEpO1xuICAgICAgICBwcm9ncmVzc2VkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgb3JkZXJlZC5wdXNoKC4uLnJlbWFpbmluZyk7XG4gIHJldHVybiBvcmRlcmVkO1xufVxuIiwiaW1wb3J0IHR5cGUgeyBCb29rbWFya3NQb3J0LCBFdmVudHNQb3J0LCBTdG9yYWdlUG9ydCB9IGZyb20gJy4vcG9ydHMnO1xuaW1wb3J0IHsgYXNzZXJ0VHJhbnNpdGlvbiwgaXNXcml0ZUxvY2tlZCB9IGZyb20gJy4uL2RvbWFpbi9vcmdhbml6ZS9zdGF0ZU1hY2hpbmUnO1xuaW1wb3J0IHtcbiAgZGVjaWRlUmVzdG9yZSxcbiAgb3JkZXJGb2xkZXJzRm9yRGVsZXRpb24sXG4gIG9yZGVyRm9sZGVyc0ZvclJlY3JlYXRpb24sXG4gIG9yZGVyUmVzdG9yZXMsXG4gIHR5cGUgUmVzdG9yZURlY2lzaW9uLFxufSBmcm9tICcuLi9kb21haW4vdW5kby9zbmFwc2hvdCc7XG5pbXBvcnQgeyBBcHBFcnJvciwgY2xhc3NpZnlFcnJvciB9IGZyb20gJy4uL3NoYXJlZC9lcnJvcnMnO1xuaW1wb3J0IHsgdCwgdHlwZSBNZXNzYWdlS2V5IH0gZnJvbSAnLi4vc2hhcmVkL2kxOG4nO1xuaW1wb3J0IHR5cGUgeyBGYWlsdXJlSXRlbSwgSm9iU3RhdGUsIFVuZG9Nb3ZlLCBVbmRvU25hcHNob3QgfSBmcm9tICcuLi9zaGFyZWQvc2NoZW1hcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVW5kb0RlcHMge1xuICBib29rbWFya3M6IEJvb2ttYXJrc1BvcnQ7XG4gIHN0b3JhZ2U6IFN0b3JhZ2VQb3J0O1xuICBldmVudHM/OiBFdmVudHNQb3J0O1xuICBub3c/OiAoKSA9PiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVW5kb1Jlc3VsdCB7XG4gIGpvYjogSm9iU3RhdGU7XG4gIC8qKiDlhrLnqoHkuI7lpLHotKXor6bmg4XvvJvlhajpg6jmiJDlip/ml7bkuLrnqbrjgIIgKi9cbiAgY29uZmxpY3RzOiBGYWlsdXJlSXRlbVtdO1xufVxuXG5jb25zdCBDT05GTElDVF9SRUFTT05fS0VZUyA9IHtcbiAgbW92ZWRfYnlfdXNlcjogJ2Vycm9ycy51bmRvTW92ZWRCeVVzZXInLFxuICBib29rbWFya19taXNzaW5nOiAnZXJyb3JzLnVuZG9Cb29rbWFya01pc3NpbmcnLFxuICBwYXJlbnRfbWlzc2luZzogJ2Vycm9ycy51bmRvUGFyZW50TWlzc2luZycsXG59IHNhdGlzZmllcyBSZWNvcmQ8c3RyaW5nLCBNZXNzYWdlS2V5PjtcblxuLyoqXG4gKiDkuIDplK7mkqTplIDmnIDov5HkuIDmrKHmlbTnkIbvvIjmnrbmnoTmlrnmoYjnrKwgOSDoioLvvInjgIJTZXJ2aWNlIFdvcmtlciDmmK/llK/kuIDosIPnlKjlhaXlj6PjgIJcbiAqXG4gKiAxLiDku4XlpITnkIblv6vnhacgbW92ZXMg5Lit5oiQ5Yqf56e75Yqo6L+H55qE5Lmm562+77ybXG4gKiAyLiDmr4/mnaHlhYjliKTlrprlj6/mgaLlpI3mgKfvvIjku43lnKjmnKzmrKHlupTnlKjnmoTnm67moIfnm67lvZXmiY3mgaLlpI3vvJvnlKjmiLfkuozmrKHnp7vliqjjgIFcbiAqICAgIOW3suWIoOmZpOaIluWOn+eItuebruW9leS4jeWtmOWcqOWImei3s+i/h+W5tuaKpeWGsueqge+8jOS4jeimhueblueUqOaIt+eahOaWsOaTjeS9nO+8ie+8m1xuICogMy4g5oGi5aSN6aG65bqP77ya5oyJ5Y6fIHBhcmVudElkIOWIhue7hOOAgee7hOWGheaMieWOnyBpbmRleCDljYfluo/np7vlm57vvJtcbiAqIDQuIOaBouWkjeWQjuWwhuacrOasoeaWsOW7uuebruW9leaMiea3seW6puS7jua3seWIsOa1heWIoOmZpO+8jOS9huWPquWIoOmZpOepuuebruW9le+8m1xuICogNS4g5pyJ5Yay56qB5pe254q25oCB5Li6IHBhcnRpYWxseV91bmRvbmXvvIzkv53nlZnlv6vnhafkvpvnlKjmiLfph43or5XjgIJcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVuZG9MYXN0QXBwbHkoZGVwczogVW5kb0RlcHMsIGpvYjogSm9iU3RhdGUpOiBQcm9taXNlPFVuZG9SZXN1bHQ+IHtcbiAgY29uc3QgeyBzdG9yYWdlLCBldmVudHMsIGJvb2ttYXJrcyB9ID0gZGVwcztcbiAgY29uc3Qgbm93ID0gZGVwcy5ub3cgPz8gKCgpID0+IERhdGUubm93KCkpO1xuXG4gIGlmIChpc1dyaXRlTG9ja2VkKGpvYi5zdGF0dXMpKSB7XG4gICAgdGhyb3cgbmV3IEFwcEVycm9yKCd1c2VyX2NvbmZsaWN0JywgJ2Vycm9ycy5jYW5ub3RVbmRvSW5TdGF0ZScsIHsgc3RhdHVzOiBqb2Iuc3RhdHVzIH0pO1xuICB9XG4gIGFzc2VydFRyYW5zaXRpb24oam9iLnN0YXR1cywgJ3VuZG9pbmcnKTtcblxuICBjb25zdCBzbmFwc2hvdDogVW5kb1NuYXBzaG90IHwgbnVsbCA9IGF3YWl0IHN0b3JhZ2UubG9hZFVuZG8oKTtcbiAgaWYgKCFzbmFwc2hvdCB8fCBzbmFwc2hvdC5qb2JJZCAhPT0gam9iLmpvYklkKSB7XG4gICAgdGhyb3cgbmV3IEFwcEVycm9yKCd2YWxpZGF0aW9uJywgJ2Vycm9ycy5ub1VuZG9TbmFwc2hvdCcpO1xuICB9XG5cbiAgbGV0IHdvcmtpbmc6IEpvYlN0YXRlID0geyAuLi5qb2IsIHN0YXR1czogJ3VuZG9pbmcnLCB1cGRhdGVkQXQ6IG5vdygpLCBjYW5jZWxSZXF1ZXN0ZWQ6IGZhbHNlIH07XG4gIGF3YWl0IHN0b3JhZ2Uuc2F2ZUpvYih3b3JraW5nKTtcblxuICBjb25zdCBjb25mbGljdHM6IEZhaWx1cmVJdGVtW10gPSBbXTtcbiAgbGV0IGNhbmNlbGxlZCA9IGZhbHNlO1xuXG4gIC8vIC0tLS0gMC4g6YeN5bu65bqU55So5pe26KKr5pCs56m65Yig6Zmk55qE5Y6f5paH5Lu25aS577yM5bm25oqKIGZyb21QYXJlbnRJZCDph43mmKDlsITliLDmlrAgaWQgLS0tLVxuICAvLyDniLbnm67lvZXlhYjkuo7lrZDnm67lvZXph43lu7rvvJvliJvlu7rlpLHotKXnmoTnm67lvZXvvIzlhbbkuabnrb7kvJrlnKjkuIvpnaLmiqUgcGFyZW50X21pc3Npbmcg5Yay56qB44CCXG4gIGNvbnN0IGZvbGRlcklkTWFwID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCBmb2xkZXIgb2Ygb3JkZXJGb2xkZXJzRm9yUmVjcmVhdGlvbihzbmFwc2hvdC5kZWxldGVkRm9sZGVycykpIHtcbiAgICBjb25zdCBwYXJlbnRJZCA9IGZvbGRlcklkTWFwLmdldChmb2xkZXIucGFyZW50SWQpID8/IGZvbGRlci5wYXJlbnRJZDtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgb3JpZ2luYWwgPSBhd2FpdCBib29rbWFya3MuZ2V0KGZvbGRlci5pZCk7XG4gICAgICBpZiAob3JpZ2luYWwgJiYgb3JpZ2luYWwudXJsID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgZm9sZGVySWRNYXAuc2V0KGZvbGRlci5pZCwgb3JpZ2luYWwuaWQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHNpYmxpbmdzID0gYXdhaXQgYm9va21hcmtzLmdldENoaWxkcmVuKHBhcmVudElkKTtcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0gc2libGluZ3MuZmluZChcbiAgICAgICAgKG5vZGUpID0+IG5vZGUudXJsID09PSB1bmRlZmluZWQgJiYgbm9kZS50aXRsZSA9PT0gZm9sZGVyLnRpdGxlLFxuICAgICAgKTtcbiAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICBmb2xkZXJJZE1hcC5zZXQoZm9sZGVyLmlkLCBleGlzdGluZy5pZCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgY3JlYXRlZCA9IGF3YWl0IGJvb2ttYXJrcy5jcmVhdGVGb2xkZXIocGFyZW50SWQsIGZvbGRlci50aXRsZSwgZm9sZGVyLmluZGV4KTtcbiAgICAgIGZvbGRlcklkTWFwLnNldChmb2xkZXIuaWQsIGNyZWF0ZWQuaWQpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8g5Y6f54i255uu5b2V5bey5LiN5a2Y5Zyo5oiW5Yib5bu65aSx6LSl77ya5b+955Wl77yM5Lqk55Sx5ZCO57ut5Yay56qB5Yik5a6a5aSE55CG44CCXG4gICAgfVxuICB9XG4gIGNvbnN0IG1vdmVzOiBVbmRvTW92ZVtdID0gc25hcHNob3QubW92ZXMubWFwKChtb3ZlKSA9PlxuICAgIGZvbGRlcklkTWFwLmhhcyhtb3ZlLmZyb21QYXJlbnRJZClcbiAgICAgID8geyAuLi5tb3ZlLCBmcm9tUGFyZW50SWQ6IGZvbGRlcklkTWFwLmdldChtb3ZlLmZyb21QYXJlbnRJZCkhIH1cbiAgICAgIDogbW92ZSxcbiAgKTtcblxuICAvLyAtLS0tIDEuIOmAkOadoeWIpOWumuWPr+aBouWkjeaApyAtLS0tXG4gIGNvbnN0IGRlY2lzaW9uczogUmVzdG9yZURlY2lzaW9uW10gPSBbXTtcbiAgZm9yIChjb25zdCBtb3ZlIG9mIG1vdmVzKSB7XG4gICAgY29uc3QgY3VycmVudCA9IGF3YWl0IGJvb2ttYXJrcy5nZXQobW92ZS5ib29rbWFya0lkKTtcbiAgICAvLyDljp/niLbnm67lvZXlrZjlnKjmgKfljZXni6znoa7orqTvvIjkuabnrb7lvZPliY3kuI3lnKjnm67moIfnm67lvZXml7bkuZ/mo4Dmn6XvvIzkvr/kuo7miqXlkYrlhrLnqoHljp/lm6DvvInjgIJcbiAgICBjb25zdCBvcmlnaW5hbFBhcmVudCA9IGF3YWl0IGJvb2ttYXJrcy5nZXQobW92ZS5mcm9tUGFyZW50SWQpO1xuICAgIGNvbnN0IHBhcmVudEV4aXN0cyA9IG9yaWdpbmFsUGFyZW50ICE9PSB1bmRlZmluZWQgJiYgb3JpZ2luYWxQYXJlbnQudXJsID09PSB1bmRlZmluZWQ7XG4gICAgZGVjaXNpb25zLnB1c2goZGVjaWRlUmVzdG9yZShtb3ZlLCBjdXJyZW50LCBwYXJlbnRFeGlzdHMpKTtcbiAgfVxuXG4gIC8vIC0tLS0gMi4g5oyJ5oGi5aSN6aG65bqP56e75ZueIC0tLS1cbiAgZm9yIChjb25zdCBkZWNpc2lvbiBvZiBvcmRlclJlc3RvcmVzKFxuICAgIGRlY2lzaW9ucy5maWx0ZXIoKGQpOiBkIGlzIEV4dHJhY3Q8UmVzdG9yZURlY2lzaW9uLCB7IGFjdGlvbjogJ3Jlc3RvcmUnIH0+ID0+XG4gICAgICBkLmFjdGlvbiA9PT0gJ3Jlc3RvcmUnLFxuICAgICkubWFwKChkKSA9PiBkLm1vdmUpLFxuICApKSB7XG4gICAgLy8g5Y+W5raI5qOA5p+l77ya6YeN6K+75oyB5LmF5YyW5qCH5b+X77yMQ0FOQ0VMX0pPQiDmm7TmlrDlrZjlgqjlkI7nq4vljbPnlJ/mlYjjgIJcbiAgICBjb25zdCBwZXJzaXN0ZWQgPSBhd2FpdCBzdG9yYWdlLmxvYWRKb2IoKTtcbiAgICBpZiAocGVyc2lzdGVkPy5jYW5jZWxSZXF1ZXN0ZWQpIHtcbiAgICAgIGNhbmNlbGxlZCA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGJvb2ttYXJrcy5tb3ZlKGRlY2lzaW9uLmJvb2ttYXJrSWQsIHtcbiAgICAgICAgcGFyZW50SWQ6IGRlY2lzaW9uLmZyb21QYXJlbnRJZCxcbiAgICAgICAgaW5kZXg6IGRlY2lzaW9uLmZyb21JbmRleCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zdCBjbGFzc2lmaWVkID0gY2xhc3NpZnlFcnJvcihlcnJvcik7XG4gICAgICBjb25mbGljdHMucHVzaCh7XG4gICAgICAgIGJvb2ttYXJrSWQ6IGRlY2lzaW9uLmJvb2ttYXJrSWQsXG4gICAgICAgIGtpbmQ6IGNsYXNzaWZpZWQua2luZCxcbiAgICAgICAgbWVzc2FnZTogdCgnZXJyb3JzLnJlc3RvcmVGYWlsZWQnLCB7IG1lc3NhZ2U6IGNsYXNzaWZpZWQubWVzc2FnZSB9KSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8vIC0tLS0gMy4g5Yay56qB5pS26ZuG77yI6Lez6L+H6aG577yJIC0tLS1cbiAgZm9yIChjb25zdCBkZWNpc2lvbiBvZiBkZWNpc2lvbnMpIHtcbiAgICBpZiAoZGVjaXNpb24uYWN0aW9uICE9PSAnc2tpcCcpIGNvbnRpbnVlO1xuICAgIGNvbmZsaWN0cy5wdXNoKHtcbiAgICAgIGJvb2ttYXJrSWQ6IGRlY2lzaW9uLm1vdmUuYm9va21hcmtJZCxcbiAgICAgIGtpbmQ6ICd1c2VyX2NvbmZsaWN0JyxcbiAgICAgIG1lc3NhZ2U6IHQoQ09ORkxJQ1RfUkVBU09OX0tFWVNbZGVjaXNpb24ucmVhc29uXSksXG4gICAgfSk7XG4gIH1cblxuICAvLyAtLS0tIDQuIOWIoOmZpOacrOasoeaWsOW7uueahOepuuebruW9le+8iOa3seWIsOa1he+8iSAtLS0tXG4gIGZvciAoY29uc3QgZm9sZGVySWQgb2Ygb3JkZXJGb2xkZXJzRm9yRGVsZXRpb24oc25hcHNob3QuY3JlYXRlZEZvbGRlcnMpKSB7XG4gICAgaWYgKGNhbmNlbGxlZCkgYnJlYWs7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgYm9va21hcmtzLmdldENoaWxkcmVuKGZvbGRlcklkKTtcbiAgICAgIGlmIChjaGlsZHJlbi5sZW5ndGggPT09IDApIHtcbiAgICAgICAgYXdhaXQgYm9va21hcmtzLnJlbW92ZShmb2xkZXJJZCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyDnm67lvZXlt7LooqvnlKjmiLfmiYvliqjliKDpmaTmiJbnp7vliqjvvJrlv73nlaXvvIzkuI3lvbHlk43mkqTplIDnu5PmnpzjgIJcbiAgICB9XG4gIH1cblxuICAvLyDnlKjmiLflj5bmtojml7bkv53nlZnlv6vnhafkuI7miqXlkYrvvIznirbmgIHkuLogcGFydGlhbGx5X3VuZG9uZSDku6Xkvr/ph43or5XmkqTplIDjgIJcbiAgaWYgKGNhbmNlbGxlZCkge1xuICAgIGNvbmZsaWN0cy5wdXNoKHsga2luZDogJ3VzZXJfY29uZmxpY3QnLCBtZXNzYWdlOiB0KCdlcnJvcnMudW5kb0ludGVycnVwdGVkJykgfSk7XG4gIH1cblxuICBjb25zdCBmaW5hbDogSm9iU3RhdGUgPSB7XG4gICAgLi4ud29ya2luZyxcbiAgICBzdGF0dXM6IGNvbmZsaWN0cy5sZW5ndGggPiAwID8gJ3BhcnRpYWxseV91bmRvbmUnIDogJ3VuZG9uZScsXG4gICAgZmFpbHVyZXM6IGNvbmZsaWN0cyxcbiAgICB1cGRhdGVkQXQ6IG5vdygpLFxuICB9O1xuICBhd2FpdCBzdG9yYWdlLnNhdmVKb2IoZmluYWwpO1xuICBpZiAoY29uZmxpY3RzLmxlbmd0aCA+IDApIHtcbiAgICBldmVudHM/LmZhaWxlZChmaW5hbCk7XG4gIH0gZWxzZSB7XG4gICAgZXZlbnRzPy5jb21wbGV0ZWQoZmluYWwpO1xuICB9XG4gIHJldHVybiB7IGpvYjogZmluYWwsIGNvbmZsaWN0cyB9O1xufVxuIiwiaW1wb3J0IHR5cGUgeyBTdG9yYWdlUG9ydCB9IGZyb20gJy4vcG9ydHMnO1xuaW1wb3J0IHR5cGUgeyBKb2JTdGF0ZSwgUGxhblJlY29yZCB9IGZyb20gJy4uL3NoYXJlZC9zY2hlbWFzJztcbmltcG9ydCB0eXBlIHsgU3RhdHVzUGF5bG9hZCB9IGZyb20gJy4uL3NoYXJlZC9tZXNzYWdlcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVzdW1lRGVwcyB7XG4gIHN0b3JhZ2U6IFN0b3JhZ2VQb3J0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlc3VtZVZpZXcgZXh0ZW5kcyBTdGF0dXNQYXlsb2FkIHtcbiAgcGxhbjogUGxhblJlY29yZCB8IG51bGw7XG4gIC8qKiDlvZPliY3ku7vliqHmmK/lkKblj6/ku6Xku47mjIHkuYXljJbmuLjmoIfnu6fnu63lhpnlhaXjgIIgKi9cbiAgY2FuUmVzdW1lQXBwbHk6IGJvb2xlYW47XG4gIC8qKiDmmK/lkKblrZjlnKjlsZ7kuo7lvZPliY3ku7vliqHnmoTjgIHlj6/nu6fnu63nmoTmqKHlnovnrqHnur/jgIIgKi9cbiAgY2FuUmVzdW1lUGxhbm5pbmc6IGJvb2xlYW47XG59XG5cbi8qKlxuICogRGFzaGJvYXJkIOmHjeW8gOWQjueahOeKtuaAgeaBouWkje+8iOaetuaehOaWueahiOesrCAxMiDoioLvvInvvJpcbiAqIOmAmui/hyBHRVRfU1RBVFVTIOaLiem9kCBqb2IgLyBzY2FuIC8gcGxhbiAvIHVuZG8g5b+r54Wn77yM6YeN5bu655WM6Z2i5omA6ZyA55qE5LiA5YiH77yMXG4gKiDkuI3kvp3otZbplb/ov57mjqXmiJblhoXlrZjnirbmgIHjgIJcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlc3VtZUpvYihkZXBzOiBSZXN1bWVEZXBzKTogUHJvbWlzZTxSZXN1bWVWaWV3PiB7XG4gIGNvbnN0IFtqb2IsIHNjYW4sIHBsYW4sIHVuZG9dID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgIGRlcHMuc3RvcmFnZS5sb2FkSm9iKCksXG4gICAgZGVwcy5zdG9yYWdlLmxvYWRTY2FuKCksXG4gICAgZGVwcy5zdG9yYWdlLmxvYWRQbGFuKCksXG4gICAgZGVwcy5zdG9yYWdlLmxvYWRVbmRvKCksXG4gIF0pO1xuXG4gIGNvbnN0IGN1cnJlbnRKb2I6IEpvYlN0YXRlID1cbiAgICBqb2IgPz8ge1xuICAgICAgam9iSWQ6IGNyeXB0by5yYW5kb21VVUlEKCksXG4gICAgICBzdGF0dXM6ICdpZGxlJyxcbiAgICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICAgIGFwcGx5Q3Vyc29yOiAwLFxuICAgICAgYXBwbGllZElkczogW10sXG4gICAgICBjcmVhdGVkRm9sZGVySWRzOiBbXSxcbiAgICAgIGNhbmNlbFJlcXVlc3RlZDogZmFsc2UsXG4gICAgICBmYWlsdXJlczogW10sXG4gICAgfTtcblxuICBjb25zdCBqb2JNYXRjaGVzID0gKHJlY29yZDogeyBqb2JJZDogc3RyaW5nIH0gfCBudWxsKTogYm9vbGVhbiA9PlxuICAgIHJlY29yZCAhPT0gbnVsbCAmJiByZWNvcmQuam9iSWQgPT09IGN1cnJlbnRKb2Iuam9iSWQ7XG5cbiAgcmV0dXJuIHtcbiAgICBqb2I6IGN1cnJlbnRKb2IsXG4gICAgLy8gc2NhbiDnu5PmnpzkuI3mkLrluKYgam9iSWTvvIznm7TmjqXov5Tlm57vvJvmlrDkuIDova7miavmj4/kvJropobnm5blroPjgIJcbiAgICBzY2FuLFxuICAgIGhhc1VuZG9TbmFwc2hvdDogdW5kbyAhPT0gbnVsbCAmJiBqb2JNYXRjaGVzKHVuZG8pLFxuICAgIHBsYW46IHBsYW4gJiYgam9iTWF0Y2hlcyhwbGFuKSA/IHBsYW4gOiBudWxsLFxuICAgIC8vIGludGVycnVwdGVkID0g55So5oi35Lit5pat77ybYXBwbHlpbmcgPSBTVyDlnKjlhpnlhaXkuK3pgJTooqvlm57mlLbvvIzkuKTogIXpg73lj6/ku47mjIHkuYXljJbmuLjmoIfnu63ot5HjgIJcbiAgICBjYW5SZXN1bWVBcHBseTogY3VycmVudEpvYi5zdGF0dXMgPT09ICdpbnRlcnJ1cHRlZCcgfHwgY3VycmVudEpvYi5zdGF0dXMgPT09ICdhcHBseWluZycsXG4gICAgY2FuUmVzdW1lUGxhbm5pbmc6XG4gICAgICBwbGFuICE9PSBudWxsICYmXG4gICAgICBqb2JNYXRjaGVzKHBsYW4pICYmXG4gICAgICBwbGFuLnBoYXNlICE9PSAnZG9uZScgJiZcbiAgICAgIChjdXJyZW50Sm9iLnN0YXR1cyA9PT0gJ3BsYW5uaW5nJyB8fFxuICAgICAgICBjdXJyZW50Sm9iLnN0YXR1cyA9PT0gJ2NsYXNzaWZ5aW5nJyB8fFxuICAgICAgICBjdXJyZW50Sm9iLnN0YXR1cyA9PT0gJ2ZhaWxlZCcgfHxcbiAgICAgICAgY3VycmVudEpvYi5zdGF0dXMgPT09ICdyZXZpZXdpbmcnKSxcbiAgfTtcbn1cbiIsImltcG9ydCB0eXBlIHsgU2Nhbm5lZEJvb2ttYXJrIH0gZnJvbSAnLi4vLi4vc2hhcmVkL3NjaGVtYXMnO1xuXG5leHBvcnQgdHlwZSBEdXBsaWNhdGVLaW5kID0gJ3NhbWUtdXJsJyB8ICdzaW1pbGFyLXVybCcgfCAnc2FtZS10aXRsZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRHVwbGljYXRlR3JvdXAge1xuICBpZDogc3RyaW5nO1xuICBraW5kOiBEdXBsaWNhdGVLaW5kO1xuICBib29rbWFya3M6IFNjYW5uZWRCb29rbWFya1tdO1xufVxuXG5mdW5jdGlvbiBleGFjdFVybEtleSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHZhbHVlLnRyaW0oKTtcbn1cblxuZnVuY3Rpb24gbG9vc2VVcmxLZXkodmFsdWU6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICB0cnkge1xuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwodmFsdWUpO1xuICAgIGNvbnN0IGhvc3RuYW1lID0gdXJsLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvXnd3d1xcLi8sICcnKTtcbiAgICBjb25zdCBwYXRobmFtZSA9IHVybC5wYXRobmFtZS5yZXBsYWNlKC9cXC8rJC8sICcnKSB8fCAnLyc7XG4gICAgcmV0dXJuIGAke2hvc3RuYW1lfSR7cGF0aG5hbWV9JHt1cmwuc2VhcmNofWAudG9Mb3dlckNhc2UoKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZnVuY3Rpb24gY29tbW9uUHJlZml4UmF0aW8obGVmdDogc3RyaW5nLCByaWdodDogc3RyaW5nKTogbnVtYmVyIHtcbiAgbGV0IGxlbmd0aCA9IDA7XG4gIGNvbnN0IG1heCA9IE1hdGgubWluKGxlZnQubGVuZ3RoLCByaWdodC5sZW5ndGgpO1xuICB3aGlsZSAobGVuZ3RoIDwgbWF4ICYmIGxlZnRbbGVuZ3RoXSA9PT0gcmlnaHRbbGVuZ3RoXSkgbGVuZ3RoICs9IDE7XG4gIHJldHVybiAoMiAqIGxlbmd0aCkgLyAobGVmdC5sZW5ndGggKyByaWdodC5sZW5ndGgpO1xufVxuXG5mdW5jdGlvbiBzaW1pbGFyVXJsKGxlZnQ6IHN0cmluZywgcmlnaHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCBhID0gbG9vc2VVcmxLZXkobGVmdCk7XG4gIGNvbnN0IGIgPSBsb29zZVVybEtleShyaWdodCk7XG4gIGlmICghYSB8fCAhYikgcmV0dXJuIGZhbHNlO1xuICBpZiAoYSA9PT0gYikgcmV0dXJuIHRydWU7XG4gIHJldHVybiBhLnNwbGl0KCcvJylbMF0gPT09IGIuc3BsaXQoJy8nKVswXSAmJiBjb21tb25QcmVmaXhSYXRpbyhhLCBiKSA+PSAwLjg7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZWRUaXRsZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHZhbHVlLnRyaW0oKS5yZXBsYWNlKC9cXHMrL2csICcgJykudG9Mb2NhbGVMb3dlckNhc2UoKTtcbn1cblxuLyoqIOaMieWMuemFjee9ruS/oeW6puWIhue7hO+8jOWQjOS4gOS4quS5puetvuWPqui/m+WFpeS4gOS4quWIhue7hOOAgiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmREdXBsaWNhdGVHcm91cHMoYm9va21hcmtzOiBTY2FubmVkQm9va21hcmtbXSk6IER1cGxpY2F0ZUdyb3VwW10ge1xuICBjb25zdCBncm91cHM6IER1cGxpY2F0ZUdyb3VwW10gPSBbXTtcbiAgY29uc3QgdXNlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG4gIGNvbnN0IGFkZEJ1Y2tldHMgPSAoa2luZDogRHVwbGljYXRlS2luZCwga2V5Rm9yOiAoYm9va21hcms6IFNjYW5uZWRCb29rbWFyaykgPT4gc3RyaW5nIHwgbnVsbCkgPT4ge1xuICAgIGNvbnN0IGJ1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgU2Nhbm5lZEJvb2ttYXJrW10+KCk7XG4gICAgZm9yIChjb25zdCBib29rbWFyayBvZiBib29rbWFya3MpIHtcbiAgICAgIGlmICh1c2VkLmhhcyhib29rbWFyay5pZCkpIGNvbnRpbnVlO1xuICAgICAgY29uc3Qga2V5ID0ga2V5Rm9yKGJvb2ttYXJrKTtcbiAgICAgIGlmICgha2V5KSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGJ1Y2tldCA9IGJ1Y2tldHMuZ2V0KGtleSkgPz8gW107XG4gICAgICBidWNrZXQucHVzaChib29rbWFyayk7XG4gICAgICBidWNrZXRzLnNldChrZXksIGJ1Y2tldCk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW2tleSwgYnVja2V0XSBvZiBidWNrZXRzKSB7XG4gICAgICBpZiAoYnVja2V0Lmxlbmd0aCA8IDIpIGNvbnRpbnVlO1xuICAgICAgYnVja2V0LmZvckVhY2goKGJvb2ttYXJrKSA9PiB1c2VkLmFkZChib29rbWFyay5pZCkpO1xuICAgICAgZ3JvdXBzLnB1c2goeyBpZDogYCR7a2luZH06JHtrZXl9YCwga2luZCwgYm9va21hcmtzOiBidWNrZXQgfSk7XG4gICAgfVxuICB9O1xuXG4gIGFkZEJ1Y2tldHMoJ3NhbWUtdXJsJywgKGJvb2ttYXJrKSA9PiBleGFjdFVybEtleShib29rbWFyay51cmwpKTtcblxuICBjb25zdCByZW1haW5pbmcgPSBib29rbWFya3MuZmlsdGVyKChib29rbWFyaykgPT4gIXVzZWQuaGFzKGJvb2ttYXJrLmlkKSk7XG4gIGNvbnN0IHZpc2l0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZm9yIChjb25zdCBib29rbWFyayBvZiByZW1haW5pbmcpIHtcbiAgICBpZiAodmlzaXRlZC5oYXMoYm9va21hcmsuaWQpKSBjb250aW51ZTtcbiAgICBjb25zdCBjb21wb25lbnQ6IFNjYW5uZWRCb29rbWFya1tdID0gW107XG4gICAgY29uc3QgcXVldWUgPSBbYm9va21hcmtdO1xuICAgIHZpc2l0ZWQuYWRkKGJvb2ttYXJrLmlkKTtcbiAgICB3aGlsZSAocXVldWUubGVuZ3RoKSB7XG4gICAgICBjb25zdCBjdXJyZW50ID0gcXVldWUuc2hpZnQoKSE7XG4gICAgICBjb21wb25lbnQucHVzaChjdXJyZW50KTtcbiAgICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHJlbWFpbmluZykge1xuICAgICAgICBpZiAoIXZpc2l0ZWQuaGFzKGNhbmRpZGF0ZS5pZCkgJiYgc2ltaWxhclVybChjdXJyZW50LnVybCwgY2FuZGlkYXRlLnVybCkpIHtcbiAgICAgICAgICB2aXNpdGVkLmFkZChjYW5kaWRhdGUuaWQpO1xuICAgICAgICAgIHF1ZXVlLnB1c2goY2FuZGlkYXRlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoY29tcG9uZW50Lmxlbmd0aCA+IDEpIHtcbiAgICAgIGNvbXBvbmVudC5mb3JFYWNoKChpdGVtKSA9PiB1c2VkLmFkZChpdGVtLmlkKSk7XG4gICAgICBncm91cHMucHVzaCh7XG4gICAgICAgIGlkOiBgc2ltaWxhci11cmw6JHtjb21wb25lbnQubWFwKChpdGVtKSA9PiBpdGVtLmlkKS5qb2luKCcsJyl9YCxcbiAgICAgICAga2luZDogJ3NpbWlsYXItdXJsJyxcbiAgICAgICAgYm9va21hcmtzOiBjb21wb25lbnQsXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBhZGRCdWNrZXRzKCdzYW1lLXRpdGxlJywgKGJvb2ttYXJrKSA9PiBub3JtYWxpemVkVGl0bGUoYm9va21hcmsudGl0bGUpIHx8IG51bGwpO1xuICByZXR1cm4gZ3JvdXBzO1xufVxuIiwiaW1wb3J0IHsgYnVpbGRTY2FuUmVzdWx0IH0gZnJvbSAnLi4vZG9tYWluL2Jvb2ttYXJrcy90cmVlJztcbmltcG9ydCB7IGZpbmREdXBsaWNhdGVHcm91cHMgfSBmcm9tICcuLi9kb21haW4vYm9va21hcmtzL2R1cGxpY2F0ZXMnO1xuaW1wb3J0IHsgQXBwRXJyb3IgfSBmcm9tICcuLi9zaGFyZWQvZXJyb3JzJztcbmltcG9ydCB7IHQgfSBmcm9tICcuLi9zaGFyZWQvaTE4bic7XG5pbXBvcnQgdHlwZSB7IFNjYW5SZXN1bHQgfSBmcm9tICcuLi9zaGFyZWQvc2NoZW1hcyc7XG5pbXBvcnQgdHlwZSB7IEJvb2ttYXJrc1BvcnQsIFN0b3JhZ2VQb3J0IH0gZnJvbSAnLi9wb3J0cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGVsZXRlRHVwbGljYXRlQm9va21hcmtzUmVzdWx0IHtcbiAgc2NhbjogU2NhblJlc3VsdDtcbiAgZGVsZXRlZElkczogc3RyaW5nW107XG4gIGZhaWx1cmVzOiBBcnJheTx7IGJvb2ttYXJrSWQ6IHN0cmluZzsgbWVzc2FnZTogc3RyaW5nIH0+O1xufVxuXG4vKiog5Y+q5YWB6K645Yig6Zmk5pyA6L+R5LiA5qyh5omr5o+P5Lit5Ye6546w55qE5Lmm562+IElE77yM5bm25Zyo5Yig6Zmk5ZCO6YeN5paw5omr5o+P5Lul5ZCM5q2l5oyB5LmF5YyW54q25oCB44CCICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGVsZXRlRHVwbGljYXRlQm9va21hcmtzKFxuICBkZXBzOiB7IGJvb2ttYXJrczogQm9va21hcmtzUG9ydDsgc3RvcmFnZTogU3RvcmFnZVBvcnQ7IG5vdz86ICgpID0+IG51bWJlcjsgbmV3SWQ/OiAoKSA9PiBzdHJpbmcgfSxcbiAgYm9va21hcmtJZHM6IHN0cmluZ1tdLFxuKTogUHJvbWlzZTxEZWxldGVEdXBsaWNhdGVCb29rbWFya3NSZXN1bHQ+IHtcbiAgY29uc3QgcHJldmlvdXMgPSBhd2FpdCBkZXBzLnN0b3JhZ2UubG9hZFNjYW4oKTtcbiAgaWYgKCFwcmV2aW91cykgdGhyb3cgbmV3IEFwcEVycm9yKCd2YWxpZGF0aW9uJywgJ2Vycm9ycy5ub1NjYW4nKTtcblxuICBjb25zdCBpZHMgPSBbLi4ubmV3IFNldChib29rbWFya0lkcyldO1xuICBjb25zdCByZXF1ZXN0ZWQgPSBuZXcgU2V0KGlkcyk7XG4gIGNvbnN0IGdyb3VwcyA9IGZpbmREdXBsaWNhdGVHcm91cHMocHJldmlvdXMuYm9va21hcmtzKTtcbiAgY29uc3QgZHVwbGljYXRlSWRzID0gbmV3IFNldChncm91cHMuZmxhdE1hcCgoZ3JvdXApID0+IGdyb3VwLmJvb2ttYXJrcy5tYXAoKGJvb2ttYXJrKSA9PiBib29rbWFyay5pZCkpKTtcbiAgaWYgKGlkcy5zb21lKChpZCkgPT4gIWR1cGxpY2F0ZUlkcy5oYXMoaWQpKSkge1xuICAgIHRocm93IG5ldyBBcHBFcnJvcigndmFsaWRhdGlvbicsICdlcnJvcnMubm90U2Nhbm5lZER1cGxpY2F0ZScpO1xuICB9XG4gIGlmIChncm91cHMuc29tZSgoZ3JvdXApID0+IGdyb3VwLmJvb2ttYXJrcy5ldmVyeSgoYm9va21hcmspID0+IHJlcXVlc3RlZC5oYXMoYm9va21hcmsuaWQpKSkpIHtcbiAgICB0aHJvdyBuZXcgQXBwRXJyb3IoJ3ZhbGlkYXRpb24nLCAnZXJyb3JzLmtlZXBPbmVQZXJHcm91cCcpO1xuICB9XG5cbiAgY29uc3QgZGVsZXRlZElkczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgZmFpbHVyZXM6IEFycmF5PHsgYm9va21hcmtJZDogc3RyaW5nOyBtZXNzYWdlOiBzdHJpbmcgfT4gPSBbXTtcbiAgZm9yIChjb25zdCBpZCBvZiBpZHMpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgZGVwcy5ib29rbWFya3MucmVtb3ZlKGlkKTtcbiAgICAgIGRlbGV0ZWRJZHMucHVzaChpZCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGZhaWx1cmVzLnB1c2goe1xuICAgICAgICBib29rbWFya0lkOiBpZCxcbiAgICAgICAgbWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiB0KCdlcnJvcnMuZGVsZXRlRmFpbGVkJyksXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBjb25zdCB0cmVlID0gYXdhaXQgZGVwcy5ib29rbWFya3MuZ2V0VHJlZSgpO1xuICBjb25zdCBzY2FuID0gYnVpbGRTY2FuUmVzdWx0KFxuICAgIHRyZWUsXG4gICAgKGRlcHMubmV3SWQgPz8gKCgpID0+IGNyeXB0by5yYW5kb21VVUlEKCkpKSgpLFxuICAgIChkZXBzLm5vdyA/PyAoKCkgPT4gRGF0ZS5ub3coKSkpKCksXG4gICk7XG4gIGF3YWl0IGRlcHMuc3RvcmFnZS5zYXZlU2NhbihzY2FuKTtcbiAgcmV0dXJuIHsgc2NhbiwgZGVsZXRlZElkcywgZmFpbHVyZXMgfTtcbn1cbiIsImltcG9ydCB0eXBlIHsgU2NhbkZvbGRlciwgU2NhblJlc3VsdCB9IGZyb20gJy4uLy4uL3NoYXJlZC9zY2hlbWFzJztcblxuLyoqXG4gKiDmib7lh7rmiYDmnInnqbrmlofku7blpLnvvJroh6rouqvlj4rlhajpg6jlkI7ku6Pnm67lvZXkuK3pg73msqHmnInku7vkvZXkuabnrb7nmoTnm67lvZXjgIJcbiAqIOmhtue6p+agueebruW9le+8iOS5puetvuagjy/lhbbku5bkuabnrb7vvInkuI3lnKggc2Nhbi5mb2xkZXJzIOS4re+8jOWkqeeEtuS4jeS8muiiq+a4heeQhuOAglxuICovXG5leHBvcnQgZnVuY3Rpb24gZmluZEVtcHR5Rm9sZGVycyhzY2FuOiBTY2FuUmVzdWx0KTogU2NhbkZvbGRlcltdIHtcbiAgY29uc3QgcGFyZW50QnlJZCA9IG5ldyBNYXAoc2Nhbi5mb2xkZXJzLm1hcCgoZm9sZGVyKSA9PiBbZm9sZGVyLmlkLCBmb2xkZXIucGFyZW50SWRdKSk7XG4gIGNvbnN0IG5vbkVtcHR5SWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3QgYm9va21hcmsgb2Ygc2Nhbi5ib29rbWFya3MpIHtcbiAgICBsZXQgaWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IGJvb2ttYXJrLnBhcmVudElkO1xuICAgIHdoaWxlIChpZCAhPT0gdW5kZWZpbmVkICYmICFub25FbXB0eUlkcy5oYXMoaWQpKSB7XG4gICAgICBub25FbXB0eUlkcy5hZGQoaWQpO1xuICAgICAgaWQgPSBwYXJlbnRCeUlkLmdldChpZCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBzY2FuLmZvbGRlcnNcbiAgICAuZmlsdGVyKChmb2xkZXIpID0+ICFub25FbXB0eUlkcy5oYXMoZm9sZGVyLmlkKSlcbiAgICAuc29ydCgoYSwgYikgPT4gYi5kZXB0aCAtIGEuZGVwdGgpO1xufVxuIiwiaW1wb3J0IHsgZmluZEVtcHR5Rm9sZGVycyB9IGZyb20gJy4uL2RvbWFpbi9ib29rbWFya3MvZW1wdHlGb2xkZXJzJztcbmltcG9ydCB7IGJ1aWxkU2NhblJlc3VsdCB9IGZyb20gJy4uL2RvbWFpbi9ib29rbWFya3MvdHJlZSc7XG5pbXBvcnQgdHlwZSB7IEJvb2ttYXJrTm9kZSB9IGZyb20gJy4uL2RvbWFpbi9ib29rbWFya3MvdHlwZXMnO1xuaW1wb3J0IHsgQXBwRXJyb3IgfSBmcm9tICcuLi9zaGFyZWQvZXJyb3JzJztcbmltcG9ydCB7IHQgfSBmcm9tICcuLi9zaGFyZWQvaTE4bic7XG5pbXBvcnQgdHlwZSB7IFNjYW5SZXN1bHQgfSBmcm9tICcuLi9zaGFyZWQvc2NoZW1hcyc7XG5pbXBvcnQgdHlwZSB7IEJvb2ttYXJrc1BvcnQsIFN0b3JhZ2VQb3J0IH0gZnJvbSAnLi9wb3J0cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGVsZXRlRW1wdHlGb2xkZXJzUmVzdWx0IHtcbiAgc2NhbjogU2NhblJlc3VsdDtcbiAgZGVsZXRlZElkczogc3RyaW5nW107XG4gIGZhaWx1cmVzOiBBcnJheTx7IGZvbGRlcklkOiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZyB9Pjtcbn1cblxuLyoqIOWunuaXtuajgOafpeebruW9leWtkOagkeWGheaYr+WQpuS7jeacieS5puetvu+8jOmYsuatouaJq+aPj+e7k+aenOiiq+eUqOaIt+aJi+WKqOaUueWKqOWQjuivr+WIoOS5puetvuOAgiAqL1xuYXN5bmMgZnVuY3Rpb24gc3VidHJlZUhhc0Jvb2ttYXJrcyhib29rbWFya3M6IEJvb2ttYXJrc1BvcnQsIGZvbGRlcklkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgY29uc3QgcXVldWU6IEJvb2ttYXJrTm9kZVtdID0gYXdhaXQgYm9va21hcmtzLmdldENoaWxkcmVuKGZvbGRlcklkKTtcbiAgd2hpbGUgKHF1ZXVlLmxlbmd0aCkge1xuICAgIGNvbnN0IG5vZGUgPSBxdWV1ZS5zaGlmdCgpITtcbiAgICBpZiAobm9kZS51cmwgIT09IHVuZGVmaW5lZCkgcmV0dXJuIHRydWU7XG4gICAgaWYgKG5vZGUuY2hpbGRyZW4pIHF1ZXVlLnB1c2goLi4ubm9kZS5jaGlsZHJlbik7XG4gICAgZWxzZSBxdWV1ZS5wdXNoKC4uLihhd2FpdCBib29rbWFya3MuZ2V0Q2hpbGRyZW4obm9kZS5pZCkpKTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbi8qKiDlj6rlhYHorrjliKDpmaTmnIDov5HkuIDmrKHmiavmj4/kuK3or4bliKvlh7rnmoTnqbrmlofku7blpLnvvIzliKDpmaTlkI7ph43mlrDmiavmj4/ku6XlkIzmraXmjIHkuYXljJbnirbmgIHjgIIgKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZWxldGVFbXB0eUZvbGRlcnMoXG4gIGRlcHM6IHsgYm9va21hcmtzOiBCb29rbWFya3NQb3J0OyBzdG9yYWdlOiBTdG9yYWdlUG9ydDsgbm93PzogKCkgPT4gbnVtYmVyOyBuZXdJZD86ICgpID0+IHN0cmluZyB9LFxuICBmb2xkZXJJZHM6IHN0cmluZ1tdLFxuKTogUHJvbWlzZTxEZWxldGVFbXB0eUZvbGRlcnNSZXN1bHQ+IHtcbiAgY29uc3QgcHJldmlvdXMgPSBhd2FpdCBkZXBzLnN0b3JhZ2UubG9hZFNjYW4oKTtcbiAgaWYgKCFwcmV2aW91cykgdGhyb3cgbmV3IEFwcEVycm9yKCd2YWxpZGF0aW9uJywgJ2Vycm9ycy5ub1NjYW4nKTtcblxuICBjb25zdCBpZHMgPSBbLi4ubmV3IFNldChmb2xkZXJJZHMpXTtcbiAgY29uc3QgZW1wdHlGb2xkZXJJZHMgPSBuZXcgU2V0KGZpbmRFbXB0eUZvbGRlcnMocHJldmlvdXMpLm1hcCgoZm9sZGVyKSA9PiBmb2xkZXIuaWQpKTtcbiAgaWYgKGlkcy5zb21lKChpZCkgPT4gIWVtcHR5Rm9sZGVySWRzLmhhcyhpZCkpKSB7XG4gICAgdGhyb3cgbmV3IEFwcEVycm9yKCd2YWxpZGF0aW9uJywgJ2Vycm9ycy5ub3RTY2FubmVkRW1wdHlGb2xkZXInKTtcbiAgfVxuXG4gIGNvbnN0IGRlcHRoQnlJZCA9IG5ldyBNYXAocHJldmlvdXMuZm9sZGVycy5tYXAoKGZvbGRlcikgPT4gW2ZvbGRlci5pZCwgZm9sZGVyLmRlcHRoXSkpO1xuICAvLyDlhYjliKDmt7HlsYLvvJrniLbnm67lvZXliKDpmaTlkI7vvIzlhbbkuK3nmoTnqbrlrZDnm67lvZXoioLngrnlt7LkuI3lrZjlnKjvvIzlkI7nu63ov63ku6Poh6rliqjot7Pov4dcbiAgY29uc3Qgb3JkZXJlZCA9IFsuLi5pZHNdLnNvcnQoKGEsIGIpID0+IChkZXB0aEJ5SWQuZ2V0KGIpID8/IDApIC0gKGRlcHRoQnlJZC5nZXQoYSkgPz8gMCkpO1xuXG4gIGNvbnN0IGRlbGV0ZWRJZHM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGZhaWx1cmVzOiBBcnJheTx7IGZvbGRlcklkOiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZyB9PiA9IFtdO1xuICBmb3IgKGNvbnN0IGlkIG9mIG9yZGVyZWQpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgbm9kZSA9IGF3YWl0IGRlcHMuYm9va21hcmtzLmdldChpZCk7XG4gICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgLy8g6IqC54K55bey6ZqP54i255uu5b2V5LiA5bm25Yig6ZmkXG4gICAgICAgIGRlbGV0ZWRJZHMucHVzaChpZCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKGF3YWl0IHN1YnRyZWVIYXNCb29rbWFya3MoZGVwcy5ib29rbWFya3MsIGlkKSkge1xuICAgICAgICBmYWlsdXJlcy5wdXNoKHsgZm9sZGVySWQ6IGlkLCBtZXNzYWdlOiB0KCdlcnJvcnMuZm9sZGVyQWxyZWFkeUhhc0Jvb2ttYXJrcycpIH0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IGRlcHMuYm9va21hcmtzLnJlbW92ZVRyZWUoaWQpO1xuICAgICAgZGVsZXRlZElkcy5wdXNoKGlkKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgZmFpbHVyZXMucHVzaCh7XG4gICAgICAgIGZvbGRlcklkOiBpZCxcbiAgICAgICAgbWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiB0KCdlcnJvcnMuZGVsZXRlRmFpbGVkJyksXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBjb25zdCB0cmVlID0gYXdhaXQgZGVwcy5ib29rbWFya3MuZ2V0VHJlZSgpO1xuICBjb25zdCBzY2FuID0gYnVpbGRTY2FuUmVzdWx0KFxuICAgIHRyZWUsXG4gICAgKGRlcHMubmV3SWQgPz8gKCgpID0+IGNyeXB0by5yYW5kb21VVUlEKCkpKSgpLFxuICAgIChkZXBzLm5vdyA/PyAoKCkgPT4gRGF0ZS5ub3coKSkpKCksXG4gICk7XG4gIGF3YWl0IGRlcHMuc3RvcmFnZS5zYXZlU2NhbihzY2FuKTtcbiAgcmV0dXJuIHsgc2NhbiwgZGVsZXRlZElkcywgZmFpbHVyZXMgfTtcbn1cbiIsImltcG9ydCB0eXBlIHsgQm9va21hcmtzUG9ydCB9IGZyb20gJy4uLy4uL2FwcGxpY2F0aW9uL3BvcnRzJztcbmltcG9ydCB0eXBlIHsgQm9va21hcmtOb2RlIH0gZnJvbSAnLi4vLi4vZG9tYWluL2Jvb2ttYXJrcy90eXBlcyc7XG5cbi8qKiBjaHJvbWUuYm9va21hcmtzIOeahOmAgumFjeWunueOsOOAgiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUJvb2ttYXJrc1JlcG9zaXRvcnkoKTogQm9va21hcmtzUG9ydCB7XG4gIHJldHVybiB7XG4gICAgYXN5bmMgZ2V0VHJlZSgpIHtcbiAgICAgIGNvbnN0IHRyZWUgPSBhd2FpdCBjaHJvbWUuYm9va21hcmtzLmdldFRyZWUoKTtcbiAgICAgIHJldHVybiB0cmVlIGFzIHVua25vd24gYXMgQm9va21hcmtOb2RlW107XG4gICAgfSxcblxuICAgIGFzeW5jIGdldChpZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgbm9kZXMgPSBhd2FpdCBjaHJvbWUuYm9va21hcmtzLmdldChpZCk7XG4gICAgICAgIHJldHVybiAobm9kZXNbMF0gYXMgdW5rbm93biBhcyBCb29rbWFya05vZGUpID8/IHVuZGVmaW5lZDtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyBnZXRDaGlsZHJlbihwYXJlbnRJZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY2hpbGRyZW4gPSBhd2FpdCBjaHJvbWUuYm9va21hcmtzLmdldENoaWxkcmVuKHBhcmVudElkKTtcbiAgICAgICAgcmV0dXJuIGNoaWxkcmVuIGFzIHVua25vd24gYXMgQm9va21hcmtOb2RlW107XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyBjcmVhdGVGb2xkZXIocGFyZW50SWQsIHRpdGxlLCBpbmRleCkge1xuICAgICAgY29uc3Qgbm9kZSA9IGF3YWl0IGNocm9tZS5ib29rbWFya3MuY3JlYXRlKHsgcGFyZW50SWQsIHRpdGxlLCBpbmRleCB9KTtcbiAgICAgIHJldHVybiB7IGlkOiBub2RlLmlkIH07XG4gICAgfSxcblxuICAgIGFzeW5jIG1vdmUoaWQsIGRlc3RpbmF0aW9uKSB7XG4gICAgICBhd2FpdCBjaHJvbWUuYm9va21hcmtzLm1vdmUoaWQsIGRlc3RpbmF0aW9uKTtcbiAgICB9LFxuXG4gICAgYXN5bmMgcmVtb3ZlKGlkKSB7XG4gICAgICBhd2FpdCBjaHJvbWUuYm9va21hcmtzLnJlbW92ZShpZCk7XG4gICAgfSxcblxuICAgIGFzeW5jIHJlbW92ZVRyZWUoaWQpIHtcbiAgICAgIGF3YWl0IGNocm9tZS5ib29rbWFya3MucmVtb3ZlVHJlZShpZCk7XG4gICAgfSxcbiAgfTtcbn1cbiIsImV4cG9ydCB2YXIgdXRpbDtcbihmdW5jdGlvbiAodXRpbCkge1xuICAgIHV0aWwuYXNzZXJ0RXF1YWwgPSAoXykgPT4geyB9O1xuICAgIGZ1bmN0aW9uIGFzc2VydElzKF9hcmcpIHsgfVxuICAgIHV0aWwuYXNzZXJ0SXMgPSBhc3NlcnRJcztcbiAgICBmdW5jdGlvbiBhc3NlcnROZXZlcihfeCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoKTtcbiAgICB9XG4gICAgdXRpbC5hc3NlcnROZXZlciA9IGFzc2VydE5ldmVyO1xuICAgIHV0aWwuYXJyYXlUb0VudW0gPSAoaXRlbXMpID0+IHtcbiAgICAgICAgY29uc3Qgb2JqID0ge307XG4gICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuICAgICAgICAgICAgb2JqW2l0ZW1dID0gaXRlbTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gb2JqO1xuICAgIH07XG4gICAgdXRpbC5nZXRWYWxpZEVudW1WYWx1ZXMgPSAob2JqKSA9PiB7XG4gICAgICAgIGNvbnN0IHZhbGlkS2V5cyA9IHV0aWwub2JqZWN0S2V5cyhvYmopLmZpbHRlcigoaykgPT4gdHlwZW9mIG9ialtvYmpba11dICE9PSBcIm51bWJlclwiKTtcbiAgICAgICAgY29uc3QgZmlsdGVyZWQgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBrIG9mIHZhbGlkS2V5cykge1xuICAgICAgICAgICAgZmlsdGVyZWRba10gPSBvYmpba107XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHV0aWwub2JqZWN0VmFsdWVzKGZpbHRlcmVkKTtcbiAgICB9O1xuICAgIHV0aWwub2JqZWN0VmFsdWVzID0gKG9iaikgPT4ge1xuICAgICAgICByZXR1cm4gdXRpbC5vYmplY3RLZXlzKG9iaikubWFwKGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gb2JqW2VdO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIHV0aWwub2JqZWN0S2V5cyA9IHR5cGVvZiBPYmplY3Qua2V5cyA9PT0gXCJmdW5jdGlvblwiIC8vIGVzbGludC1kaXNhYmxlLWxpbmUgYmFuL2JhblxuICAgICAgICA/IChvYmopID0+IE9iamVjdC5rZXlzKG9iaikgLy8gZXNsaW50LWRpc2FibGUtbGluZSBiYW4vYmFuXG4gICAgICAgIDogKG9iamVjdCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qga2V5cyA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsIGtleSkpIHtcbiAgICAgICAgICAgICAgICAgICAga2V5cy5wdXNoKGtleSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGtleXM7XG4gICAgICAgIH07XG4gICAgdXRpbC5maW5kID0gKGFyciwgY2hlY2tlcikgPT4ge1xuICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgYXJyKSB7XG4gICAgICAgICAgICBpZiAoY2hlY2tlcihpdGVtKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gaXRlbTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH07XG4gICAgdXRpbC5pc0ludGVnZXIgPSB0eXBlb2YgTnVtYmVyLmlzSW50ZWdlciA9PT0gXCJmdW5jdGlvblwiXG4gICAgICAgID8gKHZhbCkgPT4gTnVtYmVyLmlzSW50ZWdlcih2YWwpIC8vIGVzbGludC1kaXNhYmxlLWxpbmUgYmFuL2JhblxuICAgICAgICA6ICh2YWwpID0+IHR5cGVvZiB2YWwgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzRmluaXRlKHZhbCkgJiYgTWF0aC5mbG9vcih2YWwpID09PSB2YWw7XG4gICAgZnVuY3Rpb24gam9pblZhbHVlcyhhcnJheSwgc2VwYXJhdG9yID0gXCIgfCBcIikge1xuICAgICAgICByZXR1cm4gYXJyYXkubWFwKCh2YWwpID0+ICh0eXBlb2YgdmFsID09PSBcInN0cmluZ1wiID8gYCcke3ZhbH0nYCA6IHZhbCkpLmpvaW4oc2VwYXJhdG9yKTtcbiAgICB9XG4gICAgdXRpbC5qb2luVmFsdWVzID0gam9pblZhbHVlcztcbiAgICB1dGlsLmpzb25TdHJpbmdpZnlSZXBsYWNlciA9IChfLCB2YWx1ZSkgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSBcImJpZ2ludFwiKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWUudG9TdHJpbmcoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfTtcbn0pKHV0aWwgfHwgKHV0aWwgPSB7fSkpO1xuZXhwb3J0IHZhciBvYmplY3RVdGlsO1xuKGZ1bmN0aW9uIChvYmplY3RVdGlsKSB7XG4gICAgb2JqZWN0VXRpbC5tZXJnZVNoYXBlcyA9IChmaXJzdCwgc2Vjb25kKSA9PiB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAuLi5maXJzdCxcbiAgICAgICAgICAgIC4uLnNlY29uZCwgLy8gc2Vjb25kIG92ZXJ3cml0ZXMgZmlyc3RcbiAgICAgICAgfTtcbiAgICB9O1xufSkob2JqZWN0VXRpbCB8fCAob2JqZWN0VXRpbCA9IHt9KSk7XG5leHBvcnQgY29uc3QgWm9kUGFyc2VkVHlwZSA9IHV0aWwuYXJyYXlUb0VudW0oW1xuICAgIFwic3RyaW5nXCIsXG4gICAgXCJuYW5cIixcbiAgICBcIm51bWJlclwiLFxuICAgIFwiaW50ZWdlclwiLFxuICAgIFwiZmxvYXRcIixcbiAgICBcImJvb2xlYW5cIixcbiAgICBcImRhdGVcIixcbiAgICBcImJpZ2ludFwiLFxuICAgIFwic3ltYm9sXCIsXG4gICAgXCJmdW5jdGlvblwiLFxuICAgIFwidW5kZWZpbmVkXCIsXG4gICAgXCJudWxsXCIsXG4gICAgXCJhcnJheVwiLFxuICAgIFwib2JqZWN0XCIsXG4gICAgXCJ1bmtub3duXCIsXG4gICAgXCJwcm9taXNlXCIsXG4gICAgXCJ2b2lkXCIsXG4gICAgXCJuZXZlclwiLFxuICAgIFwibWFwXCIsXG4gICAgXCJzZXRcIixcbl0pO1xuZXhwb3J0IGNvbnN0IGdldFBhcnNlZFR5cGUgPSAoZGF0YSkgPT4ge1xuICAgIGNvbnN0IHQgPSB0eXBlb2YgZGF0YTtcbiAgICBzd2l0Y2ggKHQpIHtcbiAgICAgICAgY2FzZSBcInVuZGVmaW5lZFwiOlxuICAgICAgICAgICAgcmV0dXJuIFpvZFBhcnNlZFR5cGUudW5kZWZpbmVkO1xuICAgICAgICBjYXNlIFwic3RyaW5nXCI6XG4gICAgICAgICAgICByZXR1cm4gWm9kUGFyc2VkVHlwZS5zdHJpbmc7XG4gICAgICAgIGNhc2UgXCJudW1iZXJcIjpcbiAgICAgICAgICAgIHJldHVybiBOdW1iZXIuaXNOYU4oZGF0YSkgPyBab2RQYXJzZWRUeXBlLm5hbiA6IFpvZFBhcnNlZFR5cGUubnVtYmVyO1xuICAgICAgICBjYXNlIFwiYm9vbGVhblwiOlxuICAgICAgICAgICAgcmV0dXJuIFpvZFBhcnNlZFR5cGUuYm9vbGVhbjtcbiAgICAgICAgY2FzZSBcImZ1bmN0aW9uXCI6XG4gICAgICAgICAgICByZXR1cm4gWm9kUGFyc2VkVHlwZS5mdW5jdGlvbjtcbiAgICAgICAgY2FzZSBcImJpZ2ludFwiOlxuICAgICAgICAgICAgcmV0dXJuIFpvZFBhcnNlZFR5cGUuYmlnaW50O1xuICAgICAgICBjYXNlIFwic3ltYm9sXCI6XG4gICAgICAgICAgICByZXR1cm4gWm9kUGFyc2VkVHlwZS5zeW1ib2w7XG4gICAgICAgIGNhc2UgXCJvYmplY3RcIjpcbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFpvZFBhcnNlZFR5cGUuYXJyYXk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZGF0YSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBab2RQYXJzZWRUeXBlLm51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZGF0YS50aGVuICYmIHR5cGVvZiBkYXRhLnRoZW4gPT09IFwiZnVuY3Rpb25cIiAmJiBkYXRhLmNhdGNoICYmIHR5cGVvZiBkYXRhLmNhdGNoID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gWm9kUGFyc2VkVHlwZS5wcm9taXNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHR5cGVvZiBNYXAgIT09IFwidW5kZWZpbmVkXCIgJiYgZGF0YSBpbnN0YW5jZW9mIE1hcCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBab2RQYXJzZWRUeXBlLm1hcDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0eXBlb2YgU2V0ICE9PSBcInVuZGVmaW5lZFwiICYmIGRhdGEgaW5zdGFuY2VvZiBTZXQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gWm9kUGFyc2VkVHlwZS5zZXQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZW9mIERhdGUgIT09IFwidW5kZWZpbmVkXCIgJiYgZGF0YSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gWm9kUGFyc2VkVHlwZS5kYXRlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFpvZFBhcnNlZFR5cGUub2JqZWN0O1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIFpvZFBhcnNlZFR5cGUudW5rbm93bjtcbiAgICB9XG59O1xuIiwiaW1wb3J0IHsgdXRpbCB9IGZyb20gXCIuL2hlbHBlcnMvdXRpbC5qc1wiO1xuZXhwb3J0IGNvbnN0IFpvZElzc3VlQ29kZSA9IHV0aWwuYXJyYXlUb0VudW0oW1xuICAgIFwiaW52YWxpZF90eXBlXCIsXG4gICAgXCJpbnZhbGlkX2xpdGVyYWxcIixcbiAgICBcImN1c3RvbVwiLFxuICAgIFwiaW52YWxpZF91bmlvblwiLFxuICAgIFwiaW52YWxpZF91bmlvbl9kaXNjcmltaW5hdG9yXCIsXG4gICAgXCJpbnZhbGlkX2VudW1fdmFsdWVcIixcbiAgICBcInVucmVjb2duaXplZF9rZXlzXCIsXG4gICAgXCJpbnZhbGlkX2FyZ3VtZW50c1wiLFxuICAgIFwiaW52YWxpZF9yZXR1cm5fdHlwZVwiLFxuICAgIFwiaW52YWxpZF9kYXRlXCIsXG4gICAgXCJpbnZhbGlkX3N0cmluZ1wiLFxuICAgIFwidG9vX3NtYWxsXCIsXG4gICAgXCJ0b29fYmlnXCIsXG4gICAgXCJpbnZhbGlkX2ludGVyc2VjdGlvbl90eXBlc1wiLFxuICAgIFwibm90X211bHRpcGxlX29mXCIsXG4gICAgXCJub3RfZmluaXRlXCIsXG5dKTtcbmV4cG9ydCBjb25zdCBxdW90ZWxlc3NKc29uID0gKG9iaikgPT4ge1xuICAgIGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShvYmosIG51bGwsIDIpO1xuICAgIHJldHVybiBqc29uLnJlcGxhY2UoL1wiKFteXCJdKylcIjovZywgXCIkMTpcIik7XG59O1xuZXhwb3J0IGNsYXNzIFpvZEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICAgIGdldCBlcnJvcnMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmlzc3VlcztcbiAgICB9XG4gICAgY29uc3RydWN0b3IoaXNzdWVzKSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgICAgIHRoaXMuaXNzdWVzID0gW107XG4gICAgICAgIHRoaXMuYWRkSXNzdWUgPSAoc3ViKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmlzc3VlcyA9IFsuLi50aGlzLmlzc3Vlcywgc3ViXTtcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5hZGRJc3N1ZXMgPSAoc3VicyA9IFtdKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmlzc3VlcyA9IFsuLi50aGlzLmlzc3VlcywgLi4uc3Vic107XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGFjdHVhbFByb3RvID0gbmV3LnRhcmdldC5wcm90b3R5cGU7XG4gICAgICAgIGlmIChPYmplY3Quc2V0UHJvdG90eXBlT2YpIHtcbiAgICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBiYW4vYmFuXG4gICAgICAgICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2YodGhpcywgYWN0dWFsUHJvdG8pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fX3Byb3RvX18gPSBhY3R1YWxQcm90bztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm5hbWUgPSBcIlpvZEVycm9yXCI7XG4gICAgICAgIHRoaXMuaXNzdWVzID0gaXNzdWVzO1xuICAgIH1cbiAgICBmb3JtYXQoX21hcHBlcikge1xuICAgICAgICBjb25zdCBtYXBwZXIgPSBfbWFwcGVyIHx8XG4gICAgICAgICAgICBmdW5jdGlvbiAoaXNzdWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaXNzdWUubWVzc2FnZTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIGNvbnN0IGZpZWxkRXJyb3JzID0geyBfZXJyb3JzOiBbXSB9O1xuICAgICAgICBjb25zdCBwcm9jZXNzRXJyb3IgPSAoZXJyb3IpID0+IHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgaXNzdWUgb2YgZXJyb3IuaXNzdWVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzc3VlLmNvZGUgPT09IFwiaW52YWxpZF91bmlvblwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGlzc3VlLnVuaW9uRXJyb3JzLm1hcChwcm9jZXNzRXJyb3IpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChpc3N1ZS5jb2RlID09PSBcImludmFsaWRfcmV0dXJuX3R5cGVcIikge1xuICAgICAgICAgICAgICAgICAgICBwcm9jZXNzRXJyb3IoaXNzdWUucmV0dXJuVHlwZUVycm9yKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoaXNzdWUuY29kZSA9PT0gXCJpbnZhbGlkX2FyZ3VtZW50c1wiKSB7XG4gICAgICAgICAgICAgICAgICAgIHByb2Nlc3NFcnJvcihpc3N1ZS5hcmd1bWVudHNFcnJvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGlzc3VlLnBhdGgubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpZWxkRXJyb3JzLl9lcnJvcnMucHVzaChtYXBwZXIoaXNzdWUpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBjdXJyID0gZmllbGRFcnJvcnM7XG4gICAgICAgICAgICAgICAgICAgIGxldCBpID0gMDtcbiAgICAgICAgICAgICAgICAgICAgd2hpbGUgKGkgPCBpc3N1ZS5wYXRoLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZWwgPSBpc3N1ZS5wYXRoW2ldO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdGVybWluYWwgPSBpID09PSBpc3N1ZS5wYXRoLmxlbmd0aCAtIDE7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRlcm1pbmFsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VycltlbF0gPSBjdXJyW2VsXSB8fCB7IF9lcnJvcnM6IFtdIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgKHR5cGVvZiBlbCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgY3VycltlbF0gPSBjdXJyW2VsXSB8fCB7IF9lcnJvcnM6IFtdIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gfSBlbHNlIGlmICh0eXBlb2YgZWwgPT09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgIGNvbnN0IGVycm9yQXJyYXk6IGFueSA9IFtdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgZXJyb3JBcnJheS5fZXJyb3JzID0gW107XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICBjdXJyW2VsXSA9IGN1cnJbZWxdIHx8IGVycm9yQXJyYXk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VycltlbF0gPSBjdXJyW2VsXSB8fCB7IF9lcnJvcnM6IFtdIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VycltlbF0uX2Vycm9ycy5wdXNoKG1hcHBlcihpc3N1ZSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY3VyciA9IGN1cnJbZWxdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaSsrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBwcm9jZXNzRXJyb3IodGhpcyk7XG4gICAgICAgIHJldHVybiBmaWVsZEVycm9ycztcbiAgICB9XG4gICAgc3RhdGljIGFzc2VydCh2YWx1ZSkge1xuICAgICAgICBpZiAoISh2YWx1ZSBpbnN0YW5jZW9mIFpvZEVycm9yKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBOb3QgYSBab2RFcnJvcjogJHt2YWx1ZX1gKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB0b1N0cmluZygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubWVzc2FnZTtcbiAgICB9XG4gICAgZ2V0IG1lc3NhZ2UoKSB7XG4gICAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeSh0aGlzLmlzc3VlcywgdXRpbC5qc29uU3RyaW5naWZ5UmVwbGFjZXIsIDIpO1xuICAgIH1cbiAgICBnZXQgaXNFbXB0eSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNzdWVzLmxlbmd0aCA9PT0gMDtcbiAgICB9XG4gICAgZmxhdHRlbihtYXBwZXIgPSAoaXNzdWUpID0+IGlzc3VlLm1lc3NhZ2UpIHtcbiAgICAgICAgY29uc3QgZmllbGRFcnJvcnMgPSB7fTtcbiAgICAgICAgY29uc3QgZm9ybUVycm9ycyA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IHN1YiBvZiB0aGlzLmlzc3Vlcykge1xuICAgICAgICAgICAgaWYgKHN1Yi5wYXRoLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmaXJzdEVsID0gc3ViLnBhdGhbMF07XG4gICAgICAgICAgICAgICAgZmllbGRFcnJvcnNbZmlyc3RFbF0gPSBmaWVsZEVycm9yc1tmaXJzdEVsXSB8fCBbXTtcbiAgICAgICAgICAgICAgICBmaWVsZEVycm9yc1tmaXJzdEVsXS5wdXNoKG1hcHBlcihzdWIpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGZvcm1FcnJvcnMucHVzaChtYXBwZXIoc3ViKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgZm9ybUVycm9ycywgZmllbGRFcnJvcnMgfTtcbiAgICB9XG4gICAgZ2V0IGZvcm1FcnJvcnMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZsYXR0ZW4oKTtcbiAgICB9XG59XG5ab2RFcnJvci5jcmVhdGUgPSAoaXNzdWVzKSA9PiB7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgWm9kRXJyb3IoaXNzdWVzKTtcbiAgICByZXR1cm4gZXJyb3I7XG59O1xuIiwiaW1wb3J0IHsgWm9kSXNzdWVDb2RlIH0gZnJvbSBcIi4uL1pvZEVycm9yLmpzXCI7XG5pbXBvcnQgeyB1dGlsLCBab2RQYXJzZWRUeXBlIH0gZnJvbSBcIi4uL2hlbHBlcnMvdXRpbC5qc1wiO1xuY29uc3QgZXJyb3JNYXAgPSAoaXNzdWUsIF9jdHgpID0+IHtcbiAgICBsZXQgbWVzc2FnZTtcbiAgICBzd2l0Y2ggKGlzc3VlLmNvZGUpIHtcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlOlxuICAgICAgICAgICAgaWYgKGlzc3VlLnJlY2VpdmVkID09PSBab2RQYXJzZWRUeXBlLnVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBcIlJlcXVpcmVkXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gYEV4cGVjdGVkICR7aXNzdWUuZXhwZWN0ZWR9LCByZWNlaXZlZCAke2lzc3VlLnJlY2VpdmVkfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUuaW52YWxpZF9saXRlcmFsOlxuICAgICAgICAgICAgbWVzc2FnZSA9IGBJbnZhbGlkIGxpdGVyYWwgdmFsdWUsIGV4cGVjdGVkICR7SlNPTi5zdHJpbmdpZnkoaXNzdWUuZXhwZWN0ZWQsIHV0aWwuanNvblN0cmluZ2lmeVJlcGxhY2VyKX1gO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLnVucmVjb2duaXplZF9rZXlzOlxuICAgICAgICAgICAgbWVzc2FnZSA9IGBVbnJlY29nbml6ZWQga2V5KHMpIGluIG9iamVjdDogJHt1dGlsLmpvaW5WYWx1ZXMoaXNzdWUua2V5cywgXCIsIFwiKX1gO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLmludmFsaWRfdW5pb246XG4gICAgICAgICAgICBtZXNzYWdlID0gYEludmFsaWQgaW5wdXRgO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLmludmFsaWRfdW5pb25fZGlzY3JpbWluYXRvcjpcbiAgICAgICAgICAgIG1lc3NhZ2UgPSBgSW52YWxpZCBkaXNjcmltaW5hdG9yIHZhbHVlLiBFeHBlY3RlZCAke3V0aWwuam9pblZhbHVlcyhpc3N1ZS5vcHRpb25zKX1gO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLmludmFsaWRfZW51bV92YWx1ZTpcbiAgICAgICAgICAgIG1lc3NhZ2UgPSBgSW52YWxpZCBlbnVtIHZhbHVlLiBFeHBlY3RlZCAke3V0aWwuam9pblZhbHVlcyhpc3N1ZS5vcHRpb25zKX0sIHJlY2VpdmVkICcke2lzc3VlLnJlY2VpdmVkfSdgO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLmludmFsaWRfYXJndW1lbnRzOlxuICAgICAgICAgICAgbWVzc2FnZSA9IGBJbnZhbGlkIGZ1bmN0aW9uIGFyZ3VtZW50c2A7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUuaW52YWxpZF9yZXR1cm5fdHlwZTpcbiAgICAgICAgICAgIG1lc3NhZ2UgPSBgSW52YWxpZCBmdW5jdGlvbiByZXR1cm4gdHlwZWA7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUuaW52YWxpZF9kYXRlOlxuICAgICAgICAgICAgbWVzc2FnZSA9IGBJbnZhbGlkIGRhdGVgO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nOlxuICAgICAgICAgICAgaWYgKHR5cGVvZiBpc3N1ZS52YWxpZGF0aW9uID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKFwiaW5jbHVkZXNcIiBpbiBpc3N1ZS52YWxpZGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgSW52YWxpZCBpbnB1dDogbXVzdCBpbmNsdWRlIFwiJHtpc3N1ZS52YWxpZGF0aW9uLmluY2x1ZGVzfVwiYDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpc3N1ZS52YWxpZGF0aW9uLnBvc2l0aW9uID09PSBcIm51bWJlclwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlID0gYCR7bWVzc2FnZX0gYXQgb25lIG9yIG1vcmUgcG9zaXRpb25zIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byAke2lzc3VlLnZhbGlkYXRpb24ucG9zaXRpb259YDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChcInN0YXJ0c1dpdGhcIiBpbiBpc3N1ZS52YWxpZGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgSW52YWxpZCBpbnB1dDogbXVzdCBzdGFydCB3aXRoIFwiJHtpc3N1ZS52YWxpZGF0aW9uLnN0YXJ0c1dpdGh9XCJgO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChcImVuZHNXaXRoXCIgaW4gaXNzdWUudmFsaWRhdGlvbikge1xuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlID0gYEludmFsaWQgaW5wdXQ6IG11c3QgZW5kIHdpdGggXCIke2lzc3VlLnZhbGlkYXRpb24uZW5kc1dpdGh9XCJgO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdXRpbC5hc3NlcnROZXZlcihpc3N1ZS52YWxpZGF0aW9uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpc3N1ZS52YWxpZGF0aW9uICE9PSBcInJlZ2V4XCIpIHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gYEludmFsaWQgJHtpc3N1ZS52YWxpZGF0aW9ufWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gXCJJbnZhbGlkXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUudG9vX3NtYWxsOlxuICAgICAgICAgICAgaWYgKGlzc3VlLnR5cGUgPT09IFwiYXJyYXlcIilcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gYEFycmF5IG11c3QgY29udGFpbiAke2lzc3VlLmV4YWN0ID8gXCJleGFjdGx5XCIgOiBpc3N1ZS5pbmNsdXNpdmUgPyBgYXQgbGVhc3RgIDogYG1vcmUgdGhhbmB9ICR7aXNzdWUubWluaW11bX0gZWxlbWVudChzKWA7XG4gICAgICAgICAgICBlbHNlIGlmIChpc3N1ZS50eXBlID09PSBcInN0cmluZ1wiKVxuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgU3RyaW5nIG11c3QgY29udGFpbiAke2lzc3VlLmV4YWN0ID8gXCJleGFjdGx5XCIgOiBpc3N1ZS5pbmNsdXNpdmUgPyBgYXQgbGVhc3RgIDogYG92ZXJgfSAke2lzc3VlLm1pbmltdW19IGNoYXJhY3RlcihzKWA7XG4gICAgICAgICAgICBlbHNlIGlmIChpc3N1ZS50eXBlID09PSBcIm51bWJlclwiKVxuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgTnVtYmVyIG11c3QgYmUgJHtpc3N1ZS5leGFjdCA/IGBleGFjdGx5IGVxdWFsIHRvIGAgOiBpc3N1ZS5pbmNsdXNpdmUgPyBgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIGAgOiBgZ3JlYXRlciB0aGFuIGB9JHtpc3N1ZS5taW5pbXVtfWA7XG4gICAgICAgICAgICBlbHNlIGlmIChpc3N1ZS50eXBlID09PSBcImJpZ2ludFwiKVxuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgTnVtYmVyIG11c3QgYmUgJHtpc3N1ZS5leGFjdCA/IGBleGFjdGx5IGVxdWFsIHRvIGAgOiBpc3N1ZS5pbmNsdXNpdmUgPyBgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIGAgOiBgZ3JlYXRlciB0aGFuIGB9JHtpc3N1ZS5taW5pbXVtfWA7XG4gICAgICAgICAgICBlbHNlIGlmIChpc3N1ZS50eXBlID09PSBcImRhdGVcIilcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gYERhdGUgbXVzdCBiZSAke2lzc3VlLmV4YWN0ID8gYGV4YWN0bHkgZXF1YWwgdG8gYCA6IGlzc3VlLmluY2x1c2l2ZSA/IGBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gYCA6IGBncmVhdGVyIHRoYW4gYH0ke25ldyBEYXRlKE51bWJlcihpc3N1ZS5taW5pbXVtKSl9YDtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gXCJJbnZhbGlkIGlucHV0XCI7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUudG9vX2JpZzpcbiAgICAgICAgICAgIGlmIChpc3N1ZS50eXBlID09PSBcImFycmF5XCIpXG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IGBBcnJheSBtdXN0IGNvbnRhaW4gJHtpc3N1ZS5leGFjdCA/IGBleGFjdGx5YCA6IGlzc3VlLmluY2x1c2l2ZSA/IGBhdCBtb3N0YCA6IGBsZXNzIHRoYW5gfSAke2lzc3VlLm1heGltdW19IGVsZW1lbnQocylgO1xuICAgICAgICAgICAgZWxzZSBpZiAoaXNzdWUudHlwZSA9PT0gXCJzdHJpbmdcIilcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gYFN0cmluZyBtdXN0IGNvbnRhaW4gJHtpc3N1ZS5leGFjdCA/IGBleGFjdGx5YCA6IGlzc3VlLmluY2x1c2l2ZSA/IGBhdCBtb3N0YCA6IGB1bmRlcmB9ICR7aXNzdWUubWF4aW11bX0gY2hhcmFjdGVyKHMpYDtcbiAgICAgICAgICAgIGVsc2UgaWYgKGlzc3VlLnR5cGUgPT09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IGBOdW1iZXIgbXVzdCBiZSAke2lzc3VlLmV4YWN0ID8gYGV4YWN0bHlgIDogaXNzdWUuaW5jbHVzaXZlID8gYGxlc3MgdGhhbiBvciBlcXVhbCB0b2AgOiBgbGVzcyB0aGFuYH0gJHtpc3N1ZS5tYXhpbXVtfWA7XG4gICAgICAgICAgICBlbHNlIGlmIChpc3N1ZS50eXBlID09PSBcImJpZ2ludFwiKVxuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBgQmlnSW50IG11c3QgYmUgJHtpc3N1ZS5leGFjdCA/IGBleGFjdGx5YCA6IGlzc3VlLmluY2x1c2l2ZSA/IGBsZXNzIHRoYW4gb3IgZXF1YWwgdG9gIDogYGxlc3MgdGhhbmB9ICR7aXNzdWUubWF4aW11bX1gO1xuICAgICAgICAgICAgZWxzZSBpZiAoaXNzdWUudHlwZSA9PT0gXCJkYXRlXCIpXG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IGBEYXRlIG11c3QgYmUgJHtpc3N1ZS5leGFjdCA/IGBleGFjdGx5YCA6IGlzc3VlLmluY2x1c2l2ZSA/IGBzbWFsbGVyIHRoYW4gb3IgZXF1YWwgdG9gIDogYHNtYWxsZXIgdGhhbmB9ICR7bmV3IERhdGUoTnVtYmVyKGlzc3VlLm1heGltdW0pKX1gO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBcIkludmFsaWQgaW5wdXRcIjtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS5jdXN0b206XG4gICAgICAgICAgICBtZXNzYWdlID0gYEludmFsaWQgaW5wdXRgO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgWm9kSXNzdWVDb2RlLmludmFsaWRfaW50ZXJzZWN0aW9uX3R5cGVzOlxuICAgICAgICAgICAgbWVzc2FnZSA9IGBJbnRlcnNlY3Rpb24gcmVzdWx0cyBjb3VsZCBub3QgYmUgbWVyZ2VkYDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFpvZElzc3VlQ29kZS5ub3RfbXVsdGlwbGVfb2Y6XG4gICAgICAgICAgICBtZXNzYWdlID0gYE51bWJlciBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgJHtpc3N1ZS5tdWx0aXBsZU9mfWA7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBab2RJc3N1ZUNvZGUubm90X2Zpbml0ZTpcbiAgICAgICAgICAgIG1lc3NhZ2UgPSBcIk51bWJlciBtdXN0IGJlIGZpbml0ZVwiO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBtZXNzYWdlID0gX2N0eC5kZWZhdWx0RXJyb3I7XG4gICAgICAgICAgICB1dGlsLmFzc2VydE5ldmVyKGlzc3VlKTtcbiAgICB9XG4gICAgcmV0dXJuIHsgbWVzc2FnZSB9O1xufTtcbmV4cG9ydCBkZWZhdWx0IGVycm9yTWFwO1xuIiwiaW1wb3J0IGRlZmF1bHRFcnJvck1hcCBmcm9tIFwiLi9sb2NhbGVzL2VuLmpzXCI7XG5sZXQgb3ZlcnJpZGVFcnJvck1hcCA9IGRlZmF1bHRFcnJvck1hcDtcbmV4cG9ydCB7IGRlZmF1bHRFcnJvck1hcCB9O1xuZXhwb3J0IGZ1bmN0aW9uIHNldEVycm9yTWFwKG1hcCkge1xuICAgIG92ZXJyaWRlRXJyb3JNYXAgPSBtYXA7XG59XG5leHBvcnQgZnVuY3Rpb24gZ2V0RXJyb3JNYXAoKSB7XG4gICAgcmV0dXJuIG92ZXJyaWRlRXJyb3JNYXA7XG59XG4iLCJpbXBvcnQgeyBnZXRFcnJvck1hcCB9IGZyb20gXCIuLi9lcnJvcnMuanNcIjtcbmltcG9ydCBkZWZhdWx0RXJyb3JNYXAgZnJvbSBcIi4uL2xvY2FsZXMvZW4uanNcIjtcbmV4cG9ydCBjb25zdCBtYWtlSXNzdWUgPSAocGFyYW1zKSA9PiB7XG4gICAgY29uc3QgeyBkYXRhLCBwYXRoLCBlcnJvck1hcHMsIGlzc3VlRGF0YSB9ID0gcGFyYW1zO1xuICAgIGNvbnN0IGZ1bGxQYXRoID0gWy4uLnBhdGgsIC4uLihpc3N1ZURhdGEucGF0aCB8fCBbXSldO1xuICAgIGNvbnN0IGZ1bGxJc3N1ZSA9IHtcbiAgICAgICAgLi4uaXNzdWVEYXRhLFxuICAgICAgICBwYXRoOiBmdWxsUGF0aCxcbiAgICB9O1xuICAgIGlmIChpc3N1ZURhdGEubWVzc2FnZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAuLi5pc3N1ZURhdGEsXG4gICAgICAgICAgICBwYXRoOiBmdWxsUGF0aCxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGlzc3VlRGF0YS5tZXNzYWdlLFxuICAgICAgICB9O1xuICAgIH1cbiAgICBsZXQgZXJyb3JNZXNzYWdlID0gXCJcIjtcbiAgICBjb25zdCBtYXBzID0gZXJyb3JNYXBzXG4gICAgICAgIC5maWx0ZXIoKG0pID0+ICEhbSlcbiAgICAgICAgLnNsaWNlKClcbiAgICAgICAgLnJldmVyc2UoKTtcbiAgICBmb3IgKGNvbnN0IG1hcCBvZiBtYXBzKSB7XG4gICAgICAgIGVycm9yTWVzc2FnZSA9IG1hcChmdWxsSXNzdWUsIHsgZGF0YSwgZGVmYXVsdEVycm9yOiBlcnJvck1lc3NhZ2UgfSkubWVzc2FnZTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgLi4uaXNzdWVEYXRhLFxuICAgICAgICBwYXRoOiBmdWxsUGF0aCxcbiAgICAgICAgbWVzc2FnZTogZXJyb3JNZXNzYWdlLFxuICAgIH07XG59O1xuZXhwb3J0IGNvbnN0IEVNUFRZX1BBVEggPSBbXTtcbmV4cG9ydCBmdW5jdGlvbiBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIGlzc3VlRGF0YSkge1xuICAgIGNvbnN0IG92ZXJyaWRlTWFwID0gZ2V0RXJyb3JNYXAoKTtcbiAgICBjb25zdCBpc3N1ZSA9IG1ha2VJc3N1ZSh7XG4gICAgICAgIGlzc3VlRGF0YTogaXNzdWVEYXRhLFxuICAgICAgICBkYXRhOiBjdHguZGF0YSxcbiAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgIGVycm9yTWFwczogW1xuICAgICAgICAgICAgY3R4LmNvbW1vbi5jb250ZXh0dWFsRXJyb3JNYXAsIC8vIGNvbnRleHR1YWwgZXJyb3IgbWFwIGlzIGZpcnN0IHByaW9yaXR5XG4gICAgICAgICAgICBjdHguc2NoZW1hRXJyb3JNYXAsIC8vIHRoZW4gc2NoZW1hLWJvdW5kIG1hcCBpZiBhdmFpbGFibGVcbiAgICAgICAgICAgIG92ZXJyaWRlTWFwLCAvLyB0aGVuIGdsb2JhbCBvdmVycmlkZSBtYXBcbiAgICAgICAgICAgIG92ZXJyaWRlTWFwID09PSBkZWZhdWx0RXJyb3JNYXAgPyB1bmRlZmluZWQgOiBkZWZhdWx0RXJyb3JNYXAsIC8vIHRoZW4gZ2xvYmFsIGRlZmF1bHQgbWFwXG4gICAgICAgIF0uZmlsdGVyKCh4KSA9PiAhIXgpLFxuICAgIH0pO1xuICAgIGN0eC5jb21tb24uaXNzdWVzLnB1c2goaXNzdWUpO1xufVxuZXhwb3J0IGNsYXNzIFBhcnNlU3RhdHVzIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy52YWx1ZSA9IFwidmFsaWRcIjtcbiAgICB9XG4gICAgZGlydHkoKSB7XG4gICAgICAgIGlmICh0aGlzLnZhbHVlID09PSBcInZhbGlkXCIpXG4gICAgICAgICAgICB0aGlzLnZhbHVlID0gXCJkaXJ0eVwiO1xuICAgIH1cbiAgICBhYm9ydCgpIHtcbiAgICAgICAgaWYgKHRoaXMudmFsdWUgIT09IFwiYWJvcnRlZFwiKVxuICAgICAgICAgICAgdGhpcy52YWx1ZSA9IFwiYWJvcnRlZFwiO1xuICAgIH1cbiAgICBzdGF0aWMgbWVyZ2VBcnJheShzdGF0dXMsIHJlc3VsdHMpIHtcbiAgICAgICAgY29uc3QgYXJyYXlWYWx1ZSA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IHMgb2YgcmVzdWx0cykge1xuICAgICAgICAgICAgaWYgKHMuc3RhdHVzID09PSBcImFib3J0ZWRcIilcbiAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgIGlmIChzLnN0YXR1cyA9PT0gXCJkaXJ0eVwiKVxuICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgYXJyYXlWYWx1ZS5wdXNoKHMudmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN0YXR1czogc3RhdHVzLnZhbHVlLCB2YWx1ZTogYXJyYXlWYWx1ZSB9O1xuICAgIH1cbiAgICBzdGF0aWMgYXN5bmMgbWVyZ2VPYmplY3RBc3luYyhzdGF0dXMsIHBhaXJzKSB7XG4gICAgICAgIGNvbnN0IHN5bmNQYWlycyA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IHBhaXIgb2YgcGFpcnMpIHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGF3YWl0IHBhaXIua2V5O1xuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBhd2FpdCBwYWlyLnZhbHVlO1xuICAgICAgICAgICAgc3luY1BhaXJzLnB1c2goe1xuICAgICAgICAgICAgICAgIGtleSxcbiAgICAgICAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBQYXJzZVN0YXR1cy5tZXJnZU9iamVjdFN5bmMoc3RhdHVzLCBzeW5jUGFpcnMpO1xuICAgIH1cbiAgICBzdGF0aWMgbWVyZ2VPYmplY3RTeW5jKHN0YXR1cywgcGFpcnMpIHtcbiAgICAgICAgY29uc3QgZmluYWxPYmplY3QgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBwYWlyIG9mIHBhaXJzKSB7XG4gICAgICAgICAgICBjb25zdCB7IGtleSwgdmFsdWUgfSA9IHBhaXI7XG4gICAgICAgICAgICBpZiAoa2V5LnN0YXR1cyA9PT0gXCJhYm9ydGVkXCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICBpZiAodmFsdWUuc3RhdHVzID09PSBcImFib3J0ZWRcIilcbiAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgIGlmIChrZXkuc3RhdHVzID09PSBcImRpcnR5XCIpXG4gICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICBpZiAodmFsdWUuc3RhdHVzID09PSBcImRpcnR5XCIpXG4gICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICBpZiAoa2V5LnZhbHVlICE9PSBcIl9fcHJvdG9fX1wiICYmICh0eXBlb2YgdmFsdWUudmFsdWUgIT09IFwidW5kZWZpbmVkXCIgfHwgcGFpci5hbHdheXNTZXQpKSB7XG4gICAgICAgICAgICAgICAgZmluYWxPYmplY3Rba2V5LnZhbHVlXSA9IHZhbHVlLnZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN0YXR1czogc3RhdHVzLnZhbHVlLCB2YWx1ZTogZmluYWxPYmplY3QgfTtcbiAgICB9XG59XG5leHBvcnQgY29uc3QgSU5WQUxJRCA9IE9iamVjdC5mcmVlemUoe1xuICAgIHN0YXR1czogXCJhYm9ydGVkXCIsXG59KTtcbmV4cG9ydCBjb25zdCBESVJUWSA9ICh2YWx1ZSkgPT4gKHsgc3RhdHVzOiBcImRpcnR5XCIsIHZhbHVlIH0pO1xuZXhwb3J0IGNvbnN0IE9LID0gKHZhbHVlKSA9PiAoeyBzdGF0dXM6IFwidmFsaWRcIiwgdmFsdWUgfSk7XG5leHBvcnQgY29uc3QgaXNBYm9ydGVkID0gKHgpID0+IHguc3RhdHVzID09PSBcImFib3J0ZWRcIjtcbmV4cG9ydCBjb25zdCBpc0RpcnR5ID0gKHgpID0+IHguc3RhdHVzID09PSBcImRpcnR5XCI7XG5leHBvcnQgY29uc3QgaXNWYWxpZCA9ICh4KSA9PiB4LnN0YXR1cyA9PT0gXCJ2YWxpZFwiO1xuZXhwb3J0IGNvbnN0IGlzQXN5bmMgPSAoeCkgPT4gdHlwZW9mIFByb21pc2UgIT09IFwidW5kZWZpbmVkXCIgJiYgeCBpbnN0YW5jZW9mIFByb21pc2U7XG4iLCJleHBvcnQgdmFyIGVycm9yVXRpbDtcbihmdW5jdGlvbiAoZXJyb3JVdGlsKSB7XG4gICAgZXJyb3JVdGlsLmVyclRvT2JqID0gKG1lc3NhZ2UpID0+IHR5cGVvZiBtZXNzYWdlID09PSBcInN0cmluZ1wiID8geyBtZXNzYWdlIH0gOiBtZXNzYWdlIHx8IHt9O1xuICAgIC8vIGJpb21lLWlnbm9yZSBsaW50OlxuICAgIGVycm9yVXRpbC50b1N0cmluZyA9IChtZXNzYWdlKSA9PiB0eXBlb2YgbWVzc2FnZSA9PT0gXCJzdHJpbmdcIiA/IG1lc3NhZ2UgOiBtZXNzYWdlPy5tZXNzYWdlO1xufSkoZXJyb3JVdGlsIHx8IChlcnJvclV0aWwgPSB7fSkpO1xuIiwiaW1wb3J0IHsgWm9kRXJyb3IsIFpvZElzc3VlQ29kZSwgfSBmcm9tIFwiLi9ab2RFcnJvci5qc1wiO1xuaW1wb3J0IHsgZGVmYXVsdEVycm9yTWFwLCBnZXRFcnJvck1hcCB9IGZyb20gXCIuL2Vycm9ycy5qc1wiO1xuaW1wb3J0IHsgZXJyb3JVdGlsIH0gZnJvbSBcIi4vaGVscGVycy9lcnJvclV0aWwuanNcIjtcbmltcG9ydCB7IERJUlRZLCBJTlZBTElELCBPSywgUGFyc2VTdGF0dXMsIGFkZElzc3VlVG9Db250ZXh0LCBpc0Fib3J0ZWQsIGlzQXN5bmMsIGlzRGlydHksIGlzVmFsaWQsIG1ha2VJc3N1ZSwgfSBmcm9tIFwiLi9oZWxwZXJzL3BhcnNlVXRpbC5qc1wiO1xuaW1wb3J0IHsgdXRpbCwgWm9kUGFyc2VkVHlwZSwgZ2V0UGFyc2VkVHlwZSB9IGZyb20gXCIuL2hlbHBlcnMvdXRpbC5qc1wiO1xuY2xhc3MgUGFyc2VJbnB1dExhenlQYXRoIHtcbiAgICBjb25zdHJ1Y3RvcihwYXJlbnQsIHZhbHVlLCBwYXRoLCBrZXkpIHtcbiAgICAgICAgdGhpcy5fY2FjaGVkUGF0aCA9IFtdO1xuICAgICAgICB0aGlzLnBhcmVudCA9IHBhcmVudDtcbiAgICAgICAgdGhpcy5kYXRhID0gdmFsdWU7XG4gICAgICAgIHRoaXMuX3BhdGggPSBwYXRoO1xuICAgICAgICB0aGlzLl9rZXkgPSBrZXk7XG4gICAgfVxuICAgIGdldCBwYXRoKCkge1xuICAgICAgICBpZiAoIXRoaXMuX2NhY2hlZFBhdGgubGVuZ3RoKSB7XG4gICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh0aGlzLl9rZXkpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fY2FjaGVkUGF0aC5wdXNoKC4uLnRoaXMuX3BhdGgsIC4uLnRoaXMuX2tleSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9jYWNoZWRQYXRoLnB1c2goLi4udGhpcy5fcGF0aCwgdGhpcy5fa2V5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5fY2FjaGVkUGF0aDtcbiAgICB9XG59XG5jb25zdCBoYW5kbGVSZXN1bHQgPSAoY3R4LCByZXN1bHQpID0+IHtcbiAgICBpZiAoaXNWYWxpZChyZXN1bHQpKSB7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHJlc3VsdC52YWx1ZSB9O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgaWYgKCFjdHguY29tbW9uLmlzc3Vlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlZhbGlkYXRpb24gZmFpbGVkIGJ1dCBubyBpc3N1ZXMgZGV0ZWN0ZWQuXCIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgIGdldCBlcnJvcigpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5fZXJyb3IpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9lcnJvcjtcbiAgICAgICAgICAgICAgICBjb25zdCBlcnJvciA9IG5ldyBab2RFcnJvcihjdHguY29tbW9uLmlzc3Vlcyk7XG4gICAgICAgICAgICAgICAgdGhpcy5fZXJyb3IgPSBlcnJvcjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fZXJyb3I7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH1cbn07XG5mdW5jdGlvbiBwcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcykge1xuICAgIGlmICghcGFyYW1zKVxuICAgICAgICByZXR1cm4ge307XG4gICAgY29uc3QgeyBlcnJvck1hcCwgaW52YWxpZF90eXBlX2Vycm9yLCByZXF1aXJlZF9lcnJvciwgZGVzY3JpcHRpb24gfSA9IHBhcmFtcztcbiAgICBpZiAoZXJyb3JNYXAgJiYgKGludmFsaWRfdHlwZV9lcnJvciB8fCByZXF1aXJlZF9lcnJvcikpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW4ndCB1c2UgXCJpbnZhbGlkX3R5cGVfZXJyb3JcIiBvciBcInJlcXVpcmVkX2Vycm9yXCIgaW4gY29uanVuY3Rpb24gd2l0aCBjdXN0b20gZXJyb3IgbWFwLmApO1xuICAgIH1cbiAgICBpZiAoZXJyb3JNYXApXG4gICAgICAgIHJldHVybiB7IGVycm9yTWFwOiBlcnJvck1hcCwgZGVzY3JpcHRpb24gfTtcbiAgICBjb25zdCBjdXN0b21NYXAgPSAoaXNzLCBjdHgpID0+IHtcbiAgICAgICAgY29uc3QgeyBtZXNzYWdlIH0gPSBwYXJhbXM7XG4gICAgICAgIGlmIChpc3MuY29kZSA9PT0gXCJpbnZhbGlkX2VudW1fdmFsdWVcIikge1xuICAgICAgICAgICAgcmV0dXJuIHsgbWVzc2FnZTogbWVzc2FnZSA/PyBjdHguZGVmYXVsdEVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBjdHguZGF0YSA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgcmV0dXJuIHsgbWVzc2FnZTogbWVzc2FnZSA/PyByZXF1aXJlZF9lcnJvciA/PyBjdHguZGVmYXVsdEVycm9yIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlzcy5jb2RlICE9PSBcImludmFsaWRfdHlwZVwiKVxuICAgICAgICAgICAgcmV0dXJuIHsgbWVzc2FnZTogY3R4LmRlZmF1bHRFcnJvciB9O1xuICAgICAgICByZXR1cm4geyBtZXNzYWdlOiBtZXNzYWdlID8/IGludmFsaWRfdHlwZV9lcnJvciA/PyBjdHguZGVmYXVsdEVycm9yIH07XG4gICAgfTtcbiAgICByZXR1cm4geyBlcnJvck1hcDogY3VzdG9tTWFwLCBkZXNjcmlwdGlvbiB9O1xufVxuZXhwb3J0IGNsYXNzIFpvZFR5cGUge1xuICAgIGdldCBkZXNjcmlwdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5kZXNjcmlwdGlvbjtcbiAgICB9XG4gICAgX2dldFR5cGUoaW5wdXQpIHtcbiAgICAgICAgcmV0dXJuIGdldFBhcnNlZFR5cGUoaW5wdXQuZGF0YSk7XG4gICAgfVxuICAgIF9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KSB7XG4gICAgICAgIHJldHVybiAoY3R4IHx8IHtcbiAgICAgICAgICAgIGNvbW1vbjogaW5wdXQucGFyZW50LmNvbW1vbixcbiAgICAgICAgICAgIGRhdGE6IGlucHV0LmRhdGEsXG4gICAgICAgICAgICBwYXJzZWRUeXBlOiBnZXRQYXJzZWRUeXBlKGlucHV0LmRhdGEpLFxuICAgICAgICAgICAgc2NoZW1hRXJyb3JNYXA6IHRoaXMuX2RlZi5lcnJvck1hcCxcbiAgICAgICAgICAgIHBhdGg6IGlucHV0LnBhdGgsXG4gICAgICAgICAgICBwYXJlbnQ6IGlucHV0LnBhcmVudCxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIF9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0YXR1czogbmV3IFBhcnNlU3RhdHVzKCksXG4gICAgICAgICAgICBjdHg6IHtcbiAgICAgICAgICAgICAgICBjb21tb246IGlucHV0LnBhcmVudC5jb21tb24sXG4gICAgICAgICAgICAgICAgZGF0YTogaW5wdXQuZGF0YSxcbiAgICAgICAgICAgICAgICBwYXJzZWRUeXBlOiBnZXRQYXJzZWRUeXBlKGlucHV0LmRhdGEpLFxuICAgICAgICAgICAgICAgIHNjaGVtYUVycm9yTWFwOiB0aGlzLl9kZWYuZXJyb3JNYXAsXG4gICAgICAgICAgICAgICAgcGF0aDogaW5wdXQucGF0aCxcbiAgICAgICAgICAgICAgICBwYXJlbnQ6IGlucHV0LnBhcmVudCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgfVxuICAgIF9wYXJzZVN5bmMoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5fcGFyc2UoaW5wdXQpO1xuICAgICAgICBpZiAoaXNBc3luYyhyZXN1bHQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJTeW5jaHJvbm91cyBwYXJzZSBlbmNvdW50ZXJlZCBwcm9taXNlLlwiKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBfcGFyc2VBc3luYyhpbnB1dCkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLl9wYXJzZShpbnB1dCk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0KTtcbiAgICB9XG4gICAgcGFyc2UoZGF0YSwgcGFyYW1zKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuc2FmZVBhcnNlKGRhdGEsIHBhcmFtcyk7XG4gICAgICAgIGlmIChyZXN1bHQuc3VjY2VzcylcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQuZGF0YTtcbiAgICAgICAgdGhyb3cgcmVzdWx0LmVycm9yO1xuICAgIH1cbiAgICBzYWZlUGFyc2UoZGF0YSwgcGFyYW1zKSB7XG4gICAgICAgIGNvbnN0IGN0eCA9IHtcbiAgICAgICAgICAgIGNvbW1vbjoge1xuICAgICAgICAgICAgICAgIGlzc3VlczogW10sXG4gICAgICAgICAgICAgICAgYXN5bmM6IHBhcmFtcz8uYXN5bmMgPz8gZmFsc2UsXG4gICAgICAgICAgICAgICAgY29udGV4dHVhbEVycm9yTWFwOiBwYXJhbXM/LmVycm9yTWFwLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHBhdGg6IHBhcmFtcz8ucGF0aCB8fCBbXSxcbiAgICAgICAgICAgIHNjaGVtYUVycm9yTWFwOiB0aGlzLl9kZWYuZXJyb3JNYXAsXG4gICAgICAgICAgICBwYXJlbnQ6IG51bGwsXG4gICAgICAgICAgICBkYXRhLFxuICAgICAgICAgICAgcGFyc2VkVHlwZTogZ2V0UGFyc2VkVHlwZShkYXRhKSxcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5fcGFyc2VTeW5jKHsgZGF0YSwgcGF0aDogY3R4LnBhdGgsIHBhcmVudDogY3R4IH0pO1xuICAgICAgICByZXR1cm4gaGFuZGxlUmVzdWx0KGN0eCwgcmVzdWx0KTtcbiAgICB9XG4gICAgXCJ+dmFsaWRhdGVcIihkYXRhKSB7XG4gICAgICAgIGNvbnN0IGN0eCA9IHtcbiAgICAgICAgICAgIGNvbW1vbjoge1xuICAgICAgICAgICAgICAgIGlzc3VlczogW10sXG4gICAgICAgICAgICAgICAgYXN5bmM6ICEhdGhpc1tcIn5zdGFuZGFyZFwiXS5hc3luYyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBwYXRoOiBbXSxcbiAgICAgICAgICAgIHNjaGVtYUVycm9yTWFwOiB0aGlzLl9kZWYuZXJyb3JNYXAsXG4gICAgICAgICAgICBwYXJlbnQ6IG51bGwsXG4gICAgICAgICAgICBkYXRhLFxuICAgICAgICAgICAgcGFyc2VkVHlwZTogZ2V0UGFyc2VkVHlwZShkYXRhKSxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKCF0aGlzW1wifnN0YW5kYXJkXCJdLmFzeW5jKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuX3BhcnNlU3luYyh7IGRhdGEsIHBhdGg6IFtdLCBwYXJlbnQ6IGN0eCB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gaXNWYWxpZChyZXN1bHQpXG4gICAgICAgICAgICAgICAgICAgID8ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHJlc3VsdC52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICA6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzc3VlczogY3R4LmNvbW1vbi5pc3N1ZXMsXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycj8ubWVzc2FnZT8udG9Mb3dlckNhc2UoKT8uaW5jbHVkZXMoXCJlbmNvdW50ZXJlZFwiKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzW1wifnN0YW5kYXJkXCJdLmFzeW5jID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY3R4LmNvbW1vbiA9IHtcbiAgICAgICAgICAgICAgICAgICAgaXNzdWVzOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgYXN5bmM6IHRydWUsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5fcGFyc2VBc3luYyh7IGRhdGEsIHBhdGg6IFtdLCBwYXJlbnQ6IGN0eCB9KS50aGVuKChyZXN1bHQpID0+IGlzVmFsaWQocmVzdWx0KVxuICAgICAgICAgICAgPyB7XG4gICAgICAgICAgICAgICAgdmFsdWU6IHJlc3VsdC52YWx1ZSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIDoge1xuICAgICAgICAgICAgICAgIGlzc3VlczogY3R4LmNvbW1vbi5pc3N1ZXMsXG4gICAgICAgICAgICB9KTtcbiAgICB9XG4gICAgYXN5bmMgcGFyc2VBc3luYyhkYXRhLCBwYXJhbXMpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zYWZlUGFyc2VBc3luYyhkYXRhLCBwYXJhbXMpO1xuICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0LmRhdGE7XG4gICAgICAgIHRocm93IHJlc3VsdC5lcnJvcjtcbiAgICB9XG4gICAgYXN5bmMgc2FmZVBhcnNlQXN5bmMoZGF0YSwgcGFyYW1zKSB7XG4gICAgICAgIGNvbnN0IGN0eCA9IHtcbiAgICAgICAgICAgIGNvbW1vbjoge1xuICAgICAgICAgICAgICAgIGlzc3VlczogW10sXG4gICAgICAgICAgICAgICAgY29udGV4dHVhbEVycm9yTWFwOiBwYXJhbXM/LmVycm9yTWFwLFxuICAgICAgICAgICAgICAgIGFzeW5jOiB0cnVlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHBhdGg6IHBhcmFtcz8ucGF0aCB8fCBbXSxcbiAgICAgICAgICAgIHNjaGVtYUVycm9yTWFwOiB0aGlzLl9kZWYuZXJyb3JNYXAsXG4gICAgICAgICAgICBwYXJlbnQ6IG51bGwsXG4gICAgICAgICAgICBkYXRhLFxuICAgICAgICAgICAgcGFyc2VkVHlwZTogZ2V0UGFyc2VkVHlwZShkYXRhKSxcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgbWF5YmVBc3luY1Jlc3VsdCA9IHRoaXMuX3BhcnNlKHsgZGF0YSwgcGF0aDogY3R4LnBhdGgsIHBhcmVudDogY3R4IH0pO1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCAoaXNBc3luYyhtYXliZUFzeW5jUmVzdWx0KSA/IG1heWJlQXN5bmNSZXN1bHQgOiBQcm9taXNlLnJlc29sdmUobWF5YmVBc3luY1Jlc3VsdCkpO1xuICAgICAgICByZXR1cm4gaGFuZGxlUmVzdWx0KGN0eCwgcmVzdWx0KTtcbiAgICB9XG4gICAgcmVmaW5lKGNoZWNrLCBtZXNzYWdlKSB7XG4gICAgICAgIGNvbnN0IGdldElzc3VlUHJvcGVydGllcyA9ICh2YWwpID0+IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgbWVzc2FnZSA9PT0gXCJzdHJpbmdcIiB8fCB0eXBlb2YgbWVzc2FnZSA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IG1lc3NhZ2UgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHR5cGVvZiBtZXNzYWdlID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWVzc2FnZSh2YWwpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1lc3NhZ2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB0aGlzLl9yZWZpbmVtZW50KCh2YWwsIGN0eCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gY2hlY2sodmFsKTtcbiAgICAgICAgICAgIGNvbnN0IHNldEVycm9yID0gKCkgPT4gY3R4LmFkZElzc3VlKHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuY3VzdG9tLFxuICAgICAgICAgICAgICAgIC4uLmdldElzc3VlUHJvcGVydGllcyh2YWwpLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIFByb21pc2UgIT09IFwidW5kZWZpbmVkXCIgJiYgcmVzdWx0IGluc3RhbmNlb2YgUHJvbWlzZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQudGhlbigoZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNldEVycm9yKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBzZXRFcnJvcigpO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmVmaW5lbWVudChjaGVjaywgcmVmaW5lbWVudERhdGEpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3JlZmluZW1lbnQoKHZhbCwgY3R4KSA9PiB7XG4gICAgICAgICAgICBpZiAoIWNoZWNrKHZhbCkpIHtcbiAgICAgICAgICAgICAgICBjdHguYWRkSXNzdWUodHlwZW9mIHJlZmluZW1lbnREYXRhID09PSBcImZ1bmN0aW9uXCIgPyByZWZpbmVtZW50RGF0YSh2YWwsIGN0eCkgOiByZWZpbmVtZW50RGF0YSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBfcmVmaW5lbWVudChyZWZpbmVtZW50KSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kRWZmZWN0cyh7XG4gICAgICAgICAgICBzY2hlbWE6IHRoaXMsXG4gICAgICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZEVmZmVjdHMsXG4gICAgICAgICAgICBlZmZlY3Q6IHsgdHlwZTogXCJyZWZpbmVtZW50XCIsIHJlZmluZW1lbnQgfSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHN1cGVyUmVmaW5lKHJlZmluZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3JlZmluZW1lbnQocmVmaW5lbWVudCk7XG4gICAgfVxuICAgIGNvbnN0cnVjdG9yKGRlZikge1xuICAgICAgICAvKiogQWxpYXMgb2Ygc2FmZVBhcnNlQXN5bmMgKi9cbiAgICAgICAgdGhpcy5zcGEgPSB0aGlzLnNhZmVQYXJzZUFzeW5jO1xuICAgICAgICB0aGlzLl9kZWYgPSBkZWY7XG4gICAgICAgIHRoaXMucGFyc2UgPSB0aGlzLnBhcnNlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuc2FmZVBhcnNlID0gdGhpcy5zYWZlUGFyc2UuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5wYXJzZUFzeW5jID0gdGhpcy5wYXJzZUFzeW5jLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuc2FmZVBhcnNlQXN5bmMgPSB0aGlzLnNhZmVQYXJzZUFzeW5jLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuc3BhID0gdGhpcy5zcGEuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5yZWZpbmUgPSB0aGlzLnJlZmluZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnJlZmluZW1lbnQgPSB0aGlzLnJlZmluZW1lbnQuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5zdXBlclJlZmluZSA9IHRoaXMuc3VwZXJSZWZpbmUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5vcHRpb25hbCA9IHRoaXMub3B0aW9uYWwuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5udWxsYWJsZSA9IHRoaXMubnVsbGFibGUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5udWxsaXNoID0gdGhpcy5udWxsaXNoLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYXJyYXkgPSB0aGlzLmFycmF5LmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMucHJvbWlzZSA9IHRoaXMucHJvbWlzZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLm9yID0gdGhpcy5vci5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmFuZCA9IHRoaXMuYW5kLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMudHJhbnNmb3JtID0gdGhpcy50cmFuc2Zvcm0uYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5icmFuZCA9IHRoaXMuYnJhbmQuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5kZWZhdWx0ID0gdGhpcy5kZWZhdWx0LmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuY2F0Y2ggPSB0aGlzLmNhdGNoLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuZGVzY3JpYmUgPSB0aGlzLmRlc2NyaWJlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMucGlwZSA9IHRoaXMucGlwZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnJlYWRvbmx5ID0gdGhpcy5yZWFkb25seS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmlzTnVsbGFibGUgPSB0aGlzLmlzTnVsbGFibGUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5pc09wdGlvbmFsID0gdGhpcy5pc09wdGlvbmFsLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXNbXCJ+c3RhbmRhcmRcIl0gPSB7XG4gICAgICAgICAgICB2ZXJzaW9uOiAxLFxuICAgICAgICAgICAgdmVuZG9yOiBcInpvZFwiLFxuICAgICAgICAgICAgdmFsaWRhdGU6IChkYXRhKSA9PiB0aGlzW1wifnZhbGlkYXRlXCJdKGRhdGEpLFxuICAgICAgICB9O1xuICAgIH1cbiAgICBvcHRpb25hbCgpIHtcbiAgICAgICAgcmV0dXJuIFpvZE9wdGlvbmFsLmNyZWF0ZSh0aGlzLCB0aGlzLl9kZWYpO1xuICAgIH1cbiAgICBudWxsYWJsZSgpIHtcbiAgICAgICAgcmV0dXJuIFpvZE51bGxhYmxlLmNyZWF0ZSh0aGlzLCB0aGlzLl9kZWYpO1xuICAgIH1cbiAgICBudWxsaXNoKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5udWxsYWJsZSgpLm9wdGlvbmFsKCk7XG4gICAgfVxuICAgIGFycmF5KCkge1xuICAgICAgICByZXR1cm4gWm9kQXJyYXkuY3JlYXRlKHRoaXMpO1xuICAgIH1cbiAgICBwcm9taXNlKCkge1xuICAgICAgICByZXR1cm4gWm9kUHJvbWlzZS5jcmVhdGUodGhpcywgdGhpcy5fZGVmKTtcbiAgICB9XG4gICAgb3Iob3B0aW9uKSB7XG4gICAgICAgIHJldHVybiBab2RVbmlvbi5jcmVhdGUoW3RoaXMsIG9wdGlvbl0sIHRoaXMuX2RlZik7XG4gICAgfVxuICAgIGFuZChpbmNvbWluZykge1xuICAgICAgICByZXR1cm4gWm9kSW50ZXJzZWN0aW9uLmNyZWF0ZSh0aGlzLCBpbmNvbWluZywgdGhpcy5fZGVmKTtcbiAgICB9XG4gICAgdHJhbnNmb3JtKHRyYW5zZm9ybSkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZEVmZmVjdHMoe1xuICAgICAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyh0aGlzLl9kZWYpLFxuICAgICAgICAgICAgc2NoZW1hOiB0aGlzLFxuICAgICAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RFZmZlY3RzLFxuICAgICAgICAgICAgZWZmZWN0OiB7IHR5cGU6IFwidHJhbnNmb3JtXCIsIHRyYW5zZm9ybSB9LFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZGVmYXVsdChkZWYpIHtcbiAgICAgICAgY29uc3QgZGVmYXVsdFZhbHVlRnVuYyA9IHR5cGVvZiBkZWYgPT09IFwiZnVuY3Rpb25cIiA/IGRlZiA6ICgpID0+IGRlZjtcbiAgICAgICAgcmV0dXJuIG5ldyBab2REZWZhdWx0KHtcbiAgICAgICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXModGhpcy5fZGVmKSxcbiAgICAgICAgICAgIGlubmVyVHlwZTogdGhpcyxcbiAgICAgICAgICAgIGRlZmF1bHRWYWx1ZTogZGVmYXVsdFZhbHVlRnVuYyxcbiAgICAgICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kRGVmYXVsdCxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGJyYW5kKCkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZEJyYW5kZWQoe1xuICAgICAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RCcmFuZGVkLFxuICAgICAgICAgICAgdHlwZTogdGhpcyxcbiAgICAgICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXModGhpcy5fZGVmKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGNhdGNoKGRlZikge1xuICAgICAgICBjb25zdCBjYXRjaFZhbHVlRnVuYyA9IHR5cGVvZiBkZWYgPT09IFwiZnVuY3Rpb25cIiA/IGRlZiA6ICgpID0+IGRlZjtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RDYXRjaCh7XG4gICAgICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHRoaXMuX2RlZiksXG4gICAgICAgICAgICBpbm5lclR5cGU6IHRoaXMsXG4gICAgICAgICAgICBjYXRjaFZhbHVlOiBjYXRjaFZhbHVlRnVuYyxcbiAgICAgICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kQ2F0Y2gsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBkZXNjcmliZShkZXNjcmlwdGlvbikge1xuICAgICAgICBjb25zdCBUaGlzID0gdGhpcy5jb25zdHJ1Y3RvcjtcbiAgICAgICAgcmV0dXJuIG5ldyBUaGlzKHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcGlwZSh0YXJnZXQpIHtcbiAgICAgICAgcmV0dXJuIFpvZFBpcGVsaW5lLmNyZWF0ZSh0aGlzLCB0YXJnZXQpO1xuICAgIH1cbiAgICByZWFkb25seSgpIHtcbiAgICAgICAgcmV0dXJuIFpvZFJlYWRvbmx5LmNyZWF0ZSh0aGlzKTtcbiAgICB9XG4gICAgaXNPcHRpb25hbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2FmZVBhcnNlKHVuZGVmaW5lZCkuc3VjY2VzcztcbiAgICB9XG4gICAgaXNOdWxsYWJsZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2FmZVBhcnNlKG51bGwpLnN1Y2Nlc3M7XG4gICAgfVxufVxuY29uc3QgY3VpZFJlZ2V4ID0gL15jW15cXHMtXXs4LH0kL2k7XG5jb25zdCBjdWlkMlJlZ2V4ID0gL15bMC05YS16XSskLztcbmNvbnN0IHVsaWRSZWdleCA9IC9eWzAtOUEtSEpLTU5QLVRWLVpdezI2fSQvaTtcbi8vIGNvbnN0IHV1aWRSZWdleCA9XG4vLyAgIC9eKFthLWYwLTldezh9LVthLWYwLTldezR9LVsxLTVdW2EtZjAtOV17M30tW2EtZjAtOV17NH0tW2EtZjAtOV17MTJ9fDAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMCkkL2k7XG5jb25zdCB1dWlkUmVnZXggPSAvXlswLTlhLWZBLUZdezh9XFxiLVswLTlhLWZBLUZdezR9XFxiLVswLTlhLWZBLUZdezR9XFxiLVswLTlhLWZBLUZdezR9XFxiLVswLTlhLWZBLUZdezEyfSQvaTtcbmNvbnN0IG5hbm9pZFJlZ2V4ID0gL15bYS16MC05Xy1dezIxfSQvaTtcbmNvbnN0IGp3dFJlZ2V4ID0gL15bQS1aYS16MC05LV9dK1xcLltBLVphLXowLTktX10rXFwuW0EtWmEtejAtOS1fXSokLztcbmNvbnN0IGR1cmF0aW9uUmVnZXggPSAvXlstK10/UCg/ISQpKD86KD86Wy0rXT9cXGQrWSl8KD86Wy0rXT9cXGQrWy4sXVxcZCtZJCkpPyg/Oig/OlstK10/XFxkK00pfCg/OlstK10/XFxkK1suLF1cXGQrTSQpKT8oPzooPzpbLStdP1xcZCtXKXwoPzpbLStdP1xcZCtbLixdXFxkK1ckKSk/KD86KD86Wy0rXT9cXGQrRCl8KD86Wy0rXT9cXGQrWy4sXVxcZCtEJCkpPyg/OlQoPz1bXFxkKy1dKSg/Oig/OlstK10/XFxkK0gpfCg/OlstK10/XFxkK1suLF1cXGQrSCQpKT8oPzooPzpbLStdP1xcZCtNKXwoPzpbLStdP1xcZCtbLixdXFxkK00kKSk/KD86Wy0rXT9cXGQrKD86Wy4sXVxcZCspP1MpPyk/PyQvO1xuLy8gZnJvbSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvNDYxODEvMTU1MDE1NVxuLy8gb2xkIHZlcnNpb246IHRvbyBzbG93LCBkaWRuJ3Qgc3VwcG9ydCB1bmljb2RlXG4vLyBjb25zdCBlbWFpbFJlZ2V4ID0gL14oKChbYS16XXxcXGR8WyEjXFwkJSYnXFwqXFwrXFwtXFwvPVxcP1xcXl9ge1xcfH1+XXxbXFx1MDBBMC1cXHVEN0ZGXFx1RjkwMC1cXHVGRENGXFx1RkRGMC1cXHVGRkVGXSkrKFxcLihbYS16XXxcXGR8WyEjXFwkJSYnXFwqXFwrXFwtXFwvPVxcP1xcXl9ge1xcfH1+XXxbXFx1MDBBMC1cXHVEN0ZGXFx1RjkwMC1cXHVGRENGXFx1RkRGMC1cXHVGRkVGXSkrKSopfCgoXFx4MjIpKCgoKFxceDIwfFxceDA5KSooXFx4MGRcXHgwYSkpPyhcXHgyMHxcXHgwOSkrKT8oKFtcXHgwMS1cXHgwOFxceDBiXFx4MGNcXHgwZS1cXHgxZlxceDdmXXxcXHgyMXxbXFx4MjMtXFx4NWJdfFtcXHg1ZC1cXHg3ZV18W1xcdTAwQTAtXFx1RDdGRlxcdUY5MDAtXFx1RkRDRlxcdUZERjAtXFx1RkZFRl0pfChcXFxcKFtcXHgwMS1cXHgwOVxceDBiXFx4MGNcXHgwZC1cXHg3Zl18W1xcdTAwQTAtXFx1RDdGRlxcdUY5MDAtXFx1RkRDRlxcdUZERjAtXFx1RkZFRl0pKSkpKigoKFxceDIwfFxceDA5KSooXFx4MGRcXHgwYSkpPyhcXHgyMHxcXHgwOSkrKT8oXFx4MjIpKSlAKCgoW2Etel18XFxkfFtcXHUwMEEwLVxcdUQ3RkZcXHVGOTAwLVxcdUZEQ0ZcXHVGREYwLVxcdUZGRUZdKXwoKFthLXpdfFxcZHxbXFx1MDBBMC1cXHVEN0ZGXFx1RjkwMC1cXHVGRENGXFx1RkRGMC1cXHVGRkVGXSkoW2Etel18XFxkfC18XFwufF98fnxbXFx1MDBBMC1cXHVEN0ZGXFx1RjkwMC1cXHVGRENGXFx1RkRGMC1cXHVGRkVGXSkqKFthLXpdfFxcZHxbXFx1MDBBMC1cXHVEN0ZGXFx1RjkwMC1cXHVGRENGXFx1RkRGMC1cXHVGRkVGXSkpKVxcLikrKChbYS16XXxbXFx1MDBBMC1cXHVEN0ZGXFx1RjkwMC1cXHVGRENGXFx1RkRGMC1cXHVGRkVGXSl8KChbYS16XXxbXFx1MDBBMC1cXHVEN0ZGXFx1RjkwMC1cXHVGRENGXFx1RkRGMC1cXHVGRkVGXSkoW2Etel18XFxkfC18XFwufF98fnxbXFx1MDBBMC1cXHVEN0ZGXFx1RjkwMC1cXHVGRENGXFx1RkRGMC1cXHVGRkVGXSkqKFthLXpdfFtcXHUwMEEwLVxcdUQ3RkZcXHVGOTAwLVxcdUZEQ0ZcXHVGREYwLVxcdUZGRUZdKSkpJC9pO1xuLy9vbGQgZW1haWwgcmVnZXhcbi8vIGNvbnN0IGVtYWlsUmVnZXggPSAvXigoW148PigpW1xcXS4sOzpcXHNAXCJdKyhcXC5bXjw+KClbXFxdLiw7Olxcc0BcIl0rKSopfChcIi4rXCIpKUAoKD8hLSkoW148PigpW1xcXS4sOzpcXHNAXCJdK1xcLikrW148PigpW1xcXS4sOzpcXHNAXCJdezEsfSlbXi08PigpW1xcXS4sOzpcXHNAXCJdJC9pO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lXG4vLyBjb25zdCBlbWFpbFJlZ2V4ID1cbi8vICAgL14oKFtePD4oKVtcXF1cXFxcLiw7Olxcc0BcXFwiXSsoXFwuW148PigpW1xcXVxcXFwuLDs6XFxzQFxcXCJdKykqKXwoXFxcIi4rXFxcIikpQCgoXFxbKCgoMjVbMC01XSl8KDJbMC00XVswLTldKXwoMVswLTldezJ9KXwoWzAtOV17MSwyfSkpXFwuKXszfSgoMjVbMC01XSl8KDJbMC00XVswLTldKXwoMVswLTldezJ9KXwoWzAtOV17MSwyfSkpXFxdKXwoXFxbSVB2NjooKFthLWYwLTldezEsNH06KXs3fXw6OihbYS1mMC05XXsxLDR9Oil7MCw2fXwoW2EtZjAtOV17MSw0fTopezF9OihbYS1mMC05XXsxLDR9Oil7MCw1fXwoW2EtZjAtOV17MSw0fTopezJ9OihbYS1mMC05XXsxLDR9Oil7MCw0fXwoW2EtZjAtOV17MSw0fTopezN9OihbYS1mMC05XXsxLDR9Oil7MCwzfXwoW2EtZjAtOV17MSw0fTopezR9OihbYS1mMC05XXsxLDR9Oil7MCwyfXwoW2EtZjAtOV17MSw0fTopezV9OihbYS1mMC05XXsxLDR9Oil7MCwxfSkoW2EtZjAtOV17MSw0fXwoKCgyNVswLTVdKXwoMlswLTRdWzAtOV0pfCgxWzAtOV17Mn0pfChbMC05XXsxLDJ9KSlcXC4pezN9KCgyNVswLTVdKXwoMlswLTRdWzAtOV0pfCgxWzAtOV17Mn0pfChbMC05XXsxLDJ9KSkpXFxdKXwoW0EtWmEtejAtOV0oW0EtWmEtejAtOS1dKltBLVphLXowLTldKSooXFwuW0EtWmEtel17Mix9KSspKSQvO1xuLy8gY29uc3QgZW1haWxSZWdleCA9XG4vLyAgIC9eW2EtekEtWjAtOVxcLlxcIVxcI1xcJFxcJVxcJlxcJ1xcKlxcK1xcL1xcPVxcP1xcXlxcX1xcYFxce1xcfFxcfVxcflxcLV0rQFthLXpBLVowLTldKD86W2EtekEtWjAtOS1dezAsNjF9W2EtekEtWjAtOV0pPyg/OlxcLlthLXpBLVowLTldKD86W2EtekEtWjAtOS1dezAsNjF9W2EtekEtWjAtOV0pPykqJC87XG4vLyBjb25zdCBlbWFpbFJlZ2V4ID1cbi8vICAgL14oPzpbYS16MC05ISMkJSYnKisvPT9eX2B7fH1+LV0rKD86XFwuW2EtejAtOSEjJCUmJyorLz0/Xl9ge3x9fi1dKykqfFwiKD86W1xceDAxLVxceDA4XFx4MGJcXHgwY1xceDBlLVxceDFmXFx4MjFcXHgyMy1cXHg1YlxceDVkLVxceDdmXXxcXFxcW1xceDAxLVxceDA5XFx4MGJcXHgwY1xceDBlLVxceDdmXSkqXCIpQCg/Oig/OlthLXowLTldKD86W2EtejAtOS1dKlthLXowLTldKT9cXC4pK1thLXowLTldKD86W2EtejAtOS1dKlthLXowLTldKT98XFxbKD86KD86MjVbMC01XXwyWzAtNF1bMC05XXxbMDFdP1swLTldWzAtOV0/KVxcLil7M30oPzoyNVswLTVdfDJbMC00XVswLTldfFswMV0/WzAtOV1bMC05XT98W2EtejAtOS1dKlthLXowLTldOig/OltcXHgwMS1cXHgwOFxceDBiXFx4MGNcXHgwZS1cXHgxZlxceDIxLVxceDVhXFx4NTMtXFx4N2ZdfFxcXFxbXFx4MDEtXFx4MDlcXHgwYlxceDBjXFx4MGUtXFx4N2ZdKSspXFxdKSQvaTtcbmNvbnN0IGVtYWlsUmVnZXggPSAvXig/IVxcLikoPyEuKlxcLlxcLikoW0EtWjAtOV8nK1xcLVxcLl0qKVtBLVowLTlfKy1dQChbQS1aMC05XVtBLVowLTlcXC1dKlxcLikrW0EtWl17Mix9JC9pO1xuLy8gY29uc3QgZW1haWxSZWdleCA9XG4vLyAgIC9eW2EtejAtOS4hIyQlJuKAmSorLz0/Xl9ge3x9fi1dK0BbYS16MC05LV0rKD86XFwuW2EtejAtOVxcLV0rKSokL2k7XG4vLyBmcm9tIGh0dHBzOi8vdGhla2V2aW5zY290dC5jb20vZW1vamlzLWluLWphdmFzY3JpcHQvI3dyaXRpbmctYS1yZWd1bGFyLWV4cHJlc3Npb25cbmNvbnN0IF9lbW9qaVJlZ2V4ID0gYF4oXFxcXHB7RXh0ZW5kZWRfUGljdG9ncmFwaGljfXxcXFxccHtFbW9qaV9Db21wb25lbnR9KSskYDtcbmxldCBlbW9qaVJlZ2V4O1xuLy8gZmFzdGVyLCBzaW1wbGVyLCBzYWZlclxuY29uc3QgaXB2NFJlZ2V4ID0gL14oPzooPzoyNVswLTVdfDJbMC00XVswLTldfDFbMC05XVswLTldfFsxLTldWzAtOV18WzAtOV0pXFwuKXszfSg/OjI1WzAtNV18MlswLTRdWzAtOV18MVswLTldWzAtOV18WzEtOV1bMC05XXxbMC05XSkkLztcbmNvbnN0IGlwdjRDaWRyUmVnZXggPSAvXig/Oig/OjI1WzAtNV18MlswLTRdWzAtOV18MVswLTldWzAtOV18WzEtOV1bMC05XXxbMC05XSlcXC4pezN9KD86MjVbMC01XXwyWzAtNF1bMC05XXwxWzAtOV1bMC05XXxbMS05XVswLTldfFswLTldKVxcLygzWzAtMl18WzEyXT9bMC05XSkkLztcbi8vIGNvbnN0IGlwdjZSZWdleCA9XG4vLyAvXigoW2EtZjAtOV17MSw0fTopezd9fDo6KFthLWYwLTldezEsNH06KXswLDZ9fChbYS1mMC05XXsxLDR9Oil7MX06KFthLWYwLTldezEsNH06KXswLDV9fChbYS1mMC05XXsxLDR9Oil7Mn06KFthLWYwLTldezEsNH06KXswLDR9fChbYS1mMC05XXsxLDR9Oil7M306KFthLWYwLTldezEsNH06KXswLDN9fChbYS1mMC05XXsxLDR9Oil7NH06KFthLWYwLTldezEsNH06KXswLDJ9fChbYS1mMC05XXsxLDR9Oil7NX06KFthLWYwLTldezEsNH06KXswLDF9KShbYS1mMC05XXsxLDR9fCgoKDI1WzAtNV0pfCgyWzAtNF1bMC05XSl8KDFbMC05XXsyfSl8KFswLTldezEsMn0pKVxcLil7M30oKDI1WzAtNV0pfCgyWzAtNF1bMC05XSl8KDFbMC05XXsyfSl8KFswLTldezEsMn0pKSkkLztcbmNvbnN0IGlwdjZSZWdleCA9IC9eKChbMC05YS1mQS1GXXsxLDR9Oil7Nyw3fVswLTlhLWZBLUZdezEsNH18KFswLTlhLWZBLUZdezEsNH06KXsxLDd9OnwoWzAtOWEtZkEtRl17MSw0fTopezEsNn06WzAtOWEtZkEtRl17MSw0fXwoWzAtOWEtZkEtRl17MSw0fTopezEsNX0oOlswLTlhLWZBLUZdezEsNH0pezEsMn18KFswLTlhLWZBLUZdezEsNH06KXsxLDR9KDpbMC05YS1mQS1GXXsxLDR9KXsxLDN9fChbMC05YS1mQS1GXXsxLDR9Oil7MSwzfSg6WzAtOWEtZkEtRl17MSw0fSl7MSw0fXwoWzAtOWEtZkEtRl17MSw0fTopezEsMn0oOlswLTlhLWZBLUZdezEsNH0pezEsNX18WzAtOWEtZkEtRl17MSw0fTooKDpbMC05YS1mQS1GXXsxLDR9KXsxLDZ9KXw6KCg6WzAtOWEtZkEtRl17MSw0fSl7MSw3fXw6KXxmZTgwOig6WzAtOWEtZkEtRl17MCw0fSl7MCw0fSVbMC05YS16QS1aXXsxLH18OjooZmZmZig6MHsxLDR9KXswLDF9Oil7MCwxfSgoMjVbMC01XXwoMlswLTRdfDF7MCwxfVswLTldKXswLDF9WzAtOV0pXFwuKXszLDN9KDI1WzAtNV18KDJbMC00XXwxezAsMX1bMC05XSl7MCwxfVswLTldKXwoWzAtOWEtZkEtRl17MSw0fTopezEsNH06KCgyNVswLTVdfCgyWzAtNF18MXswLDF9WzAtOV0pezAsMX1bMC05XSlcXC4pezMsM30oMjVbMC01XXwoMlswLTRdfDF7MCwxfVswLTldKXswLDF9WzAtOV0pKSQvO1xuY29uc3QgaXB2NkNpZHJSZWdleCA9IC9eKChbMC05YS1mQS1GXXsxLDR9Oil7Nyw3fVswLTlhLWZBLUZdezEsNH18KFswLTlhLWZBLUZdezEsNH06KXsxLDd9OnwoWzAtOWEtZkEtRl17MSw0fTopezEsNn06WzAtOWEtZkEtRl17MSw0fXwoWzAtOWEtZkEtRl17MSw0fTopezEsNX0oOlswLTlhLWZBLUZdezEsNH0pezEsMn18KFswLTlhLWZBLUZdezEsNH06KXsxLDR9KDpbMC05YS1mQS1GXXsxLDR9KXsxLDN9fChbMC05YS1mQS1GXXsxLDR9Oil7MSwzfSg6WzAtOWEtZkEtRl17MSw0fSl7MSw0fXwoWzAtOWEtZkEtRl17MSw0fTopezEsMn0oOlswLTlhLWZBLUZdezEsNH0pezEsNX18WzAtOWEtZkEtRl17MSw0fTooKDpbMC05YS1mQS1GXXsxLDR9KXsxLDZ9KXw6KCg6WzAtOWEtZkEtRl17MSw0fSl7MSw3fXw6KXxmZTgwOig6WzAtOWEtZkEtRl17MCw0fSl7MCw0fSVbMC05YS16QS1aXXsxLH18OjooZmZmZig6MHsxLDR9KXswLDF9Oil7MCwxfSgoMjVbMC01XXwoMlswLTRdfDF7MCwxfVswLTldKXswLDF9WzAtOV0pXFwuKXszLDN9KDI1WzAtNV18KDJbMC00XXwxezAsMX1bMC05XSl7MCwxfVswLTldKXwoWzAtOWEtZkEtRl17MSw0fTopezEsNH06KCgyNVswLTVdfCgyWzAtNF18MXswLDF9WzAtOV0pezAsMX1bMC05XSlcXC4pezMsM30oMjVbMC01XXwoMlswLTRdfDF7MCwxfVswLTldKXswLDF9WzAtOV0pKVxcLygxMlswLThdfDFbMDFdWzAtOV18WzEtOV0/WzAtOV0pJC87XG4vLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy83ODYwMzkyL2RldGVybWluZS1pZi1zdHJpbmctaXMtaW4tYmFzZTY0LXVzaW5nLWphdmFzY3JpcHRcbmNvbnN0IGJhc2U2NFJlZ2V4ID0gL14oWzAtOWEtekEtWisvXXs0fSkqKChbMC05YS16QS1aKy9dezJ9PT0pfChbMC05YS16QS1aKy9dezN9PSkpPyQvO1xuLy8gaHR0cHM6Ly9iYXNlNjQuZ3VydS9zdGFuZGFyZHMvYmFzZTY0dXJsXG5jb25zdCBiYXNlNjR1cmxSZWdleCA9IC9eKFswLTlhLXpBLVotX117NH0pKigoWzAtOWEtekEtWi1fXXsyfSg9PSk/KXwoWzAtOWEtekEtWi1fXXszfSg9KT8pKT8kLztcbi8vIHNpbXBsZVxuLy8gY29uc3QgZGF0ZVJlZ2V4U291cmNlID0gYFxcXFxkezR9LVxcXFxkezJ9LVxcXFxkezJ9YDtcbi8vIG5vIGxlYXAgeWVhciB2YWxpZGF0aW9uXG4vLyBjb25zdCBkYXRlUmVnZXhTb3VyY2UgPSBgXFxcXGR7NH0tKCgwWzEzNTc4XXwxMHwxMiktMzF8KDBbMTMtOV18MVswLTJdKS0zMHwoMFsxLTldfDFbMC0yXSktKDBbMS05XXwxXFxcXGR8MlxcXFxkKSlgO1xuLy8gd2l0aCBsZWFwIHllYXIgdmFsaWRhdGlvblxuY29uc3QgZGF0ZVJlZ2V4U291cmNlID0gYCgoXFxcXGRcXFxcZFsyNDY4XVswNDhdfFxcXFxkXFxcXGRbMTM1NzldWzI2XXxcXFxcZFxcXFxkMFs0OF18WzAyNDY4XVswNDhdMDB8WzEzNTc5XVsyNl0wMCktMDItMjl8XFxcXGR7NH0tKCgwWzEzNTc4XXwxWzAyXSktKDBbMS05XXxbMTJdXFxcXGR8M1swMV0pfCgwWzQ2OV18MTEpLSgwWzEtOV18WzEyXVxcXFxkfDMwKXwoMDIpLSgwWzEtOV18MVxcXFxkfDJbMC04XSkpKWA7XG5jb25zdCBkYXRlUmVnZXggPSBuZXcgUmVnRXhwKGBeJHtkYXRlUmVnZXhTb3VyY2V9JGApO1xuZnVuY3Rpb24gdGltZVJlZ2V4U291cmNlKGFyZ3MpIHtcbiAgICBsZXQgc2Vjb25kc1JlZ2V4U291cmNlID0gYFswLTVdXFxcXGRgO1xuICAgIGlmIChhcmdzLnByZWNpc2lvbikge1xuICAgICAgICBzZWNvbmRzUmVnZXhTb3VyY2UgPSBgJHtzZWNvbmRzUmVnZXhTb3VyY2V9XFxcXC5cXFxcZHske2FyZ3MucHJlY2lzaW9ufX1gO1xuICAgIH1cbiAgICBlbHNlIGlmIChhcmdzLnByZWNpc2lvbiA9PSBudWxsKSB7XG4gICAgICAgIHNlY29uZHNSZWdleFNvdXJjZSA9IGAke3NlY29uZHNSZWdleFNvdXJjZX0oXFxcXC5cXFxcZCspP2A7XG4gICAgfVxuICAgIGNvbnN0IHNlY29uZHNRdWFudGlmaWVyID0gYXJncy5wcmVjaXNpb24gPyBcIitcIiA6IFwiP1wiOyAvLyByZXF1aXJlIHNlY29uZHMgaWYgcHJlY2lzaW9uIGlzIG5vbnplcm9cbiAgICByZXR1cm4gYChbMDFdXFxcXGR8MlswLTNdKTpbMC01XVxcXFxkKDoke3NlY29uZHNSZWdleFNvdXJjZX0pJHtzZWNvbmRzUXVhbnRpZmllcn1gO1xufVxuZnVuY3Rpb24gdGltZVJlZ2V4KGFyZ3MpIHtcbiAgICByZXR1cm4gbmV3IFJlZ0V4cChgXiR7dGltZVJlZ2V4U291cmNlKGFyZ3MpfSRgKTtcbn1cbi8vIEFkYXB0ZWQgZnJvbSBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMzE0MzIzMVxuZXhwb3J0IGZ1bmN0aW9uIGRhdGV0aW1lUmVnZXgoYXJncykge1xuICAgIGxldCByZWdleCA9IGAke2RhdGVSZWdleFNvdXJjZX1UJHt0aW1lUmVnZXhTb3VyY2UoYXJncyl9YDtcbiAgICBjb25zdCBvcHRzID0gW107XG4gICAgb3B0cy5wdXNoKGFyZ3MubG9jYWwgPyBgWj9gIDogYFpgKTtcbiAgICBpZiAoYXJncy5vZmZzZXQpXG4gICAgICAgIG9wdHMucHVzaChgKFsrLV1cXFxcZHsyfTo/XFxcXGR7Mn0pYCk7XG4gICAgcmVnZXggPSBgJHtyZWdleH0oJHtvcHRzLmpvaW4oXCJ8XCIpfSlgO1xuICAgIHJldHVybiBuZXcgUmVnRXhwKGBeJHtyZWdleH0kYCk7XG59XG5mdW5jdGlvbiBpc1ZhbGlkSVAoaXAsIHZlcnNpb24pIHtcbiAgICBpZiAoKHZlcnNpb24gPT09IFwidjRcIiB8fCAhdmVyc2lvbikgJiYgaXB2NFJlZ2V4LnRlc3QoaXApKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBpZiAoKHZlcnNpb24gPT09IFwidjZcIiB8fCAhdmVyc2lvbikgJiYgaXB2NlJlZ2V4LnRlc3QoaXApKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5mdW5jdGlvbiBpc1ZhbGlkSldUKGp3dCwgYWxnKSB7XG4gICAgaWYgKCFqd3RSZWdleC50ZXN0KGp3dCkpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBbaGVhZGVyXSA9IGp3dC5zcGxpdChcIi5cIik7XG4gICAgICAgIGlmICghaGVhZGVyKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAvLyBDb252ZXJ0IGJhc2U2NHVybCB0byBiYXNlNjRcbiAgICAgICAgY29uc3QgYmFzZTY0ID0gaGVhZGVyXG4gICAgICAgICAgICAucmVwbGFjZSgvLS9nLCBcIitcIilcbiAgICAgICAgICAgIC5yZXBsYWNlKC9fL2csIFwiL1wiKVxuICAgICAgICAgICAgLnBhZEVuZChoZWFkZXIubGVuZ3RoICsgKCg0IC0gKGhlYWRlci5sZW5ndGggJSA0KSkgJSA0KSwgXCI9XCIpO1xuICAgICAgICBjb25zdCBkZWNvZGVkID0gSlNPTi5wYXJzZShhdG9iKGJhc2U2NCkpO1xuICAgICAgICBpZiAodHlwZW9mIGRlY29kZWQgIT09IFwib2JqZWN0XCIgfHwgZGVjb2RlZCA9PT0gbnVsbClcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKFwidHlwXCIgaW4gZGVjb2RlZCAmJiBkZWNvZGVkPy50eXAgIT09IFwiSldUXCIpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmICghZGVjb2RlZC5hbGcpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmIChhbGcgJiYgZGVjb2RlZC5hbGcgIT09IGFsZylcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGlzVmFsaWRDaWRyKGlwLCB2ZXJzaW9uKSB7XG4gICAgaWYgKCh2ZXJzaW9uID09PSBcInY0XCIgfHwgIXZlcnNpb24pICYmIGlwdjRDaWRyUmVnZXgudGVzdChpcCkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGlmICgodmVyc2lvbiA9PT0gXCJ2NlwiIHx8ICF2ZXJzaW9uKSAmJiBpcHY2Q2lkclJlZ2V4LnRlc3QoaXApKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5leHBvcnQgY2xhc3MgWm9kU3RyaW5nIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGlmICh0aGlzLl9kZWYuY29lcmNlKSB7XG4gICAgICAgICAgICBpbnB1dC5kYXRhID0gU3RyaW5nKGlucHV0LmRhdGEpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhcnNlZFR5cGUgPSB0aGlzLl9nZXRUeXBlKGlucHV0KTtcbiAgICAgICAgaWYgKHBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUuc3RyaW5nKSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLnN0cmluZyxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHN0YXR1cyA9IG5ldyBQYXJzZVN0YXR1cygpO1xuICAgICAgICBsZXQgY3R4ID0gdW5kZWZpbmVkO1xuICAgICAgICBmb3IgKGNvbnN0IGNoZWNrIG9mIHRoaXMuX2RlZi5jaGVja3MpIHtcbiAgICAgICAgICAgIGlmIChjaGVjay5raW5kID09PSBcIm1pblwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlucHV0LmRhdGEubGVuZ3RoIDwgY2hlY2sudmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19zbWFsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1pbmltdW06IGNoZWNrLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4YWN0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcIm1heFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlucHV0LmRhdGEubGVuZ3RoID4gY2hlY2sudmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19iaWcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXhpbXVtOiBjaGVjay52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBleGFjdDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJsZW5ndGhcIikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRvb0JpZyA9IGlucHV0LmRhdGEubGVuZ3RoID4gY2hlY2sudmFsdWU7XG4gICAgICAgICAgICAgICAgY29uc3QgdG9vU21hbGwgPSBpbnB1dC5kYXRhLmxlbmd0aCA8IGNoZWNrLnZhbHVlO1xuICAgICAgICAgICAgICAgIGlmICh0b29CaWcgfHwgdG9vU21hbGwpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b29CaWcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fYmlnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1heGltdW06IGNoZWNrLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4YWN0OiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmICh0b29TbWFsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19zbWFsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtaW5pbXVtOiBjaGVjay52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGFjdDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJlbWFpbFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFlbWFpbFJlZ2V4LnRlc3QoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJlbWFpbFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwiZW1vamlcIikge1xuICAgICAgICAgICAgICAgIGlmICghZW1vamlSZWdleCkge1xuICAgICAgICAgICAgICAgICAgICBlbW9qaVJlZ2V4ID0gbmV3IFJlZ0V4cChfZW1vamlSZWdleCwgXCJ1XCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIWVtb2ppUmVnZXgudGVzdChpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcImVtb2ppXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJ1dWlkXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXV1aWRSZWdleC50ZXN0KGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwidXVpZFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwibmFub2lkXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIW5hbm9pZFJlZ2V4LnRlc3QoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJuYW5vaWRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImN1aWRcIikge1xuICAgICAgICAgICAgICAgIGlmICghY3VpZFJlZ2V4LnRlc3QoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJjdWlkXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJjdWlkMlwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjdWlkMlJlZ2V4LnRlc3QoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJjdWlkMlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwidWxpZFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCF1bGlkUmVnZXgudGVzdChpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcInVsaWRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcInVybFwiKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgbmV3IFVSTChpbnB1dC5kYXRhKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcInVybFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwicmVnZXhcIikge1xuICAgICAgICAgICAgICAgIGNoZWNrLnJlZ2V4Lmxhc3RJbmRleCA9IDA7XG4gICAgICAgICAgICAgICAgY29uc3QgdGVzdFJlc3VsdCA9IGNoZWNrLnJlZ2V4LnRlc3QoaW5wdXQuZGF0YSk7XG4gICAgICAgICAgICAgICAgaWYgKCF0ZXN0UmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwicmVnZXhcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcInRyaW1cIikge1xuICAgICAgICAgICAgICAgIGlucHV0LmRhdGEgPSBpbnB1dC5kYXRhLnRyaW0oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwiaW5jbHVkZXNcIikge1xuICAgICAgICAgICAgICAgIGlmICghaW5wdXQuZGF0YS5pbmNsdWRlcyhjaGVjay52YWx1ZSwgY2hlY2sucG9zaXRpb24pKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IHsgaW5jbHVkZXM6IGNoZWNrLnZhbHVlLCBwb3NpdGlvbjogY2hlY2sucG9zaXRpb24gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcInRvTG93ZXJDYXNlXCIpIHtcbiAgICAgICAgICAgICAgICBpbnB1dC5kYXRhID0gaW5wdXQuZGF0YS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJ0b1VwcGVyQ2FzZVwiKSB7XG4gICAgICAgICAgICAgICAgaW5wdXQuZGF0YSA9IGlucHV0LmRhdGEudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwic3RhcnRzV2l0aFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFpbnB1dC5kYXRhLnN0YXJ0c1dpdGgoY2hlY2sudmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IHsgc3RhcnRzV2l0aDogY2hlY2sudmFsdWUgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImVuZHNXaXRoXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWlucHV0LmRhdGEuZW5kc1dpdGgoY2hlY2sudmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IHsgZW5kc1dpdGg6IGNoZWNrLnZhbHVlIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJkYXRldGltZVwiKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBkYXRldGltZVJlZ2V4KGNoZWNrKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlZ2V4LnRlc3QoaW5wdXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJkYXRldGltZVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwiZGF0ZVwiKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSBkYXRlUmVnZXg7XG4gICAgICAgICAgICAgICAgaWYgKCFyZWdleC50ZXN0KGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwiZGF0ZVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwidGltZVwiKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVnZXggPSB0aW1lUmVnZXgoY2hlY2spO1xuICAgICAgICAgICAgICAgIGlmICghcmVnZXgudGVzdChpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcInRpbWVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImR1cmF0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWR1cmF0aW9uUmVnZXgudGVzdChpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcImR1cmF0aW9uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJpcFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFpc1ZhbGlkSVAoaW5wdXQuZGF0YSwgY2hlY2sudmVyc2lvbikpIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGlvbjogXCJpcFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwiand0XCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWlzVmFsaWRKV1QoaW5wdXQuZGF0YSwgY2hlY2suYWxnKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcImp3dFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwiY2lkclwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFpc1ZhbGlkQ2lkcihpbnB1dC5kYXRhLCBjaGVjay52ZXJzaW9uKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcImNpZHJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcImJhc2U2NFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFiYXNlNjRSZWdleC50ZXN0KGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRpb246IFwiYmFzZTY0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9zdHJpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJiYXNlNjR1cmxcIikge1xuICAgICAgICAgICAgICAgIGlmICghYmFzZTY0dXJsUmVnZXgudGVzdChpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0aW9uOiBcImJhc2U2NHVybFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfc3RyaW5nLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHV0aWwuYXNzZXJ0TmV2ZXIoY2hlY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHN0YXR1czogc3RhdHVzLnZhbHVlLCB2YWx1ZTogaW5wdXQuZGF0YSB9O1xuICAgIH1cbiAgICBfcmVnZXgocmVnZXgsIHZhbGlkYXRpb24sIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVmaW5lbWVudCgoZGF0YSkgPT4gcmVnZXgudGVzdChkYXRhKSwge1xuICAgICAgICAgICAgdmFsaWRhdGlvbixcbiAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3N0cmluZyxcbiAgICAgICAgICAgIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIF9hZGRDaGVjayhjaGVjaykge1xuICAgICAgICByZXR1cm4gbmV3IFpvZFN0cmluZyh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBjaGVja3M6IFsuLi50aGlzLl9kZWYuY2hlY2tzLCBjaGVja10sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBlbWFpbChtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7IGtpbmQ6IFwiZW1haWxcIiwgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpIH0pO1xuICAgIH1cbiAgICB1cmwobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soeyBraW5kOiBcInVybFwiLCAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSkgfSk7XG4gICAgfVxuICAgIGVtb2ppKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHsga2luZDogXCJlbW9qaVwiLCAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSkgfSk7XG4gICAgfVxuICAgIHV1aWQobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soeyBraW5kOiBcInV1aWRcIiwgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpIH0pO1xuICAgIH1cbiAgICBuYW5vaWQobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soeyBraW5kOiBcIm5hbm9pZFwiLCAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSkgfSk7XG4gICAgfVxuICAgIGN1aWQobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soeyBraW5kOiBcImN1aWRcIiwgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpIH0pO1xuICAgIH1cbiAgICBjdWlkMihtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7IGtpbmQ6IFwiY3VpZDJcIiwgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpIH0pO1xuICAgIH1cbiAgICB1bGlkKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHsga2luZDogXCJ1bGlkXCIsIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSB9KTtcbiAgICB9XG4gICAgYmFzZTY0KG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHsga2luZDogXCJiYXNlNjRcIiwgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpIH0pO1xuICAgIH1cbiAgICBiYXNlNjR1cmwobWVzc2FnZSkge1xuICAgICAgICAvLyBiYXNlNjR1cmwgZW5jb2RpbmcgaXMgYSBtb2RpZmljYXRpb24gb2YgYmFzZTY0IHRoYXQgY2FuIHNhZmVseSBiZSB1c2VkIGluIFVSTHMgYW5kIGZpbGVuYW1lc1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJiYXNlNjR1cmxcIixcbiAgICAgICAgICAgIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGp3dChvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7IGtpbmQ6IFwiand0XCIsIC4uLmVycm9yVXRpbC5lcnJUb09iaihvcHRpb25zKSB9KTtcbiAgICB9XG4gICAgaXAob3B0aW9ucykge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soeyBraW5kOiBcImlwXCIsIC4uLmVycm9yVXRpbC5lcnJUb09iaihvcHRpb25zKSB9KTtcbiAgICB9XG4gICAgY2lkcihvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7IGtpbmQ6IFwiY2lkclwiLCAuLi5lcnJvclV0aWwuZXJyVG9PYmoob3B0aW9ucykgfSk7XG4gICAgfVxuICAgIGRhdGV0aW1lKG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAgICAgIGtpbmQ6IFwiZGF0ZXRpbWVcIixcbiAgICAgICAgICAgICAgICBwcmVjaXNpb246IG51bGwsXG4gICAgICAgICAgICAgICAgb2Zmc2V0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICBsb2NhbDogZmFsc2UsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogb3B0aW9ucyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcImRhdGV0aW1lXCIsXG4gICAgICAgICAgICBwcmVjaXNpb246IHR5cGVvZiBvcHRpb25zPy5wcmVjaXNpb24gPT09IFwidW5kZWZpbmVkXCIgPyBudWxsIDogb3B0aW9ucz8ucHJlY2lzaW9uLFxuICAgICAgICAgICAgb2Zmc2V0OiBvcHRpb25zPy5vZmZzZXQgPz8gZmFsc2UsXG4gICAgICAgICAgICBsb2NhbDogb3B0aW9ucz8ubG9jYWwgPz8gZmFsc2UsXG4gICAgICAgICAgICAuLi5lcnJvclV0aWwuZXJyVG9PYmoob3B0aW9ucz8ubWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBkYXRlKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHsga2luZDogXCJkYXRlXCIsIG1lc3NhZ2UgfSk7XG4gICAgfVxuICAgIHRpbWUob3B0aW9ucykge1xuICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICAgICAga2luZDogXCJ0aW1lXCIsXG4gICAgICAgICAgICAgICAgcHJlY2lzaW9uOiBudWxsLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IG9wdGlvbnMsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJ0aW1lXCIsXG4gICAgICAgICAgICBwcmVjaXNpb246IHR5cGVvZiBvcHRpb25zPy5wcmVjaXNpb24gPT09IFwidW5kZWZpbmVkXCIgPyBudWxsIDogb3B0aW9ucz8ucHJlY2lzaW9uLFxuICAgICAgICAgICAgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG9wdGlvbnM/Lm1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZHVyYXRpb24obWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soeyBraW5kOiBcImR1cmF0aW9uXCIsIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSB9KTtcbiAgICB9XG4gICAgcmVnZXgocmVnZXgsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwicmVnZXhcIixcbiAgICAgICAgICAgIHJlZ2V4OiByZWdleCxcbiAgICAgICAgICAgIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGluY2x1ZGVzKHZhbHVlLCBvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcImluY2x1ZGVzXCIsXG4gICAgICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgICAgICBwb3NpdGlvbjogb3B0aW9ucz8ucG9zaXRpb24sXG4gICAgICAgICAgICAuLi5lcnJvclV0aWwuZXJyVG9PYmoob3B0aW9ucz8ubWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBzdGFydHNXaXRoKHZhbHVlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcInN0YXJ0c1dpdGhcIixcbiAgICAgICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgICAgIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGVuZHNXaXRoKHZhbHVlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcImVuZHNXaXRoXCIsXG4gICAgICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgICAgICAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBtaW4obWluTGVuZ3RoLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm1pblwiLFxuICAgICAgICAgICAgdmFsdWU6IG1pbkxlbmd0aCxcbiAgICAgICAgICAgIC4uLmVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG1heChtYXhMZW5ndGgsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibWF4XCIsXG4gICAgICAgICAgICB2YWx1ZTogbWF4TGVuZ3RoLFxuICAgICAgICAgICAgLi4uZXJyb3JVdGlsLmVyclRvT2JqKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbGVuZ3RoKGxlbiwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJsZW5ndGhcIixcbiAgICAgICAgICAgIHZhbHVlOiBsZW4sXG4gICAgICAgICAgICAuLi5lcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBFcXVpdmFsZW50IHRvIGAubWluKDEpYFxuICAgICAqL1xuICAgIG5vbmVtcHR5KG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubWluKDEsIGVycm9yVXRpbC5lcnJUb09iaihtZXNzYWdlKSk7XG4gICAgfVxuICAgIHRyaW0oKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kU3RyaW5nKHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIGNoZWNrczogWy4uLnRoaXMuX2RlZi5jaGVja3MsIHsga2luZDogXCJ0cmltXCIgfV0sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICB0b0xvd2VyQ2FzZSgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RTdHJpbmcoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgY2hlY2tzOiBbLi4udGhpcy5fZGVmLmNoZWNrcywgeyBraW5kOiBcInRvTG93ZXJDYXNlXCIgfV0sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICB0b1VwcGVyQ2FzZSgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RTdHJpbmcoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgY2hlY2tzOiBbLi4udGhpcy5fZGVmLmNoZWNrcywgeyBraW5kOiBcInRvVXBwZXJDYXNlXCIgfV0sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBnZXQgaXNEYXRldGltZSgpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJkYXRldGltZVwiKTtcbiAgICB9XG4gICAgZ2V0IGlzRGF0ZSgpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJkYXRlXCIpO1xuICAgIH1cbiAgICBnZXQgaXNUaW1lKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcInRpbWVcIik7XG4gICAgfVxuICAgIGdldCBpc0R1cmF0aW9uKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcImR1cmF0aW9uXCIpO1xuICAgIH1cbiAgICBnZXQgaXNFbWFpbCgpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJlbWFpbFwiKTtcbiAgICB9XG4gICAgZ2V0IGlzVVJMKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcInVybFwiKTtcbiAgICB9XG4gICAgZ2V0IGlzRW1vamkoKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwiZW1vamlcIik7XG4gICAgfVxuICAgIGdldCBpc1VVSUQoKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwidXVpZFwiKTtcbiAgICB9XG4gICAgZ2V0IGlzTkFOT0lEKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9kZWYuY2hlY2tzLmZpbmQoKGNoKSA9PiBjaC5raW5kID09PSBcIm5hbm9pZFwiKTtcbiAgICB9XG4gICAgZ2V0IGlzQ1VJRCgpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJjdWlkXCIpO1xuICAgIH1cbiAgICBnZXQgaXNDVUlEMigpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJjdWlkMlwiKTtcbiAgICB9XG4gICAgZ2V0IGlzVUxJRCgpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJ1bGlkXCIpO1xuICAgIH1cbiAgICBnZXQgaXNJUCgpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJpcFwiKTtcbiAgICB9XG4gICAgZ2V0IGlzQ0lEUigpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5fZGVmLmNoZWNrcy5maW5kKChjaCkgPT4gY2gua2luZCA9PT0gXCJjaWRyXCIpO1xuICAgIH1cbiAgICBnZXQgaXNCYXNlNjQoKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwiYmFzZTY0XCIpO1xuICAgIH1cbiAgICBnZXQgaXNCYXNlNjR1cmwoKSB7XG4gICAgICAgIC8vIGJhc2U2NHVybCBlbmNvZGluZyBpcyBhIG1vZGlmaWNhdGlvbiBvZiBiYXNlNjQgdGhhdCBjYW4gc2FmZWx5IGJlIHVzZWQgaW4gVVJMcyBhbmQgZmlsZW5hbWVzXG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwiYmFzZTY0dXJsXCIpO1xuICAgIH1cbiAgICBnZXQgbWluTGVuZ3RoKCkge1xuICAgICAgICBsZXQgbWluID0gbnVsbDtcbiAgICAgICAgZm9yIChjb25zdCBjaCBvZiB0aGlzLl9kZWYuY2hlY2tzKSB7XG4gICAgICAgICAgICBpZiAoY2gua2luZCA9PT0gXCJtaW5cIikge1xuICAgICAgICAgICAgICAgIGlmIChtaW4gPT09IG51bGwgfHwgY2gudmFsdWUgPiBtaW4pXG4gICAgICAgICAgICAgICAgICAgIG1pbiA9IGNoLnZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtaW47XG4gICAgfVxuICAgIGdldCBtYXhMZW5ndGgoKSB7XG4gICAgICAgIGxldCBtYXggPSBudWxsO1xuICAgICAgICBmb3IgKGNvbnN0IGNoIG9mIHRoaXMuX2RlZi5jaGVja3MpIHtcbiAgICAgICAgICAgIGlmIChjaC5raW5kID09PSBcIm1heFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1heCA9PT0gbnVsbCB8fCBjaC52YWx1ZSA8IG1heClcbiAgICAgICAgICAgICAgICAgICAgbWF4ID0gY2gudmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1heDtcbiAgICB9XG59XG5ab2RTdHJpbmcuY3JlYXRlID0gKHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kU3RyaW5nKHtcbiAgICAgICAgY2hlY2tzOiBbXSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RTdHJpbmcsXG4gICAgICAgIGNvZXJjZTogcGFyYW1zPy5jb2VyY2UgPz8gZmFsc2UsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG4vLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8zOTY2NDg0L3doeS1kb2VzLW1vZHVsdXMtb3BlcmF0b3ItcmV0dXJuLWZyYWN0aW9uYWwtbnVtYmVyLWluLWphdmFzY3JpcHQvMzE3MTEwMzQjMzE3MTEwMzRcbmZ1bmN0aW9uIGZsb2F0U2FmZVJlbWFpbmRlcih2YWwsIHN0ZXApIHtcbiAgICBjb25zdCB2YWxEZWNDb3VudCA9ICh2YWwudG9TdHJpbmcoKS5zcGxpdChcIi5cIilbMV0gfHwgXCJcIikubGVuZ3RoO1xuICAgIGNvbnN0IHN0ZXBEZWNDb3VudCA9IChzdGVwLnRvU3RyaW5nKCkuc3BsaXQoXCIuXCIpWzFdIHx8IFwiXCIpLmxlbmd0aDtcbiAgICBjb25zdCBkZWNDb3VudCA9IHZhbERlY0NvdW50ID4gc3RlcERlY0NvdW50ID8gdmFsRGVjQ291bnQgOiBzdGVwRGVjQ291bnQ7XG4gICAgY29uc3QgdmFsSW50ID0gTnVtYmVyLnBhcnNlSW50KHZhbC50b0ZpeGVkKGRlY0NvdW50KS5yZXBsYWNlKFwiLlwiLCBcIlwiKSk7XG4gICAgY29uc3Qgc3RlcEludCA9IE51bWJlci5wYXJzZUludChzdGVwLnRvRml4ZWQoZGVjQ291bnQpLnJlcGxhY2UoXCIuXCIsIFwiXCIpKTtcbiAgICByZXR1cm4gKHZhbEludCAlIHN0ZXBJbnQpIC8gMTAgKiogZGVjQ291bnQ7XG59XG5leHBvcnQgY2xhc3MgWm9kTnVtYmVyIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHN1cGVyKC4uLmFyZ3VtZW50cyk7XG4gICAgICAgIHRoaXMubWluID0gdGhpcy5ndGU7XG4gICAgICAgIHRoaXMubWF4ID0gdGhpcy5sdGU7XG4gICAgICAgIHRoaXMuc3RlcCA9IHRoaXMubXVsdGlwbGVPZjtcbiAgICB9XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGlmICh0aGlzLl9kZWYuY29lcmNlKSB7XG4gICAgICAgICAgICBpbnB1dC5kYXRhID0gTnVtYmVyKGlucHV0LmRhdGEpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhcnNlZFR5cGUgPSB0aGlzLl9nZXRUeXBlKGlucHV0KTtcbiAgICAgICAgaWYgKHBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUubnVtYmVyKSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLm51bWJlcixcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGxldCBjdHggPSB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnN0IHN0YXR1cyA9IG5ldyBQYXJzZVN0YXR1cygpO1xuICAgICAgICBmb3IgKGNvbnN0IGNoZWNrIG9mIHRoaXMuX2RlZi5jaGVja3MpIHtcbiAgICAgICAgICAgIGlmIChjaGVjay5raW5kID09PSBcImludFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKCF1dGlsLmlzSW50ZWdlcihpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IFwiZmxvYXRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVjay5raW5kID09PSBcIm1pblwiKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdG9vU21hbGwgPSBjaGVjay5pbmNsdXNpdmUgPyBpbnB1dC5kYXRhIDwgY2hlY2sudmFsdWUgOiBpbnB1dC5kYXRhIDw9IGNoZWNrLnZhbHVlO1xuICAgICAgICAgICAgICAgIGlmICh0b29TbWFsbCkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX3NtYWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWluaW11bTogY2hlY2sudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIm51bWJlclwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlOiBjaGVjay5pbmNsdXNpdmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBleGFjdDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJtYXhcIikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRvb0JpZyA9IGNoZWNrLmluY2x1c2l2ZSA/IGlucHV0LmRhdGEgPiBjaGVjay52YWx1ZSA6IGlucHV0LmRhdGEgPj0gY2hlY2sudmFsdWU7XG4gICAgICAgICAgICAgICAgaWYgKHRvb0JpZykge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX2JpZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1heGltdW06IGNoZWNrLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJudW1iZXJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogY2hlY2suaW5jbHVzaXZlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXhhY3Q6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwibXVsdGlwbGVPZlwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKGZsb2F0U2FmZVJlbWFpbmRlcihpbnB1dC5kYXRhLCBjaGVjay52YWx1ZSkgIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQsIGN0eCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLm5vdF9tdWx0aXBsZV9vZixcbiAgICAgICAgICAgICAgICAgICAgICAgIG11bHRpcGxlT2Y6IGNoZWNrLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwiZmluaXRlXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUubm90X2Zpbml0ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB1dGlsLmFzc2VydE5ldmVyKGNoZWNrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzdGF0dXM6IHN0YXR1cy52YWx1ZSwgdmFsdWU6IGlucHV0LmRhdGEgfTtcbiAgICB9XG4gICAgZ3RlKHZhbHVlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldExpbWl0KFwibWluXCIsIHZhbHVlLCB0cnVlLCBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSkpO1xuICAgIH1cbiAgICBndCh2YWx1ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXRMaW1pdChcIm1pblwiLCB2YWx1ZSwgZmFsc2UsIGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSk7XG4gICAgfVxuICAgIGx0ZSh2YWx1ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXRMaW1pdChcIm1heFwiLCB2YWx1ZSwgdHJ1ZSwgZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpKTtcbiAgICB9XG4gICAgbHQodmFsdWUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0TGltaXQoXCJtYXhcIiwgdmFsdWUsIGZhbHNlLCBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSkpO1xuICAgIH1cbiAgICBzZXRMaW1pdChraW5kLCB2YWx1ZSwgaW5jbHVzaXZlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kTnVtYmVyKHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIGNoZWNrczogW1xuICAgICAgICAgICAgICAgIC4uLnRoaXMuX2RlZi5jaGVja3MsXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBraW5kLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlLFxuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBfYWRkQ2hlY2soY2hlY2spIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2ROdW1iZXIoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgY2hlY2tzOiBbLi4udGhpcy5fZGVmLmNoZWNrcywgY2hlY2tdLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgaW50KG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwiaW50XCIsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBwb3NpdGl2ZShtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm1pblwiLFxuICAgICAgICAgICAgdmFsdWU6IDAsXG4gICAgICAgICAgICBpbmNsdXNpdmU6IGZhbHNlLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbmVnYXRpdmUobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtYXhcIixcbiAgICAgICAgICAgIHZhbHVlOiAwLFxuICAgICAgICAgICAgaW5jbHVzaXZlOiBmYWxzZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG5vbnBvc2l0aXZlKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibWF4XCIsXG4gICAgICAgICAgICB2YWx1ZTogMCxcbiAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG5vbm5lZ2F0aXZlKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibWluXCIsXG4gICAgICAgICAgICB2YWx1ZTogMCxcbiAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG11bHRpcGxlT2YodmFsdWUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibXVsdGlwbGVPZlwiLFxuICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZmluaXRlKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwiZmluaXRlXCIsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBzYWZlKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibWluXCIsXG4gICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICB2YWx1ZTogTnVtYmVyLk1JTl9TQUZFX0lOVEVHRVIsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm1heFwiLFxuICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgdmFsdWU6IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZ2V0IG1pblZhbHVlKCkge1xuICAgICAgICBsZXQgbWluID0gbnVsbDtcbiAgICAgICAgZm9yIChjb25zdCBjaCBvZiB0aGlzLl9kZWYuY2hlY2tzKSB7XG4gICAgICAgICAgICBpZiAoY2gua2luZCA9PT0gXCJtaW5cIikge1xuICAgICAgICAgICAgICAgIGlmIChtaW4gPT09IG51bGwgfHwgY2gudmFsdWUgPiBtaW4pXG4gICAgICAgICAgICAgICAgICAgIG1pbiA9IGNoLnZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtaW47XG4gICAgfVxuICAgIGdldCBtYXhWYWx1ZSgpIHtcbiAgICAgICAgbGV0IG1heCA9IG51bGw7XG4gICAgICAgIGZvciAoY29uc3QgY2ggb2YgdGhpcy5fZGVmLmNoZWNrcykge1xuICAgICAgICAgICAgaWYgKGNoLmtpbmQgPT09IFwibWF4XCIpIHtcbiAgICAgICAgICAgICAgICBpZiAobWF4ID09PSBudWxsIHx8IGNoLnZhbHVlIDwgbWF4KVxuICAgICAgICAgICAgICAgICAgICBtYXggPSBjaC52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWF4O1xuICAgIH1cbiAgICBnZXQgaXNJbnQoKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuX2RlZi5jaGVja3MuZmluZCgoY2gpID0+IGNoLmtpbmQgPT09IFwiaW50XCIgfHwgKGNoLmtpbmQgPT09IFwibXVsdGlwbGVPZlwiICYmIHV0aWwuaXNJbnRlZ2VyKGNoLnZhbHVlKSkpO1xuICAgIH1cbiAgICBnZXQgaXNGaW5pdGUoKSB7XG4gICAgICAgIGxldCBtYXggPSBudWxsO1xuICAgICAgICBsZXQgbWluID0gbnVsbDtcbiAgICAgICAgZm9yIChjb25zdCBjaCBvZiB0aGlzLl9kZWYuY2hlY2tzKSB7XG4gICAgICAgICAgICBpZiAoY2gua2luZCA9PT0gXCJmaW5pdGVcIiB8fCBjaC5raW5kID09PSBcImludFwiIHx8IGNoLmtpbmQgPT09IFwibXVsdGlwbGVPZlwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaC5raW5kID09PSBcIm1pblwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1pbiA9PT0gbnVsbCB8fCBjaC52YWx1ZSA+IG1pbilcbiAgICAgICAgICAgICAgICAgICAgbWluID0gY2gudmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjaC5raW5kID09PSBcIm1heFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1heCA9PT0gbnVsbCB8fCBjaC52YWx1ZSA8IG1heClcbiAgICAgICAgICAgICAgICAgICAgbWF4ID0gY2gudmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIE51bWJlci5pc0Zpbml0ZShtaW4pICYmIE51bWJlci5pc0Zpbml0ZShtYXgpO1xuICAgIH1cbn1cblpvZE51bWJlci5jcmVhdGUgPSAocGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2ROdW1iZXIoe1xuICAgICAgICBjaGVja3M6IFtdLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZE51bWJlcixcbiAgICAgICAgY29lcmNlOiBwYXJhbXM/LmNvZXJjZSB8fCBmYWxzZSxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RCaWdJbnQgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoLi4uYXJndW1lbnRzKTtcbiAgICAgICAgdGhpcy5taW4gPSB0aGlzLmd0ZTtcbiAgICAgICAgdGhpcy5tYXggPSB0aGlzLmx0ZTtcbiAgICB9XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGlmICh0aGlzLl9kZWYuY29lcmNlKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGlucHV0LmRhdGEgPSBCaWdJbnQoaW5wdXQuZGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2dldEludmFsaWRJbnB1dChpbnB1dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFyc2VkVHlwZSA9IHRoaXMuX2dldFR5cGUoaW5wdXQpO1xuICAgICAgICBpZiAocGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5iaWdpbnQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9nZXRJbnZhbGlkSW5wdXQoaW5wdXQpO1xuICAgICAgICB9XG4gICAgICAgIGxldCBjdHggPSB1bmRlZmluZWQ7XG4gICAgICAgIGNvbnN0IHN0YXR1cyA9IG5ldyBQYXJzZVN0YXR1cygpO1xuICAgICAgICBmb3IgKGNvbnN0IGNoZWNrIG9mIHRoaXMuX2RlZi5jaGVja3MpIHtcbiAgICAgICAgICAgIGlmIChjaGVjay5raW5kID09PSBcIm1pblwiKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdG9vU21hbGwgPSBjaGVjay5pbmNsdXNpdmUgPyBpbnB1dC5kYXRhIDwgY2hlY2sudmFsdWUgOiBpbnB1dC5kYXRhIDw9IGNoZWNrLnZhbHVlO1xuICAgICAgICAgICAgICAgIGlmICh0b29TbWFsbCkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX3NtYWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJiaWdpbnRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIG1pbmltdW06IGNoZWNrLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlOiBjaGVjay5pbmNsdXNpdmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY2hlY2sua2luZCA9PT0gXCJtYXhcIikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRvb0JpZyA9IGNoZWNrLmluY2x1c2l2ZSA/IGlucHV0LmRhdGEgPiBjaGVjay52YWx1ZSA6IGlucHV0LmRhdGEgPj0gY2hlY2sudmFsdWU7XG4gICAgICAgICAgICAgICAgaWYgKHRvb0JpZykge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX2JpZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiYmlnaW50XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXhpbXVtOiBjaGVjay52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogY2hlY2suaW5jbHVzaXZlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogY2hlY2subWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwibXVsdGlwbGVPZlwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlucHV0LmRhdGEgJSBjaGVjay52YWx1ZSAhPT0gQmlnSW50KDApKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5ub3RfbXVsdGlwbGVfb2YsXG4gICAgICAgICAgICAgICAgICAgICAgICBtdWx0aXBsZU9mOiBjaGVjay52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB1dGlsLmFzc2VydE5ldmVyKGNoZWNrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyBzdGF0dXM6IHN0YXR1cy52YWx1ZSwgdmFsdWU6IGlucHV0LmRhdGEgfTtcbiAgICB9XG4gICAgX2dldEludmFsaWRJbnB1dChpbnB1dCkge1xuICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLmJpZ2ludCxcbiAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgIH1cbiAgICBndGUodmFsdWUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0TGltaXQoXCJtaW5cIiwgdmFsdWUsIHRydWUsIGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSk7XG4gICAgfVxuICAgIGd0KHZhbHVlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldExpbWl0KFwibWluXCIsIHZhbHVlLCBmYWxzZSwgZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpKTtcbiAgICB9XG4gICAgbHRlKHZhbHVlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNldExpbWl0KFwibWF4XCIsIHZhbHVlLCB0cnVlLCBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSkpO1xuICAgIH1cbiAgICBsdCh2YWx1ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXRMaW1pdChcIm1heFwiLCB2YWx1ZSwgZmFsc2UsIGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSk7XG4gICAgfVxuICAgIHNldExpbWl0KGtpbmQsIHZhbHVlLCBpbmNsdXNpdmUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RCaWdJbnQoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgY2hlY2tzOiBbXG4gICAgICAgICAgICAgICAgLi4udGhpcy5fZGVmLmNoZWNrcyxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGtpbmQsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlLFxuICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmUsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIF9hZGRDaGVjayhjaGVjaykge1xuICAgICAgICByZXR1cm4gbmV3IFpvZEJpZ0ludCh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBjaGVja3M6IFsuLi50aGlzLl9kZWYuY2hlY2tzLCBjaGVja10sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBwb3NpdGl2ZShtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm1pblwiLFxuICAgICAgICAgICAgdmFsdWU6IEJpZ0ludCgwKSxcbiAgICAgICAgICAgIGluY2x1c2l2ZTogZmFsc2UsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBuZWdhdGl2ZShtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm1heFwiLFxuICAgICAgICAgICAgdmFsdWU6IEJpZ0ludCgwKSxcbiAgICAgICAgICAgIGluY2x1c2l2ZTogZmFsc2UsXG4gICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBub25wb3NpdGl2ZShtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm1heFwiLFxuICAgICAgICAgICAgdmFsdWU6IEJpZ0ludCgwKSxcbiAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG5vbm5lZ2F0aXZlKG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2FkZENoZWNrKHtcbiAgICAgICAgICAgIGtpbmQ6IFwibWluXCIsXG4gICAgICAgICAgICB2YWx1ZTogQmlnSW50KDApLFxuICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbXVsdGlwbGVPZih2YWx1ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtdWx0aXBsZU9mXCIsXG4gICAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGdldCBtaW5WYWx1ZSgpIHtcbiAgICAgICAgbGV0IG1pbiA9IG51bGw7XG4gICAgICAgIGZvciAoY29uc3QgY2ggb2YgdGhpcy5fZGVmLmNoZWNrcykge1xuICAgICAgICAgICAgaWYgKGNoLmtpbmQgPT09IFwibWluXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAobWluID09PSBudWxsIHx8IGNoLnZhbHVlID4gbWluKVxuICAgICAgICAgICAgICAgICAgICBtaW4gPSBjaC52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWluO1xuICAgIH1cbiAgICBnZXQgbWF4VmFsdWUoKSB7XG4gICAgICAgIGxldCBtYXggPSBudWxsO1xuICAgICAgICBmb3IgKGNvbnN0IGNoIG9mIHRoaXMuX2RlZi5jaGVja3MpIHtcbiAgICAgICAgICAgIGlmIChjaC5raW5kID09PSBcIm1heFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1heCA9PT0gbnVsbCB8fCBjaC52YWx1ZSA8IG1heClcbiAgICAgICAgICAgICAgICAgICAgbWF4ID0gY2gudmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1heDtcbiAgICB9XG59XG5ab2RCaWdJbnQuY3JlYXRlID0gKHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kQmlnSW50KHtcbiAgICAgICAgY2hlY2tzOiBbXSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RCaWdJbnQsXG4gICAgICAgIGNvZXJjZTogcGFyYW1zPy5jb2VyY2UgPz8gZmFsc2UsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kQm9vbGVhbiBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBpZiAodGhpcy5fZGVmLmNvZXJjZSkge1xuICAgICAgICAgICAgaW5wdXQuZGF0YSA9IEJvb2xlYW4oaW5wdXQuZGF0YSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFyc2VkVHlwZSA9IHRoaXMuX2dldFR5cGUoaW5wdXQpO1xuICAgICAgICBpZiAocGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5ib29sZWFuKSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLmJvb2xlYW4sXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gT0soaW5wdXQuZGF0YSk7XG4gICAgfVxufVxuWm9kQm9vbGVhbi5jcmVhdGUgPSAocGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RCb29sZWFuKHtcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RCb29sZWFuLFxuICAgICAgICBjb2VyY2U6IHBhcmFtcz8uY29lcmNlIHx8IGZhbHNlLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZERhdGUgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgaWYgKHRoaXMuX2RlZi5jb2VyY2UpIHtcbiAgICAgICAgICAgIGlucHV0LmRhdGEgPSBuZXcgRGF0ZShpbnB1dC5kYXRhKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYXJzZWRUeXBlID0gdGhpcy5fZ2V0VHlwZShpbnB1dCk7XG4gICAgICAgIGlmIChwYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLmRhdGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUuZGF0ZSxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGlmIChOdW1iZXIuaXNOYU4oaW5wdXQuZGF0YS5nZXRUaW1lKCkpKSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9kYXRlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzdGF0dXMgPSBuZXcgUGFyc2VTdGF0dXMoKTtcbiAgICAgICAgbGV0IGN0eCA9IHVuZGVmaW5lZDtcbiAgICAgICAgZm9yIChjb25zdCBjaGVjayBvZiB0aGlzLl9kZWYuY2hlY2tzKSB7XG4gICAgICAgICAgICBpZiAoY2hlY2sua2luZCA9PT0gXCJtaW5cIikge1xuICAgICAgICAgICAgICAgIGlmIChpbnB1dC5kYXRhLmdldFRpbWUoKSA8IGNoZWNrLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0LCBjdHgpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fc21hbGwsXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBjaGVjay5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXhhY3Q6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWluaW11bTogY2hlY2sudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiBcImRhdGVcIixcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrLmtpbmQgPT09IFwibWF4XCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoaW5wdXQuZGF0YS5nZXRUaW1lKCkgPiBjaGVjay52YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCwgY3R4KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX2JpZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGNoZWNrLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmNsdXNpdmU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBleGFjdDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXhpbXVtOiBjaGVjay52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiZGF0ZVwiLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdXRpbC5hc3NlcnROZXZlcihjaGVjayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0YXR1czogc3RhdHVzLnZhbHVlLFxuICAgICAgICAgICAgdmFsdWU6IG5ldyBEYXRlKGlucHV0LmRhdGEuZ2V0VGltZSgpKSxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgX2FkZENoZWNrKGNoZWNrKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kRGF0ZSh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBjaGVja3M6IFsuLi50aGlzLl9kZWYuY2hlY2tzLCBjaGVja10sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBtaW4obWluRGF0ZSwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYWRkQ2hlY2soe1xuICAgICAgICAgICAga2luZDogXCJtaW5cIixcbiAgICAgICAgICAgIHZhbHVlOiBtaW5EYXRlLmdldFRpbWUoKSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG1heChtYXhEYXRlLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hZGRDaGVjayh7XG4gICAgICAgICAgICBraW5kOiBcIm1heFwiLFxuICAgICAgICAgICAgdmFsdWU6IG1heERhdGUuZ2V0VGltZSgpLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZ2V0IG1pbkRhdGUoKSB7XG4gICAgICAgIGxldCBtaW4gPSBudWxsO1xuICAgICAgICBmb3IgKGNvbnN0IGNoIG9mIHRoaXMuX2RlZi5jaGVja3MpIHtcbiAgICAgICAgICAgIGlmIChjaC5raW5kID09PSBcIm1pblwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1pbiA9PT0gbnVsbCB8fCBjaC52YWx1ZSA+IG1pbilcbiAgICAgICAgICAgICAgICAgICAgbWluID0gY2gudmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1pbiAhPSBudWxsID8gbmV3IERhdGUobWluKSA6IG51bGw7XG4gICAgfVxuICAgIGdldCBtYXhEYXRlKCkge1xuICAgICAgICBsZXQgbWF4ID0gbnVsbDtcbiAgICAgICAgZm9yIChjb25zdCBjaCBvZiB0aGlzLl9kZWYuY2hlY2tzKSB7XG4gICAgICAgICAgICBpZiAoY2gua2luZCA9PT0gXCJtYXhcIikge1xuICAgICAgICAgICAgICAgIGlmIChtYXggPT09IG51bGwgfHwgY2gudmFsdWUgPCBtYXgpXG4gICAgICAgICAgICAgICAgICAgIG1heCA9IGNoLnZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXggIT0gbnVsbCA/IG5ldyBEYXRlKG1heCkgOiBudWxsO1xuICAgIH1cbn1cblpvZERhdGUuY3JlYXRlID0gKHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kRGF0ZSh7XG4gICAgICAgIGNoZWNrczogW10sXG4gICAgICAgIGNvZXJjZTogcGFyYW1zPy5jb2VyY2UgfHwgZmFsc2UsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kRGF0ZSxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RTeW1ib2wgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgcGFyc2VkVHlwZSA9IHRoaXMuX2dldFR5cGUoaW5wdXQpO1xuICAgICAgICBpZiAocGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5zeW1ib2wpIHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUuc3ltYm9sLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIE9LKGlucHV0LmRhdGEpO1xuICAgIH1cbn1cblpvZFN5bWJvbC5jcmVhdGUgPSAocGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RTeW1ib2woe1xuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZFN5bWJvbCxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RVbmRlZmluZWQgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgcGFyc2VkVHlwZSA9IHRoaXMuX2dldFR5cGUoaW5wdXQpO1xuICAgICAgICBpZiAocGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS51bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUudW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIE9LKGlucHV0LmRhdGEpO1xuICAgIH1cbn1cblpvZFVuZGVmaW5lZC5jcmVhdGUgPSAocGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RVbmRlZmluZWQoe1xuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZFVuZGVmaW5lZCxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2ROdWxsIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZFR5cGUgPSB0aGlzLl9nZXRUeXBlKGlucHV0KTtcbiAgICAgICAgaWYgKHBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUubnVsbCkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5udWxsLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIE9LKGlucHV0LmRhdGEpO1xuICAgIH1cbn1cblpvZE51bGwuY3JlYXRlID0gKHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kTnVsbCh7XG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kTnVsbCxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RBbnkgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoLi4uYXJndW1lbnRzKTtcbiAgICAgICAgLy8gdG8gcHJldmVudCBpbnN0YW5jZXMgb2Ygb3RoZXIgY2xhc3NlcyBmcm9tIGV4dGVuZGluZyBab2RBbnkuIHRoaXMgY2F1c2VzIGlzc3VlcyB3aXRoIGNhdGNoYWxsIGluIFpvZE9iamVjdC5cbiAgICAgICAgdGhpcy5fYW55ID0gdHJ1ZTtcbiAgICB9XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIHJldHVybiBPSyhpbnB1dC5kYXRhKTtcbiAgICB9XG59XG5ab2RBbnkuY3JlYXRlID0gKHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kQW55KHtcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RBbnksXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kVW5rbm93biBleHRlbmRzIFpvZFR5cGUge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzdXBlciguLi5hcmd1bWVudHMpO1xuICAgICAgICAvLyByZXF1aXJlZFxuICAgICAgICB0aGlzLl91bmtub3duID0gdHJ1ZTtcbiAgICB9XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIHJldHVybiBPSyhpbnB1dC5kYXRhKTtcbiAgICB9XG59XG5ab2RVbmtub3duLmNyZWF0ZSA9IChwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZFVua25vd24oe1xuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZFVua25vd24sXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kTmV2ZXIgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5uZXZlcixcbiAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgIH1cbn1cblpvZE5ldmVyLmNyZWF0ZSA9IChwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZE5ldmVyKHtcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2ROZXZlcixcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RWb2lkIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZFR5cGUgPSB0aGlzLl9nZXRUeXBlKGlucHV0KTtcbiAgICAgICAgaWYgKHBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUudW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25zdCBjdHggPSB0aGlzLl9nZXRPclJldHVybkN0eChpbnB1dCk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLnZvaWQsXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gT0soaW5wdXQuZGF0YSk7XG4gICAgfVxufVxuWm9kVm9pZC5jcmVhdGUgPSAocGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RWb2lkKHtcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RWb2lkLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZEFycmF5IGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgY3R4LCBzdGF0dXMgfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGNvbnN0IGRlZiA9IHRoaXMuX2RlZjtcbiAgICAgICAgaWYgKGN0eC5wYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLmFycmF5KSB7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLmFycmF5LFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRlZi5leGFjdExlbmd0aCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgY29uc3QgdG9vQmlnID0gY3R4LmRhdGEubGVuZ3RoID4gZGVmLmV4YWN0TGVuZ3RoLnZhbHVlO1xuICAgICAgICAgICAgY29uc3QgdG9vU21hbGwgPSBjdHguZGF0YS5sZW5ndGggPCBkZWYuZXhhY3RMZW5ndGgudmFsdWU7XG4gICAgICAgICAgICBpZiAodG9vQmlnIHx8IHRvb1NtYWxsKSB7XG4gICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgIGNvZGU6IHRvb0JpZyA/IFpvZElzc3VlQ29kZS50b29fYmlnIDogWm9kSXNzdWVDb2RlLnRvb19zbWFsbCxcbiAgICAgICAgICAgICAgICAgICAgbWluaW11bTogKHRvb1NtYWxsID8gZGVmLmV4YWN0TGVuZ3RoLnZhbHVlIDogdW5kZWZpbmVkKSxcbiAgICAgICAgICAgICAgICAgICAgbWF4aW11bTogKHRvb0JpZyA/IGRlZi5leGFjdExlbmd0aC52YWx1ZSA6IHVuZGVmaW5lZCksXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBleGFjdDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogZGVmLmV4YWN0TGVuZ3RoLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRlZi5taW5MZW5ndGggIT09IG51bGwpIHtcbiAgICAgICAgICAgIGlmIChjdHguZGF0YS5sZW5ndGggPCBkZWYubWluTGVuZ3RoLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fc21hbGwsXG4gICAgICAgICAgICAgICAgICAgIG1pbmltdW06IGRlZi5taW5MZW5ndGgudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBleGFjdDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGRlZi5taW5MZW5ndGgubWVzc2FnZSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoZGVmLm1heExlbmd0aCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgaWYgKGN0eC5kYXRhLmxlbmd0aCA+IGRlZi5tYXhMZW5ndGgudmFsdWUpIHtcbiAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19iaWcsXG4gICAgICAgICAgICAgICAgICAgIG1heGltdW06IGRlZi5tYXhMZW5ndGgudmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBleGFjdDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGRlZi5tYXhMZW5ndGgubWVzc2FnZSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoY3R4LmNvbW1vbi5hc3luYykge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFsuLi5jdHguZGF0YV0ubWFwKChpdGVtLCBpKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRlZi50eXBlLl9wYXJzZUFzeW5jKG5ldyBQYXJzZUlucHV0TGF6eVBhdGgoY3R4LCBpdGVtLCBjdHgucGF0aCwgaSkpO1xuICAgICAgICAgICAgfSkpLnRoZW4oKHJlc3VsdCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBQYXJzZVN0YXR1cy5tZXJnZUFycmF5KHN0YXR1cywgcmVzdWx0KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IFsuLi5jdHguZGF0YV0ubWFwKChpdGVtLCBpKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gZGVmLnR5cGUuX3BhcnNlU3luYyhuZXcgUGFyc2VJbnB1dExhenlQYXRoKGN0eCwgaXRlbSwgY3R4LnBhdGgsIGkpKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBQYXJzZVN0YXR1cy5tZXJnZUFycmF5KHN0YXR1cywgcmVzdWx0KTtcbiAgICB9XG4gICAgZ2V0IGVsZW1lbnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYudHlwZTtcbiAgICB9XG4gICAgbWluKG1pbkxlbmd0aCwgbWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZEFycmF5KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIG1pbkxlbmd0aDogeyB2YWx1ZTogbWluTGVuZ3RoLCBtZXNzYWdlOiBlcnJvclV0aWwudG9TdHJpbmcobWVzc2FnZSkgfSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIG1heChtYXhMZW5ndGgsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RBcnJheSh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBtYXhMZW5ndGg6IHsgdmFsdWU6IG1heExlbmd0aCwgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpIH0sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBsZW5ndGgobGVuLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kQXJyYXkoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgZXhhY3RMZW5ndGg6IHsgdmFsdWU6IGxlbiwgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpIH0sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBub25lbXB0eShtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm1pbigxLCBtZXNzYWdlKTtcbiAgICB9XG59XG5ab2RBcnJheS5jcmVhdGUgPSAoc2NoZW1hLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZEFycmF5KHtcbiAgICAgICAgdHlwZTogc2NoZW1hLFxuICAgICAgICBtaW5MZW5ndGg6IG51bGwsXG4gICAgICAgIG1heExlbmd0aDogbnVsbCxcbiAgICAgICAgZXhhY3RMZW5ndGg6IG51bGwsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kQXJyYXksXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5mdW5jdGlvbiBkZWVwUGFydGlhbGlmeShzY2hlbWEpIHtcbiAgICBpZiAoc2NoZW1hIGluc3RhbmNlb2YgWm9kT2JqZWN0KSB7XG4gICAgICAgIGNvbnN0IG5ld1NoYXBlID0ge307XG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIHNjaGVtYS5zaGFwZSkge1xuICAgICAgICAgICAgY29uc3QgZmllbGRTY2hlbWEgPSBzY2hlbWEuc2hhcGVba2V5XTtcbiAgICAgICAgICAgIG5ld1NoYXBlW2tleV0gPSBab2RPcHRpb25hbC5jcmVhdGUoZGVlcFBhcnRpYWxpZnkoZmllbGRTY2hlbWEpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFpvZE9iamVjdCh7XG4gICAgICAgICAgICAuLi5zY2hlbWEuX2RlZixcbiAgICAgICAgICAgIHNoYXBlOiAoKSA9PiBuZXdTaGFwZSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHNjaGVtYSBpbnN0YW5jZW9mIFpvZEFycmF5KSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kQXJyYXkoe1xuICAgICAgICAgICAgLi4uc2NoZW1hLl9kZWYsXG4gICAgICAgICAgICB0eXBlOiBkZWVwUGFydGlhbGlmeShzY2hlbWEuZWxlbWVudCksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBlbHNlIGlmIChzY2hlbWEgaW5zdGFuY2VvZiBab2RPcHRpb25hbCkge1xuICAgICAgICByZXR1cm4gWm9kT3B0aW9uYWwuY3JlYXRlKGRlZXBQYXJ0aWFsaWZ5KHNjaGVtYS51bndyYXAoKSkpO1xuICAgIH1cbiAgICBlbHNlIGlmIChzY2hlbWEgaW5zdGFuY2VvZiBab2ROdWxsYWJsZSkge1xuICAgICAgICByZXR1cm4gWm9kTnVsbGFibGUuY3JlYXRlKGRlZXBQYXJ0aWFsaWZ5KHNjaGVtYS51bndyYXAoKSkpO1xuICAgIH1cbiAgICBlbHNlIGlmIChzY2hlbWEgaW5zdGFuY2VvZiBab2RUdXBsZSkge1xuICAgICAgICByZXR1cm4gWm9kVHVwbGUuY3JlYXRlKHNjaGVtYS5pdGVtcy5tYXAoKGl0ZW0pID0+IGRlZXBQYXJ0aWFsaWZ5KGl0ZW0pKSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4gc2NoZW1hO1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBab2RPYmplY3QgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoLi4uYXJndW1lbnRzKTtcbiAgICAgICAgdGhpcy5fY2FjaGVkID0gbnVsbDtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBkZXByZWNhdGVkIEluIG1vc3QgY2FzZXMsIHRoaXMgaXMgbm8gbG9uZ2VyIG5lZWRlZCAtIHVua25vd24gcHJvcGVydGllcyBhcmUgbm93IHNpbGVudGx5IHN0cmlwcGVkLlxuICAgICAgICAgKiBJZiB5b3Ugd2FudCB0byBwYXNzIHRocm91Z2ggdW5rbm93biBwcm9wZXJ0aWVzLCB1c2UgYC5wYXNzdGhyb3VnaCgpYCBpbnN0ZWFkLlxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ub25zdHJpY3QgPSB0aGlzLnBhc3N0aHJvdWdoO1xuICAgICAgICAvLyBleHRlbmQ8XG4gICAgICAgIC8vICAgQXVnbWVudGF0aW9uIGV4dGVuZHMgWm9kUmF3U2hhcGUsXG4gICAgICAgIC8vICAgTmV3T3V0cHV0IGV4dGVuZHMgdXRpbC5mbGF0dGVuPHtcbiAgICAgICAgLy8gICAgIFtrIGluIGtleW9mIEF1Z21lbnRhdGlvbiB8IGtleW9mIE91dHB1dF06IGsgZXh0ZW5kcyBrZXlvZiBBdWdtZW50YXRpb25cbiAgICAgICAgLy8gICAgICAgPyBBdWdtZW50YXRpb25ba11bXCJfb3V0cHV0XCJdXG4gICAgICAgIC8vICAgICAgIDogayBleHRlbmRzIGtleW9mIE91dHB1dFxuICAgICAgICAvLyAgICAgICA/IE91dHB1dFtrXVxuICAgICAgICAvLyAgICAgICA6IG5ldmVyO1xuICAgICAgICAvLyAgIH0+LFxuICAgICAgICAvLyAgIE5ld0lucHV0IGV4dGVuZHMgdXRpbC5mbGF0dGVuPHtcbiAgICAgICAgLy8gICAgIFtrIGluIGtleW9mIEF1Z21lbnRhdGlvbiB8IGtleW9mIElucHV0XTogayBleHRlbmRzIGtleW9mIEF1Z21lbnRhdGlvblxuICAgICAgICAvLyAgICAgICA/IEF1Z21lbnRhdGlvbltrXVtcIl9pbnB1dFwiXVxuICAgICAgICAvLyAgICAgICA6IGsgZXh0ZW5kcyBrZXlvZiBJbnB1dFxuICAgICAgICAvLyAgICAgICA/IElucHV0W2tdXG4gICAgICAgIC8vICAgICAgIDogbmV2ZXI7XG4gICAgICAgIC8vICAgfT5cbiAgICAgICAgLy8gPihcbiAgICAgICAgLy8gICBhdWdtZW50YXRpb246IEF1Z21lbnRhdGlvblxuICAgICAgICAvLyApOiBab2RPYmplY3Q8XG4gICAgICAgIC8vICAgZXh0ZW5kU2hhcGU8VCwgQXVnbWVudGF0aW9uPixcbiAgICAgICAgLy8gICBVbmtub3duS2V5cyxcbiAgICAgICAgLy8gICBDYXRjaGFsbCxcbiAgICAgICAgLy8gICBOZXdPdXRwdXQsXG4gICAgICAgIC8vICAgTmV3SW5wdXRcbiAgICAgICAgLy8gPiB7XG4gICAgICAgIC8vICAgcmV0dXJuIG5ldyBab2RPYmplY3Qoe1xuICAgICAgICAvLyAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAvLyAgICAgc2hhcGU6ICgpID0+ICh7XG4gICAgICAgIC8vICAgICAgIC4uLnRoaXMuX2RlZi5zaGFwZSgpLFxuICAgICAgICAvLyAgICAgICAuLi5hdWdtZW50YXRpb24sXG4gICAgICAgIC8vICAgICB9KSxcbiAgICAgICAgLy8gICB9KSBhcyBhbnk7XG4gICAgICAgIC8vIH1cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBkZXByZWNhdGVkIFVzZSBgLmV4dGVuZGAgaW5zdGVhZFxuICAgICAgICAgKiAgKi9cbiAgICAgICAgdGhpcy5hdWdtZW50ID0gdGhpcy5leHRlbmQ7XG4gICAgfVxuICAgIF9nZXRDYWNoZWQoKSB7XG4gICAgICAgIGlmICh0aGlzLl9jYWNoZWQgIT09IG51bGwpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY2FjaGVkO1xuICAgICAgICBjb25zdCBzaGFwZSA9IHRoaXMuX2RlZi5zaGFwZSgpO1xuICAgICAgICBjb25zdCBrZXlzID0gdXRpbC5vYmplY3RLZXlzKHNoYXBlKTtcbiAgICAgICAgdGhpcy5fY2FjaGVkID0geyBzaGFwZSwga2V5cyB9O1xuICAgICAgICByZXR1cm4gdGhpcy5fY2FjaGVkO1xuICAgIH1cbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgcGFyc2VkVHlwZSA9IHRoaXMuX2dldFR5cGUoaW5wdXQpO1xuICAgICAgICBpZiAocGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5vYmplY3QpIHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUub2JqZWN0LFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgeyBzdGF0dXMsIGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgY29uc3QgeyBzaGFwZSwga2V5czogc2hhcGVLZXlzIH0gPSB0aGlzLl9nZXRDYWNoZWQoKTtcbiAgICAgICAgY29uc3QgZXh0cmFLZXlzID0gW107XG4gICAgICAgIGlmICghKHRoaXMuX2RlZi5jYXRjaGFsbCBpbnN0YW5jZW9mIFpvZE5ldmVyICYmIHRoaXMuX2RlZi51bmtub3duS2V5cyA9PT0gXCJzdHJpcFwiKSkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gY3R4LmRhdGEpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXNoYXBlS2V5cy5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgIGV4dHJhS2V5cy5wdXNoKGtleSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhaXJzID0gW107XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIHNoYXBlS2V5cykge1xuICAgICAgICAgICAgY29uc3Qga2V5VmFsaWRhdG9yID0gc2hhcGVba2V5XTtcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gY3R4LmRhdGFba2V5XTtcbiAgICAgICAgICAgIHBhaXJzLnB1c2goe1xuICAgICAgICAgICAgICAgIGtleTogeyBzdGF0dXM6IFwidmFsaWRcIiwgdmFsdWU6IGtleSB9LFxuICAgICAgICAgICAgICAgIHZhbHVlOiBrZXlWYWxpZGF0b3IuX3BhcnNlKG5ldyBQYXJzZUlucHV0TGF6eVBhdGgoY3R4LCB2YWx1ZSwgY3R4LnBhdGgsIGtleSkpLFxuICAgICAgICAgICAgICAgIGFsd2F5c1NldDoga2V5IGluIGN0eC5kYXRhLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuX2RlZi5jYXRjaGFsbCBpbnN0YW5jZW9mIFpvZE5ldmVyKSB7XG4gICAgICAgICAgICBjb25zdCB1bmtub3duS2V5cyA9IHRoaXMuX2RlZi51bmtub3duS2V5cztcbiAgICAgICAgICAgIGlmICh1bmtub3duS2V5cyA9PT0gXCJwYXNzdGhyb3VnaFwiKSB7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgZXh0cmFLZXlzKSB7XG4gICAgICAgICAgICAgICAgICAgIHBhaXJzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAga2V5OiB7IHN0YXR1czogXCJ2YWxpZFwiLCB2YWx1ZToga2V5IH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogeyBzdGF0dXM6IFwidmFsaWRcIiwgdmFsdWU6IGN0eC5kYXRhW2tleV0gfSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodW5rbm93bktleXMgPT09IFwic3RyaWN0XCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXh0cmFLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudW5yZWNvZ25pemVkX2tleXMsXG4gICAgICAgICAgICAgICAgICAgICAgICBrZXlzOiBleHRyYUtleXMsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh1bmtub3duS2V5cyA9PT0gXCJzdHJpcFwiKSB7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludGVybmFsIFpvZE9iamVjdCBlcnJvcjogaW52YWxpZCB1bmtub3duS2V5cyB2YWx1ZS5gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIC8vIHJ1biBjYXRjaGFsbCB2YWxpZGF0aW9uXG4gICAgICAgICAgICBjb25zdCBjYXRjaGFsbCA9IHRoaXMuX2RlZi5jYXRjaGFsbDtcbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IG9mIGV4dHJhS2V5cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gY3R4LmRhdGFba2V5XTtcbiAgICAgICAgICAgICAgICBwYWlycy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAga2V5OiB7IHN0YXR1czogXCJ2YWxpZFwiLCB2YWx1ZToga2V5IH0sXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBjYXRjaGFsbC5fcGFyc2UobmV3IFBhcnNlSW5wdXRMYXp5UGF0aChjdHgsIHZhbHVlLCBjdHgucGF0aCwga2V5KSAvLywgY3R4LmNoaWxkKGtleSksIHZhbHVlLCBnZXRQYXJzZWRUeXBlKHZhbHVlKVxuICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgICAgICBhbHdheXNTZXQ6IGtleSBpbiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoY3R4LmNvbW1vbi5hc3luYykge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgICAgICAgLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHN5bmNQYWlycyA9IFtdO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgcGFpciBvZiBwYWlycykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBrZXkgPSBhd2FpdCBwYWlyLmtleTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBhd2FpdCBwYWlyLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBzeW5jUGFpcnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZXksXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFsd2F5c1NldDogcGFpci5hbHdheXNTZXQsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gc3luY1BhaXJzO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAudGhlbigoc3luY1BhaXJzKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFBhcnNlU3RhdHVzLm1lcmdlT2JqZWN0U3luYyhzdGF0dXMsIHN5bmNQYWlycyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBQYXJzZVN0YXR1cy5tZXJnZU9iamVjdFN5bmMoc3RhdHVzLCBwYWlycyk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0IHNoYXBlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnNoYXBlKCk7XG4gICAgfVxuICAgIHN0cmljdChtZXNzYWdlKSB7XG4gICAgICAgIGVycm9yVXRpbC5lcnJUb09iajtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RPYmplY3Qoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgdW5rbm93bktleXM6IFwic3RyaWN0XCIsXG4gICAgICAgICAgICAuLi4obWVzc2FnZSAhPT0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgPyB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yTWFwOiAoaXNzdWUsIGN0eCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZGVmYXVsdEVycm9yID0gdGhpcy5fZGVmLmVycm9yTWFwPy4oaXNzdWUsIGN0eCkubWVzc2FnZSA/PyBjdHguZGVmYXVsdEVycm9yO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzc3VlLmNvZGUgPT09IFwidW5yZWNvZ25pemVkX2tleXNcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlOiBlcnJvclV0aWwuZXJyVG9PYmoobWVzc2FnZSkubWVzc2FnZSA/PyBkZWZhdWx0RXJyb3IsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogZGVmYXVsdEVycm9yLFxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgOiB7fSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBzdHJpcCgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RPYmplY3Qoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgdW5rbm93bktleXM6IFwic3RyaXBcIixcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHBhc3N0aHJvdWdoKCkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZE9iamVjdCh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICB1bmtub3duS2V5czogXCJwYXNzdGhyb3VnaFwiLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgLy8gY29uc3QgQXVnbWVudEZhY3RvcnkgPVxuICAgIC8vICAgPERlZiBleHRlbmRzIFpvZE9iamVjdERlZj4oZGVmOiBEZWYpID0+XG4gICAgLy8gICA8QXVnbWVudGF0aW9uIGV4dGVuZHMgWm9kUmF3U2hhcGU+KFxuICAgIC8vICAgICBhdWdtZW50YXRpb246IEF1Z21lbnRhdGlvblxuICAgIC8vICAgKTogWm9kT2JqZWN0PFxuICAgIC8vICAgICBleHRlbmRTaGFwZTxSZXR1cm5UeXBlPERlZltcInNoYXBlXCJdPiwgQXVnbWVudGF0aW9uPixcbiAgICAvLyAgICAgRGVmW1widW5rbm93bktleXNcIl0sXG4gICAgLy8gICAgIERlZltcImNhdGNoYWxsXCJdXG4gICAgLy8gICA+ID0+IHtcbiAgICAvLyAgICAgcmV0dXJuIG5ldyBab2RPYmplY3Qoe1xuICAgIC8vICAgICAgIC4uLmRlZixcbiAgICAvLyAgICAgICBzaGFwZTogKCkgPT4gKHtcbiAgICAvLyAgICAgICAgIC4uLmRlZi5zaGFwZSgpLFxuICAgIC8vICAgICAgICAgLi4uYXVnbWVudGF0aW9uLFxuICAgIC8vICAgICAgIH0pLFxuICAgIC8vICAgICB9KSBhcyBhbnk7XG4gICAgLy8gICB9O1xuICAgIGV4dGVuZChhdWdtZW50YXRpb24pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RPYmplY3Qoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgc2hhcGU6ICgpID0+ICh7XG4gICAgICAgICAgICAgICAgLi4udGhpcy5fZGVmLnNoYXBlKCksXG4gICAgICAgICAgICAgICAgLi4uYXVnbWVudGF0aW9uLFxuICAgICAgICAgICAgfSksXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBQcmlvciB0byB6b2RAMS4wLjEyIHRoZXJlIHdhcyBhIGJ1ZyBpbiB0aGVcbiAgICAgKiBpbmZlcnJlZCB0eXBlIG9mIG1lcmdlZCBvYmplY3RzLiBQbGVhc2VcbiAgICAgKiB1cGdyYWRlIGlmIHlvdSBhcmUgZXhwZXJpZW5jaW5nIGlzc3Vlcy5cbiAgICAgKi9cbiAgICBtZXJnZShtZXJnaW5nKSB7XG4gICAgICAgIGNvbnN0IG1lcmdlZCA9IG5ldyBab2RPYmplY3Qoe1xuICAgICAgICAgICAgdW5rbm93bktleXM6IG1lcmdpbmcuX2RlZi51bmtub3duS2V5cyxcbiAgICAgICAgICAgIGNhdGNoYWxsOiBtZXJnaW5nLl9kZWYuY2F0Y2hhbGwsXG4gICAgICAgICAgICBzaGFwZTogKCkgPT4gKHtcbiAgICAgICAgICAgICAgICAuLi50aGlzLl9kZWYuc2hhcGUoKSxcbiAgICAgICAgICAgICAgICAuLi5tZXJnaW5nLl9kZWYuc2hhcGUoKSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RPYmplY3QsXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gbWVyZ2VkO1xuICAgIH1cbiAgICAvLyBtZXJnZTxcbiAgICAvLyAgIEluY29taW5nIGV4dGVuZHMgQW55Wm9kT2JqZWN0LFxuICAgIC8vICAgQXVnbWVudGF0aW9uIGV4dGVuZHMgSW5jb21pbmdbXCJzaGFwZVwiXSxcbiAgICAvLyAgIE5ld091dHB1dCBleHRlbmRzIHtcbiAgICAvLyAgICAgW2sgaW4ga2V5b2YgQXVnbWVudGF0aW9uIHwga2V5b2YgT3V0cHV0XTogayBleHRlbmRzIGtleW9mIEF1Z21lbnRhdGlvblxuICAgIC8vICAgICAgID8gQXVnbWVudGF0aW9uW2tdW1wiX291dHB1dFwiXVxuICAgIC8vICAgICAgIDogayBleHRlbmRzIGtleW9mIE91dHB1dFxuICAgIC8vICAgICAgID8gT3V0cHV0W2tdXG4gICAgLy8gICAgICAgOiBuZXZlcjtcbiAgICAvLyAgIH0sXG4gICAgLy8gICBOZXdJbnB1dCBleHRlbmRzIHtcbiAgICAvLyAgICAgW2sgaW4ga2V5b2YgQXVnbWVudGF0aW9uIHwga2V5b2YgSW5wdXRdOiBrIGV4dGVuZHMga2V5b2YgQXVnbWVudGF0aW9uXG4gICAgLy8gICAgICAgPyBBdWdtZW50YXRpb25ba11bXCJfaW5wdXRcIl1cbiAgICAvLyAgICAgICA6IGsgZXh0ZW5kcyBrZXlvZiBJbnB1dFxuICAgIC8vICAgICAgID8gSW5wdXRba11cbiAgICAvLyAgICAgICA6IG5ldmVyO1xuICAgIC8vICAgfVxuICAgIC8vID4oXG4gICAgLy8gICBtZXJnaW5nOiBJbmNvbWluZ1xuICAgIC8vICk6IFpvZE9iamVjdDxcbiAgICAvLyAgIGV4dGVuZFNoYXBlPFQsIFJldHVyblR5cGU8SW5jb21pbmdbXCJfZGVmXCJdW1wic2hhcGVcIl0+PixcbiAgICAvLyAgIEluY29taW5nW1wiX2RlZlwiXVtcInVua25vd25LZXlzXCJdLFxuICAgIC8vICAgSW5jb21pbmdbXCJfZGVmXCJdW1wiY2F0Y2hhbGxcIl0sXG4gICAgLy8gICBOZXdPdXRwdXQsXG4gICAgLy8gICBOZXdJbnB1dFxuICAgIC8vID4ge1xuICAgIC8vICAgY29uc3QgbWVyZ2VkOiBhbnkgPSBuZXcgWm9kT2JqZWN0KHtcbiAgICAvLyAgICAgdW5rbm93bktleXM6IG1lcmdpbmcuX2RlZi51bmtub3duS2V5cyxcbiAgICAvLyAgICAgY2F0Y2hhbGw6IG1lcmdpbmcuX2RlZi5jYXRjaGFsbCxcbiAgICAvLyAgICAgc2hhcGU6ICgpID0+XG4gICAgLy8gICAgICAgb2JqZWN0VXRpbC5tZXJnZVNoYXBlcyh0aGlzLl9kZWYuc2hhcGUoKSwgbWVyZ2luZy5fZGVmLnNoYXBlKCkpLFxuICAgIC8vICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZE9iamVjdCxcbiAgICAvLyAgIH0pIGFzIGFueTtcbiAgICAvLyAgIHJldHVybiBtZXJnZWQ7XG4gICAgLy8gfVxuICAgIHNldEtleShrZXksIHNjaGVtYSkge1xuICAgICAgICByZXR1cm4gdGhpcy5hdWdtZW50KHsgW2tleV06IHNjaGVtYSB9KTtcbiAgICB9XG4gICAgLy8gbWVyZ2U8SW5jb21pbmcgZXh0ZW5kcyBBbnlab2RPYmplY3Q+KFxuICAgIC8vICAgbWVyZ2luZzogSW5jb21pbmdcbiAgICAvLyApOiAvL1pvZE9iamVjdDxUICYgSW5jb21pbmdbXCJfc2hhcGVcIl0sIFVua25vd25LZXlzLCBDYXRjaGFsbD4gPSAobWVyZ2luZykgPT4ge1xuICAgIC8vIFpvZE9iamVjdDxcbiAgICAvLyAgIGV4dGVuZFNoYXBlPFQsIFJldHVyblR5cGU8SW5jb21pbmdbXCJfZGVmXCJdW1wic2hhcGVcIl0+PixcbiAgICAvLyAgIEluY29taW5nW1wiX2RlZlwiXVtcInVua25vd25LZXlzXCJdLFxuICAgIC8vICAgSW5jb21pbmdbXCJfZGVmXCJdW1wiY2F0Y2hhbGxcIl1cbiAgICAvLyA+IHtcbiAgICAvLyAgIC8vIGNvbnN0IG1lcmdlZFNoYXBlID0gb2JqZWN0VXRpbC5tZXJnZVNoYXBlcyhcbiAgICAvLyAgIC8vICAgdGhpcy5fZGVmLnNoYXBlKCksXG4gICAgLy8gICAvLyAgIG1lcmdpbmcuX2RlZi5zaGFwZSgpXG4gICAgLy8gICAvLyApO1xuICAgIC8vICAgY29uc3QgbWVyZ2VkOiBhbnkgPSBuZXcgWm9kT2JqZWN0KHtcbiAgICAvLyAgICAgdW5rbm93bktleXM6IG1lcmdpbmcuX2RlZi51bmtub3duS2V5cyxcbiAgICAvLyAgICAgY2F0Y2hhbGw6IG1lcmdpbmcuX2RlZi5jYXRjaGFsbCxcbiAgICAvLyAgICAgc2hhcGU6ICgpID0+XG4gICAgLy8gICAgICAgb2JqZWN0VXRpbC5tZXJnZVNoYXBlcyh0aGlzLl9kZWYuc2hhcGUoKSwgbWVyZ2luZy5fZGVmLnNoYXBlKCkpLFxuICAgIC8vICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZE9iamVjdCxcbiAgICAvLyAgIH0pIGFzIGFueTtcbiAgICAvLyAgIHJldHVybiBtZXJnZWQ7XG4gICAgLy8gfVxuICAgIGNhdGNoYWxsKGluZGV4KSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kT2JqZWN0KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIGNhdGNoYWxsOiBpbmRleCxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHBpY2sobWFzaykge1xuICAgICAgICBjb25zdCBzaGFwZSA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiB1dGlsLm9iamVjdEtleXMobWFzaykpIHtcbiAgICAgICAgICAgIGlmIChtYXNrW2tleV0gJiYgdGhpcy5zaGFwZVtrZXldKSB7XG4gICAgICAgICAgICAgICAgc2hhcGVba2V5XSA9IHRoaXMuc2hhcGVba2V5XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFpvZE9iamVjdCh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBzaGFwZTogKCkgPT4gc2hhcGUsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBvbWl0KG1hc2spIHtcbiAgICAgICAgY29uc3Qgc2hhcGUgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgdXRpbC5vYmplY3RLZXlzKHRoaXMuc2hhcGUpKSB7XG4gICAgICAgICAgICBpZiAoIW1hc2tba2V5XSkge1xuICAgICAgICAgICAgICAgIHNoYXBlW2tleV0gPSB0aGlzLnNoYXBlW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBab2RPYmplY3Qoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgc2hhcGU6ICgpID0+IHNoYXBlLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogQGRlcHJlY2F0ZWRcbiAgICAgKi9cbiAgICBkZWVwUGFydGlhbCgpIHtcbiAgICAgICAgcmV0dXJuIGRlZXBQYXJ0aWFsaWZ5KHRoaXMpO1xuICAgIH1cbiAgICBwYXJ0aWFsKG1hc2spIHtcbiAgICAgICAgY29uc3QgbmV3U2hhcGUgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgdXRpbC5vYmplY3RLZXlzKHRoaXMuc2hhcGUpKSB7XG4gICAgICAgICAgICBjb25zdCBmaWVsZFNjaGVtYSA9IHRoaXMuc2hhcGVba2V5XTtcbiAgICAgICAgICAgIGlmIChtYXNrICYmICFtYXNrW2tleV0pIHtcbiAgICAgICAgICAgICAgICBuZXdTaGFwZVtrZXldID0gZmllbGRTY2hlbWE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBuZXdTaGFwZVtrZXldID0gZmllbGRTY2hlbWEub3B0aW9uYWwoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFpvZE9iamVjdCh7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICBzaGFwZTogKCkgPT4gbmV3U2hhcGUsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXF1aXJlZChtYXNrKSB7XG4gICAgICAgIGNvbnN0IG5ld1NoYXBlID0ge307XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIHV0aWwub2JqZWN0S2V5cyh0aGlzLnNoYXBlKSkge1xuICAgICAgICAgICAgaWYgKG1hc2sgJiYgIW1hc2tba2V5XSkge1xuICAgICAgICAgICAgICAgIG5ld1NoYXBlW2tleV0gPSB0aGlzLnNoYXBlW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmaWVsZFNjaGVtYSA9IHRoaXMuc2hhcGVba2V5XTtcbiAgICAgICAgICAgICAgICBsZXQgbmV3RmllbGQgPSBmaWVsZFNjaGVtYTtcbiAgICAgICAgICAgICAgICB3aGlsZSAobmV3RmllbGQgaW5zdGFuY2VvZiBab2RPcHRpb25hbCkge1xuICAgICAgICAgICAgICAgICAgICBuZXdGaWVsZCA9IG5ld0ZpZWxkLl9kZWYuaW5uZXJUeXBlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBuZXdTaGFwZVtrZXldID0gbmV3RmllbGQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBab2RPYmplY3Qoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgc2hhcGU6ICgpID0+IG5ld1NoYXBlLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAga2V5b2YoKSB7XG4gICAgICAgIHJldHVybiBjcmVhdGVab2RFbnVtKHV0aWwub2JqZWN0S2V5cyh0aGlzLnNoYXBlKSk7XG4gICAgfVxufVxuWm9kT2JqZWN0LmNyZWF0ZSA9IChzaGFwZSwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RPYmplY3Qoe1xuICAgICAgICBzaGFwZTogKCkgPT4gc2hhcGUsXG4gICAgICAgIHVua25vd25LZXlzOiBcInN0cmlwXCIsXG4gICAgICAgIGNhdGNoYWxsOiBab2ROZXZlci5jcmVhdGUoKSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RPYmplY3QsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5ab2RPYmplY3Quc3RyaWN0Q3JlYXRlID0gKHNoYXBlLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZE9iamVjdCh7XG4gICAgICAgIHNoYXBlOiAoKSA9PiBzaGFwZSxcbiAgICAgICAgdW5rbm93bktleXM6IFwic3RyaWN0XCIsXG4gICAgICAgIGNhdGNoYWxsOiBab2ROZXZlci5jcmVhdGUoKSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RPYmplY3QsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5ab2RPYmplY3QubGF6eWNyZWF0ZSA9IChzaGFwZSwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RPYmplY3Qoe1xuICAgICAgICBzaGFwZSxcbiAgICAgICAgdW5rbm93bktleXM6IFwic3RyaXBcIixcbiAgICAgICAgY2F0Y2hhbGw6IFpvZE5ldmVyLmNyZWF0ZSgpLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZE9iamVjdCxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RVbmlvbiBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgY29uc3Qgb3B0aW9ucyA9IHRoaXMuX2RlZi5vcHRpb25zO1xuICAgICAgICBmdW5jdGlvbiBoYW5kbGVSZXN1bHRzKHJlc3VsdHMpIHtcbiAgICAgICAgICAgIC8vIHJldHVybiBmaXJzdCBpc3N1ZS1mcmVlIHZhbGlkYXRpb24gaWYgaXQgZXhpc3RzXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5yZXN1bHQuc3RhdHVzID09PSBcInZhbGlkXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdC5yZXN1bHQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQucmVzdWx0LnN0YXR1cyA9PT0gXCJkaXJ0eVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGFkZCBpc3N1ZXMgZnJvbSBkaXJ0eSBvcHRpb25cbiAgICAgICAgICAgICAgICAgICAgY3R4LmNvbW1vbi5pc3N1ZXMucHVzaCguLi5yZXN1bHQuY3R4LmNvbW1vbi5pc3N1ZXMpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0LnJlc3VsdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyByZXR1cm4gaW52YWxpZFxuICAgICAgICAgICAgY29uc3QgdW5pb25FcnJvcnMgPSByZXN1bHRzLm1hcCgocmVzdWx0KSA9PiBuZXcgWm9kRXJyb3IocmVzdWx0LmN0eC5jb21tb24uaXNzdWVzKSk7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF91bmlvbixcbiAgICAgICAgICAgICAgICB1bmlvbkVycm9ycyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGN0eC5jb21tb24uYXN5bmMpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChvcHRpb25zLm1hcChhc3luYyAob3B0aW9uKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgY2hpbGRDdHggPSB7XG4gICAgICAgICAgICAgICAgICAgIC4uLmN0eCxcbiAgICAgICAgICAgICAgICAgICAgY29tbW9uOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAuLi5jdHguY29tbW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNzdWVzOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBudWxsLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0OiBhd2FpdCBvcHRpb24uX3BhcnNlQXN5bmMoe1xuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YTogY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDogY2hpbGRDdHgsXG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICAgICBjdHg6IGNoaWxkQ3R4LFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9KSkudGhlbihoYW5kbGVSZXN1bHRzKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGxldCBkaXJ0eSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGNvbnN0IGlzc3VlcyA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBvcHRpb24gb2Ygb3B0aW9ucykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNoaWxkQ3R4ID0ge1xuICAgICAgICAgICAgICAgICAgICAuLi5jdHgsXG4gICAgICAgICAgICAgICAgICAgIGNvbW1vbjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgLi4uY3R4LmNvbW1vbixcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzc3VlczogW10sXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogbnVsbCxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IG9wdGlvbi5fcGFyc2VTeW5jKHtcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IGNoaWxkQ3R4LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSBcInZhbGlkXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAocmVzdWx0LnN0YXR1cyA9PT0gXCJkaXJ0eVwiICYmICFkaXJ0eSkge1xuICAgICAgICAgICAgICAgICAgICBkaXJ0eSA9IHsgcmVzdWx0LCBjdHg6IGNoaWxkQ3R4IH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChjaGlsZEN0eC5jb21tb24uaXNzdWVzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBpc3N1ZXMucHVzaChjaGlsZEN0eC5jb21tb24uaXNzdWVzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZGlydHkpIHtcbiAgICAgICAgICAgICAgICBjdHguY29tbW9uLmlzc3Vlcy5wdXNoKC4uLmRpcnR5LmN0eC5jb21tb24uaXNzdWVzKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZGlydHkucmVzdWx0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgdW5pb25FcnJvcnMgPSBpc3N1ZXMubWFwKChpc3N1ZXMpID0+IG5ldyBab2RFcnJvcihpc3N1ZXMpKTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3VuaW9uLFxuICAgICAgICAgICAgICAgIHVuaW9uRXJyb3JzLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBnZXQgb3B0aW9ucygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5vcHRpb25zO1xuICAgIH1cbn1cblpvZFVuaW9uLmNyZWF0ZSA9ICh0eXBlcywgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RVbmlvbih7XG4gICAgICAgIG9wdGlvbnM6IHR5cGVzLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZFVuaW9uLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLy8vLy8vLy8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8vLy8vLy8vL1xuLy8vLy8vLy8vLyAgICAgIFpvZERpc2NyaW1pbmF0ZWRVbmlvbiAgICAgIC8vLy8vLy8vLy9cbi8vLy8vLy8vLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLy8vLy8vLy8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbmNvbnN0IGdldERpc2NyaW1pbmF0b3IgPSAodHlwZSkgPT4ge1xuICAgIGlmICh0eXBlIGluc3RhbmNlb2YgWm9kTGF6eSkge1xuICAgICAgICByZXR1cm4gZ2V0RGlzY3JpbWluYXRvcih0eXBlLnNjaGVtYSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGUgaW5zdGFuY2VvZiBab2RFZmZlY3RzKSB7XG4gICAgICAgIHJldHVybiBnZXREaXNjcmltaW5hdG9yKHR5cGUuaW5uZXJUeXBlKCkpO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlIGluc3RhbmNlb2YgWm9kTGl0ZXJhbCkge1xuICAgICAgICByZXR1cm4gW3R5cGUudmFsdWVdO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlIGluc3RhbmNlb2YgWm9kRW51bSkge1xuICAgICAgICByZXR1cm4gdHlwZS5vcHRpb25zO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlIGluc3RhbmNlb2YgWm9kTmF0aXZlRW51bSkge1xuICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgYmFuL2JhblxuICAgICAgICByZXR1cm4gdXRpbC5vYmplY3RWYWx1ZXModHlwZS5lbnVtKTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZSBpbnN0YW5jZW9mIFpvZERlZmF1bHQpIHtcbiAgICAgICAgcmV0dXJuIGdldERpc2NyaW1pbmF0b3IodHlwZS5fZGVmLmlubmVyVHlwZSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGUgaW5zdGFuY2VvZiBab2RVbmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIFt1bmRlZmluZWRdO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlIGluc3RhbmNlb2YgWm9kTnVsbCkge1xuICAgICAgICByZXR1cm4gW251bGxdO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlIGluc3RhbmNlb2YgWm9kT3B0aW9uYWwpIHtcbiAgICAgICAgcmV0dXJuIFt1bmRlZmluZWQsIC4uLmdldERpc2NyaW1pbmF0b3IodHlwZS51bndyYXAoKSldO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlIGluc3RhbmNlb2YgWm9kTnVsbGFibGUpIHtcbiAgICAgICAgcmV0dXJuIFtudWxsLCAuLi5nZXREaXNjcmltaW5hdG9yKHR5cGUudW53cmFwKCkpXTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZSBpbnN0YW5jZW9mIFpvZEJyYW5kZWQpIHtcbiAgICAgICAgcmV0dXJuIGdldERpc2NyaW1pbmF0b3IodHlwZS51bndyYXAoKSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGUgaW5zdGFuY2VvZiBab2RSZWFkb25seSkge1xuICAgICAgICByZXR1cm4gZ2V0RGlzY3JpbWluYXRvcih0eXBlLnVud3JhcCgpKTtcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZSBpbnN0YW5jZW9mIFpvZENhdGNoKSB7XG4gICAgICAgIHJldHVybiBnZXREaXNjcmltaW5hdG9yKHR5cGUuX2RlZi5pbm5lclR5cGUpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgIH1cbn07XG5leHBvcnQgY2xhc3MgWm9kRGlzY3JpbWluYXRlZFVuaW9uIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBpZiAoY3R4LnBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUub2JqZWN0KSB7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLm9iamVjdCxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGRpc2NyaW1pbmF0b3IgPSB0aGlzLmRpc2NyaW1pbmF0b3I7XG4gICAgICAgIGNvbnN0IGRpc2NyaW1pbmF0b3JWYWx1ZSA9IGN0eC5kYXRhW2Rpc2NyaW1pbmF0b3JdO1xuICAgICAgICBjb25zdCBvcHRpb24gPSB0aGlzLm9wdGlvbnNNYXAuZ2V0KGRpc2NyaW1pbmF0b3JWYWx1ZSk7XG4gICAgICAgIGlmICghb3B0aW9uKSB7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF91bmlvbl9kaXNjcmltaW5hdG9yLFxuICAgICAgICAgICAgICAgIG9wdGlvbnM6IEFycmF5LmZyb20odGhpcy5vcHRpb25zTWFwLmtleXMoKSksXG4gICAgICAgICAgICAgICAgcGF0aDogW2Rpc2NyaW1pbmF0b3JdLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY3R4LmNvbW1vbi5hc3luYykge1xuICAgICAgICAgICAgcmV0dXJuIG9wdGlvbi5fcGFyc2VBc3luYyh7XG4gICAgICAgICAgICAgICAgZGF0YTogY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBvcHRpb24uX3BhcnNlU3luYyh7XG4gICAgICAgICAgICAgICAgZGF0YTogY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBnZXQgZGlzY3JpbWluYXRvcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5kaXNjcmltaW5hdG9yO1xuICAgIH1cbiAgICBnZXQgb3B0aW9ucygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5vcHRpb25zO1xuICAgIH1cbiAgICBnZXQgb3B0aW9uc01hcCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5vcHRpb25zTWFwO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBUaGUgY29uc3RydWN0b3Igb2YgdGhlIGRpc2NyaW1pbmF0ZWQgdW5pb24gc2NoZW1hLiBJdHMgYmVoYXZpb3VyIGlzIHZlcnkgc2ltaWxhciB0byB0aGF0IG9mIHRoZSBub3JtYWwgei51bmlvbigpIGNvbnN0cnVjdG9yLlxuICAgICAqIEhvd2V2ZXIsIGl0IG9ubHkgYWxsb3dzIGEgdW5pb24gb2Ygb2JqZWN0cywgYWxsIG9mIHdoaWNoIG5lZWQgdG8gc2hhcmUgYSBkaXNjcmltaW5hdG9yIHByb3BlcnR5LiBUaGlzIHByb3BlcnR5IG11c3RcbiAgICAgKiBoYXZlIGEgZGlmZmVyZW50IHZhbHVlIGZvciBlYWNoIG9iamVjdCBpbiB0aGUgdW5pb24uXG4gICAgICogQHBhcmFtIGRpc2NyaW1pbmF0b3IgdGhlIG5hbWUgb2YgdGhlIGRpc2NyaW1pbmF0b3IgcHJvcGVydHlcbiAgICAgKiBAcGFyYW0gdHlwZXMgYW4gYXJyYXkgb2Ygb2JqZWN0IHNjaGVtYXNcbiAgICAgKiBAcGFyYW0gcGFyYW1zXG4gICAgICovXG4gICAgc3RhdGljIGNyZWF0ZShkaXNjcmltaW5hdG9yLCBvcHRpb25zLCBwYXJhbXMpIHtcbiAgICAgICAgLy8gR2V0IGFsbCB0aGUgdmFsaWQgZGlzY3JpbWluYXRvciB2YWx1ZXNcbiAgICAgICAgY29uc3Qgb3B0aW9uc01hcCA9IG5ldyBNYXAoKTtcbiAgICAgICAgLy8gdHJ5IHtcbiAgICAgICAgZm9yIChjb25zdCB0eXBlIG9mIG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGNvbnN0IGRpc2NyaW1pbmF0b3JWYWx1ZXMgPSBnZXREaXNjcmltaW5hdG9yKHR5cGUuc2hhcGVbZGlzY3JpbWluYXRvcl0pO1xuICAgICAgICAgICAgaWYgKCFkaXNjcmltaW5hdG9yVmFsdWVzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQSBkaXNjcmltaW5hdG9yIHZhbHVlIGZvciBrZXkgXFxgJHtkaXNjcmltaW5hdG9yfVxcYCBjb3VsZCBub3QgYmUgZXh0cmFjdGVkIGZyb20gYWxsIHNjaGVtYSBvcHRpb25zYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHZhbHVlIG9mIGRpc2NyaW1pbmF0b3JWYWx1ZXMpIHtcbiAgICAgICAgICAgICAgICBpZiAob3B0aW9uc01hcC5oYXModmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRGlzY3JpbWluYXRvciBwcm9wZXJ0eSAke1N0cmluZyhkaXNjcmltaW5hdG9yKX0gaGFzIGR1cGxpY2F0ZSB2YWx1ZSAke1N0cmluZyh2YWx1ZSl9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG9wdGlvbnNNYXAuc2V0KHZhbHVlLCB0eXBlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFpvZERpc2NyaW1pbmF0ZWRVbmlvbih7XG4gICAgICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZERpc2NyaW1pbmF0ZWRVbmlvbixcbiAgICAgICAgICAgIGRpc2NyaW1pbmF0b3IsXG4gICAgICAgICAgICBvcHRpb25zLFxuICAgICAgICAgICAgb3B0aW9uc01hcCxcbiAgICAgICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICAgICAgfSk7XG4gICAgfVxufVxuZnVuY3Rpb24gbWVyZ2VWYWx1ZXMoYSwgYikge1xuICAgIGNvbnN0IGFUeXBlID0gZ2V0UGFyc2VkVHlwZShhKTtcbiAgICBjb25zdCBiVHlwZSA9IGdldFBhcnNlZFR5cGUoYik7XG4gICAgaWYgKGEgPT09IGIpIHtcbiAgICAgICAgcmV0dXJuIHsgdmFsaWQ6IHRydWUsIGRhdGE6IGEgfTtcbiAgICB9XG4gICAgZWxzZSBpZiAoYVR5cGUgPT09IFpvZFBhcnNlZFR5cGUub2JqZWN0ICYmIGJUeXBlID09PSBab2RQYXJzZWRUeXBlLm9iamVjdCkge1xuICAgICAgICBjb25zdCBiS2V5cyA9IHV0aWwub2JqZWN0S2V5cyhiKTtcbiAgICAgICAgY29uc3Qgc2hhcmVkS2V5cyA9IHV0aWwub2JqZWN0S2V5cyhhKS5maWx0ZXIoKGtleSkgPT4gYktleXMuaW5kZXhPZihrZXkpICE9PSAtMSk7XG4gICAgICAgIGNvbnN0IG5ld09iaiA9IHsgLi4uYSwgLi4uYiB9O1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBzaGFyZWRLZXlzKSB7XG4gICAgICAgICAgICBjb25zdCBzaGFyZWRWYWx1ZSA9IG1lcmdlVmFsdWVzKGFba2V5XSwgYltrZXldKTtcbiAgICAgICAgICAgIGlmICghc2hhcmVkVmFsdWUudmFsaWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyB2YWxpZDogZmFsc2UgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG5ld09ialtrZXldID0gc2hhcmVkVmFsdWUuZGF0YTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4geyB2YWxpZDogdHJ1ZSwgZGF0YTogbmV3T2JqIH07XG4gICAgfVxuICAgIGVsc2UgaWYgKGFUeXBlID09PSBab2RQYXJzZWRUeXBlLmFycmF5ICYmIGJUeXBlID09PSBab2RQYXJzZWRUeXBlLmFycmF5KSB7XG4gICAgICAgIGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHZhbGlkOiBmYWxzZSB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG5ld0FycmF5ID0gW107XG4gICAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBhLmxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICAgICAgY29uc3QgaXRlbUEgPSBhW2luZGV4XTtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1CID0gYltpbmRleF07XG4gICAgICAgICAgICBjb25zdCBzaGFyZWRWYWx1ZSA9IG1lcmdlVmFsdWVzKGl0ZW1BLCBpdGVtQik7XG4gICAgICAgICAgICBpZiAoIXNoYXJlZFZhbHVlLnZhbGlkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgdmFsaWQ6IGZhbHNlIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBuZXdBcnJheS5wdXNoKHNoYXJlZFZhbHVlLmRhdGEpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHZhbGlkOiB0cnVlLCBkYXRhOiBuZXdBcnJheSB9O1xuICAgIH1cbiAgICBlbHNlIGlmIChhVHlwZSA9PT0gWm9kUGFyc2VkVHlwZS5kYXRlICYmIGJUeXBlID09PSBab2RQYXJzZWRUeXBlLmRhdGUgJiYgK2EgPT09ICtiKSB7XG4gICAgICAgIHJldHVybiB7IHZhbGlkOiB0cnVlLCBkYXRhOiBhIH07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4geyB2YWxpZDogZmFsc2UgfTtcbiAgICB9XG59XG5leHBvcnQgY2xhc3MgWm9kSW50ZXJzZWN0aW9uIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgc3RhdHVzLCBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGNvbnN0IGhhbmRsZVBhcnNlZCA9IChwYXJzZWRMZWZ0LCBwYXJzZWRSaWdodCkgPT4ge1xuICAgICAgICAgICAgaWYgKGlzQWJvcnRlZChwYXJzZWRMZWZ0KSB8fCBpc0Fib3J0ZWQocGFyc2VkUmlnaHQpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBtZXJnZWQgPSBtZXJnZVZhbHVlcyhwYXJzZWRMZWZ0LnZhbHVlLCBwYXJzZWRSaWdodC52YWx1ZSk7XG4gICAgICAgICAgICBpZiAoIW1lcmdlZC52YWxpZCkge1xuICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF9pbnRlcnNlY3Rpb25fdHlwZXMsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaXNEaXJ0eShwYXJzZWRMZWZ0KSB8fCBpc0RpcnR5KHBhcnNlZFJpZ2h0KSkge1xuICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBzdGF0dXMudmFsdWUsIHZhbHVlOiBtZXJnZWQuZGF0YSB9O1xuICAgICAgICB9O1xuICAgICAgICBpZiAoY3R4LmNvbW1vbi5hc3luYykge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgICAgICB0aGlzLl9kZWYubGVmdC5fcGFyc2VBc3luYyh7XG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgdGhpcy5fZGVmLnJpZ2h0Ll9wYXJzZUFzeW5jKHtcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIF0pLnRoZW4oKFtsZWZ0LCByaWdodF0pID0+IGhhbmRsZVBhcnNlZChsZWZ0LCByaWdodCkpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGhhbmRsZVBhcnNlZCh0aGlzLl9kZWYubGVmdC5fcGFyc2VTeW5jKHtcbiAgICAgICAgICAgICAgICBkYXRhOiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgICAgIH0pLCB0aGlzLl9kZWYucmlnaHQuX3BhcnNlU3luYyh7XG4gICAgICAgICAgICAgICAgZGF0YTogY3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5ab2RJbnRlcnNlY3Rpb24uY3JlYXRlID0gKGxlZnQsIHJpZ2h0LCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZEludGVyc2VjdGlvbih7XG4gICAgICAgIGxlZnQ6IGxlZnQsXG4gICAgICAgIHJpZ2h0OiByaWdodCxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RJbnRlcnNlY3Rpb24sXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG4vLyB0eXBlIFpvZFR1cGxlSXRlbXMgPSBbWm9kVHlwZUFueSwgLi4uWm9kVHlwZUFueVtdXTtcbmV4cG9ydCBjbGFzcyBab2RUdXBsZSBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IHN0YXR1cywgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBpZiAoY3R4LnBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUuYXJyYXkpIHtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUuYXJyYXksXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoY3R4LmRhdGEubGVuZ3RoIDwgdGhpcy5fZGVmLml0ZW1zLmxlbmd0aCkge1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLnRvb19zbWFsbCxcbiAgICAgICAgICAgICAgICBtaW5pbXVtOiB0aGlzLl9kZWYuaXRlbXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICBleGFjdDogZmFsc2UsXG4gICAgICAgICAgICAgICAgdHlwZTogXCJhcnJheVwiLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXN0ID0gdGhpcy5fZGVmLnJlc3Q7XG4gICAgICAgIGlmICghcmVzdCAmJiBjdHguZGF0YS5sZW5ndGggPiB0aGlzLl9kZWYuaXRlbXMubGVuZ3RoKSB7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX2JpZyxcbiAgICAgICAgICAgICAgICBtYXhpbXVtOiB0aGlzLl9kZWYuaXRlbXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGluY2x1c2l2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICBleGFjdDogZmFsc2UsXG4gICAgICAgICAgICAgICAgdHlwZTogXCJhcnJheVwiLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBpdGVtcyA9IFsuLi5jdHguZGF0YV1cbiAgICAgICAgICAgIC5tYXAoKGl0ZW0sIGl0ZW1JbmRleCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2NoZW1hID0gdGhpcy5fZGVmLml0ZW1zW2l0ZW1JbmRleF0gfHwgdGhpcy5fZGVmLnJlc3Q7XG4gICAgICAgICAgICBpZiAoIXNjaGVtYSlcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIHJldHVybiBzY2hlbWEuX3BhcnNlKG5ldyBQYXJzZUlucHV0TGF6eVBhdGgoY3R4LCBpdGVtLCBjdHgucGF0aCwgaXRlbUluZGV4KSk7XG4gICAgICAgIH0pXG4gICAgICAgICAgICAuZmlsdGVyKCh4KSA9PiAhIXgpOyAvLyBmaWx0ZXIgbnVsbHNcbiAgICAgICAgaWYgKGN0eC5jb21tb24uYXN5bmMpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChpdGVtcykudGhlbigocmVzdWx0cykgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBQYXJzZVN0YXR1cy5tZXJnZUFycmF5KHN0YXR1cywgcmVzdWx0cyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBQYXJzZVN0YXR1cy5tZXJnZUFycmF5KHN0YXR1cywgaXRlbXMpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGdldCBpdGVtcygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5pdGVtcztcbiAgICB9XG4gICAgcmVzdChyZXN0KSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kVHVwbGUoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgcmVzdCxcbiAgICAgICAgfSk7XG4gICAgfVxufVxuWm9kVHVwbGUuY3JlYXRlID0gKHNjaGVtYXMsIHBhcmFtcykgPT4ge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShzY2hlbWFzKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJZb3UgbXVzdCBwYXNzIGFuIGFycmF5IG9mIHNjaGVtYXMgdG8gei50dXBsZShbIC4uLiBdKVwiKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBab2RUdXBsZSh7XG4gICAgICAgIGl0ZW1zOiBzY2hlbWFzLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZFR1cGxlLFxuICAgICAgICByZXN0OiBudWxsLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZFJlY29yZCBleHRlbmRzIFpvZFR5cGUge1xuICAgIGdldCBrZXlTY2hlbWEoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYua2V5VHlwZTtcbiAgICB9XG4gICAgZ2V0IHZhbHVlU2NoZW1hKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnZhbHVlVHlwZTtcbiAgICB9XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgc3RhdHVzLCBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGlmIChjdHgucGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5vYmplY3QpIHtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUub2JqZWN0LFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGFpcnMgPSBbXTtcbiAgICAgICAgY29uc3Qga2V5VHlwZSA9IHRoaXMuX2RlZi5rZXlUeXBlO1xuICAgICAgICBjb25zdCB2YWx1ZVR5cGUgPSB0aGlzLl9kZWYudmFsdWVUeXBlO1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBjdHguZGF0YSkge1xuICAgICAgICAgICAgcGFpcnMucHVzaCh7XG4gICAgICAgICAgICAgICAga2V5OiBrZXlUeXBlLl9wYXJzZShuZXcgUGFyc2VJbnB1dExhenlQYXRoKGN0eCwga2V5LCBjdHgucGF0aCwga2V5KSksXG4gICAgICAgICAgICAgICAgdmFsdWU6IHZhbHVlVHlwZS5fcGFyc2UobmV3IFBhcnNlSW5wdXRMYXp5UGF0aChjdHgsIGN0eC5kYXRhW2tleV0sIGN0eC5wYXRoLCBrZXkpKSxcbiAgICAgICAgICAgICAgICBhbHdheXNTZXQ6IGtleSBpbiBjdHguZGF0YSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjdHguY29tbW9uLmFzeW5jKSB7XG4gICAgICAgICAgICByZXR1cm4gUGFyc2VTdGF0dXMubWVyZ2VPYmplY3RBc3luYyhzdGF0dXMsIHBhaXJzKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBQYXJzZVN0YXR1cy5tZXJnZU9iamVjdFN5bmMoc3RhdHVzLCBwYWlycyk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0IGVsZW1lbnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYudmFsdWVUeXBlO1xuICAgIH1cbiAgICBzdGF0aWMgY3JlYXRlKGZpcnN0LCBzZWNvbmQsIHRoaXJkKSB7XG4gICAgICAgIGlmIChzZWNvbmQgaW5zdGFuY2VvZiBab2RUeXBlKSB7XG4gICAgICAgICAgICByZXR1cm4gbmV3IFpvZFJlY29yZCh7XG4gICAgICAgICAgICAgICAga2V5VHlwZTogZmlyc3QsXG4gICAgICAgICAgICAgICAgdmFsdWVUeXBlOiBzZWNvbmQsXG4gICAgICAgICAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RSZWNvcmQsXG4gICAgICAgICAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyh0aGlyZCksXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFpvZFJlY29yZCh7XG4gICAgICAgICAgICBrZXlUeXBlOiBab2RTdHJpbmcuY3JlYXRlKCksXG4gICAgICAgICAgICB2YWx1ZVR5cGU6IGZpcnN0LFxuICAgICAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RSZWNvcmQsXG4gICAgICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHNlY29uZCksXG4gICAgICAgIH0pO1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBab2RNYXAgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBnZXQga2V5U2NoZW1hKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLmtleVR5cGU7XG4gICAgfVxuICAgIGdldCB2YWx1ZVNjaGVtYSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi52YWx1ZVR5cGU7XG4gICAgfVxuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IHN0YXR1cywgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBpZiAoY3R4LnBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUubWFwKSB7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLm1hcCxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGtleVR5cGUgPSB0aGlzLl9kZWYua2V5VHlwZTtcbiAgICAgICAgY29uc3QgdmFsdWVUeXBlID0gdGhpcy5fZGVmLnZhbHVlVHlwZTtcbiAgICAgICAgY29uc3QgcGFpcnMgPSBbLi4uY3R4LmRhdGEuZW50cmllcygpXS5tYXAoKFtrZXksIHZhbHVlXSwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAga2V5OiBrZXlUeXBlLl9wYXJzZShuZXcgUGFyc2VJbnB1dExhenlQYXRoKGN0eCwga2V5LCBjdHgucGF0aCwgW2luZGV4LCBcImtleVwiXSkpLFxuICAgICAgICAgICAgICAgIHZhbHVlOiB2YWx1ZVR5cGUuX3BhcnNlKG5ldyBQYXJzZUlucHV0TGF6eVBhdGgoY3R4LCB2YWx1ZSwgY3R4LnBhdGgsIFtpbmRleCwgXCJ2YWx1ZVwiXSkpLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChjdHguY29tbW9uLmFzeW5jKSB7XG4gICAgICAgICAgICBjb25zdCBmaW5hbE1hcCA9IG5ldyBNYXAoKTtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKS50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHBhaXIgb2YgcGFpcnMpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gYXdhaXQgcGFpci5rZXk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gYXdhaXQgcGFpci52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGtleS5zdGF0dXMgPT09IFwiYWJvcnRlZFwiIHx8IHZhbHVlLnN0YXR1cyA9PT0gXCJhYm9ydGVkXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChrZXkuc3RhdHVzID09PSBcImRpcnR5XCIgfHwgdmFsdWUuc3RhdHVzID09PSBcImRpcnR5XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGZpbmFsTWFwLnNldChrZXkudmFsdWUsIHZhbHVlLnZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBzdGF0dXMudmFsdWUsIHZhbHVlOiBmaW5hbE1hcCB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBmaW5hbE1hcCA9IG5ldyBNYXAoKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgcGFpciBvZiBwYWlycykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGtleSA9IHBhaXIua2V5O1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gcGFpci52YWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAoa2V5LnN0YXR1cyA9PT0gXCJhYm9ydGVkXCIgfHwgdmFsdWUuc3RhdHVzID09PSBcImFib3J0ZWRcIikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGtleS5zdGF0dXMgPT09IFwiZGlydHlcIiB8fCB2YWx1ZS5zdGF0dXMgPT09IFwiZGlydHlcIikge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZmluYWxNYXAuc2V0KGtleS52YWx1ZSwgdmFsdWUudmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBzdGF0dXMudmFsdWUsIHZhbHVlOiBmaW5hbE1hcCB9O1xuICAgICAgICB9XG4gICAgfVxufVxuWm9kTWFwLmNyZWF0ZSA9IChrZXlUeXBlLCB2YWx1ZVR5cGUsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kTWFwKHtcbiAgICAgICAgdmFsdWVUeXBlLFxuICAgICAgICBrZXlUeXBlLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZE1hcCxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RTZXQgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBzdGF0dXMsIGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgaWYgKGN0eC5wYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLnNldCkge1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfdHlwZSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZDogWm9kUGFyc2VkVHlwZS5zZXQsXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBkZWYgPSB0aGlzLl9kZWY7XG4gICAgICAgIGlmIChkZWYubWluU2l6ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgaWYgKGN0eC5kYXRhLnNpemUgPCBkZWYubWluU2l6ZS52YWx1ZSkge1xuICAgICAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUudG9vX3NtYWxsLFxuICAgICAgICAgICAgICAgICAgICBtaW5pbXVtOiBkZWYubWluU2l6ZS52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJzZXRcIixcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBleGFjdDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGRlZi5taW5TaXplLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRlZi5tYXhTaXplICE9PSBudWxsKSB7XG4gICAgICAgICAgICBpZiAoY3R4LmRhdGEuc2l6ZSA+IGRlZi5tYXhTaXplLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS50b29fYmlnLFxuICAgICAgICAgICAgICAgICAgICBtYXhpbXVtOiBkZWYubWF4U2l6ZS52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJzZXRcIixcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVzaXZlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBleGFjdDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGRlZi5tYXhTaXplLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdmFsdWVUeXBlID0gdGhpcy5fZGVmLnZhbHVlVHlwZTtcbiAgICAgICAgZnVuY3Rpb24gZmluYWxpemVTZXQoZWxlbWVudHMpIHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlZFNldCA9IG5ldyBTZXQoKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgZWxlbWVudCBvZiBlbGVtZW50cykge1xuICAgICAgICAgICAgICAgIGlmIChlbGVtZW50LnN0YXR1cyA9PT0gXCJhYm9ydGVkXCIpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgICAgIGlmIChlbGVtZW50LnN0YXR1cyA9PT0gXCJkaXJ0eVwiKVxuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuZGlydHkoKTtcbiAgICAgICAgICAgICAgICBwYXJzZWRTZXQuYWRkKGVsZW1lbnQudmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBzdGF0dXMudmFsdWUsIHZhbHVlOiBwYXJzZWRTZXQgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBlbGVtZW50cyA9IFsuLi5jdHguZGF0YS52YWx1ZXMoKV0ubWFwKChpdGVtLCBpKSA9PiB2YWx1ZVR5cGUuX3BhcnNlKG5ldyBQYXJzZUlucHV0TGF6eVBhdGgoY3R4LCBpdGVtLCBjdHgucGF0aCwgaSkpKTtcbiAgICAgICAgaWYgKGN0eC5jb21tb24uYXN5bmMpIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChlbGVtZW50cykudGhlbigoZWxlbWVudHMpID0+IGZpbmFsaXplU2V0KGVsZW1lbnRzKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gZmluYWxpemVTZXQoZWxlbWVudHMpO1xuICAgICAgICB9XG4gICAgfVxuICAgIG1pbihtaW5TaXplLCBtZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiBuZXcgWm9kU2V0KHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIG1pblNpemU6IHsgdmFsdWU6IG1pblNpemUsIG1lc3NhZ2U6IGVycm9yVXRpbC50b1N0cmluZyhtZXNzYWdlKSB9LFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgbWF4KG1heFNpemUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RTZXQoe1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgbWF4U2l6ZTogeyB2YWx1ZTogbWF4U2l6ZSwgbWVzc2FnZTogZXJyb3JVdGlsLnRvU3RyaW5nKG1lc3NhZ2UpIH0sXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBzaXplKHNpemUsIG1lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubWluKHNpemUsIG1lc3NhZ2UpLm1heChzaXplLCBtZXNzYWdlKTtcbiAgICB9XG4gICAgbm9uZW1wdHkobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5taW4oMSwgbWVzc2FnZSk7XG4gICAgfVxufVxuWm9kU2V0LmNyZWF0ZSA9ICh2YWx1ZVR5cGUsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kU2V0KHtcbiAgICAgICAgdmFsdWVUeXBlLFxuICAgICAgICBtaW5TaXplOiBudWxsLFxuICAgICAgICBtYXhTaXplOiBudWxsLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZFNldCxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RGdW5jdGlvbiBleHRlbmRzIFpvZFR5cGUge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzdXBlciguLi5hcmd1bWVudHMpO1xuICAgICAgICB0aGlzLnZhbGlkYXRlID0gdGhpcy5pbXBsZW1lbnQ7XG4gICAgfVxuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgaWYgKGN0eC5wYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLmZ1bmN0aW9uKSB7XG4gICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIHtcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBab2RQYXJzZWRUeXBlLmZ1bmN0aW9uLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gbWFrZUFyZ3NJc3N1ZShhcmdzLCBlcnJvcikge1xuICAgICAgICAgICAgcmV0dXJuIG1ha2VJc3N1ZSh7XG4gICAgICAgICAgICAgICAgZGF0YTogYXJncyxcbiAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICBlcnJvck1hcHM6IFtjdHguY29tbW9uLmNvbnRleHR1YWxFcnJvck1hcCwgY3R4LnNjaGVtYUVycm9yTWFwLCBnZXRFcnJvck1hcCgpLCBkZWZhdWx0RXJyb3JNYXBdLmZpbHRlcigoeCkgPT4gISF4KSxcbiAgICAgICAgICAgICAgICBpc3N1ZURhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogWm9kSXNzdWVDb2RlLmludmFsaWRfYXJndW1lbnRzLFxuICAgICAgICAgICAgICAgICAgICBhcmd1bWVudHNFcnJvcjogZXJyb3IsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIG1ha2VSZXR1cm5zSXNzdWUocmV0dXJucywgZXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBtYWtlSXNzdWUoe1xuICAgICAgICAgICAgICAgIGRhdGE6IHJldHVybnMsXG4gICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgZXJyb3JNYXBzOiBbY3R4LmNvbW1vbi5jb250ZXh0dWFsRXJyb3JNYXAsIGN0eC5zY2hlbWFFcnJvck1hcCwgZ2V0RXJyb3JNYXAoKSwgZGVmYXVsdEVycm9yTWFwXS5maWx0ZXIoKHgpID0+ICEheCksXG4gICAgICAgICAgICAgICAgaXNzdWVEYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3JldHVybl90eXBlLFxuICAgICAgICAgICAgICAgICAgICByZXR1cm5UeXBlRXJyb3I6IGVycm9yLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwYXJhbXMgPSB7IGVycm9yTWFwOiBjdHguY29tbW9uLmNvbnRleHR1YWxFcnJvck1hcCB9O1xuICAgICAgICBjb25zdCBmbiA9IGN0eC5kYXRhO1xuICAgICAgICBpZiAodGhpcy5fZGVmLnJldHVybnMgaW5zdGFuY2VvZiBab2RQcm9taXNlKSB7XG4gICAgICAgICAgICAvLyBXb3VsZCBsb3ZlIGEgd2F5IHRvIGF2b2lkIGRpc2FibGluZyB0aGlzIHJ1bGUsIGJ1dCB3ZSBuZWVkXG4gICAgICAgICAgICAvLyBhbiBhbGlhcyAodXNpbmcgYW4gYXJyb3cgZnVuY3Rpb24gd2FzIHdoYXQgY2F1c2VkIDI2NTEpLlxuICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby10aGlzLWFsaWFzXG4gICAgICAgICAgICBjb25zdCBtZSA9IHRoaXM7XG4gICAgICAgICAgICByZXR1cm4gT0soYXN5bmMgZnVuY3Rpb24gKC4uLmFyZ3MpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlcnJvciA9IG5ldyBab2RFcnJvcihbXSk7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkQXJncyA9IGF3YWl0IG1lLl9kZWYuYXJncy5wYXJzZUFzeW5jKGFyZ3MsIHBhcmFtcykuY2F0Y2goKGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IuYWRkSXNzdWUobWFrZUFyZ3NJc3N1ZShhcmdzLCBlKSk7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IFJlZmxlY3QuYXBwbHkoZm4sIHRoaXMsIHBhcnNlZEFyZ3MpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlZFJldHVybnMgPSBhd2FpdCBtZS5fZGVmLnJldHVybnMuX2RlZi50eXBlXG4gICAgICAgICAgICAgICAgICAgIC5wYXJzZUFzeW5jKHJlc3VsdCwgcGFyYW1zKVxuICAgICAgICAgICAgICAgICAgICAuY2F0Y2goKGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IuYWRkSXNzdWUobWFrZVJldHVybnNJc3N1ZShyZXN1bHQsIGUpKTtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlZFJldHVybnM7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIC8vIFdvdWxkIGxvdmUgYSB3YXkgdG8gYXZvaWQgZGlzYWJsaW5nIHRoaXMgcnVsZSwgYnV0IHdlIG5lZWRcbiAgICAgICAgICAgIC8vIGFuIGFsaWFzICh1c2luZyBhbiBhcnJvdyBmdW5jdGlvbiB3YXMgd2hhdCBjYXVzZWQgMjY1MSkuXG4gICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXRoaXMtYWxpYXNcbiAgICAgICAgICAgIGNvbnN0IG1lID0gdGhpcztcbiAgICAgICAgICAgIHJldHVybiBPSyhmdW5jdGlvbiAoLi4uYXJncykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlZEFyZ3MgPSBtZS5fZGVmLmFyZ3Muc2FmZVBhcnNlKGFyZ3MsIHBhcmFtcyk7XG4gICAgICAgICAgICAgICAgaWYgKCFwYXJzZWRBcmdzLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFpvZEVycm9yKFttYWtlQXJnc0lzc3VlKGFyZ3MsIHBhcnNlZEFyZ3MuZXJyb3IpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IFJlZmxlY3QuYXBwbHkoZm4sIHRoaXMsIHBhcnNlZEFyZ3MuZGF0YSk7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkUmV0dXJucyA9IG1lLl9kZWYucmV0dXJucy5zYWZlUGFyc2UocmVzdWx0LCBwYXJhbXMpO1xuICAgICAgICAgICAgICAgIGlmICghcGFyc2VkUmV0dXJucy5zdWNjZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBab2RFcnJvcihbbWFrZVJldHVybnNJc3N1ZShyZXN1bHQsIHBhcnNlZFJldHVybnMuZXJyb3IpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBwYXJzZWRSZXR1cm5zLmRhdGE7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBwYXJhbWV0ZXJzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLmFyZ3M7XG4gICAgfVxuICAgIHJldHVyblR5cGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYucmV0dXJucztcbiAgICB9XG4gICAgYXJncyguLi5pdGVtcykge1xuICAgICAgICByZXR1cm4gbmV3IFpvZEZ1bmN0aW9uKHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIGFyZ3M6IFpvZFR1cGxlLmNyZWF0ZShpdGVtcykucmVzdChab2RVbmtub3duLmNyZWF0ZSgpKSxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybnMocmV0dXJuVHlwZSkge1xuICAgICAgICByZXR1cm4gbmV3IFpvZEZ1bmN0aW9uKHtcbiAgICAgICAgICAgIC4uLnRoaXMuX2RlZixcbiAgICAgICAgICAgIHJldHVybnM6IHJldHVyblR5cGUsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBpbXBsZW1lbnQoZnVuYykge1xuICAgICAgICBjb25zdCB2YWxpZGF0ZWRGdW5jID0gdGhpcy5wYXJzZShmdW5jKTtcbiAgICAgICAgcmV0dXJuIHZhbGlkYXRlZEZ1bmM7XG4gICAgfVxuICAgIHN0cmljdEltcGxlbWVudChmdW5jKSB7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRlZEZ1bmMgPSB0aGlzLnBhcnNlKGZ1bmMpO1xuICAgICAgICByZXR1cm4gdmFsaWRhdGVkRnVuYztcbiAgICB9XG4gICAgc3RhdGljIGNyZWF0ZShhcmdzLCByZXR1cm5zLCBwYXJhbXMpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBab2RGdW5jdGlvbih7XG4gICAgICAgICAgICBhcmdzOiAoYXJncyA/IGFyZ3MgOiBab2RUdXBsZS5jcmVhdGUoW10pLnJlc3QoWm9kVW5rbm93bi5jcmVhdGUoKSkpLFxuICAgICAgICAgICAgcmV0dXJuczogcmV0dXJucyB8fCBab2RVbmtub3duLmNyZWF0ZSgpLFxuICAgICAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RGdW5jdGlvbixcbiAgICAgICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICAgICAgfSk7XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFpvZExhenkgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBnZXQgc2NoZW1hKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLmdldHRlcigpO1xuICAgIH1cbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGNvbnN0IGxhenlTY2hlbWEgPSB0aGlzLl9kZWYuZ2V0dGVyKCk7XG4gICAgICAgIHJldHVybiBsYXp5U2NoZW1hLl9wYXJzZSh7IGRhdGE6IGN0eC5kYXRhLCBwYXRoOiBjdHgucGF0aCwgcGFyZW50OiBjdHggfSk7XG4gICAgfVxufVxuWm9kTGF6eS5jcmVhdGUgPSAoZ2V0dGVyLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZExhenkoe1xuICAgICAgICBnZXR0ZXI6IGdldHRlcixcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RMYXp5LFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZExpdGVyYWwgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgaWYgKGlucHV0LmRhdGEgIT09IHRoaXMuX2RlZi52YWx1ZSkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX2xpdGVyYWwsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IHRoaXMuX2RlZi52YWx1ZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBcInZhbGlkXCIsIHZhbHVlOiBpbnB1dC5kYXRhIH07XG4gICAgfVxuICAgIGdldCB2YWx1ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi52YWx1ZTtcbiAgICB9XG59XG5ab2RMaXRlcmFsLmNyZWF0ZSA9ICh2YWx1ZSwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RMaXRlcmFsKHtcbiAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZExpdGVyYWwsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5mdW5jdGlvbiBjcmVhdGVab2RFbnVtKHZhbHVlcywgcGFyYW1zKSB7XG4gICAgcmV0dXJuIG5ldyBab2RFbnVtKHtcbiAgICAgICAgdmFsdWVzLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZEVudW0sXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn1cbmV4cG9ydCBjbGFzcyBab2RFbnVtIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGlmICh0eXBlb2YgaW5wdXQuZGF0YSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICAgICAgY29uc3QgZXhwZWN0ZWRWYWx1ZXMgPSB0aGlzLl9kZWYudmFsdWVzO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IHV0aWwuam9pblZhbHVlcyhleHBlY3RlZFZhbHVlcyksXG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5wYXJzZWRUeXBlLFxuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGhpcy5fY2FjaGUpIHtcbiAgICAgICAgICAgIHRoaXMuX2NhY2hlID0gbmV3IFNldCh0aGlzLl9kZWYudmFsdWVzKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXRoaXMuX2NhY2hlLmhhcyhpbnB1dC5kYXRhKSkge1xuICAgICAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICAgICAgY29uc3QgZXhwZWN0ZWRWYWx1ZXMgPSB0aGlzLl9kZWYudmFsdWVzO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX2VudW1fdmFsdWUsXG4gICAgICAgICAgICAgICAgb3B0aW9uczogZXhwZWN0ZWRWYWx1ZXMsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBPSyhpbnB1dC5kYXRhKTtcbiAgICB9XG4gICAgZ2V0IG9wdGlvbnMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYudmFsdWVzO1xuICAgIH1cbiAgICBnZXQgZW51bSgpIHtcbiAgICAgICAgY29uc3QgZW51bVZhbHVlcyA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IHZhbCBvZiB0aGlzLl9kZWYudmFsdWVzKSB7XG4gICAgICAgICAgICBlbnVtVmFsdWVzW3ZhbF0gPSB2YWw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGVudW1WYWx1ZXM7XG4gICAgfVxuICAgIGdldCBWYWx1ZXMoKSB7XG4gICAgICAgIGNvbnN0IGVudW1WYWx1ZXMgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCB2YWwgb2YgdGhpcy5fZGVmLnZhbHVlcykge1xuICAgICAgICAgICAgZW51bVZhbHVlc1t2YWxdID0gdmFsO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBlbnVtVmFsdWVzO1xuICAgIH1cbiAgICBnZXQgRW51bSgpIHtcbiAgICAgICAgY29uc3QgZW51bVZhbHVlcyA9IHt9O1xuICAgICAgICBmb3IgKGNvbnN0IHZhbCBvZiB0aGlzLl9kZWYudmFsdWVzKSB7XG4gICAgICAgICAgICBlbnVtVmFsdWVzW3ZhbF0gPSB2YWw7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGVudW1WYWx1ZXM7XG4gICAgfVxuICAgIGV4dHJhY3QodmFsdWVzLCBuZXdEZWYgPSB0aGlzLl9kZWYpIHtcbiAgICAgICAgcmV0dXJuIFpvZEVudW0uY3JlYXRlKHZhbHVlcywge1xuICAgICAgICAgICAgLi4udGhpcy5fZGVmLFxuICAgICAgICAgICAgLi4ubmV3RGVmLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgZXhjbHVkZSh2YWx1ZXMsIG5ld0RlZiA9IHRoaXMuX2RlZikge1xuICAgICAgICByZXR1cm4gWm9kRW51bS5jcmVhdGUodGhpcy5vcHRpb25zLmZpbHRlcigob3B0KSA9PiAhdmFsdWVzLmluY2x1ZGVzKG9wdCkpLCB7XG4gICAgICAgICAgICAuLi50aGlzLl9kZWYsXG4gICAgICAgICAgICAuLi5uZXdEZWYsXG4gICAgICAgIH0pO1xuICAgIH1cbn1cblpvZEVudW0uY3JlYXRlID0gY3JlYXRlWm9kRW51bTtcbmV4cG9ydCBjbGFzcyBab2ROYXRpdmVFbnVtIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IG5hdGl2ZUVudW1WYWx1ZXMgPSB1dGlsLmdldFZhbGlkRW51bVZhbHVlcyh0aGlzLl9kZWYudmFsdWVzKTtcbiAgICAgICAgY29uc3QgY3R4ID0gdGhpcy5fZ2V0T3JSZXR1cm5DdHgoaW5wdXQpO1xuICAgICAgICBpZiAoY3R4LnBhcnNlZFR5cGUgIT09IFpvZFBhcnNlZFR5cGUuc3RyaW5nICYmIGN0eC5wYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLm51bWJlcikge1xuICAgICAgICAgICAgY29uc3QgZXhwZWN0ZWRWYWx1ZXMgPSB1dGlsLm9iamVjdFZhbHVlcyhuYXRpdmVFbnVtVmFsdWVzKTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGV4cGVjdGVkOiB1dGlsLmpvaW5WYWx1ZXMoZXhwZWN0ZWRWYWx1ZXMpLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgICAgICBjb2RlOiBab2RJc3N1ZUNvZGUuaW52YWxpZF90eXBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXRoaXMuX2NhY2hlKSB7XG4gICAgICAgICAgICB0aGlzLl9jYWNoZSA9IG5ldyBTZXQodXRpbC5nZXRWYWxpZEVudW1WYWx1ZXModGhpcy5fZGVmLnZhbHVlcykpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGhpcy5fY2FjaGUuaGFzKGlucHV0LmRhdGEpKSB7XG4gICAgICAgICAgICBjb25zdCBleHBlY3RlZFZhbHVlcyA9IHV0aWwub2JqZWN0VmFsdWVzKG5hdGl2ZUVudW1WYWx1ZXMpO1xuICAgICAgICAgICAgYWRkSXNzdWVUb0NvbnRleHQoY3R4LCB7XG4gICAgICAgICAgICAgICAgcmVjZWl2ZWQ6IGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX2VudW1fdmFsdWUsXG4gICAgICAgICAgICAgICAgb3B0aW9uczogZXhwZWN0ZWRWYWx1ZXMsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBPSyhpbnB1dC5kYXRhKTtcbiAgICB9XG4gICAgZ2V0IGVudW0oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYudmFsdWVzO1xuICAgIH1cbn1cblpvZE5hdGl2ZUVudW0uY3JlYXRlID0gKHZhbHVlcywgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2ROYXRpdmVFbnVtKHtcbiAgICAgICAgdmFsdWVzOiB2YWx1ZXMsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kTmF0aXZlRW51bSxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2RQcm9taXNlIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgdW53cmFwKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLnR5cGU7XG4gICAgfVxuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IGN0eCB9ID0gdGhpcy5fcHJvY2Vzc0lucHV0UGFyYW1zKGlucHV0KTtcbiAgICAgICAgaWYgKGN0eC5wYXJzZWRUeXBlICE9PSBab2RQYXJzZWRUeXBlLnByb21pc2UgJiYgY3R4LmNvbW1vbi5hc3luYyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUucHJvbWlzZSxcbiAgICAgICAgICAgICAgICByZWNlaXZlZDogY3R4LnBhcnNlZFR5cGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHByb21pc2lmaWVkID0gY3R4LnBhcnNlZFR5cGUgPT09IFpvZFBhcnNlZFR5cGUucHJvbWlzZSA/IGN0eC5kYXRhIDogUHJvbWlzZS5yZXNvbHZlKGN0eC5kYXRhKTtcbiAgICAgICAgcmV0dXJuIE9LKHByb21pc2lmaWVkLnRoZW4oKGRhdGEpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9kZWYudHlwZS5wYXJzZUFzeW5jKGRhdGEsIHtcbiAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICBlcnJvck1hcDogY3R4LmNvbW1vbi5jb250ZXh0dWFsRXJyb3JNYXAsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSkpO1xuICAgIH1cbn1cblpvZFByb21pc2UuY3JlYXRlID0gKHNjaGVtYSwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RQcm9taXNlKHtcbiAgICAgICAgdHlwZTogc2NoZW1hLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZFByb21pc2UsXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG5leHBvcnQgY2xhc3MgWm9kRWZmZWN0cyBleHRlbmRzIFpvZFR5cGUge1xuICAgIGlubmVyVHlwZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5zY2hlbWE7XG4gICAgfVxuICAgIHNvdXJjZVR5cGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuc2NoZW1hLl9kZWYudHlwZU5hbWUgPT09IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RFZmZlY3RzXG4gICAgICAgICAgICA/IHRoaXMuX2RlZi5zY2hlbWEuc291cmNlVHlwZSgpXG4gICAgICAgICAgICA6IHRoaXMuX2RlZi5zY2hlbWE7XG4gICAgfVxuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IHN0YXR1cywgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBjb25zdCBlZmZlY3QgPSB0aGlzLl9kZWYuZWZmZWN0IHx8IG51bGw7XG4gICAgICAgIGNvbnN0IGNoZWNrQ3R4ID0ge1xuICAgICAgICAgICAgYWRkSXNzdWU6IChhcmcpID0+IHtcbiAgICAgICAgICAgICAgICBhZGRJc3N1ZVRvQ29udGV4dChjdHgsIGFyZyk7XG4gICAgICAgICAgICAgICAgaWYgKGFyZy5mYXRhbCkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0dXMuYWJvcnQoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBnZXQgcGF0aCgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY3R4LnBhdGg7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgICBjaGVja0N0eC5hZGRJc3N1ZSA9IGNoZWNrQ3R4LmFkZElzc3VlLmJpbmQoY2hlY2tDdHgpO1xuICAgICAgICBpZiAoZWZmZWN0LnR5cGUgPT09IFwicHJlcHJvY2Vzc1wiKSB7XG4gICAgICAgICAgICBjb25zdCBwcm9jZXNzZWQgPSBlZmZlY3QudHJhbnNmb3JtKGN0eC5kYXRhLCBjaGVja0N0eCk7XG4gICAgICAgICAgICBpZiAoY3R4LmNvbW1vbi5hc3luYykge1xuICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocHJvY2Vzc2VkKS50aGVuKGFzeW5jIChwcm9jZXNzZWQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXR1cy52YWx1ZSA9PT0gXCJhYm9ydGVkXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZGVmLnNjaGVtYS5fcGFyc2VBc3luYyh7XG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBwcm9jZXNzZWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5zdGF0dXMgPT09IFwiYWJvcnRlZFwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSBcImRpcnR5XCIpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gRElSVFkocmVzdWx0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXR1cy52YWx1ZSA9PT0gXCJkaXJ0eVwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIERJUlRZKHJlc3VsdC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdHVzLnZhbHVlID09PSBcImFib3J0ZWRcIilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5fZGVmLnNjaGVtYS5fcGFyc2VTeW5jKHtcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogcHJvY2Vzc2VkLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5zdGF0dXMgPT09IFwiYWJvcnRlZFwiKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnN0YXR1cyA9PT0gXCJkaXJ0eVwiKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gRElSVFkocmVzdWx0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdHVzLnZhbHVlID09PSBcImRpcnR5XCIpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBESVJUWShyZXN1bHQudmFsdWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGVmZmVjdC50eXBlID09PSBcInJlZmluZW1lbnRcIikge1xuICAgICAgICAgICAgY29uc3QgZXhlY3V0ZVJlZmluZW1lbnQgPSAoYWNjKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZWZmZWN0LnJlZmluZW1lbnQoYWNjLCBjaGVja0N0eCk7XG4gICAgICAgICAgICAgICAgaWYgKGN0eC5jb21tb24uYXN5bmMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0IGluc3RhbmNlb2YgUHJvbWlzZSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBc3luYyByZWZpbmVtZW50IGVuY291bnRlcmVkIGR1cmluZyBzeW5jaHJvbm91cyBwYXJzZSBvcGVyYXRpb24uIFVzZSAucGFyc2VBc3luYyBpbnN0ZWFkLlwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBpZiAoY3R4LmNvbW1vbi5hc3luYyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBpbm5lciA9IHRoaXMuX2RlZi5zY2hlbWEuX3BhcnNlU3luYyh7XG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKGlubmVyLnN0YXR1cyA9PT0gXCJhYm9ydGVkXCIpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBJTlZBTElEO1xuICAgICAgICAgICAgICAgIGlmIChpbm5lci5zdGF0dXMgPT09IFwiZGlydHlcIilcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgLy8gcmV0dXJuIHZhbHVlIGlzIGlnbm9yZWRcbiAgICAgICAgICAgICAgICBleGVjdXRlUmVmaW5lbWVudChpbm5lci52YWx1ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBzdGF0dXMudmFsdWUsIHZhbHVlOiBpbm5lci52YWx1ZSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5zY2hlbWEuX3BhcnNlQXN5bmMoeyBkYXRhOiBjdHguZGF0YSwgcGF0aDogY3R4LnBhdGgsIHBhcmVudDogY3R4IH0pLnRoZW4oKGlubmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpbm5lci5zdGF0dXMgPT09IFwiYWJvcnRlZFwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpbm5lci5zdGF0dXMgPT09IFwiZGlydHlcIilcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXhlY3V0ZVJlZmluZW1lbnQoaW5uZXIudmFsdWUpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBzdGF0dXMudmFsdWUsIHZhbHVlOiBpbm5lci52YWx1ZSB9O1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoZWZmZWN0LnR5cGUgPT09IFwidHJhbnNmb3JtXCIpIHtcbiAgICAgICAgICAgIGlmIChjdHguY29tbW9uLmFzeW5jID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGJhc2UgPSB0aGlzLl9kZWYuc2NoZW1hLl9wYXJzZVN5bmMoe1xuICAgICAgICAgICAgICAgICAgICBkYXRhOiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmICghaXNWYWxpZChiYXNlKSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZWZmZWN0LnRyYW5zZm9ybShiYXNlLnZhbHVlLCBjaGVja0N0eCk7XG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdCBpbnN0YW5jZW9mIFByb21pc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBc3luY2hyb25vdXMgdHJhbnNmb3JtIGVuY291bnRlcmVkIGR1cmluZyBzeW5jaHJvbm91cyBwYXJzZSBvcGVyYXRpb24uIFVzZSAucGFyc2VBc3luYyBpbnN0ZWFkLmApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdGF0dXM6IHN0YXR1cy52YWx1ZSwgdmFsdWU6IHJlc3VsdCB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5zY2hlbWEuX3BhcnNlQXN5bmMoeyBkYXRhOiBjdHguZGF0YSwgcGF0aDogY3R4LnBhdGgsIHBhcmVudDogY3R4IH0pLnRoZW4oKGJhc2UpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpc1ZhbGlkKGJhc2UpKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoZWZmZWN0LnRyYW5zZm9ybShiYXNlLnZhbHVlLCBjaGVja0N0eCkpLnRoZW4oKHJlc3VsdCkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXR1czogc3RhdHVzLnZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHV0aWwuYXNzZXJ0TmV2ZXIoZWZmZWN0KTtcbiAgICB9XG59XG5ab2RFZmZlY3RzLmNyZWF0ZSA9IChzY2hlbWEsIGVmZmVjdCwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RFZmZlY3RzKHtcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZEVmZmVjdHMsXG4gICAgICAgIGVmZmVjdCxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcblpvZEVmZmVjdHMuY3JlYXRlV2l0aFByZXByb2Nlc3MgPSAocHJlcHJvY2Vzcywgc2NoZW1hLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZEVmZmVjdHMoe1xuICAgICAgICBzY2hlbWEsXG4gICAgICAgIGVmZmVjdDogeyB0eXBlOiBcInByZXByb2Nlc3NcIiwgdHJhbnNmb3JtOiBwcmVwcm9jZXNzIH0sXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kRWZmZWN0cyxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCB7IFpvZEVmZmVjdHMgYXMgWm9kVHJhbnNmb3JtZXIgfTtcbmV4cG9ydCBjbGFzcyBab2RPcHRpb25hbCBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCBwYXJzZWRUeXBlID0gdGhpcy5fZ2V0VHlwZShpbnB1dCk7XG4gICAgICAgIGlmIChwYXJzZWRUeXBlID09PSBab2RQYXJzZWRUeXBlLnVuZGVmaW5lZCkge1xuICAgICAgICAgICAgcmV0dXJuIE9LKHVuZGVmaW5lZCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5pbm5lclR5cGUuX3BhcnNlKGlucHV0KTtcbiAgICB9XG4gICAgdW53cmFwKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLmlubmVyVHlwZTtcbiAgICB9XG59XG5ab2RPcHRpb25hbC5jcmVhdGUgPSAodHlwZSwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2RPcHRpb25hbCh7XG4gICAgICAgIGlubmVyVHlwZTogdHlwZSxcbiAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RPcHRpb25hbCxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2ROdWxsYWJsZSBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCBwYXJzZWRUeXBlID0gdGhpcy5fZ2V0VHlwZShpbnB1dCk7XG4gICAgICAgIGlmIChwYXJzZWRUeXBlID09PSBab2RQYXJzZWRUeXBlLm51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiBPSyhudWxsKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5fZGVmLmlubmVyVHlwZS5fcGFyc2UoaW5wdXQpO1xuICAgIH1cbiAgICB1bndyYXAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kZWYuaW5uZXJUeXBlO1xuICAgIH1cbn1cblpvZE51bGxhYmxlLmNyZWF0ZSA9ICh0eXBlLCBwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZE51bGxhYmxlKHtcbiAgICAgICAgaW5uZXJUeXBlOiB0eXBlLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZE51bGxhYmxlLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZERlZmF1bHQgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGxldCBkYXRhID0gY3R4LmRhdGE7XG4gICAgICAgIGlmIChjdHgucGFyc2VkVHlwZSA9PT0gWm9kUGFyc2VkVHlwZS51bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGRhdGEgPSB0aGlzLl9kZWYuZGVmYXVsdFZhbHVlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5pbm5lclR5cGUuX3BhcnNlKHtcbiAgICAgICAgICAgIGRhdGEsXG4gICAgICAgICAgICBwYXRoOiBjdHgucGF0aCxcbiAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmVtb3ZlRGVmYXVsdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5pbm5lclR5cGU7XG4gICAgfVxufVxuWm9kRGVmYXVsdC5jcmVhdGUgPSAodHlwZSwgcGFyYW1zKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBab2REZWZhdWx0KHtcbiAgICAgICAgaW5uZXJUeXBlOiB0eXBlLFxuICAgICAgICB0eXBlTmFtZTogWm9kRmlyc3RQYXJ0eVR5cGVLaW5kLlpvZERlZmF1bHQsXG4gICAgICAgIGRlZmF1bHRWYWx1ZTogdHlwZW9mIHBhcmFtcy5kZWZhdWx0ID09PSBcImZ1bmN0aW9uXCIgPyBwYXJhbXMuZGVmYXVsdCA6ICgpID0+IHBhcmFtcy5kZWZhdWx0LFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNsYXNzIFpvZENhdGNoIGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHsgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICAvLyBuZXdDdHggaXMgdXNlZCB0byBub3QgY29sbGVjdCBpc3N1ZXMgZnJvbSBpbm5lciB0eXBlcyBpbiBjdHhcbiAgICAgICAgY29uc3QgbmV3Q3R4ID0ge1xuICAgICAgICAgICAgLi4uY3R4LFxuICAgICAgICAgICAgY29tbW9uOiB7XG4gICAgICAgICAgICAgICAgLi4uY3R4LmNvbW1vbixcbiAgICAgICAgICAgICAgICBpc3N1ZXM6IFtdLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5fZGVmLmlubmVyVHlwZS5fcGFyc2Uoe1xuICAgICAgICAgICAgZGF0YTogbmV3Q3R4LmRhdGEsXG4gICAgICAgICAgICBwYXRoOiBuZXdDdHgucGF0aCxcbiAgICAgICAgICAgIHBhcmVudDoge1xuICAgICAgICAgICAgICAgIC4uLm5ld0N0eCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoaXNBc3luYyhyZXN1bHQpKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0LnRoZW4oKHJlc3VsdCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1czogXCJ2YWxpZFwiLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogcmVzdWx0LnN0YXR1cyA9PT0gXCJ2YWxpZFwiXG4gICAgICAgICAgICAgICAgICAgICAgICA/IHJlc3VsdC52YWx1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgOiB0aGlzLl9kZWYuY2F0Y2hWYWx1ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2V0IGVycm9yKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFpvZEVycm9yKG5ld0N0eC5jb21tb24uaXNzdWVzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0OiBuZXdDdHguZGF0YSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3RhdHVzOiBcInZhbGlkXCIsXG4gICAgICAgICAgICAgICAgdmFsdWU6IHJlc3VsdC5zdGF0dXMgPT09IFwidmFsaWRcIlxuICAgICAgICAgICAgICAgICAgICA/IHJlc3VsdC52YWx1ZVxuICAgICAgICAgICAgICAgICAgICA6IHRoaXMuX2RlZi5jYXRjaFZhbHVlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdldCBlcnJvcigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFpvZEVycm9yKG5ld0N0eC5jb21tb24uaXNzdWVzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnB1dDogbmV3Q3R4LmRhdGEsXG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZW1vdmVDYXRjaCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5pbm5lclR5cGU7XG4gICAgfVxufVxuWm9kQ2F0Y2guY3JlYXRlID0gKHR5cGUsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kQ2F0Y2goe1xuICAgICAgICBpbm5lclR5cGU6IHR5cGUsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kQ2F0Y2gsXG4gICAgICAgIGNhdGNoVmFsdWU6IHR5cGVvZiBwYXJhbXMuY2F0Y2ggPT09IFwiZnVuY3Rpb25cIiA/IHBhcmFtcy5jYXRjaCA6ICgpID0+IHBhcmFtcy5jYXRjaCxcbiAgICAgICAgLi4ucHJvY2Vzc0NyZWF0ZVBhcmFtcyhwYXJhbXMpLFxuICAgIH0pO1xufTtcbmV4cG9ydCBjbGFzcyBab2ROYU4gZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgcGFyc2VkVHlwZSA9IHRoaXMuX2dldFR5cGUoaW5wdXQpO1xuICAgICAgICBpZiAocGFyc2VkVHlwZSAhPT0gWm9kUGFyc2VkVHlwZS5uYW4pIHtcbiAgICAgICAgICAgIGNvbnN0IGN0eCA9IHRoaXMuX2dldE9yUmV0dXJuQ3R4KGlucHV0KTtcbiAgICAgICAgICAgIGFkZElzc3VlVG9Db250ZXh0KGN0eCwge1xuICAgICAgICAgICAgICAgIGNvZGU6IFpvZElzc3VlQ29kZS5pbnZhbGlkX3R5cGUsXG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IFpvZFBhcnNlZFR5cGUubmFuLFxuICAgICAgICAgICAgICAgIHJlY2VpdmVkOiBjdHgucGFyc2VkVHlwZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIElOVkFMSUQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3RhdHVzOiBcInZhbGlkXCIsIHZhbHVlOiBpbnB1dC5kYXRhIH07XG4gICAgfVxufVxuWm9kTmFOLmNyZWF0ZSA9IChwYXJhbXMpID0+IHtcbiAgICByZXR1cm4gbmV3IFpvZE5hTih7XG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kTmFOLFxuICAgICAgICAuLi5wcm9jZXNzQ3JlYXRlUGFyYW1zKHBhcmFtcyksXG4gICAgfSk7XG59O1xuZXhwb3J0IGNvbnN0IEJSQU5EID0gU3ltYm9sKFwiem9kX2JyYW5kXCIpO1xuZXhwb3J0IGNsYXNzIFpvZEJyYW5kZWQgZXh0ZW5kcyBab2RUeXBlIHtcbiAgICBfcGFyc2UoaW5wdXQpIHtcbiAgICAgICAgY29uc3QgeyBjdHggfSA9IHRoaXMuX3Byb2Nlc3NJbnB1dFBhcmFtcyhpbnB1dCk7XG4gICAgICAgIGNvbnN0IGRhdGEgPSBjdHguZGF0YTtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi50eXBlLl9wYXJzZSh7XG4gICAgICAgICAgICBkYXRhLFxuICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICBwYXJlbnQ6IGN0eCxcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHVud3JhcCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi50eXBlO1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBab2RQaXBlbGluZSBleHRlbmRzIFpvZFR5cGUge1xuICAgIF9wYXJzZShpbnB1dCkge1xuICAgICAgICBjb25zdCB7IHN0YXR1cywgY3R4IH0gPSB0aGlzLl9wcm9jZXNzSW5wdXRQYXJhbXMoaW5wdXQpO1xuICAgICAgICBpZiAoY3R4LmNvbW1vbi5hc3luYykge1xuICAgICAgICAgICAgY29uc3QgaGFuZGxlQXN5bmMgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgaW5SZXN1bHQgPSBhd2FpdCB0aGlzLl9kZWYuaW4uX3BhcnNlQXN5bmMoe1xuICAgICAgICAgICAgICAgICAgICBkYXRhOiBjdHguZGF0YSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmIChpblJlc3VsdC5zdGF0dXMgPT09IFwiYWJvcnRlZFwiKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgICAgICBpZiAoaW5SZXN1bHQuc3RhdHVzID09PSBcImRpcnR5XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdHVzLmRpcnR5KCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBESVJUWShpblJlc3VsdC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5fZGVmLm91dC5fcGFyc2VBc3luYyh7XG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBpblJlc3VsdC52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBjdHgsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gaGFuZGxlQXN5bmMoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGluUmVzdWx0ID0gdGhpcy5fZGVmLmluLl9wYXJzZVN5bmMoe1xuICAgICAgICAgICAgICAgIGRhdGE6IGN0eC5kYXRhLFxuICAgICAgICAgICAgICAgIHBhdGg6IGN0eC5wYXRoLFxuICAgICAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoaW5SZXN1bHQuc3RhdHVzID09PSBcImFib3J0ZWRcIilcbiAgICAgICAgICAgICAgICByZXR1cm4gSU5WQUxJRDtcbiAgICAgICAgICAgIGlmIChpblJlc3VsdC5zdGF0dXMgPT09IFwiZGlydHlcIikge1xuICAgICAgICAgICAgICAgIHN0YXR1cy5kaXJ0eSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXR1czogXCJkaXJ0eVwiLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogaW5SZXN1bHQudmFsdWUsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9kZWYub3V0Ll9wYXJzZVN5bmMoe1xuICAgICAgICAgICAgICAgICAgICBkYXRhOiBpblJlc3VsdC52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogY3R4LnBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogY3R4LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHN0YXRpYyBjcmVhdGUoYSwgYikge1xuICAgICAgICByZXR1cm4gbmV3IFpvZFBpcGVsaW5lKHtcbiAgICAgICAgICAgIGluOiBhLFxuICAgICAgICAgICAgb3V0OiBiLFxuICAgICAgICAgICAgdHlwZU5hbWU6IFpvZEZpcnN0UGFydHlUeXBlS2luZC5ab2RQaXBlbGluZSxcbiAgICAgICAgfSk7XG4gICAgfVxufVxuZXhwb3J0IGNsYXNzIFpvZFJlYWRvbmx5IGV4dGVuZHMgWm9kVHlwZSB7XG4gICAgX3BhcnNlKGlucHV0KSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuX2RlZi5pbm5lclR5cGUuX3BhcnNlKGlucHV0KTtcbiAgICAgICAgY29uc3QgZnJlZXplID0gKGRhdGEpID0+IHtcbiAgICAgICAgICAgIGlmIChpc1ZhbGlkKGRhdGEpKSB7XG4gICAgICAgICAgICAgICAgZGF0YS52YWx1ZSA9IE9iamVjdC5mcmVlemUoZGF0YS52YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZGF0YTtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIGlzQXN5bmMocmVzdWx0KSA/IHJlc3VsdC50aGVuKChkYXRhKSA9PiBmcmVlemUoZGF0YSkpIDogZnJlZXplKHJlc3VsdCk7XG4gICAgfVxuICAgIHVud3JhcCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2RlZi5pbm5lclR5cGU7XG4gICAgfVxufVxuWm9kUmVhZG9ubHkuY3JlYXRlID0gKHR5cGUsIHBhcmFtcykgPT4ge1xuICAgIHJldHVybiBuZXcgWm9kUmVhZG9ubHkoe1xuICAgICAgICBpbm5lclR5cGU6IHR5cGUsXG4gICAgICAgIHR5cGVOYW1lOiBab2RGaXJzdFBhcnR5VHlwZUtpbmQuWm9kUmVhZG9ubHksXG4gICAgICAgIC4uLnByb2Nlc3NDcmVhdGVQYXJhbXMocGFyYW1zKSxcbiAgICB9KTtcbn07XG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLy8vLy8vLy8vICAgICAgICAgICAgICAgICAgICAvLy8vLy8vLy8vXG4vLy8vLy8vLy8vICAgICAgei5jdXN0b20gICAgICAvLy8vLy8vLy8vXG4vLy8vLy8vLy8vICAgICAgICAgICAgICAgICAgICAvLy8vLy8vLy8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5mdW5jdGlvbiBjbGVhblBhcmFtcyhwYXJhbXMsIGRhdGEpIHtcbiAgICBjb25zdCBwID0gdHlwZW9mIHBhcmFtcyA9PT0gXCJmdW5jdGlvblwiID8gcGFyYW1zKGRhdGEpIDogdHlwZW9mIHBhcmFtcyA9PT0gXCJzdHJpbmdcIiA/IHsgbWVzc2FnZTogcGFyYW1zIH0gOiBwYXJhbXM7XG4gICAgY29uc3QgcDIgPSB0eXBlb2YgcCA9PT0gXCJzdHJpbmdcIiA/IHsgbWVzc2FnZTogcCB9IDogcDtcbiAgICByZXR1cm4gcDI7XG59XG5leHBvcnQgZnVuY3Rpb24gY3VzdG9tKGNoZWNrLCBfcGFyYW1zID0ge30sIFxuLyoqXG4gKiBAZGVwcmVjYXRlZFxuICpcbiAqIFBhc3MgYGZhdGFsYCBpbnRvIHRoZSBwYXJhbXMgb2JqZWN0IGluc3RlYWQ6XG4gKlxuICogYGBgdHNcbiAqIHouc3RyaW5nKCkuY3VzdG9tKCh2YWwpID0+IHZhbC5sZW5ndGggPiA1LCB7IGZhdGFsOiBmYWxzZSB9KVxuICogYGBgXG4gKlxuICovXG5mYXRhbCkge1xuICAgIGlmIChjaGVjaylcbiAgICAgICAgcmV0dXJuIFpvZEFueS5jcmVhdGUoKS5zdXBlclJlZmluZSgoZGF0YSwgY3R4KSA9PiB7XG4gICAgICAgICAgICBjb25zdCByID0gY2hlY2soZGF0YSk7XG4gICAgICAgICAgICBpZiAociBpbnN0YW5jZW9mIFByb21pc2UpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gci50aGVuKChyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFyYW1zID0gY2xlYW5QYXJhbXMoX3BhcmFtcywgZGF0YSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBfZmF0YWwgPSBwYXJhbXMuZmF0YWwgPz8gZmF0YWwgPz8gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGN0eC5hZGRJc3N1ZSh7IGNvZGU6IFwiY3VzdG9tXCIsIC4uLnBhcmFtcywgZmF0YWw6IF9mYXRhbCB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFyKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyYW1zID0gY2xlYW5QYXJhbXMoX3BhcmFtcywgZGF0YSk7XG4gICAgICAgICAgICAgICAgY29uc3QgX2ZhdGFsID0gcGFyYW1zLmZhdGFsID8/IGZhdGFsID8/IHRydWU7XG4gICAgICAgICAgICAgICAgY3R4LmFkZElzc3VlKHsgY29kZTogXCJjdXN0b21cIiwgLi4ucGFyYW1zLCBmYXRhbDogX2ZhdGFsIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9KTtcbiAgICByZXR1cm4gWm9kQW55LmNyZWF0ZSgpO1xufVxuZXhwb3J0IHsgWm9kVHlwZSBhcyBTY2hlbWEsIFpvZFR5cGUgYXMgWm9kU2NoZW1hIH07XG5leHBvcnQgY29uc3QgbGF0ZSA9IHtcbiAgICBvYmplY3Q6IFpvZE9iamVjdC5sYXp5Y3JlYXRlLFxufTtcbmV4cG9ydCB2YXIgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kO1xuKGZ1bmN0aW9uIChab2RGaXJzdFBhcnR5VHlwZUtpbmQpIHtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RTdHJpbmdcIl0gPSBcIlpvZFN0cmluZ1wiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZE51bWJlclwiXSA9IFwiWm9kTnVtYmVyXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kTmFOXCJdID0gXCJab2ROYU5cIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RCaWdJbnRcIl0gPSBcIlpvZEJpZ0ludFwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZEJvb2xlYW5cIl0gPSBcIlpvZEJvb2xlYW5cIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2REYXRlXCJdID0gXCJab2REYXRlXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kU3ltYm9sXCJdID0gXCJab2RTeW1ib2xcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RVbmRlZmluZWRcIl0gPSBcIlpvZFVuZGVmaW5lZFwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZE51bGxcIl0gPSBcIlpvZE51bGxcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RBbnlcIl0gPSBcIlpvZEFueVwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZFVua25vd25cIl0gPSBcIlpvZFVua25vd25cIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2ROZXZlclwiXSA9IFwiWm9kTmV2ZXJcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RWb2lkXCJdID0gXCJab2RWb2lkXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kQXJyYXlcIl0gPSBcIlpvZEFycmF5XCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kT2JqZWN0XCJdID0gXCJab2RPYmplY3RcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RVbmlvblwiXSA9IFwiWm9kVW5pb25cIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2REaXNjcmltaW5hdGVkVW5pb25cIl0gPSBcIlpvZERpc2NyaW1pbmF0ZWRVbmlvblwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZEludGVyc2VjdGlvblwiXSA9IFwiWm9kSW50ZXJzZWN0aW9uXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kVHVwbGVcIl0gPSBcIlpvZFR1cGxlXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kUmVjb3JkXCJdID0gXCJab2RSZWNvcmRcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RNYXBcIl0gPSBcIlpvZE1hcFwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZFNldFwiXSA9IFwiWm9kU2V0XCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kRnVuY3Rpb25cIl0gPSBcIlpvZEZ1bmN0aW9uXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kTGF6eVwiXSA9IFwiWm9kTGF6eVwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZExpdGVyYWxcIl0gPSBcIlpvZExpdGVyYWxcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RFbnVtXCJdID0gXCJab2RFbnVtXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kRWZmZWN0c1wiXSA9IFwiWm9kRWZmZWN0c1wiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZE5hdGl2ZUVudW1cIl0gPSBcIlpvZE5hdGl2ZUVudW1cIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RPcHRpb25hbFwiXSA9IFwiWm9kT3B0aW9uYWxcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2ROdWxsYWJsZVwiXSA9IFwiWm9kTnVsbGFibGVcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2REZWZhdWx0XCJdID0gXCJab2REZWZhdWx0XCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kQ2F0Y2hcIl0gPSBcIlpvZENhdGNoXCI7XG4gICAgWm9kRmlyc3RQYXJ0eVR5cGVLaW5kW1wiWm9kUHJvbWlzZVwiXSA9IFwiWm9kUHJvbWlzZVwiO1xuICAgIFpvZEZpcnN0UGFydHlUeXBlS2luZFtcIlpvZEJyYW5kZWRcIl0gPSBcIlpvZEJyYW5kZWRcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RQaXBlbGluZVwiXSA9IFwiWm9kUGlwZWxpbmVcIjtcbiAgICBab2RGaXJzdFBhcnR5VHlwZUtpbmRbXCJab2RSZWFkb25seVwiXSA9IFwiWm9kUmVhZG9ubHlcIjtcbn0pKFpvZEZpcnN0UGFydHlUeXBlS2luZCB8fCAoWm9kRmlyc3RQYXJ0eVR5cGVLaW5kID0ge30pKTtcbi8vIHJlcXVpcmVzIFRTIDQuNCtcbmNsYXNzIENsYXNzIHtcbiAgICBjb25zdHJ1Y3RvciguLi5fKSB7IH1cbn1cbmNvbnN0IGluc3RhbmNlT2ZUeXBlID0gKFxuLy8gY29uc3QgaW5zdGFuY2VPZlR5cGUgPSA8VCBleHRlbmRzIG5ldyAoLi4uYXJnczogYW55W10pID0+IGFueT4oXG5jbHMsIHBhcmFtcyA9IHtcbiAgICBtZXNzYWdlOiBgSW5wdXQgbm90IGluc3RhbmNlIG9mICR7Y2xzLm5hbWV9YCxcbn0pID0+IGN1c3RvbSgoZGF0YSkgPT4gZGF0YSBpbnN0YW5jZW9mIGNscywgcGFyYW1zKTtcbmNvbnN0IHN0cmluZ1R5cGUgPSBab2RTdHJpbmcuY3JlYXRlO1xuY29uc3QgbnVtYmVyVHlwZSA9IFpvZE51bWJlci5jcmVhdGU7XG5jb25zdCBuYW5UeXBlID0gWm9kTmFOLmNyZWF0ZTtcbmNvbnN0IGJpZ0ludFR5cGUgPSBab2RCaWdJbnQuY3JlYXRlO1xuY29uc3QgYm9vbGVhblR5cGUgPSBab2RCb29sZWFuLmNyZWF0ZTtcbmNvbnN0IGRhdGVUeXBlID0gWm9kRGF0ZS5jcmVhdGU7XG5jb25zdCBzeW1ib2xUeXBlID0gWm9kU3ltYm9sLmNyZWF0ZTtcbmNvbnN0IHVuZGVmaW5lZFR5cGUgPSBab2RVbmRlZmluZWQuY3JlYXRlO1xuY29uc3QgbnVsbFR5cGUgPSBab2ROdWxsLmNyZWF0ZTtcbmNvbnN0IGFueVR5cGUgPSBab2RBbnkuY3JlYXRlO1xuY29uc3QgdW5rbm93blR5cGUgPSBab2RVbmtub3duLmNyZWF0ZTtcbmNvbnN0IG5ldmVyVHlwZSA9IFpvZE5ldmVyLmNyZWF0ZTtcbmNvbnN0IHZvaWRUeXBlID0gWm9kVm9pZC5jcmVhdGU7XG5jb25zdCBhcnJheVR5cGUgPSBab2RBcnJheS5jcmVhdGU7XG5jb25zdCBvYmplY3RUeXBlID0gWm9kT2JqZWN0LmNyZWF0ZTtcbmNvbnN0IHN0cmljdE9iamVjdFR5cGUgPSBab2RPYmplY3Quc3RyaWN0Q3JlYXRlO1xuY29uc3QgdW5pb25UeXBlID0gWm9kVW5pb24uY3JlYXRlO1xuY29uc3QgZGlzY3JpbWluYXRlZFVuaW9uVHlwZSA9IFpvZERpc2NyaW1pbmF0ZWRVbmlvbi5jcmVhdGU7XG5jb25zdCBpbnRlcnNlY3Rpb25UeXBlID0gWm9kSW50ZXJzZWN0aW9uLmNyZWF0ZTtcbmNvbnN0IHR1cGxlVHlwZSA9IFpvZFR1cGxlLmNyZWF0ZTtcbmNvbnN0IHJlY29yZFR5cGUgPSBab2RSZWNvcmQuY3JlYXRlO1xuY29uc3QgbWFwVHlwZSA9IFpvZE1hcC5jcmVhdGU7XG5jb25zdCBzZXRUeXBlID0gWm9kU2V0LmNyZWF0ZTtcbmNvbnN0IGZ1bmN0aW9uVHlwZSA9IFpvZEZ1bmN0aW9uLmNyZWF0ZTtcbmNvbnN0IGxhenlUeXBlID0gWm9kTGF6eS5jcmVhdGU7XG5jb25zdCBsaXRlcmFsVHlwZSA9IFpvZExpdGVyYWwuY3JlYXRlO1xuY29uc3QgZW51bVR5cGUgPSBab2RFbnVtLmNyZWF0ZTtcbmNvbnN0IG5hdGl2ZUVudW1UeXBlID0gWm9kTmF0aXZlRW51bS5jcmVhdGU7XG5jb25zdCBwcm9taXNlVHlwZSA9IFpvZFByb21pc2UuY3JlYXRlO1xuY29uc3QgZWZmZWN0c1R5cGUgPSBab2RFZmZlY3RzLmNyZWF0ZTtcbmNvbnN0IG9wdGlvbmFsVHlwZSA9IFpvZE9wdGlvbmFsLmNyZWF0ZTtcbmNvbnN0IG51bGxhYmxlVHlwZSA9IFpvZE51bGxhYmxlLmNyZWF0ZTtcbmNvbnN0IHByZXByb2Nlc3NUeXBlID0gWm9kRWZmZWN0cy5jcmVhdGVXaXRoUHJlcHJvY2VzcztcbmNvbnN0IHBpcGVsaW5lVHlwZSA9IFpvZFBpcGVsaW5lLmNyZWF0ZTtcbmNvbnN0IG9zdHJpbmcgPSAoKSA9PiBzdHJpbmdUeXBlKCkub3B0aW9uYWwoKTtcbmNvbnN0IG9udW1iZXIgPSAoKSA9PiBudW1iZXJUeXBlKCkub3B0aW9uYWwoKTtcbmNvbnN0IG9ib29sZWFuID0gKCkgPT4gYm9vbGVhblR5cGUoKS5vcHRpb25hbCgpO1xuZXhwb3J0IGNvbnN0IGNvZXJjZSA9IHtcbiAgICBzdHJpbmc6ICgoYXJnKSA9PiBab2RTdHJpbmcuY3JlYXRlKHsgLi4uYXJnLCBjb2VyY2U6IHRydWUgfSkpLFxuICAgIG51bWJlcjogKChhcmcpID0+IFpvZE51bWJlci5jcmVhdGUoeyAuLi5hcmcsIGNvZXJjZTogdHJ1ZSB9KSksXG4gICAgYm9vbGVhbjogKChhcmcpID0+IFpvZEJvb2xlYW4uY3JlYXRlKHtcbiAgICAgICAgLi4uYXJnLFxuICAgICAgICBjb2VyY2U6IHRydWUsXG4gICAgfSkpLFxuICAgIGJpZ2ludDogKChhcmcpID0+IFpvZEJpZ0ludC5jcmVhdGUoeyAuLi5hcmcsIGNvZXJjZTogdHJ1ZSB9KSksXG4gICAgZGF0ZTogKChhcmcpID0+IFpvZERhdGUuY3JlYXRlKHsgLi4uYXJnLCBjb2VyY2U6IHRydWUgfSkpLFxufTtcbmV4cG9ydCB7IGFueVR5cGUgYXMgYW55LCBhcnJheVR5cGUgYXMgYXJyYXksIGJpZ0ludFR5cGUgYXMgYmlnaW50LCBib29sZWFuVHlwZSBhcyBib29sZWFuLCBkYXRlVHlwZSBhcyBkYXRlLCBkaXNjcmltaW5hdGVkVW5pb25UeXBlIGFzIGRpc2NyaW1pbmF0ZWRVbmlvbiwgZWZmZWN0c1R5cGUgYXMgZWZmZWN0LCBlbnVtVHlwZSBhcyBlbnVtLCBmdW5jdGlvblR5cGUgYXMgZnVuY3Rpb24sIGluc3RhbmNlT2ZUeXBlIGFzIGluc3RhbmNlb2YsIGludGVyc2VjdGlvblR5cGUgYXMgaW50ZXJzZWN0aW9uLCBsYXp5VHlwZSBhcyBsYXp5LCBsaXRlcmFsVHlwZSBhcyBsaXRlcmFsLCBtYXBUeXBlIGFzIG1hcCwgbmFuVHlwZSBhcyBuYW4sIG5hdGl2ZUVudW1UeXBlIGFzIG5hdGl2ZUVudW0sIG5ldmVyVHlwZSBhcyBuZXZlciwgbnVsbFR5cGUgYXMgbnVsbCwgbnVsbGFibGVUeXBlIGFzIG51bGxhYmxlLCBudW1iZXJUeXBlIGFzIG51bWJlciwgb2JqZWN0VHlwZSBhcyBvYmplY3QsIG9ib29sZWFuLCBvbnVtYmVyLCBvcHRpb25hbFR5cGUgYXMgb3B0aW9uYWwsIG9zdHJpbmcsIHBpcGVsaW5lVHlwZSBhcyBwaXBlbGluZSwgcHJlcHJvY2Vzc1R5cGUgYXMgcHJlcHJvY2VzcywgcHJvbWlzZVR5cGUgYXMgcHJvbWlzZSwgcmVjb3JkVHlwZSBhcyByZWNvcmQsIHNldFR5cGUgYXMgc2V0LCBzdHJpY3RPYmplY3RUeXBlIGFzIHN0cmljdE9iamVjdCwgc3RyaW5nVHlwZSBhcyBzdHJpbmcsIHN5bWJvbFR5cGUgYXMgc3ltYm9sLCBlZmZlY3RzVHlwZSBhcyB0cmFuc2Zvcm1lciwgdHVwbGVUeXBlIGFzIHR1cGxlLCB1bmRlZmluZWRUeXBlIGFzIHVuZGVmaW5lZCwgdW5pb25UeXBlIGFzIHVuaW9uLCB1bmtub3duVHlwZSBhcyB1bmtub3duLCB2b2lkVHlwZSBhcyB2b2lkLCB9O1xuZXhwb3J0IGNvbnN0IE5FVkVSID0gSU5WQUxJRDtcbiIsImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgRVJST1JfS0lORFMgfSBmcm9tICcuL2Vycm9ycyc7XG5cbi8qKlxuICog5oyB5LmF5YyW5pWw5o2u5LiO5qih5Z6L5ZON5bqU5YWx55So55qEIFpvZCBTY2hlbWHjgIJcbiAqIOWtmOWCqCBrZXkg6KeBIGRvY3Mv5oqA5pyv5p625p6E5pa55qGIIOesrCAxMCDoioLvvJpcbiAqIHNldHRpbmdzOm1vZGVsIC8gam9iOmN1cnJlbnQgLyBzY2FuOmN1cnJlbnQgLyBwbGFuOmN1cnJlbnQgLyB1bmRvOmxhdGVzdFxuICovXG5cbmV4cG9ydCBjb25zdCBTVE9SQUdFX0tFWVMgPSB7XG4gIG1vZGVsU2V0dGluZ3M6ICdzZXR0aW5nczptb2RlbCcsXG4gIGpvYjogJ2pvYjpjdXJyZW50JyxcbiAgc2NhbjogJ3NjYW46Y3VycmVudCcsXG4gIHBsYW46ICdwbGFuOmN1cnJlbnQnLFxuICB1bmRvOiAndW5kbzpsYXRlc3QnLFxufSBhcyBjb25zdDtcblxuLyoqIOWGmeWFpSBjaHJvbWUuc3RvcmFnZS5sb2NhbCDliY3lhYHorrjnmoTmnIDlpKflt7LnlKjnqbrpl7TvvIjmjqXov5EgMTAgTUIg6YWN6aKd5pe25YGc5q2i77yJ44CCICovXG5leHBvcnQgY29uc3QgU1RPUkFHRV9RVU9UQV9MSU1JVF9CWVRFUyA9IDkuNSAqIDEwMjQgKiAxMDI0O1xuXG4vLyAtLS0tLS0tLS0tIOaooeWei+iuvue9riAtLS0tLS0tLS0tXG5cbmV4cG9ydCBjb25zdCBNb2RlbFNldHRpbmdzU2NoZW1hID0gei5vYmplY3Qoe1xuICBiYXNlVXJsOiB6XG4gICAgLnN0cmluZygpXG4gICAgLnVybCgpXG4gICAgLnJlZmluZSgodSkgPT4gdS5zdGFydHNXaXRoKCdodHRwczovLycpLCB7IG1lc3NhZ2U6ICfku4XmlK/mjIEgSFRUUFMg55qEIEFQSSBCYXNlIFVSTCcgfSksXG4gIGFwaUtleTogei5zdHJpbmcoKS5taW4oMSksXG4gIG1vZGVsOiB6LnN0cmluZygpLm1pbigxKSxcbn0pO1xuZXhwb3J0IHR5cGUgTW9kZWxTZXR0aW5ncyA9IHouaW5mZXI8dHlwZW9mIE1vZGVsU2V0dGluZ3NTY2hlbWE+O1xuXG4vLyAtLS0tLS0tLS0tIOaJq+aPj+e7k+aenCAtLS0tLS0tLS0tXG5cbmV4cG9ydCBjb25zdCBTY2FuUm9vdFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIHRpdGxlOiB6LnN0cmluZygpLFxufSk7XG5leHBvcnQgdHlwZSBTY2FuUm9vdCA9IHouaW5mZXI8dHlwZW9mIFNjYW5Sb290U2NoZW1hPjtcblxuZXhwb3J0IGNvbnN0IFNjYW5Gb2xkZXJTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICBwYXJlbnRJZDogei5zdHJpbmcoKSxcbiAgcm9vdElkOiB6LnN0cmluZygpLFxuICB0aXRsZTogei5zdHJpbmcoKSxcbiAgLyoqIOebuOWvueS6juaJgOWcqOagueebruW9leeahOebruW9leWQjei3r+W+hO+8iOS4jeWQq+agueebruW9leiHqui6q++8ieOAgiAqL1xuICBwYXRoOiB6LmFycmF5KHouc3RyaW5nKCkpLFxuICBkZXB0aDogei5udW1iZXIoKS5pbnQoKS5ub25uZWdhdGl2ZSgpLFxufSk7XG5leHBvcnQgdHlwZSBTY2FuRm9sZGVyID0gei5pbmZlcjx0eXBlb2YgU2NhbkZvbGRlclNjaGVtYT47XG5cbmV4cG9ydCBjb25zdCBTY2FubmVkQm9va21hcmtTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICB0aXRsZTogei5zdHJpbmcoKSxcbiAgdXJsOiB6LnN0cmluZygpLFxuICBkYXRlQWRkZWQ6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgcGFyZW50SWQ6IHouc3RyaW5nKCksXG4gIHJvb3RJZDogei5zdHJpbmcoKSxcbiAgLyoqIOS5puetvuaJgOWcqOebruW9leebuOWvueS6juagueebruW9leeahOebruW9leWQjei3r+W+hO+8iOS4jeWQq+agueebruW9leiHqui6q++8ieOAgiAqL1xuICBwYXRoOiB6LmFycmF5KHouc3RyaW5nKCkpLFxufSk7XG5leHBvcnQgdHlwZSBTY2FubmVkQm9va21hcmsgPSB6LmluZmVyPHR5cGVvZiBTY2FubmVkQm9va21hcmtTY2hlbWE+O1xuXG5leHBvcnQgY29uc3QgU2NhblJlc3VsdFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc2NhbklkOiB6LnN0cmluZygpLFxuICBzY2FubmVkQXQ6IHoubnVtYmVyKCksXG4gIHJvb3RzOiB6LmFycmF5KFNjYW5Sb290U2NoZW1hKSxcbiAgZm9sZGVyczogei5hcnJheShTY2FuRm9sZGVyU2NoZW1hKSxcbiAgYm9va21hcmtzOiB6LmFycmF5KFNjYW5uZWRCb29rbWFya1NjaGVtYSksXG59KTtcbmV4cG9ydCB0eXBlIFNjYW5SZXN1bHQgPSB6LmluZmVyPHR5cGVvZiBTY2FuUmVzdWx0U2NoZW1hPjtcblxuLy8gLS0tLS0tLS0tLSDliIbnsbvmlrnmoYggLS0tLS0tLS0tLVxuXG5jb25zdCBQYXRoU2VnbWVudFNjaGVtYSA9IHouc3RyaW5nKCkubWluKDEpLm1heCgxMDApO1xuLyoqXG4gKiDkv53lrojmqKHlvI/pnIDopoHlrozmlbTlpI3nlKjnlKjmiLflt7LmnInnmoTmt7HlsYLnm67lvZXvvJvph43mlrDop4TliJLmqKHlvI/ku43lnKjkuJrliqHlsYLpmZDliLbkuLrmnIDlpJrkuKTnuqfjgIJcbiAqIOi/memHjOS/neeVmeS4gOS4quWuveadvuS9huacieS4iumZkOeahOaMgeS5heWMlui+ueeVjO+8jOmBv+WFjeWQiOazleeahOeOsOacieebruW9leWcqOivu+WPluaXtuiiq+S4ouW8g+OAglxuICovXG5leHBvcnQgY29uc3QgVGFyZ2V0UGF0aFNjaGVtYSA9IHouYXJyYXkoUGF0aFNlZ21lbnRTY2hlbWEpLm1pbigxKS5tYXgoMTAwKTtcblxuZXhwb3J0IGNvbnN0IE9SR0FOSVpFX01PREVTID0gWydjb25zZXJ2YXRpdmUnLCAncmVvcmdhbml6ZSddIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IE9yZ2FuaXplTW9kZVNjaGVtYSA9IHouZW51bShPUkdBTklaRV9NT0RFUyk7XG5leHBvcnQgdHlwZSBPcmdhbml6ZU1vZGUgPSB6LmluZmVyPHR5cGVvZiBPcmdhbml6ZU1vZGVTY2hlbWE+O1xuXG5leHBvcnQgY29uc3QgRk9MREVSX05BTUVfU1RZTEVTID0gWydlbW9qaScsICd0ZXh0J10gYXMgY29uc3Q7XG5leHBvcnQgY29uc3QgRm9sZGVyTmFtZVN0eWxlU2NoZW1hID0gei5lbnVtKEZPTERFUl9OQU1FX1NUWUxFUyk7XG5leHBvcnQgdHlwZSBGb2xkZXJOYW1lU3R5bGUgPSB6LmluZmVyPHR5cGVvZiBGb2xkZXJOYW1lU3R5bGVTY2hlbWE+O1xuXG5leHBvcnQgY29uc3QgQXNzaWdubWVudFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgYm9va21hcmtJZDogei5zdHJpbmcoKSxcbiAgdGFyZ2V0UGF0aDogVGFyZ2V0UGF0aFNjaGVtYSxcbiAgcmVhc29uOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG59KTtcbmV4cG9ydCB0eXBlIEFzc2lnbm1lbnQgPSB6LmluZmVyPHR5cGVvZiBBc3NpZ25tZW50U2NoZW1hPjtcblxuZXhwb3J0IGNvbnN0IFBsYW5SZWNvcmRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGpvYklkOiB6LnN0cmluZygpLFxuICBjcmVhdGVkQXQ6IHoubnVtYmVyKCksXG4gIC8qKiDnlKjmiLfmmI7noa7pgInkuK3nmoTmlofku7blpLnojIPlm7TvvJvml6fmlrnmoYjpu5jorqTkuI3muIXnkIbku7vkvZXljp/mlofku7blpLnjgIIgKi9cbiAgc2VsZWN0ZWRGb2xkZXJJZHM6IHouYXJyYXkoei5zdHJpbmcoKSkuZGVmYXVsdChbXSksXG4gIC8qKiDml6fmlrnmoYjpu5jorqTmjInljoblj7LooYzkuLrop4bkuLrigJzph43mlrDop4TliJLnm67lvZXigJ3jgIIgKi9cbiAgbW9kZTogT3JnYW5pemVNb2RlU2NoZW1hLmRlZmF1bHQoJ3Jlb3JnYW5pemUnKSxcbiAgLyoqIOaXp+aWueahiOeahOebruW9leWQjeWdh+S4uue6r+aWh+Wtl+OAgiAqL1xuICBmb2xkZXJOYW1lU3R5bGU6IEZvbGRlck5hbWVTdHlsZVNjaGVtYS5kZWZhdWx0KCd0ZXh0JyksXG4gIHBoYXNlOiB6LmVudW0oWyd0YXhvbm9teScsICdhc3NpZ24nLCAnZG9uZSddKSxcbiAgLyoqIOWIhuexu+S9k+ezu+mYtuauteWQhOaJueasoeS6p+WHuueahOWAmemAieebruW9le+8jOeUqOS6juaWreeCuee7rei3keOAgiAqL1xuICB0YXhvbm9teUNhbmRpZGF0ZXM6IHouYXJyYXkoei5hcnJheShQYXRoU2VnbWVudFNjaGVtYSkubWluKDEpLm1heCgyKSkuZGVmYXVsdChbXSksXG4gIC8qKiDlt7LlrozmiJDnmoTliIbnsbvkvZPns7vmibnmrKHmlbDjgIIgKi9cbiAgdGF4b25vbXlDdXJzb3I6IHoubnVtYmVyKCkuaW50KCkubm9ubmVnYXRpdmUoKS5kZWZhdWx0KDApLFxuICAvKiog5pyA57uI55uu5b2V5L2T57O777yb6YeN5paw6KeE5YiS5qih5byP5pyA5aSa5Lik57qn77yM5L+d5a6I5qih5byP5Y+v5L+d55WZ546w5pyJ5rex5bGC6Lev5b6E44CCICovXG4gIHRheG9ub215OiB6LmFycmF5KFRhcmdldFBhdGhTY2hlbWEpLmRlZmF1bHQoW10pLFxuICBhc3NpZ25tZW50czogei5hcnJheShBc3NpZ25tZW50U2NoZW1hKS5kZWZhdWx0KFtdKSxcbiAgLyoqIOW3suWujOaIkOWIhumFjeeahOS5puetvuaVsOa4uOagh++8jOaBouWkjeaXtuS7jui/memHjOe7p+e7reOAgiAqL1xuICBhc3NpZ25DdXJzb3I6IHoubnVtYmVyKCkuaW50KCkubm9ubmVnYXRpdmUoKS5kZWZhdWx0KDApLFxufSk7XG5leHBvcnQgdHlwZSBQbGFuUmVjb3JkID0gei5pbmZlcjx0eXBlb2YgUGxhblJlY29yZFNjaGVtYT47XG5cbi8vIC0tLS0tLS0tLS0g5Lu75Yqh54q25oCBIC0tLS0tLS0tLS1cblxuZXhwb3J0IGNvbnN0IEpPQl9TVEFUVVNFUyA9IFtcbiAgJ2lkbGUnLFxuICAnc2Nhbm5pbmcnLFxuICAncGxhbm5pbmcnLFxuICAnY2xhc3NpZnlpbmcnLFxuICAncmV2aWV3aW5nJyxcbiAgJ2FwcGx5aW5nJyxcbiAgJ2NvbXBsZXRlZCcsXG4gICdpbnRlcnJ1cHRlZCcsXG4gICd1bmRvaW5nJyxcbiAgJ3VuZG9uZScsXG4gICdwYXJ0aWFsbHlfdW5kb25lJyxcbiAgJ2ZhaWxlZCcsXG5dIGFzIGNvbnN0O1xuZXhwb3J0IHR5cGUgSm9iU3RhdHVzID0gKHR5cGVvZiBKT0JfU1RBVFVTRVMpW251bWJlcl07XG5cbmV4cG9ydCBjb25zdCBGYWlsdXJlSXRlbVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgYm9va21hcmtJZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBmb2xkZXJJZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBraW5kOiB6LmVudW0oRVJST1JfS0lORFMpLFxuICBtZXNzYWdlOiB6LnN0cmluZygpLFxufSk7XG5leHBvcnQgdHlwZSBGYWlsdXJlSXRlbSA9IHouaW5mZXI8dHlwZW9mIEZhaWx1cmVJdGVtU2NoZW1hPjtcblxuZXhwb3J0IGNvbnN0IEpvYlN0YXRlU2NoZW1hID0gei5vYmplY3Qoe1xuICBqb2JJZDogei5zdHJpbmcoKSxcbiAgc3RhdHVzOiB6LmVudW0oSk9CX1NUQVRVU0VTKSxcbiAgdXBkYXRlZEF0OiB6Lm51bWJlcigpLFxuICAvKiogYXBwbHkg6Zi25q615oiQ5Yqf56e75Yqo55qE5Lmm562+5pWw5ri45qCH44CCICovXG4gIGFwcGx5Q3Vyc29yOiB6Lm51bWJlcigpLmludCgpLm5vbm5lZ2F0aXZlKCkuZGVmYXVsdCgwKSxcbiAgYXBwbGllZElkczogei5hcnJheSh6LnN0cmluZygpKS5kZWZhdWx0KFtdKSxcbiAgLyoqIGFwcGx5IOmYtuauteaWsOW7uueahOebruW9lSBJRO+8iOaSpOmUgOaXtuWPquWIoOmZpOi/meS6m+ebruW9leS4reeahOepuuebruW9le+8ieOAgiAqL1xuICBjcmVhdGVkRm9sZGVySWRzOiB6LmFycmF5KHouc3RyaW5nKCkpLmRlZmF1bHQoW10pLFxuICAvKiog55So5oi36K+35rGC5Lit5pat5YaZ5YWl55qE5qCH5b+X77yMU2VydmljZSBXb3JrZXIg5Zyo5q+P5p2h5YaZ5YWl5LmL6Ze05qOA5p+l44CCICovXG4gIGNhbmNlbFJlcXVlc3RlZDogei5ib29sZWFuKCkuZGVmYXVsdChmYWxzZSksXG4gIGZhaWx1cmVzOiB6LmFycmF5KEZhaWx1cmVJdGVtU2NoZW1hKS5kZWZhdWx0KFtdKSxcbiAgZXJyb3I6IEZhaWx1cmVJdGVtU2NoZW1hLm9wdGlvbmFsKCksXG59KTtcbmV4cG9ydCB0eXBlIEpvYlN0YXRlID0gei5pbmZlcjx0eXBlb2YgSm9iU3RhdGVTY2hlbWE+O1xuXG4vLyAtLS0tLS0tLS0tIOaSpOmUgOW/q+eFpyAtLS0tLS0tLS0tXG5cbmV4cG9ydCBjb25zdCBVbmRvTW92ZVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgYm9va21hcmtJZDogei5zdHJpbmcoKSxcbiAgZnJvbVBhcmVudElkOiB6LnN0cmluZygpLFxuICBmcm9tSW5kZXg6IHoubnVtYmVyKCkuaW50KCkubm9ubmVnYXRpdmUoKSxcbiAgdG9Gb2xkZXJJZDogei5zdHJpbmcoKSxcbn0pO1xuZXhwb3J0IHR5cGUgVW5kb01vdmUgPSB6LmluZmVyPHR5cGVvZiBVbmRvTW92ZVNjaGVtYT47XG5cbi8qKiDlupTnlKjml7booqvmkKznqbrlubbliKDpmaTnmoTljp/mlofku7blpLnvvIzmkqTplIDml7bmja7mraTph43lu7rku6Xov5jljp/kuabnrb7kvY3nva7jgIIgKi9cbmV4cG9ydCBjb25zdCBEZWxldGVkRm9sZGVyU2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgcGFyZW50SWQ6IHouc3RyaW5nKCksXG4gIHRpdGxlOiB6LnN0cmluZygpLFxuICBpbmRleDogei5udW1iZXIoKS5pbnQoKS5ub25uZWdhdGl2ZSgpLFxufSk7XG5leHBvcnQgdHlwZSBEZWxldGVkRm9sZGVyID0gei5pbmZlcjx0eXBlb2YgRGVsZXRlZEZvbGRlclNjaGVtYT47XG5cbmV4cG9ydCBjb25zdCBVbmRvU25hcHNob3RTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGpvYklkOiB6LnN0cmluZygpLFxuICBjcmVhdGVkQXQ6IHoubnVtYmVyKCksXG4gIG1vdmVzOiB6LmFycmF5KFVuZG9Nb3ZlU2NoZW1hKSxcbiAgY3JlYXRlZEZvbGRlcnM6IHouYXJyYXkoXG4gICAgei5vYmplY3QoeyBpZDogei5zdHJpbmcoKSwgZGVwdGg6IHoubnVtYmVyKCkuaW50KCkubm9ubmVnYXRpdmUoKSB9KSxcbiAgKSxcbiAgLy8g5pen5b+r54Wn5peg5q2k5a2X5q6177ya6buY6K6k56m65pWw57uE77yM5L+d6K+B5ZCR5ZCO5YW85a6544CCXG4gIGRlbGV0ZWRGb2xkZXJzOiB6LmFycmF5KERlbGV0ZWRGb2xkZXJTY2hlbWEpLmRlZmF1bHQoW10pLFxufSk7XG5leHBvcnQgdHlwZSBVbmRvU25hcHNob3QgPSB6LmluZmVyPHR5cGVvZiBVbmRvU25hcHNob3RTY2hlbWE+O1xuXG4vLyAtLS0tLS0tLS0tIOaooeWei+WTjeW6lCAtLS0tLS0tLS0tXG5cbi8qKiDmqKHlnovmjInmibnmrKHov5Tlm57nmoTlgJnpgInnm67lvZXjgIIgKi9cbmV4cG9ydCBjb25zdCBNb2RlbENhbmRpZGF0ZUJhdGNoU2NoZW1hID0gei5vYmplY3Qoe1xuICBjYW5kaWRhdGVzOiB6LmFycmF5KHouYXJyYXkoei5zdHJpbmcoKSkubWluKDEpLm1heCgyKSksXG59KTtcbmV4cG9ydCB0eXBlIE1vZGVsQ2FuZGlkYXRlQmF0Y2ggPSB6LmluZmVyPHR5cGVvZiBNb2RlbENhbmRpZGF0ZUJhdGNoU2NoZW1hPjtcblxuLyoqIOWQiOW5tuWQjueahOacgOe7iOebruW9leS9k+ezu+OAgiAqL1xuZXhwb3J0IGNvbnN0IE1vZGVsVGF4b25vbXlTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGNhdGVnb3JpZXM6IHouYXJyYXkoei5hcnJheSh6LnN0cmluZygpKS5taW4oMSkubWF4KDIpKSxcbn0pO1xuZXhwb3J0IHR5cGUgTW9kZWxUYXhvbm9teSA9IHouaW5mZXI8dHlwZW9mIE1vZGVsVGF4b25vbXlTY2hlbWE+O1xuXG4vKiog5YiG6YWN6Zi25q615qih5Z6L5Y+q6IO96L+U5Zue6L+Z5LiJ5Liq5a2X5q6177yM5LiN6IO96L+U5Zue5Lu75L2VIENocm9tZSDoioLngrkgSUTjgIIgKi9cbmV4cG9ydCBjb25zdCBNb2RlbEFzc2lnbm1lbnRCYXRjaFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgYXNzaWdubWVudHM6IHouYXJyYXkoXG4gICAgei5vYmplY3Qoe1xuICAgICAgYm9va21hcmtJZDogei5zdHJpbmcoKSxcbiAgICAgIHRhcmdldFBhdGg6IHouYXJyYXkoei5zdHJpbmcoKSkubWluKDEpLm1heCgyKSxcbiAgICAgIHJlYXNvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIH0pLFxuICApLFxufSk7XG5leHBvcnQgdHlwZSBNb2RlbEFzc2lnbm1lbnRCYXRjaCA9IHouaW5mZXI8dHlwZW9mIE1vZGVsQXNzaWdubWVudEJhdGNoU2NoZW1hPjtcblxuLyoqIOS/neWuiOaooeW8j+WPr+i/lOWbnueUqOaIt+W3suacieeahOa3seWxgui3r+W+hO+8jOmaj+WQjui/mOS8mumAkOadoeagoemqjOaYr+WQpuWRveS4reeZveWQjeWNleOAgiAqL1xuZXhwb3J0IGNvbnN0IE1vZGVsQ29uc2VydmF0aXZlQXNzaWdubWVudEJhdGNoU2NoZW1hID0gei5vYmplY3Qoe1xuICBhc3NpZ25tZW50czogei5hcnJheShcbiAgICB6Lm9iamVjdCh7XG4gICAgICBib29rbWFya0lkOiB6LnN0cmluZygpLFxuICAgICAgdGFyZ2V0UGF0aDogei5hcnJheSh6LnN0cmluZygpKS5taW4oMSkubWF4KDEwMCksXG4gICAgICByZWFzb246IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICB9KSxcbiAgKSxcbn0pO1xuIiwiaW1wb3J0IHR5cGUgeyBTdG9yYWdlUG9ydCB9IGZyb20gJy4uLy4uL2FwcGxpY2F0aW9uL3BvcnRzJztcbmltcG9ydCB7IEFwcEVycm9yIH0gZnJvbSAnLi4vLi4vc2hhcmVkL2Vycm9ycyc7XG5pbXBvcnQge1xuICBKb2JTdGF0ZVNjaGVtYSxcbiAgTW9kZWxTZXR0aW5nc1NjaGVtYSxcbiAgUGxhblJlY29yZFNjaGVtYSxcbiAgU2NhblJlc3VsdFNjaGVtYSxcbiAgU1RPUkFHRV9LRVlTLFxuICBTVE9SQUdFX1FVT1RBX0xJTUlUX0JZVEVTLFxuICBVbmRvU25hcHNob3RTY2hlbWEsXG4gIHR5cGUgSm9iU3RhdGUsXG4gIHR5cGUgTW9kZWxTZXR0aW5ncyxcbiAgdHlwZSBQbGFuUmVjb3JkLFxuICB0eXBlIFNjYW5SZXN1bHQsXG4gIHR5cGUgVW5kb1NuYXBzaG90LFxufSBmcm9tICcuLi8uLi9zaGFyZWQvc2NoZW1hcyc7XG5cbmltcG9ydCB0eXBlIHsgeiB9IGZyb20gJ3pvZCc7XG5cbi8qKlxuICogY2hyb21lLnN0b3JhZ2UubG9jYWwg6YCC6YWN5a6e546w44CCXG4gKiAtIOivu+WPluaXtue7jyBab2Qg5qCh6aqM77yM5o2f5Z2P5pWw5o2u6L+U5ZueIG51bGwg6ICM5LiN5piv5oqb5Ye677ybXG4gKiAtIOWGmeWFpeWJjeajgOafpeW3sueUqOepuumXtO+8jOaOpei/kemFjemineaXtuaLkue7neW5tuaPkOekuu+8iOaetuaehOaWueahiOesrCAxMCDoioLvvInjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVN0b3JhZ2VSZXBvc2l0b3J5KGFyZWE6IGNocm9tZS5zdG9yYWdlLlN0b3JhZ2VBcmVhKTogU3RvcmFnZVBvcnQge1xuICAvLyDms5vlnovnuqbmnZ/liLDlhbfkvZMgU2NoZW1hIOexu+Wei++8jOinhOmBvyBab2RUeXBlPE91dHB1dCwgSW5wdXQ+IOWcqCAuZGVmYXVsdCgpIOS4iueahOWPmOWei+mXrumimOOAglxuICBhc3luYyBmdW5jdGlvbiByZWFkPFMgZXh0ZW5kcyB6LlpvZFR5cGVBbnk+KGtleTogc3RyaW5nLCBzY2hlbWE6IFMpOiBQcm9taXNlPHouaW5mZXI8Uz4gfCBudWxsPiB7XG4gICAgY29uc3QgcmF3ID0gKGF3YWl0IGFyZWEuZ2V0KGtleSkpW2tleV07XG4gICAgaWYgKHJhdyA9PT0gdW5kZWZpbmVkIHx8IHJhdyA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcGFyc2VkID0gc2NoZW1hLnNhZmVQYXJzZShyYXcpO1xuICAgIHJldHVybiBwYXJzZWQuc3VjY2VzcyA/IHBhcnNlZC5kYXRhIDogbnVsbDtcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIHdyaXRlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHVzZWQgPSBhd2FpdCBhcmVhLmdldEJ5dGVzSW5Vc2UobnVsbCk7XG4gICAgaWYgKHVzZWQgPj0gU1RPUkFHRV9RVU9UQV9MSU1JVF9CWVRFUykge1xuICAgICAgdGhyb3cgbmV3IEFwcEVycm9yKCdzdG9yYWdlX3F1b3RhJywgJ2Vycm9ycy5zdG9yYWdlUXVvdGEnKTtcbiAgICB9XG4gICAgYXdhaXQgYXJlYS5zZXQoeyBba2V5XTogdmFsdWUgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGxvYWRNb2RlbFNldHRpbmdzOiAoKSA9PiByZWFkKFNUT1JBR0VfS0VZUy5tb2RlbFNldHRpbmdzLCBNb2RlbFNldHRpbmdzU2NoZW1hKSxcbiAgICBzYXZlTW9kZWxTZXR0aW5nczogKHNldHRpbmdzOiBNb2RlbFNldHRpbmdzKSA9PlxuICAgICAgd3JpdGUoU1RPUkFHRV9LRVlTLm1vZGVsU2V0dGluZ3MsIE1vZGVsU2V0dGluZ3NTY2hlbWEucGFyc2Uoc2V0dGluZ3MpKSxcblxuICAgIGxvYWRKb2I6ICgpID0+IHJlYWQoU1RPUkFHRV9LRVlTLmpvYiwgSm9iU3RhdGVTY2hlbWEpLFxuICAgIHNhdmVKb2I6IChqb2I6IEpvYlN0YXRlKSA9PiB3cml0ZShTVE9SQUdFX0tFWVMuam9iLCBKb2JTdGF0ZVNjaGVtYS5wYXJzZShqb2IpKSxcblxuICAgIGxvYWRTY2FuOiAoKSA9PiByZWFkKFNUT1JBR0VfS0VZUy5zY2FuLCBTY2FuUmVzdWx0U2NoZW1hKSxcbiAgICBzYXZlU2NhbjogKHNjYW46IFNjYW5SZXN1bHQpID0+IHdyaXRlKFNUT1JBR0VfS0VZUy5zY2FuLCBTY2FuUmVzdWx0U2NoZW1hLnBhcnNlKHNjYW4pKSxcblxuICAgIGxvYWRQbGFuOiAoKSA9PiByZWFkKFNUT1JBR0VfS0VZUy5wbGFuLCBQbGFuUmVjb3JkU2NoZW1hKSxcbiAgICBzYXZlUGxhbjogKHBsYW46IFBsYW5SZWNvcmQpID0+IHdyaXRlKFNUT1JBR0VfS0VZUy5wbGFuLCBQbGFuUmVjb3JkU2NoZW1hLnBhcnNlKHBsYW4pKSxcblxuICAgIGxvYWRVbmRvOiAoKSA9PiByZWFkKFNUT1JBR0VfS0VZUy51bmRvLCBVbmRvU25hcHNob3RTY2hlbWEpLFxuICAgIHNhdmVVbmRvOiAoc25hcHNob3Q6IFVuZG9TbmFwc2hvdCkgPT5cbiAgICAgIHdyaXRlKFNUT1JBR0VfS0VZUy51bmRvLCBVbmRvU25hcHNob3RTY2hlbWEucGFyc2Uoc25hcHNob3QpKSxcblxuICAgIGFzeW5jIGNsZWFyKGtleXMpIHtcbiAgICAgIGNvbnN0IHN0b3JhZ2VLZXlzID0ga2V5cy5tYXAoKGspID0+IFNUT1JBR0VfS0VZU1trXSk7XG4gICAgICBhd2FpdCBhcmVhLnJlbW92ZShzdG9yYWdlS2V5cyk7XG4gICAgfSxcbiAgfTtcbn1cblxuLyoqIOaJqeWxleWQr+WKqOaXtuiwg+eUqO+8mumZkOWItiBzdG9yYWdlLmxvY2FsIOS7heWPr+S/oeS4iuS4i+aWh+WPr+iuv+mXruOAgiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGVuZm9yY2VUcnVzdGVkQ29udGV4dHMoKTogUHJvbWlzZTx2b2lkPiB7XG4gIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldEFjY2Vzc0xldmVsKHsgYWNjZXNzTGV2ZWw6ICdUUlVTVEVEX0NPTlRFWFRTJyB9KTtcbn1cbiIsImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHtcbiAgSm9iU3RhdGVTY2hlbWEsXG4gIFNjYW5SZXN1bHRTY2hlbWEsXG4gIEZhaWx1cmVJdGVtU2NoZW1hLFxuICBKT0JfU1RBVFVTRVMsXG59IGZyb20gJy4vc2NoZW1hcyc7XG5cbi8qKlxuICogRGFzaGJvYXJkIOS4jiBTZXJ2aWNlIFdvcmtlciDkuYvpl7TnmoTnsbvlnovljJbljY/orq7jgIJcbiAqIOaJgOaciea2iOaBr+mDveW/hemhu+mAmui/hyBab2Qg5qCh6aqM77yM5pyq55+l5ZG95Luk55u05o6l5ouS57ud77yI6KeB5p625p6E5pa55qGI56ysIDEx44CBMTIg6IqC77yJ44CCXG4gKi9cblxuLy8gLS0tLS0tLS0tLSDor7fmsYLvvIhEYXNoYm9hcmQg4oaSIFNlcnZpY2UgV29ya2Vy77yJIC0tLS0tLS0tLS1cblxuZXhwb3J0IGNvbnN0IEdldFN0YXR1c1JlcXVlc3RTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR5cGU6IHoubGl0ZXJhbCgnR0VUX1NUQVRVUycpLFxuICByZXF1ZXN0SWQ6IHouc3RyaW5nKCksXG59KTtcblxuZXhwb3J0IGNvbnN0IFNjYW5Cb29rbWFya3NSZXF1ZXN0U2NoZW1hID0gei5vYmplY3Qoe1xuICB0eXBlOiB6LmxpdGVyYWwoJ1NDQU5fQk9PS01BUktTJyksXG4gIHJlcXVlc3RJZDogei5zdHJpbmcoKSxcbiAgam9iSWQ6IHouc3RyaW5nKCksXG59KTtcblxuZXhwb3J0IGNvbnN0IEFwcGx5UGxhblJlcXVlc3RTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR5cGU6IHoubGl0ZXJhbCgnQVBQTFlfUExBTicpLFxuICByZXF1ZXN0SWQ6IHouc3RyaW5nKCksXG4gIGpvYklkOiB6LnN0cmluZygpLFxufSk7XG5cbmV4cG9ydCBjb25zdCBSZXRyeUZhaWxlZFJlcXVlc3RTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR5cGU6IHoubGl0ZXJhbCgnUkVUUllfRkFJTEVEJyksXG4gIHJlcXVlc3RJZDogei5zdHJpbmcoKSxcbiAgam9iSWQ6IHouc3RyaW5nKCksXG59KTtcblxuZXhwb3J0IGNvbnN0IFVuZG9MYXN0QXBwbHlSZXF1ZXN0U2NoZW1hID0gei5vYmplY3Qoe1xuICB0eXBlOiB6LmxpdGVyYWwoJ1VORE9fTEFTVF9BUFBMWScpLFxuICByZXF1ZXN0SWQ6IHouc3RyaW5nKCksXG4gIGpvYklkOiB6LnN0cmluZygpLFxufSk7XG5cbmV4cG9ydCBjb25zdCBDYW5jZWxKb2JSZXF1ZXN0U2NoZW1hID0gei5vYmplY3Qoe1xuICB0eXBlOiB6LmxpdGVyYWwoJ0NBTkNFTF9KT0InKSxcbiAgcmVxdWVzdElkOiB6LnN0cmluZygpLFxuICBqb2JJZDogei5zdHJpbmcoKSxcbn0pO1xuXG5leHBvcnQgY29uc3QgRGVsZXRlRHVwbGljYXRlQm9va21hcmtzUmVxdWVzdFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgdHlwZTogei5saXRlcmFsKCdERUxFVEVfRFVQTElDQVRFX0JPT0tNQVJLUycpLFxuICByZXF1ZXN0SWQ6IHouc3RyaW5nKCksXG4gIGJvb2ttYXJrSWRzOiB6LmFycmF5KHouc3RyaW5nKCkpLm1pbigxKSxcbn0pO1xuXG5leHBvcnQgY29uc3QgRGVsZXRlRW1wdHlGb2xkZXJzUmVxdWVzdFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgdHlwZTogei5saXRlcmFsKCdERUxFVEVfRU1QVFlfRk9MREVSUycpLFxuICByZXF1ZXN0SWQ6IHouc3RyaW5nKCksXG4gIGZvbGRlcklkczogei5hcnJheSh6LnN0cmluZygpKS5taW4oMSksXG59KTtcblxuZXhwb3J0IGNvbnN0IFJlcXVlc3RTY2hlbWEgPSB6LmRpc2NyaW1pbmF0ZWRVbmlvbigndHlwZScsIFtcbiAgR2V0U3RhdHVzUmVxdWVzdFNjaGVtYSxcbiAgU2NhbkJvb2ttYXJrc1JlcXVlc3RTY2hlbWEsXG4gIEFwcGx5UGxhblJlcXVlc3RTY2hlbWEsXG4gIFJldHJ5RmFpbGVkUmVxdWVzdFNjaGVtYSxcbiAgVW5kb0xhc3RBcHBseVJlcXVlc3RTY2hlbWEsXG4gIENhbmNlbEpvYlJlcXVlc3RTY2hlbWEsXG4gIERlbGV0ZUR1cGxpY2F0ZUJvb2ttYXJrc1JlcXVlc3RTY2hlbWEsXG4gIERlbGV0ZUVtcHR5Rm9sZGVyc1JlcXVlc3RTY2hlbWEsXG5dKTtcbmV4cG9ydCB0eXBlIFJlcXVlc3RNZXNzYWdlID0gei5pbmZlcjx0eXBlb2YgUmVxdWVzdFNjaGVtYT47XG5cbi8vIC0tLS0tLS0tLS0g5ZON5bqU77yIU2VydmljZSBXb3JrZXIg4oaSIERhc2hib2FyZO+8iSAtLS0tLS0tLS0tXG5cbmV4cG9ydCBjb25zdCBSZXNwb25zZVNjaGVtYSA9IHoudW5pb24oW1xuICB6Lm9iamVjdCh7IG9rOiB6LmxpdGVyYWwodHJ1ZSksIHJlcXVlc3RJZDogei5zdHJpbmcoKSwgcGF5bG9hZDogei51bmtub3duKCkgfSksXG4gIHoub2JqZWN0KHtcbiAgICBvazogei5saXRlcmFsKGZhbHNlKSxcbiAgICByZXF1ZXN0SWQ6IHouc3RyaW5nKCksXG4gICAgZXJyb3I6IEZhaWx1cmVJdGVtU2NoZW1hLFxuICB9KSxcbl0pO1xuZXhwb3J0IHR5cGUgUmVzcG9uc2VNZXNzYWdlID0gei5pbmZlcjx0eXBlb2YgUmVzcG9uc2VTY2hlbWE+O1xuXG4vLyAtLS0tLS0tLS0tIOS6i+S7tu+8iFNlcnZpY2UgV29ya2VyIOKGkiBEYXNoYm9hcmQg5bm/5pKt77yJIC0tLS0tLS0tLS1cblxuZXhwb3J0IGNvbnN0IEpvYlByb2dyZXNzRXZlbnRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR5cGU6IHoubGl0ZXJhbCgnSk9CX1BST0dSRVNTJyksXG4gIGpvYklkOiB6LnN0cmluZygpLFxuICBzdGF0dXM6IHouZW51bShKT0JfU1RBVFVTRVMpLFxuICBwcm9jZXNzZWQ6IHoubnVtYmVyKCksXG4gIHRvdGFsOiB6Lm51bWJlcigpLFxufSk7XG5cbmV4cG9ydCBjb25zdCBKb2JDb21wbGV0ZWRFdmVudFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgdHlwZTogei5saXRlcmFsKCdKT0JfQ09NUExFVEVEJyksXG4gIGpvYklkOiB6LnN0cmluZygpLFxuICBqb2I6IEpvYlN0YXRlU2NoZW1hLFxufSk7XG5cbmV4cG9ydCBjb25zdCBKb2JJbnRlcnJ1cHRlZEV2ZW50U2NoZW1hID0gei5vYmplY3Qoe1xuICB0eXBlOiB6LmxpdGVyYWwoJ0pPQl9JTlRFUlJVUFRFRCcpLFxuICBqb2JJZDogei5zdHJpbmcoKSxcbiAgam9iOiBKb2JTdGF0ZVNjaGVtYSxcbn0pO1xuXG5leHBvcnQgY29uc3QgSm9iRmFpbGVkRXZlbnRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR5cGU6IHoubGl0ZXJhbCgnSk9CX0ZBSUxFRCcpLFxuICBqb2JJZDogei5zdHJpbmcoKSxcbiAgam9iOiBKb2JTdGF0ZVNjaGVtYSxcbn0pO1xuXG5leHBvcnQgY29uc3QgRXZlbnRTY2hlbWEgPSB6LmRpc2NyaW1pbmF0ZWRVbmlvbigndHlwZScsIFtcbiAgSm9iUHJvZ3Jlc3NFdmVudFNjaGVtYSxcbiAgSm9iQ29tcGxldGVkRXZlbnRTY2hlbWEsXG4gIEpvYkludGVycnVwdGVkRXZlbnRTY2hlbWEsXG4gIEpvYkZhaWxlZEV2ZW50U2NoZW1hLFxuXSk7XG5leHBvcnQgdHlwZSBFdmVudE1lc3NhZ2UgPSB6LmluZmVyPHR5cGVvZiBFdmVudFNjaGVtYT47XG5cbi8qKlxuICog5qCh6aqM5YWl56uZ5raI5oGv77yb6Z2e5rOV5oiW5pyq55+l57G75Z6L6L+U5ZueIG51bGzvvIznlLHosIPnlKjmlrnnm7TmjqXmi5Lnu53jgIJcbiAqIOi/meaYr+i+ueeVjOagoemqjO+8jOa2iOaBr+adpeiHquWQjOS4gOaJqeWxleWGheeahOmhtemdou+8jOS9huS7jeaMieaetuaehOaWueahiOimgeaxguS4peagvOagoemqjOOAglxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VSZXF1ZXN0KHJhdzogdW5rbm93bik6IFJlcXVlc3RNZXNzYWdlIHwgbnVsbCB7XG4gIGNvbnN0IHJlc3VsdCA9IFJlcXVlc3RTY2hlbWEuc2FmZVBhcnNlKHJhdyk7XG4gIHJldHVybiByZXN1bHQuc3VjY2VzcyA/IHJlc3VsdC5kYXRhIDogbnVsbDtcbn1cblxuLyoqIEdFVF9TVEFUVVMg55qE5ZON5bqU6L296I2377ya5Lu75Yqh44CB5omr5o+P5ZKM5pKk6ZSA5Y+v55So5oCn44CCICovXG5leHBvcnQgaW50ZXJmYWNlIFN0YXR1c1BheWxvYWQge1xuICBqb2I6IEpvYlN0YXRlU2NoZW1hVHlwZTtcbiAgc2NhbjogU2NhblJlc3VsdFNjaGVtYVR5cGUgfCBudWxsO1xuICBoYXNVbmRvU25hcHNob3Q6IGJvb2xlYW47XG59XG50eXBlIEpvYlN0YXRlU2NoZW1hVHlwZSA9IHouaW5mZXI8dHlwZW9mIEpvYlN0YXRlU2NoZW1hPjtcbnR5cGUgU2NhblJlc3VsdFNjaGVtYVR5cGUgPSB6LmluZmVyPHR5cGVvZiBTY2FuUmVzdWx0U2NoZW1hPjtcbiIsImltcG9ydCB7IGRlZmluZUJhY2tncm91bmQgfSBmcm9tICd3eHQvdXRpbHMvZGVmaW5lLWJhY2tncm91bmQnO1xuaW1wb3J0IHsgc2NhbkJvb2ttYXJrcyB9IGZyb20gJ0Avc3JjL2FwcGxpY2F0aW9uL3NjYW5Cb29rbWFya3MnO1xuaW1wb3J0IHsgYXBwbHlQbGFuIH0gZnJvbSAnQC9zcmMvYXBwbGljYXRpb24vYXBwbHlQbGFuJztcbmltcG9ydCB7IHVuZG9MYXN0QXBwbHkgfSBmcm9tICdAL3NyYy9hcHBsaWNhdGlvbi91bmRvTGFzdEFwcGx5JztcbmltcG9ydCB7IHJlc3VtZUpvYiB9IGZyb20gJ0Avc3JjL2FwcGxpY2F0aW9uL3Jlc3VtZUpvYic7XG5pbXBvcnQgeyBkZWxldGVEdXBsaWNhdGVCb29rbWFya3MgfSBmcm9tICdAL3NyYy9hcHBsaWNhdGlvbi9kZWxldGVEdXBsaWNhdGVCb29rbWFya3MnO1xuaW1wb3J0IHsgZGVsZXRlRW1wdHlGb2xkZXJzIH0gZnJvbSAnQC9zcmMvYXBwbGljYXRpb24vZGVsZXRlRW1wdHlGb2xkZXJzJztcbmltcG9ydCB0eXBlIHsgRXZlbnRzUG9ydCwgU3RvcmFnZVBvcnQgfSBmcm9tICdAL3NyYy9hcHBsaWNhdGlvbi9wb3J0cyc7XG5pbXBvcnQgeyBjcmVhdGVCb29rbWFya3NSZXBvc2l0b3J5IH0gZnJvbSAnQC9zcmMvaW5mcmFzdHJ1Y3R1cmUvY2hyb21lL2Jvb2ttYXJrc1JlcG9zaXRvcnknO1xuaW1wb3J0IHtcbiAgY3JlYXRlU3RvcmFnZVJlcG9zaXRvcnksXG4gIGVuZm9yY2VUcnVzdGVkQ29udGV4dHMsXG59IGZyb20gJ0Avc3JjL2luZnJhc3RydWN0dXJlL2Nocm9tZS9zdG9yYWdlUmVwb3NpdG9yeSc7XG5pbXBvcnQgeyBjYW5UcmFuc2l0aW9uIH0gZnJvbSAnQC9zcmMvZG9tYWluL29yZ2FuaXplL3N0YXRlTWFjaGluZSc7XG5pbXBvcnQgeyBjbGFzc2lmeUVycm9yIH0gZnJvbSAnQC9zcmMvc2hhcmVkL2Vycm9ycyc7XG5pbXBvcnQgeyBwYXJzZVJlcXVlc3QsIHR5cGUgUmVxdWVzdE1lc3NhZ2UgfSBmcm9tICdAL3NyYy9zaGFyZWQvbWVzc2FnZXMnO1xuaW1wb3J0IHR5cGUgeyBKb2JTdGF0ZSB9IGZyb20gJ0Avc3JjL3NoYXJlZC9zY2hlbWFzJztcblxuY29uc3QgREFTSEJPQVJEX1VSTCA9IGNocm9tZS5ydW50aW1lLmdldFVSTCgnL2Rhc2hib2FyZC5odG1sJyk7XG5cbi8qKlxuICogU2VydmljZSBXb3JrZXLvvJrmiYDmnInkuabnrb7lhpnmk43kvZznmoTllK/kuIDlhaXlj6PvvIjmnrbmnoTmlrnmoYjnrKwgMy4yIOiKgu+8ieOAglxuICogLSDngrnlh7vmianlsZXlm77moIfml7bmiZPlvIDmiJblpI3nlKggRGFzaGJvYXJkIOagh+etvumhte+8m1xuICogLSDmtojmga/ot6/nlLHvvJrmiYDmnInlhaXnq5nmtojmga/nu48gWm9kIOagoemqjO+8jOacquefpeWRveS7pOebtOaOpeaLkue7ne+8m1xuICogLSDov5vluqYv57uT5p6c5LqL5Lu2IGZpcmUtYW5kLWZvcmdldCDlub/mkq3vvIxEYXNoYm9hcmQg5LiN5Zyo57q/5pe25b+955Wl5Y+R6YCB5aSx6LSl44CCXG4gKi9cblxuZnVuY3Rpb24gY3JlYXRlRXZlbnRzUG9ydCgpOiBFdmVudHNQb3J0IHtcbiAgY29uc3QgZmlyZUFuZEZvcmdldCA9IChtZXNzYWdlOiB1bmtub3duKTogdm9pZCA9PiB7XG4gICAgdm9pZCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZShtZXNzYWdlKS5jYXRjaCgoKSA9PiB7XG4gICAgICAvLyDmsqHmnInmjqXmlLbmlrnvvIhEYXNoYm9hcmQg5YWz6Zet77yJ5pe25b+955Wl44CCXG4gICAgfSk7XG4gIH07XG4gIHJldHVybiB7XG4gICAgcHJvZ3Jlc3M6IChqb2JJZCwgc3RhdHVzLCBwcm9jZXNzZWQsIHRvdGFsKSA9PlxuICAgICAgZmlyZUFuZEZvcmdldCh7IHR5cGU6ICdKT0JfUFJPR1JFU1MnLCBqb2JJZCwgc3RhdHVzLCBwcm9jZXNzZWQsIHRvdGFsIH0pLFxuICAgIGNvbXBsZXRlZDogKGpvYikgPT4gZmlyZUFuZEZvcmdldCh7IHR5cGU6ICdKT0JfQ09NUExFVEVEJywgam9iSWQ6IGpvYi5qb2JJZCwgam9iIH0pLFxuICAgIGludGVycnVwdGVkOiAoam9iKSA9PiBmaXJlQW5kRm9yZ2V0KHsgdHlwZTogJ0pPQl9JTlRFUlJVUFRFRCcsIGpvYklkOiBqb2Iuam9iSWQsIGpvYiB9KSxcbiAgICBmYWlsZWQ6IChqb2IpID0+IGZpcmVBbmRGb3JnZXQoeyB0eXBlOiAnSk9CX0ZBSUxFRCcsIGpvYklkOiBqb2Iuam9iSWQsIGpvYiB9KSxcbiAgfTtcbn1cblxuLyoqIOaJk+W8gOaIluWkjeeUqOWUr+S4gOeahOWFqOmhtSBEYXNoYm9hcmQg5qCH562+6aG177yI5omp5bGV5a+56Ieq5bex55qEIG9yaWdpbiDmnInorr/pl67mnYPvvIzml6DpnIAgdGFicyDmnYPpmZDvvInjgIIgKi9cbmFzeW5jIGZ1bmN0aW9uIG9wZW5EYXNoYm9hcmQoKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7IHVybDogYCR7REFTSEJPQVJEX1VSTH0qYCB9KTtcbiAgY29uc3QgZXhpc3RpbmcgPSB0YWJzWzBdO1xuICBpZiAoZXhpc3Rpbmc/LmlkICE9PSB1bmRlZmluZWQpIHtcbiAgICBhd2FpdCBjaHJvbWUudGFicy51cGRhdGUoZXhpc3RpbmcuaWQsIHsgYWN0aXZlOiB0cnVlIH0pO1xuICAgIGlmIChleGlzdGluZy53aW5kb3dJZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBhd2FpdCBjaHJvbWUud2luZG93cy51cGRhdGUoZXhpc3Rpbmcud2luZG93SWQsIHsgZm9jdXNlZDogdHJ1ZSB9KS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cbiAgYXdhaXQgY2hyb21lLnRhYnMuY3JlYXRlKHsgdXJsOiBEQVNIQk9BUkRfVVJMLCBhY3RpdmU6IHRydWUgfSk7XG59XG5cbi8qKiDmiavmj4/or7fmsYLnmoTku7vliqHop6PmnpDvvJrlj6/ku47lvZPliY3nirbmgIHnu6fnu63ml7blpI3nlKjvvIzlkKbliJnmjaLmlrDku7vliqHph43mlrDlvIDlp4vjgIIgKi9cbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVKb2JGb3JTY2FuKHN0b3JhZ2U6IFN0b3JhZ2VQb3J0LCBqb2JJZDogc3RyaW5nKTogUHJvbWlzZTxKb2JTdGF0ZT4ge1xuICBjb25zdCBleGlzdGluZyA9IGF3YWl0IHN0b3JhZ2UubG9hZEpvYigpO1xuICBpZiAoZXhpc3RpbmcgJiYgZXhpc3Rpbmcuam9iSWQgPT09IGpvYklkICYmIGNhblRyYW5zaXRpb24oZXhpc3Rpbmcuc3RhdHVzLCAnc2Nhbm5pbmcnKSkge1xuICAgIHJldHVybiBleGlzdGluZztcbiAgfVxuICByZXR1cm4ge1xuICAgIGpvYklkLFxuICAgIHN0YXR1czogJ2lkbGUnLFxuICAgIHVwZGF0ZWRBdDogRGF0ZS5ub3coKSxcbiAgICBhcHBseUN1cnNvcjogMCxcbiAgICBhcHBsaWVkSWRzOiBbXSxcbiAgICBjcmVhdGVkRm9sZGVySWRzOiBbXSxcbiAgICBjYW5jZWxSZXF1ZXN0ZWQ6IGZhbHNlLFxuICAgIGZhaWx1cmVzOiBbXSxcbiAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlU2NhbihzdG9yYWdlOiBTdG9yYWdlUG9ydCwgam9iSWQ6IHN0cmluZyk6IFByb21pc2U8dW5rbm93bj4ge1xuICBjb25zdCBqb2IgPSBhd2FpdCByZXNvbHZlSm9iRm9yU2NhbihzdG9yYWdlLCBqb2JJZCk7XG4gIGNvbnN0IHNjYW4gPSBhd2FpdCBzY2FuQm9va21hcmtzKFxuICAgIHsgYm9va21hcmtzOiBjcmVhdGVCb29rbWFya3NSZXBvc2l0b3J5KCksIHN0b3JhZ2UsIGV2ZW50czogY3JlYXRlRXZlbnRzUG9ydCgpIH0sXG4gICAgam9iLFxuICApO1xuICBjb25zdCBzYXZlZCA9IGF3YWl0IHN0b3JhZ2UubG9hZEpvYigpO1xuICByZXR1cm4geyBzY2FuLCBqb2I6IHNhdmVkID8/IGpvYiB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVBcHBseShzdG9yYWdlOiBTdG9yYWdlUG9ydCwgam9iSWQ6IHN0cmluZyk6IFByb21pc2U8dW5rbm93bj4ge1xuICBjb25zdCBqb2IgPSBhd2FpdCBzdG9yYWdlLmxvYWRKb2IoKTtcbiAgY29uc3Qgc2NhbiA9IGF3YWl0IHN0b3JhZ2UubG9hZFNjYW4oKTtcbiAgY29uc3QgcGxhbiA9IGF3YWl0IHN0b3JhZ2UubG9hZFBsYW4oKTtcbiAgaWYgKCFqb2IgfHwgam9iLmpvYklkICE9PSBqb2JJZCkge1xuICAgIHRocm93IG5ldyBFcnJvcign5Lu75Yqh5LiN5a2Y5Zyo5oiW5bey6L+H5pyf77yM6K+36YeN5paw5omr5o+PJyk7XG4gIH1cbiAgaWYgKCFzY2FuKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCfmsqHmnInlj6/nlKjnmoTmiavmj4/nu5PmnpzvvIzor7flhYjmiavmj48nKTtcbiAgfVxuICBpZiAoIXBsYW4gfHwgcGxhbi5qb2JJZCAhPT0gam9iLmpvYklkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCfmsqHmnInlj6/nlKjnmoTliIbnsbvmlrnmoYjvvIzor7flhYjnlJ/miJDmlrnmoYgnKTtcbiAgfVxuICBjb25zdCByZXN1bHQgPSBhd2FpdCBhcHBseVBsYW4oXG4gICAgeyBib29rbWFya3M6IGNyZWF0ZUJvb2ttYXJrc1JlcG9zaXRvcnkoKSwgc3RvcmFnZSwgZXZlbnRzOiBjcmVhdGVFdmVudHNQb3J0KCkgfSxcbiAgICBqb2IsXG4gICAgc2Nhbi5ib29rbWFya3MsXG4gICAgcGxhbi5hc3NpZ25tZW50cyxcbiAgICB7XG4gICAgICBjcmVhdGVNaXNzaW5nRm9sZGVyczogcGxhbi5tb2RlICE9PSAnY29uc2VydmF0aXZlJyxcbiAgICAgIGNsZWFudXBGb2xkZXJJZHM6IHBsYW4uc2VsZWN0ZWRGb2xkZXJJZHMsXG4gICAgfSxcbiAgKTtcbiAgcmV0dXJuIHsgam9iOiByZXN1bHQuam9iIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVVuZG8oc3RvcmFnZTogU3RvcmFnZVBvcnQsIGpvYklkOiBzdHJpbmcpOiBQcm9taXNlPHVua25vd24+IHtcbiAgY29uc3Qgam9iID0gYXdhaXQgc3RvcmFnZS5sb2FkSm9iKCk7XG4gIGlmICgham9iIHx8IGpvYi5qb2JJZCAhPT0gam9iSWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ+S7u+WKoeS4jeWtmOWcqOaIluW3sui/h+acnycpO1xuICB9XG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHVuZG9MYXN0QXBwbHkoXG4gICAgeyBib29rbWFya3M6IGNyZWF0ZUJvb2ttYXJrc1JlcG9zaXRvcnkoKSwgc3RvcmFnZSwgZXZlbnRzOiBjcmVhdGVFdmVudHNQb3J0KCkgfSxcbiAgICBqb2IsXG4gICk7XG4gIHJldHVybiB7IGpvYjogcmVzdWx0LmpvYiwgY29uZmxpY3RzOiByZXN1bHQuY29uZmxpY3RzIH07XG59XG5cbi8qKiDmoIforrDlj5bmtojvvJrlhpnlhaXmjIHkuYXljJbmoIflv5fvvIzlupTnlKgv5pKk6ZSA5b6q546v5Zyo5q+P5Liq5Lmm562+5LmL6Ze06YeN6K+75qOA5p+l44CCICovXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVDYW5jZWwoc3RvcmFnZTogU3RvcmFnZVBvcnQsIGpvYklkOiBzdHJpbmcpOiBQcm9taXNlPHVua25vd24+IHtcbiAgY29uc3Qgam9iID0gYXdhaXQgc3RvcmFnZS5sb2FkSm9iKCk7XG4gIGlmICgham9iIHx8IGpvYi5qb2JJZCAhPT0gam9iSWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ+S7u+WKoeS4jeWtmOWcqOaIluW3sui/h+acnycpO1xuICB9XG4gIGNvbnN0IGNhbmNlbGxlZDogSm9iU3RhdGUgPSB7IC4uLmpvYiwgY2FuY2VsUmVxdWVzdGVkOiB0cnVlLCB1cGRhdGVkQXQ6IERhdGUubm93KCkgfTtcbiAgYXdhaXQgc3RvcmFnZS5zYXZlSm9iKGNhbmNlbGxlZCk7XG4gIHJldHVybiB7IGpvYjogY2FuY2VsbGVkIH07XG59XG5cbi8qKiDlpLHotKXml7bmiorku7vliqHokL3kuLogZmFpbGVkIOeKtuaAgeW5tuW5v+aSre+8jOS/neivgSBEYXNoYm9hcmQg6YeN5byA5ZCO5Y+v5oGi5aSN44CCICovXG5hc3luYyBmdW5jdGlvbiBtYXJrRmFpbGVkKHN0b3JhZ2U6IFN0b3JhZ2VQb3J0LCBqb2JJZDogc3RyaW5nIHwgbnVsbCwgZXJyb3I6IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcbiAgaWYgKCFqb2JJZCkgcmV0dXJuO1xuICBjb25zdCBqb2IgPSBhd2FpdCBzdG9yYWdlLmxvYWRKb2IoKTtcbiAgaWYgKCFqb2IgfHwgam9iLmpvYklkICE9PSBqb2JJZCkgcmV0dXJuO1xuICBjb25zdCBjbGFzc2lmaWVkID0gY2xhc3NpZnlFcnJvcihlcnJvcik7XG4gIGNvbnN0IGZhaWxlZDogSm9iU3RhdGUgPSB7XG4gICAgLi4uam9iLFxuICAgIHN0YXR1czogJ2ZhaWxlZCcsXG4gICAgZXJyb3I6IHsga2luZDogY2xhc3NpZmllZC5raW5kLCBtZXNzYWdlOiBjbGFzc2lmaWVkLm1lc3NhZ2UgfSxcbiAgICB1cGRhdGVkQXQ6IERhdGUubm93KCksXG4gIH07XG4gIHRyeSB7XG4gICAgYXdhaXQgc3RvcmFnZS5zYXZlSm9iKGZhaWxlZCk7XG4gICAgY3JlYXRlRXZlbnRzUG9ydCgpLmZhaWxlZChmYWlsZWQpO1xuICB9IGNhdGNoIHtcbiAgICAvLyDnirbmgIHokL3nm5jlpLHotKXml7blj6rog73mlL7lvIPvvIzpgb/lhY3plJnor6/lvqrnjq/jgIJcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVCYWNrZ3JvdW5kKCgpID0+IHtcbiAgdm9pZCBlbmZvcmNlVHJ1c3RlZENvbnRleHRzKCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblxuICBjaHJvbWUuYWN0aW9uLm9uQ2xpY2tlZC5hZGRMaXN0ZW5lcigoKSA9PiB7XG4gICAgdm9pZCBvcGVuRGFzaGJvYXJkKCk7XG4gIH0pO1xuXG4gIGNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigocmF3OiB1bmtub3duLCBfc2VuZGVyLCBzZW5kUmVzcG9uc2UpID0+IHtcbiAgICBjb25zdCByZXF1ZXN0OiBSZXF1ZXN0TWVzc2FnZSB8IG51bGwgPSBwYXJzZVJlcXVlc3QocmF3KTtcbiAgICBpZiAoIXJlcXVlc3QpIHtcbiAgICAgIHNlbmRSZXNwb25zZSh7XG4gICAgICAgIG9rOiBmYWxzZSxcbiAgICAgICAgcmVxdWVzdElkOiB0eXBlb2YgKHJhdyBhcyB7IHJlcXVlc3RJZD86IHVua25vd24gfSk/LnJlcXVlc3RJZCA9PT0gJ3N0cmluZydcbiAgICAgICAgICA/IChyYXcgYXMgeyByZXF1ZXN0SWQ6IHN0cmluZyB9KS5yZXF1ZXN0SWRcbiAgICAgICAgICA6ICcnLFxuICAgICAgICBlcnJvcjogeyBraW5kOiAndmFsaWRhdGlvbicsIG1lc3NhZ2U6ICfmnKrnn6XmiJbpnZ7ms5XnmoTlkb3ku6QnIH0sXG4gICAgICB9KTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBzdG9yYWdlID0gY3JlYXRlU3RvcmFnZVJlcG9zaXRvcnkoY2hyb21lLnN0b3JhZ2UubG9jYWwpO1xuICAgIGNvbnN0IHJlcXVlc3RJZCA9IHJlcXVlc3QucmVxdWVzdElkO1xuICAgIGNvbnN0IGpvYklkID0gJ2pvYklkJyBpbiByZXF1ZXN0ID8gcmVxdWVzdC5qb2JJZCA6IG51bGw7XG5cbiAgICB2b2lkIChhc3luYyAoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBsZXQgcGF5bG9hZDogdW5rbm93bjtcbiAgICAgICAgc3dpdGNoIChyZXF1ZXN0LnR5cGUpIHtcbiAgICAgICAgICBjYXNlICdHRVRfU1RBVFVTJzpcbiAgICAgICAgICAgIHBheWxvYWQgPSBhd2FpdCByZXN1bWVKb2IoeyBzdG9yYWdlIH0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnU0NBTl9CT09LTUFSS1MnOlxuICAgICAgICAgICAgcGF5bG9hZCA9IGF3YWl0IGhhbmRsZVNjYW4oc3RvcmFnZSwgcmVxdWVzdC5qb2JJZCk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdBUFBMWV9QTEFOJzpcbiAgICAgICAgICBjYXNlICdSRVRSWV9GQUlMRUQnOlxuICAgICAgICAgICAgcGF5bG9hZCA9IGF3YWl0IGhhbmRsZUFwcGx5KHN0b3JhZ2UsIHJlcXVlc3Quam9iSWQpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnVU5ET19MQVNUX0FQUExZJzpcbiAgICAgICAgICAgIHBheWxvYWQgPSBhd2FpdCBoYW5kbGVVbmRvKHN0b3JhZ2UsIHJlcXVlc3Quam9iSWQpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnQ0FOQ0VMX0pPQic6XG4gICAgICAgICAgICBwYXlsb2FkID0gYXdhaXQgaGFuZGxlQ2FuY2VsKHN0b3JhZ2UsIHJlcXVlc3Quam9iSWQpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnREVMRVRFX0RVUExJQ0FURV9CT09LTUFSS1MnOlxuICAgICAgICAgICAgcGF5bG9hZCA9IGF3YWl0IGRlbGV0ZUR1cGxpY2F0ZUJvb2ttYXJrcyhcbiAgICAgICAgICAgICAgeyBib29rbWFya3M6IGNyZWF0ZUJvb2ttYXJrc1JlcG9zaXRvcnkoKSwgc3RvcmFnZSB9LFxuICAgICAgICAgICAgICByZXF1ZXN0LmJvb2ttYXJrSWRzLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ0RFTEVURV9FTVBUWV9GT0xERVJTJzpcbiAgICAgICAgICAgIHBheWxvYWQgPSBhd2FpdCBkZWxldGVFbXB0eUZvbGRlcnMoXG4gICAgICAgICAgICAgIHsgYm9va21hcmtzOiBjcmVhdGVCb29rbWFya3NSZXBvc2l0b3J5KCksIHN0b3JhZ2UgfSxcbiAgICAgICAgICAgICAgcmVxdWVzdC5mb2xkZXJJZHMsXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IHRydWUsIHJlcXVlc3RJZCwgcGF5bG9hZCB9KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGF3YWl0IG1hcmtGYWlsZWQoc3RvcmFnZSwgam9iSWQsIGVycm9yKTtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgb2s6IGZhbHNlLCByZXF1ZXN0SWQsIGVycm9yOiBjbGFzc2lmeUVycm9yKGVycm9yKSB9KTtcbiAgICAgIH1cbiAgICB9KSgpO1xuXG4gICAgLy8g5byC5q2l5ZON5bqU77ya5L+d5oyB5raI5oGv6YCa6YGT5byA5pS+44CCXG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xufSk7XG4iLCIvLyAjcmVnaW9uIHNuaXBwZXRcbmV4cG9ydCBjb25zdCBicm93c2VyID0gZ2xvYmFsVGhpcy5icm93c2VyPy5ydW50aW1lPy5pZFxuICA/IGdsb2JhbFRoaXMuYnJvd3NlclxuICA6IGdsb2JhbFRoaXMuY2hyb21lO1xuLy8gI2VuZHJlZ2lvbiBzbmlwcGV0XG4iLCJpbXBvcnQgeyBicm93c2VyIGFzIGJyb3dzZXIkMSB9IGZyb20gXCJAd3h0LWRldi9icm93c2VyXCI7XG4vLyNyZWdpb24gc3JjL2Jyb3dzZXIudHNcbi8qKlxuKiBDb250YWlucyB0aGUgYGJyb3dzZXJgIGV4cG9ydCB3aGljaCB5b3Ugc2hvdWxkIHVzZSB0byBhY2Nlc3MgdGhlIGV4dGVuc2lvblxuKiBBUElzIGluIHlvdXIgcHJvamVjdDpcbipcbiogYGBgdHNcbiogaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gJ3d4dC9icm93c2VyJztcbipcbiogYnJvd3Nlci5ydW50aW1lLm9uSW5zdGFsbGVkLmFkZExpc3RlbmVyKCgpID0+IHtcbiogICAvLyAuLi5cbiogfSk7XG4qIGBgYFxuKlxuKiBAbW9kdWxlIHd4dC9icm93c2VyXG4qL1xuY29uc3QgYnJvd3NlciA9IGJyb3dzZXIkMTtcbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgYnJvd3NlciB9O1xuIiwiLy8jcmVnaW9uIHNyYy9pbmRleC50c1xuLyoqXG4qIENsYXNzIGZvciBwYXJzaW5nIGFuZCBwZXJmb3JtaW5nIG9wZXJhdGlvbnMgb24gbWF0Y2ggcGF0dGVybnMuXG4qXG4qIEBleGFtcGxlXG4qICAgY29uc3QgcGF0dGVybiA9IG5ldyBNYXRjaFBhdHRlcm4oJyo6Ly9nb29nbGUuY29tLyonKTtcbipcbiogICBwYXR0ZXJuLmluY2x1ZGVzKCdodHRwczovL2dvb2dsZS5jb20nKTsgLy8gdHJ1ZVxuKiAgIHBhdHRlcm4uaW5jbHVkZXMoJ2h0dHA6Ly95b3V0dWJlLmNvbS93YXRjaD92PTEyMycpOyAvLyBmYWxzZVxuKi9cbnZhciBNYXRjaFBhdHRlcm4gPSBjbGFzcyBNYXRjaFBhdHRlcm4ge1xuXHRzdGF0aWMge1xuXHRcdHRoaXMuUFJPVE9DT0xTID0gW1xuXHRcdFx0XCJodHRwXCIsXG5cdFx0XHRcImh0dHBzXCIsXG5cdFx0XHRcImZpbGVcIixcblx0XHRcdFwiZnRwXCIsXG5cdFx0XHRcInVyblwiLFxuXHRcdFx0XCJ3c1wiLFxuXHRcdFx0XCJ3c3NcIlxuXHRcdF07XG5cdH1cblx0LyoqXG5cdCogUGFyc2UgYSBtYXRjaCBwYXR0ZXJuIHN0cmluZy4gSWYgaXQgaXMgaW52YWxpZCwgdGhlIGNvbnN0cnVjdG9yIHdpbGwgdGhyb3cgYW5cblx0KiBgSW52YWxpZE1hdGNoUGF0dGVybmAgZXJyb3IuXG5cdCpcblx0KiBAcGFyYW0gbWF0Y2hQYXR0ZXJuIFRoZSBtYXRjaCBwYXR0ZXJuIHRvIHBhcnNlLlxuXHQqL1xuXHRjb25zdHJ1Y3RvcihtYXRjaFBhdHRlcm4pIHtcblx0XHRpZiAobWF0Y2hQYXR0ZXJuID09PSBcIjxhbGxfdXJscz5cIikge1xuXHRcdFx0dGhpcy5pc0FsbFVybHMgPSB0cnVlO1xuXHRcdFx0dGhpcy5wcm90b2NvbE1hdGNoZXMgPSBbLi4uTWF0Y2hQYXR0ZXJuLlBST1RPQ09MU107XG5cdFx0XHR0aGlzLmhvc3RuYW1lTWF0Y2ggPSBcIipcIjtcblx0XHRcdHRoaXMucGF0aG5hbWVNYXRjaCA9IFwiKlwiO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBncm91cHMgPSAvKC4qKTpcXC9cXC8oLio/KShcXC8uKikvLmV4ZWMobWF0Y2hQYXR0ZXJuKTtcblx0XHRcdGlmIChncm91cHMgPT0gbnVsbCkgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4obWF0Y2hQYXR0ZXJuLCBcIkluY29ycmVjdCBmb3JtYXRcIik7XG5cdFx0XHRjb25zdCBbXywgcHJvdG9jb2wsIGhvc3RuYW1lLCBwYXRobmFtZV0gPSBncm91cHM7XG5cdFx0XHR2YWxpZGF0ZVByb3RvY29sKG1hdGNoUGF0dGVybiwgcHJvdG9jb2wpO1xuXHRcdFx0dmFsaWRhdGVIb3N0bmFtZShtYXRjaFBhdHRlcm4sIGhvc3RuYW1lKTtcblx0XHRcdHRoaXMucHJvdG9jb2xNYXRjaGVzID0gcHJvdG9jb2wgPT09IFwiKlwiID8gW1wiaHR0cFwiLCBcImh0dHBzXCJdIDogW3Byb3RvY29sXTtcblx0XHRcdHRoaXMuaG9zdG5hbWVNYXRjaCA9IGhvc3RuYW1lO1xuXHRcdFx0dGhpcy5wYXRobmFtZU1hdGNoID0gcGF0aG5hbWU7XG5cdFx0fVxuXHR9XG5cdC8qKiBDaGVjayBpZiBhIFVSTCBpcyBpbmNsdWRlZCBpbiBhIHBhdHRlcm4uICovXG5cdGluY2x1ZGVzKHVybCkge1xuXHRcdGNvbnN0IHUgPSB0eXBlb2YgdXJsID09PSBcInN0cmluZ1wiID8gbmV3IFVSTCh1cmwpIDogdXJsIGluc3RhbmNlb2YgTG9jYXRpb24gPyBuZXcgVVJMKHVybC5ocmVmKSA6IHVybDtcblx0XHRpZiAodGhpcy5pc0FsbFVybHMpIHJldHVybiAhdGhpcy5pc1Vua25vd25Qcm90b2NvbCh1KTtcblx0XHRyZXR1cm4gISF0aGlzLnByb3RvY29sTWF0Y2hlcy5maW5kKChwcm90b2NvbCkgPT4ge1xuXHRcdFx0aWYgKHByb3RvY29sID09PSBcImh0dHBcIikgcmV0dXJuIHRoaXMuaXNIdHRwTWF0Y2godSk7XG5cdFx0XHRpZiAocHJvdG9jb2wgPT09IFwiaHR0cHNcIikgcmV0dXJuIHRoaXMuaXNIdHRwc01hdGNoKHUpO1xuXHRcdFx0aWYgKHByb3RvY29sID09PSBcImZpbGVcIikgcmV0dXJuIHRoaXMuaXNGaWxlTWF0Y2godSk7XG5cdFx0XHRpZiAocHJvdG9jb2wgPT09IFwiZnRwXCIpIHJldHVybiB0aGlzLmlzRnRwTWF0Y2godSk7XG5cdFx0XHRpZiAocHJvdG9jb2wgPT09IFwidXJuXCIpIHJldHVybiB0aGlzLmlzVXJuTWF0Y2godSk7XG5cdFx0fSk7XG5cdH1cblx0aXNIdHRwTWF0Y2godXJsKSB7XG5cdFx0cmV0dXJuIHVybC5wcm90b2NvbCA9PT0gXCJodHRwOlwiICYmIHRoaXMuaXNIb3N0UGF0aE1hdGNoKHVybCk7XG5cdH1cblx0aXNIdHRwc01hdGNoKHVybCkge1xuXHRcdHJldHVybiB1cmwucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgJiYgdGhpcy5pc0hvc3RQYXRoTWF0Y2godXJsKTtcblx0fVxuXHRpc0hvc3RQYXRoTWF0Y2godXJsKSB7XG5cdFx0aWYgKCF0aGlzLmhvc3RuYW1lTWF0Y2ggfHwgIXRoaXMucGF0aG5hbWVNYXRjaCkgcmV0dXJuIGZhbHNlO1xuXHRcdGNvbnN0IGhvc3RuYW1lTWF0Y2hSZWdleHMgPSBbdGhpcy5jb252ZXJ0UGF0dGVyblRvUmVnZXgodGhpcy5ob3N0bmFtZU1hdGNoKSwgdGhpcy5jb252ZXJ0UGF0dGVyblRvUmVnZXgodGhpcy5ob3N0bmFtZU1hdGNoLnJlcGxhY2UoL15cXCpcXC4vLCBcIlwiKSldO1xuXHRcdGNvbnN0IHBhdGhuYW1lTWF0Y2hSZWdleCA9IHRoaXMuY29udmVydFBhdHRlcm5Ub1JlZ2V4KHRoaXMucGF0aG5hbWVNYXRjaCk7XG5cdFx0cmV0dXJuICEhaG9zdG5hbWVNYXRjaFJlZ2V4cy5maW5kKChyZWdleCkgPT4gcmVnZXgudGVzdCh1cmwuaG9zdG5hbWUpKSAmJiBwYXRobmFtZU1hdGNoUmVnZXgudGVzdCh1cmwucGF0aG5hbWUpO1xuXHR9XG5cdGlzVW5rbm93blByb3RvY29sKHVybCkge1xuXHRcdHJldHVybiAhdGhpcy5wcm90b2NvbE1hdGNoZXMuaW5jbHVkZXModXJsLnByb3RvY29sLnNsaWNlKDAsIC0xKSk7XG5cdH1cblx0aXNQYXRoTWF0Y2godXJsKSB7XG5cdFx0aWYgKCF0aGlzLnBhdGhuYW1lTWF0Y2gpIHJldHVybiBmYWxzZTtcblx0XHRyZXR1cm4gdGhpcy5jb252ZXJ0UGF0dGVyblRvUmVnZXgodGhpcy5wYXRobmFtZU1hdGNoKS50ZXN0KHVybC5wYXRobmFtZSk7XG5cdH1cblx0aXNGaWxlTWF0Y2godXJsKSB7XG5cdFx0cmV0dXJuIHVybC5wcm90b2NvbCA9PT0gXCJmaWxlOlwiICYmIHRoaXMuaXNQYXRoTWF0Y2godXJsKTtcblx0fVxuXHRpc0Z0cE1hdGNoKF91cmwpIHtcblx0XHR0aHJvdyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZDogZnRwOi8vIHBhdHRlcm4gbWF0Y2hpbmcuIE9wZW4gYSBQUiB0byBhZGQgc3VwcG9ydFwiKTtcblx0fVxuXHRpc1Vybk1hdGNoKF91cmwpIHtcblx0XHR0aHJvdyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZDogdXJuOi8vIHBhdHRlcm4gbWF0Y2hpbmcuIE9wZW4gYSBQUiB0byBhZGQgc3VwcG9ydFwiKTtcblx0fVxuXHRjb252ZXJ0UGF0dGVyblRvUmVnZXgocGF0dGVybikge1xuXHRcdGNvbnN0IHN0YXJzUmVwbGFjZWQgPSB0aGlzLmVzY2FwZUZvclJlZ2V4KHBhdHRlcm4pLnJlcGxhY2UoL1xcXFxcXCovZywgXCIuKlwiKTtcblx0XHRyZXR1cm4gUmVnRXhwKGBeJHtzdGFyc1JlcGxhY2VkfSRgKTtcblx0fVxuXHRlc2NhcGVGb3JSZWdleChzdHJpbmcpIHtcblx0XHRyZXR1cm4gc3RyaW5nLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCBcIlxcXFwkJlwiKTtcblx0fVxufTtcbnZhciBJbnZhbGlkTWF0Y2hQYXR0ZXJuID0gY2xhc3MgZXh0ZW5kcyBFcnJvciB7XG5cdGNvbnN0cnVjdG9yKG1hdGNoUGF0dGVybiwgcmVhc29uKSB7XG5cdFx0c3VwZXIoYEludmFsaWQgbWF0Y2ggcGF0dGVybiBcIiR7bWF0Y2hQYXR0ZXJufVwiOiAke3JlYXNvbn1gKTtcblx0fVxufTtcbmZ1bmN0aW9uIHZhbGlkYXRlUHJvdG9jb2wobWF0Y2hQYXR0ZXJuLCBwcm90b2NvbCkge1xuXHRpZiAoIU1hdGNoUGF0dGVybi5QUk9UT0NPTFMuaW5jbHVkZXMocHJvdG9jb2wpICYmIHByb3RvY29sICE9PSBcIipcIikgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4obWF0Y2hQYXR0ZXJuLCBgJHtwcm90b2NvbH0gbm90IGEgdmFsaWQgcHJvdG9jb2wgKCR7TWF0Y2hQYXR0ZXJuLlBST1RPQ09MUy5qb2luKFwiLCBcIil9KWApO1xufVxuZnVuY3Rpb24gdmFsaWRhdGVIb3N0bmFtZShtYXRjaFBhdHRlcm4sIGhvc3RuYW1lKSB7XG5cdGlmIChob3N0bmFtZS5pbmNsdWRlcyhcIjpcIikpIHRocm93IG5ldyBJbnZhbGlkTWF0Y2hQYXR0ZXJuKG1hdGNoUGF0dGVybiwgYEhvc3RuYW1lIGNhbm5vdCBpbmNsdWRlIGEgcG9ydGApO1xuXHRpZiAoaG9zdG5hbWUuaW5jbHVkZXMoXCIqXCIpICYmIGhvc3RuYW1lLmxlbmd0aCA+IDEgJiYgIWhvc3RuYW1lLnN0YXJ0c1dpdGgoXCIqLlwiKSkgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4obWF0Y2hQYXR0ZXJuLCBgSWYgdXNpbmcgYSB3aWxkY2FyZCAoKiksIGl0IG11c3QgZ28gYXQgdGhlIHN0YXJ0IG9mIHRoZSBob3N0bmFtZWApO1xufVxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBJbnZhbGlkTWF0Y2hQYXR0ZXJuLCBNYXRjaFBhdHRlcm4gfTtcbiJdLCJ4X2dvb2dsZV9pZ25vcmVMaXN0IjpbMCwxOCwxOSwyMCwyMSwyMiwyMywyNCwyOSwzMCwzMV0sIm1hcHBpbmdzIjoiOztDQUNBLFNBQVMsaUJBQWlCLEtBQUs7RUFDOUIsSUFBSSxPQUFPLFFBQVEsT0FBTyxRQUFRLFlBQVksT0FBTyxFQUFFLE1BQU0sSUFBSTtFQUNqRSxPQUFPO0NBQ1I7OztDQ2FBLFNBQWdCLFNBQVMsTUFBNkI7RUFDcEQsT0FBTyxLQUFLLFFBQVEsS0FBQTtDQUN0QjtDQUVBLFNBQWdCLGVBQWUsTUFBNkI7RUFDMUQsT0FBTyxLQUFLLGlCQUFpQixLQUFBLEtBQWEsS0FBSyxpQkFBaUI7Q0FDbEU7Ozs7Ozs7O0NDZEEsU0FBZ0IsY0FBYyxNQUFzQztFQUNsRSxJQUFJLEtBQUssV0FBVyxLQUFLLEtBQUssRUFBRSxFQUFFLFVBQVUsUUFBUTtHQUNsRCxNQUFNLE1BQU0sS0FBSztHQUNq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QUFDLEtBQUssS0FBSyxPQUFPLE1BQU0sT0FBTyxHQUFHLFNBQVMsTUFBTTtFQUM3RDtFQUNBLElBQUksYUFBYTtHQUNiLE9BQU8sQ0FBQyxDQUFDLEtBQUssS0FBSyxPQUFPLE1BQU0sT0FBTyxHQUFHLFNBQVMsVUFBVTtFQUNqRTtFQUNBLElBQUksVUFBVTtHQUNWLE9BQU8sQ0FBQyxDQUFDLEtBQUssS0FBSyxPQUFPLE1BQU0sT0FBTyxHQUFHLFNBQVMsT0FBTztFQUM5RDtFQUNBLElBQUksUUFBUTtHQUNSLE9BQU8sQ0FBQyxDQUFDLEtBQUssS0FBSyxPQUFPLE1BQU0sT0FBTyxHQUFHLFNBQVMsS0FBSztFQUM1RDtFQUNBLElBQUksVUFBVTtHQUNWLE9BQU8sQ0FBQyxDQUFDLEtBQUssS0FBSyxPQUFPLE1BQU0sT0FBTyxHQUFHLFNBQVMsT0FBTztFQUM5RDtFQUNBLElBQUksU0FBUztHQUNULE9BQU8sQ0FBQyxDQUFDLEtBQUssS0FBSyxPQUFPLE1BQU0sT0FBTyxHQUFHLFNBQVMsTUFBTTtFQUM3RDtFQUNBLElBQUksV0FBVztHQUNYLE9BQU8sQ0FBQyxDQUFDLEtBQUssS0FBSyxPQUFPLE1BQU0sT0FBTyxHQUFHLFNBQVMsUUFBUTtFQUMvRDtFQUNBLElBQUksU0FBUztHQUNULE9BQU8sQ0FBQyxDQUFDLEtBQUssS0FBSyxPQUFPLE1BQU0sT0FBTyxHQUFHLFNBQVMsTUFBTTtFQUM3RDtFQUNBLElBQUksVUFBVTtHQUNWLE9BQU8sQ0FBQyxDQUFDLEtBQUssS0FBSyxPQUFPLE1BQU0sT0FBTyxHQUFHLFNBQVMsT0FBTztFQUM5RDtFQUNBLElBQUksU0FBUztHQUNULE9BQU8sQ0FBQyxDQUFDLEtBQUssS0FBSyxPQUFPLE1BQU0sT0FBTyxHQUFHLFNBQVMsTUFBTTtFQUM3RDtFQUNBLElBQUksT0FBTztHQUNQLE9BQU8sQ0FBQyxDQUFDLEtBQUssS0FBSyxPQUFPLE1BQU0sT0FBTyxHQUFHLFNBQVMsSUFBSTtFQUMzRDtFQUNBLElBQUksU0FBUztHQUNULE9BQU8sQ0FBQyxDQUFDLEtBQUss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