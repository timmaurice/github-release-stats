/**
 * Screenshot Generator Script
 *
 * This script automates the process of generating pixel-perfect, maximum-sized
 * PWA screenshots for both Desktop and Mobile (Pixel 5) viewports using Playwright.
 * It will also automatically update `vite.config.ts` with the exact dimensions
 * generated to satisfy PWA manifest constraints.
 *
 * Usage:
 * 1. Start the Vite development server in one terminal: `bun dev`
 * 2. Run this script in another terminal: `bun run screenshot`
 *
 * Note on Rate Limits:
 * If you frequently generate screenshots, you may hit the unauthenticated GitHub API
 * rate limit. To prevent this, create a `.env` file in the root directory with:
 * `GITHUB_TOKEN=your_personal_access_token_here`
 */

import { chromium, devices } from 'playwright'
import fs from 'fs'

// Helper function to read exact PNG dimensions
const getPngSize = (path) => {
  const buffer = Buffer.alloc(24)
  const fd = fs.openSync(path, 'r')
  fs.readSync(fd, buffer, 0, 24, 0)
  fs.closeSync(fd)
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  return `${width}x${height}`
}

;(async () => {
  console.log('Checking if dev server is running on http://localhost:5173...')

  try {
    const res = await fetch('http://localhost:5173')
    if (!res.ok) throw new Error()
  } catch (_e) {
    console.error('❌ Dev server is not running!')
    console.error(
      "Please run 'bun dev' in another terminal first, then run this script."
    )
    process.exit(1)
  }

  console.log('Launching browser...')
  const browser = await chromium.launch()

  const repos = [
    'lovelace-blitzortung-lightning-card',
    'lovelace-background-graph-entities',
    'lovelace-nina-dwd-card',
    'lovelace-tankerkoenig-card',
  ]

  // Read GitHub token from .env or .env.local
  let githubToken = ''
  try {
    const envPath = fs.existsSync('.env.local') ? '.env.local' : '.env'
    const envFile = fs.readFileSync(envPath, 'utf8')
    const tokenMatch = envFile.match(/GITHUB_TOKEN=([^\n\r]+)/)
    if (tokenMatch) {
      githubToken = tokenMatch[1].trim()
      console.log(
        `🔑 Found GITHUB_TOKEN in ${envPath}, injecting into browser session...`
      )
    }
  } catch (_e) {
    // Ignore if file doesn't exist
  }

  // Desktop
  console.log('Taking desktop screenshot...')
  const desktopContext = await browser.newContext({
    colorScheme: 'light',
  })
  const desktopPage = await desktopContext.newPage()

  // Start with a normal desktop viewport so the chart renders at a normal ratio
  await desktopPage.setViewportSize({ width: 1280, height: 900 })

  await desktopPage.goto('http://localhost:5173/github-release-stats/', {
    waitUntil: 'networkidle',
  })

  // Strip height classes IMMEDIATELY so setting a huge viewport doesn't stretch the chart
  await desktopPage.evaluate(() => {
    document.documentElement.classList.remove('h-100')
    document.body.classList.remove('h-100')
    const el = document.querySelector('github-release-stats')
    if (el) el.classList.remove('flex-grow-1')
  })

  if (githubToken) {
    await desktopPage.evaluate((token) => {
      localStorage.setItem('github-token', token)
    }, githubToken)
    await desktopPage.reload({ waitUntil: 'networkidle' })
    // Re-strip after reload
    await desktopPage.evaluate(() => {
      document.documentElement.classList.remove('h-100')
      document.body.classList.remove('h-100')
      const el = document.querySelector('github-release-stats')
      if (el) el.classList.remove('flex-grow-1')
    })
  }

  for (const repo of repos) {
    await desktopPage.fill('#username-input', 'timmaurice')
    await desktopPage.fill('#repository-input', repo)
    await desktopPage.click('button[type="submit"]')
    await desktopPage.waitForTimeout(1500) // Wait for data fetch and animation
  }

  // No need to manually resize viewport, fullPage handles it.
  await desktopPage.screenshot({
    path: 'public/screenshot-desktop.png',
    fullPage: true,
  })
  await desktopContext.close()

  // Mobile
  console.log('Taking mobile screenshot...')
  const mobileDevice = devices['iPhone 15 Pro Max']
  const mobileContext = await browser.newContext({
    ...mobileDevice,
    deviceScaleFactor: 2, // Reduced from 3x to ensure full page fits under 3840px PWA limit
    colorScheme: 'light',
  })
  const mobilePage = await mobileContext.newPage()

  // Start with native device viewport
  await mobilePage.setViewportSize({
    width: mobileDevice.viewport.width,
    height: mobileDevice.viewport.height,
  })

  await mobilePage.goto('http://localhost:5173/github-release-stats/', {
    waitUntil: 'networkidle',
  })

  // Strip height classes IMMEDIATELY so setting a huge viewport doesn't stretch the chart
  await mobilePage.evaluate(() => {
    document.documentElement.classList.remove('h-100')
    document.body.classList.remove('h-100')
    const el = document.querySelector('github-release-stats')
    if (el) el.classList.remove('flex-grow-1')
  })

  if (githubToken) {
    await mobilePage.evaluate((token) => {
      localStorage.setItem('github-token', token)
    }, githubToken)
    await mobilePage.reload({ waitUntil: 'networkidle' })
    // Re-strip after reload
    await mobilePage.evaluate(() => {
      document.documentElement.classList.remove('h-100')
      document.body.classList.remove('h-100')
      const el = document.querySelector('github-release-stats')
      if (el) el.classList.remove('flex-grow-1')
    })
  }

  for (const repo of repos) {
    await mobilePage.fill('#username-input', 'timmaurice')
    await mobilePage.fill('#repository-input', repo)
    await mobilePage.click('button[type="submit"]')
    await mobilePage.waitForTimeout(2000) // Increased wait for data fetch
  }

  // To strictly satisfy the PWA rule: height cannot be more than 2.3x the width.
  // We expand the viewport vertically to exactly 2.25x the width to maximize content visibility safely.
  const maxSafeCssHeight = Math.floor(mobileDevice.viewport.width * 2.25)
  await mobilePage.setViewportSize({
    width: mobileDevice.viewport.width,
    height: maxSafeCssHeight,
  })
  await mobilePage.waitForTimeout(3000) // Extended wait to guarantee 100% animation completion

  await mobilePage.screenshot({
    path: 'public/screenshot-mobile.png',
    // No fullPage: true here to strictly enforce the max viewport height
  })
  await mobileContext.close()

  await browser.close()

  // Automatically update vite.config.ts
  const desktopSize = getPngSize('public/screenshot-desktop.png')
  const mobileSize = getPngSize('public/screenshot-mobile.png')

  console.log(
    `Updating vite.config.ts with exact dimensions (Desktop: ${desktopSize}, Mobile: ${mobileSize})...`
  )
  let viteConfig = fs.readFileSync('vite.config.ts', 'utf8')

  viteConfig = viteConfig.replace(
    /(src:\s*'screenshot-desktop\.png',\s*sizes:\s*)'[^']+'/,
    `$1'${desktopSize}'`
  )
  viteConfig = viteConfig.replace(
    /(src:\s*'screenshot-mobile\.png',\s*sizes:\s*)'[^']+'/,
    `$1'${mobileSize}'`
  )

  fs.writeFileSync('vite.config.ts', viteConfig)

  console.log('✅ Screenshots captured and manifest updated successfully!')
})()
