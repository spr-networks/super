import { FontAwesomeIcon as nativeFontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { FontAwesomeIcon as reactFontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Platform } from 'react-native'

export * from '@fortawesome/react-native-fontawesome'

const FontAwesomeIcon =
  Platform.OS === 'web' ? reactFontAwesomeIcon : nativeFontAwesomeIcon

export { FontAwesomeIcon }
