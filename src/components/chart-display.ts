import { LitElement, html, css } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { LocalizeController } from '../localization/localize-controller'
import type { GitHubRelease } from '../types'
import { Chart, registerables } from 'chart.js'
// By importing the adapter, it automatically registers itself with Chart.js
// and resolves the "date adapter is not implemented" error.
import 'chartjs-adapter-date-fns'
import type {
  ChartConfiguration,
  Point,
  TooltipItem,
  ChartDataset,
  ChartType,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import type { SortKey } from './summary-table'

const lastValueLinePlugin = {
  id: 'lastValueLine',
  afterDraw: (chart: Chart) => {
    const pluginOptions = chart.options.plugins?.lastValueLine
    if (!pluginOptions?.display) {
      return
    }

    const {
      ctx,
      scales: { x: xScale },
    } = chart

    if (!xScale) {
      return
    }

    const now = new Date().getTime()
    const nowX = xScale.getPixelForValue(now)

    // Only draw if 'now' is within the visible chart area
    if (nowX === null || nowX < xScale.left || nowX > xScale.right) {
      return
    }

    chart.getSortedVisibleDatasetMetas().forEach((meta) => {
      if (meta.data.length === 0) {
        return
      }

      const lastElement = meta.data[meta.data.length - 1]
      if (!lastElement) {
        return
      }
      const { x: lastX, y: lastY } = lastElement.getProps(['x', 'y'], true)

      // Don't draw if the last point is after 'now' or off-screen to the left
      if (lastX > nowX || lastX < xScale.left) {
        return
      }

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(lastX, lastY)
      ctx.lineTo(nowX, lastY)

      const datasetElement = meta.dataset
      if (datasetElement) {
        ctx.strokeStyle = datasetElement.options.borderColor as string
      }

      ctx.lineWidth = pluginOptions.width || 1
      ctx.setLineDash((pluginOptions.dash || [2, 3]) as number[])
      ctx.globalAlpha = 0.5
      ctx.stroke()
      ctx.restore()
    })
  },
}

const nowLinePlugin = {
  id: 'nowLine',
  afterDraw: (chart: Chart) => {
    const pluginOptions = chart.options.plugins?.nowLine
    if (!pluginOptions?.display) {
      return
    }

    const {
      ctx,
      chartArea: { top, bottom },
      scales: { x: xScale },
    } = chart

    if (!xScale) {
      return
    }

    const now = new Date().getTime()
    const x = xScale.getPixelForValue(now)

    // Only draw if 'now' is within the visible chart area
    if (x !== null && x >= xScale.left && x <= xScale.right) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, bottom)
      ctx.lineWidth = pluginOptions.width || 1
      ctx.strokeStyle = pluginOptions.color || 'rgba(255, 99, 132, 0.5)'
      ctx.setLineDash((pluginOptions.dash || [3, 4]) as number[])
      ctx.stroke()
      ctx.restore()
    }
  },
}

// Define a type for the zoom plugin options to avoid using 'any' and to get type-safety.
// This is based on the options used in this component and chartjs-plugin-zoom's documentation.
interface ComponentZoomOptions {
  pan: {
    enabled: boolean
    mode: 'x' | 'y' | 'xy'
  }
  zoom: {
    wheel: {
      enabled: boolean
    }
    pinch: {
      enabled: boolean
    }
    mode: 'x' | 'y' | 'xy'
    onZoom?: (context: { chart: Chart }) => void
  }
}

// Augment the Chart.js module to add types for our custom plugin.
// This provides type safety and autocompletion for the plugin's options.
declare module 'chart.js' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface PluginOptionsByType<TType extends ChartType> {
    nowLine?: {
      display?: boolean
      color?: string
      width?: number
      dash?: number[]
    }
    lastValueLine?: {
      display?: boolean
      color?: string
      width?: number
      dash?: number[]
    }
  }
}

// Chart.js 3+ is tree-shakable, so we need to register the components we want to use.
// 'registerables' is a convenience that registers all available components, including the time scale.
Chart.register(nowLinePlugin, lastValueLinePlugin, ...registerables, zoomPlugin)

const chartColors = [
  '#0d6efd', // blue
  '#198754', // green
  '#dc3545', // red
  '#ffc107', // yellow
  '#0dcaf0', // cyan
  '#fd7e14', // orange
  '#6f42c1', // purple
  '#d63384', // pink
  '#20c997', // teal
  '#6610f2', // indigo
  '#6c757d', // gray
]

@customElement('chart-display')
export class ChartDisplay extends LitElement {
  private localize = new LocalizeController(this)

  @property({ attribute: false })
  releasesData: Map<string, GitHubRelease[]> = new Map()

  @property({ attribute: false })
  stargazersData: Map<string, { starred_at: string }[]> = new Map()

  @property({ attribute: false })
  issuesData: Map<string, { created_at: string; closed_at: string | null }[]> =
    new Map()

  @property({ type: Array })
  repoOrder: string[] = []

  @property({ type: String })
  metric: SortKey = 'totalDownloads'

  @property({ type: String })
  yAxisScale: 'linear' | 'logarithmic' = 'logarithmic'

  @property({ type: Boolean })
  limitZoomOut = false

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

  private _getZoomOptions() {
    const options: ComponentZoomOptions = {
      pan: {
        enabled: true,
        mode: 'x' as const,
      },
      zoom: {
        wheel: {
          enabled: true,
        },
        pinch: {
          enabled: true,
        },
        mode: 'x' as const,
      },
    }

    if (this.limitZoomOut) {
      options.zoom.onZoom = ({ chart }: { chart: Chart }) => {
        // getZoomLevel() is a helper function provided by the plugin.
        // A zoom level < 1 means the user has zoomed out past the original view.
        if (chart.getZoomLevel() < 1) {
          chart.resetZoom('none')
        }
      }
    }

    return options
  }

  private _getXAxisConfig(titleText: string) {
    return {
      type: 'time' as const,
      time: {
        tooltipFormat: 'MMM dd, yyyy',
      },
      max: new Date().getTime(),
      title: {
        display: true,
        text: titleText,
      },
    }
  }

  private _getAnimationOptions() {
    return {
      onComplete: ({ chart }: { chart: Chart }) => {
        // A single draw call after the animation is complete ensures that our
        // custom plugins which use the `afterDraw` hook are rendered on the
        // final, static state of the chart.
        chart.draw()
      },
    }
  }

  private _getCommonPluginOptions() {
    const isDarkMode =
      document.documentElement.getAttribute('data-bs-theme') === 'dark'
    const nowLineColor = isDarkMode
      ? 'rgba(255, 99, 132, 0.7)'
      : 'rgba(255, 99, 132, 0.5)'
    return {
      zoom: this._getZoomOptions(),
      nowLine: {
        display: true,
        color: nowLineColor,
        width: 1,
        dash: [3, 4],
      },
      lastValueLine: {
        display: true,
        width: 1,
        dash: [2, 3],
      },
    }
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
        .filter((d) => d.y > 0)
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
        animation: this._getAnimationOptions(),
        scales: {
          x: this._getXAxisConfig(this.localize.t('charts.releaseDate')),
          y: {
            type: this.yAxisScale,
            title: {
              display: true,
              text: `${this.localize.t('charts.totalDownloads')} (${
                this.yAxisScale === 'logarithmic'
                  ? this.localize.t('charts.logarithmic')
                  : this.localize.t('charts.linear')
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
          ...this._getCommonPluginOptions(),
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
        animation: this._getAnimationOptions(),
        scales: {
          x: this._getXAxisConfig(this.localize.t('charts.date')),
          y: {
            type: this.yAxisScale,
            title: {
              display: true,
              text: `${this.localize.t('charts.cumulativeStars')} (${
                this.yAxisScale === 'logarithmic'
                  ? this.localize.t('charts.logarithmic')
                  : this.localize.t('charts.linear')
              })`,
            },
            beginAtZero: this.yAxisScale === 'linear',
          },
        },
        plugins: {
          ...this._getCommonPluginOptions(),
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
        .filter((d) => d.y > 0)
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
        animation: this._getAnimationOptions(),
        scales: {
          x: this._getXAxisConfig(this.localize.t('charts.releaseDate')),
          y: {
            type: this.yAxisScale,
            title: {
              display: true,
              text: `${this.localize.t('charts.assetSize')} (${
                this.yAxisScale === 'logarithmic'
                  ? this.localize.t('charts.logarithmic')
                  : this.localize.t('charts.linear')
              })`,
            },
            beginAtZero: this.yAxisScale === 'linear',
          },
        },
        plugins: {
          ...this._getCommonPluginOptions(),
        },
      },
    }
  }

  private _getIssueChartConfig(): ChartConfiguration {
    const datasets: ChartDataset<'line', Point[]>[] = []
    let colorIndex = 0

    const order =
      this.repoOrder.length > 0
        ? this.repoOrder
        : Array.from(this.issuesData.keys())

    order.forEach((repoIdentifier) => {
      const issues = this.issuesData.get(repoIdentifier)
      if (!issues || issues.length === 0) return

      const eventsByTime = new Map<number, number>()
      issues.forEach((issue) => {
        const createdTime = new Date(issue.created_at).getTime()
        eventsByTime.set(createdTime, (eventsByTime.get(createdTime) || 0) + 1)
        if (issue.closed_at) {
          const closedTime = new Date(issue.closed_at).getTime()
          eventsByTime.set(closedTime, (eventsByTime.get(closedTime) || 0) - 1)
        }
      })

      const sortedTimes = Array.from(eventsByTime.keys()).sort((a, b) => a - b)

      let openIssues = 0
      const data: Point[] = []
      // Add a starting point for the chart at y=0 before the first event.
      if (sortedTimes[0] !== undefined) {
        data.push({ x: sortedTimes[0] - 1, y: 0 })
      }

      for (const time of sortedTimes) {
        openIssues += eventsByTime.get(time) ?? 0
        data.push({ x: time, y: openIssues })
      }

      datasets.push({
        label: repoIdentifier,
        data: data,
        borderColor: chartColors[colorIndex % chartColors.length],
        backgroundColor: chartColors[colorIndex % chartColors.length],
        fill: false,
        stepped: true,
      })
      colorIndex++
    })

    return {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: this._getAnimationOptions(),
        scales: {
          x: this._getXAxisConfig(this.localize.t('charts.date')),
          y: {
            type: this.yAxisScale,
            title: {
              display: true,
              text: `${this.localize.t('charts.openIssues')} (${
                this.yAxisScale === 'logarithmic'
                  ? this.localize.t('charts.logarithmic')
                  : this.localize.t('charts.linear')
              })`,
            },
            beginAtZero: this.yAxisScale === 'linear',
          },
        },
        plugins: {
          ...this._getCommonPluginOptions(),
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
      case 'openIssues':
        return this._getIssueChartConfig()
      default:
        return this._getLineChartConfig()
    }
  }

  updated() {
    const canvas = this.shadowRoot?.querySelector('canvas')
    if (!canvas) {
      return
    }

    const config = this._getChartConfig()

    // A chart instance can exist on the canvas, even if `this._chart` is null,
    // especially in development with HMR.
    const existingChart = Chart.getChart(canvas)
    if (existingChart) {
      // If there's an existing chart, update it. This handles both normal updates
      // and HMR scenarios where the component instance is new but the canvas
      // and chart instance are old.
      existingChart.data = config.data
      existingChart.options = config.options || {}
      existingChart.update()
      this._chart = existingChart
    } else {
      // If no chart instance exists, create a new one.
      this._chart = new Chart(canvas, config)
    }
  }

  render() {
    return html`<div
      class="chart-container"
      title=${this.localize.t('charts.zoomHint')}
    >
      <canvas></canvas>
    </div>`
  }
}
