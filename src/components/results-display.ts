import { LitElement, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { LocalizeController } from '../localization/localize-controller'
import type { GitHubRelease as BaseGitHubRelease } from '../types'

// The base type from types.ts seems to be missing the 'name' property.
// We extend it here to satisfy TypeScript, as the GitHub API does provide it.
type GitHubRelease = BaseGitHubRelease & { name: string | null }

@customElement('results-display')
export class ResultsDisplay extends LitElement {
  @property({ type: Array }) releases: GitHubRelease[] = []
  @property({ type: String }) error = ''
  private localize = new LocalizeController(this)

  // Disable shadow DOM to inherit global styles.
  protected createRenderRoot() {
    return this
  }

  private _formatNumber(num: number): string {
    return new Intl.NumberFormat().format(num)
  }

  private _formatDate(dateString: string): string {
    if (!dateString) return this.localize.t('common.notAvailable')
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  render() {
    if (this.error) {
      return html`
        <div class="alert alert-danger" role="alert">
          <h4 class="alert-heading">
            <i class="bi bi-exclamation-triangle-fill me-2"></i
            >${this.localize.t('errors.oops')}
          </h4>
          <p class="mb-0">${unsafeHTML(this.error)}</p>
        </div>
      `
    }

    if (this.releases.length === 0 && !this.error) {
      return html`<div class="alert alert-info m-2">
        ${this.localize.t('releaseDetails.noReleases')}
      </div>`
    }

    return html`
      <div class="table-responsive">
        <table class="table table-striped table-hover mb-0">
          <thead>
            <tr>
              <th scope="col">${this.localize.t('releaseDetails.releaseTag')}</th>
              <th scope="col">${this.localize.t('releaseDetails.name')}</th>
              <th scope="col" class="text-center">
                ${this.localize.t('releaseDetails.published')}
              </th>
              <th scope="col" class="text-end">
                ${this.localize.t('releaseDetails.totalDownloads')}
              </th>
              </tr>
            </thead>
            <tbody>
              ${this.releases.map(
                (release) => html`
                  <tr>
                    <td class="fw-bold">
                      <a
                        href=${release.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-decoration-none"
                        >${release.tag_name}</a
                      >
                    </td>
                    <td>${release.name || ''}</td>
                    <td class="text-center text-nowrap">
                      ${this._formatDate(release.published_at)}
                    </td>
                    <td class="text-end">
                      ${this._formatNumber(
                        release.assets.reduce(
                          (sum, asset) => sum + asset.download_count,
                          0
                        )
                      )}
                    </td>
                  </tr>
                `
              )}
            </tbody>
          </table>
        </div>
      </div>
    `
  }
}
