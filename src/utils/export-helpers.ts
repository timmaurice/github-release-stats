import type { RepoSummary } from '../components/summary-table'
import type { GitHubRelease } from '../types'

/**
 * Generates a detailed Markdown report for a single repository.
 */
export function generateSingleRepoMarkdownReport(
  summary: RepoSummary,
  releases: GitHubRelease[],
  stargazers: { starred_at: string }[],
  issues: { created_at: string; closed_at: string | null }[]
): string {
  const repoUrl = `https://github.com/${summary.identifier}`

  const topReleases = releases
    .map((r) => {
      const downloads = r.assets.reduce((sum, a) => sum + a.download_count, 0)
      return {
        tag: r.tag_name,
        published: r.published_at,
        downloads,
      }
    })
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, 5)

  let report = `# Repository Report: ${summary.identifier}\n\n`
  report += `[View on GitHub](${repoUrl})\n\n`

  report += `## Overview\n`
  report += `- **Stars:** ${summary.stars.toLocaleString()}\n`
  report += `- **Total Downloads:** ${summary.totalDownloads.toLocaleString()}\n`
  report += `- **Open Issues:** ${summary.openIssues.toLocaleString()}\n`
  report += `- **Latest Version:** ${summary.latestVersion}\n\n`

  report += `## Top 5 Most Downloaded Releases\n`
  if (topReleases.length === 0) {
    report += `*No releases found.*\n\n`
  } else {
    report += `| Release | Published | Downloads |\n`
    report += `| --- | --- | --- |\n`
    topReleases.forEach((r) => {
      const date = r.published
        ? new Date(r.published).toLocaleDateString()
        : 'N/A'
      report += `| ${r.tag} | ${date} | ${r.downloads.toLocaleString()} |\n`
    })
    report += `\n`
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentStars = stargazers.filter(
    (s) => new Date(s.starred_at) > thirtyDaysAgo
  ).length
  report += `## Recent Activity (Last 30 Days)\n`
  report += `- **New Stars:** ${recentStars.toLocaleString()}\n`

  const recentIssues = issues.filter(
    (i) => new Date(i.created_at) > thirtyDaysAgo
  ).length
  report += `- **New Issues Opened:** ${recentIssues.toLocaleString()}\n`

  return report
}

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
