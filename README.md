# GitHub Release Stats

A web application to visualize and compare download statistics, star history, open issues, and other key metrics for GitHub repositories.

## 🚀 Live Demo

**[Check out the live application here!](https://timmaurice.github.io/github-release-stats/)**

## ✨ Features

### Data Visualization

- **Multi-Repository Comparison:** Compare key metrics for multiple repositories side-by-side.
- **Interactive & Dynamic Charts:**
  - **Downloads per Release:** Track download counts for each release.
  - **Cumulative Star History:** Visualize the growth of repository stars over time.
  - **Open Issues History:** See the trend of open issues.
  - **Total Asset Size:** Monitor the size of release assets over time.
- **Dynamic Chart Metric:** The chart automatically updates to visualize the metric you sort by in the summary table.
- **Linear & Logarithmic Scales:** Switch the chart's Y-axis scale for better data analysis.
- **Zoom & Pan:** Zoom in on specific time ranges within the charts.

### Data Management

- **Save & Manage Sets:** Save your comparison sets and easily load them later.
- **Shareable URLs:** The URL automatically updates as you add or reorder repositories, making it easy to share your exact comparison.
- **Export to CSV:** Download the summary table data for offline analysis.

### User Experience

- **Drag & Drop Reordering:** Easily reorder repositories by dragging their pills.
- **Responsive Design:** A clean and intuitive interface that works on both desktop and mobile.
- **Light & Dark Mode:** Automatically detects system preference and allows manual toggling.
- **Internationalization (i18n):** Available in English, German, and Simplified Chinese.
- **GitHub API Authentication:** Enter a Personal Access Token to increase the API rate limit from 60 to 5,000 requests/hour.

## 🛠️ Getting Started

1.  **Enter a Repository:** Start by typing a GitHub username (e.g., `microsoft`) and repository name (e.g., `vscode`).
2.  **Add More Repositories:** Use the "Add Repository" form to add more projects to the comparison.
3.  **Analyze the Data:**
    - Click on the headers in the summary table to sort the data. The chart above will dynamically update to visualize the sorted metric.
    - Use the toggle buttons to switch the chart's scale between `Linear` and `Logarithmic`.
    - Click on the accordion headers to view a detailed release list for each repository.
4.  **Manage Your View:**
    - Drag and drop the repository pills to reorder them.
    - Save your current set of repositories for later, or load a previously saved set.
    - Click "Copy Link" to get a shareable URL of your current comparison.

### API Rate Limits

By default, the GitHub API has a rate limit of 60 requests per hour for unauthenticated users. To increase this limit, you can provide a GitHub Personal Access Token.

1.  Scroll to the bottom of the page and expand the "API Authentication" section.
2.  Paste your token into the input field and click "Save".
3.  The token is stored securely in your browser's `localStorage` and is only sent to the GitHub API.

## 💻 Running Locally

To run this project on your local machine, follow these steps:

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/timmaurice/github-release-stats.git
    cd github-release-stats
    ```

2.  **Install dependencies:**

    ```bash
    bun install
    ```

3.  **Run the development server:**

    ```bash
    bun dev
    ```

4.  Open your browser and navigate to the local URL provided by Vite (usually `http://localhost:5173`).

### Other Scripts

- **Build for production:**

  ```bash
  bun run build
  ```

- **Lint the code:**

  ```bash
  bun run lint
  ```

- **Format the code:**
  ```bash
  bun run format
  ```

## ⚙️ Tech Stack

- **Framework:** Lit
- **Language:** TypeScript
- **Bundler:** Vite
- **Styling:** Bootstrap 5, Bootstrap Icons & SASS
- **Charting:** Chart.js, `chartjs-adapter-date-fns`, `chartjs-plugin-zoom`
- **GitHub API:** Octokit.js
- **Drag & Drop:** SortableJS

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for details.
