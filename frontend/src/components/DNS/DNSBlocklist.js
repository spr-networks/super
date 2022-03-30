import React, { useContext, useRef } from 'react'
import { getDNSBlocklists, updateDNSBlocklist, deleteDNSBlocklist } from "components/Helpers/Api.js"
import DNSAddBlocklist from "components/DNS/DNSAddBlocklist.js"
import ModalForm from "components/ModalForm.js"
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
  state = { list: [] };

  constructor(props) {
    super(props)

    this.state.list = []

    this.handleItemSwitch = this.handleItemSwitch.bind(this);
    this.deleteListItem = this.deleteListItem.bind(this);
    this.notifyChange = this.notifyChange.bind(this);

		this.refAddBlocklistModal = React.createRef()
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
    await this.refreshBlocklists()
    //this.props.notifyChange(type)
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
    const toggleStatusModal = () => alert('TODO: show modal with blocked domains')

		const notifyChangeBlocklist = async () => {
			await this.notifyChange()
			// close modal when added
			this.refAddBlocklistModal.current.close()
		}

    return (
      <>

        <Card>
          <CardHeader>

						<ModalForm title="Add DNS Blocklist" triggerText="add" triggerClass="pull-right" triggerIcon="fa fa-plus" refAddBlocklistModal={this.refAddBlocklistModal}>
							<DNSAddBlocklist notifyChange={notifyChangeBlocklist} />
						</ModalForm>

            <CardTitle tag="h4">DNS Blocklists</CardTitle>
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
