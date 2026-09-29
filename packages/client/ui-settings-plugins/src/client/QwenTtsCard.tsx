/** Settings card for opt-in Qwen3-TTS speech synthesis. */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { PluginCard } from './PluginCard.tsx'
import type { QwenTtsCardFace } from './qwen-tts-card-controller.ts'
import type {} from './slot-contract.ts'

/** Props supplied by the plugin settings slot. */
export type QwenTtsCardProps = PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.plugins'> & InjectFace<QwenTtsCardFace>

/**
 * Render staged enablement and environment-key setup guidance.
 * @param props - localized copy, form state, and save actions.
 * @returns the text-to-speech card.
 */
export function QwenTtsCard(props: QwenTtsCardProps) {
  const { t } = props
  const state = props.useQwenTtsCard(snapshot => snapshot)
  return (
    <PluginCard t={t} titleKey="qwenTtsTitle" descriptionKey="qwenTtsDescription"
      state={state} onSave={props.save} onDiscard={props.discard}>
      <label>
        <span>{t('qwenTtsEnabled')}</span>
        <Switch checked={state.enabled} label={t('qwenTtsEnabled')}
          disabled={!state.writable || state.saving}
          onChange={(enabled) => { props.edit('enabled', String(enabled)) }} />
      </label>
      <p>{t('qwenTtsKeyHint')}</p>
    </PluginCard>
  )
}
