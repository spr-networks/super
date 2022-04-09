import React, { Component } from 'react'

import { wifiAPI, deviceAPI, nfmapAPI } from 'api'
import ZoneListing from 'components/Zones/ZoneListing'
import { APIErrorContext } from 'layouts/Admin'

export default class Dhcp extends Component {
  state = { zones: [] }

  static contextType = APIErrorContext

  async componentDidMount() {
    async function refreshZones() {
      let divs = []
      const vmap = await nfmapAPI.getNFVerdictMap('dhcp').catch((error) => {
        if (error.message == 404) {
          //no clients in map yet
        } else {
          this.context.reportError(
            'API Failure for: ' + v.Name + ' ' + error.message
          )
        }
      })

      const arp = await wifiAPI.arp().catch((error) => {
        this.context.reportError('API Failure:' + error.message)
      })

      let ipMap = {}
      for (const entry of arp) {
        ipMap[entry.MAC] = entry
      }

      const devices = await deviceAPI.list().catch((error) => {
        this.context.reportError('API Failure getDevices: ' + error.message)
      })

      let zone = { Name: 'Connected Clients', Members: [] }
      zone.vmap = vmap
      zone.ipMap = ipMap
      for (const entry of vmap) {
        let MAC = entry.ether_addr,
          Name = '--',
          ifname = entry.ifname

        let device = devices[MAC]
        if (device) {
          Name = device.Name
          device.online = true
        }

        zone.Members.push({ MAC, Name, ifname, online: true })
      }

      let zoneOffline = { Name: 'Devices not connected', Members: [] }
      for (let device of Object.values(devices)) {
        if (device.online === true) {
          continue
        }

        zoneOffline.Members.push({
          MAC: device.MAC,
          Name: device.Name,
          IP: device.RecentIP,
          ifname: '',
          online: false
        })
      }

      let zones = [zone]
      if (zoneOffline.Members.length) {
        zones.push(zoneOffline)
      }

      this.setState({ zones })
    }

    refreshZones = refreshZones.bind(this)
    refreshZones()
  }

  render() {
    return (
      <>
        <div className="content">
          {this.state.zones.map((zone) => (
            <ZoneListing key={zone.Name} zone={zone} />
          ))}
        </div>
      </>
    )
  }
}
