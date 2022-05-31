import API from './API'

export class APIPfw extends API {
  constructor() {
    super('/plugins/pfw/')
  }

  config = () => {
    return this.get('config')
  }

  addForward = (data) => this.put('forward', data)
  deleteForward = (data) => this.delete('forward', data)

  addBlock = (data) => this.put('block', data)
  deleteBlock = (data) => this.delete('block', data)

  getVariable = (name) => this.get(`variable/${name}`)
  addVariable = (name, value) => this.put(`variable/${name}`, value)
  deleteVariable = (name) => this.delete(`variable/${name}`)
  testExpression = (expr) => this.post('testExpression', expr)
}

export const pfwAPI = new APIPfw()
