import 'react-native'
import React from 'react'
import { cleanup, render, screen, fireEvent, waitFor, within } from 'test-utils'

import ClientSelect from 'components/ClientSelect'

afterEach(cleanup)

it('renders single client select', async () => {
  const onChange = jest.fn()
  let value = 'rpi4'

  const utils = render(<ClientSelect value={value} onChange={onChange} />)

  expect(screen.getByPlaceholderText('Select Client')).toBeTruthy()
  /*
  expect(utils.getByRole('button')).toBeTruthy()
  console.log(screen.getAllByRole('button').length, 'buttons')
  fireEvent.press(expandbtn)
  */
  //await waitFor(() => expect(screen.getByText('rpi4')).toNotBeTruthy())

  expect(onChange).toHaveBeenCalledTimes(0)
})
