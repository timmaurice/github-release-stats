import { afterEach, describe, expect, it, setSystemTime } from 'bun:test'
import type { RepoSummary } from '../components/summary-table'
import type { GitHubRelease } from '../types'
import {
  generateCsvContent,
  generateMarkdownContent,
  generateSingleRepoMarkdownReport,
} from './export-helpers'

function summary(overrides: Partial<RepoSummary> = {}): RepoSummary {
  return {
    identifier: 'acme/widget',
    stars: 1234,
    latestVersion: 'v1.2.3',
    lastUpdate: '2026-05-01T00:00:00Z',
    size: 4096,
    totalDownloads: 98765,
    openIssues: 7,
    openPullRequests: 2,
    ...overrides,
  }
}

function release(
  tag: string,
  publishedAt: string,
  downloads: number
): GitHubRelease {
  return {
    tag_name: tag,
    html_url: `https://github.com/acme/widget/releases/${tag}`,
    prerelease: false,
    published_at: publishedAt,
    author: { login: 'acme', html_url: 'https://github.com/acme' },
    assets: [
      {
        name: `${tag}.zip`,
        size: 100,
        download_count: downloads,
        updated_at: publishedAt,
      },
    ],
  }
}

const CSV_HEADERS = [
  'Repository',
  'Stars',
  'Latest Version',
  'Last Update',
  'Size (KB)',
  'Total Downloads',
]

afterEach(() => {
  setSystemTime()
})

describe('generateCsvContent', () => {
  it('writes a header row followed by one row per repository', () => {
    const csv = generateCsvContent(
      [summary(), summary({ identifier: 'acme/other', stars: 1 })],
      CSV_HEADERS
    )
    const rows = csv.split('\n')

    expect(rows[0]).toBe(CSV_HEADERS.join(','))
    expect(rows).toHaveLength(3)
    expect(rows[1]).toBe(
      'acme/widget,1234,v1.2.3,2026-05-01T00:00:00Z,4096,98765'
    )
  })

  it('quotes fields containing a comma', () => {
    const csv = generateCsvContent(
      [summary({ latestVersion: 'v1.0, hotfix' })],
      CSV_HEADERS
    )
    expect(csv).toContain('"v1.0, hotfix"')
  })

  it('doubles embedded quotes so the field stays parseable', () => {
    const csv = generateCsvContent(
      [summary({ latestVersion: 'the "final" one' })],
      CSV_HEADERS
    )
    expect(csv).toContain('"the ""final"" one"')
  })

  it('quotes fields containing a newline', () => {
    const csv = generateCsvContent(
      [summary({ identifier: 'acme/multi\nline' })],
      CSV_HEADERS
    )
    expect(csv).toContain('"acme/multi\nline"')
  })

  it('emits only the header row when there is nothing to export', () => {
    expect(generateCsvContent([], CSV_HEADERS)).toBe(CSV_HEADERS.join(','))
  })
})

describe('generateMarkdownContent', () => {
  const headers = [
    'Repository',
    'Stars',
    'Open Issues',
    'Latest Version',
    'Total Downloads',
  ]

  it('builds a table with a separator row and linked repositories', () => {
    const rows = generateMarkdownContent([summary()], headers).split('\n')

    expect(rows[0]).toBe(`| ${headers.join(' | ')} |`)
    expect(rows[1]).toBe('| --- | --- | --- | --- | --- |')
    expect(rows[2]).toContain('[acme/widget](https://github.com/acme/widget)')
  })

  it('keeps the separator row aligned with the header count', () => {
    const rows = generateMarkdownContent([], ['A', 'B']).split('\n')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toBe('| --- | --- |')
  })
})

describe('generateSingleRepoMarkdownReport', () => {
  it('lists the five most downloaded releases, highest first', () => {
    const releases = [
      release('v1', '2026-01-01T00:00:00Z', 10),
      release('v2', '2026-02-01T00:00:00Z', 500),
      release('v3', '2026-03-01T00:00:00Z', 50),
      release('v4', '2026-04-01T00:00:00Z', 5),
      release('v5', '2026-05-01T00:00:00Z', 1),
      release('v6', '2026-06-01T00:00:00Z', 2),
    ]

    const report = generateSingleRepoMarkdownReport(summary(), releases, [], [])
    const tags = [...report.matchAll(/^\| (v\d) \|/gm)].map((m) => m[1])

    expect(tags).toEqual(['v2', 'v3', 'v1', 'v4', 'v6'])
  })

  it('says so when a repository has no releases', () => {
    const report = generateSingleRepoMarkdownReport(summary(), [], [], [])
    expect(report).toContain('*No releases found.*')
    expect(report).not.toContain('| Release | Published | Downloads |')
  })

  it('counts only stars and issues from the last 30 days', () => {
    setSystemTime(new Date('2026-06-30T00:00:00Z'))

    const report = generateSingleRepoMarkdownReport(
      summary(),
      [],
      [
        { starred_at: '2026-06-20T00:00:00Z' },
        { starred_at: '2026-06-25T00:00:00Z' },
        { starred_at: '2026-01-01T00:00:00Z' },
      ],
      [
        { created_at: '2026-06-29T00:00:00Z', closed_at: null },
        { created_at: '2025-12-01T00:00:00Z', closed_at: null },
      ]
    )

    expect(report).toContain('**New Stars:** 2')
    expect(report).toContain('**New Issues Opened:** 1')
  })

  it('includes the repository heading and GitHub link', () => {
    const report = generateSingleRepoMarkdownReport(summary(), [], [], [])
    expect(report.startsWith('# Repository Report: acme/widget')).toBe(true)
    expect(report).toContain('[View on GitHub](https://github.com/acme/widget)')
  })
})
