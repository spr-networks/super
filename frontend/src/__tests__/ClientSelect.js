import 'react-native'
import React from 'react'
import {
  cleanup,
  render,
  fireEvent,
  waitFor
} from '@testing-library/react-native'
import { NativeBaseProvider } from 'native-base'

import ClientSelect from 'components/ClientSelect'

afterEach(cleanup)

it('renders single client select', async () => {
  const onChange = jest.fn()

  const inset = {
    frame: { x: 0, y: 0, width: 0, height: 0 },
    insets: { top: 0, left: 0, right: 0, bottom: 0 }
  }

  const { container } = render(
    <NativeBaseProvider initialWindowMetrics={inset}>
      <ClientSelect onChange={onChange} />
    </NativeBaseProvider>
  )

  await waitFor(() => {
    expect(container).toBeDefined()
  })

  expect(onChange).toHaveBeenCalledTimes(0)
})
