import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App', () => {

  test('renders without crashing', () => {
    const { baseElement } = render(<App />)
    expect(baseElement).toBeDefined()
  })

  it('renders login form', () => {
    render(<App />)
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
  })

})
