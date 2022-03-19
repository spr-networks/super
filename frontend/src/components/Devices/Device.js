import { Component } from "react";
import { zoneDescriptions, delPSK, delZone, addZone, updateDevice } from "components/Helpers/Api.js";
import {APIErrorContext} from 'layouts/Admin.js';
import {
  Button,
  ButtonGroup,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Input,
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
    editing: false,
    comment: '',
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
    this.setState({comment: device.Comment})
  }

  handleTags = (tags) => {
    tags = [...new Set(tags)]
    this.setState({editing: true})
    this.setState({tags})
  }

  handleComment = (e) => {
    //const name = e.target.name
    const comment = e.target.value
    this.setState({comment})
    let editing = (comment != this.props.device.Comment)
    this.setState({editing})
  }

  static contextType = APIErrorContext;

  render() {
    const device = this.props.device
    const generatedID = Math.random().toString(36).substr(2, 9)

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

    const saveDevice = async () => {
      let tags = this.state.tags
      let tagsAdded = tags.filter(tag => !device.Zones.includes(tag))
      let tagsRemoved = device.Zones.filter(tag => !tags.includes(tag))

      // update tags (if we add POST /device/mac with Zones we can save them there)
      for (let tag of tagsAdded) {
        await addZone(tag, device.Mac, device.Comment)
      }

      for (let tag of tagsRemoved) {
        await delZone(tag, device.Mac, device.Comment)
      }

      // update device
      let _device = {}
      _device.Mac = device.Mac
      _device.PskType = device.PskType
      _device.Comment = this.state.comment
      _device.Zones = this.state.tags

      try {
        await updateDevice(_device)
      } catch(error) {
        this.context.reportError("[API] updateDevice error: " + error.message)
      }

      this.props.notifyChange() // will set editing false
    }

    const handleKeyPress = (e) => {
      if (e.charCode == 13) {
        this.setState({editing: false})
        saveDevice()
      }
    }

    return (
      <tr>
        <td className="text-center"> {device.Mac} </td>
        <td> <Input type="text" placeholder="Device name" name="comment" className={this.state.editing ? "border-info" : "border-light" } value={this.state.comment} onChange={this.handleComment} onKeyPress={handleKeyPress} /> </td>
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
            className={"btn " + (this.state.editing ? "d-inline" : "d-none")}
            color="success"
            id={"tooltip" + generatedID}
            size="sm"
            type="button"
            onClick={saveDevice}
          >
            <i className="fa fa-edit" /> Save 
          </Button>{" "}
          {/*<UncontrolledTooltip
            delay={0}
            target={"tooltip" + (generatedID)}
          >
           Edit
           </UncontrolledTooltip>*/}
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
