import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { AppContext } from 'AppContext'
import { useColorMode } from '@gluestack-style/react'

//this is to set colorMode and other options
const buildURL = (src) => {
  const colorMode = useColorMode()

  //if specified, skip setting
  try {
    if (new URLSearchParams(new URL(src).search).length) {
      return src
    }

    let url = src
    return `${url}?colorMode=${colorMode}`
  } catch (err) {
    return null
  }
}

//NOTE this is for custom plugin dev use
const CustomPlugin = ({ ...props }) => {
  const context = useContext(AppContext)
  const [isReady, setIsReady] = useState(false)

  const isDoc = props.srcdoc ? true : false

  //NOTE can pass both src and srcdoc, src is for dev mode
  let src = !isDoc && props.src ? buildURL(props.src) : null
  let srcdoc = (isDoc && props.srcdoc) || null
  let width = '100%',
    height = '100%'

  const postMessage = (message) => {
    if (typeof message !== 'string') {
      message = JSON.stringify(message)
    }

    const doPostMessage = (message) => {
      let targetOrigin = src ? new URL(src)?.origin : location.origin
      ref.current.contentWindow.postMessage(message, targetOrigin)
    }

    //FIXME wait to be ready
    if (!isReady) {
      doPostMessage(message)
    } else {
      setTimeout(() => {
        doPostMessage(message)
      }, 100)
    }
  }

  //forward colorMode
  useEffect(() => {
    if (!context?.viewSettings) {
      return
    }

    let { colorMode } = context.viewSettings
    //postMessage({ colorMode })
  }, [context?.viewSettings])

  const ref = React.useRef(null)

  return React.createElement('iframe', {
    src,
    srcdoc,
    ref,
    width,
    height,
    style: { borderWidth: 0 }
  })
}

CustomPlugin.propTypes = {
  src: PropTypes.string,
  srcdoc: PropTypes.string
}

export default CustomPlugin
