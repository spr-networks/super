import * as Keychain from 'react-native-keychain'

const SERVICE = 'org.supernetworks.spr.login'

// react-native-keychain throws synchronously when its native module is
// missing (e.g. a build without the pod); await inside try so both sync
// throws and rejections resolve to null.
export const getBiometryType = async () => {
  try {
    return await Keychain.getSupportedBiometryType()
  } catch (e) {
    return null
  }
}

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
