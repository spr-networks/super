import React, { useEffect, useState } from 'react'
import { ScrollView, VStack } from '@gluestack-ui/themed'

import { firewallAPI } from 'api'
import EndpointList from 'components/Firewall/EndpointList'
import ForwardList from 'components/Firewall/ForwardList'
import BlockList from 'components/Firewall/BlockList'
import OutputBlockList from 'components/Firewall/OutputBlockList'
import ForwardBlockList from 'components/Firewall/ForwardBlockList'
import MulticastPorts from 'components/Firewall/MulticastPorts'
import ContainerInterfaceRulesList from 'components/Firewall/ContainerInterfaceRulesList'

import {
  ArrowLeftToLineIcon,
  ArrowRightFromLineIcon,
  BanIcon,
  CastIcon,
  ContainerIcon,
  RouteIcon,
  RouteOffIcon,
  ShieldBan,
  SplitIcon,
  WaypointsIcon
} from 'lucide-react-native'

import { Accordion } from 'components/Accordion'

const Firewall = (props) => {
  const [config, setConfig] = useState({})

  const fetchConfig = () => {
    firewallAPI.config().then(setConfig)
  }

  const [open, setOpen] = useState(['Endpoints', 'Port Forwarding'])

  useEffect(() => {
    fetchConfig()
  }, [])

  //ones with items open by default
  useEffect(() => {
    let keyLabels = {
      Endpoints: 'Endpoints',
      ForwardingRules: 'PortForwarding',
      BlockRules: 'Inbound Traffic Block',
      ForwardingBlockRules: 'Forwarding Traffic Block',
      CustomInterfaceRules: 'Custom Interface Access',
      MulticastPorts: 'Multicast Proxy',
      SPROutbound: 'SPR Outbound Block'
    }

    let keys = Object.keys(keyLabels)
    let defaults = []
    keys.map((key) => {
      if (config[key]?.length) {
        defaults.push(keyLabels[key])
      }
    })
    setOpen(defaults)
  }, [config])

  let items = [
    {
      label: 'Port Forwarding',
      description: 'Set rules for DNAT forwarding of incoming traffic',
      icon: SplitIcon,
      renderItem: () => (
        <ForwardList list={config.ForwardingRules} notifyChange={fetchConfig} />
      )
    },
    {
      label: 'Inbound Traffic Block',
      description:
        'Block traffic coming into the network at the PREROUTING stage',
      icon: ArrowLeftToLineIcon, //RouteOffIcon,
      renderItem: () => (
        <BlockList
          title="Inbound Traffic Block"
          list={config.BlockRules}
          notifyChange={fetchConfig}
        />
      )
    },
    {
      label: 'Forwarding Traffic Block',
      description: 'Add rules to block traffic at the FORWARDING stage',
      icon: ArrowRightFromLineIcon,
      renderItem: () => (
        <ForwardBlockList
          title="Forwarding Traffic Block"
          list={config.ForwardingBlockRules}
          notifyChange={fetchConfig}
        />
      )
    },
    {
      label: 'Endpoints',
      description: 'Describe Service Endpoints for building Firewall Rules',
      icon: RouteIcon, //WaypointsIcon,
      renderItem: () => (
        <EndpointList list={config.Endpoints} notifyChange={fetchConfig} />
      )
    },
    {
      label: 'Custom Interface Access',
      description: 'Allow custom interfaces network access',
      icon: ContainerIcon,
      renderItem: () => (
        <ContainerInterfaceRulesList
          title="Custom Interface Access"
          list={config.CustomInterfaceRules}
          notifyChange={fetchConfig}
        />
      )
    },
    {
      label: 'Multicast Proxy',
      description: 'Set ip:port addresses to proxy',
      icon: CastIcon,
      renderItem: () => (
        <MulticastPorts
          list={config.MulticastPorts}
          notifyChange={fetchConfig}
        />
      )
    },
    {
      label: 'SPR Outbound Block',
      description: 'Block SPR Traffic',
      icon: ShieldBan,
      renderItem: () => (
        <OutputBlockList
          list={config.OutputBlockRules}
          notifyChange={fetchConfig}
        />
      )
    }
  ]

  return (
    <ScrollView sx={{ '@md': { height: '92vh' } }}>
      <VStack space="lg">
        <Accordion items={items} open={open} showDescription={false} />
        {/*
        <EndpointList list={config.Endpoints} notifyChange={fetchConfig} />
        <ForwardList list={config.ForwardingRules} notifyChange={fetchConfig} />

        <BlockList
          title="Inbound Traffic Block"
          list={config.BlockRules}
          notifyChange={fetchConfig}
        />

        <ForwardBlockList
          title="Forwarding Traffic Block"
          list={config.ForwardingBlockRules}
          notifyChange={fetchConfig}
        />

        <MulticastPorts
          list={config.MulticastPorts}
          notifyChange={fetchConfig}
        />
        */}
      </VStack>
    </ScrollView>
  )
}

export default Firewall
