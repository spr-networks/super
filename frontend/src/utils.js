import React from 'react'
import { Text } from 'native-base'

// util functions
export const prettyDate = (timestamp, locales = null) => {
  return new Date(timestamp).toLocaleString()
}

export const prettySize = (sz, round = false) => {
  let szType = 'bytes'

  if (sz >= 1024 * 1e3) {
    sz /= 1024 * 1e3
    szType = 'MB'
  } else if (sz >= 1024) {
    sz /= 1024
    szType = 'kB'
  }

  sz = round ? Math.floor(sz) : sz.toFixed(2)
  sz = sz.toLocaleString()
  return `${sz} ${szType}`
}

export const prettySignal = (signal) => {
  let className = 'muted.500'
  if (signal >= -50) {
    className = 'success.500 bold'
  } else if (signal >= -60) {
    className = 'success.500'
  } else if (signal >= -70) {
    className = 'warning.500'
  } else {
    className = 'danger.500'
  }

  return <Text color={className}>{signal}</Text>
}

export const ucFirst = (t) => t[0].toUpperCase() + t.substr(1)

// Inspired by: https://github.com/davidchambers/Base64.js/blob/master/base64.js
const chars =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='

export const Base64 = {
  btoa: (input = '') => {
    let str = input
    let output = ''

    for (
      let block = 0, charCode, i = 0, map = chars;
      str.charAt(i | 0) || ((map = '='), i % 1);
      output += map.charAt(63 & (block >> (8 - (i % 1) * 8)))
    ) {
      charCode = str.charCodeAt((i += 3 / 4))

      if (charCode > 0xff) {
        throw new Error(
          "'btoa' failed: The string to be encoded contains characters outside of the Latin1 range."
        )
      }

      block = (block << 8) | charCode
    }

    return output
  },

  atob: (input = '') => {
    let str = input.replace(/=+$/, '')
    let output = ''

    if (str.length % 4 == 1) {
      throw new Error(
        "'atob' failed: The string to be decoded is not correctly encoded."
      )
    }
    for (
      let bc = 0, bs = 0, buffer, i = 0;
      (buffer = str.charAt(i++));
      ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
        ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
        : 0
    ) {
      buffer = chars.indexOf(buffer)
    }

    return output
  }
}
