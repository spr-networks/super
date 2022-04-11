import React, { Component } from 'react'

import PeerList from 'components/Wireguard/PeerList'

export default class Wireguard extends Component {
  state = { config: {} }
  componentDidMount() {}

  render() {
    return (
      <div className="content">
        <PeerList />
      </div>
    )
  }
}
