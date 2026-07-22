import API from './API'

const pluginManagementBase = '/plugins_api'

export class APIPlugin extends API {
  constructor() {
    super('')
  }

  list() {
    return this.get(`${pluginManagementBase}/`)
  }
  add(data) {
    return this.put(
      `${pluginManagementBase}/${encodeURIComponent(data.Name)}`,
      data
    )
  }
  update(data) {
    return this.add(data)
  }
  remove(data) {
    return this.delete(
      `${pluginManagementBase}/${encodeURIComponent(data.Name)}`,
      data
    )
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
  restart(name) {
    return this.put(
      `${pluginManagementBase}/${encodeURIComponent(name)}/restart`
    )
  }
  updateContainer(name) {
    return this.put(
      `${pluginManagementBase}/${encodeURIComponent(name)}/update_container`
    )
  }
  stopPlusExtension(name) {
    return this.put(`/stopPlusExtension`, name)
  }
  startPlusExtension(name) {
    return this.put(`/startPlusExtension`, name)
  }
}

export const pluginAPI = new APIPlugin()
