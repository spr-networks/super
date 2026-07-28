import 'react-native'
import React from 'react'
import { render, waitFor } from 'test-utils'
import { MemoryRouter } from 'react-router-dom'

import Plugins from 'views/Plugins'
import { pluginAPI } from 'api'

jest.mock('api', () => ({
  api: {
    get: jest.fn(() => Promise.resolve([])),
    put: jest.fn(() => Promise.resolve())
  },
  pluginAPI: {
    list: jest.fn(),
    getPlusToken: jest.fn(),
    update: jest.fn(),
    remove: jest.fn()
  }
}))

const plugins = [
  {
    Name: 'dns-block-extension',
    URI: 'dns/block',
    UnixPath: '/state/dns/dns_block_plugin',
    Enabled: true,
    Plus: false
  },
  {
    Name: 'PFW',
    URI: 'pfw',
    UnixPath: '/state/plugins/pfw/socket',
    Enabled: false,
    Plus: true,
    GitURL: 'github.com/spr-networks/pfw_extension',
    ComposeFilePath: 'plugins/plus/pfw_extension/docker-compose.yml'
  },
  {
    Name: 'MESH',
    URI: 'mesh',
    UnixPath: '/state/plugins/mesh/socket',
    Enabled: false,
    Plus: true,
    GitURL: 'github.com/spr-networks/mesh_extension',
    ComposeFilePath: 'plugins/plus/mesh_extension/docker-compose.yml'
  }
]

describe('plugin list without a PLUS token', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    pluginAPI.list.mockResolvedValue(plugins)
    pluginAPI.getPlusToken.mockResolvedValue('')
  })

  it('shows PFW and MESH with the token input still present', async () => {
    const screen = render(
      <MemoryRouter>
        <Plugins />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('PFW')).toBeTruthy())
    expect(screen.getByText('MESH')).toBeTruthy()
    expect(screen.getByText('PLUS Plugins')).toBeTruthy()
    expect(screen.getByText('Enable PLUS')).toBeTruthy()

    screen.unmount()
  })
})
