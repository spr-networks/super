import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

const Spinner = (props) => {
  const [text, setText] = useState(props.text || 'Loading...')
  const [isVisible, setIsVisible] = useState(
    props.isVisible === false ? false : true
  )

  useEffect(() => {
    setIsVisible(props.isVisible ? true : false)

    return () => {
      setIsVisible(true)
    }
  }, [props.isVisible])

  let className = props.className ? props.className : ''

  return (
    <div className={className} hidden={!isVisible}>
      <span
        className="spinner-border spinner-border-sm"
        role="status"
        aria-hidden="true"
      ></span>
      {' ' + text}
    </div>
  )
}

Spinner.propTypes = {
  text: PropTypes.string,
  isVisible: PropTypes.bool,
  className: PropTypes.string
}

export default Spinner
