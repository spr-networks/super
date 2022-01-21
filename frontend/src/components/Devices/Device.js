import { Component } from "react";
import { zoneDescriptions, delPSK, delZone, addZone } from "components/Helpers/Api.js";
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
    tags: []
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
    device.Zones.forEach( (zone) => zones.push(
      <Button key={zone} color="default"> {zone} </Button>
    ))

    this.setState({tags: device.Zones})
    this.handleTags = this.handleTags.bind(this);
  }


  handleTags(tags) {
      tags = [...new Set(tags)]
      let device = this.props.device;
      for (let tag of tags) {
        if (device.Zones.indexOf(tag) == -1) {
          //add new tag
          addZone(tag, device.Mac, device.Comment)
        }
      }

      for (let tag of device.Zones) {
        if (tags.indexOf(tag) == -1) {
          console.log("found tag to remove")
          //remove this tag
          delZone(tag, device.Mac, device.Comment)
        }
      }

      this.props.notifyChange()

      this.setState({tags: tags});
  }

  render() {
    const device = this.props.device;
    const generatedID = Math.random().toString(36).substr(2, 9);

    let wifi_type = "N/A"
    if (device.PskType == "sae") {
      wifi_type = "WPA3"
    } else if (device.PskType == "wpa2") {
      wifi_type = "WPA2"
    }


    const deleteDevice = (e) => {
      if (wifi_type !== "N/A") {
        if (device.Mac === "") {
          delPSK("pending")
        }
        else {
          delPSK(device.Mac)
        }
      }
      //make a call for each zone
      for (let zone of device.Zones) {
        delZone(zone, device.Mac)
      }

      this.props.notifyChange()
    }

    const editDevice = (e) => {
    }

    return (
      <tr>
        <td className="text-center"> {device.Mac } </td>
        <td> {device.Comment } </td>
        <td> { wifi_type } </td>
        <td>
          <TagsInput
            inputProps={{placeholder:"Add zone"}}
            value={this.state.tags}
            onChange={this.handleTags}
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
            onClick={deleteDevice}
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
