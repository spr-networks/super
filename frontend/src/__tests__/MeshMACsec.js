import 'react-native'
import React from 'react'
import { act, render, waitFor, fireEvent } from 'test-utils'
import { MeshLinks, BackhaulControl } from 'components/Mesh/MeshMACsec'
import { Select } from 'components/Select'
import { AlertContext } from 'AppContext'
import { meshAPI } from 'api'

jest.mock('api', () => ({
  meshAPI: {
    leafMode: jest.fn(),
    leafRouters: jest.fn(),
    macsecStatus: jest.fn(),
    setLeafBackhaul: jest.fn(),
    testLeafMTU: jest.fn()
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

it('tests jumbo frames for an encrypted mesh node', async () => {
  meshAPI.testLeafMTU.mockResolvedValueOnce({
    UnderlayMTU: 9000,
    Jumbo: true,
    LinkMTU: 1500
  })
  const { getByText, alerts: a } = renderControl({
    IP: '192.168.2.10',
    MACsec: { Enabled: true, Mode: 'wireguard' }
  })
  fireEvent.press(getByText('Test jumbo frames'))
  await waitFor(() =>
    expect(a.success).toHaveBeenCalledWith('Jumbo frames supported, MTU 9000')
  )
  expect(meshAPI.testLeafMTU).toHaveBeenCalledWith({ IP: '192.168.2.10' })

  meshAPI.testLeafMTU.mockResolvedValueOnce({
    UnderlayMTU: 1500,
    Jumbo: false,
    LinkMTU: 1390
  })
  fireEvent.press(getByText('Test jumbo frames'))
  await waitFor(() =>
    expect(a.info).toHaveBeenCalledWith('Jumbo frames not supported, MTU 1500')
  )
})

it('offers the jumbo frame test only when encryption is on', () => {
  const { queryByText } = renderControl({ IP: '192.168.2.18' })
  expect(queryByText('Test jumbo frames')).toBeNull()
})
