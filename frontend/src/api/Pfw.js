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

  addSiteVPN = (data) => this.put('sitevpns', data)
  updateSiteVPN = (data, index) => this.put(`sitevpns/${index}`, data)
  deleteSiteVPN = (index) => this.delete(`sitevpns/${index}`, {})

  addGroups = (data) => this.put('group', data)
  updateGroups = (data, index) => this.put(`group/${index}`, data)
  deleteGroups = (index) => this.delete(`group/${index}`, {})

  addTags = (data) => this.put('tag', data)
  updateTags = (data, index) => this.put(`tag/${index}`, data)
  deleteTags = (index) => this.delete(`tag/${index}`, {})

  getVariable = (name) => this.get(`variable/${name}`)
  addVariable = (name, value) => this.put(`variable/${name}`, value)
  deleteVariable = (name) => this.delete(`variable/${name}`)
  testExpression = (expr) => this.post('testExpression', expr)
}

export const pfwAPI = new APIPfw()
