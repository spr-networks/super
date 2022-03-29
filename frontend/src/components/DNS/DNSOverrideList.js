import React, { useContext } from 'react'
import { updateDNSOverride, deleteDNSOverride } from "components/Helpers/Api.js"
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
  UncontrolledDropdown,
  UncontrolledTooltip,
} from "reactstrap";

export default class DNSOverrideList extends React.Component {
  static contextType = APIErrorContext;
  state = { list: [] };

  constructor(props) {
    super(props)

    this.state.list = props.list

    //this.handleItemSwitch = this.handleItemSwitch.bind(this);
    //this.deleteListItem = this.deleteListItem.bind(this);
  }

  /*
  async handleItemSwitch(item, value) {
    item.Enabled = value
    const list = this.state.list.map(_item => {
      if (_item.URI == item.URI) {
        _item.Enabled = item.Enabled
      }

      return _item
    })

    this.setState({list})
    await updateDNSBlocklist(item)
    this.props.notifyChange()
  }
  */

  async deleteListItem(item) {
    await deleteDNSOverride(item)
    this.props.notifyChange('config')
  }

  render() {
    const title = this.props.title || 'DNS Override'

    return (
      <Card>
        <CardHeader>
          <Button className="pull-right btn-round" color="primary" outline onClick={this.props.toggleModal}>
            <i className="fa fa-plus" /> add
          </Button>

          <CardTitle tag="h4">{title}</CardTitle>
          <p className="card-category">Blocked & Permitted lists allow you to control domain name replies per Client IP. Read more <a href="#">here</a></p>
        </CardHeader>
        <CardBody>
          <Table responsive>
            <thead className="text-primary">
              <tr>
                <th>Domain</th>
                <th>Result IP</th>
                <th>Client IP</th>
                <th className="text-center">Expiration</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {
                this.state.list.map(item => (
                  <tr key={item.Domain}>
                    <td>{item.Domain}</td>
                    <td>{item.ResultIP}</td>
                    <td>{item.ClientIP}</td>
                    <td className="text-center">{item.Expiration}</td>
                    <td className="text-center">
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
    )
  }
}
