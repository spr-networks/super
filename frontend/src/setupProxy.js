const { createProxyMiddleware } = require('http-proxy-middleware')

module.exports = (app) => {
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
      pathRewrite: { '^/__spr_api': '' }
    })
  )
}
