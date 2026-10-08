import React from 'react'
import { fireEvent, render } from 'test-utils'
import InputSelect from 'components/InputSelect'

test('clearing a selector text field keeps an empty string', () => {
  const onChangeText = jest.fn()
  const view = render(
    <InputSelect
      title="Value"
      value="original"
      options={[]}
      onChangeText={onChangeText}
      isDisabled={false}
    />
  )

  const input = view.getByPlaceholderText('Value')
  fireEvent.changeText(input, null)

  expect(input.props.value).toBe('')
  expect(onChangeText).toHaveBeenCalledWith('')
})

test('a missing initial selector value renders as empty text', () => {
  const view = render(
    <InputSelect title="Value" value={null} options={[]} isDisabled={false} />
  )

  expect(view.getByPlaceholderText('Value').props.value).toBe('')
})

test('multiple selector text still reports a list of values', () => {
  const onChangeText = jest.fn()
  const view = render(
    <InputSelect
      title="Tags"
      value=""
      options={[]}
      isMultiple
      isDisabled={false}
      onChangeText={onChangeText}
    />
  )

  fireEvent.changeText(view.getByPlaceholderText('Tags'), 'one,two')

  expect(onChangeText).toHaveBeenCalledWith(['one', 'two'])
})
