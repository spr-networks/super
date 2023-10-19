import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import {
  Button,
  ButtonIcon,
  Icon,
  Input,
  InputField,
  InputSlot,
  ChevronDownIcon,
  ChevronUpIcon,
  Menu,
  MenuItem,
  MenuItemLabel
} from '@gluestack-ui/themed'
import { LaptopIcon, TagIcon, WifiIcon, UsersIcon } from 'lucide-react-native'
import { ucFirst } from 'utils'

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

    //TODO handle multiple
    //translate tag:t1 to {Tag:"t1"}, group:dns to {Group:"dns"}
    if (typeof newValue == 'string') {
      if (newValue.match(/^(group|tag):/)) {
        let [prefix, v] = newValue.split(':')
        let key = ucFirst(prefix)
        newValue = { [key]: v }
      }
    }

    if (onChange) {
      onChange(newValue)
    }
  }

  let closeOnSelect = !isMultiple

  /*return (
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
  )*/
  if (groups) {
    console.log(JSON.stringify(groups))
  }

  const menuItem = (item) => {
    let value = item.value
    let icon = LaptopIcon
    if (typeof value == 'object') {
      let prefix = 'group',
        v = 'empty'
      icon = UsersIcon //GroupIcon
      if (value.Tag) {
        prefix = 'tag'
        v = value.Tag
        icon = TagIcon
      } else {
        v = value.Group
      }

      value = `${prefix}:${v}`
    }

    return (
      <MenuItem key={value} textValue={value}>
        <Icon as={icon} mr="$2" />
        <MenuItemLabel size="xs">{item.label}</MenuItemLabel>
      </MenuItem>
    )
  }

  return (
    <Menu
      trigger={trigger}
      selectionMode="single"
      onSelectionChange={(e) => handleChange(e.currentKey)}
    >
      {groups.map((group) => {
        return group.options?.map(menuItem)
      })}
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
      <Button
        size="xs"
        w="$12"
        h="$full"
        variant="link"
        rounded="$none"
        onPress={() => setIsOpen(!isOpen)}
        {...triggerProps}
      >
        <ButtonIcon as={isOpen ? ChevronUpIcon : ChevronDownIcon} />
      </Button>
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
      <Input size="md" isDisabled={isDisabled}>
        <InputField
          placeholder={title || ''}
          value={displayValue(value)}
          onChangeText={handleChangeText}
          onSubmitEditing={onSubmitEditing}
        />
        <InputSlot>{elem}</InputSlot>
      </Input>
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
