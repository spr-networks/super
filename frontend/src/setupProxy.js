const { createProxyMiddleware } = require('http-proxy-middleware')

module.exports = (app) => {
  const modelDirectory = process.env.SPR_ASSISTANT_MODEL_DIR
  if (modelDirectory) {
    const express = require('express')
    const path = require('path')
    const fs = require('fs')
    if (!path.isAbsolute(modelDirectory) || !fs.statSync(modelDirectory).isDirectory()) {
      throw new Error('SPR_ASSISTANT_MODEL_DIR must be an existing absolute directory')
    }
    app.use('/__spr_models', express.static(modelDirectory, {
      fallthrough: false,
      immutable: true,
      maxAge: '1y'
    }))
  }

  const target = process.env.REACT_APP_API
  if (!target || target == 'mock') return

  app.use(
    createProxyMiddleware({
      target,
      ws: true,
      secure: false,
      // Preserve localhost Host/Origin for WebSocket and WebAuthn validation.
      changeOrigin: false,
      pathFilter: '/__spr_api',
      pathRewrite: { '^/__spr_api': '' },
      on: {
        proxyRes: (proxyRes) => {
          delete proxyRes.headers['content-security-policy']
        }
      }
    })
  )
}
