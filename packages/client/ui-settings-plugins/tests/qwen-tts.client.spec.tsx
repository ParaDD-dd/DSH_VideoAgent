// @vitest-environment jsdom
/** Enablement stays staged until saved and honors read-only settings. */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { bindSnapshotSelector, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { QwenTtsCard, type QwenTtsCardProps } from '../src/client/QwenTtsCard.tsx'
import { QwenTtsCardController, type QwenTtsSettings } from '../src/client/qwen-tts-card-controller.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

it('stages, discards, and saves the speech synthesis switch', async () => {
  const host = stubSettingsScope<QwenTtsSettings>()
  host.publish({
    status: 'ready', writable: true, value: { enabled: false }, base: { enabled: false }, user: {},
  })
  const card = new QwenTtsCardController(host.scope).inject()
  const props = {
    ...card, t: (key: keyof typeof en) => en[key],
    useQwenTtsCard: bindSnapshotSelector(card.hooks.qwenTtsCard),
  } as unknown as QwenTtsCardProps
  render(<QwenTtsCard {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show settings: Speech synthesis (Qwen3-TTS)' }))
  const toggle = screen.getByRole('switch', { name: 'Enable speech synthesis' })
  fireEvent.click(toggle)
  expect(toggle.getAttribute('aria-checked')).toBe('true')
  expect(host.set).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(toggle)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
  expect(host.set).toHaveBeenCalledWith('enabled', true)
  expect(screen.getByText(en.qwenTtsKeyHint)).toBeTruthy()
})

it('disables the switch in a read-only deployment', () => {
  const host = stubSettingsScope<QwenTtsSettings>()
  host.publish({ status: 'ready', writable: false, value: { enabled: false } })
  const card = new QwenTtsCardController(host.scope).inject()
  render(<QwenTtsCard {...{
    ...card, t: (key: keyof typeof en) => en[key],
    useQwenTtsCard: bindSnapshotSelector(card.hooks.qwenTtsCard),
  } as unknown as QwenTtsCardProps} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show settings: Speech synthesis (Qwen3-TTS)' }))
  expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(true)
})
