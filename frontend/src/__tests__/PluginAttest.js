import 'react-native'
import React from 'react'
import { fireEvent, render, waitFor } from 'test-utils'
import { MemoryRouter } from 'react-router-dom'

import PluginList from 'components/Plugins/PluginList'
import { api } from 'api'

const COMPOSE_PATH = 'plugins/foo/docker-compose.yml'
const COMPOSE_QUERY = '/pluginAttest?compose_file=plugins%2Ffoo%2Fdocker-compose.yml'

const composePlugin = {
  Name: 'foo',
  URI: 'foo',
  Enabled: true,
  Version: '1.0.0',
  ComposeFilePath: COMPOSE_PATH
}

const setup = (list) =>
  render(
    <MemoryRouter>
      <PluginList
        list={list}
        deleteListItem={jest.fn()}
        notifyChange={jest.fn()}
      />
    </MemoryRouter>
  )

describe('plugin build attestation', () => {
  let getSpy

  beforeEach(() => {
    getSpy = jest.spyOn(api, 'get')
  })

  afterEach(() => {
    getSpy.mockRestore()
  })

  // regression: PluginList referenced `api` without importing it, so expanding
  // the attestation section threw "ReferenceError: api is not defined"
  it('queries /pluginAttest when the attestation section is expanded', async () => {
    getSpy.mockResolvedValue([
      {
        Image: 'ghcr.io/spr-networks/foo:latest',
        Verified: true,
        Digest: 'sha256:abc123',
        Signer: 'https://github.com/spr-networks/super/.github/workflows/build.yml'
      }
    ])

    const screen = setup([composePlugin])

    expect(getSpy).not.toHaveBeenCalled()

    fireEvent.press(screen.getByText('Build attestation'))

    await waitFor(() => expect(getSpy).toHaveBeenCalledWith(COMPOSE_QUERY))

    await waitFor(() =>
      expect(screen.getByText('Verified build (cosign)')).toBeTruthy()
    )
    expect(screen.getByText('sha256:abc123')).toBeTruthy()

    screen.unmount()
  })

  it('uses the service name for builtin plugins without a compose file', async () => {
    getSpy.mockResolvedValue([])

    const screen = setup([
      { Name: 'dns-block-extension', URI: 'dns-block-extension', Enabled: true }
    ])

    fireEvent.press(screen.getByText('Build attestation'))

    await waitFor(() =>
      expect(getSpy).toHaveBeenCalledWith('/pluginAttest?service=dns')
    )

    await waitFor(() =>
      expect(screen.getByText('No images found for this plugin.')).toBeTruthy()
    )

    screen.unmount()
  })

  it('re-checks with force=1 and surfaces query failures', async () => {
    getSpy.mockRejectedValueOnce(new Error('cosign missing'))

    const screen = setup([composePlugin])

    fireEvent.press(screen.getByText('Build attestation'))

    await waitFor(() =>
      expect(
        screen.getByText('Failed to query build attestation: cosign missing')
      ).toBeTruthy()
    )

    getSpy.mockResolvedValueOnce([
      { Image: 'ghcr.io/spr-networks/foo:latest', Verified: true }
    ])

    fireEvent.press(screen.getByText('Retry'))

    await waitFor(() =>
      expect(getSpy).toHaveBeenCalledWith(COMPOSE_QUERY + '&force=1')
    )
    await waitFor(() =>
      expect(screen.getByText('Verified build (cosign)')).toBeTruthy()
    )

    screen.unmount()
  })
})
