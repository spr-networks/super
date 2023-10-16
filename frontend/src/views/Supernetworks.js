import React, { useContext, useState, useEffect } from 'react'
import {
  AddIcon,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  Heading,
  HStack,
  Input,
  InputField,
  Text,
  TrashIcon,
  VStack
} from '@gluestack-ui/themed'

import { api } from 'api'
import { AlertContext } from 'AppContext'

const Supernetworks = (props) => {
  const context = useContext(AlertContext)
  const [tinyNets, setTinyNets] = useState([])
  const [leaseTime, setLeaseTime] = useState('')

  useEffect(() => {
    api.get('/subnetConfig').then((config) => {
      setTinyNets(config.TinyNets)
      setLeaseTime(config.LeaseTime)
    })
  }, [])

  const handleUpdate = () => {
    api
      .put('/subnetConfig', {
        TinyNets: tinyNets,
        LeaseTime: leaseTime
      })
      .then(() => {
        context.success('Updated supernetworks')
      })
      .catch((err) => context.error('' + err))
  }

  const addTinyNet = () => {
    setTinyNets([...tinyNets, ''])
  }

  const removeTinyNet = (index) => {
    setTinyNets(tinyNets.filter((_, i) => i !== index))
  }

  const updateTinyNet = (text, index) => {
    const newTinyNets = [...tinyNets]
    newTinyNets[index] = text
    setTinyNets(newTinyNets)
  }

  return (
    <VStack sx={{ '@md': { w: '$3/4' } }}>
      <Heading size="sm" p="$4">
        Supernetworks
      </Heading>

      <VStack space="xl">
        <Box flex="$1">
          {tinyNets.map((tinyNet, index) => (
            <HStack
              key={index}
              space="md"
              alignItems="center"
              justifyContent="space-between"
              p="$4"
              py="$8"
              bg="white"
              borderBottomColor="$borderColorCardLight"
              borderBottomWidth={1}
              sx={{
                _dark: {
                  bg: '$blueGray700',
                  borderBottomColor: '$borderColorCardDark'
                }
              }}
            >
              <Input flex={1} variant="underlined">
                <InputField
                  value={tinyNet}
                  onChangeText={(text) => updateTinyNet(text, index)}
                />
              </Input>

              <Button
                size="sm"
                action="negative"
                variant="solid"
                onPress={() => removeTinyNet(index)}
              >
                <ButtonText>Remove</ButtonText>
                <ButtonIcon as={TrashIcon} ml="$1" />
              </Button>
            </HStack>
          ))}
          <Button
            action="secondary"
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
                onChangeText={(text) => setLeaseTime(text)}
              />
            </Input>
          </HStack>
          <Button
            action="primary"
            variant="solid"
            rounded="$none"
            onPress={handleUpdate}
          >
            <ButtonText>Save Settings</ButtonText>
          </Button>
        </Box>
      </VStack>
    </VStack>
  )
}
export default Supernetworks
