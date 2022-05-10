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
