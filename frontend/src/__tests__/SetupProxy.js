jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: jest.fn((options) => options)
}))

const { createProxyMiddleware } = require('http-proxy-middleware')
const setupProxy = require('../setupProxy')

describe('development API proxy', () => {
  const originalAPI = process.env.REACT_APP_API

  afterEach(() => {
    process.env.REACT_APP_API = originalAPI
    createProxyMiddleware.mockClear()
  })

  it('strips the plugin content security policy', () => {
    process.env.REACT_APP_API = 'https://spr.example'
    const app = { use: jest.fn() }

    setupProxy(app)

    const options = createProxyMiddleware.mock.calls[0][0]
    const proxyRes = {
      headers: {
        'content-security-policy': "default-src 'self'",
        'content-type': 'text/html'
      }
    }
    options.on.proxyRes(proxyRes)

    expect(proxyRes.headers).toEqual({
      'content-type': 'text/html'
    })
  })
})
