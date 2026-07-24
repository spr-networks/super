// Browser builds intentionally have no credential-store implementation.
// React Native resolves SecureStore.native.js instead.
export const getBiometryType = async () => null

export const saveSecureLogin = async () => {
  throw new Error('secure storage unavailable')
}

export const loadSecureLogin = async () => null

export const clearSecureLogin = async () => {}
