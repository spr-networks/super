import React, { Component, useContext } from 'react'
import DNSBlocklist from 'components/DNS/DNSBlocklist'
import DNSOverrideList from 'components/DNS/DNSOverrideList'
import { APIErrorContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'
import PluginDisabled from 'views/PluginDisabled'

import { Row, Col } from 'reactstrap'

export default class DNSBlock extends Component {
  state = { enabled: true, PermitDomains: [], BlockDomains: [] }
  static contextType = APIErrorContext

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
        this.context.reportError('API Failure: ' + error.message)
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
      <div className="content">
        <Row>
          <Col md="12">
            <DNSBlocklist />
          </Col>
        </Row>
        <Row>
          <Col md="12">
            <DNSOverrideList
              key={generatedID + 1}
              list={this.state.BlockDomains}
              title="Blocked Domain Override"
              notifyChange={notifyChange}
            />
            <DNSOverrideList
              key={generatedID + 2}
              list={this.state.PermitDomains}
              title="Allow Domain Override"
              notifyChange={notifyChange}
            />
          </Col>
        </Row>
      </div>
    )
  }
}
