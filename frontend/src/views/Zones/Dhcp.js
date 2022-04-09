import React, { Component } from 'react'

import { wifiAPI, deviceAPI, nfmapAPI } from 'api'
import ZoneListing from 'components/Zones/ZoneListing'
import { APIErrorContext } from 'layouts/Admin'

export default class Dhcp extends Component {
  state = { zones: {}, zoneRows: [] }

  static contextType = APIErrorContext

  async componentDidMount() {
    const setState = (v) => {
      this.setState(v)
    }

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
      for (const e of arp) {
        ipMap[e.MAC] = e
      }

      const devices = await deviceAPI.list().catch((error) => {
        this.context.reportError('API Failure getDevices: ' + error.message)
      })

      const generatedID = Math.random().toString(36).substr(2, 9)
      let v = { Name: 'Wireless DHCP Clients', Members: [] }
      v.vmap = vmap
      v.ipMap = ipMap
      for (const entry of vmap) {
        let name = '--'
        let d = devices[entry.ether_addr]
        if (d) {
          name = d.Name
        }
        v.Members.push({
          Name: name,
          MAC: entry.ether_addr,
          ifname: entry.ifname
        })
      }

      divs.push(
        <ZoneListing key={generatedID} zone={v} notifyChange={notifyChange} />
      )

      setState({ zoneRows: divs })
    }

    const notifyChange = () => {
      refreshZones()
    }

    refreshZones = refreshZones.bind(this)
    refreshZones()
  }

  render() {
    return (
      <>
        <div className="content">{this.state.zoneRows}</div>
      </>
    )
  }
}
