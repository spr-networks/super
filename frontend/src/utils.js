import React from 'react'
import { Text } from '@gluestack-ui/themed'
import { Platform } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'

export const copy = (data) => {
  if (Platform.OS == 'web') {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(data)
    } else {
      var copyTextarea = document.createElement('textarea')
      copyTextarea.style.position = 'fixed'
      copyTextarea.style.opacity = '0'
      copyTextarea.textContent = data

      document.body.appendChild(copyTextarea)
      copyTextarea.select()
      document.execCommand('copy')
      document.body.removeChild(copyTextarea)
    }
  } else {
    Clipboard.setString(data)
  }
}

// util functions
export const strToDate = (timestamp, locales = null) => {
  let ts = timestamp
  if (!ts) return null
  //golang UTC date format:
  //2023-07-20 12:57:32.039846038 +0000 UTC m=+92926.449526088
  if (typeof ts == 'string' && ts.includes('m=')) {
    ts = ts.replace(/\sm=.*/g, '')
  }

  if (typeof ts == 'string' && ts.includes("+0000 UTC")) {
    ts = ts.replace(" +0000 UTC", "Z")
    ts = ts.replace(" ", "T")
  }

  return new Date(ts)
}

// util functions
export const prettyDate = (timestamp, locales = null) => {
  return strToDate(timestamp).toLocaleString()
}

export const prettySize = (sz, round = false) => {
  let szType = 'b'

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
  let className = '$muted500'
  if (signal >= -50) {
    className = '$success600'
  } else if (signal >= -60) {
    className = '$success500'
  } else if (signal >= -70) {
    className = '$warning500'
  } else {
    className = '$danger500'
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


export const countryCodes = [
  'AD',
  'AE',
  'AF',
  'AG',
  'AI',
  'AL',
  'AM',
  'AO',
  'AQ',
  'AR',
  'AS',
  'AT',
  'AU',
  'AW',
  'AX',
  'AZ',
  'BA',
  'BB',
  'BD',
  'BE',
  'BF',
  'BG',
  'BH',
  'BI',
  'BJ',
  'BL',
  'BM',
  'BN',
  'BO',
  'BQ',
  'BR',
  'BS',
  'BT',
  'BV',
  'BW',
  'BY',
  'BZ',
  'CA',
  'CC',
  'CD',
  'CF',
  'CG',
  'CH',
  'CI',
  'CK',
  'CL',
  'CM',
  'CN',
  'CO',
  'CR',
  'CU',
  'CV',
  'CW',
  'CX',
  'CY',
  'CZ',
  'DE',
  'DJ',
  'DK',
  'DM',
  'DO',
  'DZ',
  'EC',
  'EE',
  'EG',
  'EH',
  'ER',
  'ES',
  'ET',
  'FI',
  'FJ',
  'FK',
  'FM',
  'FO',
  'FR',
  'GA',
  'GB',
  'GD',
  'GE',
  'GF',
  'GG',
  'GH',
  'GI',
  'GL',
  'GM',
  'GN',
  'GP',
  'GQ',
  'GR',
  'GS',
  'GT',
  'GU',
  'GW',
  'GY',
  'HK',
  'HM',
  'HN',
  'HR',
  'HT',
  'HU',
  'ID',
  'IE',
  'IL',
  'IM',
  'IN',
  'IO',
  'IQ',
  'IR',
  'IS',
  'IT',
  'JE',
  'JM',
  'JO',
  'JP',
  'KE',
  'KG',
  'KH',
  'KI',
  'KM',
  'KN',
  'KP',
  'KR',
  'KW',
  'KY',
  'KZ',
  'LA',
  'LB',
  'LC',
  'LI',
  'LK',
  'LR',
  'LS',
  'LT',
  'LU',
  'LV',
  'LY',
  'MA',
  'MC',
  'MD',
  'ME',
  'MF',
  'MG',
  'MH',
  'MK',
  'ML',
  'MM',
  'MN',
  'MO',
  'MP',
  'MQ',
  'MR',
  'MS',
  'MT',
  'MU',
  'MV',
  'MW',
  'MX',
  'MY',
  'MZ',
  'NA',
  'NC',
  'NE',
  'NF',
  'NG',
  'NI',
  'NL',
  'NO',
  'NP',
  'NR',
  'NU',
  'NZ',
  'OM',
  'PA',
  'PE',
  'PF',
  'PG',
  'PH',
  'PK',
  'PL',
  'PM',
  'PN',
  'PR',
  'PS',
  'PT',
  'PW',
  'PY',
  'QA',
  'RE',
  'RO',
  'RS',
  'RU',
  'RW',
  'SA',
  'SB',
  'SC',
  'SD',
  'SE',
  'SG',
  'SH',
  'SI',
  'SJ',
  'SK',
  'SL',
  'SM',
  'SN',
  'SO',
  'SR',
  'SS',
  'ST',
  'SV',
  'SX',
  'SY',
  'SZ',
  'TC',
  'TD',
  'TF',
  'TG',
  'TH',
  'TJ',
  'TK',
  'TL',
  'TM',
  'TN',
  'TO',
  'TR',
  'TT',
  'TV',
  'TW',
  'TZ',
  'UA',
  'UG',
  'UM',
  'US',
  'UY',
  'UZ',
  'VA',
  'VC',
  'VE',
  'VG',
  'VI',
  'VN',
  'VU',
  'WF',
  'WS',
  'YE',
  'YT',
  'ZA',
  'ZM',
  'ZW'
]
