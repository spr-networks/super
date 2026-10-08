import React from 'react'
import { fireEvent, render } from 'test-utils'
import AddEndpoint from 'components/Firewall/AddEndpoint'

test('clearing an endpoint tag keeps the form renderable', () => {
  const view = render(<AddEndpoint />)
  const tag = view.getByPlaceholderText('e.g. nas-access')

  fireEvent.changeText(tag, 'devices')
  fireEvent.changeText(tag, null)

  expect(tag.props.value).toBe('')
})
