/**
 * Copy the handwritten client half into the build output.
 *
 * `src/client.js` is a plain classic script that registers itself with
 * `window.__ModuleLoader__`. It must be shipped byte-for-byte: no bundler, no
 * transpiler, no minifier (see docs/adr/0002-handwritten-client-bundle.md).
 */
import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../src/client.js', import.meta.url))
const targetDir = fileURLToPath(new URL('../lib/', import.meta.url))
const target = fileURLToPath(new URL('../lib/client.js', import.meta.url))

await mkdir(targetDir, { recursive: true })
await copyFile(source, target)
console.log(`build-client: copied ${source} -> ${target}`)
