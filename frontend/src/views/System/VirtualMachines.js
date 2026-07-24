import React, { useEffect, useState } from 'react'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  HStack,
  Icon,
  ScrollView,
  Text,
  VStack
} from '@gluestack-ui/themed'
import {
  CpuIcon,
  MemoryStickIcon,
  RefreshCwIcon,
  ServerIcon
} from 'lucide-react-native'

import { api } from 'api'
import { ListHeader, ListItem } from 'components/List'

const VirtualMachineResources = ({ vm }) => {
  if (!vm.CPUs && !vm.MemoryMiB) {
    return null
  }

  return (
    <HStack space="md" alignItems="center">
      {vm.CPUs ? (
        <HStack space="xs" alignItems="center">
          <Icon as={CpuIcon} size="xs" color="$muted500" />
          <Text size="xs" color="$muted500">
            {vm.CPUs} vCPU
          </Text>
        </HStack>
      ) : null}
      {vm.MemoryMiB ? (
        <HStack space="xs" alignItems="center">
          <Icon as={MemoryStickIcon} size="xs" color="$muted500" />
          <Text size="xs" color="$muted500">
            {vm.MemoryMiB} MiB
          </Text>
        </HStack>
      ) : null}
    </HStack>
  )
}

const VirtualMachines = () => {
  const [inventory, setInventory] = useState({
    KVMAvailable: true,
    VirtualMachines: []
  })
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchInventory = () => {
    setLoading(true)
    api
      .get('/info/vms')
      .then((result) => {
        setInventory(result || { KVMAvailable: true, VirtualMachines: [] })
        setLoadError('')
      })
      .catch((err) => {
        setLoadError(err?.message || 'Failed to load virtual machines')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchInventory()
  }, [])

  const virtualMachines = inventory.VirtualMachines || []
  const description = `${virtualMachines.length} active`

  const renderVirtualMachine = ({ item }) => (
    <ListItem>
      <Icon as={ServerIcon} size="sm" color="$muted500" mr="$2" />
      <VStack flex={1} space="xs">
        <Text size="sm">{item.Name}</Text>
        <HStack space="sm" alignItems="center" flexWrap="wrap">
          <Badge action="success" variant="outline" size="sm">
            <BadgeText>{item.State || 'running'}</BadgeText>
          </Badge>
          <Badge
            action={item.Container ? 'info' : 'muted'}
            variant="outline"
            size="sm"
          >
            <BadgeText>
              {item.Container ? item.Runtime || 'container' : 'KVM'}
            </BadgeText>
          </Badge>
          <VirtualMachineResources vm={item} />
        </HStack>
      </VStack>
      <VStack
        flex={1}
        sx={{ '@base': { display: 'none' }, '@md': { display: 'flex' } }}
      >
        <Text size="xs" color="$muted500" isTruncated>
          {item.Image || item.ID}
        </Text>
      </VStack>
      <Text size="xs" color="$muted500">
        PID {item.PID}
      </Text>
    </ListItem>
  )

  return (
    <ScrollView h="$full" sx={{ '@md': { h: '92vh' } }}>
      <VStack space="md">
        <ListHeader
          title="Virtual Machines"
          description={description}
          info="Active VMs reported by the host KVM subsystem"
        >
          <Button
            action="primary"
            size="sm"
            isDisabled={loading}
            onPress={fetchInventory}
          >
            <ButtonText>{loading ? 'Refreshing…' : 'Refresh'}</ButtonText>
            <ButtonIcon as={RefreshCwIcon} ml="$2" />
          </Button>
        </ListHeader>

        {loadError ? (
          <Box p="$4">
            <Text color="$error600">{loadError}</Text>
          </Box>
        ) : !inventory.KVMAvailable ? (
          <Box p="$4">
            <Text color="$muted500">
              KVM inventory is unavailable on this system.
            </Text>
          </Box>
        ) : virtualMachines.length === 0 ? (
          <Box p="$4">
            <Text color="$muted500">No active KVM virtual machines.</Text>
          </Box>
        ) : (
          <FlatList
            data={virtualMachines}
            keyExtractor={(item) => item.ID}
            estimatedItemSize={88}
            renderItem={renderVirtualMachine}
          />
        )}
      </VStack>
    </ScrollView>
  )
}

export default VirtualMachines
