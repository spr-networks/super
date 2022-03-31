import API from './index'

export class APIDevice extends API {
  constructor() {
    super('/')
  }

  list = () => this.get('/devices')
  //blocklists = () => this.get('/blocklists')
  //putBlocklist = data => this.put('/blocklists', data) 
}

export const deviceAPI = new APIDevice()
