import API from './API'

export default API
export {
  api,
  testLogin,
  saveLogin,
  saveTokenLogin,
  clearLogin,
  getApiURL,
  setApiURL,
  isMockAPI,
  getApiHostname,
  getWsURL,
  setJWTOTPHeader,
  setAuthReturn,
  getAuthReturn
} from './API'
export { dbAPI } from './Db'
export { deviceAPI } from './Device'
export { groupAPI } from './Group'
export { wifiAPI } from './Wifi'
export { trafficAPI } from './Traffic'
export { trafficInsightsAPI } from './TrafficInsights'
export { geoBlockAPI } from './GeoBlock'
export { blockAPI, logAPI } from './DNS'
export { nfmapAPI } from './Nfmap'
export { wireguardAPI } from './Wireguard'
export { logsAPI } from './Logs'
export { pluginAPI } from './Plugin'
export { classifyAPI } from './Classify'
export { firewallAPI } from './Firewall'
export { authAPI } from './Auth'
export { pfwAPI } from './Pfw'
export { notificationsAPI } from './Notifications'
export { alertsAPI } from './Alerts'
export { meshAPI } from './mesh'
export { themeAPI } from './Theme'
export { topologyAPI } from './Topology'
export { parentalAPI } from './ParentalControls'
export { wanAPI } from './Wan'
