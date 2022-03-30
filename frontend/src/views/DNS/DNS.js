import React, { Component, useContext } from "react"
import { getDNSConfig, getDNSBlocklists, updateDNSBlocklist, deleteDNSBlocklist } from "components/Helpers/Api.js"
import DNSBlocklist from "components/DNS/DNSBlocklist.js"
import DNSOverrideList from "components/DNS/DNSOverrideList.js"
import { APIErrorContext } from 'layouts/Admin.js'

import {
  Row,
  Col,
} from "reactstrap";

export default class DNS extends Component {
  state = { config: "", PermitDomains: [], BlockDomains: [], blocklists: [] };
  static contextType = APIErrorContext;

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
      let config = await getDNSConfig()

      this.setState({BlockDomains: config.BlockDomains})
      this.setState({PermitDomains: config.PermitDomains})
    } catch (error) {
      this.context.reportError("API Failure: " + error.message)
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

    const toggleBlockedModal = () => alert('TODO: show modal to add')
    const togglePermittedModal = () => alert('TODO: show modal to add')
      
    return (
      <div className="content">
				<Row>
          <Col md="12">
            <DNSBlocklist />
          </Col>
        </Row>
				<Row>
          <Col md="12">
            <DNSOverrideList key={generatedID+1} list={this.state.BlockDomains} title="Override: Blocked domains" notifyChange={notifyChange} toggleModal={toggleBlockedModal} />
            <DNSOverrideList key={generatedID+2} list={this.state.PermitDomains} title="Override: Permitted domains" notifyChange={notifyChange} toggleModal={togglePermittedModal} />
          </Col>
        </Row>
      </div>
    );

  }
}
