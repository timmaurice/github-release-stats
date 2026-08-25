/**
 * Verifies the PWA artefacts in the build output.
 *
 * Lighthouse dropped its PWA category in v12, so nothing else in the pipeline
 * notices if the manifest, the service worker or the launcher icons stop being
 * emitted. This is a deterministic check over `dist` instead.
 *
 * Usage: bun run check:pwa (after a build)
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const BASE = '/github-release-stats/'
const REQUIRED_FILES = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'registerSW.js',
]
const REQUIRED_MANIFEST_KEYS = [
  'name',
  'short_name',
  'start_url',
  'scope',
  'display',
  'icons',
]
const REQUIRED_ICON_SIZES = ['192x192', '512x512']

const errors = []

for (const file of REQUIRED_FILES) {
  if (!existsSync(join(DIST, file))) {
    errors.push(`${file} is missing from ${DIST}/`)
  }
}

const manifestPath = join(DIST, 'manifest.webmanifest')
if (existsSync(manifestPath)) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    errors.push(`manifest.webmanifest is not valid JSON: ${error.message}`)
  }

  if (manifest) {
    for (const key of REQUIRED_MANIFEST_KEYS) {
      if (!manifest[key]) errors.push(`manifest has no "${key}"`)
    }

    const sizes = new Set(
      (manifest.icons ?? []).flatMap((icon) => String(icon.sizes).split(/\s+/))
    )
    for (const size of REQUIRED_ICON_SIZES) {
      if (!sizes.has(size)) errors.push(`manifest has no ${size} icon`)
    }

    for (const icon of manifest.icons ?? []) {
      const file = String(icon.src).replace(BASE, '')
      if (!existsSync(join(DIST, file))) {
        errors.push(`icon ${icon.src} is referenced but not emitted`)
      }
    }

    if (manifest.start_url && !String(manifest.start_url).startsWith(BASE)) {
      errors.push(`start_url "${manifest.start_url}" is outside ${BASE}`)
    }
  }
}

if (errors.length > 0) {
  console.error('PWA check failed:')
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

console.log(`PWA check passed (${REQUIRED_FILES.length} files, manifest valid)`)
