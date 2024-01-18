import React, { Component } from 'react'
import { ScrollView, VStack } from '@gluestack-ui/themed'

import { wifiAPI, deviceAPI, nfmapAPI, groupAPI } from 'api'
import GroupListing from 'components/Groups/GroupListing'
import { AlertContext } from 'layouts/Admin'

export default class Dhcp extends Component {
  state = { groups: [] }

  async componentDidMount() {
    const refreshList = async () => {
      let divs = []
      //TBD -- need to call out into mesh nodes also for dhcp
      // also this should use the new DHCP API.
      const vmap = await nfmapAPI
        .getNFVerdictMap('ethernet_filter')
        .catch((error) => {
          //404 = no clients in map yet
          if (error.message !== 404) {
            this.context.error(
              'API Failure for: ' + v.Name + ' ' + error.message
            )
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

  deleteGroup(name) {
    groupAPI.deleteGroup(name).then(() => {
      refreshGroups()
    }).catch((err) => {
      this.context.error('API Failure, failed to delete group ' + err.message)
    })
  }

  render() {
    return (
      <ScrollView sx={{ '@md': { h: '92vh' } }}>
        <VStack space={'md'}>
          {this.state.groups.map((group) => (
            <GroupListing key={group.Name} group={group} />
          ))}
        </VStack>
      </ScrollView>
    )
  }
}

Dhcp.contextType = AlertContext
