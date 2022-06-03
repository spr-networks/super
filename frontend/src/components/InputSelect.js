import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { deviceAPI } from 'api/Device'

import Icon from 'FontAwesomeUtils'
import { faCaretDown, faCaretUp } from '@fortawesome/free-solid-svg-icons'

import { IconButton, Input, Menu } from 'native-base'

const SelectMenu = ({ value, onChange, isMultiple, trigger, ...props }) => {
  const [groups, setGroups] = useState([])

  useEffect(() => {
    setGroups([{ title: props.title || 'Select', options: props.options }])
  }, [props.options])

  useEffect(() => {
    if (!props.groups) {
      return
    }

    setGroups(props.groups)
  }, [props.groups])

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
    <Menu w="190" maxH="90vh" closeOnSelect={closeOnSelect} trigger={trigger}>
      {groups.map((group) => (
        <Menu.OptionGroup
          key={group.title}
          defaultValue={defaultValue}
          type={type}
          title={group.title}
          onChange={handleChange}
        >
          {group.options &&
            group.options.map((item) => (
              <Menu.ItemOption
                key={group.title + item.value}
                value={item.value}
              >
                {item.label}
              </Menu.ItemOption>
            ))}
        </Menu.OptionGroup>
      ))}
    </Menu>
  )
}

const InputSelect = (props) => {
  const { onChange, isMultiple } = props
  const [isOpen, setIsOpen] = useState(false)
  const [value, setValue] = useState(props.value || '')

  let title = props.title

  useEffect(() => {
    setValue(props.value)

    return () => {
      setValue('')
    }
  }, [props.value])

  const handleChangeText = (newValue) => {
    setValue(newValue)

    if (props.onChangeText) {
      props.onChangeText(isMultiple ? newValue.split(',') : newValue)
    }
  }

  const handleChange = (newValue) => {
    setValue(newValue)

    let values = isMultiple ? newValue.split(',') : newValue

    if (onChange) {
      onChange(values)
    }
  }

  let trigger = (triggerProps) => {
    return (
      <IconButton
        size="xs"
        rounded="none"
        w="12"
        h="full"
        onPress={() => setIsOpen(!isOpen)}
        icon={<Icon icon={isOpen ? faCaretUp : faCaretDown} />}
        {...triggerProps}
      />
    )
  }

  if (props.trigger) {
    trigger = props.trigger
  }

  let menuProps = { title, isMultiple, trigger }
  if (props.groups) {
    menuProps.groups = props.groups
  } else {
    menuProps.options = props.options
  }

  const elem = (
    <SelectMenu onChange={handleChange} value={value} {...menuProps} />
  )

  const isDisabled =
    props.isDisabled !== undefined ? props.isDisabled : isMultiple

  return (
    <>
      <Input
        size="md"
        variant="underlined"
        isDisabled={isDisabled}
        defaultValue={value}
        onChangeText={handleChangeText}
        InputRightElement={elem}
      />
    </>
  )
}

export default React.memo(InputSelect)

export { InputSelect, SelectMenu }

InputSelect.propTypes = {
  isDisabled: PropTypes.bool,
  isMultiple: PropTypes.bool,
  title: PropTypes.string,
  options: PropTypes.array,
  value: PropTypes.oneOfType([PropTypes.array, PropTypes.string]),
  onChange: PropTypes.func
}
