import API from './API'

export class APITheme extends API {
  constructor() {
    super('/')
  }

  list() {
    return this.get('customThemes')
  }
  save(themes) {
    return this.put('customThemes', themes)
  }
}

export const themeAPI = new APITheme()
