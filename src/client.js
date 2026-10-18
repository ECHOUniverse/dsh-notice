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
		/** Start time of the current run per session, for completion durations. */
		var runStartedAt = new Map();

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
				return ctx.remote.$on('api-session/status', function (sessionId, running) {
					try {
						if (running === true) {
							if (!runStartedAt.has(sessionId)) runStartedAt.set(sessionId, Date.now());
							return;
						}
						var startedAt = runStartedAt.get(sessionId);
						runStartedAt.delete(sessionId);
						var durationMs = startedAt === undefined ? undefined : Math.max(0, Date.now() - startedAt);
						notify(ctx, t, sessionId, 'complete', { durationMs: durationMs });
					} catch (error) {
						console.warn('[dsh-notice] session status handler failed', error);
					}
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
					try {
						if (summary === undefined || summary === null) return;
						// `api-session/added` forwards the Host wire summary, whose identity
						// field is `sessionId` (the client list row later mirrors it as `id`).
						if (summary.sessionId === undefined || summary.sessionId === null) return;
						if (summary.origin === 'subagent') subagentSessions.add(summary.sessionId);
						else subagentSessions.delete(summary.sessionId);
					} catch (error) {
						// Catalog bookkeeping is best-effort.
					}
				});
			}, 'notice: api-session/added');

			ctx.effect(function () {
				return ctx.remote.$on('api-session/removed', function (sessionId) {
					subagentSessions.delete(sessionId);
					runStartedAt.delete(sessionId);
					closeSession(sessionId);
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
				reconcile(source.getSnapshot());
				var unsubscribe = source.subscribe(function () {
					reconcile(source.getSnapshot());
				});
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
					runStartedAt.clear();
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
