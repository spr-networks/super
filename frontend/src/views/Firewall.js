import React, { Component } from 'react'
import { ScrollView, View, VStack } from 'native-base'

import { firewallAPI } from 'api'
import BlockList from 'components/Firewall/BlockList'
import EndpointList from 'components/Firewall/EndpointList'
import ForwardList from 'components/Firewall/ForwardList'
import ForwardBlockList from 'components/Firewall/ForwardBlockList'
import MulticastPorts from 'components/Firewall/MulticastPorts'
import UpstreamServicesList from 'components/Firewall/UpstreamServicesList'

export default class Firewall extends Component {
  state = { config: {} }

  constructor(props) {
    super(props)
  }

  fetchConfig = () => {
    firewallAPI.config().then((config) => {
      config.MulticastPorts = [];
      this.setState({ config })
    })
  }

  componentDidMount() {
    this.fetchConfig()
  }

  render() {
    return (
      <ScrollView>
        <VStack space={8}>

          <EndpointList
            list={this.state.config.Endpoints}
            notifyChange={this.fetchConfig}
          />


          <ForwardList
            list={this.state.config.ForwardingRules}
            notifyChange={this.fetchConfig}
          />

          <MulticastPorts
            list={this.state.config.MulticastPorts}
            notifyChange={this.fetchConfig}
          />

          <UpstreamServicesList notifyChange={this.fetchConfig} />

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

        </VStack>
      </ScrollView>
    )
  }
}
