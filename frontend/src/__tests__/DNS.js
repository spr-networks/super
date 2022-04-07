import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import DNSBlock from 'views/DNS/DNSBlock'
//import DNSBlocklist from 'components/DNS/DNSBlocklist'
//import DNSOverrideList from 'components/DNS/DNSOverrideList'
import { saveLogin, blockAPI } from 'api'

describe('DNS Block', () => {
  saveLogin('admin', 'admin')

  test('DNS block list', async () => {
    const { baseElement } = render(<DNSBlock />)
    expect(baseElement).toBeDefined()
    expect(screen.getByText('DNS Blocklists')).toBeInTheDocument()
    expect(screen.getByText('Blocked Domain Override')).toBeInTheDocument()
    expect(screen.getByText('Allow Domain Override')).toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByText('example.com.')).toBeInTheDocument()
    )
    expect(screen.getByText('192.168.2.102')).toBeInTheDocument()
  })
})

describe('API DNS Plugin', () => {
  saveLogin('admin', 'admin')

  test('fetches config', async () => {
    let config = await blockAPI.config()
    expect(config).toHaveProperty('BlockLists')
    expect(config).toHaveProperty('BlockDomains')
    expect(config).toHaveProperty('PermitDomains')
  })
})
