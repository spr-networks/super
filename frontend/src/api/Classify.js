import API from './API'

export class APIClassify extends API {
  constructor() {
    super('/plugins/lookup/')
  }

  health() {
    return this.get('/health')
  }

  list() {
    return this.get('/classifications')
  }

  getClassification(mac) {
    return this.get(`/classification/${encodeURIComponent(mac)}`)
  }

  classify(signals) {
    return this.put('/classify', signals)
  }

  correct(mac, data) {
    return this.put(
      `/classification/${encodeURIComponent(mac)}/correction`,
      data
    )
  }

  clearCorrection(mac) {
    return this.delete(
      `/classification/${encodeURIComponent(mac)}/correction`,
      {}
    )
  }

  signals(mac) {
    return this.get(`/classification/${encodeURIComponent(mac)}/signals`)
  }

  customFingerprints() {
    return this.get('/fingerprints/custom')
  }

  setCustomFingerprints(rules) {
    return this.put('/fingerprints/custom', rules)
  }

  builtinFingerprints() {
    return this.get('/fingerprints/builtin')
  }

  setBuiltinFingerprints(rules) {
    return this.put('/fingerprints/builtin', rules)
  }

  resetBuiltinFingerprints() {
    return this.delete('/fingerprints/builtin', {})
  }
}

export const classifyAPI = new APIClassify()
