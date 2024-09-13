import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { Input, InputField } from '@gluestack-ui/themed'

const DatePicker = ({ value, onChange, type, ...props }) => {
  const inputRef = React.useRef(null)

  const setValue = (value) => {
    let defaultValue = new Date().toString()
    let v = value || defaultValue
    let splitChar = v.includes('T') ? 'T' : ' '
    v = v.split(splitChar)[0]
    inputRef.current.setAttribute('value', v)
  }

  useEffect(() => {
    if (inputRef?.current) {
      inputRef.current.setAttribute('type', type || 'date')
      setValue(value)
    }
  }, [inputRef?.current])

  useEffect(() => {
    setValue(value)
  }, [value])

  return (
    <Input size={props.size || 'md'}>
      <InputField
        value={value}
        ref={inputRef}
        onChange={(e) => onChange(e.target.value)}
      />
    </Input>
  )
}

DatePicker.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
  type: PropTypes.string
}

export default DatePicker
