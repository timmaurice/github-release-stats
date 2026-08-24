export interface GitHubReleaseAuthor {
  login: string
  html_url: string
}

export interface GitHubReleaseAsset {
  name: string
  size: number
  download_count: number
  updated_at: string
}

export interface GitHubRelease {
  tag_name: string
  html_url: string
  prerelease: boolean
  assets: GitHubReleaseAsset[]
  author: GitHubReleaseAuthor
  published_at: string
}

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>

  prompt(): Promise<void>
}

export interface Stargazer {
  starred_at: string
}

export interface IssueActivity {
  created_at: string
  closed_at: string | null
}

export interface PullRequestActivity extends IssueActivity {
  author: string
}

/**
 * A collection fetched over several API pages. `truncated` is true when we
 * stopped before GitHub ran out of pages, so the caller knows the series is
 * incomplete and can say so instead of silently drawing a wrong chart.
 */
export interface PagedResult<T> {
  data: T[]
  truncated: boolean
}

/** Which lazily-loaded series had to be cut short for a repository. */
export type TruncatedDataset = 'stars' | 'issues' | 'pullRequests'
