import API from './API'

export class APIAlerts extends API {
  constructor() {
    super('')
  }

  list() {
    return this.get('/alerts')
  }

  add(data) {
    return this.put('/alerts', data)
  }

  update(index, data) {
    return this.put(`/alerts/${index}`, data)
  }

  remove(index) {
    return this.delete(`/alerts/${index}`, {})
  }
}

export const alertsAPI = new APIAlerts()
