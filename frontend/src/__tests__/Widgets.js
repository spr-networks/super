import 'react-native'
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'

import { WifiClientCount } from 'components/Dashboard/WifiWidgets'

describe('Widgets', () => {
  test('test num clients', async () => {
    const { container, toJSON, getByText } = render(<WifiClientCount />)
    expect(container).toBeDefined()
    //expect(getByText('Active WiFi Clients')).toBeInTheDocument()
    //await waitFor(() => expect(getByText(/2/)).toBeInTheDocument())
  })
})
