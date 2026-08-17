import 'polyfills'

describe('native URL polyfill', () => {
  test('supports plugin paths', () => {
    const url = new URL('https://router.local/api/')

    url.pathname += 'plugins/example/'
    expect(url.pathname).toBe('/api/plugins/example/')
    expect(url.toString()).toBe('https://router.local/api/plugins/example/')
  })
})
