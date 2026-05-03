import { LitElement, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { map } from 'lit/directives/map.js'
import type { GitHubRelease } from '../types'
import { LocalizeController } from '../localization/localize-controller'
import { getLocale } from '../localization/registry'

@customElement('release-card')
export class ReleaseCard extends LitElement {
  @property({ type: Object }) release!: GitHubRelease
  @property({ type: String }) badgeText = ''
  private localize = new LocalizeController(this)

  // Disable shadow DOM to inherit global styles.
  protected createRenderRoot() {
    return this
  }

  private _formatNumber(value: number): string {
    return new Intl.NumberFormat(getLocale()).format(value)
  }

  render() {
    const isPreRelease = this.release.prerelease
    const releaseDownloadCount = this.release.assets.reduce(
      (acc, asset) => acc + asset.download_count,
      0
    )

    return html`
      <div
        class="card mb-4 release ${isPreRelease ? 'pre-release' : ''} ${this
          .badgeText === 'Latest release'
          ? 'latest-release'
          : ''}"
      >
        <div
          class="card-header bg-transparent d-flex justify-content-between align-items-center"
        >
          <h3 class="h5 mb-0">
            <i class="bi bi-tag-fill me-2"></i>
            <a
              href="${this.release.html_url}"
              target="_blank"
              class="text-decoration-none"
              data-umami-event="click-release-tag"
              data-umami-event-tag="${this.release.tag_name}"
              >${this.release.tag_name}</a
            >
          </h3>
          ${this.badgeText
            ? html`<span
                class="badge ${isPreRelease
                  ? 'bg-warning text-dark'
                  : 'bg-success'}"
                >${this.badgeText}</span
              >`
            : ''}
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-6 mb-3 mb-md-0">
              <h4 class="h6 text-muted mb-3">
                <i class="bi bi-info-circle me-2"></i>${this.localize.t(
                  'releaseDetails.releaseInfo'
                )}
              </h4>
              <ul class="list-unstyled">
                ${this.release.author
                  ? html`<li class="mb-2">
                      <i class="bi bi-person me-2"></i>${this.localize.t(
                        'releaseDetails.author'
                      )}
                      <a
                        href="${this.release.author.html_url}"
                        class="text-decoration-none"
                        data-umami-event="click-author-link"
                        data-umami-event-author="${this.release.author.login}"
                        >@${this.release.author.login}</a
                      >
                    </li>`
                  : ''}
                <li class="mb-2">
                  <i class="bi bi-calendar-event me-2"></i>${this.localize.t(
                    'releaseDetails.published'
                  )}:
                  ${this.release.published_at.split('T')[0]}
                </li>
                ${releaseDownloadCount
                  ? html`<li>
                      <i class="bi bi-download me-2"></i>${this.localize.t(
                        'releaseDetails.totalDownloads'
                      )}
                    </li>`
                  : ''}
              </ul>
            </div>
            ${this.release.assets.length
              ? html`
                  <div class="col-md-6">
                    <h4 class="h6 text-muted mb-3">
                      <i class="bi bi-box-arrow-down me-2"></i
                      >${this.localize.t('releaseDetails.assets')}
                    </h4>
                    <ul class="list-unstyled">
                      ${map(
                        this.release.assets,
                        (asset) => html`
                          <li class="mb-2 small">
                            <code>${asset.name}</code>
                            <div class="text-muted">
                              (${(asset.size / 1048576.0).toFixed(2)}&nbsp;MiB)
                              -
                              ${this.localize.t(
                                'releaseDetails.downloadsCount',
                                {
                                  count: this._formatNumber(
                                    asset.download_count
                                  ),
                                }
                              )}
                            </div>
                          </li>
                        `
                      )}
                    </ul>
                  </div>
                `
              : ''}
          </div>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'release-card': ReleaseCard
  }
}
