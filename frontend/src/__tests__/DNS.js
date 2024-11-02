import React from 'react'
import { render, screen, waitFor, waitForElementToBeRemoved } from 'test-utils'

import DNSBlock from 'views/DNS/DNSBlock'
import DNSAddBlocklist from 'components/DNS/DNSAddBlocklist'
//import DNSBlocklist from 'components/DNS/DNSBlocklist'
//import DNSOverrideList from 'components/DNS/DNSOverrideList'
import { saveLogin, blockAPI } from 'api'
import { fireEvent, within } from '@testing-library/react-native'

beforeAll(() => saveLogin('admin', 'admin'))

const setup = async () => {
  const utils = render(<DNSBlock />)

  await waitFor(() =>
    expect(
      screen.getAllByText(/BlockList Project/).length
    ).toBeGreaterThanOrEqual(5)
  )

  return utils
}

describe('DNS Blocklist', () => {
  test('DNS block lists loaded', async () => {
    await setup()

    await waitFor(() => {
      expect(
        screen.getAllByText('DNS Blocklists').length
      ).toBeGreaterThanOrEqual(1)
    })

    // wait fo async data
    await waitFor(() =>
      expect(
        screen.getAllByText(/BlockList Project/).length
      ).toBeGreaterThanOrEqual(5)
    )

    //expand menu
    await waitFor(() =>
      expect(
        screen.getAllByText(/BlockList Project/).length
      ).toBeGreaterThanOrEqual(5)
    )
  })

  test('disable blocklist item', async () => {
    await setup()

    //expand menu
    let expandbtn = screen.getAllByRole('button', { expanded: false })[0]
    expect(expandbtn).toBeTruthy()
    fireEvent.press(expandbtn)

    expect(screen.getByText('Disable')).toBeTruthy()
    expect(screen.getByText('Delete')).toBeTruthy()
    expect(screen.getByText('New Tag...')).toBeTruthy()
    expect(screen.getByText('Set Category...')).toBeTruthy()

    //let numEnabled = screen.getAllByText('Blocked').length

    fireEvent.press(screen.getByText('Disable'))

    /*
    await waitFor(() =>
      expect(screen.getAllByText('Block Enabled').length).toBeLessThan(numEnabled)
    )*/
    
  })
})

test('press Add to show form', async () => {
  await setup()

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy()
  })

  fireEvent.press(screen.getByRole('button', { name: 'Add' }))

  await waitFor(() => {
    expect(screen.getByText('Add DNS Blocklist')).toBeTruthy()
  })

  //TODO fill out form && verify submit works
  //Also have separate test for add component
})

describe('DNS Blocklist Add', () => {
  test('verify add form works', async () => {
    const onChange = jest.fn()
    const utils = render(<DNSAddBlocklist notifyChange={onChange} />)

    const input = screen.getByPlaceholderText('https://...')
    expect(input).toBeTruthy()

    expect(onChange).toHaveBeenCalledTimes(0)

    fireEvent.changeText(input, 'http://test.spr/test-blocklist.txt')

    fireEvent.press(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1)
    })
  })
})

describe('DNS block API', () => {
  test('fetch config', async () => {
    let config = await blockAPI.config()
    expect(config).toHaveProperty('BlockLists')
    expect(config).toHaveProperty('BlockDomains')
    expect(config).toHaveProperty('PermitDomains')
  })
})
