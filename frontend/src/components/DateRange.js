import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Select from 'react-select'

const DateRange = (props) => {
  const scales = [
    { value: 'All Time', label: 'All Time' },
    { value: '1 Day', label: 'Last day' },
    { value: '1 Hour', label: 'Last hour' },
    { value: '15 Minutes', label: 'Last 15 minutes' }
  ]

  const [value, setValue] = useState(scales[0])

  const handleTimeChange = (newValue) => {
    setValue(newValue)

    if (props.onChange) {
      props.onChange(newValue)
    }
  }

  return <Select onChange={handleTimeChange} options={scales} value={value} />
}

DateRange.propTypes = {
  onChange: PropTypes.func
}

export default DateRange
