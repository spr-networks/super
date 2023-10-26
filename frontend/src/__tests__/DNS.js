import React from 'react'
import { render, screen, waitFor, waitForElementToBeRemoved } from 'test-utils'

import DNSBlock from 'views/DNS/DNSBlock'
//import DNSBlocklist from 'components/DNS/DNSBlocklist'
//import DNSOverrideList from 'components/DNS/DNSOverrideList'
import { saveLogin, blockAPI } from 'api'

beforeAll(() => saveLogin('admin', 'admin'))

describe('DNS Block', () => {
  let container = null,
    getByText = null

  /*beforeEach(() => {
    const inset = {
      frame: { x: 0, y: 0, width: 0, height: 0 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 }
    }

    container = render(
      <NativeBaseProvider initialWindowMetrics={inset}>
        <DNSBlock />
      </NativeBaseProvider>
    )

    getByText = container.getByText
    expect(getByText('DNS Blocklists')).toBeInTheDocument()
  })*/

  test('DNS block list', async () => {
    const utils = render(<DNSBlock />)

    await waitFor(() => {
      expect(screen.getByText('DNS Blocklists')).toBeTruthy()
    })

    // wait for data to be populated
    /*await waitFor(async () => {
      const example = await getByText('example.com.')
      expect(example).toBeTruthy()

      // find override content
      //const ip = await getByText('192.168.2.102')
      //expect(ip).toBeTruthy()
    })*/
  })

  /*
  test('remove blocklist item', async () => {
    // wait fo async data
    await waitFor(() =>
      expect(getByText('example.com.')).toBeInTheDocument()
    )

    let tables = screen.getAllByRole('table'),
      blocklist = within(tables[0]), // blocklist is the first table
      rows = blocklist.getAllByRole('row'),
      lastRow = rows[rows.length - 1]

    let buttonRemove = within(lastRow).getByRole('button')

    expect(rows.length).toBeGreaterThanOrEqual(2)

    fireEvent.click(buttonRemove)

    await waitForElementToBeRemoved(lastRow)
  })
  */
})

/*
describe('API DNS Plugin', () => {
  test('fetches config', async () => {
    let config = await blockAPI.config()
    expect(config).toHaveProperty('BlockLists')
    expect(config).toHaveProperty('BlockDomains')
    expect(config).toHaveProperty('PermitDomains')
  })
})
*/
