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

  buckets() {
    return this.get('buckets')
  }

  deleteBucket(bucket) {
    return this.delete(`bucket/${bucket}`)
  }

  items(bucket, params = {}) {
    return this.get(`items/${bucket}?${new URLSearchParams(params)}`)
  }
}

export const dbAPI = new APIDb()
