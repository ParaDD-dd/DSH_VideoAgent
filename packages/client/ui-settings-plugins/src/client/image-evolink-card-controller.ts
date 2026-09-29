/** Staged enablement for the EvoLink image tool. */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { CardForm, type CardActions, type CardShell } from './card-form.ts'

/** Host-owned namespace; the Client never imports the Host plugin. */
export const IMAGE_EVOLINK_NS = 'image-evolink'

/** The image generation fields this card edits. */
export interface ImageEvolinkSettings {
  /** Whether agents may generate images. */
  enabled?: boolean
}

/** Renderable staged enablement and save status. */
export interface ImageEvolinkCardState extends CardShell {
  /** Staged switch value. */
  enabled: boolean
}

/** Slot-injected image card state and actions. */
export interface ImageEvolinkCardFace extends CardActions {
  hooks: {
    /** Bound as useImageEvolinkCard by the slot renderer. */
    imageEvolinkCard: SnapshotStore<ImageEvolinkCardState>
  }
}

/** Saves image-tool enablement through the revision-fenced settings scope. */
export class ImageEvolinkCardController {
  private readonly form: CardForm<ImageEvolinkSettings>
  private readonly store: SnapshotStore<ImageEvolinkCardState>

  /** @param scope - the image-evolink settings scope. */
  constructor(scope: SettingsScope<ImageEvolinkSettings>) {
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
   * Bind the image card to its staged form.
   * @returns the image card's state and staged write actions.
   */
  inject(): ImageEvolinkCardFace {
    return { hooks: { imageEvolinkCard: this.store }, ...this.form.actions() }
  }
}
