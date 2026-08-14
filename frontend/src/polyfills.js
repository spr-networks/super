import URLSearchParamsPolyfill from 'URLSearchParamsPolyfill'

const hasWorkingSearchParams = () => {
  if (typeof global.URLSearchParams === 'undefined') {
    return false
  }

  try {
    const params = new global.URLSearchParams('a=1')
    if (
      typeof params.set !== 'function' ||
      typeof params.forEach !== 'function'
    ) {
      return false
    }
    params.set('b', '2')
    let seen = 0
    params.forEach(() => seen++)
    return seen === 2 && params.get('a') === '1'
  } catch (e) {
    return false
  }
}

if (!hasWorkingSearchParams()) {
  global.URLSearchParams = URLSearchParamsPolyfill
}

// Hermes (React Native's JS engine) ships no global TextEncoder. react-qr-code
// calls `new TextEncoder().encode(value)` to UTF-8 encode the QR payload, which
// throws "property TextEncoder doesn't exist" when the add-device QR renders.
// Provide a minimal UTF-8 encoder; only encode() is needed by consumers here.
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = class TextEncoder {
    get encoding() {
      return 'utf-8'
    }

    encode(input = '') {
      const str = String(input)
      const bytes = []
      for (let i = 0; i < str.length; i++) {
        let code = str.charCodeAt(i)
        // Combine a surrogate pair into a single code point.
        if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
          const next = str.charCodeAt(i + 1)
          if (next >= 0xdc00 && next <= 0xdfff) {
            code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
            i++
          }
        }
        if (code < 0x80) {
          bytes.push(code)
        } else if (code < 0x800) {
          bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
        } else if (code < 0x10000) {
          bytes.push(
            0xe0 | (code >> 12),
            0x80 | ((code >> 6) & 0x3f),
            0x80 | (code & 0x3f)
          )
        } else {
          bytes.push(
            0xf0 | (code >> 18),
            0x80 | ((code >> 12) & 0x3f),
            0x80 | ((code >> 6) & 0x3f),
            0x80 | (code & 0x3f)
          )
        }
      }
      return Uint8Array.from(bytes)
    }
  }
}
