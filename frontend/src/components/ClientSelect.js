import { Component } from 'react'
import PropTypes from 'prop-types'
import Select from 'react-select'
import CreatableSelect from 'react-select/creatable'
import { deviceAPI } from 'api/Device'

class ClientSelect extends Component {
  state = { options: [], value: null }

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
  }

  handleChange(newValue, actionMeta) {
    //actionMeta == select-option|create-option|clear
    this.setState({ value: newValue })
    if (actionMeta == 'create-option') {
      this.setState({
        options: this.state.options.concat({ label: newValue, value: newValue })
      })
    }
    this.props.onChange(newValue, actionMeta)
  }

  updateValue(newValue) {
    let defaultValues = Array.isArray(newValue) ? newValue : [newValue]

    let value = []
    for (let o of this.state.options) {
      if (defaultValues.includes(o.value)) {
        value.push(o)
      }
    }

    this.setState({ value })
  }

  async componentDidMount() {
    let devices = []
    try {
      devices = await deviceAPI.list()
    } catch (error) {
      throw error
    }

    // devices => options
    let options = Object.values(devices)
      .filter((d) => d.RecentIP.length)
      .map((d) => {
        return { label: `${d.RecentIP} ${d.Name}`, value: d.RecentIP }
      })

    if (!this.props.isMulti && !this.props.skipAll) {
      options = [{ label: 'All clients', value: '*' }].concat(options)
    }

    this.setState({ options })

    // set default value
    if (this.props.value) {
      this.updateValue(this.props.value)
    } else if (!this.props.isMulti && !this.props.skipAll) {
      this.setState({ value: { label: 'All Clients', value: '*' } })
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.value != this.props.value) {
      this.updateValue(this.props.value)
    }
  }

  render() {
    let isMulti = this.props.isMulti !== undefined ? this.props.isMulti : false
    let isCreatable =
      this.props.isCreatable !== undefined ? this.props.isCreatable : false

    if (isCreatable) {
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

ClientSelect.propTypes = {
  isMulti: PropTypes.bool,
  isCreatable: PropTypes.bool,
  value: PropTypes.oneOfType([PropTypes.array, PropTypes.string]),
  onChange: PropTypes.func
}

export default ClientSelect
