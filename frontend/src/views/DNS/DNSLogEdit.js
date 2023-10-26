import React, { Component, useContext } from 'react'
import DNSLogList from 'components/DNS/DNSLogList'
import PluginDisabled from 'views/PluginDisabled'
import { logAPI } from 'api/DNS'

import { View, VStack } from '@gluestack-ui/themed'

export default class DNSLogEdit extends Component {
  state = { enabled: true }
  componentDidMount() {
    logAPI.config().catch((error) => this.setState({ enabled: false }))
  }

  render() {
    if (!this.state.enabled) {
      return <PluginDisabled plugin="dns" />
    }

    return (
      <View>
        <VStack>
          <DNSLogList
            type="IP"
            title="Host Privacy IP List"
            description="Client IPs to exclude from logs"
          />
          <DNSLogList
            type="Domain"
            title="Domain Ignore List"
            description="Domains to exclude from logs"
          />
        </VStack>
      </View>
    )
  }
}
