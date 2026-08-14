import URLSearchParamsPolyfill from 'URLSearchParamsPolyfill'

describe('URLSearchParams polyfill', () => {
  describe('serialization', () => {
    test.each([
      ["'", '%27'],
      ['!', '%21'],
      ['(', '%28'],
      [')', '%29'],
      ['~', '%7E']
    ])('escapes %s', (char, encoded) => {
      const params = new URLSearchParamsPolyfill()
      params.set('k', char)
      expect(params.toString()).toBe(`k=${encoded}`)
    })

    test.each(['<script>', '"', '&', '=', '#', '<', '>'])(
      'escapes %s',
      (char) => {
        const params = new URLSearchParamsPolyfill()
        params.set('k', char)
        expect(params.toString()).toBe(`k=${encodeURIComponent(char)}`)
      }
    )

    test('matches the platform implementation', () => {
      const values = [
        `<img src=x onerror="alert('xss')">`,
        'a&b=c',
        'sp ace',
        'ünïcødé',
        '100%',
        'a+b',
        "O'Brien (test) ~!"
      ]

      for (const value of values) {
        const mine = new URLSearchParamsPolyfill()
        const native = new URLSearchParams()
        mine.set('v', value)
        native.set('v', value)
        expect(mine.toString()).toBe(native.toString())
      }
    })

    test('a value cannot inject an extra parameter', () => {
      const params = new URLSearchParamsPolyfill()
      params.set('service', 'a&admin=1')
      expect(params.toString()).toBe('service=a%26admin%3D1')
      expect(new URLSearchParamsPolyfill(params.toString()).get('admin')).toBe(
        null
      )
    })

    test('space serializes as + and round-trips', () => {
      const params = new URLSearchParamsPolyfill()
      params.set('k', 'a b')
      expect(params.toString()).toBe('k=a+b')
      expect(new URLSearchParamsPolyfill('k=a+b').get('k')).toBe('a b')
    })
  })

  describe('parsing', () => {
    test.each(['%', '%zz', '%E0%A4%A', 'a=%&b=1', '%%%'])(
      'does not throw on malformed escape %s',
      (query) => {
        expect(() => new URLSearchParamsPolyfill(query)).not.toThrow()
      }
    )

    test('keeps malformed escapes literal but still decodes valid ones', () => {
      const params = new URLSearchParamsPolyfill('bad=%zz&good=a%20b')
      expect(params.get('bad')).toBe('%zz')
      expect(params.get('good')).toBe('a b')
    })

    test('handles a leading ?, missing values and repeats', () => {
      const params = new URLSearchParamsPolyfill('?a=1&b&a=2')
      expect(params.get('a')).toBe('1')
      expect(params.getAll('a')).toEqual(['1', '2'])
      expect(params.get('b')).toBe('')
      expect(params.has('missing')).toBe(false)
      expect(params.get('missing')).toBe(null)
    })
  })

  describe('mutation', () => {
    test('set replaces the first match and drops duplicates', () => {
      const params = new URLSearchParamsPolyfill('a=1&b=2&a=3')
      params.set('a', '9')
      expect(params.toString()).toBe('a=9&b=2')
    })

    test('append keeps duplicates, delete removes them all', () => {
      const params = new URLSearchParamsPolyfill()
      params.append('a', '1')
      params.append('a', '2')
      expect(params.getAll('a')).toEqual(['1', '2'])
      params.delete('a')
      expect(params.getAll('a')).toEqual([])
      expect(params.size).toBe(0)
    })

    test('forEach yields value, name in that order', () => {
      const seen = []
      new URLSearchParamsPolyfill('a=1&b=2').forEach((value, name) =>
        seen.push([name, value])
      )
      expect(seen).toEqual([
        ['a', '1'],
        ['b', '2']
      ])
    })

    test('is iterable and accepts the shapes callers construct it with', () => {
      expect([...new URLSearchParamsPolyfill('a=1&b=2')]).toEqual([
        ['a', '1'],
        ['b', '2']
      ])
      expect(new URLSearchParamsPolyfill({ a: '1' }).toString()).toBe('a=1')
      expect(new URLSearchParamsPolyfill([['a', '1']]).toString()).toBe('a=1')
      expect(
        new URLSearchParamsPolyfill(
          new URLSearchParamsPolyfill('a=1')
        ).toString()
      ).toBe('a=1')
    })
  })
})
