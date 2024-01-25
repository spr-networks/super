import React from 'react'
import PropTypes from 'prop-types'
import InputSelect from 'components/InputSelect'

const DeviceExpiry = ({ value, onChange, ...props }) => {
  const expirationOptions = [
    { label: 'Never', value: 0 },
    { label: '1 Hour', value: 60 * 60 },
    { label: '1 Day', value: 60 * 60 * 24 },
    { label: '1 Week', value: 60 * 60 * 24 * 7 },
    { label: '4 Weeks', value: 60 * 60 * 24 * 7 * 4 }
  ]

  return (
    <InputSelect
      options={expirationOptions}
      isDisabled
      value={value > 0 ? new Date(value * 1e3).toUTCString() : 'Never'}
      onChange={(v) => onChange(parseInt(v))}
    />
  )
}

export default DeviceExpiry

DeviceExpiry.propTypes = {
  value: PropTypes.number,
  onChange: PropTypes.func
}
