import React from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import Toggle from 'components/Toggle'

afterEach(cleanup)

it('checkbox changes state and calls onChange', () => {
  const onChange = jest.fn()

  const { baseElement, container } = render(<Toggle onChange={onChange} />)
  expect(baseElement).toBeDefined()

  const el = container.querySelector('input')
  fireEvent.click(el)
  expect(el).toBeChecked()

  fireEvent.click(el)
  expect(el).not.toBeChecked()

  expect(onChange).toHaveBeenCalledTimes(2)
})
