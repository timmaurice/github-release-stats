import { LitElement, html, css } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import type { GitHubRelease } from '../types.js'
import { Chart, registerables } from 'chart.js'
// By importing the adapter, it automatically registers itself with Chart.js
// and resolves the "date adapter is not implemented" error.
import 'chartjs-adapter-date-fns'
import type {
  ChartConfiguration,
  Point,
  TooltipItem,
  ChartDataset,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import type { SortKey } from './summary-table.js'

// Chart.js 3+ is tree-shakable, so we need to register the components we want to use.
// 'registerables' is a convenience that registers all available components, including the time scale.
Chart.register(...registerables, zoomPlugin)

const chartColors = [
  '#0d6efd', // blue
  '#198754', // green
  '#dc3545', // red
  '#ffc107', // yellow
  '#0dcaf0', // cyan
  '#fd7e14', // orange
  '#6f42c1', // purple
]

@customElement('chart-display')
export class ChartDisplay extends LitElement {
  @property({ attribute: false })
  releasesData: Map<string, GitHubRelease[]> = new Map()

  @property({ attribute: false })
  stargazersData: Map<string, { starred_at: string }[]> = new Map()

  @property({ type: Array })
  repoOrder: string[] = []

  @property({ type: String })
  metric: SortKey = 'totalDownloads'

  @property({ type: String })
  yAxisScale: 'linear' | 'logarithmic' = 'logarithmic'

  private _chart: Chart | null = null

  static styles = css`
    :host {
      display: block;
      margin-bottom: 2rem;
    }
    .chart-container {
      position: relative;
      height: 40vh;
      width: 100%;
    }
  `

  disconnectedCallback(): void {
    super.disconnectedCallback()
    // Important: destroy the chart instance to avoid memory leaks and the "canvas is already in use" error.
    if (this._chart) {
      this._chart.destroy()
      this._chart = null
    }
  }

  public resetZoom() {
    this._chart?.resetZoom()
  }

  private _getLineChartData() {
    const datasets: ChartDataset<'line', (Point & { label: string })[]>[] = []
    let colorIndex = 0

    const order =
      this.repoOrder.length > 0
        ? this.repoOrder
        : Array.from(this.releasesData.keys())

    order.forEach((repoIdentifier) => {
      const releases = this.releasesData.get(repoIdentifier)
      if (!releases || releases.length === 0) return

      const data = releases
        .map((release) => ({
          x: new Date(release.published_at).getTime(),
          y: release.assets.reduce(
            (sum, asset) => sum + asset.download_count,
            0
          ),
          label: release.tag_name,
        }))
        .sort((a, b) => a.x - b.x)

      datasets.push({
        label: repoIdentifier,
        data: data,
        borderColor: chartColors[colorIndex % chartColors.length],
        backgroundColor: chartColors[colorIndex % chartColors.length],
        tension: 0.1,
        fill: false,
      })
      colorIndex++
    })

    return { datasets }
  }

  private _getLineChartConfig(): ChartConfiguration {
    return {
      type: 'line',
      data: this._getLineChartData(),
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            time: {
              tooltipFormat: 'MMM dd, yyyy',
            },
            title: { display: true, text: 'Release Date' },
          },
          y: {
            type: this.yAxisScale,
            title: {
              display: true,
              text: `Total Downloads (${
                this.yAxisScale === 'logarithmic' ? 'Logarithmic' : 'Linear'
              })`,
            },
            beginAtZero: this.yAxisScale === 'linear',
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (context: TooltipItem<'line'>[]) =>
                (context[0]?.raw as { label: string })?.label || '',
            },
          },
          zoom: {
            pan: {
              enabled: true,
              mode: 'x',
            },
            zoom: {
              wheel: {
                enabled: true,
              },
              pinch: {
                enabled: true,
              },
              mode: 'x',
            },
          },
        },
      },
    }
  }

  private _getStarChartConfig(): ChartConfiguration {
    const datasets: ChartDataset<'line', Point[]>[] = []
    let colorIndex = 0

    const order =
      this.repoOrder.length > 0
        ? this.repoOrder
        : Array.from(this.stargazersData.keys())

    order.forEach((repoIdentifier) => {
      const starEvents = this.stargazersData.get(repoIdentifier)
      if (!starEvents || starEvents.length === 0) return

      const sortedEvents = starEvents.sort(
        (a, b) =>
          new Date(a.starred_at).getTime() - new Date(b.starred_at).getTime()
      )

      let cumulativeStars = 0
      const data = sortedEvents.map((event) => {
        cumulativeStars++
        return { x: new Date(event.starred_at).getTime(), y: cumulativeStars }
      })

      datasets.push({
        label: repoIdentifier,
        data: data,
        borderColor: chartColors[colorIndex % chartColors.length],
        backgroundColor: chartColors[colorIndex % chartColors.length],
        tension: 0.1,
        fill: false,
      })
      colorIndex++
    })

    return {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            time: {
              tooltipFormat: 'MMM dd, yyyy',
            },
            title: { display: true, text: 'Date' },
          },
          y: {
            type: this.yAxisScale,
            title: {
              display: true,
              text: `Cumulative Stars (${
                this.yAxisScale === 'logarithmic' ? 'Logarithmic' : 'Linear'
              })`,
            },
            beginAtZero: this.yAxisScale === 'linear',
          },
        },
        plugins: {
          zoom: {
            pan: {
              enabled: true,
              mode: 'x',
            },
            zoom: {
              wheel: {
                enabled: true,
              },
              pinch: {
                enabled: true,
              },
              mode: 'x',
            },
          },
        },
      },
    }
  }

  private _getAssetSizeChartConfig(): ChartConfiguration {
    const datasets: ChartDataset<'line', (Point & { label: string })[]>[] = []
    let colorIndex = 0

    const order =
      this.repoOrder.length > 0
        ? this.repoOrder
        : Array.from(this.releasesData.keys())

    order.forEach((repoIdentifier) => {
      const releases = this.releasesData.get(repoIdentifier)
      if (!releases || releases.length === 0) return

      const data = releases
        .map((release) => ({
          x: new Date(release.published_at).getTime(),
          y: release.assets.reduce((sum, asset) => sum + asset.size, 0) / 1024, // bytes to KB
          label: release.tag_name,
        }))
        .sort((a, b) => a.x - b.x)

      datasets.push({
        label: repoIdentifier,
        data: data,
        borderColor: chartColors[colorIndex % chartColors.length],
        backgroundColor: chartColors[colorIndex % chartColors.length],
        tension: 0.1,
        fill: false,
      })
      colorIndex++
    })

    return {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'time',
            time: {
              tooltipFormat: 'MMM dd, yyyy',
            },
            title: { display: true, text: 'Release Date' },
          },
          y: {
            type: this.yAxisScale,
            title: {
              display: true,
              text: `Total Asset Size (KB) (${
                this.yAxisScale === 'logarithmic' ? 'Logarithmic' : 'Linear'
              })`,
            },
            beginAtZero: this.yAxisScale === 'linear',
          },
        },
        plugins: {
          zoom: {
            pan: {
              enabled: true,
              mode: 'x',
            },
            zoom: {
              wheel: {
                enabled: true,
              },
              pinch: {
                enabled: true,
              },
              mode: 'x',
            },
          },
        },
      },
    }
  }

  private _getChartConfig(): ChartConfiguration {
    switch (this.metric) {
      case 'size':
        return this._getAssetSizeChartConfig()
      case 'stars':
        return this._getStarChartConfig()
      default:
        return this._getLineChartConfig()
    }
  }

  updated() {
    const canvas = this.shadowRoot?.querySelector('canvas')
    if (!canvas) {
      return
    }

    const newConfig = this._getChartConfig()

    // If no chart instance exists, create one
    if (!this._chart) {
      this._chart = new Chart(canvas, newConfig)
    } else {
      // If chart instance exists, update its data and options
      this._chart.data = newConfig.data
      this._chart.options = newConfig.options || {}
      this._chart.update()
    }
  }

  render() {
    return html`<div
      class="chart-container"
      title="Use mouse wheel to zoom, click and drag to pan"
    >
      <canvas></canvas>
    </div>`
  }
}
