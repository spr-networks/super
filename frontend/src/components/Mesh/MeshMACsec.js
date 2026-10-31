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

const macsecLabel = (leaf, link) => {
  if (link?.Error) {
    return link.Error
  }
  if (leaf.MACsec?.Enabled) {
    return link?.Secured ? 'Encrypted' : 'Negotiating'
  }
  return leaf.MACsecPending ? 'Pending' : 'Off'
}

export const MACsecSwitch = ({ leaf, link, onChange, ...props }) => {
  const context = useContext(AlertContext)
  const [busy, setBusy] = useState(false)
  const enabled = !!leaf.MACsec?.Enabled || !!leaf.MACsecPending

  const toggle = () => {
    setBusy(true)
    meshAPI
      .setLeafMACsec({ IP: leaf.IP, Enable: !enabled })
      .then(() => {
        setBusy(false)
        if (onChange) onChange()
      })
      .catch(async (err) => {
        setBusy(false)
        let msg = err?.message
        try {
          msg = (await err?.response?.text()) || msg
        } catch (e) {}
        context.error('MACsec update failed', msg)
        if (onChange) onChange()
      })
  }

  return (
    <HStack space="sm" alignItems="center" {...props}>
      <Switch value={enabled} isDisabled={busy} onValueChange={toggle} />
      <Text size="sm">{macsecLabel(leaf, link)}</Text>
    </HStack>
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
          MACsec
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
                    {link.Interface}
                  </Text>
                ) : null}
              </VStack>
              <MACsecSwitch
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
