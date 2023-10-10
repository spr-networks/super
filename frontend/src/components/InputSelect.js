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
    if (!props.groups?.length) {
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
    <Menu w={200} maxH={360} closeOnSelect={closeOnSelect} trigger={trigger}>
      {groups.map((group) => (
        <Menu.OptionGroup
          key={group.title}
          defaultValue={defaultValue}
          type={type}
          title={group.title}
          onChange={handleChange}
        >
          {group.options?.map((item, idx) => (
            <Menu.ItemOption key={group.title + idx} value={item.value}>
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
  const [value, setValue] = useState(props.value)

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

  const onSubmitEditing = (event) => {
    if (props.onSubmitEditing) {
      let value = event.target.value
      props.onSubmitEditing(value)
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

  const displayValue = (value) => {
    if (typeof value == 'string') {
      return value
    }

    if (typeof value != 'object' || Array.isArray(value)) {
      return value
    }

    let keys = ['Identity', 'SrcIP', 'Group', 'Tag', 'Endpoint']
    for (let k of keys) {
      if (typeof value[k] == 'string' && value[k].length) {
        return value[k]
      }
    }

    return JSON.stringify(value)
  }

  return (
    <>
      <Input
        size="md"
        variant="underlined"
        isDisabled={isDisabled}
        placeholder={title || ''}
        value={displayValue(value)}
        onChangeText={handleChangeText}
        onSubmitEditing={onSubmitEditing}
        InputRightElement={elem}
      />
    </>
  )
}

export default InputSelect //React.memo(InputSelect)

export { InputSelect, SelectMenu }

InputSelect.propTypes = {
  isDisabled: PropTypes.bool,
  isMultiple: PropTypes.bool,
  title: PropTypes.string,
  options: PropTypes.array,
  value: PropTypes.oneOfType([
    PropTypes.object,
    PropTypes.array,
    PropTypes.string
  ]),
  onChange: PropTypes.func
}
