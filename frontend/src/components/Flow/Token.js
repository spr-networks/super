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

  // TODO autocomplete/button for selecting values
  // this can be:
  // groups, clients, ports

  let size = props.size || 'sm'

  const onChangeText = (value) => {
    //only update if correct format
    if (format !== undefined && !value.match(format)) {
      return
    }

    if (!value.length) {
      return
    }

    setValue(value)
    if (onChange) {
      onChange(value)
    }
  }

  if (label == 'days') {
    let days = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday'
    ]

    days = days.map((label) => {
      return { label, value: label.slice(0, 3).toLowerCase() }
    })

    const handleChange = (days) => {
      let sorted = [...days]
      sorted.sort()
      sorted = sorted.join(',')

      if (sorted == 'fri,mon,thu,tue,wed') {
        days = 'weekdays'
      } else if (sorted == 'sat,sun') {
        days = 'weekend'
      } else if (sorted == 'fri,mon,sat,sun,thu,tue,wed') {
        days = 'every day'
      } else {
        days = days.join(',')
      }

      onChangeText(days)
    }

    // skip popover & use the menu directly
    // triggers differ slightly
    const trigger = (triggerProps) => (
      <Tooltip label={label} bg="muted.800" _text={{ color: 'muted.200' }}>
        <Button
          variant="outline"
          colorScheme="light"
          borderColor={useColorModeValue('muted.200', 'muted.600')}
          _text={{ color: useColorModeValue('muted.600', 'muted.200') }}
          rounded="md"
          size={size}
          p={1}
          lineHeight={14}
          textAlign="center"
          {...triggerProps}
        >
          {value}
        </Button>
      </Tooltip>
    )

    let defaultValue = value

    if (value == 'weekdays') {
      defaultValue = 'mon,tue,wed,thu,fri'
    } else if (value == 'weekend') {
      defaultValue = 'sat,sun'
    } else if (value == 'every day') {
      defaultValue = 'mon,tue,wed,thu,fri,sat,sun'
    }

    defaultValue = defaultValue.split(',')

    return (
      <Menu w="190" closeOnSelect={false} trigger={trigger}>
        <Menu.OptionGroup
          defaultValue={defaultValue}
          type="checkbox"
          title="Select Date"
          onChange={handleChange}
        >
          {days.map((item) => (
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
    inputElement = <TimeSelect value={value} onChange={onChangeText} />
  } else if (false) {
  }

  const trigger = (triggerProps) => (
    <Tooltip label={label} bg="muted.800" _text={{ color: 'muted.200' }}>
      <Button
        variant="outline"
        colorScheme="light"
        borderColor={useColorModeValue('muted.200', 'muted.600')}
        _text={{ color: useColorModeValue('muted.600', 'muted.200') }}
        rounded="md"
        size={size}
        p={1}
        lineHeight={14}
        textAlign="center"
        {...triggerProps}
        onPress={() => setIsOpen(!isOpen)}
      >
        {value}
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
        <Popover.Content>
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

Token.PropTypes = {
  label: PropTypes.string,
  value: PropTypes.any,
  format: PropTypes.any,
  description: PropTypes.string,
  onChange: PropTypes.func
}

export default Token
