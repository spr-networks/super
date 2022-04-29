import React, { Component } from 'react'

import { groupAPI, deviceAPI, nfmapAPI } from 'api'
import GroupListing from 'components/Groups/GroupListing'
import { APIErrorContext } from 'layouts/Admin'

export default class Groups extends Component {
  state = { groups: {}, rows: [] }

  static contextType = APIErrorContext

  async componentDidMount() {
    const refreshGroups = async () => {
      let groups
      let devices

      try {
        groups = await groupAPI.list()
        devices = await deviceAPI.list()
      } catch (error) {
        this.context.reportError('API Failure: ' + error.message)
      }

      let members = {}
      for (const group of groups) {
        members[group.Name] = []
      }

      for (let MAC in devices) {
        let device = devices[MAC]
        for (const entry of device.Groups) {
          members[entry].push(device)
        }
      }

      for (let group of groups) {
        group.Members = members[group.Name]
      }

      let rows = []
      if (groups) {
        // get vmap for each group and show list
        for (const group of groups) {
          const vmap = await nfmapAPI
            .getNFVerdictMap(group.Name)
            .catch((error) => {
              //404 = no clients in map yet
              if (error.message !== 404) {
                this.context.reportError(
                  'API Failure for: ' + v.Name + ' ' + error.message
                )
              }
            })

          group.vmap = vmap
          rows.push(<GroupListing key={group.Name} group={group} />)
        }

        this.setState({ groups, rows })
      }
    }

    refreshGroups()
  }

  render() {
    return (
      <>
        <div className="content">{this.state.rows}</div>
      </>
    )
  }
}
