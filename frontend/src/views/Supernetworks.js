import React, { useContext, useState, useEffect } from 'react'
import {
  Box,
  Button,
  Container,
  Form,
  Heading,
  HStack,
  IconButton,
  Input,
  Text,
  View,
  VStack,
  useColorModeValue
} from 'native-base'
import { Icon } from 'FontAwesomeUtils'
import { api } from 'api'
import { AlertContext } from 'AppContext'
import { faCirclePlus, faTrash } from '@fortawesome/free-solid-svg-icons'

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
    <VStack justifyContent="space-between">
      <HStack p={4}>
        <Heading fontSize="md">Supernetworks</Heading>
      </HStack>
      {tinyNets.map((tinyNet, index) => (
        <HStack
          key={index}
          space={4}
          alignItems="center"
          justifyContent="space-between"
          p={4}
          py={8}
          bg="white"
          borderBottomColor="borderColorCardLight"
          _dark={{
            bg: 'blueGray.700',
            borderBottomColor: 'borderColorCardDark'
          }}
          borderBottomWidth={1}
        >
          <Input
            flex={1}
            variant="underlined"
            value={tinyNet}
            onChangeText={(text) => updateTinyNet(text, index)}
          />

          <IconButton
            _variant="solid"
            size="sm"
            colorScheme="danger"
            onPress={() => removeTinyNet(index)}
            icon={<Icon icon={faTrash} />}
          />
        </HStack>
      ))}
      <Button
        variant={useColorModeValue('subtle', 'solid')}
        colorScheme="primary"
        leftIcon={<Icon icon={faCirclePlus} />}
        onPress={addTinyNet}
      >
        <Text>Add Supernetwork</Text>
      </Button>
      <HStack
        space={4}
        mt={4}
        alignItems="center"
        p={4}
        py={8}
        bg="white"
        _dark={{ bg: 'blueGray.700' }}
      >
        <Text>Lease Time</Text>
        <Input
          flex={1}
          variant="underlined"
          value={leaseTime}
          onChangeText={(text) => setLeaseTime(text)}
        />
        <Button
          size="md"
          variant="solid"
          colorScheme={'primary'}
          onPress={handleUpdate}
        >
          Update
        </Button>
      </HStack>
    </VStack>
  )
}
export default Supernetworks
