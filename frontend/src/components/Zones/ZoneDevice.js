import { Component } from 'react'

export default class ZoneDevice extends Component {

  state = {
    zones: []
  }


  async componentDidMount() {

    const setState = (v) => {
      this.setState(v)
    }
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
