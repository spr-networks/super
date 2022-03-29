import React, { Component, useContext } from "react"
import { getDNSBlocklists, updateDNSBlocklist, deleteDNSBlocklist } from "components/Helpers/Api.js"
import DNSBlockList from "components/DNS/DNSBlockList.js"
import DNSAddBlockList from "components/DNS/DNSAddBlockList.js"
import { APIErrorContext } from 'layouts/Admin.js'

import {
  Row,
  Col,
	Button,
  Modal
} from "reactstrap";

export default class DNS extends Component {
  state = { list: [], modal: false };
  static contextType = APIErrorContext;

  constructor(props) {
    super(props)
		this.state.modal = false
  }

  async componentDidMount() {
    await this.refreshBlocklists()
  }

  async refreshBlocklists() {
    const list = await getDNSBlocklists().catch((error) => {
      this.context.reportError("API Failure: " + error.message)
    })

    this.setState({list})
  }

  render() {
    const generatedID = Math.random().toString(36).substr(2, 9)

		const toggleModal = (modal) => {
			if (modal !== false) {
				modal = !this.state.modal
			}

			this.setState({modal})
		}

    const notifyChange = async (type) => {
			await this.refreshBlocklists()

			toggleModal(false)
		}
      
    return (
      <div className="content">

				<Modal fade={false} isOpen={this.state.modal} toggle={toggleModal}>
					<div className="modal-header">
						<button
							aria-label="Close"
							className="close"
							data-dismiss="modal"
							type="button"
							onClick={toggleModal}
							>
							<i className="nc-icon nc-simple-remove" />
						</button>
						<h5 className="modal-title">Add DNS Blocklist</h5>
					</div>
					<div className="modal-body">
						<DNSAddBlockList notifyChange={notifyChange} />
					</div>
					<div className="modal-footer">
					</div>
				</Modal>

				<Row>
          <Col md="12">
            <DNSBlockList key={generatedID} list={this.state.list} notifyChange={notifyChange} toggleModal={toggleModal} title="DNS blocklists" />
          </Col>
        </Row>
      </div>
    );

  }
}
