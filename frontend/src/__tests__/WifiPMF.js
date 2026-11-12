import 'react-native'
import React from 'react'
import { act, render, waitFor } from 'test-utils'
import { Switch } from '@gluestack-ui/themed'
import { AlertContext } from 'AppContext'
import { deviceAPI, wifiAPI } from 'api'
import { pmfAdvice, pmfLockedOn, pmfStationSummary } from 'api/WifiPMF'
import WifiPMF from 'components/Wifi/WifiPMF'

jest.mock('api', () => ({
  wifiAPI: { allStations: jest.fn(), updateConfig: jest.fn() },
  deviceAPI: { list: jest.fn() }
}))

const stations = {
  '5c:fc:e1:5d:13:e7': {
    flags: '[AUTH][ASSOC][AUTHORIZED][SHORT_PREAMBLE][WMM][HT]'
  },
  '1c:6a:1b:87:63:71': {
    flags: '[AUTH][ASSOC][AUTHORIZED][SHORT_PREAMBLE][WMM][MFP][HT]'
  }
}

describe('PMF suggestion', () => {
  test('locks PMF on only for 6 GHz radios', () => {
    expect(pmfLockedOn({ op_class: 134 })).toBe(true)
    expect(pmfLockedOn({ he_6ghz_reg_pwr_type: 0 })).toBe(true)
    expect(pmfLockedOn({ op_class: 128, mld: true })).toBe(false)
    expect(pmfLockedOn({ hw_mode: 'g' })).toBe(false)
  })

  test('names connected devices that did not negotiate PMF', () => {
    const summary = pmfStationSummary(stations, {
      '5c:fc:e1:5d:13:e7': { Name: 'thermostat' }
    })
    expect(summary).toEqual({ connected: 2, legacy: ['thermostat'] })
    const advice = pmfAdvice({ hw_mode: 'g' }, summary)
    expect(advice.suggest).toBe(false)
    expect(advice.text).toContain('1 of 2')
    expect(advice.text).toContain('thermostat')
  })

  test('suggests requiring PMF when every connected device uses it', () => {
    const summary = pmfStationSummary(
      { '1c:6a:1b:87:63:71': stations['1c:6a:1b:87:63:71'] },
      {}
    )
    expect(pmfAdvice({ hw_mode: 'a' }, summary).suggest).toBe(true)
  })

  test('does not suggest without stations, when required, or on 6 GHz', () => {
    const summary = { connected: 1, legacy: [] }
    expect(pmfAdvice({}, { connected: 0, legacy: [] }).suggest).toBe(false)
    expect(pmfAdvice({}, null).suggest).toBe(false)
    expect(pmfAdvice({ pmf_required: true }, summary).suggest).toBe(false)
    expect(pmfAdvice({ op_class: 133 }, summary).suggest).toBe(false)
  })
})

describe('PMF setting', () => {
  const alerts = () => ({
    error: jest.fn(),
    success: jest.fn(),
    info: jest.fn()
  })

  const renderPMF = (config, onUpdate = jest.fn(), alertsValue = alerts()) => {
    const view = render(
      <AlertContext.Provider value={alertsValue}>
        <WifiPMF iface="wlan3" config={config} onUpdate={onUpdate} />
      </AlertContext.Provider>
    )
    return { ...view, onUpdate, alerts: alertsValue }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    wifiAPI.allStations.mockResolvedValue(stations)
    deviceAPI.list.mockResolvedValue({
      '5c:fc:e1:5d:13:e7': { Name: 'thermostat' }
    })
    wifiAPI.updateConfig.mockResolvedValue({ pmf_required: true })
  })

  it('warns which connected devices lack PMF and saves the choice', async () => {
    const { UNSAFE_getByType, findByText, onUpdate } = renderPMF({
      hw_mode: 'g',
      pmf_required: false
    })
    expect(
      await findByText(/1 of 2 connected devices.*thermostat/)
    ).toBeTruthy()
    const toggle = UNSAFE_getByType(Switch)
    expect(toggle.props.value).toBe(false)
    await act(async () => toggle.props.onValueChange(true))
    expect(wifiAPI.updateConfig).toHaveBeenLastCalledWith('wlan3', {
      Pmf_required: true
    })
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith({ pmf_required: true })
    )
  })

  it('suggests requiring PMF when every client supports it', async () => {
    wifiAPI.allStations.mockResolvedValue({
      '1c:6a:1b:87:63:71': stations['1c:6a:1b:87:63:71']
    })
    const { findByText, getByText } = renderPMF({ hw_mode: 'a' })
    expect(await findByText(/Requiring PMF is recommended/)).toBeTruthy()
    expect(getByText('Suggested')).toBeTruthy()
  })

  it('shows PMF as always on for 6 GHz', async () => {
    const { UNSAFE_getByType, findByText } = renderPMF({ op_class: 134 })
    expect(await findByText('Always required on 6 GHz.')).toBeTruthy()
    const toggle = UNSAFE_getByType(Switch)
    expect(toggle.props.value).toBe(true)
    expect(toggle.props.isDisabled).toBe(true)
  })

  it('reports a failed change', async () => {
    wifiAPI.updateConfig.mockRejectedValueOnce('bad request')
    const { UNSAFE_getByType, alerts: a, onUpdate } = renderPMF({
      hw_mode: 'g'
    })
    await act(async () => UNSAFE_getByType(Switch).props.onValueChange(true))
    await waitFor(() =>
      expect(a.error).toHaveBeenCalledWith('PMF update failed', 'bad request')
    )
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
