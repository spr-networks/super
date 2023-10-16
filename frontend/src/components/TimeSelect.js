import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { HStack, Text } from '@gluestack-ui/themed'
import { Select } from 'components/Select'

const TimeSelect = ({ value, onChange, ...props }) => {
  let [hh, mm] = value.split(':')

  const [hour, setHour] = useState(hh)
  const [minute, setMinute] = useState(mm)

  let hours = [...new Array(24).keys()].map((n) =>
    n.toString().padStart(2, '0')
  )
  let minutes = [...new Array(60).keys()].map((n) =>
    n.toString().padStart(2, '0')
  )

  useEffect(() => {
    let hh = hour.toString().padStart(2, '0'),
      mm = minute.toString().padStart(2, '0')

    if (onChange) {
      onChange(`${hh}:${mm}`)
    }
  }, [hour, minute])

  return (
    <HStack space="sm" justifyContent="center">
      <Select
        w={'$20'}
        selectedValue={hour}
        onValueChange={setHour}
        accessibilityLabel={`Choose hour`}
      >
        {hours.map((h) => (
          <Select.Item key={h} value={h} label={h} />
        ))}
      </Select>
      <Text>:</Text>
      <Select
        w={'$20'}
        selectedValue={minute}
        onValueChange={setMinute}
        accessibilityLabel={`Choose minute`}
      >
        {minutes.map((m) => (
          <Select.Item key={m} value={m} label={m} />
        ))}
      </Select>
    </HStack>
  )
}

TimeSelect.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func
}

export default TimeSelect
