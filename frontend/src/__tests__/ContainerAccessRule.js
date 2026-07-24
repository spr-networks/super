import React from 'react'

import { render, screen, waitFor } from 'test-utils'
import { firewallAPI } from 'api'
import ContainerAccessRule from 'components/Devices/ContainerAccessRule'

jest.mock('components/Firewall/ContainerInterfaceRulesList', () => {
  const React = require('react')
  const { Text } = require('@gluestack-ui/themed')

  return ({ title, list, allowAdd, allowDelete }) =>
    React.createElement(
      Text,
      null,
      `${title} ${list.map((rule) => rule.RuleName).join(',')} add:${allowAdd} delete:${allowDelete}`
    )
})

describe('container access rule detail', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('shows only the linked rule without add or delete controls', async () => {
    jest.spyOn(firewallAPI, 'config').mockResolvedValue({
      CustomInterfaceRules: [
        {
          RuleName: 'unrelated-rule',
          Interface: 'docker0',
          SrcIP: '172.17.0.0/16'
        },
        {
          RuleName: 'Plugin-spr-atlas',
          Interface: 'spr-atlas',
          SrcIP: '192.168.2.110',
          Policies: ['wan', 'dns'],
          Groups: []
        }
      ]
    })

    render(
      <ContainerAccessRule
        device={{
          Name: 'spr-atlas',
          Type: 'Container',
          MAC: '02:53:50:52:4b:21',
          RecentIP: '192.168.2.110',
          DHCPLastInterface: 'spr-atlas'
        }}
      />
    )

    await waitFor(() => {
      expect(
        screen.getByText(
          'Custom Interface Access Plugin-spr-atlas add:false delete:false'
        )
      ).toBeTruthy()
    })
    expect(screen.queryByText(/unrelated-rule/)).toBeNull()
  })
})
