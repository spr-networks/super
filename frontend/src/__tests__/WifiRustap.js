import {
  buildRustapRadioPatch,
  rustapBandFromFrequency,
  rustapBandFromMode,
  rustapModeFromBand,
  rustapSecondaryLink,
  rustapWidthsForBand
} from 'api/WifiRustap'

describe('RustAP radio configuration', () => {
  test('keeps 5 and 6 GHz channel numbers unambiguous', () => {
    expect(rustapBandFromFrequency(5180)).toBe(5)
    expect(rustapBandFromFrequency(6135)).toBe(6)
    expect(rustapModeFromBand(6)).toBe('6')
    expect(rustapBandFromMode('6')).toBe(6)
  })

  test('uses widths supported by the selected native band', () => {
    expect(rustapWidthsForBand(2.4)).toEqual([20, 40])
    expect(rustapWidthsForBand(5)).toEqual([20, 40, 80, 160])
    expect(rustapWidthsForBand(6)).toEqual([20, 40, 80, 160, 320])
  })

  test('edits native MLO links without replacing configured link IDs', () => {
    const config = {
      link_id: 4,
      mld_links: [
        {
          link_id: 4,
          mac: '02:00:00:00:00:04',
          channel: 36,
          width: 80,
          band: 5
        },
        {
          link_id: 7,
          mac: '02:00:00:00:00:07',
          channel: 37,
          width: 160,
          band: 6
        }
      ]
    }
    expect(rustapSecondaryLink(config).link_id).toBe(7)

    const patch = buildRustapRadioPatch({
      config,
      channel: 149,
      width: 160,
      mode: 'a',
      phy: 'be',
      mld: true,
      secondaryBand: 6,
      secondaryChannel: 69,
      secondaryWidth: 160,
      secondaryLinkID: 7
    })

    expect(patch).toMatchObject({
      channel: 149,
      width: 160,
      band: 5,
      phy: 'be',
      mld: true
    })
    expect(patch.mld_links).toEqual([
      {
        link_id: 4,
        channel: 149,
        width: 160,
        band: 5
      },
      {
        link_id: 7,
        channel: 69,
        width: 160,
        band: 6
      }
    ])
  })

  test('disabling MLO emits no link rewrite', () => {
    expect(
      buildRustapRadioPatch({
        config: {},
        channel: 36,
        width: 80,
        mode: 'a',
        phy: 'be',
        mld: false
      })
    ).toEqual({
      channel: 36,
      width: 80,
      band: 5,
      phy: 'be',
      mld: false
    })
  })
})
