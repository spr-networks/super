import { nfmapAPI } from 'api/Nfmap'

const elem = [
  [
    { concat: ['192.168.2.30', 'wlan0', '74:ac:b9:e8:01:b4'] },
    { accept: null }
  ]
]

const mapObj = {
  family: 'inet',
  name: 'ethernet_filter',
  table: 'filter',
  type: ['ipv4_addr', 'ifname', 'ether_addr'],
  map: 'verdict',
  elem
}

describe('nfmap verdict map parsing', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  const expectParsed = (results) => {
    expect(results.length).toBe(1)
    expect(results[0].ipv4_addr).toBe('192.168.2.30')
    expect(results[0].ifname).toBe('wlan0')
    expect(results[0].ether_addr).toBe('74:ac:b9:e8:01:b4')
  }

  it('parses nft -j output with metainfo at index 0', async () => {
    jest.spyOn(nfmapAPI, 'get').mockResolvedValue({
      nftables: [{ metainfo: { json_schema_version: 1 } }, { map: mapObj }]
    })

    expectParsed(await nfmapAPI.getNFVerdictMap('ethernet_filter'))
  })

  // regression: v1.2.1 returned a single-element nftables array and the
  // parser crashed with "e.nftables[1] is undefined"
  it('parses output without a metainfo element', async () => {
    jest.spyOn(nfmapAPI, 'get').mockResolvedValue({
      nftables: [{ map: mapObj }]
    })

    expectParsed(await nfmapAPI.getNFVerdictMap('ethernet_filter'))
  })

  it('returns empty for an empty map', async () => {
    jest.spyOn(nfmapAPI, 'get').mockResolvedValue({
      nftables: [{ metainfo: {} }, { map: { ...mapObj, elem: undefined } }]
    })

    expect(await nfmapAPI.getNFVerdictMap('ethernet_filter')).toEqual([])
  })
})
