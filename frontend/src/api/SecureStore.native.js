import * as Keychain from 'react-native-keychain'

const SERVICE = 'org.supernetworks.spr.login'

export const getBiometryType = () =>
  Keychain.getSupportedBiometryType().catch(() => null)

export const saveSecureLogin = async (payload) =>
  Keychain.setGenericPassword('spr', JSON.stringify(payload), {
    service: SERVICE,
    accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  })

export const loadSecureLogin = async () => {
  const result = await Keychain.getGenericPassword({
    service: SERVICE,
    authenticationPrompt: { title: 'Unlock SPR' }
  })
  return result ? JSON.parse(result.password) : null
}

export const clearSecureLogin = () =>
  Keychain.resetGenericPassword({ service: SERVICE }).catch(() => {})
