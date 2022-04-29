import { Component } from 'react'

export default class GroupDevice extends Component {
  render() {
    const device = this.props.device

    return (
      <tr>
        <td>
          {device.Name}
          {/*device.online !== undefined ? (
            <i
              className={
                device.online
                  ? 'fa fa-circle text-success'
                  : 'fa fa-circle text-warning'
              }
              style={{
                position: 'relative',
                bottom: '0.25ex',
                fontSize: '9px',
                marginLeft: '5px'
              }}
            />
          ) : null*/}
        </td>
        <td>{device.MAC}</td>
        <td>{device.IP}</td>
        <td>{device.ifname}</td>
      </tr>
    )
  }
}
