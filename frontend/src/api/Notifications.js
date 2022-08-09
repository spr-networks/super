import API from './API'

export class APINotifications extends API {
  constructor() {
    super('')
  }

  list = () => this.get('/notifications')
  add = (data) => this.put('/notifications', data)
  update = (index, data) => this.put(`/notifications/${index}`, data)
  remove = (index, data = {}) => this.delete(`/notifications/${index}`, data)
}

export const notificationsAPI = new APINotifications()
