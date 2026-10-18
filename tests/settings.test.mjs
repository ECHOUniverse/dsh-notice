/**
 * Behaviour tests for the row configuration page registered into
 * `plugins.row.config`, rendered through a minimal React stub.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createHarness, flattenTree } from './helpers/client-harness.mjs'

const ALL_ON = { notifyOnComplete: true, notifyOnQuestion: true, notifyOnApproval: true, notifyOnError: true }

function render(h, view = 'page', form = h.form) {
  const component = h.registration.component
  assert.equal(typeof component, 'function', 'the page component was registered')
  return component({ view, form, t: h.ctx.locale.bind('notice'), ...h.registration.injectFace })
}

function nodesOfType(tree, type) {
  return flattenTree(tree).filter((node) => node !== null && typeof node === 'object' && node.type === type)
}

function textsOf(tree) {
  return flattenTree(tree).filter((node) => typeof node === 'string')
}

test('registers a keyed page for the notice row with its locale namespace', () => {
  const h = createHarness()
  const options = h.registration.options
  assert.equal(options.name, 'plugins.row.config')
  assert.equal(options.key, '@hanxu131/dsh-notice#notice')
  assert.equal(options.locale, 'notice')
})

test('summary view reports how many notification types are enabled', () => {
  const all = createHarness({ value: ALL_ON })
  assert.ok(textsOf(render(all, 'summary')).includes('4 类通知已开启'))

  const none = createHarness({ value: { notifyOnComplete: false, notifyOnQuestion: false, notifyOnApproval: false, notifyOnError: false } })
  assert.ok(textsOf(render(none, 'summary')).includes('所有通知已关闭'))

  const partial = createHarness({ value: { notifyOnComplete: false } })
  assert.ok(textsOf(render(partial, 'summary')).includes('3 类通知已开启'))
})

test('page view renders the eight fields, the test button, and the permission row', () => {
  const h = createHarness({ value: ALL_ON })
  const tree = render(h)
  const texts = textsOf(tree)

  assert.equal(nodesOfType(tree, 'Switch').length, 7, '4 trigger switches + 3 content switches')
  assert.equal(nodesOfType(tree, 'SegmentedControl').length, 1, 'sound policy control')
  assert.equal(nodesOfType(tree, 'Button').length, 1, 'test notification button')

  for (const label of [
    '最终完成时通知',
    '提问时通知',
    '请求权限时通知',
    '出错时通知',
    '脱敏正文',
    '使用会话标题',
    '同会话替换',
  ]) {
    assert.ok(texts.includes(label), label + ' is rendered')
  }
  assert.ok(texts.includes('发送测试通知'))
  assert.ok(texts.includes('通知权限状态'))
  assert.ok(texts.includes('已授权'))
})

test('sound policy control offers smart, all, and none', () => {
  const h = createHarness({ value: ALL_ON })
  const control = nodesOfType(render(h), 'SegmentedControl')[0]
  // Spread into this realm's array: the bundle's own arrays come from the VM realm.
  assert.deepEqual([...control.props.options].map((option) => option.value), ['smart', 'all', 'none'])
})

test('switch edits write the matching config field', () => {
  const h = createHarness({ value: ALL_ON })
  const switches = nodesOfType(render(h), 'Switch')
  const complete = switches.find((node) => node.props.label === '最终完成时通知')
  complete.props.onChange(false)
  assert.deepEqual(h.formSetCalls[0], ['notifyOnComplete', false])

  const redact = switches.find((node) => node.props.label === '脱敏正文')
  redact.props.onChange(false)
  assert.deepEqual(h.formSetCalls[1], ['redact', false])
})

test('sound selection writes soundPolicy', () => {
  const h = createHarness({ value: ALL_ON })
  nodesOfType(render(h), 'SegmentedControl')[0].props.onChange('none')
  assert.deepEqual(h.formSetCalls[0], ['soundPolicy', 'none'])
})

test('test button sends a notification named dsh-notice test', () => {
  const h = createHarness()
  const button = nodesOfType(render(h), 'Button')[0]
  button.props.onClick({})
  const [notification] = h.notifications()
  assert.equal(notification.title, 'dsh-notice test')
  assert.equal(notification.options.silent, false)
})

test('denied permission shows the System Settings hint', () => {
  const h = createHarness({ permission: 'denied' })
  const texts = textsOf(render(h))
  assert.ok(texts.includes('已拒绝'))
  assert.ok(texts.includes('请在「系统设置 → 通知 → DeepSeek Harness」中允许通知。'))
})

test('read-only deployments disable every control and explain why', () => {
  const h = createHarness({ writable: false })
  const tree = render(h)
  const switches = nodesOfType(tree, 'Switch')
  assert.ok(switches.every((node) => node.props.disabled === true))
  assert.ok(nodesOfType(tree, 'SegmentedControl')[0].props.disabled === true)
  assert.ok(textsOf(tree).includes('本部署的通知配置为只读。'))
})

test('loading, unavailable, and missing forms render a note instead of crashing', () => {
  const loading = createHarness({ status: 'loading' })
  assert.ok(textsOf(render(loading)).includes('正在读取配置…'))

  const unavailable = createHarness({ status: 'unavailable' })
  assert.ok(textsOf(render(unavailable)).includes('当前部署没有提供可写的通知配置。'))

  // No slot form and no capturable config form: the page shows its loading note.
  const missing = createHarness({ configFormsAvailable: false })
  assert.ok(textsOf(render(missing, 'page', null)).includes('正在读取配置…'))
})

test('a slot that hands no form falls back to the captured ConfigForm', () => {
  const h = createHarness({ value: ALL_ON })
  const tree = render(h, 'page', null)
  assert.equal(nodesOfType(tree, 'Switch').length, 7)
  assert.equal(nodesOfType(tree, 'SegmentedControl').length, 1)
})

test('real ConfigPageForm shape { state, mutate } renders and writes through mutate', () => {
  const h = createHarness({ configFormsAvailable: false })
  const mutateArgs = []
  const form = {
    state: { status: 'ready', value: { ...ALL_ON }, writable: true, revision: 7 },
    mutate(...args) {
      mutateArgs.push(args)
      return Promise.resolve(true)
    },
  }
  // The real contract has no subscribe; a throwing getter proves the page never
  // probes for a subscription in props-state mode.
  Object.defineProperty(form, 'subscribe', {
    get() {
      throw new Error('ConfigPageForm.subscribe must not be accessed')
    },
  })

  const tree = render(h, 'page', form)
  const switches = nodesOfType(tree, 'Switch')
  assert.equal(switches.length, 7, 'all trigger/content switches render')
  assert.equal(nodesOfType(tree, 'SegmentedControl').length, 1, 'sound policy renders')
  assert.equal(nodesOfType(tree, 'Button').length, 1, 'test button renders')
  assert.deepEqual(
    [...switches].map((node) => node.props.label),
    ['最终完成时通知', '提问时通知', '请求权限时通知', '出错时通知', '脱敏正文', '使用会话标题', '同会话替换'],
  )

  const complete = switches.find((node) => node.props.label === '最终完成时通知')
  complete.props.onChange(false)
  assert.equal(mutateArgs.length, 1)
  assert.equal(mutateArgs[0].length, 1, 'mutate receives only the ops; no expectedRevision')
  const firstOps = mutateArgs[0][0]
  assert.equal(firstOps.length, 1)
  assert.equal(firstOps[0].op, 'set')
  assert.deepEqual([...firstOps[0].path], ['notifyOnComplete'])
  assert.equal(firstOps[0].value, false)

  nodesOfType(tree, 'SegmentedControl')[0].props.onChange('none')
  const secondOps = mutateArgs[1][0]
  assert.deepEqual([...secondOps[0].path], ['soundPolicy'])
  assert.equal(secondOps[0].value, 'none')
})

test('state-mode summary reads the owner-supplied snapshot without a subscription', () => {
  const h = createHarness({ configFormsAvailable: false })
  const form = {
    state: { status: 'ready', value: { notifyOnComplete: false }, writable: true, revision: 2 },
    mutate() {
      return Promise.resolve(true)
    },
  }
  assert.ok(textsOf(render(h, 'summary', form)).includes('3 类通知已开启'))
})

test('a render throw is caught by the page boundary and shown as visible text', () => {
  const h = createHarness({ value: ALL_ON })
  const props = {
    form: h.form,
    t: h.ctx.locale.bind('notice'),
    ...h.registration.injectFace,
  }
  Object.defineProperty(props, 'view', {
    get() {
      throw new Error('synthetic render failure')
    },
  })
  const texts = textsOf(h.registration.component(props))
  assert.ok(
    texts.some((text) => text.includes('配置页渲染失败：') && text.includes('synthetic render failure')),
    'the boundary fallback is visible instead of a blank slot',
  )
})

test('a throwing snapshot getter degrades to a visible note, not a blank page', () => {
  const h = createHarness({ configFormsAvailable: false })
  const form = { mutate() { return Promise.resolve(true) } }
  Object.defineProperty(form, 'state', {
    get() {
      throw new Error('snapshot exploded')
    },
  })
  const texts = textsOf(render(h, 'page', form))
  assert.ok(texts.includes('正在读取配置…'), 'formShape catches the getter throw and the page stays visible')
})
