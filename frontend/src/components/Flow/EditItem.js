import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import {
  Badge,
  BadgeText,
  Pressable,
  Icon,
  Input,
  InputField,
  Menu,
  MenuItem,
  MenuItemLabel,
  AddIcon,
  CircleIcon
} from '@gluestack-ui/themed'

import TimeSelect from '../TimeSelect'
import Tooltip from 'components/Tooltip'
import { Select } from 'components/Select'
import InputSelect from 'components/InputSelect'
import ClientSelect from 'components/ClientSelect'

import { niceDateToArray, dateArrayToStr, flowObjParse } from './Utils'

// token is like variables but for cards
const EditItem = ({
  label,
  value: defaultValue,
  format,
  description,
  onChange,
  ...props
}) => {
  const [value, setValue] = useState('' + defaultValue)
  const [isOpen, setIsOpen] = useState(false)

  let size = props.size || 'xs'
  let options = props.options || [] // for autocomplete

  const tokenProps = {
    action: 'muted',
    variant: 'outline',
    size: 'xs',
    py: '$0',
    px: '$2'
  }

  const displayValue = (value, label) => {
    if (label == 'days') {
      return dateArrayToStr(value)
    }

    if (Array.isArray(value)) {
      return value.join(',')
    }

    if (value == '') {
      if (['Tags', 'Policies', 'Groups'].includes(label)) {
        return `Select ${label}`
      }

      return '*'
    }
    let ret = flowObjParse(value)
    return ret
  }

  // TODO autocomplete for selecting values:
  // groups, policies, clients, ports

  const onChangeText = (value) => {
    //only update if correct format
    if (format !== undefined && !value.match(format)) {
      return
    }

    setValue(value)
    if (onChange) {
      onChange(value)
    }
  }

  // dropdown menu with select multiple
  // TODO if param is PropType.array
  if (['days'].includes(label)) {
    let defaultValue = label == 'days' ? niceDateToArray(value) : value
    let title = `Select ${label}`
    let isMultiple = true
    let inputType = isMultiple ? 'checkbox' : 'radio'

    const handleChange = (values) => {
      if (label == 'days') {
        onChangeText(dateArrayToStr(values))
      } else {
        onChangeText(values)
      }
    }

    // skip popover & use the menu directly
    const trigger = (triggerProps) => (
      <Tooltip label={label}>
        <Pressable {...triggerProps}>
          <Badge {...tokenProps}>
            <BadgeText>{displayValue(value, label)}</BadgeText>
          </Badge>
        </Pressable>
      </Tooltip>
    )

    return (
      <Menu
        trigger={trigger}
        selectionMode={isMultiple ? 'multiple' : 'single'}
        closeOnSelect={!isMultiple}
        selectedKeys={defaultValue}
        onSelectionChange={(e) => {
          let key = e.currentKey
          let [action, day] = key.split(':')
          let values = defaultValue
          if (action == 'add') {
            values.push(day)
          } else {
            values = values.filter((d) => d != day)
          }
          handleChange(values)
        }}
      >
        {options.map((item) => (
          <MenuItem
            key={
              defaultValue.includes(item.value)
                ? `delete:${item.value}`
                : `add:${item.value}`
            }
            textValue={item.value}
          >
            <Icon
              as={defaultValue.includes(item.value) ? CircleIcon : AddIcon}
              mr="$2"
            />
            <MenuItemLabel size="sm">{item.label}</MenuItemLabel>
          </MenuItem>
        ))}
      </Menu>
    )
  }

  let inputElement = (
    <Input variant="outlined">
      <InputField
        defaultValue={value}
        onChangeText={onChangeText}
        onSubmitEditing={() => setIsOpen(false)}
      />
    </Input>
  )

  // time picker
  if (['from', 'to'].includes(label)) {
    const onSelect = (value) => {
      onChangeText(value)
      if (isOpen) {
        //setIsOpen(false) // TODO FIX initial trigger
      }
    }

    inputElement = <TimeSelect value={value} onChange={onSelect} />
  } else if (label == 'Client') {
    inputElement = (
      <ClientSelect
        showPolicies
        showGroups
        showTags
        value={value}
        onSubmitEditing={(value) => {
          onChangeText(value)
          setIsOpen(false)
        }}
        onChange={(value) => {
          onChangeText(value)
          setIsOpen(false)
        }}
      />
    )
  } else if (
    (['Tags', 'Policies', 'Groups', 'DstInterface', 'Container'].includes(
      label
    ) ||
      label.endsWith('Port')) &&
    options
  ) {
    // TODO menu
    // TODO props.options && isMultiple= value == array
    const onSelect = (values) => {
      onChangeText(values)
      setIsOpen(false)
    }

    let isDisabled = false
    let isMultiple = ['Tags', 'Policies', 'Groups'].includes(label)
    inputElement = (
      <InputSelect
        isDisabled={isDisabled}
        isMultiple={isMultiple}
        options={options}
        value={value}
        onChange={onSelect}
        onChangeText={onChangeText}
        onSubmitEditing={() => setIsOpen(false)}
      />
    )
  } else if (['Protocol'].includes(label)) {
    return (
      <Select selectedValue={value} onValueChange={onChangeText}>
        <Select.Item key="tcp" label="tcp" value="tcp" />
        <Select.Item key="udp" label="udp" value="udp" />
      </Select>
    )
  }

  return inputElement
}

EditItem.propTypes = {
  label: PropTypes.string,
  value: PropTypes.any,
  format: PropTypes.any, //instanceOf(RegExp),
  description: PropTypes.string,
  onChange: PropTypes.func
}

export default EditItem
