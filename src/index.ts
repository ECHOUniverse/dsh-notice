/**
 * `@hanxu131/dsh-notice` — macOS system notifications for DeepSeek Harness.
 *
 * This is the host half. It only declares the persistent configuration schema:
 * every field is `.volatile()` so the Settings form can rewrite it in place, and
 * so the browser half can read live values. Notification delivery lives in the
 * client half (see `docs/adr/0001-notification-channel.md`), because macOS
 * attributes a notification to the bundle that sends it and only the renderer
 * process can send with DeepSeek Harness's identity.
 *
 * Named exports are required so the Cordis loader retains `inject` and `Config`.
 *
 * @module @hanxu131/dsh-notice
 */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

/** Row id of this plugin inside a profile composition; the client half keys its UI by it. */
export const name = 'notice'

/** No host services are required: the host half owns no behaviour. */
export const inject = [] as const

/** Sound policy for delivered notifications. */
export type SoundPolicy = 'smart' | 'all' | 'none'

/**
 * Parsed plugin configuration. Each field is a live `Volatile` reference, so
 * consumers read the current value through `.get()` instead of caching it.
 */
export interface Config {
  /** Send a notification when an agent becomes fully idle. */
  notifyOnComplete: Volatile<boolean>
  /** Send a notification when an agent asks the user questions. */
  notifyOnQuestion: Volatile<boolean>
  /** Send a notification when an agent requests approval. */
  notifyOnApproval: Volatile<boolean>
  /** Send a notification when an agent fails. */
  notifyOnError: Volatile<boolean>
  /** Which notifications play the system sound. */
  soundPolicy: Volatile<SoundPolicy>
  /** Keep prompt text, model output, and full commands out of notification bodies. */
  redact: Volatile<boolean>
  /** Use the session title as the notification title (otherwise the app name). */
  showSessionTitle: Volatile<boolean>
  /** Let a new notification for a session replace that session's previous one. */
  replaceBySession: Volatile<boolean>
}

/**
 * Runtime configuration schema. All fields are top-level scalars because the
 * settings form only addresses top-level paths, and all are volatile so a save
 * takes effect without reloading the plugin.
 */
export const Config = z.object({
  notifyOnComplete: z.boolean().default(true).volatile(),
  notifyOnQuestion: z.boolean().default(true).volatile(),
  notifyOnApproval: z.boolean().default(true).volatile(),
  notifyOnError: z.boolean().default(true).volatile(),
  soundPolicy: z.union(['smart', 'all', 'none']).default('smart').volatile(),
  redact: z.boolean().default(true).volatile(),
  showSessionTitle: z.boolean().default(true).volatile(),
  replaceBySession: z.boolean().default(true).volatile(),
})

/**
 * Mount the host half. Delivery happens entirely in the browser half; the host
 * half exists only to declare the configuration above, so there is nothing to
 * start here.
 *
 * @param _ctx - host plugin context.
 * @param _config - validated configuration: live volatile references.
 */
export function apply(_ctx: Context, _config: Config): void {
  // Intentionally empty: the host half only declares configuration.
}
