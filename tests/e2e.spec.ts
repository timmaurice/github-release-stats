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

    // Click theme toggle
    const themeToggleBtn = page
      .locator('button[aria-label="Toggle theme"]')
      .or(page.locator('button[title*="theme" i]'))
      .first()
    await themeToggleBtn.click()

    const newTheme = await htmlNode.getAttribute('data-bs-theme')
    expect(newTheme).not.toBe(initialTheme)
  })

  test('should change language and update placeholder', async ({ page }) => {
    // Current placeholder
    const usernameInput = page.locator('#username-input').first()
    await expect(usernameInput).toHaveAttribute('placeholder', 'Username')

    // Change language to German
    const langDropdownBtn = page
      .locator('button[data-bs-toggle="dropdown"]')
      .filter({ has: page.locator('i.bi-translate') })
      .first()
    await langDropdownBtn.click()

    const deOption = page.locator('.dropdown-menu a', { hasText: 'Deutsch' })
    await deOption.click()

    // Verify placeholder changes
    await expect(usernameInput).toHaveAttribute('placeholder', 'Benutzername')
  })

  test('should handle API authentication', async ({ page }) => {
    // Open auth accordion
    const authBtn = page.locator('button[data-bs-target="#authCollapse"]')
    await authBtn.click()

    // Enter token
    const tokenInput = page.locator('#token-input')
    await expect(tokenInput).toBeVisible()
    await tokenInput.fill('ghp_dummytoken123')

    // Click Save
    const saveBtn = page.locator('#authCollapse button[type="submit"]')
    await saveBtn.click()

    // Verify it shows as Authenticated
    await expect(page.locator('#authCollapse .badge.bg-success')).toBeVisible()
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
