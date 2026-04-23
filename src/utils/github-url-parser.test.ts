import { describe, it, expect } from 'bun:test'
import { parseGitHubUrl } from './github-url-parser'

describe('parseGitHubUrl', () => {
  it('parses standard HTTPS URLs', () => {
    expect(
      parseGitHubUrl('https://github.com/timmaurice/github-release-stats')
    ).toEqual({ username: 'timmaurice', repository: 'github-release-stats' })
  })

  it('parses shorthand formats', () => {
    expect(parseGitHubUrl('timmaurice/github-release-stats')).toEqual({
      username: 'timmaurice',
      repository: 'github-release-stats',
    })
  })

  it('parses git HTTPS URLs', () => {
    expect(
      parseGitHubUrl('https://github.com/timmaurice/github-release-stats.git')
    ).toEqual({ username: 'timmaurice', repository: 'github-release-stats' })
  })

  it('parses git SSH URLs', () => {
    expect(
      parseGitHubUrl('git@github.com:timmaurice/github-release-stats.git')
    ).toEqual({ username: 'timmaurice', repository: 'github-release-stats' })
  })

  it('handles trailing spaces and newlines correctly (the bug fix)', () => {
    expect(
      parseGitHubUrl('https://github.com/timmaurice/github-release-stats ')
    ).toEqual({ username: 'timmaurice', repository: 'github-release-stats' })
    expect(parseGitHubUrl('timmaurice/github-release-stats\n')).toEqual({
      username: 'timmaurice',
      repository: 'github-release-stats',
    })
    expect(parseGitHubUrl('\ttimmaurice/github-release-stats\r\n')).toEqual({
      username: 'timmaurice',
      repository: 'github-release-stats',
    })
  })

  it('handles deep links correctly', () => {
    expect(
      parseGitHubUrl(
        'https://github.com/timmaurice/github-release-stats/releases/tag/v1.0.0'
      )
    ).toEqual({
      username: 'timmaurice',
      repository: 'github-release-stats',
    })
  })
})
