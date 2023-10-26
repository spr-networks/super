import React, { useContext, useState, useEffect } from 'react'
import {
  AddIcon,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  HStack,
  Input,
  InputField,
  Text,
  VStack,
  TrashIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import { api } from 'api'
import { AlertContext } from 'AppContext'

import { ListHeader, ListItem } from 'components/List'

const Supernetworks = (props) => {
  const context = useContext(AlertContext)
  const [tinyNets, setTinyNets] = useState([])
  const [leaseTime, setLeaseTime] = useState('')
  const [isUnsaved, setIsUnsaved] = useState(false)

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
    <VStack sx={{ '@md': { w: '$3/4' } }}>
      <ListHeader title="Supernetworks"></ListHeader>

      <FlatList
        data={list}
        renderItem={({ item, index }) => (
          <ListItem>
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
        keyExtractor={(item) => `${item.Address}`}
      />

      {/**/}
      <VStack space="xl">
        <Box flex="$1">
          <Button
            action="primary"
            variant="solid"
            rounded="$none"
            onPress={addTinyNet}
          >
            <ButtonText>Add Supernetwork</ButtonText>
            <ButtonIcon as={AddIcon} ml="$1" />
          </Button>
        </Box>

        <Box flex="$1">
          <HStack
            space="md"
            alignItems="center"
            p="$4"
            py="$8"
            bg="white"
            sx={{ _dark: { bg: '$blueGray700' } }}
          >
            <Text>Lease Time</Text>
            <Input flex={1} variant="underlined">
              <InputField
                value={leaseTime}
                onChangeText={(text) => {
                  setLeaseTime(text)
                  setIsUnsaved(true)
                }}
              />
            </Input>
          </HStack>
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
        </Box>
      </VStack>
    </VStack>
  )
}
export default Supernetworks
