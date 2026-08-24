import type { ReactiveController, ReactiveControllerHost } from 'lit'

const STORAGE_KEY = 'github-release-stats-sets'
const UPDATE_FEEDBACK_MS = 2000

/**
 * Owns the named repository sets the user can save and reload, together with
 * their localStorage persistence and the transient "Updated!" confirmation.
 */
export class SavedSetsController implements ReactiveController {
  private host: ReactiveControllerHost
  private feedbackTimer?: ReturnType<typeof setTimeout>

  sets: Record<string, string[]> = {}
  justUpdated: string | null = null

  constructor(host: ReactiveControllerHost) {
    this.host = host
    host.addController(this)
    this.load()
  }

  hostDisconnected() {
    clearTimeout(this.feedbackTimer)
  }

  get names(): string[] {
    return Object.keys(this.sets)
  }

  get isEmpty(): boolean {
    return this.names.length === 0
  }

  get(name: string): string[] | undefined {
    return this.sets[name]
  }

  private load() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      this.sets = JSON.parse(raw)
    } catch (e) {
      console.error('Failed to parse saved sets from localStorage', e)
      this.sets = {}
    }
  }

  private persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.sets))
    this.host.requestUpdate()
  }

  save(name: string, identifiers: string[]) {
    this.sets = { ...this.sets, [name]: identifiers }
    this.persist()
  }

  /** Same as {@link save}, but flashes a confirmation next to the set. */
  update(name: string, identifiers: string[]) {
    this.save(name, identifiers)
    this.justUpdated = name
    clearTimeout(this.feedbackTimer)
    this.feedbackTimer = setTimeout(() => {
      this.justUpdated = null
      this.host.requestUpdate()
    }, UPDATE_FEEDBACK_MS)
  }

  delete(name: string) {
    const next = { ...this.sets }
    delete next[name]
    this.sets = next
    this.persist()
  }
}
