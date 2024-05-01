import React, { useContext, useState, useEffect } from 'react'
import {
  AddIcon,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  EyeIcon,
  EyeOffIcon,
  FlatList,
  HStack,
  Input,
  InputField,
  Text,
  View,
  VStack,
  TrashIcon,
  CloseIcon,
  FormControl,
  FormControlLabel,
  FormControlLabelText
} from '@gluestack-ui/themed'

import { api } from 'api'
import { AlertContext } from 'AppContext'

import { ListHeader, ListItem } from 'components/List'
import Dhcp from 'views/Groups/Dhcp'

const Supernetworks = (props) => {
  const context = useContext(AlertContext)
  const [tinyNets, setTinyNets] = useState([])
  const [leaseTime, setLeaseTime] = useState('')
  const [isUnsaved, setIsUnsaved] = useState(false)
  const [showDHCPTable, setShowDHCPTable] = useState(false)

  const fetchConfig = () => {
    api.get('/subnetConfig').then((config) => {
      setTinyNets(config.TinyNets)
      setLeaseTime(config.LeaseTime)
      setIsUnsaved(false)
    })
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  const handleUpdate = (_tinyNets) => {
    api
      .put('/subnetConfig', {
        TinyNets: _tinyNets || tinyNets,
        LeaseTime: leaseTime
      })
      .then(() => {
        context.success('Updated supernetworks')
        fetchConfig()
      })
      .catch((err) => context.error('' + err))
  }

  const addTinyNet = () => {
    setTinyNets([...tinyNets, ''])
  }

  const deleteListItem = (index) => {
    const newTinyNets = tinyNets.filter((_, i) => i !== index)
    setTinyNets(newTinyNets)
    handleUpdate(newTinyNets)
  }

  const updateTinyNet = (text, index) => {
    const newTinyNets = [...tinyNets]
    newTinyNets[index] = text
    setTinyNets(newTinyNets)
    setIsUnsaved(true)
  }

  const list = tinyNets

  return (
    <VStack space="md" sx={{ '@md': { w: '$3/4' } }}>
      <ListHeader title="DHCP Settings" />

      <VStack
        space="lg"
        p="$4"
        py="$8"
        bg="$backgroundCardLight"
        sx={{ _dark: { bg: '$backgroundCardDark' } }}
      >
        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Subnets to assign device IPs from. Each /24 hosts 64 devices with SPR.</FormControlLabelText>
          </FormControlLabel>
          <FlatList
            borderWidth={0}
            borderColor="$primary500"
            data={list}
            renderItem={({ item, index }) => (
              <ListItem py="$2" px="$0" borderBottomWidth={0}>
                <Input flex={1} variant="outline">
                  <InputField
                    value={item}
                    onChangeText={(text) => updateTinyNet(text, index)}
                    onSubmitEditing={() => handleUpdate()}
                  />
                </Input>
                <HStack ml="auto" space="xl">
                  <Button
                    action="negative"
                    variant="link"
                    alignSelf="center"
                    onPress={() => deleteListItem(index)}
                  >
                    <ButtonIcon as={CloseIcon} color="$red700" />
                  </Button>
                </HStack>
              </ListItem>
            )}
            ListFooterComponent={() => (
              <HStack py="$2">
                <Button
                  action="primary"
                  variant="outline"
                  size="sm"
                  onPress={addTinyNet}
                >
                  <ButtonText>Add Supernetwork</ButtonText>
                  <ButtonIcon as={AddIcon} ml="$1" />
                </Button>
              </HStack>
            )}
            keyExtractor={(item) => `${item.Address}`}
          />
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>DHCP Lease Time</FormControlLabelText>
          </FormControlLabel>
          <Input size="md" variant="outline">
            <InputField
              value={leaseTime}
              onChangeText={(text) => {
                setLeaseTime(text)
                setIsUnsaved(true)
              }}
            />
          </Input>
        </FormControl>
        <FormControl>
          <Button
            action="primary"
            variant="solid"
            rounded="$none"
            onPress={handleUpdate}
            isDisabled={!isUnsaved}
          >
            <ButtonText>
              {isUnsaved ? 'Save unsaved changes' : 'Save'}
            </ButtonText>
          </Button>
        </FormControl>

        <ListHeader title="DHCP Table" >
          <Button
            ml="auto"
            size="sm"
            action="muted"
            variant="link"
            onPress={() => setShowDHCPTable(!showDHCPTable)}
          >
            <ButtonText color="$muted500">
              {showDHCPTable ? 'Hide info' : 'Show info'}
            </ButtonText>
            <ButtonIcon as={showDHCPTable ? EyeOffIcon : EyeIcon} ml="$1" />
          </Button>
        </ListHeader>

        { showDHCPTable &&
          <Dhcp/>
        }
      </VStack>
    </VStack>
  )
}
export default Supernetworks
