/**
 * Root-anchored completion aggregation (subtree, metadata, and quiet window).
 *
 * These tests only drive `apply(ctx)` through public forwarded events, the
 * public `ctx.sessions.list` snapshot, and the harness's virtual clock, then
 * observe `FakeNotification` instances. No aggregation state is inspected.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createHarness, session, wireSession } from './helpers/client-harness.mjs'

/**
 * Remount the bundle against a test-local facade of the public list store.
 *
 * The shared harness deliberately exposes only `sessions.list.subscribe`, the
 * `ids` fixture, and the virtual clock. Tests that need an unreadable baseline,
 * a later readiness change, or a deployment without a live subscription wrap
 * `ctx.sessions.list` here and re-run the public `apply(ctx)` mount seam.
 */
function mountAgainstList(h, { phase = 'ready', subscribable = true } = {}) {
  const facade = {
    rows: { ...h.state.summaries },
    ids: h.state.ids,
    phase,
    listeners: new Set(),
  }
  const list = {
    getSnapshot() {
      return {
        ids: facade.ids === undefined ? Object.keys(facade.rows) : [...facade.ids],
        byId: facade.rows,
        phase: facade.phase,
        projectionsBySession: h.state.projections,
      }
    },
  }
  if (subscribable) {
    list.subscribe = (listener) => {
      facade.listeners.add(listener)
      return () => facade.listeners.delete(listener)
    }
  }
  // The harness already applied once; tear that mount down first so its list
  // subscription and disposers cannot outlive the facade swap.
  h.dispose()
  h.ctx.sessions.list = list
  h.loaded.module.apply(h.ctx)

  function publish() {
    for (const listener of [...facade.listeners]) {
      try {
        listener()
      } catch (error) {
        // A listener failure belongs to its owner.
      }
    }
  }

  return {
    setPhase(next) {
      facade.phase = next
      publish()
    },
    setRows(next, ids) {
      facade.rows = { ...next }
      facade.ids = ids === undefined ? undefined : [...ids]
      publish()
    },
  }
}

test('B1: the quiet window is exactly 2000ms', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)

  h.advance(1999)
  assert.equal(h.notifications().length, 0, 'nothing is delivered before the window elapses')

  h.advance(1)
  const notifications = h.notifications()
  assert.equal(notifications.length, 1, 'the completion lands exactly at 2000ms')
  assert.equal(notifications[0].title, 'project-root')
})

test('A1: a root-only completion reports elapsed time, not the quiet window', () => {
  const h = createHarness({
    summaries: { root: session('root') },
    projections: { root: { values: { title: 'Fix the build' } } },
  })
  h.emit('api-session/status', 'root', true)
  h.setNow(1_005_000)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)

  const notifications = h.notifications()
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].title, 'Fix the build', 'the root title is used')
  assert.equal(notifications[0].options.body, '已完成 · 5 秒 · project-root')
  assert.equal(notifications[0].options.silent, true, 'smart policy keeps completion silent')
})

test('A12: a false observation with no open root cycle never notifies', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', false)

  h.advance(10_000)
  assert.equal(h.notifications().length, 0, 'completion needs a root-anchored cycle')
})

test('A11: repeated true/false observations do not reorder or duplicate completion', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)

  const notifications = h.notifications()
  assert.equal(notifications.length, 1, 'one cycle yields at most one completion')
})

test('B7: a repeated false observation does not extend the quiet window', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(1000)
  h.emit('api-session/status', 'root', false)
  h.advance(1000)

  assert.equal(h.notifications().length, 1, 'the window still ends 2000ms after the first quiet moment')
})

test('A6: a subagent running on its own opens no root cycle', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'kid', true)
  h.emit('api-session/status', 'kid', false)
  h.advance(10_000)

  assert.equal(h.notifications().length, 0, 'only a running root opens a completion cycle')
})

test('A13: a root already running at mount seeds a cycle and completes without duration', () => {
  const h = createHarness({ summaries: { root: session('root', { running: true }) } })
  h.advance(5000)
  assert.equal(h.notifications().length, 0, 'mounting never announces a still-running root')

  h.emit('api-session/status', 'root', false)
  // The Host list row follows the same run transition; the quiet deadline
  // re-reads this snapshot as its authoritative source.
  h.setSummaries({ root: session('root', { running: false }) })
  h.advance(2000)

  const notifications = h.notifications()
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].options.body, '已完成 · project-root', 'a seed cycle has no measured duration')
})

test('D1: mounting with an all-idle list never replays a completion', () => {
  const h = createHarness({
    summaries: { root: session('root'), other: session('other') },
  })
  h.advance(10_000)
  assert.equal(h.notifications().length, 0, 'a refresh only seeds; it does not backfill')
})

test('B9: dispose cancels a pending quiet timer', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(1000)
  h.dispose()
  h.advance(10_000)

  assert.equal(h.notifications().length, 0, 'a disposed plugin never delivers the pending completion')
})

test('D7: dispose during an active cycle leaves nothing behind', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.dispose()
  h.advance(10_000)

  assert.equal(h.notifications().length, 0, 'dispose cancels the cycle instead of completing it')
})

// ---------------------------------------------------------------------------
// api-session/added: normalized metadata + running merge
// ---------------------------------------------------------------------------

test('D3/A13: a root added while running seeds a cycle that completes without a duration', () => {
  const h = createHarness({ summaries: {} })
  h.emit('api-session/added', wireSession('root', { running: true }))
  h.setNow(1_050_000)
  h.emit('api-session/status', 'root', false)
  h.setSummaries({ root: session('root', { running: false }) })
  h.advance(2000)

  const notifications = h.notifications()
  assert.equal(notifications.length, 1, 'the added root opened a seed cycle')
  assert.equal(notifications[0].options.body, '已完成 · project-root', 'added cycles carry no duration')
})

test('B3: a running child announced through added blocks the quiet window', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.emit('api-session/added', wireSession('kid', { origin: 'subagent', parentSessionId: 'root', running: true }))

  h.advance(5000)
  assert.equal(h.notifications().length, 0, 'the running child cancels the pending completion')

  h.emit('api-session/status', 'kid', false)
  h.advance(2000)
  assert.equal(h.notifications().length, 1, 'the root completes after its child settles')
})

test('D4: metadata-only added attributes a child that was already running', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'kid', true)
  h.emit('api-session/added', wireSession('kid', { origin: 'subagent', parentSessionId: 'root', running: undefined }))
  h.emit('api-session/status', 'root', false)

  h.advance(5000)
  assert.equal(h.notifications().length, 0, 'the attributed running child keeps the subtree busy')

  h.emit('api-session/status', 'kid', false)
  h.advance(2000)
  assert.equal(h.notifications().length, 1)
})

test('metadata change: a running child re-declared as root opens a seed cycle without duration', () => {
  const h = createHarness({
    summaries: {
      boss: session('boss'),
      kid: session('kid', { origin: 'subagent', parentId: 'boss' }),
    },
  })
  h.emit('api-session/status', 'kid', true)
  h.emit('api-session/added', wireSession('kid', { origin: 'user', parentSessionId: null, running: true }))
  h.emit('api-session/status', 'kid', false)
  h.setSummaries({ boss: session('boss'), kid: session('kid', { running: false }) })
  h.advance(2000)

  const notifications = h.notifications()
  assert.equal(notifications.length, 1, 'the newly resolved root now owns a cycle')
  assert.equal(notifications[0].options.body, '已完成 · project-kid', 'metadata-change cycles carry no duration')
})

test('metadata change: a list-only promotion from subagent to root delivers its completion', () => {
  const h = createHarness({ summaries: { boss: session('boss') } })
  // kid first enters as a running child, so the pre-catalog subagent filter
  // remembers it. Only the list snapshot later re-declares it as a root.
  h.emit('api-session/added', wireSession('kid', { origin: 'subagent', parentSessionId: 'boss', running: true }))
  h.setSummaries({ boss: session('boss'), kid: session('kid', { origin: 'user', running: true }) })
  h.setSummaries({ boss: session('boss'), kid: session('kid', { origin: 'user', running: false }) })
  h.advance(2000)

  const notifications = h.notifications()
  assert.equal(notifications.length, 1, 'the list-only promotion clears the stale subagent filter')
  assert.equal(notifications[0].options.body, '已完成 · project-kid', 'the list-resolved seed cycle carries no duration')
})

test('metadata change: a cycle whose root stops being a root is cancelled for good', () => {
  const h = createHarness({ summaries: { root: session('root'), boss: session('boss') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.setSummaries({ root: session('root', { origin: 'subagent', parentId: 'boss' }), boss: session('boss') })
  h.setSummaries({ root: session('root', { origin: null }), boss: session('boss') })

  h.advance(10_000)
  assert.equal(h.notifications().length, 0, 'an invalidated cycle is not revived by metadata returning')
})

// ---------------------------------------------------------------------------
// List baseline readiness and event-observed running
// ---------------------------------------------------------------------------

test('a non-ready list snapshot is not a baseline and never opens a cycle', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  const facade = mountAgainstList(h, { phase: 'loading' })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)

  h.advance(10_000)
  assert.equal(h.notifications().length, 0, 'no baseline means no tree metadata and no cycle')

  facade.setPhase('ready')
  h.advance(10_000)
  assert.equal(h.notifications().length, 0, 'an all-idle baseline is still only a seed')

  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  assert.equal(h.notifications().length, 1, 'a later real run still completes normally')
})

test('the first readable baseline keeps an event-observed running value', () => {
  const h = createHarness({ summaries: { root: session('root', { running: true }) } })
  const facade = mountAgainstList(h, { phase: 'loading' })
  h.emit('api-session/status', 'root', false)
  facade.setPhase('ready')

  h.advance(10_000)
  assert.equal(h.notifications().length, 0, 'the baseline must not revive the stale running row into a cycle')
})

test('a late-ready baseline seeds a root that is still running, without duration', () => {
  const h = createHarness({ summaries: { root: session('root', { running: true }) } })
  const facade = mountAgainstList(h, { phase: 'loading' })
  h.advance(10_000)
  assert.equal(h.notifications().length, 0)

  facade.setPhase('ready')
  h.advance(10_000)
  assert.equal(h.notifications().length, 0, 'seeding a running root never announces')

  h.emit('api-session/status', 'root', false)
  facade.setRows({ root: session('root', { running: false }) })
  h.advance(2000)

  const notifications = h.notifications()
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].options.body, '已完成 · project-root', 'a baseline seed cycle carries no duration')
})

// ---------------------------------------------------------------------------
// Quiet window cancellation and rescheduling
// ---------------------------------------------------------------------------

test('a quiet-window idle transition restarts the full 2000ms window', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)

  // The child's status arrives before any metadata can attribute it; by the
  // time the list reveals it, it is already idle again.
  h.emit('api-session/status', 'kid', true)
  h.advance(1000)
  h.setSummaries({
    root: session('root'),
    kid: session('kid', { origin: 'subagent', parentId: 'root', running: false }),
  })

  h.advance(1999)
  assert.equal(h.notifications().length, 0, 'the old 2000ms boundary no longer delivers')
  h.advance(1)
  assert.equal(h.notifications().length, 1, 'a full window starts at the fresh idle transition')
})

test('a pure metadata refresh during the window does not reset quietSince', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(1000)
  h.setSummaries({ root: session('root', { displayTitle: 'Renamed root' }) })
  h.advance(1000)

  assert.equal(h.notifications().length, 1, 'unchanged running keeps the original quiet start')
})

test('the quiet deadline re-read corrects a cached busy session into a fresh window', () => {
  // A deployment without a live list subscription only sees list state through
  // the authoritative re-read at the deadline. The child is known but still an
  // orphan when its run starts, so it does not block the root yet; the deadline
  // re-read attributes it and corrects the stale running value.
  const h = createHarness({ summaries: { root: session('root') } })
  const facade = mountAgainstList(h, { subscribable: false })
  h.emit('api-session/added', wireSession('kid', { origin: 'subagent', parentSessionId: 'missing' }))
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.emit('api-session/status', 'kid', true)
  h.advance(1000)
  facade.setRows({
    root: session('root'),
    kid: session('kid', { origin: 'subagent', parentId: 'root', running: false }),
  })

  h.advance(1000)
  assert.equal(h.notifications().length, 0, 'the correction is a new idle transition, not a completion')
  h.advance(1999)
  assert.equal(h.notifications().length, 0)
  h.advance(1)
  assert.equal(h.notifications().length, 1)
})

test('the quiet deadline re-read finds a newly running descendant and stays busy', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  const facade = mountAgainstList(h, { subscribable: false })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.emit('api-session/status', 'kid', true)
  h.advance(1000)
  facade.setRows({
    root: session('root'),
    kid: session('kid', { origin: 'subagent', parentId: 'root', running: true }),
  })

  h.advance(1000)
  assert.equal(h.notifications().length, 0, 'the re-read busy observation suppresses completion')
  h.emit('api-session/status', 'kid', false)
  facade.setRows({ root: session('root'), kid: session('kid', { origin: 'subagent', parentId: 'root', running: false }) })
  h.advance(2000)
  assert.equal(h.notifications().length, 1)
})

// ---------------------------------------------------------------------------
// Subtrees at any depth, teammate children, and multiple roots
// ---------------------------------------------------------------------------

test('A2: a running child blocks completion and the duration ends at its quiet start', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.setNow(2_000_000)
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'kid', true)
  h.setNow(2_003_000)
  h.emit('api-session/status', 'root', false)

  h.advance(5000)
  assert.equal(h.notifications().length, 0, 'the root cannot complete while its child runs')

  h.setNow(2_005_000)
  h.emit('api-session/status', 'kid', false)
  h.advance(1999)
  assert.equal(h.notifications().length, 0)
  h.advance(1)

  const notifications = h.notifications()
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].options.body, '已完成 · 5 秒 · project-root', 'duration runs to the last quiet start')
})

test('A3: a child settlement that wakes the parent yields exactly one notification', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'kid', true)
  h.emit('api-session/status', 'root', false)
  h.emit('api-session/status', 'kid', false)
  h.advance(1000)
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(1000)
  assert.equal(h.notifications().length, 0, 'the settlement turn restarts the window')
  h.advance(1000)
  assert.equal(h.notifications().length, 1, 'the collaboration produces one completion')
})

test('A4: a grandchild blocks completion at arbitrary depth', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
      grand: session('grand', { origin: 'subagent', parentId: 'kid' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'kid', true)
  h.emit('api-session/status', 'grand', true)
  h.emit('api-session/status', 'root', false)
  h.emit('api-session/status', 'kid', false)

  h.advance(5000)
  assert.equal(h.notifications().length, 0, 'the running grandchild keeps the tree busy')

  h.emit('api-session/status', 'grand', false)
  h.advance(2000)
  assert.equal(h.notifications().length, 1)
})

test('A5: teammate and subagent children share one root cycle and never notify alone', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      teammate: session('teammate', { origin: 'subagent', parentId: 'root' }),
      helper: session('helper', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'teammate', true)
  h.emit('api-session/status', 'helper', true)
  h.emit('api-session/status', 'teammate', false)

  h.advance(5000)
  assert.equal(h.notifications().length, 0, 'the remaining child keeps the tree busy')

  h.emit('api-session/status', 'helper', false)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  const notifications = h.notifications()
  assert.equal(notifications.length, 1, 'children never produce their own completion')
  assert.equal(notifications[0].title, 'project-root')
})

test('A7: a child waking inside the quiet window restarts it', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(1000)
  h.emit('api-session/status', 'kid', true)

  h.advance(5000)
  assert.equal(h.notifications().length, 0, 'the new child run cancels the window')

  h.emit('api-session/status', 'kid', false)
  h.advance(2000)
  assert.equal(h.notifications().length, 1)
})

test('B2: a child that starts running inside the window cancels it', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(1000)
  h.emit('api-session/status', 'kid', true)

  h.advance(5000)
  assert.equal(h.notifications().length, 0)
  h.emit('api-session/status', 'kid', false)
  h.advance(2000)
  assert.equal(h.notifications().length, 1)
})

test('B4: a list update that reveals a running child blocks completion', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.setSummaries({
    root: session('root'),
    kid: session('kid', { origin: 'subagent', parentId: 'root', running: true }),
  })

  h.advance(5000)
  assert.equal(h.notifications().length, 0)
  h.emit('api-session/status', 'kid', false)
  h.setSummaries({
    root: session('root'),
    kid: session('kid', { origin: 'subagent', parentId: 'root', running: false }),
  })
  h.advance(2000)
  assert.equal(h.notifications().length, 1)
})

test('A8: multiple roots keep independent cycles, timers, and notification keys', () => {
  const h = createHarness({
    summaries: {
      a: session('a'),
      achild: session('achild', { origin: 'subagent', parentId: 'a' }),
      b: session('b'),
      bchild: session('bchild', { origin: 'subagent', parentId: 'b' }),
    },
    projections: {
      a: { values: { title: 'Task A' } },
      b: { values: { title: 'Task B' } },
    },
  })
  h.emit('api-session/status', 'a', true)
  h.emit('api-session/status', 'b', true)
  h.emit('api-session/status', 'achild', true)
  h.emit('api-session/status', 'bchild', true)
  h.emit('api-session/status', 'a', false)
  h.emit('api-session/status', 'achild', false)
  h.setSummaries({
    a: session('a'),
    achild: session('achild', { origin: 'subagent', parentId: 'a' }),
    b: session('b', { running: true }),
    bchild: session('bchild', { origin: 'subagent', parentId: 'b', running: true }),
  })

  h.advance(2000)
  let notifications = h.notifications()
  assert.equal(notifications.length, 1, 'root A completes while root B is busy')
  assert.equal(notifications[0].title, 'Task A')

  h.emit('api-session/status', 'b', false)
  h.emit('api-session/status', 'bchild', false)
  h.setSummaries({
    a: session('a'),
    achild: session('achild', { origin: 'subagent', parentId: 'a' }),
    b: session('b'),
    bchild: session('bchild', { origin: 'subagent', parentId: 'b' }),
  })
  h.advance(2000)

  notifications = h.notifications()
  assert.equal(notifications.length, 2, 'root B completes on its own cycle')
  assert.equal(notifications[1].title, 'Task B')
  assert.equal(notifications[0].closed, false, 'A is untouched by B replacement')
})

test('A9: one completion per cycle, replacing the previous notification for the same root', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  assert.equal(h.notifications().length, 1)

  h.advance(10_000)
  assert.equal(h.notifications().length, 1, 'a consumed cycle never repeats')

  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)

  const notifications = h.notifications()
  assert.equal(notifications.length, 2)
  assert.equal(notifications[0].closed, true, 'the previous cycle notification is replaced')
  assert.equal(notifications[1].closed, false)
})

test('A14: title and project come from the root session', () => {
  const h = createHarness({
    summaries: {
      root: session('root', { cwd: '/work/root-project' }),
      kid: session('kid', { cwd: '/work/kid-project', origin: 'subagent', parentId: 'root' }),
    },
    projections: {
      root: { values: { title: 'Root task' } },
      kid: { values: { title: 'Kid task' } },
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'kid', true)
  h.emit('api-session/status', 'kid', false)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)

  const notification = h.notifications()[0]
  assert.equal(notification.title, 'Root task')
  assert.ok(notification.options.body.includes('· root-project'), 'the project is the root cwd basename')
  assert.ok(!notification.options.body.includes('kid-project'))
})

test('A15: a missing root title falls back to its cwd, never to the child title', () => {
  const h = createHarness({
    summaries: {
      root: session('root', { cwd: '/work/root-project' }),
      kid: session('kid', { cwd: '/work/kid-project', origin: 'subagent', parentId: 'root' }),
    },
    projections: { kid: { values: { title: 'Kid task' } } },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)

  const notification = h.notifications()[0]
  assert.equal(notification.title, 'root-project')
  assert.notEqual(notification.title, 'Kid task')
})

// ---------------------------------------------------------------------------
// Authoritative list transitions, fallback rows, and lifecycle edges
// ---------------------------------------------------------------------------

test('B8: a list re-read that sees the root running again suppresses completion', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(1000)
  h.setSummaries({ root: session('root', { running: true }) })
  h.advance(1000)
  assert.equal(h.notifications().length, 0, 'the authoritative row says the root is running again')

  h.emit('api-session/status', 'root', false)
  h.setSummaries({ root: session('root', { running: false }) })
  h.advance(2000)
  assert.equal(h.notifications().length, 1)
})

test('B11: a byId-only fallback row never clears an observed running child', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'kid', true)
  h.emit('api-session/status', 'root', false)
  h.setSummaries(
    {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root', running: false }),
    },
    ['root'],
  )
  h.advance(2000)
  assert.equal(h.notifications().length, 0, 'the fallback row is metadata only')

  h.emit('api-session/status', 'kid', false)
  h.advance(2000)
  assert.equal(h.notifications().length, 1, 'only the real status is authoritative for the child')
})

test('D2: a mounted root and child both running must both settle before completion', () => {
  const h = createHarness({
    summaries: {
      root: session('root', { running: true }),
      kid: session('kid', { origin: 'subagent', parentId: 'root', running: true }),
    },
  })
  h.emit('api-session/status', 'root', false)
  h.advance(5000)
  assert.equal(h.notifications().length, 0, 'the mounted running child still blocks')

  h.emit('api-session/status', 'kid', false)
  h.setSummaries({
    root: session('root'),
    kid: session('kid', { origin: 'subagent', parentId: 'root' }),
  })
  h.advance(2000)
  assert.equal(h.notifications().length, 1)
})

test('D8: a live list refresh completes a root that was already running at mount', () => {
  const h = createHarness({ summaries: { root: session('root', { running: true }) } })
  h.advance(10_000)
  assert.equal(h.notifications().length, 0, 'mounting only seeds')

  h.setSummaries({ root: session('root', { running: false }) })
  h.advance(2000)
  assert.equal(h.notifications().length, 1, 'the live refresh is a normal transition, not a new mount')
})

test('D9: an orphan running session neither blocks a root nor notifies', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.emit('api-session/added', wireSession('orphan', { origin: 'subagent', parentSessionId: 'missing', running: true }))

  h.advance(2000)
  const notifications = h.notifications()
  assert.equal(notifications.length, 1, 'the orphan does not stop the root')
  assert.equal(notifications[0].title, 'project-root')
})

test('B10: foreground suppression at the deadline consumes the cycle without replay', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.focusDocument(true)
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  assert.equal(h.notifications().length, 0, 'the foreground window suppresses delivery')

  h.focusDocument(false)
  h.advance(10_000)
  assert.equal(h.notifications().length, 0, 'the consumed cycle is never replayed')

  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  assert.equal(h.notifications().length, 1, 'a new cycle delivers normally')
})

test('completion notifications still focus the window and close on click', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  const notification = h.notifications()[0]
  notification.onclick()
  assert.equal(h.loaded.window.focusCount, 1)
  assert.equal(notification.closed, true)
})

test('D3: a status observation that arrives before metadata still completes once', () => {
  const h = createHarness({ summaries: {} })
  h.emit('api-session/status', 'root', true)
  h.setSummaries({ root: session('root', { running: true }) })
  h.emit('api-session/status', 'root', false)
  h.setSummaries({ root: session('root', { running: false }) })
  h.advance(2000)

  const notifications = h.notifications()
  assert.equal(notifications.length, 1, 'the late metadata opens the seed cycle, not a duplicate')
  assert.equal(notifications[0].options.body, '已完成 · project-root', 'the seed cycle has no duration')
})

// ---------------------------------------------------------------------------
// Pending interactions block completion; they are separate from alerts
// ---------------------------------------------------------------------------

/** Completion notifications only; pending question/approval banners never count. */
function completions(h) {
  return h.notifications().filter((notification) => {
    const body = notification.options && notification.options.body
    return typeof body === 'string' && (body.startsWith('已完成') || body.startsWith('Completed'))
  })
}

test('B5: a pending interaction inside the quiet window blocks completion until it clears', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(1000)
  h.upsertPending('kid', { sessionId: 'kid', kind: 'approval', key: 'approval:kid:1', toolName: 'bash' })

  h.advance(5000)
  assert.equal(completions(h).length, 0, 'pending keeps the subtree incomplete past the old deadline')
  assert.equal(h.notifications().length, 0, 'a subagent pending interaction is still filtered from alerts')

  h.clearPending('kid')
  h.advance(1999)
  assert.equal(completions(h).length, 0, 'the clear starts a fresh 2000ms window')
  h.advance(1)
  assert.equal(completions(h).length, 1, 'completion lands after the pending interaction clears')
})

test('B6: clearing a pending interaction restarts the full quiet window', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.upsertPending('kid', { sessionId: 'kid', kind: 'question', key: 'question:kid:1', questions: [{}] })
  h.advance(1000)
  h.clearPending('kid')

  h.advance(1999)
  assert.equal(completions(h).length, 0, 'the old 2000ms deadline is not reused')
  h.advance(1)
  assert.equal(completions(h).length, 1, 'a full window starts when the pending interaction clears')
})

test('C1: a root pending interaction blocks completion until it clears', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.upsertPending('root', { sessionId: 'root', kind: 'approval', key: 'approval:root:1', toolName: 'bash' })
  h.emit('api-session/status', 'root', false)

  h.advance(5000)
  assert.equal(completions(h).length, 0, 'the root still needs the user')

  h.clearPending('root')
  h.advance(2000)
  assert.equal(completions(h).length, 1)
})

test('C2: a child pending interaction blocks completion and never alerts on its own', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'kid', true)
  h.upsertPending('kid', { sessionId: 'kid', kind: 'approval', key: 'approval:kid:2', toolName: 'bash' })
  h.emit('api-session/status', 'root', false)
  h.emit('api-session/status', 'kid', false)

  h.advance(5000)
  assert.equal(completions(h).length, 0, 'the child pending interaction blocks the root')
  assert.equal(h.notifications().length, 0, 'the subagent pending banner stays filtered')

  h.clearPending('kid')
  h.advance(2000)
  assert.equal(completions(h).length, 1)
})

test('C3: a child pending interaction already present at mount blocks completion', () => {
  const status = new Map([
    [
      'kid',
      {
        running: true,
        completionUnread: false,
        pendingInteraction: { sessionId: 'kid', kind: 'approval', key: 'approval:kid:3', toolName: 'bash' },
      },
    ],
  ])
  const h = createHarness({
    summaries: {
      root: session('root', { running: true }),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
    sessionStatus: status,
  })
  h.advance(5000)
  assert.equal(completions(h).length, 0, 'mounting with a pending child does not complete')
  assert.equal(h.notifications().length, 0, 'the child pending banner stays filtered')

  h.emit('api-session/status', 'root', false)
  h.setSummaries({
    root: session('root'),
    kid: session('kid', { origin: 'subagent', parentId: 'root' }),
  })
  h.advance(5000)
  assert.equal(completions(h).length, 0, 'the pending child still blocks after the root settles')

  h.clearPending('kid')
  h.advance(2000)
  assert.equal(completions(h).length, 1)
})

test('C4: another root pending interaction does not delay this root', () => {
  const h = createHarness({
    summaries: { a: session('a'), b: session('b') },
    projections: { a: { values: { title: 'Task A' } }, b: { values: { title: 'Task B' } } },
  })
  h.emit('api-session/status', 'a', true)
  h.emit('api-session/status', 'a', false)
  h.upsertPending('b', { sessionId: 'b', kind: 'approval', key: 'approval:b:1', toolName: 'bash' })

  h.advance(2000)
  const done = completions(h)
  assert.equal(done.length, 1, 'root A keeps its own quiet window')
  assert.equal(done[0].title, 'Task A')
  assert.equal(done.filter((notification) => notification.title === 'Task B').length, 0)
  assert.equal(
    h.notifications().filter((notification) => notification.options.body.startsWith('请求权限')).length,
    1,
    'root B still alerts for its own pending interaction',
  )
})

test('another root going idle does not reset this root quiet window', () => {
  const h = createHarness({
    summaries: { a: session('a'), b: session('b') },
    projections: { a: { values: { title: 'Task A' } } },
  })
  h.emit('api-session/status', 'a', true)
  h.emit('api-session/status', 'a', false)
  h.emit('api-session/status', 'b', true)
  h.emit('api-session/status', 'b', false)
  h.advance(1000)
  h.emit('api-session/status', 'b', true)
  h.emit('api-session/status', 'b', false)

  h.advance(1000)
  const done = completions(h)
  assert.equal(done.length, 1, 'root A completes on its original 2000ms deadline')
  assert.equal(done[0].title, 'Task A')
})

test('another root pending clear and an orphan clear do not reset this root quiet window', () => {
  const h = createHarness({
    summaries: { a: session('a'), b: session('b') },
    projections: { a: { values: { title: 'Task A' } } },
  })
  h.emit('api-session/status', 'a', true)
  h.emit('api-session/status', 'a', false)
  h.emit('api-session/status', 'b', true)
  h.emit('api-session/status', 'b', false)
  h.emit('api-session/added', wireSession('orphan', { origin: 'subagent', parentSessionId: 'missing' }))
  h.upsertPending('b', { sessionId: 'b', kind: 'approval', key: 'approval:b:clear', toolName: 'bash' })
  h.upsertPending('orphan', { sessionId: 'orphan', kind: 'approval', key: 'approval:orphan:clear', toolName: 'bash' })
  h.advance(1000)
  h.clearPending('b')
  h.clearPending('orphan')

  h.advance(999)
  assert.equal(completions(h).length, 0, 'unrelated clears never restart root A')
  h.advance(1)
  const done = completions(h)
  assert.equal(done.length, 1, 'root A keeps its original deadline')
  assert.equal(done[0].title, 'Task A')
})

test('C5: a missing uiSession service degrades to running-only completion', () => {
  const h = createHarness({ summaries: { root: session('root') }, uiSessionAvailable: false })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  assert.equal(completions(h).length, 1, 'no pending source means no pending blocking')
})

test('an unattributed running observation blocks every root until metadata resolves it', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.emit('api-session/status', 'ghost', true)

  h.advance(5000)
  assert.equal(completions(h).length, 0, 'a running session with no metadata blocks globally')

  h.emit('api-session/added', wireSession('ghost', { origin: 'subagent', parentSessionId: 'root', running: true }))
  h.advance(5000)
  assert.equal(completions(h).length, 0, 'attributed as a running child, it still blocks')

  h.emit('api-session/status', 'ghost', false)
  h.setSummaries({
    root: session('root'),
    ghost: session('ghost', { origin: 'subagent', parentId: 'root' }),
  })
  h.advance(2000)
  assert.equal(completions(h).length, 1)
})

test('metadata discovery during a status event re-evaluates roots after a global block lifts', () => {
  const h = createHarness({ summaries: { a: session('a') } })
  const facade = mountAgainstList(h, { subscribable: false })
  h.emit('api-session/status', 'a', true)
  h.emit('api-session/status', 'a', false)
  h.upsertPending('ghost', { sessionId: 'ghost', kind: 'approval', key: 'approval:ghost:status', toolName: 'bash' })
  h.advance(1000)

  // Without a live list subscription, only the status handler can discover the
  // late metadata that lifts the global block.
  facade.setRows({ a: session('a'), ghost: session('ghost') })
  h.emit('api-session/status', 'ghost', false)

  h.advance(1999)
  assert.equal(completions(h).length, 0, 'root A still waits for the full window after the gate lifts')
  h.advance(1)
  assert.equal(completions(h).length, 1, 'the unblocked root is re-evaluated immediately')
})

test('C6: an unattributed pending interaction blocks globally until it is attributed and cleared', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.upsertPending('ghost', { sessionId: 'ghost', kind: 'plan-review', key: 'question:ghost:1', questions: [{}] })

  h.advance(5000)
  assert.equal(completions(h).length, 0, 'unattributed pending blocks every root')

  h.emit('api-session/added', wireSession('ghost', { origin: 'subagent', parentSessionId: 'root' }))
  h.advance(5000)
  assert.equal(completions(h).length, 0, 'attributed as a child, the same pending still blocks')

  h.clearPending('ghost')
  h.advance(2000)
  assert.equal(completions(h).length, 1)
})

test('C7: plan-review interactions block completion like questions', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'kid', true)
  h.upsertPending('kid', { sessionId: 'kid', kind: 'plan-review', key: 'question:kid:plan', questions: [{}, {}] })
  h.emit('api-session/status', 'root', false)
  h.emit('api-session/status', 'kid', false)

  h.advance(5000)
  assert.equal(completions(h).length, 0, 'plan-review is a pending interaction too')
  assert.equal(h.notifications().length, 0, 'the subagent plan-review banner stays filtered')

  h.clearPending('kid')
  h.advance(2000)
  assert.equal(completions(h).length, 1)
})

test('a keyless unknown pending kind blocks completion without notifying', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'kid', true)
  h.upsertPending('kid', { sessionId: 'kid', kind: 'mystery' })
  h.emit('api-session/status', 'root', false)
  h.emit('api-session/status', 'kid', false)

  h.advance(2000)
  assert.equal(completions(h).length, 0, 'blocking does not care about the interaction kind or key')
  assert.equal(h.notifications().length, 0, 'an unknown kind is never announced')

  h.clearPending('kid')
  h.advance(2000)
  assert.equal(completions(h).length, 1)
})

test('a root pending interaction without a cycle opens none and never backfills completion', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.upsertPending('root', { sessionId: 'root', kind: 'approval', key: 'approval:root:idle', toolName: 'bash' })
  h.clearPending('root')

  h.advance(10_000)
  assert.equal(completions(h).length, 0, 'a pending clear alone never opens a root cycle')

  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  assert.equal(completions(h).length, 1, 'only a root run opens the cycle that can complete')
})

test('an orphan pending interaction blocks no root and stays silent', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.emit('api-session/added', wireSession('orphan', { origin: 'subagent', parentSessionId: 'missing' }))
  h.upsertPending('orphan', { sessionId: 'orphan', kind: 'approval', key: 'approval:orphan:1', toolName: 'bash' })

  h.advance(2000)
  assert.equal(completions(h).length, 1, 'an orphan does not belong to any root subtree')
  assert.equal(
    h.notifications().filter((notification) => notification.options.body.startsWith('请求权限')).length,
    0,
    'the orphan subagent pending banner stays filtered',
  )
})

test('republishing another root pending does not reorder this root quiet window', () => {
  const h = createHarness({ summaries: { a: session('a'), b: session('b') } })
  h.emit('api-session/status', 'a', true)
  h.emit('api-session/status', 'a', false)
  h.advance(1000)

  const pending = { sessionId: 'b', kind: 'approval', key: 'approval:b:republish', toolName: 'bash' }
  h.upsertPending('b', pending)
  h.upsertPending('b', { ...pending })
  h.advance(999)
  assert.equal(completions(h).length, 0, 'root A still waits for its original deadline')
  h.advance(1)
  assert.equal(completions(h).length, 1, 'repeated pending snapshots never reset root A')
})

test('a failed pending scan keeps the previous blocker and never delivers', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.upsertPending('kid', { sessionId: 'kid', kind: 'approval', key: 'approval:kid:scan', toolName: 'bash' })
  h.emit('api-session/status', 'root', false)

  const source = h.ctx.uiSession.sessionStatus
  const original = source.getSnapshot
  source.getSnapshot = () => {
    throw new Error('sessionStatus unavailable')
  }
  h.clearPending('kid')
  h.advance(10_000)
  assert.equal(completions(h).length, 0, 'a failed scan keeps the cached pending blocker')

  source.getSnapshot = original
  h.clearPending('kid')
  h.advance(2000)
  assert.equal(completions(h).length, 1, 'the blocker clears once the scan recovers')
})

test('a pending read failure at the quiet deadline cancels delivery and stays active', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(1000)

  const source = h.ctx.uiSession.sessionStatus
  const original = source.getSnapshot
  source.getSnapshot = () => {
    throw new Error('sessionStatus unavailable')
  }
  h.advance(1000)
  assert.equal(completions(h).length, 0, 'the failed pending read suppresses the completion')

  h.advance(10_000)
  assert.equal(completions(h).length, 0, 'the failed deadline is not retried by polling')

  source.getSnapshot = original
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  assert.equal(completions(h).length, 1, 'a fresh cycle after recovery delivers normally')
})

// ---------------------------------------------------------------------------
// Removal lifecycle (D5, D6, D10)
// ---------------------------------------------------------------------------

test('D5: removing a running child re-evaluates its root and completes after the window', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'kid', true)
  h.emit('api-session/status', 'root', false)
  h.advance(5000)
  assert.equal(completions(h).length, 0, 'the running child holds the root open')

  h.setSummaries({ root: session('root') })
  h.emit('api-session/removed', 'kid')
  h.advance(1999)
  assert.equal(completions(h).length, 0, 'the removal starts a fresh 2000ms window')
  h.advance(1)

  const done = completions(h)
  assert.equal(done.length, 1)
  assert.equal(done[0].options.body, '已完成 · 5 秒 · project-root', 'the duration ends at the removal quiet start')
})

test('D6: removing a root cancels its cycle and closes its live notification', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  assert.equal(completions(h).length, 1)
  const first = h.notifications()[0]

  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(1000)
  h.emit('api-session/removed', 'root')

  assert.equal(first.closed, true, 'the removed root live notification is closed')
  h.advance(10_000)
  assert.equal(completions(h).length, 1, 'a removed root never delivers completion')
})

test('D10: an unattributed run resolved as another root lets each root cycle independently', () => {
  const h = createHarness({
    summaries: { a: session('a') },
    projections: {
      a: { values: { title: 'Task A' } },
      ghost: { values: { title: 'Task B' } },
    },
  })
  h.emit('api-session/status', 'a', true)
  h.emit('api-session/status', 'a', false)
  h.emit('api-session/status', 'ghost', true)
  h.advance(5000)
  assert.equal(completions(h).length, 0, 'the unattributed running session blocks every root')

  h.emit('api-session/added', wireSession('ghost', { origin: 'user', running: true }))
  h.advance(2000)
  let done = completions(h)
  assert.equal(done.length, 1, 'root A completes once its global block is attributed elsewhere')
  assert.equal(done[0].title, 'Task A')
  assert.equal(
    done.filter((notification) => notification.title === 'Task B').length,
    0,
    'root B is still running and does not complete',
  )

  h.emit('api-session/status', 'ghost', false)
  h.advance(2000)
  done = completions(h)
  assert.equal(done.length, 2, 'root B completes on its own independent cycle')
  assert.equal(done[1].title, 'Task B')
})

test('a removed middle child leaves a running grandchild orphaned and no longer blocking', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
      grand: session('grand', { origin: 'subagent', parentId: 'kid' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'kid', true)
  h.emit('api-session/status', 'grand', true)
  h.emit('api-session/status', 'root', false)
  h.advance(5000)
  assert.equal(completions(h).length, 0, 'the running grandchild keeps the tree busy')

  h.setSummaries({
    root: session('root'),
    grand: session('grand', { origin: 'subagent', parentId: 'kid', running: true }),
  })
  h.emit('api-session/removed', 'kid')
  h.advance(2000)

  const done = completions(h)
  assert.equal(done.length, 1, 'the orphaned grandchild no longer belongs to the root subtree')
  assert.equal(done[0].title, 'project-root')
  assert.equal(
    done.filter((notification) => notification.title === 'project-grand').length,
    0,
    'the orphan never produces a completion of its own',
  )
})

test('removing an idle child during Quiet keeps the original quiet deadline', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(1000)

  h.setSummaries({ root: session('root') })
  h.emit('api-session/removed', 'kid')
  h.advance(999)
  assert.equal(completions(h).length, 0, 'the removal does not restart the window')
  h.advance(1)
  assert.equal(completions(h).length, 1, 'the original 2000ms deadline still delivers')
})

test('a removed child is re-attributed by a later list snapshot and blocks again', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'kid', true)
  h.emit('api-session/status', 'root', false)
  h.setSummaries({ root: session('root') })
  h.emit('api-session/removed', 'kid')
  h.advance(2000)
  assert.equal(completions(h).length, 1, 'the removed child stops blocking')

  h.emit('api-session/status', 'root', true)
  h.setSummaries({
    root: session('root', { running: true }),
    kid: session('kid', { origin: 'subagent', parentId: 'root', running: true }),
  })
  h.emit('api-session/status', 'root', false)
  h.advance(5000)
  assert.equal(completions(h).length, 1, 'the restored child metadata blocks the new root cycle again')

  h.setSummaries({
    root: session('root', { running: false }),
    kid: session('kid', { origin: 'subagent', parentId: 'root', running: false }),
  })
  h.advance(2000)
  assert.equal(completions(h).length, 2, 'the re-attributed child settles into the normal window')
})

test('removing an unattributed running session lifts the global block', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.emit('api-session/status', 'ghost', true)
  h.advance(5000)
  assert.equal(completions(h).length, 0, 'the unattributed run blocks the root')

  h.emit('api-session/removed', 'ghost')
  h.advance(1999)
  assert.equal(completions(h).length, 0, 'the root still waits for a full window after the gate lifts')
  h.advance(1)
  assert.equal(completions(h).length, 1)
})

// ---------------------------------------------------------------------------
// Quiet-window transitions not covered by the A/B matrix
// ---------------------------------------------------------------------------

test('an added root running=true inside the quiet window cancels it', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(1000)

  h.emit('api-session/added', wireSession('root', { running: true }))
  h.advance(5000)
  assert.equal(completions(h).length, 0, 'the added running root cancels the pending completion')

  h.emit('api-session/status', 'root', false)
  h.advance(1999)
  assert.equal(completions(h).length, 0)
  h.advance(1)
  assert.equal(completions(h).length, 1)
})

test('re-parenting a running child under another Quiet root cancels that root', () => {
  const h = createHarness({
    summaries: {
      a: session('a'),
      b: session('b'),
      kid: session('kid', { origin: 'subagent', parentId: 'a' }),
    },
  })
  h.emit('api-session/status', 'b', true)
  h.emit('api-session/status', 'b', false)
  h.emit('api-session/status', 'kid', true)
  h.advance(1000)

  h.emit('api-session/added', wireSession('kid', { origin: 'subagent', parentSessionId: 'b', running: true }))
  h.setSummaries({
    a: session('a'),
    b: session('b'),
    kid: session('kid', { origin: 'subagent', parentId: 'b', running: true }),
  })
  h.advance(5000)
  assert.equal(completions(h).length, 0, 'the re-parented running child cancels root B quiet window')

  h.setSummaries({
    a: session('a'),
    b: session('b'),
    kid: session('kid', { origin: 'subagent', parentId: 'b', running: false }),
  })
  h.advance(2000)
  const done = completions(h)
  assert.equal(done.length, 1, 'root B completes on its own cycle once the child settles')
  assert.equal(done[0].title, 'project-b')
})

test('repeated added, pending, and list observations keep the quiet deadline', () => {
  const h = createHarness({ summaries: { root: session('root'), other: session('other') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(500)

  h.emit('api-session/added', wireSession('root', { running: false }))
  const pending = { sessionId: 'other', kind: 'approval', key: 'approval:other:repeat', toolName: 'bash' }
  h.upsertPending('other', pending)
  h.upsertPending('other', { ...pending })
  h.setSummaries({ root: session('root'), other: session('other') })

  h.advance(1499)
  assert.equal(completions(h).length, 0, 'unchanged observations never restart the window')
  h.advance(1)
  assert.equal(completions(h).length, 1, 'the original deadline still delivers')
})

test('a seeded cycle never upgrades to a known duration when the root runs again', () => {
  const h = createHarness({ summaries: { root: session('root', { running: true }) } })
  // The Host list row follows the real transition; otherwise the deadline
  // re-read would (correctly) restore the mounted running baseline.
  h.setSummaries({ root: session('root') })
  h.emit('api-session/status', 'root', false)
  h.advance(1000)
  h.emit('api-session/status', 'root', true)
  h.advance(2000)
  assert.equal(completions(h).length, 0, 'the second run keeps the cycle open')

  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  const done = completions(h)
  assert.equal(done.length, 1)
  assert.equal(done[0].options.body, '已完成 · project-root', 'a seeded cycle stays duration-less')
})

test('orphan parent cycles and over-depth chains never hang or notify', () => {
  const ring = {}
  for (let index = 0; index < 70; index += 1) {
    ring['r' + index] = session('r' + index, {
      origin: 'subagent',
      parentId: 'r' + ((index + 1) % 70),
    })
  }
  const ringHarness = createHarness({ summaries: ring })
  ringHarness.emit('api-session/status', 'r0', true)
  ringHarness.advance(10_000)
  assert.equal(ringHarness.notifications().length, 0, 'a parent cycle is an orphan, not a root')

  const chain = { c0: session('c0') }
  for (let index = 1; index <= 70; index += 1) {
    chain['c' + index] = session('c' + index, {
      origin: 'subagent',
      parentId: 'c' + (index - 1),
    })
  }
  const chainHarness = createHarness({ summaries: chain })
  chainHarness.emit('api-session/status', 'c70', true)
  chainHarness.advance(10_000)
  assert.equal(chainHarness.notifications().length, 0, 'the depth guard treats the over-deep chain as an orphan')
})

test('the depth guard keeps a legitimate 64-step chain inside the tree', () => {
  // 64 parent hops is the documented guard limit: a normal tree at exactly that
  // depth must still block and then release its root. Only deeper chains are
  // defensive orphans.
  const summaries = { n0: session('n0') }
  for (let index = 1; index <= 64; index += 1) {
    summaries['n' + index] = session('n' + index, { origin: 'subagent', parentId: 'n' + (index - 1) })
  }
  const h = createHarness({ summaries })
  h.emit('api-session/status', 'n0', true)
  for (let index = 1; index <= 64; index += 1) h.emit('api-session/status', 'n' + index, true)
  h.emit('api-session/status', 'n0', false)
  h.advance(1000)
  for (let index = 1; index <= 63; index += 1) h.emit('api-session/status', 'n' + index, false)

  h.advance(5000)
  assert.equal(completions(h).length, 0, 'the running 64-step descendant blocks its root')

  // The deepest descendant settles last: that is a real busy decrease and must
  // be routed to the root's cycle, exactly like any shallower child.
  h.emit('api-session/status', 'n64', false)
  h.advance(1999)
  assert.equal(completions(h).length, 0, 'the quiet window starts when the deepest descendant settles')
  h.advance(1)
  assert.equal(completions(h).length, 1, 'the 64-step tree is inside the guard, not orphaned by it')
})

// ---------------------------------------------------------------------------
// E. Delivery, configuration, and non-regression (E1-E12)
// ---------------------------------------------------------------------------

test('E1: the completion switch is read at delivery and a suppressed cycle is consumed', () => {
  const h = createHarness({
    summaries: { root: session('root') },
    value: { notifyOnComplete: false },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  assert.equal(completions(h).length, 0, 'the disabled switch suppresses the completion')

  h.setConfigField('notifyOnComplete', true)
  h.advance(10_000)
  assert.equal(completions(h).length, 0, 'the consumed cycle is never replayed')

  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  assert.equal(completions(h).length, 1, 'a new cycle delivers after the switch is re-enabled')
})

test('E2: foreground suppression at the deadline is consumed and not replayed', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.focusDocument(true)
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  assert.equal(completions(h).length, 0, 'the focused window suppresses the completion')

  h.focusDocument(false)
  h.advance(10_000)
  assert.equal(completions(h).length, 0, 'losing focus never replays the consumed cycle')

  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  assert.equal(completions(h).length, 1, 'a fresh cycle delivers normally')
})

test('E3: showSessionTitle=false uses the app name but keeps the root project', () => {
  const h = createHarness({
    summaries: { root: session('root', { cwd: '/work/root-project' }) },
    projections: { root: { values: { title: 'Root task' } } },
    value: { showSessionTitle: false },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)

  const notification = completions(h)[0]
  assert.equal(notification.title, 'DeepSeek Harness')
  assert.ok(notification.options.body.includes('· root-project'), 'the project still comes from the root cwd')
})

test('E4: replaceBySession=false keeps both cycle notifications alive', () => {
  const h = createHarness({ summaries: { root: session('root') }, value: { replaceBySession: false } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  h.advance(10_000)
  assert.equal(completions(h).length, 1, 'the first cycle produces exactly one notification')

  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  const done = completions(h)
  assert.equal(done.length, 2, 'the second cycle produces a second notification')
  assert.equal(done[0].closed, false)
  assert.equal(done[1].closed, false)
})

test('E5: the sound policy maps the completion silent flag', () => {
  const cases = [
    ['smart', true],
    ['all', false],
    ['none', true],
  ]
  for (const [soundPolicy, silent] of cases) {
    const h = createHarness({ summaries: { root: session('root') }, value: { soundPolicy } })
    h.emit('api-session/status', 'root', true)
    h.emit('api-session/status', 'root', false)
    h.advance(2000)
    assert.equal(completions(h)[0].options.silent, silent, soundPolicy)
  }
})

test('E6: English locale renders the existing completion copy', () => {
  const h = createHarness({ summaries: { root: session('root') }, locale: 'en' })
  h.emit('api-session/status', 'root', true)
  h.setNow(1_005_000)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)

  const body = completions(h)[0].options.body
  assert.match(body, /^Completed/)
  assert.equal(body, 'Completed · 5s · project-root', 'no new locale key is introduced')
})

test('E7: clicking a completion focuses the window and closes it', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)

  const notification = completions(h)[0]
  notification.onclick()
  assert.equal(h.loaded.window.focusCount, 1)
  assert.equal(notification.closed, true)
})

test('E8: notifyOnComplete is re-read at the quiet deadline', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(1000)
  h.setConfigField('notifyOnComplete', false)
  h.advance(1000)
  assert.equal(completions(h).length, 0, 'the deadline reads the switch as closed')

  h.setConfigField('notifyOnComplete', true)
  h.advance(10_000)
  assert.equal(completions(h).length, 0, 'the suppressed cycle is consumed')

  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)
  assert.equal(completions(h).length, 1)
})

test('E9: a root error notifies and does not cancel the later completion', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/error', 'root', 'boom')
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)

  const notifications = h.notifications()
  assert.equal(notifications.length, 2, 'the error and the completion are independent')
  assert.match(notifications[0].options.body, /^运行失败：boom/)
  assert.match(notifications[1].options.body, /^已完成/)
})

test('E10: a child error stays filtered and does not block the completion', () => {
  const h = createHarness({
    summaries: {
      root: session('root'),
      kid: session('kid', { origin: 'subagent', parentId: 'root' }),
    },
  })
  h.emit('api-session/status', 'root', true)
  h.emit('api-session/error', 'kid', 'child failed')
  h.emit('api-session/status', 'root', false)
  h.advance(2000)

  const notifications = h.notifications()
  assert.equal(notifications.length, 1, 'the child error is filtered')
  assert.match(notifications[0].options.body, /^已完成/)
})

test('E11: child question and approval interactions are filtered but block completion', () => {
  const cases = [
    { kind: 'question', key: 'question:kid:e11', questions: [{}] },
    { kind: 'approval', key: 'approval:kid:e11', toolName: 'bash' },
  ]
  for (const interaction of cases) {
    const h = createHarness({
      summaries: {
        root: session('root'),
        kid: session('kid', { origin: 'subagent', parentId: 'root' }),
      },
    })
    h.emit('api-session/status', 'root', true)
    h.emit('api-session/status', 'kid', true)
    h.upsertPending('kid', { sessionId: 'kid', ...interaction })
    h.emit('api-session/status', 'root', false)
    h.emit('api-session/status', 'kid', false)
    h.advance(5000)
    assert.equal(completions(h).length, 0, `${interaction.kind} blocks the completion`)
    assert.equal(h.notifications().length, 0, `${interaction.kind} alerts stay filtered for a subagent`)

    h.clearPending('kid')
    h.advance(2000)
    assert.equal(completions(h).length, 1, `${interaction.kind} clearing releases the completion`)
  }
})

test('E12: the completion body keeps the existing copy and adds no agent count', () => {
  const h = createHarness({ summaries: { root: session('root') } })
  h.emit('api-session/status', 'root', true)
  h.setNow(1_005_000)
  h.emit('api-session/status', 'root', false)
  h.advance(2000)

  const body = completions(h)[0].options.body
  assert.equal(body, '已完成 · 5 秒 · project-root')
  assert.ok(!body.includes('全部'), 'no aggregate copy is introduced')
  assert.ok(!/智能体|agents?/i.test(body), 'no agent count is introduced')
})
