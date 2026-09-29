/** Staged enablement for the Qwen3-TTS tool. */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { CardForm, type CardActions, type CardShell } from './card-form.ts'

/** Host-owned namespace; the Client never imports the Host plugin. */
export const QWEN_TTS_NS = 'qwen-tts'

/** The Qwen text-to-speech fields this card edits. */
export interface QwenTtsSettings {
  /** Whether agents may synthesize speech. */
  enabled?: boolean
}

/** Renderable staged enablement and save status. */
export interface QwenTtsCardState extends CardShell {
  /** Staged switch value. */
  enabled: boolean
}

/** Slot-injected Qwen TTS card state and actions. */
export interface QwenTtsCardFace extends CardActions {
  hooks: {
    /** Bound as useQwenTtsCard by the slot renderer. */
    qwenTtsCard: SnapshotStore<QwenTtsCardState>
  }
}

/** Saves Qwen TTS enablement through the revision-fenced settings scope. */
export class QwenTtsCardController {
  private readonly form: CardForm<QwenTtsSettings>
  private readonly store: SnapshotStore<QwenTtsCardState>

  /** @param scope - the qwen-tts settings scope. */
  constructor(scope: SettingsScope<QwenTtsSettings>) {
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
   * Bind the Qwen TTS card to its staged form.
   * @returns the card's state and staged write actions.
   */
  inject(): QwenTtsCardFace {
    return { hooks: { qwenTtsCard: this.store }, ...this.form.actions() }
  }
}
