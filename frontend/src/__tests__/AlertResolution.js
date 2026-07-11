import { getAlertResolution } from 'components/Alerts/AlertResolutionUtil'

const device = {
  Name: 'Office camera',
  MAC: 'aa:bb:cc:dd:ee:ff',
  RecentIP: '192.168.2.24',
  VLANTag: '',
  Policies: ['wan', 'dns'],
  PSKEntry: { Type: 'wpa2', Psk: 'old-password' }
}

const alert = (Topic, Event) => ({ Topic, Event, Title: 'Test alert' })

test('offers VLAN assignment only for an untagged known device on a VLAN interface', () => {
  const result = getAlertResolution(
    alert('nft:drop:mac', {
      InDev: 'eth1.1008',
      Ethernet: { SrcMAC: device.MAC },
      IP: { SrcIP: device.RecentIP }
    }),
    [device]
  )

  expect(result.kind).toBe('assign-vlan')
  expect(result.vlan).toBe('1008')

  expect(
    getAlertResolution(
      alert('nft:drop:mac', {
        InDev: 'eth1.1008',
        Ethernet: { SrcMAC: device.MAC }
      }),
      [{ ...device, VLANTag: '1008' }]
    )
  ).toBeNull()
})

test('does not offer VLAN assignment when the VLAN cannot be proven', () => {
  expect(
    getAlertResolution(
      alert('nft:drop:mac', {
        InDev: 'eth1',
        Ethernet: { SrcMAC: device.MAC }
      }),
      [device]
    )
  ).toBeNull()
})

test('offers upstream policy and a narrow firewall draft for a known device', () => {
  const result = getAlertResolution(
    alert('nft:drop:private', {
      Ethernet: { SrcMAC: device.MAC },
      IP: { SrcIP: device.RecentIP, DstIP: '10.20.30.40' },
      TCP: { DstPort: 443 }
    }),
    [device]
  )

  expect(result.kind).toBe('apply-upstream-policy')
  expect(result.firewallDraft).toMatchObject({
    IP: '10.20.30.40',
    Port: '443',
    Protocol: 'tcp',
    initialDeviceIds: [device.MAC]
  })
})

test('does not suggest upstream access for unknown or already-authorized devices', () => {
  const item = alert('nft:drop:private', {
    Ethernet: { SrcMAC: device.MAC },
    IP: { DstIP: '10.20.30.40' }
  })

  expect(getAlertResolution(item, [])).toBeNull()
  expect(
    getAlertResolution(item, [
      { ...device, Policies: [...device.Policies, 'lan_upstream'] }
    ])
  ).toBeNull()
})

test('offers password replacement only for a known per-device Wi-Fi identity', () => {
  const item = alert('wifi:auth:fail', { MAC: device.MAC })
  expect(getAlertResolution(item, [device]).kind).toBe('update-wifi-password')
  expect(getAlertResolution(item, [])).toBeNull()
  expect(
    getAlertResolution(item, [
      { ...device, PSKEntry: { Type: 'none', Psk: '' } }
    ])
  ).toBeNull()
})
