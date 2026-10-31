import 'react-native'
import React from 'react'
import { render, waitFor, fireEvent } from 'test-utils'
import { MeshLinks, MACsecSwitch } from 'components/Mesh/MeshMACsec'
import { meshAPI } from 'api'

jest.mock('api', () => ({
  meshAPI: {
    leafMode: jest.fn(),
    leafRouters: jest.fn(),
    macsecStatus: jest.fn(),
    setLeafMACsec: jest.fn()
  }
}))

const leaves = [
  { IP: '192.168.2.10', MACsec: { Enabled: true, Parent: 'eth1' } },
  { IP: '192.168.2.14', MACsecPending: true },
  { IP: '192.168.2.18' }
]

beforeEach(() => {
  jest.clearAllMocks()
  meshAPI.leafMode.mockResolvedValue('false')
  meshAPI.leafRouters.mockResolvedValue(leaves)
  meshAPI.macsecStatus.mockResolvedValue({
    Role: 'main',
    Links: [
      {
        LeafIP: '192.168.2.10',
        Interface: 'macsec0',
        Parent: 'eth1',
        Secured: true
      },
      { LeafIP: '192.168.2.14', Pending: true }
    ]
  })
  meshAPI.setLeafMACsec.mockResolvedValue({})
})

it('lists mesh links and their MACsec state in link settings', async () => {
  const { findByText, getByText } = render(<MeshLinks />)
  await findByText('Mesh Links')
  await findByText('Encrypted')
  expect(getByText('macsec0')).toBeTruthy()
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

it('enables MACsec for a leaf', async () => {
  const onChange = jest.fn()
  const { getByRole } = render(
    <MACsecSwitch leaf={{ IP: '192.168.2.18' }} onChange={onChange} />
  )
  fireEvent(getByRole('switch'), 'valueChange', true)
  await waitFor(() =>
    expect(meshAPI.setLeafMACsec).toHaveBeenCalledWith({
      IP: '192.168.2.18',
      Enable: true
    })
  )
  await waitFor(() => expect(onChange).toHaveBeenCalled())
})

it('disables MACsec and cancels a pending request', async () => {
  const { getByRole } = render(
    <MACsecSwitch leaf={{ IP: '192.168.2.14', MACsecPending: true }} />
  )
  fireEvent(getByRole('switch'), 'valueChange', false)
  await waitFor(() =>
    expect(meshAPI.setLeafMACsec).toHaveBeenCalledWith({
      IP: '192.168.2.14',
      Enable: false
    })
  )
})

it('shows the error reported for the link', () => {
  const { getByText } = render(
    <MACsecSwitch
      leaf={{ IP: '192.168.2.14', MACsecPending: true }}
      link={{ Error: 'kernel MACsec support (macsec module) is unavailable' }}
    />
  )
  expect(
    getByText('kernel MACsec support (macsec module) is unavailable')
  ).toBeTruthy()
})
