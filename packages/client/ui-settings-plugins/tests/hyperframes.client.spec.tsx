// @vitest-environment jsdom
/** Enablement stays staged until saved and honors read-only settings. */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { bindSnapshotSelector, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { HyperframesCard, type HyperframesCardProps } from '../src/client/HyperframesCard.tsx'
import { HyperframesCardController, type HyperframesSettings } from '../src/client/hyperframes-card-controller.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

it('stages, discards, and saves the HyperFrames switch', async () => {
  const host = stubSettingsScope<HyperframesSettings>()
  host.publish({
    status: 'ready', writable: true, value: { enabled: false }, base: { enabled: false }, user: {},
  })
  const card = new HyperframesCardController(host.scope).inject()
  const props = {
    ...card, t: (key: keyof typeof en) => en[key],
    useHyperframesCard: bindSnapshotSelector(card.hooks.hyperframesCard),
  } as unknown as HyperframesCardProps
  render(<HyperframesCard {...props} />)
  card.edit('enabled', 'false')
  card.edit('enabled', 'not-a-boolean')
  fireEvent.click(screen.getByRole('button', { name: 'Show settings: HyperFrames tools' }))
  const toggle = screen.getByRole('switch', { name: 'Enable HyperFrames tools' })
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(toggle)
  expect(toggle.getAttribute('aria-checked')).toBe('true')
  expect(host.set).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(toggle)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
  expect(host.set).toHaveBeenCalledWith('enabled', true)
  expect(screen.getByText(en.hyperframesKeyHint)).toBeTruthy()
})

it('disables the switch in a read-only deployment', () => {
  const host = stubSettingsScope<HyperframesSettings>()
  host.publish({ status: 'ready', writable: false, value: { enabled: false } })
  const card = new HyperframesCardController(host.scope).inject()
  render(<HyperframesCard {...{
    ...card, t: (key: keyof typeof en) => en[key],
    useHyperframesCard: bindSnapshotSelector(card.hooks.hyperframesCard),
  } as unknown as HyperframesCardProps} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show settings: HyperFrames tools' }))
  expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(true)
})
