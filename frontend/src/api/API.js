const apiURL = () => {
  const { REACT_APP_API } = process.env
  if (REACT_APP_API) {
    try {
      let url = new URL(REACT_APP_API)
      console.log('[API] using base:' + url)
      return url.toString()
    } catch (e) {
      // REACT_APP_API=mock -- dont load in prod
      let MockAPI = import('../api/MockAPI').then((m) => m.default())
      return '/'
    }
  }
}

//request helper
class API {
  baseURL = ''
  authHeaders = ''

  constructor(baseURL = '') {
    this.baseURL = apiURL() + baseURL.replace(/^\/+/, '')
    this.authHeaders = this.getAuthHeaders()
  }

  // reads from localStorage if no username provided
  getAuthHeaders(username = null, password = null) {
    if (username && password) {
      return
      'Basic ' + Buffer.from(username + ':' + password).toString('base64')
    }

    let user = JSON.parse(localStorage.getItem('user'))
    if (user && user.authdata) {
      return 'Basic ' + user.authdata
    } else {
      return ''
    }
  }

  request(method = 'GET', url, body) {
    let headers = {
      Authorization: this.getAuthHeaders(),
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

    let promise = new Promise((resolve, reject) => {
      let baseURL = this.baseURL
      // get rid of //
      if (
        url[0] == '/' &&
        baseURL.length &&
        baseURL[baseURL.length - 1] == '/'
      ) {
        url = url.substr(1)
      }

      let _url = `${baseURL}${url}`
      console.log('[API] fetch', _url, 'Authorization:', this.authHeaders)

      fetch(_url, opts)
        .then((response) => {
          if (!response.ok) {
            throw new Error(response.status)
          }

          if (['PUT', 'DELETE'].includes(method)) {
            return resolve(true)
          }

          return response.json()
        })
        .then((data) => {
          resolve(data)
        })
        .catch((reason) => {
          reject(reason)
        })
    })

    return promise
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
}

export default API
export const api = new API()
