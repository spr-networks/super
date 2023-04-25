import createServer from 'api/MockAPI'
import { Base64 } from 'utils'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

let gApiURL = null

export const setApiURL = (url) => {
  if (url == 'mock') {
    gApiURL = url
    createServer()
    return
  }

  if (!url.endsWith('/')) {
    url += '/'
  }

  gApiURL = url
}

export const getApiURL = () => {
  /*if (gApiURL !== null) {
    return gApiURL
  }*/

  const { REACT_APP_API } = process.env

  if (REACT_APP_API == 'mock' || gApiURL == 'mock') {
    createServer()
    return '/'
  }

  if (Platform.OS == 'ios' || Platform.OS == 'macos') {
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

  return document.location.origin + '/'
}

export const getApiHostname = () => {
  return getApiURL()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*/, '')
}

let gAuthHeaders = null

//request helper
class API {
  baseURL = ''
  authHeaders = ''
  remoteURL = ''

  getApiURL() {
    if (this.remoteURL != '') {
      return this.remoteURL
    }
    return getApiURL()
  }

  constructor(baseURL = '') {
    this.baseURL = baseURL.replace(/^\/+/, '')
    this.getAuthHeaders()
  }

  // reads from Async/localStorage if no username provided
  async getAuthHeaders(username = null, password = null) {
    if (username && password) {
      return
      'Basic ' + Base64.btoa(username + ':' + password)
    }

    if (gAuthHeaders) {
      return gAuthHeaders
    }

    let login = await AsyncStorage.getItem('user')
    let user = JSON.parse(login)
    //this.authHeaders =
    return user && user.authdata ? 'Basic ' + user.authdata : null
  }

  setAuthHeaders(username = '', password = '') {
    this.authHeaders = 'Basic ' + Base64.btoa(username + ':' + password)
  }

  setAuthTokenHeaders(token = '') {
    this.authHeaders = 'Bearer ' + token
  }

  setRemoteURL(url) {
    this.remoteURL = url
  }

  async fetch(method = 'GET', url, body) {
    if (url == undefined) {
      url = method
      method = 'GET'
    }

    if (!this.authHeaders) {
      this.authHeaders = await this.getAuthHeaders()
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

    let _url = `${baseURL}${url}`
    return fetch(_url, opts)
  }

  async request(method = 'GET', url, body) {
    // if forced to not return data
    let skipReturnValue = method == 'DELETE'

    return this.fetch(method, url, body).then((response) => {
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

  version(plugin = '') {
    if (plugin !== '') {
      return this.get('/version?plugin=' + plugin)
    }
    return this.get('/version')
  }

  restart() {
    return this.put('/restart')
  }
}

export default API
export const api = new API()

export const testLogin = (username, password, callback) => {
  api.setAuthHeaders(username, password)
  api
    .get('/status?json=' + Math.random())
    .then((data) => {
      return callback(data == 'Online')
    })
    .catch((error) => {
      callback(false, error)
    })
}

export const saveLogin = (username, password) => {
  gAuthHeaders = 'Basic ' + Base64.btoa(username + ':' + password)

  return AsyncStorage.setItem(
    'user',
    JSON.stringify({
      authdata: Base64.btoa(username + ':' + password),
      username: username,
      password: password
    })
  )
}
