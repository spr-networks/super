/*import React from 'react'
import { render, screen } from '@testing-library/react'
import App from '../App'

describe('App', () => {
  test('renders without crashing', () => {
    const { baseElement } = render(<App />)
    expect(baseElement).toBeDefined()
  })

  it('renders login form', () => {
    render(<App />)
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
  })
})*/
import 'react-native'
import React from 'react'
import App from '../App'

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer'

it('renders correctly', () => {
  renderer.create(<App />)
})
