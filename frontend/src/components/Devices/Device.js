import { Component } from 'react'
import { APIErrorContext } from 'layouts/Admin'
import { deviceAPI } from 'api/Device'
import {
  Badge,
  Button,
  ButtonGroup,
  Input,
  UncontrolledTooltip
} from 'reactstrap'
import CreatableSelect from 'react-select/creatable'
import TagsInput from 'react-tagsinput'

export default class Device extends Component {
  state = {
    editing: false,
    name: '',
    zones: [],
    tags: [],
    allTags: [
      { label: 'private', value: 'private' },
      { label: 'foo', value: 'foo' },
      { label: 'dns', value: 'dns' },
      { label: 'lan', value: 'lan' },
      { label: 'wan', value: 'wan' }
    ]
  }

  async componentDidMount() {
    const setState = (v) => {
      this.setState(v)
    }

    const device = this.props.device

    this.setState({
      zones: device.Zones,
      name: device.Name,
      tags: device.DeviceTags
    })
  }

  handleZones = (zones) => {
    zones = [...new Set(zones)]
    this.setState({ zones })

    deviceAPI
      .updateZones(this.props.device.MAC, zones)
      .catch((error) =>
        this.context.reportError('[API] updateDevice error: ' + error.message)
      )
  }

  handleChangeTags = (tags) => {
    this.setState({ tags })
  }

  handleTags = (tags) => {
    tags = [...new Set(tags)]
    this.setState({ tags })

    deviceAPI
      .updateTags(this.props.device.MAC, tags)
      .catch((error) =>
        this.context.reportError('[API] updateDevice error: ' + error.message)
      )
  }

  handleName = (e) => {
    //const name = e.target.name
    const name = e.target.value
    this.setState({ name })
    let editing = name != this.props.device.Name
    this.setState({ editing })
  }

  static contextType = APIErrorContext

  render() {
    const device = this.props.device
    const generatedID = Math.random().toString(36).substr(2, 9)

    let protocolAuth = { sae: 'WPA3', wpa2: 'WPA2' }
    let wifi_type = protocolAuth[device.PSKEntry.Type] || 'N/A'

    const removeDevice = (e) => {
      let id = device.MAC || 'pending'

      deviceAPI
        .deleteDevice(id)
        .then(this.props.notifyChange)
        .catch((error) =>
          this.context.reportError('[API] deleteDevice error: ' + error.message)
        )
    }

    const saveDevice = async () => {
      if (this.state.name != '') {
        deviceAPI
          .updateName(this.props.device.MAC, this.state.name)
          .then(this.props.notifyChange)
          .catch((error) =>
            this.context.reportError('[API] updateName error: ' + error.message)
          )
      }
    }

    const handleKeyPress = (e) => {
      if (e.charCode == 13) {
        this.setState({ editing: false })
        saveDevice()
      }
    }

    if (false) {
      return (
        <tr>
          <td>{this.state.name}</td>
          <td className="text-center">
            <div>{device.RecentIP}</div>
            <div className="text-muted">
              <small>{device.MAC}</small>
            </div>
          </td>
          {/*<td className="d-none d-md-table-cell"> {device.RecentIP} </td>*/}
          <td>{wifi_type}</td>
          <td>
            {this.state.zones.map((zone) => (
              <Badge color="default">{zone}</Badge>
            ))}
          </td>
          <td>
            {this.state.tags.map((tag) => (
              <Badge color="default">{tag}</Badge>
            ))}
          </td>
          <td className="text-right">
            <Button className="btn-icon" color="warning" size="sm">
              <i className="fa fa-edit" />
            </Button>
            <Button
              className="btn-icon"
              color="danger"
              id={'tooltip' + (generatedID + 1)}
              size="sm"
              onClick={removeDevice}
            >
              <i className="fa fa-times" />
            </Button>
          </td>
        </tr>
      )
    }

    return (
      <tr>
        <td>
          <Input
            type="text"
            placeholder="Device name"
            name="name"
            className={this.state.editing ? 'border-info' : 'border-light'}
            value={this.state.name}
            onChange={this.handleName}
            onKeyPress={handleKeyPress}
            size="10"
          />
        </td>
        <td className="text-center">
          <div>{device.RecentIP}</div>
          <div className="text-muted">
            <small>{device.MAC}</small>
          </div>
        </td>

        <td> {wifi_type} </td>
        <td>
          {/*<CreatableSelect
            isClearable
            isMulti
            onChange={this.handleChangeTags}
            options={this.state.allTags}
            placeholder="Zones"
            defaultValue={this.state.allTags.slice(2, 5)}
          />*/}
          <TagsInput
            inputProps={{ placeholder: 'Add zone' }}
            value={this.state.zones}
            onChange={this.handleZones}
            tagProps={{ className: 'react-tagsinput-tag' }}
          />
        </td>
        <td>
          {/*<CreatableSelect
            isClearable
            isMulti
            onChange={this.handleChangeTags}
            options={this.state.allTags}
            placeholder="Tags"
            defaultValue={this.state.allTags[0]}
          />*/}
          <TagsInput
            inputProps={{ placeholder: 'Add tag' }}
            value={this.state.tags}
            onChange={this.handleTags}
            tagProps={{ className: 'react-tagsinput-tag' }}
          />
        </td>
        <td className="text-right">
          <Button
            className="btn-icon"
            color="danger"
            id={'tooltip' + (generatedID + 1)}
            size="sm"
            onClick={removeDevice}
          >
            <i className="fa fa-times" />
          </Button>
          <UncontrolledTooltip delay={0} target={'tooltip' + (generatedID + 1)}>
            Delete
          </UncontrolledTooltip>
        </td>
      </tr>
    )
  }
}
