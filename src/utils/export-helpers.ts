import type { RepoSummary } from '../components/summary-table'

/**
 * Generates a CSV string from an array of RepoSummary data.
 */
export function generateCsvContent(
  sortedData: RepoSummary[],
  headers: string[]
): string {
  const rows = sortedData.map((repo) => {
    // Sanitize data for CSV: escape commas and quotes
    const escapeCsv = (str: string | number) => {
      const s = String(str)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
    return [
      escapeCsv(repo.identifier),
      repo.stars,
      escapeCsv(repo.latestVersion),
      repo.lastUpdate,
      repo.size,
      repo.totalDownloads,
    ].join(',')
  })

  return [headers.join(','), ...rows].join('\n')
}

/**
 * Generates a Markdown table string from an array of RepoSummary data.
 */
export function generateMarkdownContent(
  sortedData: RepoSummary[],
  headers: string[]
): string {
  const rows = sortedData.map((repo) => {
    const repoLink = `[${repo.identifier}](https://github.com/${repo.identifier})`
    return `| ${repoLink} | ${repo.stars.toLocaleString()} | ${repo.openIssues.toLocaleString()} | ${repo.latestVersion} | ${repo.totalDownloads.toLocaleString()} |`
  })

  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows,
  ].join('\n')
}

/**
 * Triggers a file download in the browser with the given content.
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string
) {
  const blob = new Blob([content], { type: mimeType })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
