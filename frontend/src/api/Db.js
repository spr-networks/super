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

  getItem(bucket, key) {
    return this.get(`/bucket/${bucket}/${key}`)
  }

  deleteItem(bucket, key) {
    return this.delete(`/bucket/${bucket}/${key}`)
  }

  putItem(bucket, key, entry) {
    return this.put(`/bucket/${bucket}/${key}`, entry)
  }

}

export const dbAPI = new APIDb()
