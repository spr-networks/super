import { Component } from 'react'
import Select from 'react-select'
import CreatableSelect from 'react-select/creatable'
import { deviceAPI } from 'api/Device'

export default class ClientSelect extends Component {
  state = { options: [], value: null }

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
  }

  handleChange(newValue, actionMeta) {
    //actionMeta == select-option|create-option|clear
    this.setState({value: newValue})
    this.props.onChange(newValue, actionMeta)
  }

  async componentDidMount() {
    let devices = []
    try {
      devices = await deviceAPI.list()
    } catch(error) {
      throw(error)
    }

    // devices => options
    let options = Object.values(devices)
      .filter(d => d.RecentIP.length)
      .map(d => {return {label: `${d.RecentIP} ${d.Name}`, value: d.RecentIP}})

    if (!this.props.isMulti) {
      options = [{label: "All clients", value: "*"}].concat(options)
    }

    this.setState({options})

    // set default value
    if (this.props.value) {
      let defaultValues = Array.isArray(this.props.value) ? 
        this.props.value : [this.props.value]

      let value = []
      for (let o of options) {
        if (defaultValues.includes(o.value)) {
          value.push(o)
        }
      }

      this.setState({value})
    } else if (!this.props.isMulti) {
      this.setState({value: {label: "All Clients", value: "*"}})
    }
  }

  render() {
    let isMulti = this.props.isMulti !== undefined ? this.props.isMulti : false
    let canAdd = this.props.canAdd !== undefined ? this.props.canAdd : false

    if (canAdd) {
      return (
        <CreatableSelect
          isClearable
          isMulti={isMulti}
          onChange={this.handleChange}
          options={this.state.options}
          placeholder="Select or add new IP"
          value={this.state.value}
        />
      )
    }

    return (
      <Select
        isMulti={isMulti}
        onChange={this.handleChange}
        options={this.state.options}
        placeholder="Select Client IP"
        value={this.state.value}
      />
    )

  }
}