import createServer from 'api/MockAPI'
import { Base64 } from 'utils'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

let gApiURL = null

//TODO add unregister handlers. support only one for now
const gErrorHandlers = {}
export const registerErrorHandler = (status, fn) => {
  gErrorHandlers[status] = [fn]
}

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

  if (Platform.OS == 'ios' || Platform.OS == 'macos' || Platform.OS == 'android') {
    return gApiURL || 'http://192.168.2.1/'
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

export const getWsURL = () => {
  let url = getApiURL()
  if (url.startsWith('https://')) {
    return url.replace('https://', 'wss://') + 'ws'
  } else {
    return url.replace('http://', 'ws://') + 'ws'
  }
}

export const getApiHostname = () => {
  return getApiURL()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*/, '')
}

let gAuthHeaders = null
//tbd need to sync to mesh
let gJWTOTPHeader = null

export const setAuthReturn = (url) => {
  AsyncStorage.setItem(
    'auth-return',
    JSON.stringify({
      url: url
    })
  )
}

export const getAuthReturn = () => {
  return AsyncStorage.getItem('auth-return').then((good) => {
    let x = JSON.parse(good)
    return x.url ? x.url : '/admin/home'
  })
}

export const setJWTOTPHeader = (jwt = '') => {
  if (gJWTOTPHeader != jwt) {
    AsyncStorage.setItem(
      'jwt-otp',
      JSON.stringify({
        jwt: jwt
      })
    )
    gJWTOTPHeader = jwt
  }
  return gJWTOTPHeader
}

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

  registerErrorHandler(status, callback) {
    registerErrorHandler(status, callback)
  }

  // reads from Async/localStorage if no username provided
  async getAuthHeaders(username = null, password = null) {
    let otp = await AsyncStorage.getItem('jwt-otp')
    let jwt = JSON.parse(otp)
    if (jwt && jwt.jwt) {
      setJWTOTPHeader(jwt.jwt)
    }

    if (username && password) {
      return 'Basic ' + Base64.btoa(username + ':' + password)
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
      'X-Requested-With': 'react',
      'Content-Type': 'application/json'
    }

    if (this.authHeaders) {
      headers.Authorization = this.authHeaders
    }

    if (gJWTOTPHeader && this.remoteURL == '') {
      headers['X-JWT-OTP'] = gJWTOTPHeader
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

    return this.fetch(method, url, body)
      .then((response) => {
        if (!response.ok) {
          return Promise.reject({
            message: response.status,
            status: response.status,
            response
          })
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
        } else if (contentType.includes('application/x-x509-ca-cert')) {
          return response.text()
        } else if (contentType.startsWith('application/x-gtar-compressed')) {
          return response.blob()
        }

        return Promise.reject({ message: 'unknown Content-Type' })
      })
      .catch((err) => {
        //call registered handlers
        //console.log('-- Throoow', err)
        let status = parseInt(err.status)
        if (Array.isArray(gErrorHandlers[status])) {
          gErrorHandlers[status].map((handler) => {
            handler(err)
          })
        }

        return Promise.reject(err)
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

  //plugins = array or string
  version(plugins = null) {
    let params = new URLSearchParams()

    if (plugins?.length) {
      if (!Array.isArray(plugins)) {
        plugins = ['' + plugins]
      }

      plugins.map((p) => params.append('plugin', p))
    }

    return this.get(`/version?${params}`)
  }

  // auto-check-update status
  getCheckUpdates() {
    return this.get('/checkupdates')
  }

  setCheckUpdates() {
    return this.put('/checkupdates')
  }

  clearCheckUpdates() {
    return this.delete('/checkupdates')
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

export const saveLogin = (
  username,
  password,
  hostname = null,
  protocol = null
) => {
  gAuthHeaders = 'Basic ' + Base64.btoa(username + ':' + password)

  let authdata = Base64.btoa(username + ':' + password)

  return AsyncStorage.setItem(
    'user',
    JSON.stringify({
      authdata,
      username,
      password,
      hostname,
      protocol
    })
  )
}
