import API from './API'

export class APIAuth extends API {
  constructor() {
    super('/')
  }

  tokens() {
    return this.get('tokens');
  }

  putToken(Name, Expire, ScopedPaths) {
    return this.put('tokens', { Expire, Name, ScopedPaths });
  }

  deleteToken(Token) {
    return this.delete('tokens', { Token });
  }

  registerOTP(Otp) {
    return this.put('otp_register', {Name: 'admin', Code: Otp})
  }

  validateOTP(Otp, UpdateAlwaysOn=false, AlwaysOn=false) {
    let v = {Name: 'admin', Code: Otp}
    if (UpdateAlwaysOn) {
      v["UpdateAlwaysOn"] = UpdateAlwaysOn
      v["AlwaysOn"] = AlwaysOn
    }
    return this.put('otp_validate', v)
  }

  statusOTP(name='admin') {
    return this.get(`otp_status?name=${name}`)
  }
}

export const authAPI = new APIAuth()
