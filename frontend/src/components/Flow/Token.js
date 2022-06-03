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
import { groupAPI, deviceAPI } from 'api'

// helper functions
const niceDateToArray = (value) => {
  if (value == 'weekdays') {
    value = 'mon,tue,wed,thu,fri'
  } else if (value == 'weekend') {
    value = 'sat,sun'
  } else if (value == 'every day') {
    value = 'mon,tue,wed,thu,fri,sat,sun'
  }

  return value.split(',')
}

const dateArrayToStr = (days) => {
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

  return days
}

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

  let size = props.size || 'xs'

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

  // TODO autocomplete for selecting values:
  // groups, clients, ports

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

  // dropdown menu with select multiple
  if (['days'].includes(label)) {
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
      onChangeText(dateArrayToStr(days))
    }

    // skip popover & use the menu directly
    // triggers differ slightly
    const trigger = (triggerProps) => (
      <Tooltip label={label} bg="muted.800" _text={{ color: 'muted.200' }}>
        <Button {...tokenProps} {...triggerProps}>
          {value}
        </Button>
      </Tooltip>
    )

    let defaultValue = niceDateToArray(value)

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
  } else if (label == 'Client') {
    let [clients, setClients] = useState([])

    const getGroups = async () => {
      let groups = await groupAPI.groups()
      groups = groups.map((value) => {
        return { label: value, value }
      })
      setClients(groups)
    }

    getGroups()

    const onSelect = (value) => {
      onChangeText(value)
      setIsOpen(false)
    }

    inputElement = (
      <InputSelect
        options={clients}
        value={value}
        onChangeText={onChangeText}
        onChange={onSelect}
      />
    )

    //TODO close on select
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
  }

  const trigger = (triggerProps) => (
    <Tooltip label={label} bg="muted.800" _text={{ color: 'muted.200' }}>
      <Button
        {...tokenProps}
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

Token.propTypes = {
  label: PropTypes.string,
  value: PropTypes.any,
  format: PropTypes.any, //instanceOf(RegExp),
  description: PropTypes.string,
  onChange: PropTypes.func
}

export default Token
