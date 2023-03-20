import API from './API'

export class APINfmap extends API {
  constructor() {
    super('/nfmap')
  }

  translate(n) {
    if (['wan', 'dns', 'lan', 'dhcp'].includes(n)) {
      n = n.replace('wan', 'internet')
      return `${n}_access`
    }

    return n
  }

  getNFVerdictMap(group) {
    return this.get('/' + this.translate(group)).then((v) => {
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
