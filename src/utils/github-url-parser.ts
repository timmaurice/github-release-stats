export function parseGitHubUrl(
  url: string
): { username: string; repository: string } | null {
  if (!url) return null
  const match =
    /^(?:https?:\/\/|git@)?(?:www\.)?(?:github\.com[:/])?(?<username>[a-zA-Z\-0-9]+)\/(?<repository>[a-zA-Z\-0-9._]+?)(?:\.git|\/|$)/.exec(
      url.trim()
    )
  if (!match || !match.groups) return null
  return {
    username: match.groups.username as string,
    repository: match.groups.repository as string,
  }
}
