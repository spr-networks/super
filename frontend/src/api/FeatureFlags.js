import API from './API'

export class APIFeatureFlags extends API {
  constructor() {
    super('/')
  }

  list() {
    return this.get('featureFlags')
  }

  save(flags) {
    return this.put('featureFlags', flags)
  }
}

export const featureFlagsAPI = new APIFeatureFlags()
