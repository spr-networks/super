import API from './API'

export class APIWan extends API {
  constructor() {
    super('/wan/')
  }

  status() {
    return this.get('status')
  }

  history(iface, scale = 'minutes', count = 0) {
    let url = `history/${iface}?scale=${scale}`
    if (count > 0) {
      url += `&count=${count}`
    }
    return this.get(url)
  }

  outages() {
    return this.get('outages')
  }

  config() {
    return this.get('config')
  }

  setConfig(data) {
    return this.put('config', data)
  }

  speedResults() {
    return this.get('speedtest')
  }

  runSpeedTest(iface) {
    return this.put(`speedtest/${iface}`)
  }
}

export const wanAPI = new APIWan()
export default APIWan
