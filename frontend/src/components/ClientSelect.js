import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { deviceAPI } from 'api/Device'

import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faCaretDown, faCaretUp } from '@fortawesome/free-solid-svg-icons'

import { Button, IconButton, Icon, Input, Menu } from 'native-base'

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

ClientSelect.propTypes = {
  isMultiple: PropTypes.bool,
  value: PropTypes.oneOfType([PropTypes.array, PropTypes.string]),
  onChange: PropTypes.func
}
