import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import {
  Button,
  FormControl,
  Input,
  HStack,
  Menu,
  Popover,
  Tooltip,
  useColorModeValue
} from 'native-base'

import TimeSelect from '../TimeSelect'
import InputSelect from 'components/InputSelect'
import ClientSelect from 'components/ClientSelect'

import { niceDateToArray, dateArrayToStr } from './Utils'

// token is like variables but for cards
const Token = ({
  label,
  value: defaultValue,
  format,
  description,
  onChange,
  ...props
}) => {
  const [value, setValue] = useState('' + defaultValue)
  const [isOpen, setIsOpen] = useState(false)

  let size = props.size || 'md'
  let options = props.options || [] // for autocomplete

  const tokenProps = {
    colorScheme: 'light',
    textAlign: 'center',
    rounded: 'md',
    variant: 'outline',
    bg: useColorModeValue('muted.50', 'muted.700'),
    borderColor: useColorModeValue('muted.200', 'muted.600'),
    _text: {
      color: useColorModeValue('muted.600', 'muted.200')
    },
    size,
    py: 0,
    px: 1
  }

  // TODO have different default values. example: Client
  const displayValue = (value, label) => {
    if (label == 'days') {
      return dateArrayToStr(value)
    }

    if (Array.isArray(value)) {
      return value.join(',')
    }

    if (value == '') {
      if (['Tags', 'Groups'].includes(label)) {
        return `Select ${label}`
      }

      return '*'
    }

    return value
  }

  // TODO autocomplete for selecting values:
  // groups, clients, ports

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
    // triggers differ slightly
    const trigger = (triggerProps) => (
      <Tooltip label={label} bg="muted.800" _text={{ color: 'muted.200' }}>
        <Button {...tokenProps} {...triggerProps}>
          {displayValue(value, label)}
        </Button>
      </Tooltip>
    )

    return (
      <Menu w="190" closeOnSelect={!isMultiple} trigger={trigger}>
        <Menu.OptionGroup
          defaultValue={defaultValue}
          type={inputType}
          title={title}
          onChange={handleChange}
        >
          {options.map((item) => (
            <Menu.ItemOption key={item.value} value={item.value}>
              {item.label}
            </Menu.ItemOption>
          ))}
        </Menu.OptionGroup>
      </Menu>
    )
  }

  let inputElement = (
    <Input
      variant="outlined"
      defaultValue={value}
      onChangeText={onChangeText}
      onSubmitEditing={() => setIsOpen(false)}
    />
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
        showGroups
        value={value}
        onChange={(value) => {
          onChangeText(value)
          setIsOpen(false)
        }}
      />
    )
  } /* else if (['DstPort', 'SrcPort'].includes(label)) {
    const onSelect = (value) => {
      onChangeText(value)
      setIsOpen(false)
    }

    inputElement = (
      <InputSelect
        options={options}
        value={value}
        onChange={onSelect}
        onChangeText={onChangeText}
        onSubmitEditing={() => setIsOpen(false)}
      />
    )
  }*/ else if (
    (['Tags', 'Groups', 'DstInterface', 'Container', 'OriginalDstIP'].includes(
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
    let isMultiple = ['Tags', 'Groups'].includes(label)
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
  }

  //NOTE treat empty value as *
  const trigger = (triggerProps) => (
    <Tooltip label={label} bg="muted.800" _text={{ color: 'muted.200' }}>
      <Button
        {...tokenProps}
        {...triggerProps}
        onPress={() => setIsOpen(!isOpen)}
      >
        {displayValue(value)}
      </Button>
    </Tooltip>
  )

  return (
    <>
      <Popover
        position="auto"
        trigger={trigger}
        isOpen={isOpen}
        onClose={() => setIsOpen(!isOpen)}
      >
        <Popover.Content minW={180}>
          <Popover.Body>
            <HStack space={1}>
              <FormControl flex={1}>
                <FormControl.Label>{label}</FormControl.Label>
                {inputElement}
                <FormControl.HelperText>{description}</FormControl.HelperText>
              </FormControl>
              {/*<IconButton
                ml="auto"
                colorScheme="light"
                icon={<Icon icon={faTag} />}
              />*/}
            </HStack>
          </Popover.Body>
        </Popover.Content>
      </Popover>
    </>
  )
}

Token.propTypes = {
  label: PropTypes.string,
  value: PropTypes.any,
  format: PropTypes.any, //instanceOf(RegExp),
  description: PropTypes.string,
  onChange: PropTypes.func
}

export default Token
