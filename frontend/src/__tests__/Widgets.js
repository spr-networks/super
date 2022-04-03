import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import WifiClientCount from 'components/Dashboard/HostapdWidgets'

describe('Widgets', () => {
  test('test num clients', async () => {
    const { baseElement } = render(<WifiClientCount />)
    expect(baseElement).toBeDefined()
    await waitFor(() => expect(screen.getByText(/2/)).toBeInTheDocument())
  })
})
