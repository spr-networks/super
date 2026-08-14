const encodeParam = (value) =>
  encodeURIComponent(String(value))
    .replace(
      /[!'()~]/g,
      (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase()
    )
    .replace(/%20/g, '+')

const decodeParam = (value) => {
  const text = String(value).replace(/\+/g, ' ')

  try {
    return decodeURIComponent(text)
  } catch (e) {
    return text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
      try {
        return decodeURIComponent(run)
      } catch (err) {
        return run
      }
    })
  }
}

class URLSearchParamsPolyfill {
  constructor(init) {
    this._list = []

    if (init === null || init === undefined || init === '') {
      return
    }

    if (typeof init === 'string') {
      const query = init.charAt(0) === '?' ? init.slice(1) : init
      for (const pair of query.split('&')) {
        if (!pair) continue
        const eq = pair.indexOf('=')
        const name = eq === -1 ? pair : pair.slice(0, eq)
        const value = eq === -1 ? '' : pair.slice(eq + 1)
        this._list.push([decodeParam(name), decodeParam(value)])
      }
    } else if (Array.isArray(init)) {
      for (const entry of init) {
        this._list.push([String(entry[0]), String(entry[1])])
      }
    } else if (typeof init.forEach === 'function') {
      init.forEach((value, name) =>
        this._list.push([String(name), String(value)])
      )
    } else {
      for (const key of Object.keys(init)) {
        this._list.push([key, String(init[key])])
      }
    }
  }

  append(name, value) {
    this._list.push([String(name), String(value)])
  }

  delete(name) {
    const key = String(name)
    this._list = this._list.filter((entry) => entry[0] !== key)
  }

  get(name) {
    const key = String(name)
    const found = this._list.find((entry) => entry[0] === key)
    return found ? found[1] : null
  }

  getAll(name) {
    const key = String(name)
    return this._list
      .filter((entry) => entry[0] === key)
      .map((entry) => entry[1])
  }

  has(name) {
    const key = String(name)
    return this._list.some((entry) => entry[0] === key)
  }

  set(name, value) {
    const key = String(name)
    const index = this._list.findIndex((entry) => entry[0] === key)

    if (index === -1) {
      this._list.push([key, String(value)])
      return
    }

    this._list[index] = [key, String(value)]
    this._list = this._list.filter((entry, i) => i <= index || entry[0] !== key)
  }

  sort() {
    this._list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  }

  forEach(callback, thisArg) {
    for (const [name, value] of this._list.slice()) {
      callback.call(thisArg, value, name, this)
    }
  }

  entries() {
    return this._list.map((entry) => [entry[0], entry[1]])[Symbol.iterator]()
  }

  keys() {
    return this._list.map((entry) => entry[0])[Symbol.iterator]()
  }

  values() {
    return this._list.map((entry) => entry[1])[Symbol.iterator]()
  }

  [Symbol.iterator]() {
    return this.entries()
  }

  get size() {
    return this._list.length
  }

  toString() {
    return this._list
      .map(([name, value]) => encodeParam(name) + '=' + encodeParam(value))
      .join('&')
  }
}

export { encodeParam, decodeParam }
export default URLSearchParamsPolyfill
