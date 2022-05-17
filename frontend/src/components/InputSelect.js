import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { deviceAPI } from 'api/Device'

import { FontAwesomeIcon } from 'FontAwesomeUtils'
import { faCaretDown, faCaretUp } from '@fortawesome/free-solid-svg-icons'

import { Button, IconButton, Icon, Input, Menu } from 'native-base'

const SelectMenu = (props) => {
  const { value, onChange, isMultiple, trigger } = props

  const [list, setList] = useState([])

  useEffect(() => {
    setList(props.list)
  }, [props.list])

  const type = isMultiple ? 'checkbox' : 'radio'
  const title = props.title || ''
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

  let closeOnSelect = !isMultiple

  return (
    <Menu w="190" closeOnSelect={closeOnSelect} trigger={trigger}>
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

const InputSelect = (props) => {
  const { onChange, isMultiple } = props
  const [isOpen, setIsOpen] = useState(false)
  const [value, setValue] = useState('')

  let title = props.title,
    list = props.options

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
    <SelectMenu
      onChange={handleChange}
      list={list}
      value={value}
      isMultiple={isMultiple}
      title={title}
      trigger={(triggerProps) => {
        return (
          <IconButton
            size="xs"
            rounded="none"
            w="12"
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

  const isDisabled =
    props.isDisabled !== undefined ? props.isDisabled : isMultiple

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

export default React.memo(InputSelect)

InputSelect.propTypes = {
  isDisabled: PropTypes.bool,
  isMultiple: PropTypes.bool,
  title: PropTypes.string,
  options: PropTypes.array,
  value: PropTypes.oneOfType([PropTypes.array, PropTypes.string]),
  onChange: PropTypes.func
}
