import React, { Component } from 'react'
import { ScrollView, View, VStack } from 'native-base'

import { firewallAPI } from 'api'
import ForwardList from 'components/Firewall/ForwardList'
import BlockList from 'components/Firewall/BlockList'
import ForwardBlockList from 'components/Firewall/ForwardBlockList'
import UpstreamServicesList from 'components/Firewall/UpstreamServicesList'

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
      <ScrollView>
        <VStack space={8}>
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

          <UpstreamServicesList notifyChange={this.fetchConfig} />
        </VStack>
      </ScrollView>
    )
  }
}
