import React, { useContext, useEffect, useState } from 'react'

import {
  Box,
  FlatList,
  Heading,
  HStack,
  Switch,
  Text,
  VStack
} from '@gluestack-ui/themed'

import { AlertContext } from 'AppContext'
import { meshAPI } from 'api'
import { ListHeader, ListItem } from 'components/List'
import { Select } from 'components/Select'

export const useMACsecLinks = () => {
  const [links, setLinks] = useState({})

  const refresh = () => {
    meshAPI
      .macsecStatus()
      .then((status) => {
        let byIP = {}
        for (const link of status?.Links || []) {
          byIP[link.LeafIP] = link
        }
        setLinks(byIP)
      })
      .catch(() => setLinks({}))
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [])

  return [links, refresh]
}

const backhaulOptions = [
  { label: 'Off', value: 'off' },
  { label: 'WireGuard', value: 'wireguard' },
  { label: 'MACsec', value: 'macsec' }
]

const backhaulValue = (leaf) => {
  if (leaf.MACsec?.Enabled) {
    return leaf.MACsec.Mode == 'wireguard' ? 'wireguard' : 'macsec'
  }
  return leaf.MACsecPending ? 'wireguard' : 'off'
}

const statusLabel = (leaf, link) => {
  if (link?.Error) {
    return link.Error
  }
  if (leaf.MACsec?.Enabled) {
    if (!link?.Secured) {
      return 'Negotiating'
    }
    return link.Underlay ? `Encrypted, MTU ${link.Underlay}` : 'Encrypted'
  }
  return leaf.MACsecPending ? 'Pending' : 'Off'
}

const errorText = async (err) => {
  let msg = err?.message
  try {
    msg = (await err?.response?.text()) || msg
  } catch (e) {}
  return msg
}

export const BackhaulControl = ({ leaf, link, onChange, ...props }) => {
  const context = useContext(AlertContext)
  const [busy, setBusy] = useState(false)
  const value = backhaulValue(leaf)

  const done = () => {
    setBusy(false)
    if (onChange) onChange()
  }

  const select = (next) => {
    if (next == value) {
      return
    }
    setBusy(true)
    const data =
      next == 'off'
        ? { IP: leaf.IP, Enable: false }
        : { IP: leaf.IP, Enable: true, Mode: next }
    meshAPI
      .setLeafBackhaul(data)
      .then(done)
      .catch(async (err) => {
        context.error('Wired encryption update failed', await errorText(err))
        done()
      })
  }

  const setJumbo = (on) => {
    setBusy(true)
    meshAPI
      .setLeafJumbo({ IP: leaf.IP, Jumbo: on })
      .then(done)
      .catch(async (err) => {
        context.error('Jumbo frames update failed', await errorText(err))
        done()
      })
  }

  return (
    <VStack space="xs" {...props}>
      <Select
        selectedValue={value}
        selectedLabel={backhaulOptions.find((opt) => opt.value == value)?.label}
        isDisabled={busy}
        onValueChange={select}
      >
        {backhaulOptions.map((opt) => (
          <Select.Item key={opt.value} label={opt.label} value={opt.value} />
        ))}
      </Select>
      <Text size="sm">{statusLabel(leaf, link)}</Text>
      {leaf.MACsec?.Enabled ? (
        <HStack space="sm" alignItems="center">
          <Switch
            size="sm"
            value={!!leaf.MACsec.Jumbo}
            isDisabled={busy}
            onValueChange={setJumbo}
          />
          <Text size="sm">Jumbo frames</Text>
        </HStack>
      ) : null}
    </VStack>
  )
}

export const MeshLinks = () => {
  const [leaves, setLeaves] = useState([])
  const [links, refreshLinks] = useMACsecLinks()

  const refresh = () => {
    meshAPI
      .leafMode()
      .then((result) => {
        if (JSON.parse(result) == true) {
          setLeaves([])
          return
        }
        return meshAPI.leafRouters().then((routers) => {
          setLeaves(routers || [])
        })
      })
      .catch(() => setLeaves([]))
  }

  useEffect(() => {
    refresh()
  }, [])

  if (!leaves.length) {
    return null
  }

  return (
    <VStack space="md">
      <ListHeader title="Mesh Links" />
      <HStack space="md" px="$4" justifyContent="space-between">
        <Heading size="sm" flex={2}>
          Mesh Node
        </Heading>
        <Heading size="sm" flex={2}>
          Interface
        </Heading>
        <Heading size="sm" flex={3}>
          Wired Encryption
        </Heading>
      </HStack>
      <FlatList
        data={leaves}
        ItemSeparatorComponent={() => <Box h="$3" />}
        keyExtractor={(item) => item.IP}
        renderItem={({ item }) => {
          const link = links[item.IP]
          return (
            <ListItem>
              <Text flex={2} size="sm" bold>
                {item.IP}
              </Text>
              <VStack flex={2}>
                <Text size="sm">
                  {link?.Parent || item.MACsec?.Parent || '-'}
                </Text>
                {link?.Interface ? (
                  <Text size="sm" color="$muted500">
                    {link.Member || link.Interface}
                  </Text>
                ) : null}
              </VStack>
              <BackhaulControl
                flex={3}
                leaf={item}
                link={link}
                onChange={() => {
                  refresh()
                  refreshLinks()
                }}
              />
            </ListItem>
          )
        }}
      />
    </VStack>
  )
}
