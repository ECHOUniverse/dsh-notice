/**
 * Build and manifest checks: the host half's volatile schema, the handwritten
 * client bundle contract from ADR 0002, and the profile patch shape.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const readJson = async (path) => JSON.parse(await read(path))

test('package manifest declares both halves and the DSH ranges', async () => {
  const pkg = await readJson('package.json')
  assert.equal(pkg.name, '@hanxu131/dsh-notice')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.main, 'lib/index.js')
  assert.equal(pkg.exports['.'].default, './lib/index.js')
  assert.equal(pkg.exports['./client'].default, './lib/client.js')
  assert.equal(pkg.exports['./cordis.patch.yml'], './cordis.patch.yml')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.engines.dsh, '>=0.2.1-rc.1 <0.3.0-0')
  assert.ok(pkg.scripts.build.includes('build-client.mjs'))
})

test('host half exports name/inject/Config/apply with eight volatile fields', async () => {
  const module = await import(new URL('lib/index.js', root))
  assert.equal(module.name, 'notice')
  assert.deepEqual([...module.inject], [])
  assert.equal(typeof module.apply, 'function')
  assert.equal(typeof module.Config, 'function')

  const fields = Object.entries(module.Config.dict)
  assert.equal(fields.length, 8)
  const defaults = {
    notifyOnComplete: true,
    notifyOnQuestion: true,
    notifyOnApproval: true,
    notifyOnError: true,
    soundPolicy: 'smart',
    redact: true,
    showSessionTitle: true,
    replaceBySession: true,
  }
  for (const [field, schema] of fields) {
    assert.equal(schema.meta.volatile, true, `${field} must be volatile so the settings form can write it`)
    assert.deepEqual(schema.meta.default, defaults[field], `${field} default`)
  }
})

test('client bundle keeps the __ModuleLoader__ contract and is copied verbatim', async () => {
  const source = await read('src/client.js')
  assert.ok(source.startsWith('window.__ModuleLoader__.load({'), 'classic-script wrapper is first')
  assert.match(source, /id: '@hanxu131\/dsh-notice'/)
  assert.match(source, /factory: \(require\) => \{/)
  assert.match(source, /return module\.exports/)
  assert.match(source, /exports\.apply = apply/)
  assert.match(source, /exports\.inject = inject/)
  assert.ok(!source.includes('jsx-runtime'), 'no JSX runtime import')
  assert.ok(!source.includes('import '), 'no ESM syntax in the classic script')

  const built = await read('lib/client.js')
  assert.equal(built, source, 'build copies src/client.js byte for byte (no bundler)')
  assert.equal((await read('lib/client.js')).split('\n')[0], 'window.__ModuleLoader__.load({')
})

test('client bundle only requires baseline browser modules', async () => {
  const source = await read('src/client.js')
  const requires = [...source.matchAll(/require\('([^']+)'\)/g)].map((match) => match[1])
  assert.deepEqual([...new Set(requires)].sort(), [
    '@deepseek-ai/dsh-client-ui-primitives',
    'react',
  ])
})

test('profile patch inserts the notice row with the default configuration', async () => {
  const patch = await read('cordis.patch.yml')
  assert.match(patch, /^-\s+insert:/m)
  assert.match(patch, /id: notice/)
  assert.match(patch, /name: '@hanxu131\/dsh-notice'/)
  for (const field of [
    'notifyOnComplete',
    'notifyOnQuestion',
    'notifyOnApproval',
    'notifyOnError',
    'soundPolicy',
    'redact',
    'showSessionTitle',
    'replaceBySession',
  ]) {
    assert.ok(patch.includes(`${field}:`), `${field} appears in the patch config`)
  }
})
