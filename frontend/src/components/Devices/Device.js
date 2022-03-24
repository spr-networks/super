import { Component } from "react";
import { zoneDescriptions, deleteDevice, updateDeviceZones } from "components/Helpers/Api.js";
import {
  Button,
  ButtonGroup,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Label,
  Table,
  Row,
  Col,
  UncontrolledTooltip,
} from "reactstrap";
import Select from "react-select";
import TagsInput from 'react-tagsinput';


export default class Device extends Component {

  state = {
    zones: []
  }


  async componentDidMount() {

    const setState = (v) => {
      this.setState(v)
    }

    const device = this.props.device;
    const generatedID = Math.random().toString(36).substr(2, 9);

    let wifi_type = "N/A"
    if (device.PskType == "sae") {
      wifi_type = "WPA3"
    } else if (device.PskType == "wpa2") {
      wifi_type = "WPA2"
    }


    let zones = []
    console.log(device.Zones)
    device.Zones.forEach( (zone) => zones.push(
      <Button key={zone} color="default"> {zone} </Button>
    ))

    this.setState({zones: device.Zones})
    this.handleZones = this.handleZones.bind(this);
  }


  handleZones(zones) {
      zones = [...new Set(zones)]
      let device = this.props.device;

      updateDeviceZones(device.MAC, zones)

      this.props.notifyChange()

      this.setState({zones: zones});
  }

  render() {
    const device = this.props.device;
    const generatedID = Math.random().toString(36).substr(2, 9);

    let wifi_type = "N/A"
    if (device.PSKEntry.Type == "sae") {
      wifi_type = "WPA3"
    } else if (device.PSKEntry.Type == "wpa2") {
      wifi_type = "WPA2"
    }


    const removeDevice = (e) => {
      deleteDevice(device.MAC)
      this.props.notifyChange()
    }

    const editDevice = (e) => {
    }

    return (
      <tr>
        <td className="text-center"> {device.MAC } </td>
        <td> {device.Name } </td>
        <td> { wifi_type } </td>
        <td>
          <TagsInput
            inputProps={{placeholder:"Add zone"}}
            value={this.state.zones}
            onChange={this.handleZones}
            tagProps={{className: 'react-tagsinput-tag' }}
          />
        </td>
        <td className="text-right">
          <Button
            className="btn-icon"
            color="success"
            id={"tooltip" + generatedID}
            size="sm"
            type="button"
            onClick={editDevice}
          >
            <i className="fa fa-edit" />
          </Button>{" "}
          <UncontrolledTooltip
            delay={0}
            target={"tooltip" + (generatedID)}
          >
           Edit
           </UncontrolledTooltip>
          <Button
            className="btn-icon"
            color="danger"
            id={"tooltip" + (generatedID+1)}
            size="sm"
            type="button"
            onClick={removeDevice}
          >
            <i className="fa fa-times" />
          </Button>{" "}
          <UncontrolledTooltip
            delay={0}
            target={"tooltip" + (generatedID+1)}
          >
            Delete
          </UncontrolledTooltip>
        </td>
      </tr>
    )
  }
}
