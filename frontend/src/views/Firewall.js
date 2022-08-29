import React, { Component } from 'react'
import { View, VStack } from 'native-base'

import { firewallAPI } from 'api'
import ForwardList from 'components/Firewall/ForwardList'
import BlockList from 'components/Firewall/BlockList'
import ForwardBlockList from 'components/Firewall/ForwardBlockList'

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
      <View>
        <VStack>
          <ForwardList />

          <BlockList
            title="SPR Input Blocking"
            list={this.state.config.BlockRules}
            notifyChange={this.fetchConfig}
          />

          <ForwardBlockList
            title="Outbound Forwarding Block"
            list={this.state.config.ForwardingBlockRules}
            notifyChange={this.fetchConfig}
          />

        </VStack>
      </View>
    )
  }
}
