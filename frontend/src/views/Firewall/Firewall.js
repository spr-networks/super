import React, { useEffect, useState } from 'react'
import { ScrollView, VStack } from '@gluestack-ui/themed'

import { firewallAPI } from 'api'
import EndpointList from 'components/Firewall/EndpointList'
import ForwardList from 'components/Firewall/ForwardList'
import BlockList from 'components/Firewall/BlockList'
import ForwardBlockList from 'components/Firewall/ForwardBlockList'
import MulticastPorts from 'components/Firewall/MulticastPorts'

import { HStack, Icon, Pressable, Text } from '@gluestack-ui/themed'
import {
  ArrowDownUpIcon,
  ArrowRightFromLineIcon,
  BanIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SplitIcon,
  WaypointsIcon,
  CastIcon
} from 'lucide-react-native'

//TODO accordion component
const TabBar = ({ title, description, icon, isOpen, onPress, ...props }) => {
  const [showDescription, setShowDescription] = useState(false)
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setShowDescription(true)}
      onHoverOut={() => setShowDescription(false)}
    >
      <HStack
        bg="$muted50"
        borderColor="$muted200"
        sx={{
          _dark: {
            bg: '$backgroundContentDark',
            borderColor: '$borderColorCardDark'
          }
        }}
        px="$4"
        py="$6"
        justifyContent="space-between"
        borderBottomWidth="$1"
      >
        <HStack space="md" alignItems="center">
          <Icon size="xl" color="$primary600" as={icon || ArrowDownUpIcon} />
          <Text size="md">{title}</Text>
          {description && showDescription ? (
            <Text size="sm" color="$muted500">
              {description}
            </Text>
          ) : null}
        </HStack>
        <Icon as={isOpen ? ChevronUpIcon : ChevronDownIcon} />
      </HStack>
    </Pressable>
  )
}

const TabScene = ({ isOpen, ...props }) => {
  return (
    <VStack display={isOpen ? 'flex' : 'none'} pb="$4">
      {props.renderItem ? (
        props.renderItem()
      ) : (
        <Text bold>{props.title || 'title'}</Text>
      )}
    </VStack>
  )
}

const Tabs = ({ items, ...props }) => {
  const [open, setOpen] = useState(props.open || [])

  const handlePress = (label) => {
    if (open.includes(label)) {
      setOpen(open.filter((l) => l != label))
    } else {
      setOpen([...open, label])
    }
  }

  useEffect(() => {}, [])

  return (
    <VStack>
      {items.map((item) => (
        <VStack>
          <TabBar
            key={`tabbar.${item.label}`}
            title={item.label}
            description={item.description}
            icon={item.icon}
            isOpen={open.includes(item.label)}
            onPress={() => handlePress(item.label)}
          />
          <TabScene
            key={`tabscene.${item.label}`}
            title={item.label}
            renderItem={item.renderItem}
            isOpen={open.includes(item.label)}
          />
        </VStack>
      ))}
    </VStack>
  )
}

const Firewall = (props) => {
  const [config, setConfig] = useState({})

  const fetchConfig = () => {
    firewallAPI.config().then(setConfig)
  }

  const [open, setOpen] = useState(['Endpoints', 'Multicast Proxy'])

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
      MulticastPorts: 'Multicast Proxy'
    }

    let keys = Object.keys(keyLabels)
    keys.map((key) => {
      let defaults = []
      if (config[key]?.length) {
        defaults.push(keyLabels[key])
      }

      setOpen(defaults)
    })
  }, [config])

  let items = [
    {
      label: 'Endpoints',
      description: 'Describe Service Endpoints for building Firewall Rules',
      icon: WaypointsIcon,
      renderItem: () => (
        <EndpointList list={config.Endpoints} notifyChange={fetchConfig} />
      )
    },
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
      icon: BanIcon,
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
      label: 'Multicast Proxy',
      description: 'Set ip:port addresses to proxy',
      icon: CastIcon,
      renderItem: () => (
        <MulticastPorts
          list={config.MulticastPorts}
          notifyChange={fetchConfig}
        />
      )
    }
  ]

  return (
    <ScrollView sx={{ '@md': { height: '90vh' } }}>
      <VStack space="lg">
        <Tabs items={items} open={open} />
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
