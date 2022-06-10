import React, { Component } from 'react'
import { View, VStack } from 'native-base'

import { firewallAPI } from 'api'
import ForwardList from 'components/Firewall/ForwardList'
import BlockList from 'components/Firewall/BlockList'

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
            title="Block IP Source or Destination"
            list={this.state.config.BlockRules}
            notifyChange={this.fetchConfig}
          />
        </VStack>
      </View>
    )
  }
}
