import React, { useContext, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { AppContext } from 'AppContext'
import { themes } from 'Themes'

const pluginThemePayload = (ctx) => {
  let theme = ctx?.theme || 'default'
  let customThemes = ctx?.customThemes || {}
  let colorMode = ctx?.viewSettings?.colorMode || 'light'
  let activeCustom = customThemes[theme]
  let effectiveColorMode = activeCustom
    ? activeCustom.colorMode
    : themes[theme]?.colorMode || colorMode
  let colors = customThemes[theme]?.colors || themes[theme]?.colors || {}
  return { colorMode: effectiveColorMode, theme, colors }
}

const CustomPlugin = ({ ...props }) => {
  const context = useContext(AppContext)
  const ref = useRef(null)

  const payload = pluginThemePayload(context)
  const themeMessage = { type: 'spr:theme', ...payload }

  const isDoc = props.srcDoc ? true : false
  let src = null
  if (!isDoc && props.src) {
    try {
      src = new URLSearchParams(new URL(props.src).search).toString().length
        ? props.src
        : `${props.src}?colorMode=${payload.colorMode}`
    } catch (err) {
      src = null
    }
  }
  let srcDoc = (isDoc && props.srcDoc) || null

  const postTheme = () => {
    if (!ref.current?.contentWindow) {
      return
    }
    ref.current.contentWindow.postMessage(JSON.stringify(themeMessage), '*')
  }

  const postAuth = (auth = props.pluginAuth, requestId = null) => {
    if (!ref.current?.contentWindow || !auth?.token) {
      return
    }
    ref.current.contentWindow.postMessage(
      JSON.stringify({
        type: 'spr:auth',
        token: auth.token,
        expiresAt: auth.expiresAt,
        protocolVersion: auth.protocolVersion,
        requestId
      }),
      '*'
    )
  }

  const postBootstrap = () => {
    postTheme()
    postAuth()
  }

  useEffect(() => {
    postTheme()
  }, [payload.colorMode, payload.theme, JSON.stringify(payload.colors)])

  useEffect(() => {
    postAuth()
  }, [props.pluginAuth])

  useEffect(() => {
    const onMessage = (event) => {
      if (!ref.current || event.source !== ref.current.contentWindow) {
        return
      }
      let data = event.data
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data)
        } catch (err) {
          return
        }
      }
      if (data && data.type === 'spr:ready') {
        postBootstrap()
      } else if (
        data &&
        data.type === 'spr:auth-required' &&
        data.protocolVersion === 1 &&
        typeof props.onAuthRequired === 'function'
      ) {
        Promise.resolve(props.onAuthRequired())
          .then((auth) => {
            postAuth(auth, data.requestId || null)
          })
          .catch(() => {})
      }
    }
    window.addEventListener('message', onMessage, false)
    return () => window.removeEventListener('message', onMessage, false)
  }, [
    payload.colorMode,
    payload.theme,
    JSON.stringify(payload.colors),
    props.pluginAuth,
    props.onAuthRequired
  ])

  const iframeProps = {
    src,
    srcDoc,
    ref,
    onLoad: postBootstrap,
    style: { borderWidth: 0, height: '100vh' }
  }
  if (props.isSandboxed !== false) {
    iframeProps.sandbox = 'allow-scripts'
  }
  return React.createElement('iframe', iframeProps)
}

CustomPlugin.propTypes = {
  src: PropTypes.string,
  srcDoc: PropTypes.string,
  isSandboxed: PropTypes.bool,
  pluginAuth: PropTypes.shape({
    token: PropTypes.string.isRequired,
    expiresAt: PropTypes.number.isRequired,
    protocolVersion: PropTypes.number.isRequired
  }),
  onAuthRequired: PropTypes.func
}

export default CustomPlugin
