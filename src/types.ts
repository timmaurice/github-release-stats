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
