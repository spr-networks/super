import { api } from 'api'

let cache = null
let cacheAt = 0

// map of container ip -> { Name, Iface, Network } from docker networks.
// cached briefly: several views resolve ips per row render.
export const getContainerIpMap = async () => {
  if (cache && Date.now() - cacheAt < 30000) {
    return cache
  }

  try {
    const containers = await api.get('/info/docker')
    const map = {}
    for (const c of containers || []) {
      const name = (c.Names?.[0] || c.Id?.slice(0, 12) || '').replace(/^\//, '')
      const networks = c.NetworkSettings?.Networks || {}
      for (const [netName, n] of Object.entries(networks)) {
        if (!n?.IPAddress) continue
        map[n.IPAddress] = { Name: name, Iface: netName, Network: netName }
      }
    }
    cache = map
    cacheAt = Date.now()
    return map
  } catch (err) {
    return cache || {}
  }
}

// pseudo-device for a container so device components can render it
export const containerDevice = (ip, entry) => ({
  Name: entry.Name,
  RecentIP: ip,
  MAC: '',
  isContainer: true,
  Style: { Icon: 'Server', Color: '$blueGray500' }
})
