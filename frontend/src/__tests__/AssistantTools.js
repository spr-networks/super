import {
  applyProposal,
  executeReadTool,
  prepareProposal,
  proposalDiff,
  validateDeviceProposal,
  validateProposal
} from 'components/Assistant/assistantTools'
import { deviceAPI, firewallAPI } from 'api'

jest.mock('api', () => ({
  deviceAPI: {
    list: jest.fn(),
    update: jest.fn()
  },
  firewallAPI: {
    config: jest.fn(),
    addEndpoint: jest.fn(),
    deleteEndpoint: jest.fn(),
    addForward: jest.fn(),
    deleteForward: jest.fn(),
    addBlock: jest.fn(),
    deleteBlock: jest.fn(),
    addForwardBlock: jest.fn(),
    deleteForwardBlock: jest.fn(),
    addOutputBLock: jest.fn(),
    deleteOutputBlock: jest.fn()
  }
}))

beforeEach(() => {
  jest.clearAllMocks()
})

test('normalizes and limits proposed rule fields', () => {
  const proposal = validateProposal({
    operation: 'ADD',
    ruleType: 'port_forward',
    reason: 'Expose the local dashboard',
    rule: {
      Protocol: 'TCP',
      SrcIP: '0.0.0.0/0',
      SrcPort: 8443,
      DstIP: '192.168.2.20',
      DstPort: 443,
      Description: 'Dashboard',
      Unexpected: 'not sent'
    }
  })

  expect(proposal.rule).toEqual({
    Protocol: 'tcp',
    SrcIP: '0.0.0.0/0',
    SrcPort: '8443',
    DstIP: '192.168.2.20',
    DstPort: '443',
    Description: 'Dashboard'
  })
  expect(proposal.rule.Unexpected).toBeUndefined()
})

test('building the review does not call a mutation API', () => {
  const review = proposalDiff({
    operation: 'add',
    ruleType: 'inbound_block',
    reason: 'Block a source',
    rule: {
      Protocol: 'tcp',
      SrcIP: '203.0.113.4',
      DstIP: '192.168.2.20',
      Description: 'Requested in chat'
    }
  })

  expect(review.before).toBeNull()
  expect(review.after.DstIP).toBe('192.168.2.20')
  expect(firewallAPI.addBlock).not.toHaveBeenCalled()
})

test('applies an add only when applyProposal is invoked', async () => {
  firewallAPI.addBlock.mockResolvedValue(true)
  const proposal = {
    operation: 'add',
    ruleType: 'inbound_block',
    reason: 'Block a source',
    rule: {
      Protocol: 'tcp',
      SrcIP: '203.0.113.4',
      DstIP: '192.168.2.20'
    }
  }

  await applyProposal(proposal)

  expect(firewallAPI.addBlock).toHaveBeenCalledWith({
    Protocol: 'tcp',
    SrcIP: '203.0.113.4',
    DstIP: '192.168.2.20'
  })
})

test('re-reads and uniquely matches a rule before deleting it', async () => {
  const existing = {
    Protocol: 'tcp',
    SrcIP: '0.0.0.0/0',
    DstIP: '192.168.2.20',
    Description: 'Existing rule',
    BackendIndex: 7
  }
  firewallAPI.config.mockResolvedValue({ BlockRules: [existing] })
  firewallAPI.deleteBlock.mockResolvedValue(true)

  await applyProposal({
    operation: 'delete',
    ruleType: 'inbound_block',
    reason: 'Remove it',
    rule: {
      Protocol: 'tcp',
      SrcIP: '0.0.0.0/0',
      DstIP: '192.168.2.20'
    }
  })

  expect(firewallAPI.config).toHaveBeenCalledTimes(1)
  expect(firewallAPI.deleteBlock).toHaveBeenCalledWith(existing)
})

test('hydrates an exact before value prior to approval', async () => {
  const existing = {
    RuleName: 'printer-block',
    Description: 'Existing rule',
    Disabled: false,
    Protocol: 'tcp',
    SrcIP: '0.0.0.0/0',
    DstIP: '192.168.2.30'
  }
  firewallAPI.config.mockResolvedValue({ BlockRules: [existing] })

  const prepared = await prepareProposal({
    operation: 'delete',
    ruleType: 'inbound_block',
    reason: 'Remove the printer block',
    rule: {
      Protocol: 'tcp',
      SrcIP: '0.0.0.0/0',
      DstIP: '192.168.2.30'
    }
  })

  expect(proposalDiff(prepared).before).toEqual(existing)
  expect(firewallAPI.deleteBlock).not.toHaveBeenCalled()
})

test('refuses an ambiguous deletion', async () => {
  firewallAPI.config.mockResolvedValue({
    BlockRules: [
      {
        Protocol: 'tcp',
        SrcIP: '0.0.0.0/0',
        DstIP: '192.168.2.20',
        Description: 'First'
      },
      {
        Protocol: 'tcp',
        SrcIP: '0.0.0.0/0',
        DstIP: '192.168.2.20',
        Description: 'Second'
      }
    ]
  })

  await expect(
    applyProposal({
      operation: 'delete',
      ruleType: 'inbound_block',
      reason: 'Remove it',
      rule: {
        Protocol: 'tcp',
        SrcIP: '0.0.0.0/0',
        DstIP: '192.168.2.20'
      }
    })
  ).rejects.toThrow('More than one inbound block rule matches')
  expect(firewallAPI.deleteBlock).not.toHaveBeenCalled()
})

test('read-only device results omit credentials and unrelated fields', async () => {
  deviceAPI.list.mockResolvedValue({
    one: {
      Name: 'Printer',
      MAC: '00:11:22:33:44:55',
      RecentIP: '192.168.2.30',
      VLANTag: '100',
      Groups: ['home'],
      DeviceTags: ['printer'],
      Policies: ['lan'],
      PSKEntry: { Psk: 'secret' },
      PrivateKey: 'also-secret'
    }
  })

  const result = await executeReadTool('list_devices')

  expect(result).toEqual([
    {
      Name: 'Printer',
      MAC: '00:11:22:33:44:55',
      RecentIP: '192.168.2.30',
      VLANTag: '100',
      Groups: ['home'],
      DeviceTags: ['printer'],
      Policies: ['lan']
    }
  ])
  expect(JSON.stringify(result)).not.toContain('secret')
})

test('times out a stuck device API lookup', async () => {
  jest.useFakeTimers()
  deviceAPI.list.mockReturnValue(new Promise(() => {}))

  const request = executeReadTool('list_devices')
  jest.advanceTimersByTime(10000)

  await expect(request).rejects.toThrow(
    'SPR API timed out while listing devices'
  )
  jest.useRealTimers()
})

test('prepares an exact device before and after review without updating', async () => {
  deviceAPI.list.mockResolvedValue({
    printer: {
      Name: 'Printer',
      MAC: '00:11:22:33:44:55',
      RecentIP: '192.168.2.30',
      VLANTag: '',
      Groups: [],
      DeviceTags: ['printer'],
      Policies: ['dns']
    }
  })

  const proposal = validateDeviceProposal({
    identity: '00:11:22:33:44:55',
    changes: {
      Policies: ['dns', 'wan'],
      Groups: ['office'],
      PSKEntry: { Psk: 'not-allowed' }
    },
    reason: 'Grant Internet access'
  })
  const prepared = await prepareProposal(proposal)
  const diff = proposalDiff(prepared)

  expect(diff.before.Policies).toEqual(['dns'])
  expect(diff.after.Policies).toEqual(['dns', 'wan'])
  expect(diff.after.Groups).toEqual(['office'])
  expect(JSON.stringify(diff)).not.toContain('not-allowed')
  expect(deviceAPI.update).not.toHaveBeenCalled()
})

test('applies a reviewed device update through the existing API wrapper', async () => {
  const current = {
    Name: 'Printer',
    MAC: '00:11:22:33:44:55',
    RecentIP: '192.168.2.30',
    VLANTag: '',
    Groups: [],
    DeviceTags: ['printer'],
    Policies: ['dns']
  }
  deviceAPI.list.mockResolvedValue({ printer: current })
  deviceAPI.update.mockResolvedValue(current)

  await applyProposal({
    proposalType: 'device',
    identity: current.MAC,
    changes: { Name: 'Office printer', Policies: ['dns', 'wan'] },
    reason: 'Rename and grant Internet access',
    previousDevice: current
  })

  expect(deviceAPI.update).toHaveBeenCalledWith(current.MAC.toLowerCase(), {
    Name: 'Office printer',
    Policies: ['dns', 'wan']
  })
})
