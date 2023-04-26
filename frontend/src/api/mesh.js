import API from './API'

export default class APIMesh extends API {
  constructor() {
    super('/plugins/mesh/')
  }

  config() {
    return this.get(`config`);
  }

  leafMode() {
    return this.get(`leafMode`);
  }

  setLeafMode(mode) {
    return this.put(`leafMode/${mode}`);
  }

  leafRouters() {
    return this.get(`leafRouters`);
  }

  addLeafRouter(data) {
    return this.put(`leafRouter`, data);
  }

  delLeafRouter(data) {
    return this.delete(`leafRouter`, data);
  }

  setParentCredentials(data) {
    return this.put(`setParentCredentials`, data);
  }

  setSSID(data) {
    return this.put(`setSSID`, data);
  }

  meshIter(protocb) {
    return this.leafRouters().then((routers) => {
      if (routers == null) {
        return
      }
      let apis = []
      for (let i = 0; i < routers.length; i++) {
        let r = protocb()
        r.setRemoteURL('http://' + routers[i].IP + '/')
        r.setAuthTokenHeaders(routers[i].APIToken)
        apis.push(r)
      }
      return apis
    })
  }
}

export const meshAPI = new APIMesh()
