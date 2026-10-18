window.__ModuleLoader__.load({
	id: '@hanxu131/dsh-notice',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

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
		 * @param t - translate function.
		 * @param kind - trigger kind.
		 * @param payload - event-specific facts.
		 * @param config - resolved configuration.
		 * @param summary - session summary, when the catalog has one.
		 * @returns title and body.
		 */
		function composeNotification(t, kind, payload, config, summary) {
			var project = summary === undefined ? '' : basename(summary.cwd);
			var title;
			if (config.showSessionTitle === false) {
				title = t('app.name');
			} else {
				title = (summary && typeof summary.title === 'string' && summary.title.trim() !== '') ? summary.title : (project || t('app.name'));
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
		 * @param summary - session summary, when known.
		 */
		function showNotification(t, kind, sessionId, payload, config, summary) {
			if (typeof Notification === 'undefined') return;
			var copy = composeNotification(t, kind, payload, config, summary);
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
		 * Read the catalog summary for one session, if the list has it.
		 *
		 * @param ctx - client plugin context.
		 * @param sessionId - session identity.
		 * @returns the summary, or undefined.
		 */
		function sessionSummary(ctx, sessionId) {
			try {
				var state = ctx.sessions.list.getSnapshot();
				return state && state.byId ? state.byId[sessionId] : undefined;
			} catch (error) {
				return undefined;
			}
		}

		/**
		 * Whether this session is a subagent child; subagents never notify.
		 *
		 * @param ctx - client plugin context.
		 * @param sessionId - session identity.
		 * @returns true for subagent sessions.
		 */
		function isSubagent(ctx, sessionId) {
			if (subagentSessions.has(sessionId)) return true;
			var summary = sessionSummary(ctx, sessionId);
			return summary !== undefined && summary.origin === 'subagent';
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
				if (isSubagent(ctx, sessionId)) return;
				showNotification(t, kind, sessionId, payload, config, sessionSummary(ctx, sessionId));
			} catch (error) {
				console.warn('[dsh-notice] notification dispatch failed', error);
			}
		}
		//#endregion

		//#region triggers
		/** Required services: forwarded events, session catalog, config forms, copy, slots. */
		var inject = ['remote', 'sessions', 'configForms', 'locale', 'slots'];

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
						if (summary.origin === 'subagent') subagentSessions.add(summary.id);
						else subagentSessions.delete(summary.id);
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

			ctx.effect(function () {
				return ctx.remote.$on('user-questions/request', function (request, next) {
					try {
						var sessionId = ctx.sessions.scopeOf(this);
						var count = request && Array.isArray(request.questions) ? request.questions.length : 0;
						if (sessionId !== undefined) notify(ctx, t, sessionId, 'question', { count: count });
					} catch (error) {
						console.warn('[dsh-notice] question handler failed', error);
					}
					// Listen only: the question card's waterfall must proceed untouched.
					return next();
				});
			}, 'notice: user-questions/request');

			ctx.effect(function () {
				return ctx.remote.$on('approval/request', function (request, next) {
					try {
						var sessionId = ctx.sessions.scopeOf(this);
						if (sessionId !== undefined) {
							notify(ctx, t, sessionId, 'approval', {
								toolName: request === undefined ? '' : request.toolName,
								reason: request === undefined ? undefined : request.reason,
								displayReason: request === undefined || request.displayReason === undefined ? undefined : (request.displayReason.en),
							});
						}
					} catch (error) {
						console.warn('[dsh-notice] approval handler failed', error);
					}
					// Listen only: approval keeps its own waterfall.
					return next();
				});
			}, 'notice: approval/request');

			ctx.effect(function () {
				return function () {
					closeAll();
					subagentSessions.clear();
					runStartedAt.clear();
				};
			}, 'notice: live notifications');
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
