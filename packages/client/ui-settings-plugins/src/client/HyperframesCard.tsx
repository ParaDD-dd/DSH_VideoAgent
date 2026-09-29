/** Settings card for opt-in HyperFrames project tools. */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { PluginCard } from './PluginCard.tsx'
import type { HyperframesCardFace } from './hyperframes-card-controller.ts'
import type {} from './slot-contract.ts'

/** Props supplied by the plugin settings slot. */
export type HyperframesCardProps = PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.plugins'> & InjectFace<HyperframesCardFace>

/**
 * Render HyperFrames enablement and local CLI setup guidance.
 * @param props - localized copy, form state, and save actions.
 * @returns the HyperFrames settings card.
 */
export function HyperframesCard(props: HyperframesCardProps) {
  const { t } = props
  const state = props.useHyperframesCard(snapshot => snapshot)
  return (
    <PluginCard t={t} titleKey="hyperframesTitle" descriptionKey="hyperframesDescription"
      state={state} onSave={props.save} onDiscard={props.discard}>
      <label>
        <span>{t('hyperframesEnabled')}</span>
        <Switch checked={state.enabled} label={t('hyperframesEnabled')}
          disabled={!state.writable || state.saving}
          onChange={(enabled) => { props.edit('enabled', String(enabled)) }} />
      </label>
      <p>{t('hyperframesKeyHint')}</p>
    </PluginCard>
  )
}
