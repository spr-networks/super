import React from 'react'
import PropTypes from 'prop-types'
import { Button, ButtonIcon, ButtonText } from '@gluestack-ui/themed'
import { Menu } from 'native-base' //TODONB
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import { faCalendar } from '@fortawesome/free-solid-svg-icons'
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

  const handleChange = (value) => {
    if (props.onChange) {
      props.onChange(value)
    }
  }

  return (
    <Menu w="190" trigger={trigger} onChangeValue={handleChange}>
      <Menu.OptionGroup defaultValue={defaultValue} title="Select Date Range">
        {scales.map((scale) => (
          <Menu.ItemOption
            key={scale.value}
            value={scale.value}
            onPress={(e) => handleChange(scale.value)}
          >
            {scale.label}
          </Menu.ItemOption>
        ))}
      </Menu.OptionGroup>
    </Menu>
  )
}

DateRange.propTypes = {
  defaultValue: PropTypes.any,
  onChange: PropTypes.func
}

export default DateRange
