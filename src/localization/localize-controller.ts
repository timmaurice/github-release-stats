import type { ReactiveController } from 'lit'
import { addSubscriber, removeSubscriber, t } from './registry'

export class LocalizeController implements ReactiveController {
  host: import('lit').ReactiveElement

  constructor(host: import('lit').ReactiveElement) {
    ;(this.host = host).addController(this)
  }

  private _update = () => {
    this.host.requestUpdate()
  }

  hostConnected() {
    addSubscriber(this._update)
  }

  hostDisconnected() {
    removeSubscriber(this._update)
  }

  t(key: string, replacements?: { [key: string]: string | number }): string {
    return t(key, replacements)
  }
}
