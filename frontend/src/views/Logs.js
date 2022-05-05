import React, { useContext, Component } from 'react'
import { View } from 'native-base'

import LogList from 'components/Logs/LogList'

import { Row, Col } from 'reactstrap'

export default class Logs extends Component {
  state = { containers: [] }

  constructor(props) {
    super(props)

    let { containers } = props.match.params
    if (containers && containers != ':containers') {
      this.state.containers = containers.split(',')
    }
  }

  render() {
    return (
      <View>
        <LogList containers={this.state.containers} />
      </View>
    )
  }
}
