import API from './API'

export class APIPlugin extends API {
  constructor() {
    super('')
  }

  list() {
    return this.get('/plugins')
  }
  add(data) {
    return this.put(`/plugins/${data.Name}`, data)
  }
  update(data) {
    return this.add(data)
  }
  remove(data) {
    return this.delete(`/plugins/${data.Name}`, data)
  }
  getPlusToken() {
    return this.get('/plusToken')
  }
  validPlusToken() {
    return this.get('/plusTokenValid')
  }
  setPlusToken(data) {
    return this.put('/plusToken', data)
  }
  stopPlusExtension(name) {
    return this.put(`/stopPlusExtension`, name)
  }
  startPlusExtension(name) {
    return this.put(`/startPlusExtension`, name)
  }
}

export const pluginAPI = new APIPlugin()
