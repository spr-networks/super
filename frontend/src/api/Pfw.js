import API from './API'

export class APIPfw extends API {
  constructor() {
    super('/plugins/pfw/')
  }

  config = () => {
    return this.get('config')
  }

  addForward = (data) => this.put('forward', data)
  updateForward = (data, index) => this.put(`forward/${index}`, data)
  deleteForward = (index) => this.delete(`forward/${index}`, {})

  addBlock = (data) => this.put('block', data)
  updateBlock = (data, index) => this.put(`block/${index}`, data)
  deleteBlock = (index) => this.delete(`block/${index}`, {})

  getVariable = (name) => this.get(`variable/${name}`)
  addVariable = (name, value) => this.put(`variable/${name}`, value)
  deleteVariable = (name) => this.delete(`variable/${name}`)
  testExpression = (expr) => this.post('testExpression', expr)
}

export const pfwAPI = new APIPfw()
