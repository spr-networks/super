import API from './API'

export class APIParentalControls extends API {
  constructor() {
    super('/parentalControls/')
  }

  personas() {
    return this.get('personas')
  }
  savePersona(persona) {
    return this.put('personas', persona)
  }
  deletePersona(persona) {
    return this.delete('personas', persona)
  }
  usage() {
    return this.get('usage')
  }
  pause(tag, minutes) {
    return this.put('pause', { Tag: tag, Minutes: minutes })
  }
  extend(tag, minutes) {
    return this.put('extend', { Tag: tag, Minutes: minutes })
  }
  reset(tag) {
    return this.put('reset', { Tag: tag })
  }
}

export const parentalAPI = new APIParentalControls()
