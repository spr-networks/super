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
  Box,
  MenuItem,
  MenuItemLabel,
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicatorWrapper,
  ActionsheetDragIndicator,
  ActionsheetItem,
  ActionsheetItemText,
  ActionsheetScrollView
} from '@gluestack-ui/themed'

import { ucFirst } from 'utils'
import IconItem from './IconItem'

const prefixValue = (value) => {
  if (value && typeof value == 'object') {
    let prefix = 'group',
      v = 'empty'

    if (value.Tag) {
      prefix = 'tag'
      v = value.Tag
    } else {
      v = value.Group
    }

    value = `${prefix}:${v}`
  }

  return value
}

const prefixToKeyValue = (newValue) => {
  //TODO handle multiple
  //translate tag:t1 to {Tag:"t1"}, group:blah to {Group:"blah"}
  if (typeof newValue == 'string') {
    if (newValue.match(/^(group|tag|policy):/)) {
      let [prefix, v] = newValue.split(':')
      let key = ucFirst(prefix)
      newValue = { [key]: v }
    }
  }
  return newValue
}

const getItemIcon = (item) => {
  //item.value.Tag TagIcon, group= UserIcon -- same as prefix check

  //item.icon is for devices and group icons
  let itemIcon = <></>
  if (item.icon?.length) {
    itemIcon = (
      <IconItem name={item.icon} color={item.color} size={20} mr="$2" />
    )
  } else if (typeof item.icon === 'object') {
    itemIcon = <Icon as={item.icon} mr="$2" size={20} />
  }

  return itemIcon
}

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
    newValue = prefixToKeyValue(newValue)

    if (onChange) {
      onChange(newValue)
    }
  }

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

  const menuItem = (item) => {
    let value = prefixValue(item.value)
    let itemIcon = getItemIcon(item)

    return (
      <MenuItem key={value} textValue={value}>
        {itemIcon}
        <MenuItemLabel size="xs">{item.label}</MenuItemLabel>
      </MenuItem>
    )
  }

  return (
    <>
      <Menu
        trigger={trigger}
        selectionMode="single"
        closeOnSelect={true}
        onSelectionChange={(e) => handleChange(e.currentKey)}
        maxHeight={350}
        overflow="scroll"
      >
        {groups.map((group) => {
          return group.options?.map(menuItem)
        })}
      </Menu>
    </>
  )
}

const ActionSheetMenu = ({
  value,
  onChange,
  isMultiple,
  trigger,
  isOpen,
  setIsOpen,
  ...props
}) => {
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
    newValue = prefixToKeyValue(newValue)
    if (onChange) {
      onChange(newValue)
    }
  }

  const menuItem = (item) => {
    let value = prefixValue(item.value)
    let itemIcon = getItemIcon(item)

    return (
      <ActionsheetItem
        onPress={() => {
          handleChange(item.value)
          setIsOpen(!isOpen)
        }}
      >
        {itemIcon}
        <ActionsheetItemText>{item.label}</ActionsheetItemText>
      </ActionsheetItem>
    )
  }

  return (
    <Box>
      <Button
        size="xs"
        w="$12"
        h="$full"
        variant="link"
        rounded="$none"
        onPress={() => setIsOpen(!isOpen)}
      >
        <ButtonIcon as={isOpen ? ChevronUpIcon : ChevronDownIcon} />
      </Button>
      <Actionsheet
        isOpen={isOpen}
        onClose={() => setIsOpen(!isOpen)}
        zIndex={999}
        useRNModal
      >
        <ActionsheetBackdrop />
        <ActionsheetContent h={'$96'} zIndex={999}>
          <ActionsheetScrollView>
            <ActionsheetDragIndicatorWrapper>
              <ActionsheetDragIndicator />
            </ActionsheetDragIndicatorWrapper>
            {groups.map((group) => {
              return group.options?.map(menuItem)
            })}
          </ActionsheetScrollView>
        </ActionsheetContent>
      </Actionsheet>
    </Box>
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

    if (!isMultiple) {
      setIsOpen(false)
    }

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

  let elem = <SelectMenu onChange={handleChange} value={value} {...menuProps} />

  // NOTE this is better for more items. TODO filter list
  if (menuProps.groups?.[0].options?.length > 6) {
    elem = (
      <ActionSheetMenu
        onChange={handleChange}
        value={value}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        {...menuProps}
      />
    )
  }

  const isDisabled =
    props.isDisabled !== undefined ? props.isDisabled : isMultiple

  const displayValue = (value) => {
    if (typeof value == 'string') {
      return value
    }

    if (typeof value != 'object' || Array.isArray(value)) {
      return value
    }

    let keys = ['Identity', 'SrcIP', 'Group', 'Policy', 'Tag', 'Endpoint']
    for (let k of keys) {
      if (typeof value[k] == 'string' && value[k].length) {
        return value[k]
      }
    }

    return JSON.stringify(value)
  }

  const autoFocus = props.autoFocus || false

  return (
    <>
      <Input size={props.size || 'md'} isDisabled={isDisabled}>
        <InputField
          autoFocus={autoFocus}
          placeholder={title || ''}
          value={displayValue(value)}
          onChangeText={handleChangeText}
          onSubmitEditing={onSubmitEditing}
          size={'sm'}
        />
        <InputSlot>{elem}</InputSlot>
      </Input>
    </>
  )
}

export default InputSelect //React.memo(InputSelect)

export { ActionSheetMenu, InputSelect, SelectMenu }

InputSelect.propTypes = {
  autoFocus: PropTypes.bool,
  isDisabled: PropTypes.bool,
  isMultiple: PropTypes.bool,
  title: PropTypes.string,
  options: PropTypes.array,
  value: PropTypes.oneOfType([
    PropTypes.object,
    PropTypes.array,
    PropTypes.string
  ]),
  onChange: PropTypes.func,
  size: PropTypes.string
}
