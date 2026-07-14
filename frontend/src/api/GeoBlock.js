import API from './API'

export class APIGeoBlock extends API {
  constructor() {
    super('')
  }

  config() {
    return this.get('/firewall/geo_block/config')
  }

  setConfig(cfg) {
    return this.put('/firewall/geo_block/config', cfg)
  }

  status() {
    return this.get('/firewall/geo_block/status')
  }

  refresh() {
    return this.put('/firewall/geo_block/refresh')
  }

  blockCountry(cc) {
    return this.put(`/firewall/geo_block/country/${cc}`)
  }

  unblockCountry(cc) {
    return this.delete(`/firewall/geo_block/country/${cc}`)
  }

  blockASN(asn) {
    return this.put(`/firewall/geo_block/asn/${asn}`)
  }

  unblockASN(asn) {
    return this.delete(`/firewall/geo_block/asn/${asn}`)
  }

  asnSearch(query) {
    return this.get(`/plugins/lookup/asn_search/${query}`)
  }
}

export const geoBlockAPI = new APIGeoBlock()
