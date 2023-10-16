import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import './Toggle.css'

import { Switch } from '@gluestack-ui/themed'

const Toggle = (props) => {
  const [isChecked, setIsChecked] = useState(props.isChecked || false)
  const [isDisabled, setIsDisabled] = useState(props.isDisabled || false)

  const handleChange = (e) => {
    setIsChecked(!isChecked)
    if (props.onChange) {
      props.onChange(e, !isChecked)
    }
  }

  useEffect(() => {
    setIsChecked(props.isChecked ? true : false)

    return () => {
      setIsChecked(false)
    }
  }, [props.isChecked])

  useEffect(() => {
    setIsDisabled(props.isDisabled ? true : false)

    return () => {
      setIsDisabled(false)
    }
  }, [props.isDisabled])

  let style = props.isDisabled ? { opacity: 0.65 } : {}

  return (
    <Switch
      defaultIsChecked={isChecked}
      onTrackColor={isDisabled ? '$info200' : '$info500'}
      onValueChange={handleChange}
    />
  )

  return (
    <label className="switch" style={style}>
      <input
        type="checkbox"
        checked={isChecked}
        disabled={isDisabled}
        onChange={handleChange}
      />
      <div className="slider"></div>
    </label>
  )
}

Toggle.propTypes = {
  isChecked: PropTypes.bool,
  isDisabled: PropTypes.bool,
  onChange: PropTypes.func
}

export default Toggle
