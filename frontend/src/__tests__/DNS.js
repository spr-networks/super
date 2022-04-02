import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import DNSBlock from 'views/DNS/DNSBlock'
import { saveLogin, getDNSBlockConfig } from "../components/Helpers/Api.js";

describe('DNS Block', () => {

  test('DNS block list', async () => {
    const { baseElement } = render(<DNSBlock />)
    expect(baseElement).toBeDefined()
    expect(screen.getByText("DNS Blocklists")).toBeInTheDocument()
    expect(screen.getByText("Blocked Domain Override")).toBeInTheDocument()
    expect(screen.getByText("Allow Domain Override")).toBeInTheDocument()
    /*await waitFor(() => expect(screen.getByText(/2/)).toBeInTheDocument())*/
  })

})

describe('API DNS Plugin', () => {

  saveLogin('admin', 'admin')

  test('fetches config', async () => {
    let config = await getDNSBlockConfig()
    expect(config).toHaveProperty('BlockLists')
    expect(config).toHaveProperty('BlockDomains')
    expect(config).toHaveProperty('PermitDomains')
  })

})