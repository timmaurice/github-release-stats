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

/** A collection fetched over several API pages. */
export interface PagedResult<T> {
  data: T[]
  truncated: boolean
}

export type TruncatedDataset = 'stars' | 'issues' | 'pullRequests'
