import { TimeScale } from 'chart.js'
import API from './API'

export class APIWifi extends API {
  constructor() {
    super('/')
  }

  config = () => this.get('hostapd/config')
  updateConfig = (config) => this.put('hostapd/config', config)
  setChannel = (params) => this.put('hostapd/setChannel', params)
  allStations = () => this.get('hostapd/all_stations')
  status = () => this.get('hostapd/status')
  arp = () => this.get('arp')
  ipAddr = () => this.get('ip/addr')
  ipLinkState = (iface, state) => this.put(`ip/link/${iface}/${state}`)
  iwDev = () => this.get('iw/dev')
  iwList = () => this.get('iw/list')
  iwScan = (iface) => this.get(`iw/dev/${iface}/scan`)
  asn = (ips) => {
    if (typeof ips === 'string') {
      ips = [ips]
    }

    return this.get(`/plugins/lookup/asn/${ips.join(',')}`)
  }
}

/*
modes, bandwidths, and channels

80 mhz
36 + 6

hw_mode=a
channel=36
vht_oper_centr_freq_seg0_idx=42

# 0 = 20 or 40 MHz operating Channel width
# 1 = 80 MHz channel width
# 2 = 160 MHz channel width
# 3 = 80+80 MHz channel width
#vht_oper_chwidth=1

36 = 5180

36+6 = 42

42 = 5210

========

149 = 5745
155 = 5775

5000 + channel * 5 = center freq

usage: <cs_count> <freq> [sec_channel_offset=] [center_freq1=] [center_freq2=] [bandwidth=] [blocktx] [ht|vht]
I further found out that cs_count stands ,switch channel after number of beacon frames

chan_switch 1 149

> chan_switch 1 5745 center_freq1=5775 bandwidth=80
FAIL
chanswitch: invalid frequency settings provided

OK
> <3>CTRL-EVENT-STARTED-CHANNEL-SWITCH freq=5745 ht_enabled=0 ch_offset=0 ch_width=20 MHz (no HT) cf1=5745 cf2=0 dfs=0
<3>CTRL-EVENT-CHANNEL-SWITCH freq=5745 ht_enabled=0 ch_offset=0 ch_width=20 MHz (no HT) cf1=5745 cf2=0 dfs=0
<3>AP-CSA-FINISHED freq=5745 dfs=0

this was okay?
but dropped to 20mhz


*/
export const wifiAPI = new APIWifi()
