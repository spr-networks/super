import React from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import ClientSelect from 'components/Helpers/ClientSelect'

afterEach(cleanup)

it('renders single client select', () => {
  const onChange = jest.fn()

  const { baseElement, container } = render(
    <ClientSelect onChange={onChange} />
  )

  expect(baseElement).toBeDefined()

  //const input = container.querySelector('input')
  expect(onChange).toHaveBeenCalledTimes(0)
})
