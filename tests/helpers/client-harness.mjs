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
      return { type, props: props || {}, children: flat }
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
    setTimeout,
    clearTimeout,
    // Deterministic clock: tests set `sandbox.__now` to control durations.
    Date: { now: () => sandbox.__now },
  }
  sandbox.__now = 1_000_000
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
  return { id: captured.id, module, sandbox, window, requested, modules }
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
    addedSummaries: [],
    lang: options.locale || 'zh',
  }
  const handlers = new Map()
  const dicts = new Map()
  const disposers = []
  const formSubscribers = new Set()
  const formSetCalls = []
  const registration = { options: undefined, component: undefined }

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
          return { ids: Object.keys(state.summaries), byId: state.summaries }
        },
      },
      scopeOf(subject) {
        return subject && subject.__sessionId
      },
    },
    configForms: {
      get() {
        return form
      },
    },
    slots: {
      inject(name, callback) {
        if (name !== 'plugins.row.config') throw new Error('unexpected slot: ' + name)
        callback()
        return () => {}
      },
      register(slotOptions, component) {
        registration.options = slotOptions
        registration.component = component
        return () => {
          registration.options = undefined
          registration.component = undefined
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
    setSummaries(next) {
      state.summaries = { ...next }
    },
    setNow(value) {
      loaded.sandbox.__now = value
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

/** Flatten a fake React tree into its nodes and text. */
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
  out.push(node)
  node.children.forEach((child) => flattenTree(child, out))
  return out
}

/** Session summary fixture. */
export function session(id, extra = {}) {
  return {
    id,
    title: 'Session ' + id,
    displayTitle: 'Session ' + id,
    cwd: '/tmp/project-' + id,
    running: false,
    ...extra,
  }
}
