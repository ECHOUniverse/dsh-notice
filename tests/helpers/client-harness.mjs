/**
 * Shared harness for the handwritten client bundle.
 *
 * `src/client.js` is a browser classic script: it registers a factory on
 * `window.__ModuleLoader__` and only requires baseline browser modules. Tests
 * execute it in a `node:vm` context with fake React/primitives, then drive the
 * exported `apply()` through the forwarded-event handlers and a fake
 * `Notification` class. No bundler, transpiler, or DOM is involved.
 */
import fs from 'node:fs'
import vm from 'node:vm'

const CLIENT_SOURCE = new URL('../../src/client.js', import.meta.url)
/** Hard stop for runaway virtual timers (a timer scheduling a zero-delay timer forever). */
const MAX_TIMER_STEPS = 1000

/** Notification objects created by the bundle under test. */
export class FakeNotification {
  static instances = []
  static permission = 'granted'

  constructor(title, options) {
    this.title = title
    this.options = options || {}
    this.closed = false
    FakeNotification.instances.push(this)
  }

  close() {
    this.closed = true
  }

  static reset(permission = 'granted') {
    FakeNotification.instances = []
    FakeNotification.permission = permission
  }
}

/** Minimal React stub: createElement plus the hooks the settings page uses. */
export function makeReactStub() {
  return {
    createElement(type, props, ...children) {
      const flat = []
      const push = (value) => {
        if (Array.isArray(value)) value.forEach(push)
        else if (value !== null && value !== undefined && value !== false) flat.push(value)
      }
      push(children)
      const elementProps = props || {}
      // Match React's element props: children ride on props as well as the tree.
      if (flat.length === 1) elementProps.children = flat[0]
      else if (flat.length > 1) elementProps.children = flat
      return { type, props: elementProps, children: flat }
    },
    useCallback(fn) {
      return fn
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      return getSnapshot()
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    useEffect() {},
  }
}

/** Primitives stub: components stay identifiable nodes in the rendered tree. */
export const PRIMITIVES_STUB = { Switch: 'Switch', SegmentedControl: 'SegmentedControl', Button: 'Button' }

/** Required browser baseline modules (mirrors ADR 0002). */
export const BASELINE_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

/** Load `src/client.js` into a fresh VM context and return its module exports. */
export function loadClient() {
  const source = fs.readFileSync(CLIENT_SOURCE, 'utf8')
  const window = {
    __ModuleLoader__: {
      load(config) {
        if (window.captured !== undefined) throw new Error('client bundle registered twice')
        window.captured = config
      },
    },
    focusCount: 0,
    focus() {
      window.focusCount += 1
    },
  }
  const sandbox = {
    window,
    console,
    Notification: FakeNotification,
    document: undefined,
    Symbol,
    Map,
    Set,
    Array,
    Math,
    JSON,
    Object,
    Number,
    String,
    RegExp,
    isNaN,
    parseInt,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    // Deterministic clock: tests set `sandbox.__now` to control durations.
    Date: { now: () => sandbox.__now },
  }
  sandbox.__now = 1_000_000

  // Virtual timers: no test ever sleeps. Callbacks run in due order when the
  // test calls `advance(ms)`, and timers scheduled inside a callback run too.
  const timers = new Map()
  let nextTimerId = 0
  function fakeSetTimeout(callback, delay, ...args) {
    const id = (nextTimerId += 1)
    const wait = typeof delay === 'number' && Number.isFinite(delay) ? Math.max(0, delay) : 0
    timers.set(id, { id, callback, args, due: sandbox.__now + wait })
    return id
  }
  function fakeClearTimeout(id) {
    timers.delete(id)
  }
  function advance(ms) {
    const delta = typeof ms === 'number' && Number.isFinite(ms) ? Math.max(0, ms) : 0
    const target = sandbox.__now + delta
    let steps = 0
    while (true) {
      let next
      timers.forEach((entry) => {
        if (entry.due > target) return
        if (next === undefined || entry.due < next.due || (entry.due === next.due && entry.id < next.id)) next = entry
      })
      if (next === undefined) break
      if (steps >= MAX_TIMER_STEPS) {
        console.warn('[client-harness] advance hit the timer iteration limit')
        break
      }
      steps += 1
      timers.delete(next.id)
      sandbox.__now = Math.max(sandbox.__now, next.due)
      try {
        next.callback(...next.args)
      } catch (error) {
        console.warn('[client-harness] timer callback failed', error)
      }
    }
    sandbox.__now = target
  }

  const context = vm.createContext(sandbox)
  vm.runInContext(source, context, { filename: 'client.js' })
  const captured = window.captured
  if (captured === undefined) throw new Error('client bundle did not call __ModuleLoader__.load')
  const requested = []
  const modules = { react: makeReactStub(), '@deepseek-ai/dsh-client-ui-primitives': PRIMITIVES_STUB }
  const module = captured.factory((name) => {
    requested.push(name)
    if (!BASELINE_MODULES.has(name)) throw new Error(`client bundle requested a non-baseline module: ${name}`)
    if (modules[name] === undefined) throw new Error(`unexpected require: ${name}`)
    return modules[name]
  })
  return { id: captured.id, module, sandbox, window, requested, modules, advance }
}

/** Translate from a registered dictionary, mirroring the locale service's lookup. */
function translate(dicts, ns, lang, key, params) {
  const registered = dicts.get(ns) || {}
  const table = registered[lang] || registered.zh || {}
  let text = table[key] !== undefined ? table[key] : key
  if (params !== undefined) {
    text = text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
  }
  return text
}

/**
 * Apply the client half against a fake client context.
 *
 * @param options - configuration and catalog fixtures for one test.
 * @returns the fake context, captured handlers, and convenience drivers.
 */
export function createHarness(options = {}) {
  FakeNotification.reset(options.permission || 'granted')
  const loaded = loadClient()
  const state = {
    value: options.value === undefined ? {} : options.value,
    status: options.status || 'ready',
    writable: options.writable !== false,
    summaries: { ...(options.summaries || {}) },
    // Optional Host-list id fixture: when omitted, every summary key is listed.
    ids: options.ids === undefined ? undefined : [...options.ids],
    projections: { ...(options.projections || {}) },
    lang: options.locale || 'zh',
  }
  const handlers = new Map()
  const dicts = new Map()
  const summaryListeners = new Set()
  const statusListeners = new Set()
  const statusState = { snapshot: options.sessionStatus instanceof Map ? options.sessionStatus : new Map() }
  const sessionStatus = {
    getSnapshot: () => statusState.snapshot,
    subscribe(listener) {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },
  }
  function publishStatus(next) {
    statusState.snapshot = next
    statusListeners.forEach((listener) => {
      try {
        listener()
      } catch (error) {
        // A listener failure belongs to its owner.
      }
    })
  }
  function writeStatus(sessionId, update) {
    const next = new Map(statusState.snapshot)
    const previous = next.get(sessionId) || { running: false, completionUnread: false, pendingInteraction: undefined }
    next.set(sessionId, { ...previous, ...update(previous) })
    publishStatus(next)
  }
  const disposers = []
  const formSubscribers = new Set()
  const formSetCalls = []
  const registration = { options: undefined, component: undefined, injectFace: {} }
  const configFormAvailable = options.configFormsAvailable !== false

  const form = {
    getSnapshot() {
      return { status: state.status, value: state.value, writable: state.writable, revision: 3, base: undefined, user: {} }
    },
    subscribe(listener) {
      formSubscribers.add(listener)
      return () => formSubscribers.delete(listener)
    },
    set(field, value) {
      formSetCalls.push([field, value])
      state.value = { ...state.value, [field]: value }
      formSubscribers.forEach((listener) => listener())
      return Promise.resolve(true)
    },
    unset(field) {
      formSetCalls.push([field, undefined, 'unset'])
      const next = { ...state.value }
      delete next[field]
      state.value = next
      formSubscribers.forEach((listener) => listener())
      return Promise.resolve(true)
    },
    mutate(ops, expectedRevision) {
      formSetCalls.push(['mutate', ops, expectedRevision])
      return Promise.resolve(true)
    },
  }

  const ctx = {
    locale: {
      bind(ns) {
        return (key, params) => translate(dicts, ns, state.lang, key, params)
      },
      register(ns, dictsForLocale) {
        dicts.set(ns, dictsForLocale)
        return () => dicts.delete(ns)
      },
    },
    remote: {
      $on(event, listener) {
        handlers.set(event, listener)
        return () => handlers.delete(event)
      },
    },
    sessions: {
      list: {
        getSnapshot() {
          return {
            ids: state.ids === undefined ? Object.keys(state.summaries) : [...state.ids],
            byId: state.summaries,
            phase: 'ready',
            projectionsBySession: state.projections,
          }
        },
        subscribe(listener) {
          summaryListeners.add(listener)
          return () => summaryListeners.delete(listener)
        },
      },
      scopeOf(subject) {
        return subject && subject.__sessionId
      },
    },
    configForms: {
      get() {
        if (!configFormAvailable) throw new Error('config form is not served in this fixture')
        return form
      },
    },
    uiSession: options.uiSessionAvailable === false ? undefined : { sessionStatus },
    slots: {
      inject(name, callback) {
        if (name !== 'plugins.row.config') throw new Error('unexpected slot: ' + name)
        callback()
        return () => {}
      },
      register(slotOptions, component) {
        registration.options = slotOptions
        registration.component = component
        registration.injectFace = {}
        if (typeof slotOptions.inject === 'function') {
          try {
            registration.injectFace = slotOptions.inject() || {}
          } catch (error) {
            registration.injectFace = {}
          }
        }
        return () => {
          registration.options = undefined
          registration.component = undefined
          registration.injectFace = {}
        }
      },
    },
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
  }

  loaded.module.apply(ctx)

  return {
    loaded,
    ctx,
    form,
    state,
    handlers,
    registration,
    formSetCalls,
    /** Fire a forwarded emit event. */
    emit(event, ...args) {
      const listener = handlers.get(event)
      if (listener === undefined) throw new Error('no handler for ' + event)
      return listener(...args)
    },
    /** Fire a forwarded scoped waterfall with an Agent-ish subject. */
    waterfall(event, subject, ...args) {
      const listener = handlers.get(event)
      if (listener === undefined) throw new Error('no handler for ' + event)
      return listener.call(subject, ...args)
    },
    /** Replace the whole enabled/overridden configuration document. */
    setConfig(next) {
      state.value = { ...next }
    },
    /** Change one config field. */
    setConfigField(field, value) {
      state.value = { ...state.value, [field]: value }
    },
    setLocale(lang) {
      state.lang = lang
    },
    setSummaries(next, ids) {
      state.summaries = { ...next }
      // The optional `ids` argument models the Host list baseline: keys absent
      // from it exist only as `byId` fallback rows. Omitting it restores the
      // default where every summary row is Host-listed.
      state.ids = ids === undefined ? undefined : [...ids]
      summaryListeners.forEach((listener) => {
        try {
          listener()
        } catch (error) {
          // A listener failure belongs to its owner.
        }
      })
    },
    setProjections(next) {
      state.projections = { ...next }
    },
    /** Replace the whole uiSession.sessionStatus snapshot. */
    setSessionStatus(next) {
      publishStatus(next instanceof Map ? next : new Map(Object.entries(next || {})))
    },
    /** Publish a pending interaction for one session, like the official plugins do. */
    upsertPending(sessionId, interaction) {
      writeStatus(sessionId, () => ({ pendingInteraction: interaction }))
    },
    /** Clear the pending interaction for one session. */
    clearPending(sessionId) {
      writeStatus(sessionId, () => ({ pendingInteraction: undefined }))
    },
    /** Names of every forwarded event this plugin subscribed to. */
    remoteEvents() {
      return [...handlers.keys()]
    },
    /** Set the durable title projection for one session. */
    setProjectionTitle(sessionId, title) {
      state.projections = { ...state.projections, [sessionId]: { values: { title } } }
    },
    setNow(value) {
      loaded.sandbox.__now = value
    },
    /** Move the virtual clock forward and run every timer that falls due. */
    advance(ms) {
      loaded.advance(ms)
    },
    focusDocument(focused) {
      loaded.sandbox.document = focused
        ? { hasFocus: () => true, addEventListener() {}, removeEventListener() {} }
        : undefined
    },
    /** Dispose the plugin the way Cordis teardown would. */
    dispose() {
      while (disposers.length > 0) {
        const dispose = disposers.pop()
        try {
          dispose()
        } catch (error) {
          // Disposal is best-effort in tests too.
        }
      }
    },
    notifications() {
      return FakeNotification.instances
    },
  }
}

/**
 * Flatten a fake React tree into its nodes and text.
 *
 * Function components (the page body) and class components (the error boundary)
 * are invoked here, because this React stub does not have a renderer: rendering
 * a component is what the real renderer would do.
 */
export function flattenTree(node, out = []) {
  if (node === null || node === undefined) return out
  if (typeof node === 'string') {
    out.push(node)
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => flattenTree(child, out))
    return out
  }
  if (typeof node.type === 'function') {
    const component = node.type
    if (component.prototype && typeof component.prototype.render === 'function') {
      const instance = new component(node.props)
      if (typeof component.getDerivedStateFromError === 'function') {
        // Mirror React: render the subtree, and render the boundary's fallback
        // state when a descendant throws.
        try {
          flattenTree(instance.render(), out)
          return out
        } catch (error) {
          instance.state = component.getDerivedStateFromError(error)
          flattenTree(instance.render(), out)
          return out
        }
      }
      flattenTree(instance.render(), out)
      return out
    }
    // Function components throw like real React does; a boundary above catches it.
    flattenTree(component(node.props), out)
    return out
  }
  out.push(node)
  node.children.forEach((child) => flattenTree(child, out))
  return out
}

/**
 * Client list-row fixture (`SessionListState.byId` shape: identity field `id`).
 *
 * The optional `title` mirrors what the client controller may derive from the
 * projection; the bundle under test must read the projection itself, so copy
 * tests set `projections` explicitly.
 */
export function session(id, extra = {}) {
  return {
    id,
    displayTitle: 'Session ' + id,
    cwd: '/tmp/project-' + id,
    running: false,
    ...extra,
  }
}

/** Host wire summary fixture for `api-session/added` (identity field `sessionId`). */
export function wireSession(id, extra = {}) {
  return {
    sessionId: id,
    agentAvailable: true,
    running: false,
    blank: false,
    updatedAt: 0,
    ...extra,
  }
}
