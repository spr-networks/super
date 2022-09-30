import API from './API'

export default API
export {
  api,
  testLogin,
  saveLogin,
  getApiURL,
  setApiURL,
  getApiHostname
} from './API'
export { connectWebsocket } from './WebSocket'
export { deviceAPI } from './Device'
export { groupAPI } from './Group'
export { wifiAPI } from './Wifi'
export { trafficAPI } from './Traffic'
export { blockAPI, logAPI } from './DNS'
export { nfmapAPI } from './Nfmap'
export { wireguardAPI } from './Wireguard'
export { logsAPI } from './Logs'
export { pluginAPI } from './Plugin'
export { firewallAPI } from './Firewall'
export { authAPI } from './Auth'
export { pfwAPI } from './Pfw'
export { notificationsAPI } from './Notifications'
export { meshAPI } from './mesh'
