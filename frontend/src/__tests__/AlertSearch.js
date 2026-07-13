import {
  alertSearchText,
  filterAlertsBySearch,
  getAlertServerFilter,
  isStructuredAlertSearch
} from 'components/Alerts/AlertSearchUtil'

const alerts = [
  {
    Title: 'Drop Private Network Request',
    Topic: 'nft:drop:private',
    Event: {
      Ethernet: { SrcMAC: 'aa:bb:cc:dd:ee:ff' },
      IP: { SrcIP: '192.168.2.105', DstIP: '10.20.30.40' },
      TCP: { DstPort: 443 }
    }
  },
  {
    Title: 'Login Failure',
    Topic: 'auth:failure',
    Event: { name: 'admin', reason: 'bad password' }
  }
]

test('distinguishes plain text from advanced field filters', () => {
  expect(isStructuredAlertSearch('192.168.2.105')).toBe(false)
  expect(isStructuredAlertSearch('admin')).toBe(false)
  expect(isStructuredAlertSearch('IP.SrcIP=="192.168.2.105"')).toBe(true)
  expect(getAlertServerFilter('admin')).toBe('')
  expect(getAlertServerFilter('IP.SrcIP=="192.168.2.105"')).toBe(
    '$[?(@.IP.SrcIP=="192.168.2.105")]'
  )
})

test('searches titles, topics, nested IPs, MACs, ports, and values', () => {
  expect(filterAlertsBySearch(alerts, 'private')).toEqual([alerts[0]])
  expect(filterAlertsBySearch(alerts, '192.168.2.105')).toEqual([alerts[0]])
  expect(filterAlertsBySearch(alerts, 'aa:bb')).toEqual([alerts[0]])
  expect(filterAlertsBySearch(alerts, '443')).toEqual([alerts[0]])
  expect(filterAlertsBySearch(alerts, 'bad password')).toEqual([alerts[1]])
})

test('supports multiple terms and restores all alerts when cleared', () => {
  expect(filterAlertsBySearch(alerts, 'private 10.20.30.40')).toEqual([
    alerts[0]
  ])
  expect(filterAlertsBySearch(alerts, '')).toEqual(alerts)
  expect(filterAlertsBySearch(alerts, '   ')).toEqual(alerts)
})

test('includes the name of a device referenced by IP or MAC', () => {
  const devices = [
    {
      Name: 'Living Room TV',
      MAC: 'aa:bb:cc:dd:ee:ff',
      RecentIP: '192.168.2.105'
    }
  ]
  expect(alertSearchText(alerts[0], devices)).toContain('living room tv')
  expect(filterAlertsBySearch(alerts, 'living tv', devices)).toEqual([
    alerts[0]
  ])
})

test('can match a friendly source label supplied by the view', () => {
  expect(
    filterAlertsBySearch(alerts, 'rfc1918', [], [
      'Firewall Drop Private Network Request (rfc1918)'
    ])
  ).toEqual(alerts)
})
