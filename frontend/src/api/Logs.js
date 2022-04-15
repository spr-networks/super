import API from './API'

export class APILogs extends API {
  constructor() {
    super('/')
  }

  latest = () => this.get('logs')
}

export const logsAPI = new APILogs()
