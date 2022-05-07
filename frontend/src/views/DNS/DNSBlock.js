import React, { Component, useContext } from 'react'
import DNSBlocklist from 'components/DNS/DNSBlocklist'
import DNSOverrideList from 'components/DNS/DNSOverrideList'
import { AlertContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'
import PluginDisabled from 'views/PluginDisabled'

import { View, VStack } from 'native-base'

export default class DNSBlock extends Component {
  state = { enabled: true, PermitDomains: [], BlockDomains: [] }
  static contextType = AlertContext

  constructor(props) {
    super(props)
    this.state.BlockDomains = []
    this.state.PermitDomains = []
  }

  async componentDidMount() {
    await this.refreshConfig()
  }

  async refreshConfig() {
    try {
      let config = await blockAPI.config()

      this.setState({ BlockDomains: config.BlockDomains })
      this.setState({ PermitDomains: config.PermitDomains })
    } catch (error) {
      if ([404, 502].includes(error.message)) {
        this.setState({ enabled: false })
      } else {
        this.context.error('API Failure: ' + error.message)
      }
    }
  }

  render() {
    const generatedID = Math.random().toString(36).substr(2, 9)

    const notifyChange = async (type) => {
      if (type == 'config') {
        await this.refreshConfig()
        return
      }
    }

    if (!this.state.enabled) {
      return <PluginDisabled plugin="dns" />
    }

    return (
      <View>
        <VStack>
          <DNSBlocklist />

          <DNSOverrideList
            key={generatedID + 1}
            list={this.state.BlockDomains}
            title="Block Custom Domain"
            notifyChange={notifyChange}
          />
          <DNSOverrideList
            key={generatedID + 2}
            list={this.state.PermitDomains}
            title="Allow Custom Domain"
            notifyChange={notifyChange}
          />
        </VStack>
      </View>
    )
  }
}
