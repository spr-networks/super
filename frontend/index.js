// native app entrypoint
import { AppRegistry, LogBox } from 'react-native'
import App from './src/App'
import { name as appName } from './app.json'

// should be fixed in next native-base + use React 18
LogBox.ignoreLogs(['When server rendering'])

AppRegistry.registerComponent(appName, () => App)
