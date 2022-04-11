import React, { Component } from 'react'

import { wireguardAPI } from 'api/Wireguard'
import PeerList from 'components/Wireguard/PeerList'
import Toggle from 'components/Toggle'

import {
  Button,
  Label,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
  Row,
  Col
} from 'reactstrap'

export default class Wireguard extends Component {
  state = { isUp: false, config: {} }
  constructor(props) {
    super(props)
    this.config = {}
    this.isUp = false

    this.handleChange = this.handleChange.bind(this)
  }

  getStatus() {
    wireguardAPI.status().then((status) => {
      let publicKey = status.wg0.publicKey,
        listenPort = status.wg0.listenPort

      if (listenPort) {
        this.setState({ isUp: true })
      }

      let config = { publicKey, listenPort }
      this.setState({ config })
    })
  }

  componentDidMount() {
    this.getStatus()
  }

  handleChange(el, value) {
    let fn = value ? wireguardAPI.up : wireguardAPI.down
    fn()
      .then((res) => {
        this.setState({ isUp: value })
        if (value) {
          this.getStatus()
        } else {
          this.setState({ config: {} })
        }
      })
      .catch((err) => {})
  }

  render() {
    return (
      <div className="content">
        <Card>
          <CardHeader>
            <div className="pull-right">
              <Toggle
                isChecked={this.state.isUp}
                onChange={this.handleChange}
              />
            </div>
            <CardTitle tag="h4">Wireguard</CardTitle>
          </CardHeader>
          <CardBody>
            {this.state.config.listenPort ? (
              <>
                <p>
                  Wireguard is listening on port {this.state.config.listenPort}{' '}
                  with PublicKey: <em>{this.state.config.publicKey}</em>
                </p>
              </>
            ) : (
              <p>Wireguard is not running. See /configs/wireguard/wg0.conf</p>
            )}
          </CardBody>
        </Card>

        <PeerList />
      </div>
    )
  }
}
