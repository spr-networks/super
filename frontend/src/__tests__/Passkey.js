import { api } from '../api/API'
import { loginPasskey } from '../api/Passkey'

describe('passkey finish request', () => {
  it('sends the WebAuthn session in the POST body, not the URL', async () => {
    const credential = {
      id: 'credential-id',
      rawId: Uint8Array.from([1, 2]).buffer,
      type: 'public-key',
      response: {
        clientDataJSON: Uint8Array.from([3]).buffer,
        authenticatorData: Uint8Array.from([4]).buffer,
        signature: Uint8Array.from([5]).buffer,
        userHandle: Uint8Array.from([6]).buffer
      }
    }
    const get = jest.fn().mockResolvedValue(credential)
    Object.defineProperty(window.navigator, 'credentials', {
      configurable: true,
      value: { get }
    })
    api.put = jest.fn().mockResolvedValue({
      Session: 'secret-session',
      Options: { publicKey: { challenge: 'AQ' } }
    })
    api.request = jest.fn().mockResolvedValue({ Token: 'login-token' })

    await loginPasskey()

    expect(api.put).toHaveBeenCalledWith('/webauthn/login')
    expect(get).toHaveBeenCalledTimes(1)
    expect(api.request).toHaveBeenCalledWith('POST', '/webauthn/login', {
      session: 'secret-session',
      credential: {
        id: 'credential-id',
        rawId: 'AQI',
        type: 'public-key',
        response: {
          clientDataJSON: 'Aw',
          authenticatorData: 'BA',
          signature: 'BQ',
          userHandle: 'Bg'
        }
      }
    })
  })
})
