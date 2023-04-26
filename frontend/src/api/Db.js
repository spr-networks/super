import API from './API'

export class APIDb extends API {
  constructor() {
    super('/plugins/db/')
  }

  config() {
    return this.get('config')
  }

  setConfig(config) {
    return this.put('config', config)
  }

  stats(bucket = null) {
    return this.get(bucket ? `stats/${bucket}` : 'stats')
  }
}

export const dbAPI = new APIDb()
