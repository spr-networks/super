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
    const device = this.props.device

    return (
      <tr>
        <td>{device.Name}</td>
        <td>{device.MAC}</td>
        <td>{device.IP}</td>
        <td>{device.ifname}</td>
      </tr>
    )
  }
}
