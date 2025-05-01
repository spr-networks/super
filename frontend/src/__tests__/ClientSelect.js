import 'react-native'
import React from 'react'
import { render, waitFor } from 'test-utils'
import ClientSelect from 'components/ClientSelect'
import { deviceAPI, groupAPI, firewallAPI } from 'api'

// Minimal mock just for what we need to test
jest.mock('api', () => ({
  deviceAPI: {
    list: jest.fn().mockResolvedValue({
      'rpi4': {
        Name: 'rpi4',
        RecentIP: '192.168.1.100',
        Style: { Icon: 'Server', Color: '$blue500' },
        DeviceTags: ['server', 'raspberry-pi']
      }
    })
  },
  groupAPI: {
    list: jest.fn().mockResolvedValue([
      { Name: 'HomeNetwork' },
      { Name: 'GuestNetwork' }
    ])
  },
  firewallAPI: {
    config: jest.fn().mockResolvedValue({
      Endpoints: [
        { RuleName: 'WebServer' },
        { RuleName: 'SSH' }
      ]
    })
  }
}))

it('renders client select component', async () => {
  // Create a mock function to track calls to onChange
  const onChange = jest.fn()

  // Render the component
  const { queryByText, getByDisplayValue } = render(
    <ClientSelect
      value="192.168.1.100"
      onChange={onChange}
    />
  )

  // Verify the component rendered without throwing errors
  // and that the API was called during initialization
  await waitFor(() => {
    expect(deviceAPI.list).toHaveBeenCalled()
  })

  // Verify helper text is rendered
  expect(queryByText(/click to select from options/i)).toBeTruthy()

  // Verify that rpi4 is displayed
  await waitFor(() => {
    const input = getByDisplayValue('rpi4')
    expect(input).toBeTruthy()
  })

  // Ensure no onChange calls happened during rendering
  expect(onChange).toHaveBeenCalledTimes(0)
})

it('makes appropriate API calls when groups and tags are enabled', async () => {
  // Create a mock function for onChange
  const onChange = jest.fn()

  // Reset mock call counts
  jest.clearAllMocks()

  // Render the component with groups and tags enabled
  render(
    <ClientSelect
      onChange={onChange}
      showGroups={true}
      showTags={true}
      showEndpoints={true}
    />
  )

  // Wait for API calls to complete
  await waitFor(() => {
    expect(deviceAPI.list).toHaveBeenCalled()
    expect(groupAPI.list).toHaveBeenCalled()
    expect(firewallAPI.config).toHaveBeenCalled()
  })

  // Verify that all the appropriate APIs were called
  expect(groupAPI.list).toHaveBeenCalledTimes(1)
  expect(firewallAPI.config).toHaveBeenCalledTimes(1)
})
