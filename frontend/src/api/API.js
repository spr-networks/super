import createServer from 'api/MockAPI'
import { Base64 } from 'utils'
import { Platform } from 'react-native'

let gApiURL = null

export const setApiURL = (url) => {
  if (!url.endsWith('/')) {
    url += '/'
  }

  gApiURL = url
}

export const getApiURL = () => {
  if (gApiURL !== null) {
    return gApiURL
  }

  const { REACT_APP_API } = process.env

  if (REACT_APP_API == 'mock') {
    createServer()
    return '/'
  }

  if (Platform.OS == 'ios') {
    return 'http://192.168.2.1/'
  }

  if (REACT_APP_API) {
    try {
      let url = new URL(REACT_APP_API)
      return url.toString()
    } catch (e) {
      throw e
    }
  }

  /*/ jest
  if (typeof document === 'undefined') {
    return 'http://localhost/'
  }*/

  return document.location.origin + '/'
}

if (typeof localStorage === 'undefined') {
  global.localStorage = {
    data: {},
    getItem: function (key) {
      return this.data[key] || null
    },
    setItem: function (key, value) {
      this.data[key] = value
    },
    removeItem: function (key) {
      delete this.data[key]
    }
  }
}

//request helper
class API {
  baseURL = ''
  authHeaders = ''

  getApiURL() {
    return getApiURL()
  }

  constructor(baseURL = '') {
    this.baseURL = baseURL.replace(/^\/+/, '')
    this.authHeaders = this.getAuthHeaders()
  }

  // reads from localStorage if no username provided
  getAuthHeaders(username = null, password = null) {
    if (username && password) {
      return
      'Basic ' + Base64.btoa(username + ':' + password)
    }

    let user = JSON.parse(localStorage.getItem('user'))
    return user && user.authdata ? 'Basic ' + user.authdata : ''
  }

  setAuthHeaders(username = '', password = '') {
    this.authHeaders = 'Basic ' + Base64.btoa(username + ':' + password)
  }

  request(method = 'GET', url, body) {
    if (!this.authHeaders) {
      this.authHeaders = this.getAuthHeaders()
    }

    let headers = {
      Authorization: this.authHeaders,
      'X-Requested-With': 'react',
      'Content-Type': 'application/json'
    }

    let opts = {
      method,
      headers
    }

    if (body) {
      opts.body = JSON.stringify(body)
    }

    let baseURL = this.getApiURL() + this.baseURL
    // get rid of //
    if (url[0] == '/' && baseURL.length && baseURL[baseURL.length - 1] == '/') {
      url = url.substr(1)
    }

    // if forced to not return data
    let skipReturnValue = method == 'DELETE'

    let _url = `${baseURL}${url}`
    /*if (!_url.includes('?')) {
      _url += '?' + new Date().getTime() // cache problem with app
    }*/
    console.log('[API] fetch', _url)
    //console.log(`[API] fetch method=`, method, 'skip=', skipReturnValue)

    return fetch(_url, opts).then((response) => {
      if (!response.ok) {
        return Promise.reject({ message: response.status, response })
      }

      const contentType = response.headers.get('Content-Type')
      if (!contentType || skipReturnValue) {
        return Promise.resolve(true)
      }

      // weird behaviour from react-native
      if (contentType.includes('text/html')) {
        return response.json()
      }

      if (contentType.includes('application/json')) {
        return response.json()
      } else if (contentType.includes('text/plain')) {
        return response.text()
      }

      return Promise.reject({ message: 'unknown Content-Type' })
    })
  }

  get(url) {
    return this.request('GET', url)
  }

  put(url, data) {
    return this.request('PUT', url, data)
  }

  delete(url, data) {
    return this.request('DELETE', url, data)
  }

  features(url) {
    return this.get('/features')
  }
}

export default API
export const api = new API()

export const testLogin = (username, password, callback) => {
  api.setAuthHeaders(username, password)
  api
    .get('/status?' + Math.random()) // NOTE react native can cache text/html
    .then((data) => {
      return callback(data == 'Online')
    })
    .catch((error) => {
      callback(false, error)
    })
}

export const saveLogin = (username, password) => {
  localStorage.setItem(
    'user',
    JSON.stringify({
      authdata: Base64.btoa(username + ':' + password),
      username: username,
      password: password
    })
  )
}
