// @vitest-environment jsdom
/** Enablement stays staged until saved and honors read-only settings. */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { bindSnapshotSelector, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { ImageEvolinkCard, type ImageEvolinkCardProps } from '../src/client/ImageEvolinkCard.tsx'
import { ImageEvolinkCardController, type ImageEvolinkSettings } from '../src/client/image-evolink-card-controller.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

it('stages, discards, and saves the image generation switch', async () => {
  const host = stubSettingsScope<ImageEvolinkSettings>()
  host.publish({
    status: 'ready', writable: true, value: { enabled: false }, base: { enabled: false }, user: {},
  })
  const card = new ImageEvolinkCardController(host.scope).inject()
  const props = {
    ...card, t: (key: keyof typeof en) => en[key],
    useImageEvolinkCard: bindSnapshotSelector(card.hooks.imageEvolinkCard),
  } as unknown as ImageEvolinkCardProps
  render(<ImageEvolinkCard {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show settings: Image generation (EvoLink)' }))
  const toggle = screen.getByRole('switch', { name: 'Enable image generation' })
  fireEvent.click(toggle)
  expect(toggle.getAttribute('aria-checked')).toBe('true')
  expect(host.set).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(toggle)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
  expect(host.set).toHaveBeenCalledWith('enabled', true)
  expect(screen.getByText(en.imageEvolinkKeyHint)).toBeTruthy()
})

it('disables the switch in a read-only deployment', () => {
  const host = stubSettingsScope<ImageEvolinkSettings>()
  host.publish({ status: 'ready', writable: false, value: { enabled: false } })
  const card = new ImageEvolinkCardController(host.scope).inject()
  render(<ImageEvolinkCard {...{
    ...card, t: (key: keyof typeof en) => en[key],
    useImageEvolinkCard: bindSnapshotSelector(card.hooks.imageEvolinkCard),
  } as unknown as ImageEvolinkCardProps} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show settings: Image generation (EvoLink)' }))
  expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(true)
})
