import API from './API'

export class APIDNSBlock extends API {
  constructor() {
    super('/plugins/dns/block')
  }

  config(){ return this.get('/config') }
  blocklists() { return  this.get('/blocklists')}
  putBlocklist(data) { return this.put('/blocklists', data) }
  deleteBlocklist(data) { return this.delete('/blocklists', data) }
  putOverride(data) { return this.put('/override', data) }
  deleteOverride(data) { return this.delete('/override', data) }
  metrics(){ return this.get('/metrics') }
  setRefresh(seconds) { return this.put(`/setRefresh?seconds=${seconds}`);  }
}

export class APIDNSLog extends API {
  constructor() {
    super('/plugins/dns/log')
  }

  config() {
    return this.get('/config');
  }

  hostPrivacyList() {
    return this.get('/host_privacy_list');
  }

  putHostPrivacyList(data) {
    return this.put('/host_privacy_list', data);
  }

  domainIgnores() {
    return this.get('/domain_ignores');
  }

  //putDomainIgnores = (data) => this.put(`/domain_ignores`, data)
  putDomainIgnore(item) {
    return this.put(`/domain_ignore/${item}`, {});
  }
  deleteDomainIgnore(item) {
    return this.delete(`/domain_ignore/${item}`, {});
  }
  /*
  history(ip) {
    return this.get(`/history/${ip}`, {});
  }
  deleteHistory(ip) {
    return this.delete(`/history/${ip}`);
  }
  */

}

export const blockAPI = new APIDNSBlock()
export const logAPI = new APIDNSLog()
