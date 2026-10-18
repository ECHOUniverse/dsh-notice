/**
 * Pending-interaction observations through `ctx.uiSession.sessionStatus`.
 *
 * The official approval/question plugins claim the forwarded waterfalls before
 * this plugin row runs, so the row must learn about interactions from the
 * order-independent Session UI status source. These tests drive that source
 * directly and cover the dedupe/clear/precedence rules.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createHarness, session } from './helpers/client-harness.mjs'

function approval(id, key, extra = {}) {
  return { sessionId: id, kind: 'approval', key, toolName: 'bash', ...extra }
}

function question(id, key, questions = [{}]) {
  return { sessionId: id, kind: 'question', key, questions }
}

test('an approval interaction publishes exactly one notification', () => {
  const h = createHarness({ summaries: { s1: session('s1') } })
  h.upsertPending('s1', approval('s1', 'approval:1'))

  const notifications = h.notifications()
  assert.equal(notifications.length, 1)
  assert.match(notifications[0].options.body, /^请求权限：bash/)
})

test('the same interaction key never notifies twice', () => {
  const h = createHarness({ summaries: { s1: session('s1') } })
  const interaction = approval('s1', 'approval:1')
  h.upsertPending('s1', interaction)
  h.upsertPending('s1', interaction)
  h.upsertPending('s1', { ...interaction })

  assert.equal(h.notifications().length, 1, 'status republishes with the same key are deduped')
})

test('a new key for the same session notifies again and replaces the old banner', () => {
  const h = createHarness({ summaries: { s1: session('s1') } })
  h.upsertPending('s1', approval('s1', 'approval:1'))
  h.upsertPending('s1', approval('s1', 'approval:2'))

  const [first, second] = h.notifications()
  assert.equal(h.notifications().length, 2)
  assert.equal(first.closed, true, 'per-session replacement still applies')
  assert.equal(second.closed, false)
})

test('clearing the interaction allows the same key to notify again later', () => {
  const h = createHarness({ summaries: { s1: session('s1') } })
  const interaction = approval('s1', 'approval:1')
  h.upsertPending('s1', interaction)
  h.clearPending('s1')
  h.upsertPending('s1', interaction)

  assert.equal(h.notifications().length, 2, 'the cleared key was forgotten')
})

test('question interactions reuse the question copy with their count', () => {
  const h = createHarness({ summaries: { s2: session('s2') } })
  h.upsertPending('s2', question('s2', 'question:s2:1', [{}, {}, {}]))
  assert.match(h.notifications()[0].options.body, /^等待你回答 3 个问题/)
})

test('plan-review interactions count as questions', () => {
  const h = createHarness({ summaries: { s3: session('s3') } })
  h.upsertPending('s3', { sessionId: 's3', kind: 'plan-review', key: 'question:s3:plan', questions: [{}, {}] })
  assert.match(h.notifications()[0].options.body, /^等待你回答 2 个问题/)
})

test('unknown interaction kinds are ignored', () => {
  const h = createHarness({ summaries: { s4: session('s4') } })
  h.upsertPending('s4', { sessionId: 's4', kind: 'something-else', key: 'x:1' })
  assert.equal(h.notifications().length, 0)
})

test('subagent sessions are filtered at the pending seam too', () => {
  const h = createHarness({ summaries: { sub: session('sub', { origin: 'subagent' }) } })
  h.upsertPending('sub', approval('sub', 'approval:1'))
  assert.equal(h.notifications().length, 0)
})

test('interactions pending at mount are announced once', () => {
  const status = new Map([
    ['s5', { running: true, completionUnread: false, pendingInteraction: approval('s5', 'approval:1') }],
  ])
  const h = createHarness({ summaries: { s5: session('s5') }, sessionStatus: status })
  assert.equal(h.notifications().length, 1, 'a page refresh still reminds about a waiting approval')

  // Republishing the same snapshot must not duplicate it.
  h.setSessionStatus(status)
  assert.equal(h.notifications().length, 1)
})

test('concurrent sessions each get their own notification', () => {
  const h = createHarness({ summaries: { a: session('a'), b: session('b') } })
  h.upsertPending('a', question('a', 'question:a:1', [{}]))
  h.upsertPending('b', approval('b', 'approval:1'))

  const notifications = h.notifications()
  assert.equal(notifications.length, 2)
  assert.equal(notifications[0].closed, false)
  assert.equal(notifications[1].closed, false)
})

test('foreground suppression and switches still gate the pending seam', () => {
  const foreground = createHarness({ summaries: { s6: session('s6') } })
  foreground.focusDocument(true)
  foreground.upsertPending('s6', approval('s6', 'approval:1'))
  assert.equal(foreground.notifications().length, 0)

  const disabled = createHarness({ summaries: { s6: session('s6') }, value: { notifyOnApproval: false } })
  disabled.upsertPending('s6', approval('s6', 'approval:1'))
  assert.equal(disabled.notifications().length, 0)
})

test('a missing uiSession service is tolerated', () => {
  const h = createHarness({ summaries: { s7: session('s7') }, uiSessionAvailable: false })
  h.emit('api-session/error', 's7', 'boom')
  assert.equal(h.notifications().length, 1, 'completion/error paths keep working without the seam')
})
