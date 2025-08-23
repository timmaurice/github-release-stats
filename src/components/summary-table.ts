import { LitElement, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'

export interface RepoSummary {
  identifier: string
  stars: number
  latestVersion: string
  lastUpdate: string
  size: number // in KB
  totalDownloads: number
}

export type SortKey = keyof Omit<RepoSummary, 'identifier'> | 'manual'

@customElement('summary-table')
export class SummaryTable extends LitElement {
  @property({ attribute: false })
  summaryData: RepoSummary[] = []

  @property({ type: Array })
  repoOrder: string[] = []

  @property({ type: String })
  sortKey: SortKey = 'totalDownloads'

  @property({ type: String })
  sortDirection: 'asc' | 'desc' = 'desc'

  // Disable shadow DOM to inherit global styles.
  protected createRenderRoot() {
    return this
  }

  private _handleSort(key: SortKey) {
    this.dispatchEvent(new CustomEvent('request-sort', { detail: key }))
  }

  private _renderSortIcon(key: SortKey) {
    if (this.sortKey !== key) return ''
    return this.sortDirection === 'asc'
      ? html`<i class="bi bi-sort-up ms-2"></i>`
      : html`<i class="bi bi-sort-down ms-2"></i>`
  }

  private _formatDate(dateString: string): string {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString()
  }

  private _formatNumber(num: number): string {
    return new Intl.NumberFormat().format(num)
  }

  render() {
    if (this.summaryData.length === 0) return ''

    const headerKeys: SortKey[] = [
      'stars',
      'latestVersion',
      'lastUpdate',
      'size',
      'totalDownloads',
    ]
    const labels: Record<SortKey, string> = {
      stars: 'Stars',
      latestVersion: 'Latest Version',
      lastUpdate: 'Last Update',
      size: 'Size (KB)',
      totalDownloads: 'Total Downloads',
      manual: 'Manual',
    }

    const orderedData = this.repoOrder
      .map((id) => this.summaryData.find((d) => d.identifier === id))
      .filter((d): d is RepoSummary => d !== undefined)

    return html`
      <div class="table-responsive mb-4">
        <table class="table table-hover">
          <thead>
            <tr>
              <th scope="col">Repository</th>
              ${headerKeys.map(
                (key) =>
                  html`<th
                    scope="col"
                    class="text-end"
                    style="cursor: pointer;"
                    @click=${() => this._handleSort(key)}
                  >
                    ${labels[key]} ${this._renderSortIcon(key as SortKey)}
                  </th>`
              )}
            </tr>
          </thead>
          <tbody>
            ${orderedData.map(
              (repo) => html`
                <tr>
                  <td class="fw-bold">${repo.identifier}</td>
                  <td class="text-end">${this._formatNumber(repo.stars)}</td>
                  <td class="text-end">${repo.latestVersion}</td>
                  <td class="text-end">${this._formatDate(repo.lastUpdate)}</td>
                  <td class="text-end">${this._formatNumber(repo.size)}</td>
                  <td class="text-end">
                    ${this._formatNumber(repo.totalDownloads)}
                  </td>
                </tr>
              `
            )}
          </tbody>
        </table>
      </div>
    `
  }
}
