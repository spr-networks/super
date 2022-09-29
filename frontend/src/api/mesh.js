import API from './API'

export default class APIMesh extends API {
  constructor() {
    super('/plugins/mesh/')
  }

  config = () => this.get(`config`)
  leafMode = () => this.get(`leafMode`)
  setLeafMode = (mode) => this.put(`leafMode/${mode}`)
  leafRouters = () => this.get(`leafRouters`)
  addLeafRouter = (data) => this.put(`leafRouter`, data)
  delLeafRouter = (data) => this.delete(`leafRouter`, data)
  setParentCredentials = (data) => this.put(`setParentCredentials`, data)
}

export const meshAPI = new APIMesh()
