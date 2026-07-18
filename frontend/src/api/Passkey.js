import { Platform } from 'react-native'
import { api } from './API'

const bufferDecode = (value) => {
  value = value.replace(/-/g, '+').replace(/_/g, '/')
  while (value.length % 4) {
    value += '='
  }
  return Uint8Array.from(window.atob(value), (c) => c.charCodeAt(0))
}

const bufferEncode = (value) =>
  window
    .btoa(String.fromCharCode.apply(null, new Uint8Array(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

const decodePublicKey = (publicKey) => {
  publicKey.challenge = bufferDecode(publicKey.challenge)
  if (publicKey.user?.id) {
    publicKey.user.id = bufferDecode(publicKey.user.id)
  }
  for (let key of ['excludeCredentials', 'allowCredentials']) {
    if (publicKey[key]) {
      publicKey[key] = publicKey[key].map((c) => ({
        ...c,
        id: bufferDecode(c.id)
      }))
    }
  }
  return publicKey
}

const encodeCredential = (credential) => {
  let response = {}
  for (let key of [
    'attestationObject',
    'clientDataJSON',
    'authenticatorData',
    'signature',
    'userHandle'
  ]) {
    if (credential.response[key]) {
      response[key] = bufferEncode(credential.response[key])
    }
  }
  return {
    id: credential.id,
    rawId: bufferEncode(credential.rawId),
    type: credential.type,
    response
  }
}

export const isPasskeySupported = () =>
  Platform.OS == 'web' &&
  typeof window !== 'undefined' &&
  !!window.PublicKeyCredential &&
  !!window.navigator?.credentials

const usePasskey = async (path, create = false, query = '') => {
  let begin = await api.put(path + query)
  let publicKey = decodePublicKey(begin.Options.publicKey)
  let credential = await window.navigator.credentials[
    create ? 'create' : 'get'
  ]({ publicKey })
  return api.request(
    'POST',
    `${path}?session=${begin.Session}`,
    encodeCredential(credential)
  )
}

export const validatePasskey = () => usePasskey('/webauthn/validate')

export const loginPasskey = () => usePasskey('/webauthn/login')

export const registerPasskey = (name = 'passkey') =>
  usePasskey('/webauthn/register', true, `?name=${encodeURIComponent(name)}`)
