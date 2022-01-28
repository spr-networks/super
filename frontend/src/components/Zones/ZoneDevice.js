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


export default class ZoneDevice extends Component {

  state = {
    tags: []
  }


  async componentDidMount() {

    const setState = (v) => {
      this.setState(v)
    }

    const device = this.props.device;
    //const generatedID = Math.random().toString(36).substr(2, 9);

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

    return (
        <tr>
          <td className=""> {device.Comment} </td>
          <td className=""> {device.Mac }</td>
          <td className=""> {device.IP } </td>
          <td className=""> {device.ifname } </td>
        </tr>
    )
  }
}
