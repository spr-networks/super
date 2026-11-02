import 'react-native'
import React from 'react'
import { act, render, waitFor, fireEvent } from 'test-utils'
import { MeshLinks, BackhaulControl } from 'components/Mesh/MeshMACsec'
import { Select } from 'components/Select'
import { Switch } from '@gluestack-ui/themed'
import { AlertContext } from 'AppContext'
import { meshAPI } from 'api'

jest.mock('api', () => ({
  meshAPI: {
    leafMode: jest.fn(),
    leafRouters: jest.fn(),
    macsecStatus: jest.fn(),
    setLeafBackhaul: jest.fn(),
    setLeafJumbo: jest.fn()
  }
}))

const leaves = [
  {
    IP: '192.168.2.10',
    MACsec: { Enabled: true, Mode: 'wireguard', Parent: 'eth1' }
  },
  { IP: '192.168.2.14', MACsecPending: true },
  { IP: '192.168.2.18' }
]

const alerts = () => ({ error: jest.fn(), success: jest.fn(), info: jest.fn() })

const renderControl = (leaf, link, alertsValue = alerts()) => {
  const view = render(
    <AlertContext.Provider value={alertsValue}>
      <BackhaulControl leaf={leaf} link={link} />
    </AlertContext.Provider>
  )
  return { ...view, alerts: alertsValue }
}

beforeEach(() => {
  jest.clearAllMocks()
  meshAPI.leafMode.mockResolvedValue('false')
  meshAPI.leafRouters.mockResolvedValue(leaves)
  meshAPI.macsecStatus.mockResolvedValue({
    Role: 'main',
    Links: [
      {
        LeafIP: '192.168.2.10',
        Interface: 'mshvx2',
        Parent: 'eth1',
        Mode: 'wireguard',
        Underlay: 9000,
        Secured: true
      },
      { LeafIP: '192.168.2.14', Pending: true }
    ]
  })
  meshAPI.setLeafBackhaul.mockResolvedValue({})
  meshAPI.setLeafJumbo.mockResolvedValue({})
})

it('lists mesh links and their wired encryption state in link settings', async () => {
  const { findByText, getByText } = render(<MeshLinks />)
  await findByText('Mesh Links')
  await findByText('Encrypted, MTU 9000')
  expect(getByText('Wired Encryption')).toBeTruthy()
  expect(getByText('mshvx2')).toBeTruthy()
  expect(getByText('Pending')).toBeTruthy()
  expect(getByText('Off')).toBeTruthy()
})

it('hides mesh links on a mesh node', async () => {
  meshAPI.leafMode.mockResolvedValue('true')
  const { queryByText } = render(<MeshLinks />)
  await waitFor(() => expect(meshAPI.leafMode).toHaveBeenCalled())
  expect(queryByText('Mesh Links')).toBeNull()
  expect(meshAPI.leafRouters).not.toHaveBeenCalled()
})

it('hides mesh links without the mesh plugin', async () => {
  meshAPI.leafMode.mockRejectedValue({ message: 404 })
  const { queryByText } = render(<MeshLinks />)
  await waitFor(() => expect(meshAPI.leafMode).toHaveBeenCalled())
  expect(queryByText('Mesh Links')).toBeNull()
})

it('switches a mesh node between off, WireGuard and MACsec', async () => {
  const { UNSAFE_getByType } = renderControl({ IP: '192.168.2.18' })
  const select = UNSAFE_getByType(Select)
  expect(select.props.selectedValue).toBe('off')
  expect(select.props.selectedLabel).toBe('Off')
  await act(async () => select.props.onValueChange('wireguard'))
  expect(meshAPI.setLeafBackhaul).toHaveBeenLastCalledWith({
    IP: '192.168.2.18',
    Enable: true,
    Mode: 'wireguard'
  })
  await act(async () => select.props.onValueChange('macsec'))
  expect(meshAPI.setLeafBackhaul).toHaveBeenLastCalledWith({
    IP: '192.168.2.18',
    Enable: true,
    Mode: 'macsec'
  })
})

it('turns encryption off', async () => {
  const { UNSAFE_getByType } = renderControl({
    IP: '192.168.2.10',
    MACsec: { Enabled: true, Mode: 'wireguard' }
  })
  const select = UNSAFE_getByType(Select)
  expect(select.props.selectedValue).toBe('wireguard')
  expect(select.props.selectedLabel).toBe('WireGuard')
  await act(async () => select.props.onValueChange('off'))
  expect(meshAPI.setLeafBackhaul).toHaveBeenLastCalledWith({
    IP: '192.168.2.10',
    Enable: false
  })
})

it('shows the error reported for the link', () => {
  const { getByText } = renderControl(
    { IP: '192.168.2.14', MACsecPending: true },
    { Error: 'Encrypted Link (WireGuard) not up on eth1' }
  )
  expect(getByText('Encrypted Link (WireGuard) not up on eth1')).toBeTruthy()
})

it('turns jumbo frames on and off for an encrypted mesh node', async () => {
  const { UNSAFE_getByType, getByText } = renderControl({
    IP: '192.168.2.10',
    MACsec: { Enabled: true, Mode: 'wireguard' }
  })
  expect(getByText('Jumbo frames')).toBeTruthy()
  const toggle = UNSAFE_getByType(Switch)
  expect(toggle.props.value).toBe(false)
  await act(async () => toggle.props.onValueChange(true))
  expect(meshAPI.setLeafJumbo).toHaveBeenLastCalledWith({
    IP: '192.168.2.10',
    Jumbo: true
  })
})

it('shows jumbo frames as on and reports a failed change', async () => {
  meshAPI.setLeafJumbo.mockRejectedValueOnce({ message: 'leaf unreachable' })
  const { UNSAFE_getByType, alerts: a } = renderControl({
    IP: '192.168.2.10',
    MACsec: { Enabled: true, Mode: 'wireguard', Jumbo: true }
  })
  const toggle = UNSAFE_getByType(Switch)
  expect(toggle.props.value).toBe(true)
  await act(async () => toggle.props.onValueChange(false))
  expect(meshAPI.setLeafJumbo).toHaveBeenLastCalledWith({
    IP: '192.168.2.10',
    Jumbo: false
  })
  await waitFor(() =>
    expect(a.error).toHaveBeenCalledWith(
      'Jumbo frames update failed',
      'leaf unreachable'
    )
  )
})

it('offers jumbo frames only when encryption is on', () => {
  const { queryByText } = renderControl({ IP: '192.168.2.18' })
  expect(queryByText('Jumbo frames')).toBeNull()
})
