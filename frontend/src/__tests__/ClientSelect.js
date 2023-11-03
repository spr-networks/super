import 'react-native'
import React from 'react'
import { cleanup, render, screen, fireEvent, waitFor } from 'test-utils'

import ClientSelect from 'components/ClientSelect'

afterEach(cleanup)

it('renders single client select', async () => {
  const onChange = jest.fn()

  const utils = render(<ClientSelect onChange={onChange} />)

  expect(screen.getByPlaceholderText('Select Client')).toBeTruthy()

  //await waitFor(() => expect(screen.getByText('rpi4')).toNotBeTruthy())

  expect(onChange).toHaveBeenCalledTimes(0)
})
