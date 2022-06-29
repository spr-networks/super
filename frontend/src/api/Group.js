import API from './API'

export class APIGroup extends API {
  constructor() {
    super('')
  }

  list = () => this.get('/groups')
  groups = () => this.get('/groups').then((res) => res.map((g) => g.Name))
}

export const groupDescriptions = {
  dns: 'Outbound DNS Access',
  wan: 'Outbound Internet Access',
  lan: 'LAN access',
  isolated:
    'No access. By default devices without a group are treated as isolated'
}

export const groupAPI = new APIGroup()
