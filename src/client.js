window.__ModuleLoader__.load({
	id: '@hanxu131/dsh-notice',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

		var React = require('react');
		var primitives = require('@deepseek-ai/dsh-client-ui-primitives');

		/**
		 * Browser half of `@hanxu131/dsh-notice`.
		 *
		 * Delivery must happen here, in the renderer, because macOS attributes a
		 * notification to the bundle that sends it and only this process can send
		 * with DeepSeek Harness's identity (see docs/adr/0001-notification-channel.md).
		 * This file is a handwritten classic script: no bundler, no JSX, and only
		 * baseline browser modules may be required (see docs/adr/0002).
		 */

		/** Locale namespace owned by this plugin. */
		var NS = 'notice';
		/** Profile row id; the settings page and config form are keyed by it. */
		var ENTRY_ID = 'notice';
		/** Title used when the session title is hidden or not projected yet. */
		var APP_NAME = 'DeepSeek Harness';
		/** Maximum characters of an optional non-redacted detail line. */
		var DETAIL_LIMIT = 80;
		/** Maximum characters of an error headline. */
		var HEADLINE_LIMIT = 120;
		/** Upper bound on live notification objects kept strongly referenced. */
		var MAX_LIVE_NOTIFICATIONS = 50;

		//#region locales
		/** Simplified Chinese copy: the source of truth for the key set. */
		var zh = {
			'app.name': 'DeepSeek Harness',
			'body.complete': '已完成',
			'body.completeWithDuration': '已完成 · {duration}',
			'body.questionOne': '等待你回答 1 个问题',
			'body.questionMany': '等待你回答 {count} 个问题',
			'body.approval': '请求权限：{tool}',
			'body.error': '运行失败：{reason}',
			'body.errorUnknown': '未知错误',
			'duration.underSecond': '不到 1 秒',
			'duration.seconds': '{n} 秒',
			'duration.minutesSeconds': '{m} 分 {s} 秒',
			'duration.hoursMinutes': '{h} 小时 {m} 分',
			'settings.title': '系统通知',
			'settings.description': 'agent 完成、提问、请求权限或出错时发送 macOS 系统通知。',
			'settings.summaryOn': '4 类通知已开启',
			'settings.summaryPartial': '{count} 类通知已开启',
			'settings.summaryOff': '所有通知已关闭',
			'settings.groupTriggers': '触发事件',
			'settings.notifyOnComplete': '最终完成时通知',
			'settings.notifyOnCompleteHint': 'agent 彻底空闲时通知；每个 turn 结束不算。',
			'settings.notifyOnQuestion': '提问时通知',
			'settings.notifyOnQuestionHint': 'agent 等待你回答问题时通知。',
			'settings.notifyOnApproval': '请求权限时通知',
			'settings.notifyOnApprovalHint': 'agent 申请工具权限时通知。',
			'settings.notifyOnError': '出错时通知',
			'settings.notifyOnErrorHint': 'agent 运行失败时通知。',
			'settings.groupContent': '内容与声音',
			'settings.soundPolicy': '提示音',
			'settings.soundPolicyHint': 'smart：完成静音、其余带系统提示音；all：全部带音；none：全部静音。',
			'settings.soundSmart': '智能',
			'settings.soundAll': '全部',
			'settings.soundNone': '静音',
			'settings.redact': '脱敏正文',
			'settings.redactHint': '正文不含提示词原文、模型输出片段与完整命令。',
			'settings.showSessionTitle': '使用会话标题',
			'settings.showSessionTitleHint': '关闭时通知标题固定为 DeepSeek Harness。',
			'settings.replaceBySession': '同会话替换',
			'settings.replaceBySessionHint': '每个会话最多保留一条通知，新通知顶掉旧的。',
			'settings.maintenance': '运维',
			'settings.test': '发送测试通知',
			'settings.testHint': '绕过前台抑制直接发一条通知，用于确认系统授权。',
			'settings.testTitle': 'dsh-notice test',
			'settings.testBody': '如果你看到这条通知，说明通知通道正常。',
			'settings.testUnavailable': '当前环境不支持系统通知。',
			'settings.permission': '通知权限状态',
			'settings.permissionGranted': '已授权',
			'settings.permissionDenied': '已拒绝',
			'settings.permissionDefault': '未决定',
			'settings.permissionUnsupported': '不可用',
			'settings.permissionDeniedHint': '请在「系统设置 → 通知 → DeepSeek Harness」中允许通知。',
			'settings.permissionDefaultHint': '发送一次测试通知以触发系统授权。若没有出现，请在「系统设置 → 通知 → DeepSeek Harness」中允许通知。',
			'settings.loading': '正在读取配置…',
			'settings.unavailable': '当前部署没有提供可写的通知配置。',
			'settings.renderFailed': '配置页渲染失败：{message}',
			'settings.saveFailed': '保存失败，请重试。',
			'settings.readOnly': '本部署的通知配置为只读。',
			'settings.overridden': '已覆盖',
			'settings.reset': '恢复默认',
		};

		/** English copy, checked against the Chinese key set. */
		var en = {
			'app.name': 'DeepSeek Harness',
			'body.complete': 'Completed',
			'body.completeWithDuration': 'Completed · {duration}',
			'body.questionOne': 'Waiting for you to answer 1 question',
			'body.questionMany': 'Waiting for you to answer {count} questions',
			'body.approval': 'Approval requested: {tool}',
			'body.error': 'Run failed: {reason}',
			'body.errorUnknown': 'unknown error',
			'duration.underSecond': 'under 1s',
			'duration.seconds': '{n}s',
			'duration.minutesSeconds': '{m}m {s}s',
			'duration.hoursMinutes': '{h}h {m}m',
			'settings.title': 'System notifications',
			'settings.description': 'Send a macOS notification when an agent completes, asks a question, requests approval, or fails.',
			'settings.summaryOn': '4 notification types enabled',
			'settings.summaryPartial': '{count} notification types enabled',
			'settings.summaryOff': 'All notifications disabled',
			'settings.groupTriggers': 'Triggers',
			'settings.notifyOnComplete': 'Notify on final completion',
			'settings.notifyOnCompleteHint': 'Fires when the agent is fully idle, not at every turn end.',
			'settings.notifyOnQuestion': 'Notify on question',
			'settings.notifyOnQuestionHint': 'Fires when an agent waits for your answer.',
			'settings.notifyOnApproval': 'Notify on approval request',
			'settings.notifyOnApprovalHint': 'Fires when an agent asks for tool permission.',
			'settings.notifyOnError': 'Notify on failure',
			'settings.notifyOnErrorHint': 'Fires when an agent run fails.',
			'settings.groupContent': 'Content and sound',
			'settings.soundPolicy': 'Sound',
			'settings.soundPolicyHint': 'smart: silent on completion, sound otherwise; all: always sound; none: always silent.',
			'settings.soundSmart': 'Smart',
			'settings.soundAll': 'All',
			'settings.soundNone': 'Silent',
			'settings.redact': 'Redact body',
			'settings.redactHint': 'Keep prompt text, model output, and full commands out of the body.',
			'settings.showSessionTitle': 'Show session title',
			'settings.showSessionTitleHint': 'When off, the title is always DeepSeek Harness.',
			'settings.replaceBySession': 'Replace per session',
			'settings.replaceBySessionHint': 'Keep at most one notification per session.',
			'settings.maintenance': 'Maintenance',
			'settings.test': 'Send test notification',
			'settings.testHint': 'Bypasses foreground suppression to verify the system permission.',
			'settings.testTitle': 'dsh-notice test',
			'settings.testBody': 'If you can see this, the notification channel works.',
			'settings.testUnavailable': 'System notifications are unavailable here.',
			'settings.permission': 'Notification permission',
			'settings.permissionGranted': 'Granted',
			'settings.permissionDenied': 'Denied',
			'settings.permissionDefault': 'Not decided',
			'settings.permissionUnsupported': 'Unavailable',
			'settings.permissionDeniedHint': 'Allow notifications in System Settings → Notifications → DeepSeek Harness.',
			'settings.permissionDefaultHint': 'Send a test notification to trigger the system prompt. If nothing appears, allow notifications in System Settings → Notifications → DeepSeek Harness.',
			'settings.loading': 'Loading configuration…',
			'settings.unavailable': 'This deployment exposes no writable notification configuration.',
			'settings.renderFailed': 'Settings page render failed: {message}',
			'settings.saveFailed': 'Save failed, please retry.',
			'settings.readOnly': 'Notification configuration is read-only in this deployment.',
			'settings.overridden': 'Overridden',
			'settings.reset': 'Reset to default',
		};
		//#endregion

		//#region defaults
		/** Client-side fallback matching the host schema defaults (src/index.ts). */
		var DEFAULT_CONFIG = {
			notifyOnComplete: true,
			notifyOnQuestion: true,
			notifyOnApproval: true,
			notifyOnError: true,
			soundPolicy: 'smart',
			redact: true,
			showSessionTitle: true,
			replaceBySession: true,
		};

		/** Trigger kind → configuration switch field. */
		var SWITCH_FIELD = {
			complete: 'notifyOnComplete',
			question: 'notifyOnQuestion',
			approval: 'notifyOnApproval',
			error: 'notifyOnError',
		};
		//#endregion

		//#region pure helpers
		/**
		 * Read the live plugin configuration on every event: volatile fields must
		 * never be cached, and a not-yet-served form falls back to the defaults.
		 *
		 * @param ctx - client plugin context.
		 * @returns a plain configuration object.
		 */
		function readConfig(ctx) {
			var resolved = {};
			for (var key in DEFAULT_CONFIG) resolved[key] = DEFAULT_CONFIG[key];
			try {
				var form = ctx.configForms.get(ENTRY_ID);
				var snapshot = form.getSnapshot();
				var value = snapshot && snapshot.value;
				if (value && typeof value === 'object') {
					for (var field in DEFAULT_CONFIG) {
						if (value[field] !== undefined && value[field] !== null) resolved[field] = value[field];
					}
				}
			} catch (error) {
				// The form is not served yet (or at all): defaults are safe.
			}
			return resolved;
		}

		/**
		 * Whether the user enabled this trigger.
		 *
		 * @param config - resolved configuration.
		 * @param kind - trigger kind.
		 * @returns true when the notification should be sent.
		 */
		function isTriggerEnabled(config, kind) {
			var field = SWITCH_FIELD[kind];
			return field === undefined ? false : config[field] !== false;
		}

		/**
		 * Compute the `silent` option for one notification.
		 *
		 * @param config - resolved configuration.
		 * @param kind - trigger kind.
		 * @returns true when the system sound must not play.
		 */
		function isSilent(config, kind) {
			if (config.soundPolicy === 'none') return true;
			if (config.soundPolicy === 'all') return false;
			return kind === 'complete';
		}

		/**
		 * Whether the desktop window currently has focus; notifications are
		 * suppressed while the user is already looking at the app.
		 *
		 * @returns true when the document reports focus.
		 */
		function isForeground() {
			if (typeof document === 'undefined' || typeof document.hasFocus !== 'function') return false;
			try {
				return document.hasFocus() === true;
			} catch (error) {
				return false;
			}
		}

		/**
		 * Last path segment of a directory path, for POSIX and Windows shapes.
		 *
		 * @param path - directory path.
		 * @returns the basename, or the empty string.
		 */
		function basename(path) {
			if (typeof path !== 'string') return '';
			var cleaned = path.trim().replace(/[\\/]+$/, '');
			if (cleaned === '') return '';
			var index = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'));
			return index >= 0 ? cleaned.slice(index + 1) : cleaned;
		}

		/**
		 * Truncate a string to a maximum number of Unicode code points.
		 *
		 * @param text - source text.
		 * @param limit - maximum characters.
		 * @returns the text, with a trailing ellipsis when shortened.
		 */
		function truncate(text, limit) {
			if (typeof text !== 'string') return '';
			var chars = Array.from(text);
			if (chars.length <= limit) return text;
			return chars.slice(0, Math.max(0, limit - 1)).join('') + '…';
		}

		/**
		 * Collapse whitespace (including line breaks) into single spaces.
		 *
		 * @param text - source text.
		 * @returns the collapsed text.
		 */
		function collapse(text) {
			return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
		}

		/**
		 * Structural headline of a failure: a leading error code when one exists,
		 * otherwise the first sentence of the first line.
		 *
		 * @param message - user-safe failure description from `api-session/error`.
		 * @param t - translate function.
		 * @returns the headline, without prompt text or full commands.
		 */
		function errorHeadline(message, t) {
			var text = typeof message === 'string' ? message.trim() : '';
			if (text === '') return t('body.errorUnknown');
			var first = collapse(text.split(/\r?\n/)[0]);
			var code = first.match(/^(?:\[([A-Za-z][\w.-]*)\]|([A-Z][A-Z0-9_]{2,})\b|([a-z][a-z0-9_-]*\/[a-z0-9_.-]+))/);
			if (code !== null) {
				var value = code[1] || code[2] || code[3];
				if (value !== undefined) return truncate(value, HEADLINE_LIMIT);
			}
			var sentence = first.split(/[.!?。！？]/)[0].trim();
			return truncate(sentence === '' ? first : sentence, HEADLINE_LIMIT);
		}

		/**
		 * Optional non-redacted detail line, collapsed and truncated to the spec's
		 * 80-character cap.
		 *
		 * @param text - raw detail source (failure message or approval reason).
		 * @returns the detail, or the empty string.
		 */
		function detailLine(text) {
			if (text !== null && typeof text === 'object') {
				text = typeof text.en === 'string' ? text.en : (typeof text.zh === 'string' ? text.zh : '');
			}
			var collapsed = collapse(text);
			return collapsed === '' ? '' : truncate(collapsed, DETAIL_LIMIT);
		}

		/**
		 * Format a duration for notification copy, locale-aware.
		 *
		 * @param durationMs - elapsed milliseconds.
		 * @param t - translate function.
		 * @returns formatted duration.
		 */
		function formatDuration(durationMs, t) {
			var total = Math.max(0, Math.round(durationMs / 1000));
			if (total < 1) return t('duration.underSecond');
			if (total < 60) return t('duration.seconds', { n: total });
			var minutes = Math.floor(total / 60);
			var seconds = total % 60;
			if (minutes < 60) return t('duration.minutesSeconds', { m: minutes, s: seconds });
			var hours = Math.floor(minutes / 60);
			return t('duration.hoursMinutes', { h: hours, m: minutes % 60 });
		}

		/**
		 * Render the localized event sentence, honoring redaction. The optional
		 * detail line stays separate so the project suffix never inflates it past
		 * its 80-character cap.
		 *
		 * @param t - translate function.
		 * @param kind - trigger kind.
		 * @param payload - event-specific facts.
		 * @param config - resolved configuration.
		 * @returns the event sentence and an optional non-redacted detail line.
		 */
		function composeSentence(t, kind, payload, config) {
			if (kind === 'complete') {
				if (payload.durationMs === undefined || payload.durationMs === null) return { text: t('body.complete') };
				return { text: t('body.completeWithDuration', { duration: formatDuration(payload.durationMs, t) }) };
			}
			if (kind === 'question') {
				var count = payload.count > 0 ? payload.count : 1;
				return { text: count === 1 ? t('body.questionOne') : t('body.questionMany', { count: count }) };
			}
			if (kind === 'approval') {
				var tool = collapse(payload.toolName) || 'tool';
				var reason = config.redact === false ? detailLine(payload.reason || payload.displayReason) : '';
				return { text: t('body.approval', { tool: truncate(tool, HEADLINE_LIMIT) }), detail: reason };
			}
			var headline = errorHeadline(payload.message, t);
			var detail = config.redact === false ? detailLine(payload.message) : '';
			return { text: t('body.error', { reason: headline }), detail: detail };
		}

		/**
		 * Compose title and body for one notification.
		 *
		 * The title comes from the `title` session projection: the list summary's
		 * role is navigation metadata (`displayTitle`), while the durable title is
		 * projected separately. The project segment in the body still uses the
		 * summary's cwd basename.
		 *
		 * @param t - translate function.
		 * @param kind - trigger kind.
		 * @param payload - event-specific facts.
		 * @param config - resolved configuration.
		 * @param facts - session summary and projection title for the event's session.
		 * @returns title and body.
		 */
		function composeNotification(t, kind, payload, config, facts) {
			var project = facts.summary === undefined ? '' : basename(facts.summary.cwd);
			var title;
			if (config.showSessionTitle === false) {
				title = t('app.name');
			} else {
				title = facts.title || project || t('app.name');
			}
			var composed = composeSentence(t, kind, payload, config);
			var body = project === '' ? composed.text : composed.text + ' · ' + project;
			if (composed.detail !== undefined && composed.detail !== '') body = body + '\n' + composed.detail;
			return { title: title, body: body };
		}
		//#endregion

		//#region notification store
		/** Live notifications held strongly so Electron keeps them in Notification Center. */
		var live = new Map();
		/** Monotonic key for live entries. */
		var nextLiveKey = 0;
		/** Session of the most recently clicked notification, reserved for M2 navigation. */
		var lastClickedSessionId;
		/** Sessions observed as subagent children, for filtering before the catalog catches up. */
		var subagentSessions = new Set();
		/** Last pending-interaction key already announced, per session (dedupe across status snapshots). */
		var announcedPending = new Map();

		/** Close one live notification by key and drop every reference. */
		function closeLive(key) {
			var entry = live.get(key);
			if (entry === undefined) return;
			live.delete(key);
			try {
				entry.notification.close();
			} catch (error) {
				// Closing an already-dismissed notification is harmless.
			}
		}

		/** Close every live notification for one session (per-session replacement). */
		function closeSession(sessionId) {
			var keys = [];
			live.forEach(function (entry, key) {
				if (entry.sessionId === sessionId) keys.push(key);
			});
			for (var index = 0; index < keys.length; index += 1) closeLive(keys[index]);
		}

		/** Bound the strongly-held set when replacement is disabled. */
		function trimLive() {
			while (live.size > MAX_LIVE_NOTIFICATIONS) {
				var oldest = undefined;
				live.forEach(function (entry, key) {
					if (oldest === undefined || key < oldest) oldest = key;
				});
				if (oldest === undefined) return;
				closeLive(oldest);
			}
		}

		/** Close every live notification; used when the plugin tears down. */
		function closeAll() {
			var keys = [];
			live.forEach(function (entry, key) {
				keys.push(key);
			});
			for (var index = 0; index < keys.length; index += 1) closeLive(keys[index]);
		}

		/**
		 * Show one notification through the renderer's `Notification` API.
		 *
		 * @param t - translate function.
		 * @param kind - trigger kind.
		 * @param sessionId - session the notification belongs to.
		 * @param payload - event-specific facts.
		 * @param config - resolved configuration.
		 * @param facts - session summary and projection title for the session.
		 */
		function showNotification(t, kind, sessionId, payload, config, facts) {
			if (typeof Notification === 'undefined') return;
			var copy = composeNotification(t, kind, payload, config, facts);
			var silent = isSilent(config, kind);
			if (config.replaceBySession !== false) closeSession(sessionId);
			try {
				var notification = new Notification(copy.title, { body: copy.body, silent: silent });
				var key = nextLiveKey += 1;
				live.set(key, { notification: notification, sessionId: sessionId });
				notification.onclick = function () {
					// M2 will navigate to `lastClickedSessionId`; today focus the window.
					lastClickedSessionId = sessionId;
					try {
						window.focus();
					} catch (error) {
						// Focus is best-effort.
					}
					closeLive(key);
				};
				notification.onclose = function () {
					live.delete(key);
				};
				trimLive();
			} catch (error) {
				console.warn('[dsh-notice] failed to show notification', error);
			}
		}

		/**
		 * Read the live session facts notification copy needs: the catalog summary
		 * (cwd and origin) plus the durable title projected for this session.
		 *
		 * `SessionListState.projectionsBySession[id].values.title` is the projection
		 * declared by `@deepseek-ai/dsh-session-title`; a null, empty, or whitespace
		 * title is treated as absent so the title chain can fall back.
		 *
		 * @param ctx - client plugin context.
		 * @param sessionId - session identity.
		 * @returns the summary (possibly undefined) and the title (possibly undefined).
		 */
		function sessionFacts(ctx, sessionId) {
			var facts = { summary: undefined, title: undefined };
			try {
				var state = ctx.sessions.list.getSnapshot();
				if (state !== undefined && state !== null && state.byId !== undefined) {
					facts.summary = state.byId[sessionId];
				}
				var projections = state === undefined || state === null ? undefined : state.projectionsBySession;
				var projection = projections === undefined || projections === null ? undefined : projections[sessionId];
				var values = projection === undefined || projection === null ? undefined : projection.values;
				var projected = values === undefined || values === null ? undefined : values.title;
				if (typeof projected === 'string' && projected.trim() !== '') facts.title = projected.trim();
			} catch (error) {
				// A missing or mid-update catalog degrades to app-name copy.
			}
			return facts;
		}

		/**
		 * Whether this session is a subagent child; subagents never notify.
		 *
		 * @param sessionId - session identity.
		 * @param facts - session facts read for this event.
		 * @returns true for subagent sessions.
		 */
		function isSubagent(sessionId, facts) {
			if (subagentSessions.has(sessionId)) return true;
			return facts.summary !== undefined && facts.summary.origin === 'subagent';
		}

		/**
		 * Decide and deliver one notification.
		 *
		 * @param ctx - client plugin context.
		 * @param t - translate function.
		 * @param sessionId - session the event belongs to.
		 * @param kind - trigger kind.
		 * @param payload - event-specific facts.
		 */
		function notify(ctx, t, sessionId, kind, payload) {
			try {
				var config = readConfig(ctx);
				if (!isTriggerEnabled(config, kind)) return;
				if (isForeground()) return;
				var facts = sessionFacts(ctx, sessionId);
				if (isSubagent(sessionId, facts)) return;
				showNotification(t, kind, sessionId, payload, config, facts);
			} catch (error) {
				console.warn('[dsh-notice] notification dispatch failed', error);
			}
		}
		//#endregion

		//#region completion aggregation
		/** Fixed silence window before a root session cycle may deliver completion. */
		var QUIET_MS = 2000;
		/** Defensive upper bound while walking a parent chain (cycle guard, not a product limit). */
		var TREE_DEPTH_LIMIT = 64;
		/** Normalized metadata per session, from forwarded summaries and list rows. */
		var sessionMeta = new Map();
		/** Last observed running value per session. */
		var runningState = new Map();
		/** Current non-null pending interaction per session; blocks completion, any kind or key. */
		var pendingBySession = new Map();
		/** Sessions observed running without metadata; globally blocks every root. */
		var unattributedRunning = new Set();
		/** Sessions observed pending without metadata; globally blocks every root. */
		var unattributedPending = new Set();
		/** Root-anchored completion cycles, keyed by root session id. */
		var cycles = new Map();
		/** Whether the first authoritative session list snapshot has been applied. */
		var listBaselineReady = false;
		/** Set by dispose; every handler and timer returns early afterwards. */
		var disposed = false;
		/** Cancels the `ctx.sessions.list` subscription. */
		var listUnsubscribe = function () {};

		/** Reset all aggregation state; called when the plugin mounts. */
		function resetCompletionState() {
			disposed = false;
			listBaselineReady = false;
			sessionMeta = new Map();
			runningState = new Map();
			pendingBySession = new Map();
			unattributedRunning = new Set();
			unattributedPending = new Set();
			cycles = new Map();
			listUnsubscribe = function () {};
		}

		/** Cancel one cycle's quiet timer, ignoring a timer that already fired. */
		function clearCycleTimer(cycle) {
			if (cycle === undefined || cycle.timer === undefined) return;
			var timer = cycle.timer;
			cycle.timer = undefined;
			try {
				clearTimeout(timer);
			} catch (error) {
				console.warn('[dsh-notice] failed to clear quiet timer', error);
			}
		}

		/** Drop one cycle without delivering completion. */
		function cancelCycle(rootId) {
			var cycle = cycles.get(rootId);
			if (cycle === undefined) return;
			clearCycleTimer(cycle);
			cycles.delete(rootId);
		}

		/**
		 * Start an Active cycle for a root session.
		 *
		 * @param rootId - root session identity.
		 * @param durationKnown - true only for cycles opened by a root status event.
		 */
		function createCycle(rootId, durationKnown) {
			var cycle = {
				rootId: rootId,
				state: 'Active',
				startedAt: Date.now(),
				durationKnown: durationKnown === true,
				quietSince: undefined,
				timer: undefined,
			};
			cycles.set(rootId, cycle);
			return cycle;
		}

		/**
		 * Assign one normalized metadata field, reporting whether it changed.
		 *
		 * `undefined` means "not declared", `null` or the empty string clears the
		 * field; a non-empty string is the new value.
		 *
		 * @param meta - normalized session metadata.
		 * @param field - `parentId` or `origin`.
		 * @param value - declared value from a wire summary or list row.
		 * @returns true when the cached value changed.
		 */
		function assignMetaValue(meta, field, value) {
			var previous = meta[field];
			if (value === undefined) return false;
			if (value === null || value === '') {
				if (previous === undefined) return false;
				meta[field] = undefined;
				return true;
			}
			if (typeof value !== 'string') return false;
			if (previous === value) return false;
			meta[field] = value;
			return true;
		}

		/**
		 * Merge one `api-session/added` wire summary into the metadata cache.
		 * A summary without a field never clears it; explicit null/empty clears.
		 *
		 * @param sessionId - normalized session identity (`summary.sessionId`).
		 * @param summary - wire summary.
		 * @returns true when parent/origin metadata changed.
		 */
		function mergeSummaryMeta(sessionId, summary) {
			var meta = sessionMeta.get(sessionId);
			var changed = false;
			if (meta === undefined) {
				meta = { id: sessionId, parentId: undefined, origin: undefined, hostListed: false };
				sessionMeta.set(sessionId, meta);
				changed = true;
			}
			if (assignMetaValue(meta, 'parentId', summary.parentSessionId)) changed = true;
			if (assignMetaValue(meta, 'origin', summary.origin)) changed = true;
			return changed;
		}

		/**
		 * Resolve which root a session belongs to using only normalized metadata.
		 *
		 * @param sessionId - session identity.
		 * @returns `{ kind: 'root', rootId }`, `{ kind: 'unknown' }`, or `{ kind: 'orphan' }`.
		 */
		function rootOf(sessionId) {
			var current = sessionId;
			var visited = new Set();
			var steps = 0;
			while (typeof current === 'string' && current !== '') {
				if (visited.has(current)) return { kind: 'orphan' };
				visited.add(current);
				var meta = sessionMeta.get(current);
				if (meta === undefined) return current === sessionId ? { kind: 'unknown' } : { kind: 'orphan' };
				if (meta.origin !== 'subagent') return { kind: 'root', rootId: current };
				if (typeof meta.parentId !== 'string' || meta.parentId === '') return { kind: 'orphan' };
				// The guard bounds parent hops, not visited nodes: exactly
				// TREE_DEPTH_LIMIT upward moves still resolve a normal tree.
				if (steps >= TREE_DEPTH_LIMIT) return { kind: 'orphan' };
				steps += 1;
				current = meta.parentId;
			}
			return { kind: 'unknown' };
		}

		/** Whether a session is the root itself or one of its known local descendants. */
		function isDescendantOf(sessionId, rootId) {
			var current = sessionId;
			var visited = new Set();
			while (typeof current === 'string' && current !== '') {
				if (current === rootId) return true;
				if (visited.has(current)) return false;
				visited.add(current);
				if (visited.size > TREE_DEPTH_LIMIT) return false;
				var meta = sessionMeta.get(current);
				if (meta === undefined) return false;
				if (meta.origin !== 'subagent') return false;
				if (typeof meta.parentId !== 'string' || meta.parentId === '') return false;
				current = meta.parentId;
			}
			return false;
		}

		/** Whether any really-changed session belongs to the root's local subtree. */
		function subtreeHasChange(changedIds, rootId) {
			if (changedIds === undefined || changedIds === null) return false;
			var hit = false;
			changedIds.forEach(function (sessionId) {
				if (hit) return;
				if (sessionId === rootId || isDescendantOf(sessionId, rootId)) hit = true;
			});
			return hit;
		}

		/** True while the root or any known local descendant is running. */
		function subtreeBusy(rootId) {
			if (runningState.get(rootId) === true) return true;
			var busy = false;
			sessionMeta.forEach(function (meta, sessionId) {
				if (busy || sessionId === rootId) return;
				if (runningState.get(sessionId) !== true) return;
				if (isDescendantOf(sessionId, rootId)) busy = true;
			});
			return busy;
		}

		/**
		 * Read the public session list snapshot without trusting its shape.
		 *
		 * @param ctx - client plugin context.
		 * @returns `{ byId, ids }`, or undefined when the baseline is unreadable.
		 */
		function readListSnapshot(ctx) {
			if (ctx.sessions === undefined || ctx.sessions === null) return undefined;
			var list = ctx.sessions.list;
			if (list === undefined || list === null || typeof list.getSnapshot !== 'function') return undefined;
			var state = list.getSnapshot();
			if (state === undefined || state === null || typeof state !== 'object') return undefined;
			// A list store that reports a readiness phase is only usable once ready;
			// shapes without a phase stay readable as before.
			if (typeof state.phase === 'string' && state.phase !== 'ready') return undefined;
			var byId = state.byId;
			if (byId === undefined || byId === null || typeof byId !== 'object') return undefined;
			// `ids` is the Host-list baseline: without it every row would look
			// authoritative, so an unshaped snapshot is treated as unreadable.
			if (!Array.isArray(state.ids)) return undefined;
			var ids = [];
			for (var index = 0; index < state.ids.length; index += 1) {
				if (typeof state.ids[index] === 'string') ids.push(state.ids[index]);
			}
			return { byId: byId, ids: ids };
		}

		/**
		 * Merge one list snapshot into the normalized metadata/running caches.
		 *
		 * Only Host-listed rows establish or correct `running`; rows that exist
		 * only in `byId` contribute metadata and never clear a running observation.
		 *
		 * @param snapshot - result of {@link readListSnapshot}.
		 * @param initial - true only for the first baseline: existing observations win.
		 * @returns the sessions whose running value changed and whether tree metadata changed.
		 */
		function mergeListSnapshot(snapshot, initial) {
			var hostIds;
			if (snapshot.ids !== undefined) {
				hostIds = new Set();
				for (var index = 0; index < snapshot.ids.length; index += 1) hostIds.add(snapshot.ids[index]);
			}
			var runningChanged = new Set();
			var metadataChanged = false;
			var keys = Object.keys(snapshot.byId);
			for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
				var row = snapshot.byId[keys[keyIndex]];
				if (row === undefined || row === null || typeof row !== 'object') continue;
				var sessionId = typeof row.id === 'string' && row.id !== '' ? row.id : keys[keyIndex];
				if (typeof sessionId !== 'string' || sessionId === '') continue;
				var hostListed = hostIds === undefined ? true : hostIds.has(sessionId);
				var meta = sessionMeta.get(sessionId);
				if (meta === undefined) {
					meta = { id: sessionId, parentId: undefined, origin: undefined, hostListed: false };
					sessionMeta.set(sessionId, meta);
					metadataChanged = true;
				}
				// The initial baseline only fills fields that no event has declared;
				// later snapshots are authoritative and may correct metadata.
				if (!initial || meta.parentId === undefined) {
					if (assignMetaValue(meta, 'parentId', row.parentId)) metadataChanged = true;
				}
				if (!initial || meta.origin === undefined) {
					if (assignMetaValue(meta, 'origin', row.origin)) metadataChanged = true;
				}
				meta.hostListed = hostListed;
				// The pre-catalog subagent filter mirrors normalized origin, so a
				// list row that re-declares a child as a root must release it.
				if (meta.origin === 'subagent') subagentSessions.add(sessionId);
				else subagentSessions.delete(sessionId);
				// A list row is metadata: it resolves unattributed observations
				// even when it is only a fallback row.
				unattributedRunning.delete(sessionId);
				unattributedPending.delete(sessionId);
				if (hostListed && typeof row.running === 'boolean') {
					var previous = runningState.get(sessionId);
					if (initial && previous !== undefined) continue;
					if (previous !== row.running) {
						runningState.set(sessionId, row.running);
						runningChanged.add(sessionId);
					}
				}
			}
			return { runningChanged: runningChanged, metadataChanged: metadataChanged };
		}

		/**
		 * Discover one session's metadata with a single list read.
		 *
		 * The read only fills metadata that is still missing and a Host-listed
		 * running value that no status event has observed yet; it never overwrites
		 * a just-arrived status observation.
		 *
		 * @param ctx - client plugin context.
		 * @param sessionId - session identity.
		 * @returns true when the read produced metadata for this session.
		 */
		function discoverMeta(ctx, sessionId) {
			if (sessionMeta.has(sessionId)) return false;
			try {
				var snapshot = readListSnapshot(ctx);
				if (snapshot === undefined) return false;
				var row = snapshot.byId[sessionId];
				if (row === undefined || row === null || typeof row !== 'object') return false;
				var hostListed = false;
				for (var index = 0; index < snapshot.ids.length; index += 1) {
					if (snapshot.ids[index] === sessionId) {
						hostListed = true;
						break;
					}
				}
				var meta = { id: sessionId, parentId: undefined, origin: undefined, hostListed: hostListed };
				sessionMeta.set(sessionId, meta);
				assignMetaValue(meta, 'parentId', row.parentId);
				assignMetaValue(meta, 'origin', row.origin);
				if (hostListed && typeof row.running === 'boolean' && runningState.get(sessionId) === undefined) {
					runningState.set(sessionId, row.running);
				}
				// Metadata now decides root/child/orphan; the session is no longer
				// globally blocking.
				unattributedRunning.delete(sessionId);
				unattributedPending.delete(sessionId);
				return true;
			} catch (error) {
				console.warn('[dsh-notice] session metadata discovery failed', error);
				return false;
			}
		}

		/**
		 * Read the pending-interaction snapshot defensively.
		 *
		 * @returns the status map, `undefined` when the service is unavailable, or
		 * `null` when the read failed and the previous blocking set must survive.
		 */
		function readPendingSnapshot(ctx) {
			var ui = ctx.uiSession;
			if (ui === undefined || ui === null) return undefined;
			var source = ui.sessionStatus;
			if (source === undefined || source === null || typeof source.getSnapshot !== 'function') return undefined;
			try {
				var snapshot = source.getSnapshot();
				if (snapshot === undefined || snapshot === null || typeof snapshot.forEach !== 'function') return null;
				return snapshot;
			} catch (error) {
				console.warn('[dsh-notice] pending interaction snapshot failed', error);
				return null;
			}
		}

		/**
		 * Merge a pending snapshot into the blocking map. Any non-null
		 * `pendingInteraction` blocks, regardless of kind or key; alert dedupe
		 * stays in `announcedPending`.
		 *
		 * @param ctx - client plugin context.
		 * @param snapshot - readable `sessionStatus` map.
		 * @returns changed session ids and whether metadata was discovered, or
		 * `undefined` when the scan itself failed.
		 */
		function syncPendingSnapshot(ctx, snapshot) {
			var current = new Map();
			try {
				snapshot.forEach(function (status, sessionId) {
					if (typeof sessionId !== 'string' || sessionId === '') return;
					var interaction = status === undefined || status === null ? undefined : status.pendingInteraction;
					if (interaction === undefined || interaction === null) return;
					current.set(sessionId, interaction);
				});
			} catch (error) {
				console.warn('[dsh-notice] pending interaction scan failed', error);
				return undefined;
			}
			var changed = new Set();
			var metadataChanged = false;
			current.forEach(function (interaction, sessionId) {
				if (!pendingBySession.has(sessionId)) changed.add(sessionId);
				pendingBySession.set(sessionId, interaction);
				if (!sessionMeta.has(sessionId) && discoverMeta(ctx, sessionId)) metadataChanged = true;
				if (sessionMeta.has(sessionId)) unattributedPending.delete(sessionId);
				else unattributedPending.add(sessionId);
			});
			var stale = [];
			pendingBySession.forEach(function (interaction, sessionId) {
				if (!current.has(sessionId)) stale.push(sessionId);
			});
			for (var index = 0; index < stale.length; index += 1) {
				pendingBySession.delete(stale[index]);
				unattributedPending.delete(stale[index]);
				changed.add(stale[index]);
			}
			return { changed: changed, metadataChanged: metadataChanged };
		}

		/** True while an observation exists that cannot be attributed to any root. */
		function globalBlocked() {
			return unattributedRunning.size > 0 || unattributedPending.size > 0;
		}

		/** True while any known session in the root's subtree has a pending interaction. */
		function subtreeHasPending(rootId) {
			var hit = false;
			pendingBySession.forEach(function (interaction, sessionId) {
				if (hit) return;
				if (sessionId === rootId || isDescendantOf(sessionId, rootId)) hit = true;
			});
			return hit;
		}

		/**
		 * Open seed cycles for running roots seen in a list snapshot. Seed cycles
		 * never carry a duration and never schedule a timer by themselves.
		 */
		function seedRunningRoots() {
			var runningIds = [];
			runningState.forEach(function (running, sessionId) {
				if (running === true) runningIds.push(sessionId);
			});
			for (var index = 0; index < runningIds.length; index += 1) {
				var sessionId = runningIds[index];
				if (cycles.has(sessionId)) continue;
				var root = rootOf(sessionId);
				if (root.kind !== 'root' || root.rootId !== sessionId) continue;
				createCycle(sessionId, false);
			}
		}

		/** Cancel every cycle whose key is no longer the root of its own session. */
		function cancelInvalidCycles() {
			var victims = [];
			cycles.forEach(function (cycle, rootId) {
				var classification = rootOf(rootId);
				if (classification.kind !== 'root' || classification.rootId !== rootId) victims.push(rootId);
			});
			for (var index = 0; index < victims.length; index += 1) cancelCycle(victims[index]);
		}

		/**
		 * Re-resolve tree ownership after metadata changes.
		 *
		 * Cycles whose session stopped being a root are cancelled, running roots
		 * that gained root status get a seed cycle, and every surviving cycle is
		 * re-evaluated.
		 *
		 * @param ctx - client plugin context.
		 * @param t - translate function.
		 */
		function reResolveCycles(ctx, t, changedIds) {
			cancelInvalidCycles();
			seedRunningRoots();
			evaluateAllCycles(ctx, t, changedIds);
		}

		/** Apply the first list baseline. It never schedules or delivers completion. */
		function seedListBaseline(ctx) {
			try {
				var snapshot = readListSnapshot(ctx);
				if (snapshot === undefined) {
					console.warn('[dsh-notice] session list baseline is unavailable');
					return false;
				}
				mergeListSnapshot(snapshot, true);
				seedRunningRoots();
				listBaselineReady = true;
				return true;
			} catch (error) {
				console.warn('[dsh-notice] session list baseline failed', error);
				return false;
			}
		}

		/** Follow later list snapshots; titles do not notify, running/metadata changes re-evaluate cycles. */
		function handleListSnapshot(ctx, t) {
			if (disposed) return;
			try {
				var snapshot = readListSnapshot(ctx);
				if (snapshot === undefined) return;
				var wasReady = listBaselineReady;
				var merged = mergeListSnapshot(snapshot, !wasReady);
				listBaselineReady = true;
				seedRunningRoots();
				if (!wasReady || merged.metadataChanged) reResolveCycles(ctx, t, merged.runningChanged);
				else if (merged.runningChanged.size > 0) evaluateAllCycles(ctx, t, merged.runningChanged);
			} catch (error) {
				console.warn('[dsh-notice] session list update failed', error);
			}
		}

		/**
		 * Follow one `api-session/added` wire summary.
		 *
		 * The summary establishes parent/origin/running for one session. A running
		 * root that has no cycle gets a seed cycle; a running child only blocks an
		 * existing root cycle. Metadata changes re-resolve the whole known tree.
		 */
		function handleAdded(ctx, t, summary) {
			try {
				if (disposed) return;
				if (summary === undefined || summary === null || typeof summary !== 'object') return;
				if (summary.sessionId === undefined || summary.sessionId === null) return;
				var sessionId = summary.sessionId;
				if (typeof sessionId !== 'string' || sessionId === '') return;
				if (summary.origin === 'subagent') subagentSessions.add(sessionId);
				else subagentSessions.delete(sessionId);
				var metaChanged = mergeSummaryMeta(sessionId, summary);
				// The wire summary carries metadata, so this observation is no
				// longer unattributed.
				unattributedRunning.delete(sessionId);
				unattributedPending.delete(sessionId);
				var runningChanged = false;
				if (typeof summary.running === 'boolean') {
					if (runningState.get(sessionId) !== summary.running) {
						runningState.set(sessionId, summary.running);
						runningChanged = true;
					}
				}
				if (!metaChanged && !runningChanged) return;
				var changed = runningChanged ? new Set([sessionId]) : undefined;
				if (metaChanged) {
					reResolveCycles(ctx, t, changed);
					return;
				}
				var classification = rootOf(sessionId);
				if (classification.kind !== 'root') return;
				if (classification.rootId === sessionId) {
					if (runningState.get(sessionId) === true && !cycles.has(sessionId)) createCycle(sessionId, false);
					evaluateCycle(ctx, t, sessionId, changed);
					return;
				}
				if (cycles.has(classification.rootId)) evaluateCycle(ctx, t, classification.rootId, changed);
			} catch (error) {
				console.warn('[dsh-notice] session added handler failed', error);
			}
		}

		/**
		 * Follow one `api-session/removed` observation.
		 *
		 * Removal is neither completion nor failure. It drops the session's
		 * metadata, running, pending, and alert-dedupe state, closes its live
		 * notification, cancels a cycle the session owned, and re-evaluates the
		 * former root. Descendants lose their parent chain and become orphans, so
		 * they stop blocking any root without opening a cycle of their own.
		 *
		 * @param ctx - client plugin context.
		 * @param t - translate function.
		 * @param sessionId - removed session identity.
		 */
		function handleRemoved(ctx, t, sessionId) {
			try {
				if (disposed) return;
				if (typeof sessionId !== 'string' || sessionId === '') return;
				var oldRoot = rootOf(sessionId);
				var ownedCycle = cycles.has(sessionId);
				sessionMeta.delete(sessionId);
				runningState.delete(sessionId);
				pendingBySession.delete(sessionId);
				announcedPending.delete(sessionId);
				unattributedRunning.delete(sessionId);
				unattributedPending.delete(sessionId);
				subagentSessions.delete(sessionId);
				closeSession(sessionId);
				if (ownedCycle || (oldRoot.kind === 'root' && oldRoot.rootId === sessionId)) {
					// The root is gone: its cycle must never deliver. There is no
					// tombstone; a later list row or added summary may rebuild it.
					cancelCycle(sessionId);
				}
				// A child removal can free its former root, an unattributed removal
				// can lift the global gate, and removed descendants are now orphans.
				evaluateAllCycles(ctx, t);
			} catch (error) {
				console.warn('[dsh-notice] session removed handler failed', error);
			}
		}

		/** Subscribe to the public list store, if this deployment exposes one. */
		function subscribeList(ctx, t) {
			var list = ctx.sessions === undefined || ctx.sessions === null ? undefined : ctx.sessions.list;
			if (list === undefined || list === null || typeof list.subscribe !== 'function') return;
			try {
				var unsubscribe = list.subscribe(function () {
					handleListSnapshot(ctx, t);
				});
				if (typeof unsubscribe === 'function') listUnsubscribe = unsubscribe;
			} catch (error) {
				console.warn('[dsh-notice] session list subscription failed', error);
			}
		}

		/** Point the cycle's single timer at the fixed quiet window. */
		function scheduleQuietTimer(ctx, t, cycle) {
			clearCycleTimer(cycle);
			try {
				cycle.timer = setTimeout(function () {
					handleQuietTimer(ctx, t, cycle);
				}, QUIET_MS);
			} catch (error) {
				cycle.timer = undefined;
				cycle.state = 'Active';
				cycle.quietSince = undefined;
				console.warn('[dsh-notice] failed to schedule quiet timer', error);
			}
		}

		/**
		 * Re-evaluate one root cycle after an observation change.
		 *
		 * Busy observation cancels the timer and returns to Active. A quiet tree
		 * enters Quiet once and keeps its `quietSince` until a real transition.
		 */
		function evaluateCycle(ctx, t, rootId, changedIds) {
			if (disposed) return;
			var cycle = cycles.get(rootId);
			if (cycle === undefined) return;
			if (!listBaselineReady) {
				clearCycleTimer(cycle);
				cycle.state = 'Active';
				cycle.quietSince = undefined;
				return;
			}
			if (globalBlocked()) {
				clearCycleTimer(cycle);
				cycle.state = 'Active';
				cycle.quietSince = undefined;
				return;
			}
			if (subtreeBusy(rootId)) {
				clearCycleTimer(cycle);
				cycle.state = 'Active';
				cycle.quietSince = undefined;
				return;
			}
			if (subtreeHasPending(rootId)) {
				clearCycleTimer(cycle);
				cycle.state = 'Active';
				cycle.quietSince = undefined;
				return;
			}
			if (cycle.state === 'Quiet' && cycle.timer !== undefined) {
				// A real transition inside the subtree starts a fresh window; a
				// repeated or metadata-only observation keeps the current one.
				if (subtreeHasChange(changedIds, rootId)) {
					cycle.quietSince = Date.now();
					scheduleQuietTimer(ctx, t, cycle);
				}
				return;
			}
			cycle.state = 'Quiet';
			cycle.quietSince = Date.now();
			scheduleQuietTimer(ctx, t, cycle);
		}

		/** Re-evaluate every existing cycle (used after a list snapshot). */
		function evaluateAllCycles(ctx, t, changedIds) {
			var ids = [];
			cycles.forEach(function (cycle, rootId) {
				ids.push(rootId);
			});
			for (var index = 0; index < ids.length; index += 1) evaluateCycle(ctx, t, ids[index], changedIds);
		}

		/** Re-evaluate every cycle except one (used by the deadline re-read). */
		function evaluateOtherCycles(ctx, t, excludedRootId, changedIds) {
			var ids = [];
			cycles.forEach(function (cycle, rootId) {
				if (rootId !== excludedRootId) ids.push(rootId);
			});
			for (var index = 0; index < ids.length; index += 1) evaluateCycle(ctx, t, ids[index], changedIds);
		}

		/**
		 * Quiet timer callback. The authoritative list re-read happens here, and
		 * completion may only be delivered through this callback.
		 */
		function handleQuietTimer(ctx, t, cycle) {
			try {
				if (disposed) return;
				var rootId = cycle.rootId;
				if (cycles.get(rootId) !== cycle) return;
				cycle.timer = undefined;
				if (cycle.state !== 'Quiet') return;
				var snapshot = readListSnapshot(ctx);
				if (snapshot === undefined) {
					cycle.state = 'Active';
					cycle.quietSince = undefined;
					console.warn('[dsh-notice] session list unreadable at quiet deadline');
					return;
				}
				var wasReady = listBaselineReady;
				var merged = mergeListSnapshot(snapshot, !wasReady);
				listBaselineReady = true;
				if (merged.metadataChanged) {
					// Ownership may have changed while the deadline approached.
					cancelInvalidCycles();
					if (cycles.get(rootId) !== cycle) return;
					seedRunningRoots();
				}
				// Pending interactions are re-read at the deadline too. A failed
				// read keeps the previous blocking set and cancels delivery rather
				// than guessing that the interaction cleared.
				var pendingSnapshot = readPendingSnapshot(ctx);
				if (pendingSnapshot === null) {
					cycle.state = 'Active';
					cycle.quietSince = undefined;
					return;
				}
				var pendingChanged = new Set();
				var pendingMetaChanged = false;
				if (pendingSnapshot !== undefined) {
					var pendingMerged = syncPendingSnapshot(ctx, pendingSnapshot);
					if (pendingMerged === undefined) {
						cycle.state = 'Active';
						cycle.quietSince = undefined;
						return;
					}
					pendingChanged = pendingMerged.changed;
					pendingMetaChanged = pendingMerged.metadataChanged;
					if (pendingMetaChanged) seedRunningRoots();
				}
				var combinedChanged = new Set();
				merged.runningChanged.forEach(function (changedId) {
					combinedChanged.add(changedId);
				});
				pendingChanged.forEach(function (changedId) {
					combinedChanged.add(changedId);
				});
				if (merged.metadataChanged || pendingMetaChanged || combinedChanged.size > 0) {
					evaluateOtherCycles(ctx, t, rootId, combinedChanged);
					if (cycles.get(rootId) !== cycle) return;
				}
				var root = rootOf(rootId);
				if (root.kind !== 'root' || root.rootId !== rootId) {
					cancelCycle(rootId);
					return;
				}
				if (globalBlocked()) {
					cycle.state = 'Active';
					cycle.quietSince = undefined;
					return;
				}
				if (subtreeBusy(rootId) || subtreeHasPending(rootId)) {
					cycle.state = 'Active';
					cycle.quietSince = undefined;
					return;
				}
				if (subtreeHasChange(combinedChanged, rootId)) {
					// The re-read corrected a cached busy session into idle: that is
					// a fresh quiet transition, so wait a full window instead of
					// delivering at the old deadline.
					cycle.state = 'Quiet';
					cycle.quietSince = Date.now();
					scheduleQuietTimer(ctx, t, cycle);
					return;
				}
				// Consume before delivering: suppressed or failed delivery never retries.
				cycles.delete(rootId);
				var durationMs;
				if (cycle.durationKnown === true && cycle.quietSince !== undefined) {
					durationMs = Math.max(0, cycle.quietSince - cycle.startedAt);
				}
				notify(ctx, t, rootId, 'complete', durationMs === undefined ? {} : { durationMs: durationMs });
			} catch (error) {
				console.warn('[dsh-notice] quiet timer failed', error);
				try {
					if (cycles.get(cycle.rootId) === cycle) {
						clearCycleTimer(cycle);
						cycle.state = 'Active';
						cycle.quietSince = undefined;
					}
				} catch (nested) {
					// The cycle is already detached.
				}
			}
		}

		/**
		 * Handle one `api-session/status` observation. This handler never delivers
		 * completion itself; only a quiet-timer callback may.
		 */
		function handleStatus(ctx, t, sessionId, running) {
			try {
				if (disposed) return;
				if (typeof sessionId !== 'string' || sessionId === '') return;
				if (typeof running !== 'boolean') return;
				if (runningState.get(sessionId) === running) return;
				runningState.set(sessionId, running);
				var changed = new Set([sessionId]);
				var blockedBefore = globalBlocked();
				if (running === false) {
					var wasUnattributed = unattributedRunning.delete(sessionId);
					if (!sessionMeta.has(sessionId)) discoverMeta(ctx, sessionId);
					if (wasUnattributed || (blockedBefore && !globalBlocked())) {
						// Lifting the global gate may let any root become quiet.
						evaluateAllCycles(ctx, t, changed);
						return;
					}
					var classified = rootOf(sessionId);
					if (classified.kind !== 'root') return;
					if (classified.rootId === sessionId) {
						evaluateCycle(ctx, t, sessionId, changed);
						return;
					}
					if (cycles.has(classified.rootId)) evaluateCycle(ctx, t, classified.rootId, changed);
					return;
				}
				if (!sessionMeta.has(sessionId)) discoverMeta(ctx, sessionId);
				var classification = rootOf(sessionId);
				if (classification.kind === 'unknown') {
					// No metadata at all: block every root rather than guessing.
					unattributedRunning.add(sessionId);
					evaluateAllCycles(ctx, t, changed);
					return;
				}
				var wasGlobal = unattributedRunning.delete(sessionId);
				var unblocked = blockedBefore && !globalBlocked();
				if (classification.kind === 'orphan') {
					if (wasGlobal || unblocked) evaluateAllCycles(ctx, t, changed);
					return;
				}
				if (classification.rootId === sessionId) {
					if (!cycles.has(sessionId)) createCycle(sessionId, true);
					if (wasGlobal || unblocked) evaluateAllCycles(ctx, t, changed);
					else evaluateCycle(ctx, t, sessionId, changed);
					return;
				}
				if (wasGlobal || unblocked) {
					evaluateAllCycles(ctx, t, changed);
					return;
				}
				if (cycles.has(classification.rootId)) evaluateCycle(ctx, t, classification.rootId, changed);
			} catch (error) {
				console.warn('[dsh-notice] session status handler failed', error);
			}
		}

		/**
		 * Initialize aggregation: seed the public list baseline and subscribe.
		 *
		 * @returns the disposer that clears every timer and aggregation state.
		 */
		function initCompletion(ctx, t) {
			resetCompletionState();
			seedListBaseline(ctx);
			subscribeList(ctx, t);
			try {
				evaluateAllCycles(ctx, t);
			} catch (error) {
				console.warn('[dsh-notice] initial cycle evaluation failed', error);
			}
			return function () {
				disposed = true;
				cycles.forEach(function (cycle) {
					clearCycleTimer(cycle);
				});
				cycles.clear();
				sessionMeta.clear();
				runningState.clear();
				pendingBySession.clear();
				unattributedRunning.clear();
				unattributedPending.clear();
				listBaselineReady = false;
				try {
					listUnsubscribe();
				} catch (error) {
					console.warn('[dsh-notice] session list unsubscribe failed', error);
				}
				listUnsubscribe = function () {};
			};
		}
		//#endregion

		//#region settings page
		/** Raw React element factory: this bundle never uses JSX (ADR 0002). */
		var h = React.createElement;
		/** Toggle switches, one per trigger kind. */
		var TRIGGER_FIELDS = [
			{ field: 'notifyOnComplete', label: 'settings.notifyOnComplete', hint: 'settings.notifyOnCompleteHint' },
			{ field: 'notifyOnQuestion', label: 'settings.notifyOnQuestion', hint: 'settings.notifyOnQuestionHint' },
			{ field: 'notifyOnApproval', label: 'settings.notifyOnApproval', hint: 'settings.notifyOnApprovalHint' },
			{ field: 'notifyOnError', label: 'settings.notifyOnError', hint: 'settings.notifyOnErrorHint' },
		];
		/** Remaining boolean fields, rendered as switches. */
		var CONTENT_FIELDS = [
			{ field: 'redact', label: 'settings.redact', hint: 'settings.redactHint' },
			{ field: 'showSessionTitle', label: 'settings.showSessionTitle', hint: 'settings.showSessionTitleHint' },
			{ field: 'replaceBySession', label: 'settings.replaceBySession', hint: 'settings.replaceBySessionHint' },
		];
		/** Segmented sound-policy choices. */
		var SOUND_OPTIONS = [
			{ value: 'smart', labelKey: 'settings.soundSmart' },
			{ value: 'all', labelKey: 'settings.soundAll' },
			{ value: 'none', labelKey: 'settings.soundNone' },
		];
		/** Snapshot returned before a form is handed to the page. */
		var EMPTY_FORM_SNAPSHOT = { status: 'loading', value: undefined, writable: false, revision: undefined };
		/** Snapshot used when the form cannot be read at all. */
		var UNAVAILABLE_FORM_SNAPSHOT = { status: 'unavailable', value: undefined, writable: false, revision: undefined };
		/** Snapshot used when reading the form throws. */
		var FAILED_FORM_SNAPSHOT = { status: 'unavailable', value: undefined, writable: false, revision: undefined };
		/** Strong references to test notifications so Electron keeps them visible. */
		var testNotifications = new Set();
		/** Inline styles keeping the page inside DSH's theme without a stylesheet. */
		var SETTINGS_STYLES = {
			root: { display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '720px', color: 'var(--dsw-alias-label-primary)', fontSize: '13px', lineHeight: '20px' },
			section: { display: 'flex', flexDirection: 'column', gap: '2px' },
			sectionTitle: { margin: '0 0 4px', fontSize: '14px', fontWeight: 500, lineHeight: '22px' },
			row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '10px 0', borderBottom: '0.5px solid var(--dsw-alias-border-l2)' },
			rowMain: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '0' },
			label: { fontWeight: 500 },
			hint: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: '18px' },
			note: { color: 'var(--dsw-alias-label-tertiary)' },
			error: { color: 'var(--dsw-alias-state-error-primary)' },
			renderFailure: { color: 'var(--dsw-alias-state-error-primary)', fontSize: '13px', lineHeight: '20px' },
			permissionValue: { flex: 'none', color: 'var(--dsw-alias-label-secondary)' },
		};

		/** Identity translate used when a slot renders without a locale seat. */
		function identityTranslate(key) {
			return key;
		}

		/** Whether the renderer has the browser Notification API at all. */
		function notificationSupported() {
			return typeof Notification !== 'undefined';
		}

		/** Read the browser-side permission state without throwing. */
		function readNotificationPermission() {
			if (!notificationSupported()) return 'unsupported';
			try {
				return Notification.permission || 'default';
			} catch (error) {
				return 'default';
			}
		}

		/** Localized label key for a permission value. */
		function permissionLabelKey(permission) {
			if (permission === 'granted') return 'settings.permissionGranted';
			if (permission === 'denied') return 'settings.permissionDenied';
			if (permission === 'unsupported') return 'settings.permissionUnsupported';
			return 'settings.permissionDefault';
		}

		/** Optional hint key for a permission value. */
		function permissionHintKey(permission) {
			if (permission === 'denied') return 'settings.permissionDeniedHint';
			if (permission === 'default') return 'settings.permissionDefaultHint';
			return undefined;
		}

		/**
		 * Send the settings page's test notification, bypassing foreground
		 * suppression and configuration on purpose: it is the only probe for the
		 * macOS-level authorization that `Notification.permission` cannot see.
		 *
		 * @param t - translate function.
		 * @returns whether a notification object was created.
		 */
		function sendTestNotification(t) {
			if (!notificationSupported()) return { ok: false };
			try {
				var notification = new Notification(t('settings.testTitle'), {
					body: t('settings.testBody'),
					silent: false,
				});
				testNotifications.add(notification);
				notification.onclick = function () {
					try {
						window.focus();
					} catch (error) {
						// Focus is best-effort.
					}
					testNotifications.delete(notification);
					try {
						notification.close();
					} catch (error) {
						// Already dismissed.
					}
				};
				notification.onclose = function () {
					testNotifications.delete(notification);
				};
				return { ok: true };
			} catch (error) {
				console.warn('[dsh-notice] failed to show test notification', error);
				return { ok: false };
			}
		}

		/** Merge defaults, the current form value, and optimistic local edits. */
		function effectiveValues(snapshotValue, pending) {
			var values = {};
			for (var key in DEFAULT_CONFIG) values[key] = DEFAULT_CONFIG[key];
			if (snapshotValue && typeof snapshotValue === 'object') {
				for (var field in DEFAULT_CONFIG) {
					if (snapshotValue[field] !== undefined && snapshotValue[field] !== null) values[field] = snapshotValue[field];
				}
			}
			for (var edited in pending) values[edited] = pending[edited];
			return values;
		}

		/** Render the enabled-count summary shown on a plugin card. */
		function summaryText(t, enabledCount) {
			if (enabledCount >= 4) return t('settings.summaryOn');
			if (enabledCount <= 0) return t('settings.summaryOff');
			return t('settings.summaryPartial', { count: enabledCount });
		}

		/** Render one labelled switch row. */
		function switchRow(t, item, checked, disabled, onCommit) {
			return h('div', { key: item.field, style: SETTINGS_STYLES.row }, [
				h('div', { key: 'main', style: SETTINGS_STYLES.rowMain }, [
					h('span', { key: 'label', style: SETTINGS_STYLES.label }, t(item.label)),
					h('span', { key: 'hint', style: SETTINGS_STYLES.hint }, t(item.hint)),
				]),
				h(primitives.Switch, {
					key: 'switch',
					checked: checked,
					label: t(item.label),
					disabled: disabled,
					onChange: onCommit,
				}),
			]);
		}

		/**
		 * Detect which form contract the slot owner handed to the page.
		 *
		 * `plugins.row.config` passes its `ConfigPageForm` (`{ state, mutate }`):
		 * the page owner refreshes `state` through new props, so there is nothing to
		 * subscribe to. A full `ConfigForm` (subscribe/getSnapshot/set) is also
		 * accepted for other embedding sites and as the plugin-level fallback.
		 *
		 * Property access is defensive: a future form may expose a throwing getter,
		 * and that must degrade instead of blanking the page.
		 *
		 * @param form - the `props.form` value.
		 * @returns which capabilities the value offers.
		 */
		function formShape(form) {
			var shape = { state: false, store: false };
			if (form === undefined || form === null || typeof form !== 'object') return shape;
			try {
				shape.state = form.state !== undefined && form.state !== null && typeof form.mutate === 'function';
			} catch (error) {
				shape.state = false;
			}
			if (shape.state) return shape;
			try {
				shape.store = typeof form.subscribe === 'function' && typeof form.getSnapshot === 'function';
			} catch (error) {
				shape.store = false;
			}
			return shape;
		}

		/** Read an owner-supplied ConfigPageForm snapshot defensively. */
		function providedState(form) {
			try {
				var state = form === undefined || form === null ? undefined : form.state;
				return state !== undefined && state !== null && typeof state === 'object' ? state : EMPTY_FORM_SNAPSHOT;
			} catch (error) {
				return FAILED_FORM_SNAPSHOT;
			}
		}

		/** Read a full ConfigForm snapshot defensively. */
		function storeState(form) {
			try {
				var state = form === undefined || form === null ? undefined : form.getSnapshot();
				return state !== undefined && state !== null && typeof state === 'object' ? state : EMPTY_FORM_SNAPSHOT;
			} catch (error) {
				return FAILED_FORM_SNAPSHOT;
			}
		}

		/** Human-readable text for an unexpected render failure. */
		function failureMessage(error) {
			try {
				return error !== undefined && error !== null && error.message ? String(error.message) : String(error);
			} catch (nested) {
				return 'unknown error';
			}
		}

		/** Visible last-resort copy instead of a blank page. */
		function renderSettingsFailure(t, error) {
			return h('div', { style: SETTINGS_STYLES.renderFailure }, t('settings.renderFailed', { message: failureMessage(error) }));
		}

		/** React.Component when available; without it the boundary degrades to a pass-through. */
		var ReactComponentClass = typeof React.Component === 'function' ? React.Component : null;

		/** Error boundary around the page body: a render throw must show text, never a blank slot. */
		function SettingsErrorBoundary(props) {
			if (ReactComponentClass !== null) ReactComponentClass.call(this, props);
			this.props = props;
			this.state = { error: null };
		}
		if (ReactComponentClass !== null) {
			SettingsErrorBoundary.prototype = Object.create(ReactComponentClass.prototype);
			SettingsErrorBoundary.prototype.constructor = SettingsErrorBoundary;
		}
		SettingsErrorBoundary.getDerivedStateFromError = function (error) {
			return { error: error };
		};
		SettingsErrorBoundary.prototype.render = function () {
			var error = this.state === undefined || this.state === null ? null : this.state.error;
			if (error !== null && error !== undefined) {
				var boundaryT = this.props !== undefined && typeof this.props.t === 'function' ? this.props.t : identityTranslate;
				return renderSettingsFailure(boundaryT, error);
			}
			return this.props === undefined ? null : this.props.children;
		};

		/**
		 * The row configuration page registered into `plugins.row.config`.
		 *
		 * The slot owner hands over its `ConfigPageForm` (`{ state, mutate }`) and
		 * re-renders this page with a fresh snapshot on every change, so the body
		 * never subscribes in that mode. A full `ConfigForm` and the plugin-captured
		 * `ctx.configForms.get('notice')` are also supported.
		 *
		 * @param props - `view`, the slot's `form`, the locale `t`, and the fallback form.
		 * @returns the summary line or the configuration page.
		 */
		function NoticeSettingsPage(props) {
			var t = typeof props.t === 'function' ? props.t : identityTranslate;
			return h(SettingsErrorBoundary, { t: t }, h(NoticeSettingsBody, props));
		}

		/**
		 * The page body. All hooks run unconditionally; every form read is guarded
		 * so a wrong contract renders the loading/unavailable note instead of
		 * throwing out of the slot.
		 *
		 * @param props - the slot props (see {@link NoticeSettingsPage}).
		 * @returns the summary line or the configuration page.
		 */
		function NoticeSettingsBody(props) {
			var t = typeof props.t === 'function' ? props.t : identityTranslate;
			var form = props.form;
			var primaryShape = formShape(form);
			var fallbackForm = props.fallbackForm;
			var fallbackShape = formShape(fallbackForm);

			var usesState = primaryShape.state;
			var anchorForm;
			if (usesState || primaryShape.store) anchorForm = form;
			else if (fallbackShape.state || fallbackShape.store) anchorForm = fallbackForm;
			var anchorShape = anchorForm === form ? primaryShape : fallbackShape;
			var hasForm = usesState || anchorShape.state || anchorShape.store;

			var subscribe = React.useCallback(function (listener) {
				if (!anchorShape.store || anchorForm === undefined || anchorForm === null) return function () {};
				try {
					return anchorForm.subscribe(listener);
				} catch (error) {
					return function () {};
				}
			}, [anchorForm, anchorShape.store]);
			var getSnapshot = React.useCallback(function () {
				// In props-state mode the owner re-renders us; the store snapshot is unused.
				if (usesState) return EMPTY_FORM_SNAPSHOT;
				if (!anchorShape.store || anchorForm === undefined || anchorForm === null) return EMPTY_FORM_SNAPSHOT;
				return storeState(anchorForm);
			}, [usesState, anchorForm, anchorShape.store]);
			var storeSnapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

			var pendingState = React.useState({});
			var pending = pendingState[0];
			var setPending = pendingState[1];
			var permissionState = React.useState(readNotificationPermission);
			var permission = permissionState[0];
			var setPermission = permissionState[1];
			var testFailedState = React.useState(false);
			var testFailed = testFailedState[0];
			var setTestFailed = testFailedState[1];

			React.useEffect(function () {
				function refresh() {
					setPermission(readNotificationPermission());
				}
				refresh();
				window.addEventListener('focus', refresh);
				document.addEventListener('visibilitychange', refresh);
				return function () {
					window.removeEventListener('focus', refresh);
					document.removeEventListener('visibilitychange', refresh);
				};
			}, [setPermission]);

			var snapshot;
			if (usesState) snapshot = providedState(form);
			else if (anchorShape.state) snapshot = providedState(anchorForm);
			else snapshot = storeSnapshot;
			if (snapshot === undefined || snapshot === null || typeof snapshot !== 'object') snapshot = EMPTY_FORM_SNAPSHOT;

			if (!hasForm || snapshot.status === 'loading') {
				return h('div', { style: SETTINGS_STYLES.note }, t('settings.loading'));
			}
			if (snapshot.status === 'unavailable') {
				return h('div', { style: SETTINGS_STYLES.note }, t('settings.unavailable'));
			}

			var disabled = snapshot.writable === false;
			var values = effectiveValues(snapshot.value, pending);

			function dropPending(field) {
				setPending(function (previous) {
					var next = {};
					for (var key in previous) {
						if (key !== field) next[key] = previous[key];
					}
					return next;
				});
			}

			/**
			 * Write one field through whichever contract the page received.
			 * ConfigPageForm owns the revision fence, so its mutate gets one op
			 * and no expectedRevision.
			 */
			function commit(field, value) {
				setPending(function (previous) {
					var next = {};
					for (var key in previous) next[key] = previous[key];
					next[field] = value;
					return next;
				});
				setTestFailed(false);
				try {
					var settlement;
					var owner = usesState ? form : (anchorShape.state ? anchorForm : undefined);
					if (owner !== undefined && owner !== null && typeof owner.mutate === 'function') {
						settlement = owner.mutate([{ op: 'set', path: [field], value: value }]);
					} else if (anchorShape.store && anchorForm !== undefined && anchorForm !== null && typeof anchorForm.set === 'function') {
						settlement = anchorForm.set(field, value);
					} else if (anchorShape.store && anchorForm !== undefined && anchorForm !== null && typeof anchorForm.mutate === 'function') {
						settlement = anchorForm.mutate([{ op: 'set', path: [field], value: value }]);
					}
					if (settlement !== undefined && settlement !== null && typeof settlement.then === 'function') {
						settlement.then(function (accepted) {
							if (accepted === false) dropPending(field);
						}).catch(function () {
							dropPending(field);
						});
					} else if (settlement === false) {
						dropPending(field);
					}
				} catch (error) {
					dropPending(field);
				}
			}

			var enabledCount = 0;
			for (var index = 0; index < TRIGGER_FIELDS.length; index += 1) {
				if (values[TRIGGER_FIELDS[index].field] !== false) enabledCount += 1;
			}

			if (props.view === 'summary') {
				return h('span', null, summaryText(t, enabledCount));
			}

			function onTest() {
				var result = sendTestNotification(t);
				setPermission(readNotificationPermission());
				setTestFailed(!result.ok);
			}

			var hintKey = permissionHintKey(permission);
			var children = [
				h('section', { key: 'triggers', style: SETTINGS_STYLES.section }, [
					h('h4', { key: 'title', style: SETTINGS_STYLES.sectionTitle }, t('settings.groupTriggers')),
					TRIGGER_FIELDS.map(function (item) {
						return switchRow(t, item, values[item.field] !== false, disabled, function (next) {
							commit(item.field, next);
						});
					}),
				]),
				h('section', { key: 'content', style: SETTINGS_STYLES.section }, [
					h('h4', { key: 'title', style: SETTINGS_STYLES.sectionTitle }, t('settings.groupContent')),
					h('div', { key: 'sound', style: SETTINGS_STYLES.row }, [
						h('div', { key: 'main', style: SETTINGS_STYLES.rowMain }, [
							h('span', { key: 'label', style: SETTINGS_STYLES.label }, t('settings.soundPolicy')),
							h('span', { key: 'hint', style: SETTINGS_STYLES.hint }, t('settings.soundPolicyHint')),
						]),
						h(primitives.SegmentedControl, {
							key: 'control',
							id: 'dsh-notice-sound',
							value: values.soundPolicy,
							label: t('settings.soundPolicy'),
							disabled: disabled,
							options: SOUND_OPTIONS.map(function (option) {
								return { value: option.value, label: t(option.labelKey), disabled: disabled };
							}),
							onChange: function (next) {
								commit('soundPolicy', next);
							},
						}),
					]),
					CONTENT_FIELDS.map(function (item) {
						return switchRow(t, item, values[item.field] !== false, disabled, function (next) {
							commit(item.field, next);
						});
					}),
				]),
				h('section', { key: 'maintenance', style: SETTINGS_STYLES.section }, [
					h('h4', { key: 'title', style: SETTINGS_STYLES.sectionTitle }, t('settings.maintenance')),
					h('div', { key: 'test', style: SETTINGS_STYLES.row }, [
						h('div', { key: 'main', style: SETTINGS_STYLES.rowMain }, [
							h('span', { key: 'label', style: SETTINGS_STYLES.label }, t('settings.test')),
							h('span', { key: 'hint', style: SETTINGS_STYLES.hint }, testFailed ? t('settings.testUnavailable') : t('settings.testHint')),
						]),
						h(primitives.Button, {
							key: 'button',
							variant: 'outline',
							size: 'sm',
							onClick: onTest,
							disabled: !notificationSupported(),
						}, t('settings.test')),
					]),
					h('div', { key: 'permission', style: SETTINGS_STYLES.row }, [
						h('div', { key: 'main', style: SETTINGS_STYLES.rowMain }, [
							h('span', { key: 'label', style: SETTINGS_STYLES.label }, t('settings.permission')),
							hintKey === undefined ? null : h('span', { key: 'hint', style: SETTINGS_STYLES.hint }, t(hintKey)),
						]),
						h('span', { key: 'value', style: SETTINGS_STYLES.permissionValue }, t(permissionLabelKey(permission))),
					]),
				]),
			];

			if (disabled) children.unshift(h('div', { key: 'readonly', style: SETTINGS_STYLES.note }, t('settings.readOnly')));

			return h('div', { style: SETTINGS_STYLES.root }, children);
		}

		/** Key of this package's row configuration page. */
		var SETTINGS_ROW_KEY = '@hanxu131/dsh-notice#notice';
		//#endregion

		//#region triggers
		/** Required services: forwarded events, session status, catalog, config forms, copy, slots. */
		var inject = ['remote', 'sessions', 'configForms', 'locale', 'slots', 'uiSession'];

		/**
		 * Mount the browser half: dictionaries, event subscriptions, and the row's
		 * configuration page.
		 *
		 * @param ctx - browser plugin context.
		 */
		function apply(ctx) {
			var t = ctx.locale.bind(NS);
			ctx.effect(function () {
				return ctx.locale.register(NS, { zh: zh, en: en });
			}, 'notice: dictionaries');

			ctx.effect(function () {
				return initCompletion(ctx, t);
			}, 'notice: completion tracking');

			ctx.effect(function () {
				return ctx.remote.$on('api-session/status', function (sessionId, running) {
					handleStatus(ctx, t, sessionId, running);
				});
			}, 'notice: api-session/status');

			ctx.effect(function () {
				return ctx.remote.$on('api-session/error', function (sessionId, message) {
					try {
						notify(ctx, t, sessionId, 'error', { message: message });
					} catch (error) {
						console.warn('[dsh-notice] session error handler failed', error);
					}
				});
			}, 'notice: api-session/error');

			ctx.effect(function () {
				return ctx.remote.$on('api-session/added', function (summary) {
					handleAdded(ctx, t, summary);
				});
			}, 'notice: api-session/added');

			ctx.effect(function () {
				return ctx.remote.$on('api-session/removed', function (sessionId) {
					handleRemoved(ctx, t, sessionId);
				});
			}, 'notice: api-session/removed');

			/**
			 * Observe the Session UI status source for pending interactions. The
			 * official approval/question plugins claim their waterfalls before this
			 * row ever runs, but they publish the claimed interaction into
			 * `ctx.uiSession.sessionStatus`, which is order-independent.
			 */
			ctx.effect(function () {
				var source = ctx.uiSession === undefined || ctx.uiSession === null ? undefined : ctx.uiSession.sessionStatus;
				if (source === undefined || source === null || typeof source.getSnapshot !== 'function' || typeof source.subscribe !== 'function') {
					return function () {};
				}

				/** Collect the highest-precedence pending interaction per session. */
				function interactionMap(snapshot) {
					var current = new Map();
					if (snapshot === undefined || snapshot === null || typeof snapshot.forEach !== 'function') return current;
					try {
						snapshot.forEach(function (status, sessionId) {
							var interaction = status === undefined || status === null ? undefined : status.pendingInteraction;
							if (interaction !== undefined && interaction !== null && interaction.key !== undefined && interaction.key !== null) current.set(sessionId, interaction);
						});
					} catch (error) {
						console.warn('[dsh-notice] pending interaction scan failed', error);
					}
					return current;
				}

				/** Announce new interactions and forget interactions that settled. */
				function reconcile(snapshot) {
					try {
						var current = interactionMap(snapshot);
						var cleared = [];
						announcedPending.forEach(function (key, sessionId) {
							var interaction = current.get(sessionId);
							if (interaction === undefined || interaction.key !== key) cleared.push(sessionId);
						});
						for (var index = 0; index < cleared.length; index += 1) {
							announcedPending.delete(cleared[index]);
						}
						current.forEach(function (interaction, sessionId) {
							if (announcedPending.get(sessionId) === interaction.key) return;
							if (interaction.kind !== 'approval' && interaction.kind !== 'question' && interaction.kind !== 'plan-review') return;
							announcedPending.set(sessionId, interaction.key);
							if (interaction.kind === 'approval') {
								notify(ctx, t, sessionId, 'approval', {
									toolName: interaction.toolName,
									reason: interaction.reason,
									displayReason: interaction.displayReason,
								});
								return;
							}
							notify(ctx, t, sessionId, 'question', {
								count: Array.isArray(interaction.questions) ? interaction.questions.length : 1,
							});
						});
					} catch (error) {
						console.warn('[dsh-notice] pending interaction handler failed', error);
					}
				}

				// Announce interactions already pending when this bundle mounts (for
				// example after a page refresh), then follow every status change.
				// Blocking is updated from the same snapshot; the announce pass keeps
				// its own key-based dedupe and never gates completion.
				function observe() {
					try {
						var snapshot = readPendingSnapshot(ctx);
						if (snapshot === undefined || snapshot === null) return;
						var merged = syncPendingSnapshot(ctx, snapshot);
						if (merged === undefined) return;
						if (merged.metadataChanged) seedRunningRoots();
						evaluateAllCycles(ctx, t, merged.changed);
						reconcile(snapshot);
					} catch (error) {
						console.warn('[dsh-notice] pending interaction handler failed', error);
					}
				}

				observe();
				var unsubscribe = source.subscribe(observe);
				return typeof unsubscribe === 'function' ? unsubscribe : function () {};
			}, 'notice: pending interactions');

			// Fallback form for embedding sites that do not hand one over: the full
			// ConfigForm captured once here. A failed or not-yet-served lookup stays
			// undefined and the page renders its loading note instead of crashing.
			var fallbackConfigForm;
			try {
				fallbackConfigForm = ctx.configForms.get(ENTRY_ID);
			} catch (error) {
				fallbackConfigForm = undefined;
			}

			ctx.effect(function () {
				return ctx.slots.inject('plugins.row.config', function () {
					return ctx.slots.register({
						name: 'plugins.row.config',
						key: SETTINGS_ROW_KEY,
						locale: NS,
						inject: function () {
							var fallback = fallbackConfigForm;
							if (fallback === undefined || fallback === null) {
								try {
									fallback = ctx.configForms.get(ENTRY_ID);
								} catch (error) {
									fallback = undefined;
								}
							}
							return { fallbackForm: fallback };
						},
					}, NoticeSettingsPage);
				});
			}, 'notice: settings page');

			ctx.effect(function () {
				return function () {
					closeAll();
					testNotifications.forEach(function (notification) {
						try {
							notification.close();
						} catch (error) {
							// Already dismissed.
						}
					});
					testNotifications.clear();
					subagentSessions.clear();
					announcedPending.clear();
				};
			}, 'notice: live notifications');
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
