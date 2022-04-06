import API from './API'

export class APINfmap extends API {
  constructor() {
    super('/nfmap')
  }

  translate(n) {
    if (n == 'wan') {
      return 'internet_access'
    } else if (n == 'dns') {
      return 'dns_access'
    } else if (n == 'lan') {
      return 'lan_access'
    } else if (n == 'dhcp') {
      return 'dhcp_access'
    }

    //tbd handle _dst_access also
    return n + '_mac_src_access'
  }

  getNFVerdictMap = (zone) => {
    this.get(this.translate(zone)).then((v) => {
      let vmap = v.nftables[1].map
      let results = []
      if (vmap.elem && vmap.type) {
        for (const device of vmap.elem) {
          let info = {}
          let i = 0
          for (const t of vmap.type) {
            info[t] = device[0].concat[i]
            i += 1
          }
          results.push(info)
        }
      }

      return results
    })
  }
}

export const nfmapAPI = new APINfmap()
