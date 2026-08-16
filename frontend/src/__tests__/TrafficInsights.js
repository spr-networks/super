import {
  addDockerContainers,
  devicesByRecentIp,
  isContainerIp
} from 'views/Traffic/TrafficInsights'

describe('traffic insights device classification', () => {
  const krunPlugin = {
    Name: 'spr-atlas',
    Type: 'Container',
    RecentIP: '192.168.2.110'
  }
  const laptop = {
    Name: 'laptop',
    RecentIP: '192.168.2.102'
  }

  it('classifies a DHCP-backed krun plugin as a container', () => {
    const byIp = devicesByRecentIp([krunPlugin, laptop])

    expect(isContainerIp(krunPlugin.RecentIP, [], byIp)).toBe(true)
    expect(isContainerIp(laptop.RecentIP, [], byIp)).toBe(false)
  })

  it('continues to classify Docker network addresses as containers', () => {
    expect(isContainerIp('172.17.0.4', ['172.17.0.0/16'], {})).toBe(true)
  })

  it('preserves the named krun device when Docker metadata arrives later', () => {
    const byIp = devicesByRecentIp([krunPlugin])
    const merged = addDockerContainers(byIp, {
      [krunPlugin.RecentIP]: { Name: 'docker-runtime-name' }
    })

    expect(merged[krunPlugin.RecentIP]).toBe(krunPlugin)
    expect(merged[krunPlugin.RecentIP].Name).toBe('spr-atlas')
  })
})
