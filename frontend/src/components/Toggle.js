import React, { useState } from 'react'
import PropTypes from 'prop-types'
import './Toggle.css'

const Toggle = (props) => {
  const [isChecked, setIsChecked] = useState(props.isChecked || false)

  const handleChange = (e) => {
    setIsChecked(!isChecked)
    if (props.onChange) {
      props.onChange(e, !isChecked)
    }
  }

  return (
    <label className="switch">
      <input type="checkbox" checked={isChecked} onChange={handleChange} />
      <div className="slider"></div>
    </label>
  )
}

Toggle.propTypes = {
  isChecked: PropTypes.bool,
  onChange: PropTypes.func
}

export default Toggle
