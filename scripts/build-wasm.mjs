/**
 * Build the Rust/WASM solver and copy output files.
 * Cross-platform: uses Node.js fs/path/child_process — no shell-specific commands.
 *
 * Usage: node scripts/build-wasm.mjs
 *
 * Prerequisites: wasm-pack (install via `cargo install wasm-pack`)
 */

import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const solverDir = join(root, 'solver')
const pkgDir = join(solverDir, 'pkg')

const targets = [
  { src: join(pkgDir, 'cablepack_bg.wasm'),  dst: join(root, 'public', 'cablepack.wasm') },
  { src: join(pkgDir, 'cablepack.js'),        dst: join(root, 'src', 'wasm', 'cablepack.js') },
  { src: join(pkgDir, 'cablepack.d.ts'),      dst: join(root, 'src', 'wasm', 'cablepack.d.ts') },
]

function wasmNeedsRebuild() {
  // Check if any target is missing
  for (const t of targets) {
    if (!existsSync(t.dst)) return true
  }
  // Check if Rust source is newer than built wasm
  const srcLib = join(solverDir, 'src', 'lib.rs')
  const dstWasm = targets[0].dst
  if (existsSync(srcLib) && existsSync(dstWasm)) {
    return statSync(srcLib).mtimeMs > statSync(dstWasm).mtimeMs
  }
  return true
}

function main() {
  if (!wasmNeedsRebuild()) {
    console.log('[build-wasm] WASM up to date, skipping.')
    return
  }

  // Check wasm-pack
  try {
    execSync('wasm-pack --version', { stdio: 'pipe' })
  } catch {
    console.warn('[build-wasm] wasm-pack not found, skipping WASM build.')
    console.warn('[build-wasm] Install with: cargo install wasm-pack')
    console.warn('[build-wasm] JS fallback solver will be used.')
    return
  }

  console.log('[build-wasm] Building Rust/WASM solver...')
  execSync('wasm-pack build --target web --release --no-opt', {
    cwd: solverDir,
    stdio: 'inherit',
  })

  // Ensure target directories exist
  for (const t of targets) {
    mkdirSync(dirname(t.dst), { recursive: true })
  }

  // Copy files
  for (const t of targets) {
    if (!existsSync(t.src)) {
      console.error(`[build-wasm] ERROR: source not found: ${t.src}`)
      process.exit(1)
    }
    copyFileSync(t.src, t.dst)
    console.log(`[build-wasm] Copied: ${t.dst}`)
  }

  console.log('[build-wasm] Done.')
}

main()
