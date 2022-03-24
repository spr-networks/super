import { Component } from "react";
import { zoneDescriptions } from "components/Helpers/Api.js";
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


export default class ZoneDevice extends Component {

  state = {
    zones: []
  }


  async componentDidMount() {

    const setState = (v) => {
      this.setState(v)
    }

    const device = this.props.device;
    //const generatedID = Math.random().toString(36).substr(2, 9);

  }


  render() {
    const device = this.props.device;

    return (
        <tr>
          <td className=""> {device.Name} </td>
          <td className=""> {device.MAC }</td>
          <td className=""> {device.IP } </td>
          <td className=""> {device.ifname } </td>
        </tr>
    )
  }
}
