import React, { Component, useContext } from "react"
import { getDNSConfig, getDNSBlocklists, updateDNSBlocklist, deleteDNSBlocklist } from "components/Helpers/Api.js"
import DNSBlocklist from "components/DNS/DNSBlocklist.js"
import DNSAddBlocklist from "components/DNS/DNSAddBlocklist.js"
import DNSOverrideList from "components/DNS/DNSOverrideList.js"
import { APIErrorContext } from 'layouts/Admin.js'

import {
  Row,
  Col,
	Button,
  Card, CardHeader, CardBody,
  Modal
} from "reactstrap";

export default class DNS extends Component {
  state = { config: "", PermitDomains: [], BlockDomains: [], blocklists: [], modal: false };
  static contextType = APIErrorContext;

  constructor(props) {
    super(props)
		this.state.modal = false
    this.state.BlockDomains = []
    this.state.PermitDomains = []
  }

  async componentDidMount() {
    await this.refreshBlocklists()
    await this.refreshConfig()
  }

  async refreshConfig() {
    let config = await getDNSConfig().catch((error) => {
      this.context.reportError("API Failure: " + error.message)
    })

    this.setState({BlockDomains: config.BlockDomains})
    this.setState({PermitDomains: config.PermitDomains})
  }

  async refreshBlocklists() {
    const blocklists = await getDNSBlocklists().catch((error) => {
      this.context.reportError("API Failure: " + error.message)
    })

    this.setState({blocklists})
  }

  render() {
    const generatedID = Math.random().toString(36).substr(2, 9)

		const toggleBlocklistModal = (modal) => {
			if (modal !== false) {
				modal = !this.state.modal
			}

			this.setState({modal})
		}

    const notifyChange = async (type) => {
      if (type == 'config') {
        await this.refreshConfig()
        return
      }

			await this.refreshBlocklists()

      // make sure to close the modal when fetching new data
			toggleBlocklistModal(false)
		}

    const toggleBlockedModal = () => alert('TODO: show modal to add')
    const togglePermittedModal = () => alert('TODO: show modal to add')
      
    return (
      <div className="content">

				<Modal fade={false} isOpen={this.state.modal} toggle={toggleBlocklistModal}>
					<div className="modal-header">
						<button
							aria-label="Close"
							className="close"
							data-dismiss="modal"
							type="button"
							onClick={toggleBlocklistModal}
							>
							<i className="nc-icon nc-simple-remove" />
						</button>
						<h5 className="modal-title">Add DNS Blocklist</h5>
					</div>
					<div className="modal-body">
						<DNSAddBlocklist notifyChange={notifyChange} />
					</div>
					<div className="modal-footer">
					</div>
				</Modal>

				<Row>
          <Col md="12">
            <DNSBlocklist key={generatedID} blocklists={this.state.blocklists} notifyChange={notifyChange} toggleModal={toggleBlocklistModal} title="DNS blocklists" />
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
