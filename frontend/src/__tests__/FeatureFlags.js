import React from 'react'

import { AlertContext, AppContext } from 'AppContext'
import { fireEvent, render, screen, waitFor } from 'test-utils'
import { featureFlagsAPI } from 'api'
import { APIFeatureFlags } from 'api/FeatureFlags'
import FeatureFlags from 'views/System/FeatureFlags'

describe('Feature Flags settings', () => {
  const alerts = {
    success: jest.fn(),
    error: jest.fn()
  }

  beforeEach(() => {
    jest.restoreAllMocks()
    alerts.success.mockClear()
    alerts.error.mockClear()
  })

  it('uses the feature flag configuration endpoint', () => {
    const client = new APIFeatureFlags()
    client.get = jest.fn()
    client.put = jest.fn()

    client.list()
    client.save(['rustap'])

    expect(client.get).toHaveBeenCalledWith('featureFlags')
    expect(client.put).toHaveBeenCalledWith('featureFlags', ['rustap'])
  })

  it('loads and saves the supported feature flags', async () => {
    const setFeatureFlags = jest.fn()
    jest.spyOn(featureFlagsAPI, 'list').mockResolvedValue(['rustap'])
    jest
      .spyOn(featureFlagsAPI, 'save')
      .mockResolvedValue(['rustap', 'webllm'])

    render(
      <AlertContext.Provider value={alerts}>
        <AppContext.Provider value={{ setFeatureFlags }}>
          <FeatureFlags />
        </AppContext.Provider>
      </AlertContext.Provider>
    )

    const rustap = await screen.findByLabelText('Enable RustAP')
    const webllm = screen.getByLabelText('Enable WebLLM')
    expect(rustap.props.value).toBe(true)
    expect(webllm.props.value).toBe(false)
    expect(setFeatureFlags).toHaveBeenCalledWith(['rustap'])

    fireEvent(webllm, 'valueChange', true)

    await waitFor(() => {
      expect(featureFlagsAPI.save).toHaveBeenCalledWith(['rustap', 'webllm'])
    })
    expect(setFeatureFlags).toHaveBeenLastCalledWith([
      'rustap',
      'webllm'
    ])
    expect(alerts.success).toHaveBeenCalledWith('Feature flags updated')
  })
})
