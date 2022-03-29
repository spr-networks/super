import React, { useContext } from 'react'
import { getDNSBlocklists, updateDNSBlocklist, deleteDNSBlocklist } from "components/Helpers/Api.js"
import DNSAddBlocklist from "components/DNS/DNSAddBlocklist.js"
import Switch from "react-bootstrap-switch";
import { APIErrorContext } from 'layouts/Admin.js'

// reactstrap components
import {
  Button,
  ButtonGroup,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Dropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  Label,
  FormGroup,
  Input,
  Table,
  Row,
  Col,
  Modal,
  UncontrolledDropdown,
  UncontrolledTooltip,
} from "reactstrap";

export default class DNSBlocklist extends React.Component {
  static contextType = APIErrorContext;
  state = { list: [], modal: false };

  constructor(props) {
    super(props)

    this.state.list = []
    this.state.modal = false

    this.handleItemSwitch = this.handleItemSwitch.bind(this);
    this.deleteListItem = this.deleteListItem.bind(this);
    this.notifyChange = this.notifyChange.bind(this);
  }

  async componentDidMount() {
    this.refreshBlocklists()
  }

  async refreshBlocklists() {
    try {
      const list = await getDNSBlocklists()
      this.setState({list})
    } catch(error) {
      this.context.reportError("API Failure: " + error.message)
    }
  }

  async notifyChange(type) {
    this.refreshBlocklists()
    this.props.notifyChange(type)
    this.setState({modal: false})
  }

  async handleItemSwitch(item, value) {
    item.Enabled = value
    const list = this.state.list.map(_item => {
      if (_item.URI == item.URI) {
        _item.Enabled = item.Enabled
      }

      return _item
    })

    this.setState({list})

    try {
      await updateDNSBlocklist(item)
    } catch(error) {
      this.context.reportError("API Failure: " + error.message)
    }

    this.notifyChange('blocklists')
  }

  async deleteListItem(item) {
    try {
      await deleteDNSBlocklist(item)
    } catch(error) {
      this.context.reportError("API Failure: " + error.message)
    }

    this.notifyChange('blocklists')
  }

  render() {
    const title = this.props.title || 'DNS blocklists'
    const toggleStatusModal = () => alert('TODO: show modal with blocked domains')

		const toggleBlocklistModal = (modal) => {
			if (modal !== false) {
				modal = !this.state.modal
			}

			this.setState({modal})
		}

    return (
      <>
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
						<DNSAddBlocklist notifyChange={this.notifyChange} />
					</div>
					<div className="modal-footer">
					</div>
				</Modal>

        <Card>
          <CardHeader>
            <Button className="pull-right btn-round" color="primary" outline onClick={toggleBlocklistModal}>
              <i className="fa fa-plus" /> add
            </Button>

            <CardTitle tag="h4">{title}</CardTitle>
          </CardHeader>
          <CardBody>
            <Table responsive>
              <thead className="text-primary">
                <tr>
                  <th>URI</th>
                  <th className="text-center">Enabled</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {
                  this.state.list.map(item => (
                    <tr key={item.URI}>
                      <td>{item.URI}</td>
                      <td className="text-center">
                        <Switch
                          onChange={(el, value) => this.handleItemSwitch(item, value)}
                          name={item.URI}
                          value={item.Enabled}
                          onColor="info"
                          offColor="info"
                        />
                      </td>
                      <td className="text-center">
                        {/*<Button className="btn-round" size="sm" color="primary" outline onClick={toggleStatusModal}><i className="fa fa-list" /> status</Button>*/}
                        <Button
                          className="btn-icon"
                          color="danger"
                          size="sm"
                          type="button"
                          onClick={(e) => this.deleteListItem(item)}>
                          <i className="fa fa-times" />
                        </Button>
                    </td>
                    </tr>
                  ))
                }
              </tbody>
            </Table>
          </CardBody>
        </Card>
      </>
    )
  }
}
