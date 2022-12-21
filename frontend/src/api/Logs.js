import API from './API'

export class APILogs extends API {
  constructor() {
    super('/')
  }

  latest(){ return this.get('logs') }
}

export const logsAPI = new APILogs()
