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

  let className = 'float-left p-2 m-2 text-muted'
  if (!isVisible) {
    className = `${className} d-none`
  }

  return (
    <div className={className} style={{ fontSize: '1.0rem' }}>
      <span
        className="spinner-border spinner-border-sm"
        role="status"
        aria-hidden="true"
      ></span>
      {' ' + text}
    </div>
  )
}

Spinner.propTypes = {}

export default Spinner
