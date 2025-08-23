# GitHub Release Stats

A web application to visualize and compare download statistics, star history, and other key metrics for GitHub repositories.

## ✨ Features

- **Multi-Repository Comparison:** Compare stats for multiple repositories side-by-side.
- **Interactive Charts:**
  - Downloads per release over time.
  - Cumulative star history over time.
  - Total asset size per release over time.
- **Dynamic Charting:** The chart metric automatically changes based on the sorted column in the summary table (e.g., sort by "Stars" to see the star history graph).
- **Sortable Summary Table:** Rank repositories by stars, latest version, last update, size, or total downloads.
- **Light & Dark Mode:** Automatically detects system preference and allows manual toggling.
- **Linear & Logarithmic Scales:** Switch the chart's Y-axis between linear and logarithmic scales for better data analysis.
- **GitHub API Authentication:** Enter a Personal Access Token to increase the API rate limit from 60 to 5,000 requests/hour.
- **Export to CSV:** Download the summary table data for offline analysis.
- **Responsive Design:** Works on both desktop and mobile devices.

## 🚀 Live Demo

**(Link to your live demo here)**

## 🛠️ How to Use

1.  **Enter a Repository:** Start by typing a GitHub username (e.g., `microsoft`) and repository name (e.g., `vscode`).
2.  **Add More Repositories:** Use the "Add Repository" form to add more projects to the comparison.
3.  **Analyze the Data:**
    - Click on the headers in the summary table to sort the data. The chart above will dynamically update to visualize the sorted metric.
    - Use the toggle buttons to switch the chart's scale between `Linear` and `Logarithmic`.
    - Click on the accordion headers to view the detailed release list for each repository.
4.  **Export:** Click the "Export CSV" button to download the summary data.

### Overcoming Rate Limits

By default, the GitHub API has a rate limit of 60 requests per hour for unauthenticated users. To increase this limit, you can provide a GitHub Personal Access Token.

1.  Scroll to the bottom of the page and expand the "API Authentication" section.
2.  Paste your token into the input field and click "Save".
3.  The token is stored securely in your browser's `sessionStorage` and is only sent to the GitHub API. It will be cleared when you close the browser tab.

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
- **Styling:** Bootstrap 5 & Bootstrap Icons
- **Charting:** Chart.js
- **GitHub API:** Octokit.js

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for details.
