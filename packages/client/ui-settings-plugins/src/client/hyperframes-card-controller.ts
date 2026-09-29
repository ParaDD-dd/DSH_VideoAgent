/** Staged enablement for the HyperFrames project tools. */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { CardForm, type CardActions, type CardShell } from './card-form.ts'

/** Host-owned namespace edited by the HyperFrames card. */
export const HYPERFRAMES_NS = 'hyperframes'

/** The HyperFrames settings field exposed by this card. */
export interface HyperframesSettings {
  /** Whether agents may run the HyperFrames tools. */
  enabled?: boolean
}

/** Renderable staged enablement and save status. */
export interface HyperframesCardState extends CardShell {
  /** Staged switch value. */
  enabled: boolean
}

/** Slot-injected HyperFrames card state and actions. */
export interface HyperframesCardFace extends CardActions {
  hooks: {
    /** Bound as useHyperframesCard by the slot renderer. */
    hyperframesCard: SnapshotStore<HyperframesCardState>
  }
}

/** Saves HyperFrames enablement through the revision-fenced settings scope. */
export class HyperframesCardController {
  private readonly form: CardForm<HyperframesSettings>
  private readonly store: SnapshotStore<HyperframesCardState>

  /** @param scope - the hyperframes settings scope. */
  constructor(scope: SettingsScope<HyperframesSettings>) {
    this.form = new CardForm(scope, [{
      field: 'enabled',
      format: value => String(value === true),
      parse: text => text === 'true' || text === 'false'
        ? { kind: 'set', value: text === 'true' } : undefined,
    }])
    this.store = this.form.bind(() => ({
      ...this.form.shell(), enabled: this.form.field('enabled').text === 'true',
    }))
  }

  /**
   * Bind the HyperFrames card to its staged form.
   * @returns the card's state and staged write actions.
   */
  inject(): HyperframesCardFace {
    return { hooks: { hyperframesCard: this.store }, ...this.form.actions() }
  }
}
