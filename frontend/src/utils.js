// util functions
export const prettyDate = (timestamp, locales = null) => {
  return new Date(timestamp).toLocaleString()
}

export const prettySize = (sz, round = false) => {
  let szType = 'bytes'

  if (sz >= 1e6) {
    sz /= 1e6
    szType = 'MB'
  } else if (sz >= 1e3) {
    sz /= 1e3
    szType = 'kB'
  }

  sz = round ? Math.floor(sz) : sz.toFixed(2)
  sz = sz.toLocaleString()
  return `${sz} ${szType}`
}
