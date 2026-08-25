import { test, expect } from '@playwright/test'

test.describe('GitHub Release Stats E2E', () => {
  test.beforeEach(async ({ page }) => {
    const today = new Date()

    const oneMonthAgo = new Date(today)
    oneMonthAgo.setMonth(today.getMonth() - 1)

    const twoMonthsAgo = new Date(today)
    twoMonthsAgo.setMonth(today.getMonth() - 2)

    const threeMonthsAgo = new Date(today)
    threeMonthsAgo.setMonth(today.getMonth() - 3)

    const dateStr1 = oneMonthAgo.toISOString()
    const dateStr2 = twoMonthsAgo.toISOString()
    const dateStr3 = threeMonthsAgo.toISOString()

    // Default mock catch-all for GitHub API
    await page.route('https://api.github.com/repos/**/*', async (route) => {
      await route.fulfill({ json: [] })
    })

    // Mock GitHub API to prevent rate limiting
    await page.route(
      'https://api.github.com/repos/microsoft/vscode',
      async (route) => {
        await route.fulfill({
          json: {
            id: 1,
            full_name: 'microsoft/vscode',
            stargazers_count: 100,
            open_issues_count: 10,
            updated_at: dateStr3,
            pushed_at: dateStr3,
            size: 150000,
          },
        })
      }
    )
    await page.route(
      'https://api.github.com/repos/microsoft/vscode/releases*',
      async (route) => {
        await route.fulfill({
          json: [
            {
              tag_name: 'v1.2.0',
              name: 'Stable Release 1.2.0',
              published_at: dateStr1,
              assets: [{ download_count: 500, size: 1500 }],
            },
            {
              tag_name: 'v1.1.0',
              name: 'Feature Update 1.1.0',
              published_at: dateStr2,
              assets: [{ download_count: 300, size: 1200 }],
            },
            {
              tag_name: 'v1.0.0',
              name: 'Initial Release',
              published_at: dateStr3,
              assets: [{ download_count: 100, size: 1024 }],
            },
          ],
        })
      }
    )
    await page.route(
      'https://api.github.com/repos/microsoft/vscode/stargazers*',
      async (route) => {
        await route.fulfill({ json: [] })
      }
    )
    await page.route(
      'https://api.github.com/repos/microsoft/vscode/issues*',
      async (route) => {
        await route.fulfill({ json: [] })
      }
    )

    await page.route(
      'https://api.github.com/repos/facebook/react',
      async (route) => {
        await route.fulfill({
          json: {
            id: 2,
            full_name: 'facebook/react',
            stargazers_count: 200,
            open_issues_count: 20,
            updated_at: dateStr3,
            pushed_at: dateStr1,
            size: 50000,
          },
        })
      }
    )
    await page.route(
      'https://api.github.com/repos/facebook/react/releases*',
      async (route) => {
        await route.fulfill({
          json: [
            {
              tag_name: 'v2.2.0',
              name: 'React 19 RC',
              published_at: dateStr1,
              assets: [{ download_count: 800, size: 2500 }],
            },
            {
              tag_name: 'v2.1.0',
              name: 'React 18.3.0',
              published_at: dateStr2,
              assets: [{ download_count: 400, size: 2200 }],
            },
            {
              tag_name: 'v2.0.0',
              name: 'React 18.2.0',
              published_at: dateStr3,
              assets: [{ download_count: 200, size: 2048 }],
            },
          ],
        })
      }
    )
    await page.route(
      'https://api.github.com/repos/facebook/react/stargazers*',
      async (route) => {
        await route.fulfill({ json: [] })
      }
    )
    await page.route(
      'https://api.github.com/repos/facebook/react/issues*',
      async (route) => {
        await route.fulfill({ json: [] })
      }
    )

    // Mock an invalid repo
    await page.route(
      'https://api.github.com/repos/invalid/repo',
      async (route) => {
        await route.fulfill({ status: 404, json: { message: 'Not Found' } })
      }
    )
    await page.route(
      'https://api.github.com/repos/invalid/repo/releases*',
      async (route) => {
        await route.fulfill({ status: 404, json: { message: 'Not Found' } })
      }
    )

    // Start on the index page
    await page.goto('/')
  })

  test('should load the page and have correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Github Release Stats/i)
  })

  test('should add multiple repositories and show them in the summary table', async ({
    page,
  }) => {
    const usernameInput = page.locator('#username-input').first()
    const repoInput = page.locator('#repository-input').first()
    const submitButton = page
      .locator('search-form button[type="submit"]')
      .first()

    // Add first repo
    await expect(usernameInput).toBeVisible()
    await usernameInput.fill('microsoft')
    await repoInput.fill('vscode')
    await submitButton.click()

    const summaryTable = page.locator('summary-table')
    await expect(summaryTable).toBeVisible({ timeout: 15000 })
    await expect(
      summaryTable.locator('td', { hasText: 'microsoft/vscode' })
    ).toBeVisible()

    // Add second repo
    await usernameInput.fill('facebook')
    await repoInput.fill('react')
    await submitButton.click()

    await expect(
      summaryTable.locator('td', { hasText: 'facebook/react' })
    ).toBeVisible()
    await expect(
      summaryTable.locator('td', { hasText: 'microsoft/vscode' })
    ).toBeVisible()

    // Check if the chart is visible
    const chartDisplay = page.locator('chart-display canvas')
    await expect(chartDisplay).toBeVisible()

    // Open the microsoft/vscode accordion
    const vscodeAccordionBtn = page.locator(
      'button[data-bs-target="#collapse-microsoft-vscode"]'
    )
    await vscodeAccordionBtn.click()

    // Wait for the accordion to be fully open
    await expect(page.locator('#collapse-microsoft-vscode')).toHaveClass(
      /show/,
      { timeout: 5000 }
    )

    // Test chart scale toggle (switch to Logarithmic)
    const logarithmicBtn = page
      .locator('label', { hasText: 'Logarithmic' })
      .or(page.locator('button', { hasText: 'Logarithmic' }))
      .first()
    await logarithmicBtn.click()

    // Hide fixed elements before full page screenshot to prevent Playwright scrolling artifacts
    await page.addStyleTag({
      content: '.position-fixed { display: none !important; }',
    })

    // Take screenshot with data
    await page.screenshot({ path: 'screenshot.png', fullPage: true })
  })

  test('should delete a repository', async ({ page }) => {
    const usernameInput = page.locator('#username-input').first()
    const repoInput = page.locator('#repository-input').first()
    const submitButton = page
      .locator('search-form button[type="submit"]')
      .first()

    // Add a repo
    await usernameInput.fill('microsoft')
    await repoInput.fill('vscode')
    await submitButton.click()

    const summaryTable = page.locator('summary-table')
    await expect(
      summaryTable.locator('td', { hasText: 'microsoft/vscode' })
    ).toBeVisible()

    // Find the pill and click its remove button
    const removeBtn = page.locator(
      'button.btn-close[aria-label="Remove microsoft/vscode"]'
    )
    await removeBtn.click()

    // Verify it is removed
    await expect(
      page.locator('td', { hasText: 'microsoft/vscode' })
    ).toBeHidden()
  })

  test('should clear all repositories', async ({ page }) => {
    const usernameInput = page.locator('#username-input').first()
    const repoInput = page.locator('#repository-input').first()
    const submitButton = page
      .locator('search-form button[type="submit"]')
      .first()

    // Add multiple repos
    await usernameInput.fill('microsoft')
    await repoInput.fill('vscode')
    await submitButton.click()

    await usernameInput.fill('facebook')
    await repoInput.fill('react')
    await submitButton.click()

    await expect(
      page.locator('td', { hasText: 'facebook/react' })
    ).toBeVisible()

    // Find the Clear All button specifically by text and click it
    const actualClearBtn = page.locator('button', { hasText: 'Clear All' })
    await actualClearBtn.click()

    // Handle Bootstrap confirmation modal
    const modalConfirmBtn = page.locator('#confirmModal button.btn-danger')
    await expect(modalConfirmBtn).toBeVisible()
    await modalConfirmBtn.click()

    await expect(page.locator('td', { hasText: 'facebook/react' })).toBeHidden()
  })

  test('should toggle dark mode', async ({ page }) => {
    // Initial theme depends on OS, but we can toggle it
    const htmlNode = page.locator('html')
    const initialTheme = await htmlNode.getAttribute('data-bs-theme')

    // Open settings modal
    const settingsBtn = page.locator('button[data-bs-target="#settingsModal"]')
    await settingsBtn.click()
    const modal = page.locator('#settingsModal')
    await expect(modal).toBeVisible()

    // Click theme dropdown
    const themeDropdownBtn = page
      .locator('#settingsModal button[data-bs-toggle="dropdown"]')
      .nth(1) // Second dropdown is theme (first is language)
    await themeDropdownBtn.click()

    // Select Dark Mode
    const darkModeOption = page.locator('#settingsModal .dropdown-menu a', {
      hasText: 'Dark Mode',
    })
    await darkModeOption.click()

    // Wait for the actual theme change
    await expect(htmlNode).toHaveAttribute('data-bs-theme', 'dark')

    // Click theme dropdown again
    await themeDropdownBtn.click()

    // Select Light Mode
    const lightModeOption = page.locator('#settingsModal .dropdown-menu a', {
      hasText: 'Light Mode',
    })
    await lightModeOption.click()

    await expect(htmlNode).toHaveAttribute('data-bs-theme', 'light')
  })

  test('should change language and update placeholder', async ({ page }) => {
    // Current placeholder
    const usernameInput = page.locator('#username-input').first()
    await expect(usernameInput).toHaveAttribute('placeholder', 'Username')

    // Open settings modal
    const settingsBtn = page.locator('button[data-bs-target="#settingsModal"]')
    await settingsBtn.click()
    const modal = page.locator('#settingsModal')
    await expect(modal).toBeVisible()

    // Change language to German
    const langDropdownBtn = page
      .locator('#settingsModal button[data-bs-toggle="dropdown"]')
      .first()
    await langDropdownBtn.click()

    const deOption = page.locator('#settingsModal .dropdown-menu a', {
      hasText: 'Deutsch',
    })
    await deOption.click()

    // Verify placeholder changes
    await expect(usernameInput).toHaveAttribute('placeholder', 'Benutzername')
  })

  test('should toggle Filter Dependabot PRs setting', async ({ page }) => {
    // Open settings modal
    const settingsBtn = page.locator('button[data-bs-target="#settingsModal"]')
    await settingsBtn.click()

    const modal = page.locator('#settingsModal')
    await expect(modal).toBeVisible()

    // Find the toggle
    const dependabotToggle = page.locator('#filterDependabotSwitch')

    // Default should be false (unchecked)
    await expect(dependabotToggle).not.toBeChecked()

    // Check it
    await dependabotToggle.check()
    await expect(dependabotToggle).toBeChecked()

    // Uncheck it
    await dependabotToggle.uncheck()
    await expect(dependabotToggle).not.toBeChecked()
  })

  test('should toggle Show Total Downloads setting and update summary table', async ({
    page,
  }) => {
    // Add a repo first to see the summary table
    await page.locator('#username-input').first().fill('microsoft')
    await page.locator('#repository-input').first().fill('vscode')
    await page.locator('search-form button[type="submit"]').first().click()

    // Verify the Total Downloads column exists
    const totalDownloadsHeader = page.locator('summary-table th', {
      hasText: 'Total Downloads',
    })
    await expect(totalDownloadsHeader).toBeVisible()

    // Open settings modal
    const settingsBtn = page.locator('button[data-bs-target="#settingsModal"]')
    await settingsBtn.click()

    const modal = page.locator('#settingsModal')
    await expect(modal).toBeVisible()

    // Find the toggle
    const downloadsToggle = page.locator('#showTotalDownloadsSwitch')

    // Default should be true (checked)
    await expect(downloadsToggle).toBeChecked()

    // Uncheck it
    await downloadsToggle.uncheck()
    await expect(downloadsToggle).not.toBeChecked()

    // Close the modal to see the table
    const closeBtn = page.locator('#settingsModal .btn-close')
    await closeBtn.click()
    await expect(modal).not.toBeVisible()

    // Verify the Total Downloads column is hidden
    await expect(totalDownloadsHeader).not.toBeVisible()
  })

  test('should handle API authentication', async ({ page }) => {
    // The status reflects GitHub's answer, so the answer has to be mocked.
    await page.route('https://api.github.com/rate_limit', async (route) => {
      await route.fulfill({
        json: {
          resources: {
            core: { limit: 5000, remaining: 4999, reset: 9999999999 },
          },
        },
      })
    })

    // Open settings modal
    const settingsBtn = page.locator('button[data-bs-target="#settingsModal"]')
    await settingsBtn.click()

    // Wait for modal to be visible
    const modal = page.locator('#settingsModal')
    await expect(modal).toBeVisible()

    // Enter token
    const tokenInput = page.locator('#token-input')
    await expect(tokenInput).toBeVisible()
    await tokenInput.fill('ghp_dummytoken123')

    // Click Save
    const saveBtn = page.locator('#settingsModal button[type="submit"]')
    await saveBtn.click()

    // Verify it shows as Authenticated
    await expect(page.locator('#settingsModal .badge.bg-success')).toBeVisible()
  })

  test('reports a token that GitHub rejects instead of claiming authenticated', async ({
    page,
  }) => {
    await page.route('https://api.github.com/rate_limit', async (route) => {
      await route.fulfill({ status: 401, json: { message: 'Bad credentials' } })
    })

    await page.locator('button[data-bs-target="#settingsModal"]').click()
    await expect(page.locator('#settingsModal')).toBeVisible()

    await page.locator('#token-input').fill('ghp_revokedtoken123')
    await page.locator('#settingsModal button[type="submit"]').click()

    // A stored-but-rejected token must not read as authenticated.
    await expect(page.locator('#settingsModal .badge.bg-danger')).toBeVisible()
    await expect(page.locator('#settingsModal .badge.bg-success')).toHaveCount(
      0
    )
  })

  test('can reveal and re-hide the access token', async ({ page }) => {
    await page.locator('button[data-bs-target="#settingsModal"]').click()
    await expect(page.locator('#settingsModal')).toBeVisible()

    const tokenInput = page.locator('#token-input')
    await tokenInput.fill('ghp_visibletoken123')
    await expect(tokenInput).toHaveAttribute('type', 'password')

    const toggle = page.locator('#settingsModal button[aria-pressed]')
    await toggle.click()
    await expect(tokenInput).toHaveAttribute('type', 'text')
    await expect(tokenInput).toHaveValue('ghp_visibletoken123')

    await toggle.click()
    await expect(tokenInput).toHaveAttribute('type', 'password')
  })

  test('should save and load a repository set', async ({ page }) => {
    const usernameInput = page.locator('#username-input').first()
    const repoInput = page.locator('#repository-input').first()
    const submitButton = page
      .locator('search-form button[type="submit"]')
      .first()

    // Add a repo
    await usernameInput.fill('microsoft')
    await repoInput.fill('vscode')
    await submitButton.click()

    // Save set
    const setsDropdownBtn = page.locator('button', { hasText: 'Sets' })
    await setsDropdownBtn.click()

    const saveSetBtn = page.locator('a', { hasText: 'Save Current Set' })
    await saveSetBtn.click()

    // Handle the modal
    const saveSetModal = page.locator('#saveSetModal')
    await expect(saveSetModal).toBeVisible()

    const setNameInput = page.locator('#saveSetNameInput')
    await setNameInput.fill('My Test Set')

    const modalSaveBtn = saveSetModal
      .locator('button[type="button"].btn-primary')
      .or(saveSetModal.locator('.btn-primary'))
    await modalSaveBtn.click()

    // Verify the set appears in the dropdown
    await setsDropdownBtn.click()
    await expect(
      page.locator('.dropdown-menu', { hasText: 'My Test Set' })
    ).toBeVisible()
  })

  test('should display action buttons in the toolbar', async ({ page }) => {
    // Add a repo
    await page.locator('#username-input').first().fill('microsoft')
    await page.locator('#repository-input').first().fill('vscode')
    await page.locator('search-form button[type="submit"]').first().click()

    // Verify buttons are visible
    await expect(page.locator('button', { hasText: 'Copy Link' })).toBeVisible()
    await expect(
      page.locator('button', { hasText: 'Export CSV' })
    ).toBeVisible()
    await expect(
      page.locator('button', { hasText: 'Copy Markdown' })
    ).toBeVisible()
    await expect(
      page.locator('button', { hasText: 'Pin to Dashboard' })
    ).toBeVisible()
  })

  test('removes a repository when its close button is clicked, even with drift', async ({
    page,
  }) => {
    const usernameInput = page.locator('#username-input').first()
    const repoInput = page.locator('#repository-input').first()
    const submitButton = page
      .locator('search-form button[type="submit"]')
      .first()

    await usernameInput.fill('microsoft')
    await repoInput.fill('vscode')
    await submitButton.click()
    await usernameInput.fill('facebook')
    await repoInput.fill('react')
    await submitButton.click()

    const pills = page.locator('#repo-pills-container .badge')
    await expect(pills).toHaveCount(2, { timeout: 15000 })

    const closeButton = page
      .locator('#repo-pills-container .badge', { hasText: 'microsoft/vscode' })
      .locator('.btn-close')

    const box = await closeButton.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(24)
    expect(box!.height).toBeGreaterThanOrEqual(24)

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      box!.x + box!.width / 2 + 3,
      box!.y + box!.height / 2 + 2
    )
    await page.mouse.up()

    await expect(pills).toHaveCount(1)
    await expect(pills.first()).toContainText('facebook/react')
  })

  test('still reorders repositories by dragging a pill', async ({
    page,
    browserName,
  }) => {
    // SortableJS drags via its own fallback implementation, which WebKit does
    // not drive from synthetic mouse events. This fails there with or without
    // the drag filter, so it is a harness limit rather than a browser bug.
    test.skip(
      browserName === 'webkit',
      'synthetic drag does not reach the SortableJS fallback in WebKit'
    )

    const usernameInput = page.locator('#username-input').first()
    const repoInput = page.locator('#repository-input').first()
    const submitButton = page
      .locator('search-form button[type="submit"]')
      .first()

    await usernameInput.fill('microsoft')
    await repoInput.fill('vscode')
    await submitButton.click()
    await usernameInput.fill('facebook')
    await repoInput.fill('react')
    await submitButton.click()

    const pills = page.locator('#repo-pills-container .badge')
    await expect(pills).toHaveCount(2, { timeout: 15000 })
    const initial = await pills.allTextContents()

    const source = await pills.nth(1).boundingBox()
    const target = await pills.nth(0).boundingBox()

    await page.mouse.move(source!.x + 20, source!.y + source!.height / 2)
    await page.mouse.down()
    await page.mouse.move(target!.x + 40, target!.y + target!.height / 2, {
      steps: 15,
    })
    await page.mouse.move(target!.x + 5, target!.y + target!.height / 2, {
      steps: 10,
    })
    await page.mouse.up()

    await expect.poll(() => pills.allTextContents()).not.toEqual(initial)
  })

  test('hides pre-releases from the table and download totals when enabled', async ({
    page,
  }) => {
    await page.route(
      'https://api.github.com/repos/microsoft/vscode/releases*',
      async (route) => {
        await route.fulfill({
          json: [
            {
              tag_name: 'v2.0.0-beta.1',
              name: 'Beta',
              prerelease: true,
              published_at: '2026-03-01T00:00:00Z',
              assets: [{ download_count: 40, size: 100 }],
            },
            {
              tag_name: 'v1.9.0',
              name: 'Stable',
              prerelease: false,
              published_at: '2026-02-01T00:00:00Z',
              assets: [{ download_count: 600, size: 100 }],
            },
          ],
        })
      }
    )

    await page.locator('#username-input').first().fill('microsoft')
    await page.locator('#repository-input').first().fill('vscode')
    await page.locator('search-form button[type="submit"]').first().click()

    const row = page
      .locator('summary-table tr', { hasText: 'microsoft/vscode' })
      .first()
    await expect(row).toBeVisible({ timeout: 15000 })

    // By default the pre-release is the newest thing on offer.
    await expect(row).toContainText('v2.0.0-beta.1')
    await expect(row).toContainText('640')

    await page.locator('button[data-bs-target="#settingsModal"]').click()
    await expect(page.locator('#settingsModal')).toBeVisible()
    await page.locator('#hidePreReleasesSwitch').click()
    await page.locator('#settingsModal .modal-footer button').click()

    // The stable release becomes the latest, and its downloads no longer count.
    await expect(row).toContainText('v1.9.0')
    await expect(row).toContainText('600')
    await expect(row).not.toContainText('beta')
  })

  test('recovers from a cache written by an older version of the app', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    // Recreate the database exactly as an older build left it: version 1, with
    // the whole Octokit response stored under the releases key rather than the
    // releases array the current build expects.
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        const del = indexedDB.deleteDatabase('github-release-stats-db')
        del.onsuccess = del.onerror = del.onblocked = resolve
      })
      await new Promise((resolve, reject) => {
        const req = indexedDB.open('github-release-stats-db', 1)
        req.onupgradeneeded = () => req.result.createObjectStore('api-cache')
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('api-cache', 'readwrite')
          tx.objectStore('api-cache').put(
            {
              timestamp: Date.now(),
              data: { status: 200, headers: {}, url: 'x', data: [] },
            },
            'releases-microsoft-vscode'
          )
          tx.oncomplete = () => {
            db.close()
            resolve(null)
          }
          tx.onerror = reject
        }
        req.onerror = reject
      })
    })

    await page.goto('/?repos=microsoft/vscode')

    const summaryTable = page.locator('summary-table')
    await expect(
      summaryTable.locator('td', { hasText: 'microsoft/vscode' })
    ).toBeVisible({ timeout: 15000 })
    expect(pageErrors).toEqual([])
  })

  test('keeps the working repositories when one of them fails to load', async ({
    page,
  }) => {
    // Registered after the beforeEach catch-all, so it wins for this repo.
    await page.route(
      'https://api.github.com/repos/ghost/deleted**',
      async (route) => {
        await route.fulfill({ status: 404, json: { message: 'Not Found' } })
      }
    )

    const usernameInput = page.locator('#username-input').first()
    const repoInput = page.locator('#repository-input').first()
    const submitButton = page
      .locator('search-form button[type="submit"]')
      .first()

    await expect(usernameInput).toBeVisible()
    await usernameInput.fill('microsoft')
    await repoInput.fill('vscode')
    await submitButton.click()

    const summaryTable = page.locator('summary-table')
    await expect(
      summaryTable.locator('td', { hasText: 'microsoft/vscode' })
    ).toBeVisible({ timeout: 15000 })

    await usernameInput.fill('ghost')
    await repoInput.fill('deleted')
    await submitButton.click()

    // The failure is reported on its own...
    const failureAlert = page.locator('.alert-danger')
    await expect(failureAlert).toBeVisible({ timeout: 15000 })
    await expect(failureAlert).toContainText('ghost/deleted')

    // ...while the repository that loaded is still fully rendered.
    await expect(
      summaryTable.locator('td', { hasText: 'microsoft/vscode' })
    ).toBeVisible()
    await expect(page.locator('chart-display canvas')).toBeVisible()

    // The failed repository stays removable rather than disappearing.
    await expect(
      page.locator('.badge.text-bg-danger', { hasText: 'ghost/deleted' })
    ).toBeVisible()
  })

  test('should handle network errors (404) gracefully', async ({ page }) => {
    const usernameInput = page.locator('#username-input').first()
    const repoInput = page.locator('#repository-input').first()
    const submitButton = page
      .locator('search-form button[type="submit"]')
      .first()

    // Add invalid repo
    await usernameInput.fill('invalid')
    await repoInput.fill('repo')
    await submitButton.click()

    // Look for error message span or banner
    // Network Error is translated to "Failed to connect to GitHub. Please check your network connection." in en.json
    // But our mock returns 404 which is handled as "Could not fetch data..." or "Repository not found"
    // Let's just look for "Network error" or "Oops" or something similar from results-display.
    const errorDisplay = page
      .locator('.text-danger, .alert-danger, [role="alert"]')
      .first()
    // It should become visible
    await expect(errorDisplay).toBeVisible({ timeout: 10000 })
  })
})
