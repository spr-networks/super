import React from 'react'
import PropTypes from 'prop-types'
import { Button, ButtonIcon, ButtonText } from '@gluestack-ui/themed'

import { Menu, MenuItem, MenuItemLabel } from '@gluestack-ui/themed'

import { CalendarIcon } from 'lucide-react-native'

const DateRange = (props) => {
  const scales = [
    { value: 'All Time', label: 'All Time' },
    { value: '1 Day', label: 'Last day' },
    { value: '1 Hour', label: 'Last hour' },
    { value: '15 Minutes', label: 'Last 15 minutes' }
  ]

  let defaultValue = props.defaultValue || scales[0].value
  let title = scales.filter((s) => s.value == defaultValue)[0].label
  let colorScheme = props.colorScheme || 'muted'

  const trigger = (triggerProps) => {
    return (
      <Button variant="link" {...triggerProps} colorScheme={colorScheme}>
        <ButtonText>{title}</ButtonText>
        <ButtonIcon as={CalendarIcon} ml="$1" />
      </Button>
    )
  }

  const handleChange = (e) => {
    let value = e.currentKey
    if (props.onChange) {
      props.onChange(value)
    }
  }

  return (
    <Menu
      trigger={trigger}
      selectionMode="single"
      onSelectionChange={handleChange}
    >
      {scales.map((scale) => (
        <MenuItem key={scale.value} textValue={scale.value}>
          <MenuItemLabel size="sm">{scale.label}</MenuItemLabel>
        </MenuItem>
      ))}
    </Menu>
  )
}

DateRange.propTypes = {
  defaultValue: PropTypes.any,
  onChange: PropTypes.func
}

export default DateRange
