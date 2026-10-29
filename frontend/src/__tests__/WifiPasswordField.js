import React from 'react'
import { Platform, StyleSheet } from 'react-native'
import { Input } from '@gluestack-ui/themed'
import { fireEvent, render, screen } from '@testing-library/react-native'

import WifiPasswordField from 'components/WifiPasswordField'

const realOS = Platform.OS

afterEach(() => {
  Platform.OS = realOS
})

const renderField = (props = {}) => {
  const onChangeText = jest.fn()
  render(
    <Input>
      <WifiPasswordField testID="psk" onChangeText={onChangeText} {...props} />
    </Input>
  )
  return { field: screen.getByTestId('psk'), onChangeText }
}

describe('WifiPasswordField', () => {
  it('is a masked text input on web so browsers do not offer to save it', () => {
    Platform.OS = 'web'
    const { field, onChangeText } = renderField()

    expect(field.props.secureTextEntry).toBe(false)
    expect(field.props.autoComplete).toBe('off')
    expect(field.props.autoCorrect).toBe(false)
    expect(field.props.spellCheck).toBe(false)
    expect(StyleSheet.flatten(field.props.style).WebkitTextSecurity).toBe(
      'disc'
    )

    fireEvent.changeText(field, 'correct horse')
    expect(onChangeText).toHaveBeenCalledWith('correct horse')
  })

  it('is a secure input on native', () => {
    Platform.OS = 'ios'
    const { field, onChangeText } = renderField()

    expect(field.props.secureTextEntry).toBe(true)
    expect(StyleSheet.flatten(field.props.style)?.WebkitTextSecurity).toBe(
      undefined
    )

    fireEvent.changeText(field, 'correct horse')
    expect(onChangeText).toHaveBeenCalledWith('correct horse')
  })

  it('passes field props through', () => {
    Platform.OS = 'web'
    const { field } = renderField({ value: 'secret12', autoFocus: true })

    expect(field.props.value).toBe('secret12')
    expect(field.props.autoFocus).toBe(true)
  })
})
