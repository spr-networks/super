import React, { Component } from 'react'
import { ScrollView, VStack } from '@gluestack-ui/themed'

import { firewallAPI } from 'api'
import EndpointList from 'components/Firewall/EndpointList'
import ForwardList from 'components/Firewall/ForwardList'
import BlockList from 'components/Firewall/BlockList'
import ForwardBlockList from 'components/Firewall/ForwardBlockList'
import MulticastPorts from 'components/Firewall/MulticastPorts'

export default class Firewall extends Component {
  state = { config: {} }

  constructor(props) {
    super(props)
  }

  fetchConfig = () => {
    firewallAPI.config().then((config) => this.setState({ config }))
  }

  componentDidMount() {
    this.fetchConfig()
  }

  render() {
    return (
      <ScrollView sx={{ '@md': { height: '90vh' } }}>
        <VStack space="lg">
          <EndpointList
            list={this.state.config.Endpoints}
            notifyChange={this.fetchConfig}
          />

          <ForwardList
            list={this.state.config.ForwardingRules}
            notifyChange={this.fetchConfig}
          />

          <BlockList
            title="Inbound Traffic Block"
            list={this.state.config.BlockRules}
            notifyChange={this.fetchConfig}
          />

          <ForwardBlockList
            title="Forwarding Traffic Block"
            list={this.state.config.ForwardingBlockRules}
            notifyChange={this.fetchConfig}
          />

          <MulticastPorts
            list={this.state.config.MulticastPorts}
            notifyChange={this.fetchConfig}
          />
        </VStack>
      </ScrollView>
    )
  }
}
