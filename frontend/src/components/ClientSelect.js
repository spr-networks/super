import { Component, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import Select from 'react-select'
import CreatableSelect from 'react-select/creatable'

import { deviceAPI } from 'api/Device'

import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faCaretDown, faCaretUp } from '@fortawesome/free-solid-svg-icons'

import { Button, IconButton, Icon, Input, Menu } from 'native-base'

class ClientSelectOld extends Component {
  state = { options: [], value: null }

  constructor(props) {
    super(props)

    this.handleChange = this.handleChange.bind(this)
  }

  handleChange(newValue, actionMeta) {
    //actionMeta == select-option|create-option|clear
    this.setState({ value: newValue })
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

ClientSelectOld.propTypes = {
  isMulti: PropTypes.bool,
  isCreatable: PropTypes.bool,
  value: PropTypes.oneOfType([PropTypes.array, PropTypes.string]),
  onChange: PropTypes.func
}

const ClientMenu = (props) => {
  const { value, onChange, isMultiple, trigger } = props

  const [list, setList] = useState([])

  const cleanIp = (ip) => ip.replace(/\/.*/, '') // remove subnet

  // todo cache
  useEffect(() => {
    deviceAPI
      .list()
      .then((devices) => {
        // devices => options
        let options = Object.values(devices)
          .filter((d) => d.RecentIP.length)
          .map((d) => {
            return {
              label: `${d.Name || d.RecentIP}`,
              value: cleanIp(d.RecentIP)
            }
          })

        setList(options)
      })
      .catch((err) => {})
  }, [])

  const type = isMultiple ? 'checkbox' : 'radio'
  const title = type == 'radio' ? 'Select Client' : 'Select Clients'
  const defaultValue = value
    ? isMultiple && !Array.isArray(value)
      ? value.split(',')
      : value
    : ''

  const handleChange = (value) => {
    let newValue = Array.isArray(value) ? value.join(',') : value
    if (onChange) {
      onChange(newValue)
    }
  }

  return (
    <Menu w="190" trigger={trigger}>
      <Menu.OptionGroup
        defaultValue={defaultValue}
        type={type}
        title={title}
        onChange={handleChange}
      >
        {list.map((item) => (
          <Menu.ItemOption key={item.value} value={item.value}>
            {item.label}
          </Menu.ItemOption>
        ))}
      </Menu.OptionGroup>
    </Menu>
  )
}

const ClientSelect = (props) => {
  const { onChange, isMultiple } = props
  const [isOpen, setIsOpen] = useState(false)
  const [value, setValue] = useState('')

  useEffect(() => {
    setValue(props.value)
  }, [props.value])

  const handleChange = (newValue) => {
    setValue(newValue)

    if (onChange) {
      onChange(isMultiple ? newValue.split(',') : newValue)
    }
  }

  const elem = (
    <ClientMenu
      onChange={handleChange}
      value={value}
      isMultiple={isMultiple}
      trigger={(triggerProps) => {
        return (
          <IconButton
            size="xs"
            rounded="none"
            w="1/6"
            h="full"
            onPress={() => setIsOpen(!isOpen)}
            icon={
              <Icon
                as={FontAwesomeIcon}
                icon={isOpen ? faCaretUp : faCaretDown}
              />
            }
            {...triggerProps}
          />
        )
      }}
    />
  )

  const isDisabled = isMultiple

  return (
    <>
      <Input
        size="md"
        variant="underlined"
        isDisabled={isDisabled}
        value={value}
        onChangeText={handleChange}
        InputRightElement={elem}
      />
    </>
  )
}

export default ClientSelect
