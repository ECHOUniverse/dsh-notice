/**
 * Behaviour tests for the client half's notification delivery.
 *
 * The bundle is a browser classic script, so the harness runs it in a VM with
 * fake React/primitives and a fake `Notification`; these tests assert the exact
 * decisions the plugin makes for the four forwarded Host events.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createHarness, flattenTree, session, wireSession } from './helpers/client-harness.mjs'

/** Run one action while capturing `console.warn` calls; never leaks the spy. */
function captureWarnings(run) {
  const original = console.warn
  const warnings = []
  console.warn = (...args) => warnings.push(args)
  try {
    run()
  } finally {
    console.warn = original
  }
  return warnings
}

test('the claimed waterfalls are not subscribed at all', () => {
  const h = createHarness()
  assert.deepEqual(
    h.remoteEvents().filter((event) => event === 'user-questions/request' || event === 'approval/request'),
    [],
    'official claimers own those waterfalls; this plugin must stay off them',
  )
})

test('final completion notifies with elapsed time and project basename', () => {
  const h = createHarness({
    summaries: { s1: session('s1') },
    projections: { s1: { values: { title: 'Fix the build' } } },
  })
  h.emit('api-session/status', 's1', true)
  h.setNow(1_005_000)
  h.emit('api-session/status', 's1', false)
  h.advance(2000)

  const [notification] = h.notifications()
  assert.equal(notification.title, 'Fix the build')
  assert.equal(notification.options.body, '已完成 · 5 秒 · project-s1')
  assert.equal(notification.options.silent, true, 'smart policy silences completion')
})

test('a false observation without an open root cycle does not notify', () => {
  const h = createHarness({ summaries: { s2: session('s2') } })
  h.emit('api-session/status', 's2', false)
  h.advance(10_000)

  assert.equal(h.notifications().length, 0, 'completion is rooted in a cycle opened by a root running=true')
})

test('a pending question interaction notifies with its question count', () => {
  const h = createHarness({ summaries: { s3: session('s3') } })
  h.upsertPending('s3', { sessionId: 's3', kind: 'question', key: 'question:s3:1', questions: [{}, {}] })
  assert.equal(h.notifications()[0].options.body, '等待你回答 2 个问题 · project-s3')
})

test('question count singular uses the singular copy', () => {
  const h = createHarness({ summaries: { s3: session('s3') } })
  h.upsertPending('s3', { sessionId: 's3', kind: 'question', key: 'question:s3:1', questions: [{}] })
  assert.match(h.notifications()[0].options.body, /^等待你回答 1 个问题/)
})

test('a pending approval interaction notifies with its tool name', () => {
  const h = createHarness({ summaries: { s4: session('s4') } })
  h.upsertPending('s4', { sessionId: 's4', kind: 'approval', key: 'approval:1', toolName: 'bash', reason: 'rm -rf build' })

  const body = h.notifications()[0].options.body
  assert.match(body, /^请求权限：bash/)
  assert.ok(!body.includes('rm -rf build'), 'redacted body keeps the command out')
})

test('approval with redaction off appends one detail line capped at 80 characters', () => {
  const reason = 'Command rm -rf build requires approval because it deletes files under the workspace root.'
  const h = createHarness({ summaries: { s5: session('s5') }, value: { redact: false } })
  h.upsertPending('s5', { sessionId: 's5', kind: 'approval', key: 'approval:2', toolName: 'bash', reason })

  const lines = h.notifications()[0].options.body.split('\n')
  assert.equal(lines.length, 2, 'detail is a second line')
  assert.ok(Array.from(lines[1]).length <= 80, 'detail line is at most 80 characters')
  assert.ok(lines[1].startsWith('Command rm -rf build'))
})

test('error notification uses a structural headline and hides the rest by default', () => {
  const h = createHarness({ summaries: { s6: session('s6') } })
  h.emit('api-session/error', 's6', 'gateway/timeout: the model call timed out after 30s. Prompt text follows')

  const body = h.notifications()[0].options.body
  assert.match(body, /^运行失败：gateway\/timeout/)
  assert.equal(body.split('\n').length, 1, 'redacted error has no detail line')
  assert.ok(!body.includes('Prompt text follows'))
})

test('error with redaction off appends one detail line capped at 80 characters', () => {
  const message = 'gateway/timeout: the model call timed out after 30s. Extra diagnostic context lives here.'
  const h = createHarness({ summaries: { s7: session('s7') }, value: { redact: false } })
  h.emit('api-session/error', 's7', message)

  const lines = h.notifications()[0].options.body.split('\n')
  assert.equal(lines.length, 2)
  assert.ok(Array.from(lines[1]).length <= 80)
})

test('error without a code falls back to the first sentence', () => {
  const h = createHarness({ summaries: { s8: session('s8') } })
  h.emit('api-session/error', 's8', 'Model provider is unavailable. Retry later')
  assert.match(h.notifications()[0].options.body, /^运行失败：Model provider is unavailable/)
})

test('foreground suppression applies to all four triggers', () => {
  const triggers = [
    ['complete', (h) => {
      h.emit('api-session/status', 's9', true)
      h.emit('api-session/status', 's9', false)
    }],
    ['question', (h) => h.upsertPending('s9', { sessionId: 's9', kind: 'question', key: 'question:s9:1', questions: [{}] })],
    ['approval', (h) => h.upsertPending('s9', { sessionId: 's9', kind: 'approval', key: 'approval:9', toolName: 'bash' })],
    ['error', (h) => h.emit('api-session/error', 's9', 'boom')],
  ]
  for (const [name, fire] of triggers) {
    const h = createHarness({ summaries: { s9: session('s9') } })
    h.focusDocument(true)
    fire(h)
    h.advance(2000)
    assert.equal(h.notifications().length, 0, `${name} must be suppressed while the window is focused`)
  }
})

test('subagent sessions never notify, even before the catalog lists them', () => {
  const filtered = createHarness({ summaries: { sub: session('sub', { origin: 'subagent' }) } })
  filtered.emit('api-session/error', 'sub', 'boom')
  assert.equal(filtered.notifications().length, 0, 'catalog origin filters subagents')

  // `api-session/added` forwards the Host wire summary: identity is sessionId.
  const added = createHarness({ summaries: {} })
  added.emit('api-session/added', wireSession('late', { origin: 'subagent' }))
  added.emit('api-session/error', 'late', 'boom')
  assert.equal(added.notifications().length, 0, 'api-session/added teaches the filter')

  // Re-adding the same id as an ordinary session clears the cached filter.
  added.emit('api-session/added', wireSession('late'))
  added.emit('api-session/error', 'late', 'boom')
  assert.equal(added.notifications().length, 1, 'the else branch removes the id from the filter')
})

test('per-session replacement closes the previous notification', () => {
  const h = createHarness({ summaries: { s10: session('s10') } })
  h.emit('api-session/error', 's10', 'first')
  h.emit('api-session/error', 's10', 'second')

  const [first, second] = h.notifications()
  assert.equal(first.closed, true)
  assert.equal(second.closed, false)
})

test('different sessions keep independent notifications', () => {
  const h = createHarness({ summaries: { s11: session('s11'), s12: session('s12') } })
  h.emit('api-session/error', 's11', 'first')
  h.emit('api-session/error', 's12', 'second')

  const [first, second] = h.notifications()
  assert.equal(first.closed, false)
  assert.equal(second.closed, false)
})

test('replaceBySession=false keeps both notifications alive', () => {
  const h = createHarness({ summaries: { s13: session('s13') }, value: { replaceBySession: false } })
  h.emit('api-session/error', 's13', 'first')
  h.emit('api-session/error', 's13', 'second')

  const [first, second] = h.notifications()
  assert.equal(first.closed, false)
  assert.equal(second.closed, false)
})

test('sound policy matrix maps to the silent option', () => {
  const cases = [
    ['smart', 'complete', true],
    ['smart', 'error', false],
    ['all', 'complete', false],
    ['all', 'error', false],
    ['none', 'complete', true],
    ['none', 'error', true],
  ]
  for (const [soundPolicy, kind, silent] of cases) {
    const h = createHarness({ summaries: { s14: session('s14') }, value: { soundPolicy } })
    if (kind === 'complete') {
      h.emit('api-session/status', 's14', true)
      h.emit('api-session/status', 's14', false)
      h.advance(2000)
    } else {
      h.emit('api-session/error', 's14', 'boom')
    }
    assert.equal(h.notifications()[0].options.silent, silent, `${soundPolicy}/${kind}`)
  }
})

test('each trigger switch independently disables its notification', () => {
  const cases = [
    ['notifyOnComplete', 'complete', (h) => {
      h.emit('api-session/status', 's15', true)
      h.emit('api-session/status', 's15', false)
    }],
    ['notifyOnQuestion', 'question', (h) => h.upsertPending('s15', { sessionId: 's15', kind: 'question', key: 'question:s15:1', questions: [{}] })],
    ['notifyOnApproval', 'approval', (h) => h.upsertPending('s15', { sessionId: 's15', kind: 'approval', key: 'approval:15', toolName: 'bash' })],
    ['notifyOnError', 'error', (h) => h.emit('api-session/error', 's15', 'boom')],
  ]
  for (const [field, kind, fire] of cases) {
    const h = createHarness({ summaries: { s15: session('s15') }, value: { [field]: false } })
    fire(h)
    h.advance(2000)
    assert.equal(h.notifications().length, 0, `${field}=false suppresses ${kind}`)
  }
})

test('config is re-read on every event so volatile edits apply immediately', () => {
  const h = createHarness({ summaries: { s16: session('s16') } })
  h.emit('api-session/error', 's16', 'first')
  assert.equal(h.notifications().length, 1)

  h.setConfigField('notifyOnError', false)
  h.emit('api-session/error', 's16', 'second')
  assert.equal(h.notifications().length, 1, 'the second event is suppressed by the live config')
})

test('cwd basename handles nested, trailing-slash, and Windows paths', () => {
  const cases = [
    ['/Users/me/work/dsh-notice', 'dsh-notice'],
    ['/Users/me/work/dsh-notice/', 'dsh-notice'],
    ['C:\\Users\\me\\work\\dsh-notice', 'dsh-notice'],
  ]
  for (const [cwd, base] of cases) {
    const h = createHarness({ summaries: { s17: session('s17', { cwd }) } })
    h.emit('api-session/error', 's17', 'boom')
    assert.equal(h.notifications()[0].options.body, `运行失败：boom · ${base}`)
  }
})

test('notification title comes from the title projection, then cwd, then the app name', () => {
  const titled = createHarness({
    summaries: { s18: session('s18') },
    projections: { s18: { values: { title: 'Fix the build' } } },
  })
  titled.emit('api-session/error', 's18', 'boom')
  assert.equal(titled.notifications()[0].title, 'Fix the build')

  const untitled = createHarness({ summaries: { s18: session('s18') } })
  untitled.emit('api-session/error', 's18', 'boom')
  assert.equal(untitled.notifications()[0].title, 'project-s18', 'falls back to the cwd basename')

  const blankProjection = createHarness({
    summaries: { s18: session('s18') },
    projections: { s18: { values: { title: '   ' } } },
  })
  blankProjection.emit('api-session/error', 's18', 'boom')
  assert.equal(blankProjection.notifications()[0].title, 'project-s18', 'a whitespace title is absent')

  const bare = createHarness({ summaries: { s18: session('s18', { cwd: undefined }) } })
  bare.emit('api-session/error', 's18', 'boom')
  assert.equal(bare.notifications()[0].title, 'DeepSeek Harness', 'no title and no cwd')

  const hidden = createHarness({
    summaries: { s18: session('s18') },
    projections: { s18: { values: { title: 'Fix the build' } } },
    value: { showSessionTitle: false },
  })
  hidden.emit('api-session/error', 's18', 'boom')
  assert.equal(hidden.notifications()[0].title, 'DeepSeek Harness')
})

test('a projection title works before the session list carries a row', () => {
  const h = createHarness({ projections: { ghost: { values: { title: 'Background work' } } } })
  h.emit('api-session/error', 'ghost', 'boom')
  assert.equal(h.notifications()[0].title, 'Background work')
})

test('English locale renders English copy', () => {
  const h = createHarness({ summaries: { s19: session('s19') }, locale: 'en' })
  h.emit('api-session/error', 's19', 'boom')
  assert.match(h.notifications()[0].options.body, /^Run failed: boom/)
})

test('clicking a notification navigates to its session, focuses the window, and closes it', () => {
  const h = createHarness({ summaries: { s20: session('s20') } })
  h.emit('api-session/error', 's20', 'boom')
  const [notification] = h.notifications()
  notification.onclick()

  assert.deepEqual(h.navigations(), ['s20'], 'the notification opens its own session')
  assert.equal(h.loaded.window.focusCount, 1)
  assert.equal(notification.closed, true)
})

test('question and approval clicks navigate to their own sessions', () => {
  const cases = [
    ['s22', (h) => h.upsertPending('s22', { sessionId: 's22', kind: 'question', key: 'question:s22:1', questions: [{}] })],
    ['s23', (h) => h.upsertPending('s23', { sessionId: 's23', kind: 'approval', key: 'approval:s23:1', toolName: 'bash' })],
  ]
  for (const [sessionId, fire] of cases) {
    const h = createHarness({ summaries: { [sessionId]: session(sessionId) } })
    fire(h)
    h.notifications()[0].onclick()
    assert.deepEqual(h.navigations(), [sessionId], sessionId + ' navigates to itself')
    assert.equal(h.loaded.window.focusCount, 1)
    assert.equal(h.notifications()[0].closed, true)
  }
})

test('clicking an archived session notification only focuses the window', () => {
  const h = createHarness({ summaries: { s24: session('s24') }, archivedSessionIds: ['s24'] })
  h.emit('api-session/error', 's24', 'boom')
  const [notification] = h.notifications()
  const warnings = captureWarnings(() => notification.onclick())

  assert.deepEqual(h.navigations(), [], 'archived sessions are never opened')
  assert.equal(warnings.length, 1, 'degradation warns once')
  assert.match(String(warnings[0][0]), /session is archived/)
  assert.equal(h.loaded.window.focusCount, 1)
  assert.equal(notification.closed, true)
})

test('the archived set is read when the notification is clicked', () => {
  const h = createHarness({ summaries: { s25: session('s25') } })
  h.emit('api-session/error', 's25', 'boom')
  const [notification] = h.notifications()

  h.setArchivedSessionIds(['s25'])
  captureWarnings(() => notification.onclick())

  assert.deepEqual(h.navigations(), [], 'archiving after delivery still blocks navigation')
  assert.equal(h.loaded.window.focusCount, 1)
  assert.equal(notification.closed, true)
})

test('a missing workspaces service or archived field does not block navigation', () => {
  const missingService = createHarness({ summaries: { s26: session('s26') }, workspacesAvailable: false })
  missingService.emit('api-session/error', 's26', 'boom')
  missingService.notifications()[0].onclick()
  assert.deepEqual(missingService.navigations(), ['s26'])

  const missingField = createHarness({ summaries: { s27: session('s27') }, workspacesSnapshot: {} })
  missingField.emit('api-session/error', 's27', 'boom')
  missingField.notifications()[0].onclick()
  assert.deepEqual(missingField.navigations(), ['s27'])
})

test('clicking without the workspace navigation service only focuses the window', () => {
  const h = createHarness({ summaries: { s28: session('s28') }, uiWorkspaceAvailable: false })
  h.emit('api-session/error', 's28', 'boom')
  const [notification] = h.notifications()

  const warnings = captureWarnings(() => assert.doesNotThrow(() => notification.onclick()))

  assert.equal(h.ctx.get('uiWorkspace'), undefined, 'the optional service stays absent')
  assert.deepEqual(h.navigations(), [])
  assert.equal(warnings.length, 1, 'degradation warns once')
  assert.match(String(warnings[0][0]), /navigation is unavailable/)
  assert.equal(h.loaded.window.focusCount, 1)
  assert.equal(notification.closed, true)
})

test('an openSession throw degrades to focus only', () => {
  const h = createHarness({ summaries: { s29: session('s29') }, openSessionThrows: true })
  h.emit('api-session/error', 's29', 'boom')
  const [notification] = h.notifications()

  const warnings = captureWarnings(() => assert.doesNotThrow(() => notification.onclick()))

  assert.deepEqual(h.navigations(), [])
  assert.equal(warnings.length, 1, 'degradation warns once')
  assert.equal(h.loaded.window.focusCount, 1)
  assert.equal(notification.closed, true)
})

test('the settings test notification clicks focus only, without navigation', () => {
  const h = createHarness()
  const component = h.registration.component
  const tree = component({ view: 'page', form: h.form, t: h.ctx.locale.bind('notice'), ...h.registration.injectFace })
  const button = flattenTree(tree).find((node) => node !== null && typeof node === 'object' && node.type === 'Button')
  button.props.onClick({})

  const [notification] = h.notifications()
  notification.onclick()

  assert.deepEqual(h.navigations(), [], 'a test notification has no session to open')
  assert.equal(h.loaded.window.focusCount, 1)
  assert.equal(notification.closed, true)
})

test('workspace navigation is an optional service, never a required injection', () => {
  const h = createHarness()
  assert.ok(!h.loaded.module.inject.includes('uiWorkspace'), 'uiWorkspace must not be a required dependency')
  assert.ok(!h.loaded.module.inject.includes('workspaces'), 'workspaces must not be a required dependency')
})

test('plugin teardown closes every live notification', () => {
  const h = createHarness({ summaries: { s21: session('s21') } })
  h.emit('api-session/error', 's21', 'boom')
  const [notification] = h.notifications()
  h.dispose()
  assert.equal(notification.closed, true)
})
