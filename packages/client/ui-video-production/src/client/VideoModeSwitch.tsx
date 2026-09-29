/** Top-level switch between the standard DSH panels and the video workspace. */

import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { VIDEO_PANEL_ID } from './contract.ts'
import type { VideoProductionInjected } from './contract.ts'
import css from './VideoModeSwitch.module.css'

type Props =
  & PropsRuntime<'shell.overlay'>
  & InjectFace<VideoProductionInjected>
  & PropsLocale<'videoProduction'>

/** Render the active video-mode action above the app frame. */
export function VideoModeSwitch({ usePanelInfo, useSessions, switchMode, t }: Props) {
  const panel = usePanelInfo(info => info.activePanelId)
  const sessionId = useSessions(state => state.current)
  const active = panel === VIDEO_PANEL_ID
  return (
    <Button
      className={css.switch}
      variant={active ? 'primary' : 'outline'}
      size="sm"
      aria-pressed={active}
      onClick={() => { switchMode(panel, sessionId) }}
    >
      {t(active ? 'mode.close' : 'mode.open')}
    </Button>
  )
}
