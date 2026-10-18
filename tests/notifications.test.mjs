/**
 * Behaviour tests for the client half's notification delivery.
 *
 * The bundle is a browser classic script, so the harness runs it in a VM with
 * fake React/primitives and a fake `Notification`; these tests assert the exact
 * decisions the plugin makes for the four forwarded Host events.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createHarness, session, wireSession } from './helpers/client-harness.mjs'

test('final completion notifies with elapsed time and project basename', () => {
  const h = createHarness({
    summaries: { s1: session('s1') },
    projections: { s1: { values: { title: 'Fix the build' } } },
  })
  h.emit('api-session/status', 's1', true)
  h.setNow(1_005_000)
  h.emit('api-session/status', 's1', false)

  const [notification] = h.notifications()
  assert.equal(notification.title, 'Fix the build')
  assert.equal(notification.options.body, '已完成 · 5 秒 · project-s1')
  assert.equal(notification.options.silent, true, 'smart policy silences completion')
})

test('completion without an observed start omits the duration but still notifies', () => {
  const h = createHarness({ summaries: { s2: session('s2') } })
  h.emit('api-session/status', 's2', false)

  const [notification] = h.notifications()
  assert.equal(notification.options.body, '已完成 · project-s2')
})

test('question waterfall observes and always returns next()', () => {
  const h = createHarness({ summaries: { s3: session('s3') } })
  let nextCalls = 0
  const result = h.waterfall('user-questions/request', { __sessionId: 's3' }, { questions: [{}, {}] }, () => {
    nextCalls += 1
    return Promise.resolve('the existing answerer wins')
  })

  assert.ok(result instanceof Promise, 'the waterfall result is returned to the Host')
  assert.equal(nextCalls, 1, 'the next() delegate ran exactly once')
  assert.equal(h.notifications()[0].options.body, '等待你回答 2 个问题 · project-s3')
})

test('question count singular uses the singular copy', () => {
  const h = createHarness({ summaries: { s3: session('s3') } })
  h.waterfall('user-questions/request', { __sessionId: 's3' }, { questions: [{}] }, () => Promise.resolve())
  assert.match(h.notifications()[0].options.body, /^等待你回答 1 个问题/)
})

test('approval waterfall observes and always returns next()', () => {
  const h = createHarness({ summaries: { s4: session('s4') } })
  let nextCalls = 0
  h.waterfall('approval/request', { __sessionId: 's4' }, { toolName: 'bash', reason: 'rm -rf build' }, () => {
    nextCalls += 1
    return Promise.resolve('allow')
  })

  assert.equal(nextCalls, 1)
  const body = h.notifications()[0].options.body
  assert.match(body, /^请求权限：bash/)
  assert.ok(!body.includes('rm -rf build'), 'redacted body keeps the command out')
})

test('approval with redaction off appends one detail line capped at 80 characters', () => {
  const reason = 'Command rm -rf build requires approval because it deletes files under the workspace root.'
  const h = createHarness({ summaries: { s5: session('s5') }, value: { redact: false } })
  h.waterfall('approval/request', { __sessionId: 's5' }, { toolName: 'bash', reason }, () => Promise.resolve())

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
    ['question', (h) => h.waterfall('user-questions/request', { __sessionId: 's9' }, { questions: [{}] }, () => Promise.resolve())],
    ['approval', (h) => h.waterfall('approval/request', { __sessionId: 's9' }, { toolName: 'bash' }, () => Promise.resolve())],
    ['error', (h) => h.emit('api-session/error', 's9', 'boom')],
  ]
  for (const [name, fire] of triggers) {
    const h = createHarness({ summaries: { s9: session('s9') } })
    h.focusDocument(true)
    fire(h)
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
    ['notifyOnQuestion', 'question', (h) => h.waterfall('user-questions/request', { __sessionId: 's15' }, { questions: [{}] }, () => Promise.resolve())],
    ['notifyOnApproval', 'approval', (h) => h.waterfall('approval/request', { __sessionId: 's15' }, { toolName: 'bash' }, () => Promise.resolve())],
    ['notifyOnError', 'error', (h) => h.emit('api-session/error', 's15', 'boom')],
  ]
  for (const [field, kind, fire] of cases) {
    const h = createHarness({ summaries: { s15: session('s15') }, value: { [field]: false } })
    fire(h)
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

test('clicking a notification focuses the window and closes it', () => {
  const h = createHarness({ summaries: { s20: session('s20') } })
  h.emit('api-session/error', 's20', 'boom')
  const [notification] = h.notifications()
  notification.onclick()

  assert.equal(h.loaded.window.focusCount, 1)
  assert.equal(notification.closed, true)
})

test('plugin teardown closes every live notification', () => {
  const h = createHarness({ summaries: { s21: session('s21') } })
  h.emit('api-session/error', 's21', 'boom')
  const [notification] = h.notifications()
  h.dispose()
  assert.equal(notification.closed, true)
})
