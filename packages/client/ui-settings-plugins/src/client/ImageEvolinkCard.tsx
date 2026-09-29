/** Settings card for opt-in EvoLink image generation. */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { PluginCard } from './PluginCard.tsx'
import type { ImageEvolinkCardFace } from './image-evolink-card-controller.ts'
import type {} from './slot-contract.ts'

/** Props supplied by the plugin settings slot. */
export type ImageEvolinkCardProps = PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.plugins'> & InjectFace<ImageEvolinkCardFace>

/**
 * Render staged enablement and environment-key setup guidance.
 * @param props - localized copy, form state, and save actions.
 * @returns the image generation card.
 */
export function ImageEvolinkCard(props: ImageEvolinkCardProps) {
  const { t } = props
  const state = props.useImageEvolinkCard(snapshot => snapshot)
  return (
    <PluginCard t={t} titleKey="imageEvolinkTitle" descriptionKey="imageEvolinkDescription"
      state={state} onSave={props.save} onDiscard={props.discard}>
      <label>
        <span>{t('imageEvolinkEnabled')}</span>
        <Switch checked={state.enabled} label={t('imageEvolinkEnabled')}
          disabled={!state.writable || state.saving}
          onChange={(enabled) => { props.edit('enabled', String(enabled)) }} />
      </label>
      <p>{t('imageEvolinkKeyHint')}</p>
    </PluginCard>
  )
}
