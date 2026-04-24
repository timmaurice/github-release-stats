# Development Guide

Welcome to the GitHub Release Stats development documentation! This guide will help you set up the project locally, understand the architecture, and contribute effectively.

## 🛠️ Prerequisites

- **[Bun](https://bun.sh/)**: We use Bun as our JavaScript runtime, package manager, test runner, and bundler. Make sure you have it installed.

## 🚀 Getting Started

1. **Clone the repository:**

   ```bash
   git clone https://github.com/timmaurice/github-release-stats.git
   cd github-release-stats
   ```

2. **Install dependencies:**

   ```bash
   bun install
   ```

3. **Run the development server:**

   ```bash
   bun run dev
   ```

4. Open your browser and navigate to the local URL provided by Vite (usually `http://localhost:5173`).

## 📁 Project Structure

The project uses a component-based architecture built with Lit and TypeScript.

- `src/` - Application source code
  - `components/` - Lit Web Components (e.g., `chart-display`, `settings-modal`, `summary-table`)
  - `localization/` - i18n logic and locale files (`en.json`, `de.json`, `zh-CN.json`)
  - `utils/` - Helper functions (API wrappers, export logic, toast notifications)
  - `github-release-stats.ts` - The main application container and state manager
  - `index.html` - The application entry point
- `tests/` - End-to-End Playwright tests
- `public/` - Static assets (icons, screenshots)
- `scripts/` - Build and automation scripts (e.g., screenshots generator)

## 📜 Available Scripts

Here are the primary commands you'll use during development:

- **`bun run dev`**: Starts the Vite development server with Hot Module Replacement (HMR).
- **`bun run build`**: Compiles TypeScript and builds the production bundle into the `dist/` folder using Vite.
- **`bun run preview`**: Boots up a local web server to serve the production build from `dist/` (useful for testing PWA functionality).

### Code Quality & Formatting

We enforce strict formatting and linting rules. Ensure these pass before committing:

- **`bun run format`**: Formats all files using Prettier.
- **`bun run lint`**: Runs ESLint to check for code quality and TypeScript errors. Fixes auto-fixable issues.

### Testing

We use Bun's built-in test runner for unit tests and Playwright for End-to-End (E2E) UI tests.

- **`bun test`**: Runs unit tests (`*.test.ts` files).
- **`bun run test:e2e`**: Runs the Playwright E2E test suite in headless mode.
- **`bun run test:e2e --headed`**: Runs E2E tests visibly in the browser.
- **`bun x playwright test --ui`**: Opens the interactive Playwright UI for stepping through and debugging E2E tests.
- **`bun x playwright show-report`**: Displays the HTML report from the latest E2E test run.

### Automation Scripts

- **`bun run screenshot`**: A custom script using Puppeteer to automatically capture mobile and desktop screenshots of the live app and update `vite.config.ts` with their exact dimensions for the PWA manifest. Make sure the dev server is running (`bun run dev`) before executing this.

## 🎨 Architecture & State Management

- **Global State**: The main `GithubReleaseStats` class (`src/github-release-stats.ts`) acts as the single source of truth. It manages the list of repositories, data fetched from GitHub, and user preferences.
- **Persistence**: User preferences (Language, Theme, API Token, Show Total Downloads, Dependabot Filter) are persisted in `localStorage`.
- **Event-Driven UI**: Child components dispatch `CustomEvent`s (e.g., `@save-token`, `@theme-change`) to request state changes. The main class listens to these events, updates its state, and Lit automatically re-renders the necessary parts of the DOM.
- **Localization**: We use a custom, lightweight localization controller (`src/localization/`). Keys are requested using `this.localize.t('key')` within components, and updates happen reactively when the language changes.
