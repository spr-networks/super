import React, { Component } from 'react'
import { View, VStack } from 'native-base'

import { wifiAPI, deviceAPI, nfmapAPI } from 'api'
import GroupListing from 'components/Groups/GroupListing'
import { AlertContext } from 'layouts/Admin'

export default class Dhcp extends Component {
  state = { groups: [] }

  async componentDidMount() {
    const refreshList = async () => {
      let divs = []
      const vmap = await nfmapAPI.getNFVerdictMap('dhcp').catch((error) => {
        //404 = no clients in map yet
        if (error.message !== 404) {
          this.context.error('API Failure for: ' + v.Name + ' ' + error.message)
        }
      })

      const arp = await wifiAPI.arp().catch((error) => {
        this.context.error('API Failure:' + error.message)
      })

      let ipMap = {}
      for (const entry of arp) {
        ipMap[entry.MAC] = entry
      }

      const devices = await deviceAPI.list().catch((error) => {
        this.context.error('API Failure getDevices: ' + error.message)
      })

      let group = { Name: 'Connected Clients', Members: [] }
      group.vmap = vmap
      group.ipMap = ipMap
      for (const entry of vmap) {
        let MAC = entry.ether_addr,
          Name = '--',
          ifname = entry.ifname

        let device = devices[MAC]
        if (device) {
          Name = device.Name
          device.online = true
        }

        group.Members.push({ MAC, Name, ifname, online: true })
      }

      let groupOffline = { Name: 'Devices not connected', Members: [] }
      for (let device of Object.values(devices)) {
        if (device.online === true) {
          continue
        }

        groupOffline.Members.push({
          MAC: device.MAC,
          Name: device.Name,
          IP: device.RecentIP,
          ifname: '',
          online: false
        })
      }

      let groups = [group]
      if (groupOffline.Members.length) {
        groups.push(groupOffline)
      }

      this.setState({ groups })
    }

    refreshList()
  }

  render() {
    return (
      <View>
        <VStack space={4}>
          {this.state.groups.map((group) => (
            <GroupListing key={group.Name} group={group} />
          ))}
        </VStack>
      </View>
    )
  }
}

Dhcp.contextType = AlertContext
