import API from './API'

export class APINotifications extends API {
  constructor() {
    super('')
  }

  list() {
    return this.get('/notifications')
  }

  add(data) {
    return this.put('/notifications', data)
  }

  update(index, data) {
    return this.put(`/notifications/${index}`, data)
  }

  remove(index) {
    return this.delete(`/notifications/${index}`, {})
  }
}

export const notificationsAPI = new APINotifications()
