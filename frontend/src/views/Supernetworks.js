import React, { useContext, useState, useEffect } from 'react'
import {
  Box,
  Button,
  Container,
  Form,
  Heading,
  HStack,
  Icon,
  IconButton,
  Input,
  Text,
  View,
  VStack,
  useColorModeValue
} from 'native-base'
import { api } from 'api'
import { AlertContext } from 'AppContext'

const Supernetworks = (props) => {
  const context = useContext(AlertContext)
  const [tinyNets, setTinyNets] = useState([]);
   const [leaseTime, setLeaseTime] = useState('');

  useEffect(() => {
    api.get('/subnetConfig')
    .then((config) => {
      setTinyNets(config.TinyNets)
      setLeaseTime(config.LeaseTime)
    })
  }, [])

  const handleUpdate = () => {
    api.put('/subnetConfig', {
      TinyNets: tinyNets,
      LeaseTime: leaseTime
    })
    .catch((err) => context.error('' + err))
  };

  const addTinyNet = () => {
    setTinyNets([...tinyNets, '']);
  };

  const removeTinyNet = (index) => {
    setTinyNets(tinyNets.filter((_, i) => i !== index));
  };

  const updateTinyNet = (text, index) => {
    const newTinyNets = [...tinyNets];
    newTinyNets[index] = text;
    setTinyNets(newTinyNets);
  };


  return  (
    <Box>
      <VStack space={4}>
        {tinyNets.map((tinyNet, index) => (
          <HStack key={index} space={4} alignItems="center">
            <Input
              width="50%"
              value={tinyNet}
              onChangeText={(text) => updateTinyNet(text, index)}
            />
            <IconButton
              onPress={() => removeTinyNet(index)}
              colorScheme="red"
            />
          </HStack>
        ))}
        <Button onPress={addTinyNet}>
          <Text>Add TinyNet</Text>
        </Button>
        <HStack space={4} alignItems="center">
          <Text>Lease Time</Text>
          <Input
            width="50%"
            value={leaseTime}
            onChangeText={(text) => setLeaseTime(text)}
          />
        </HStack>
        <Button onPress={handleUpdate}>
          <Text>Update Data</Text>
        </Button>
      </VStack>
    </Box>
  )
}
export default Supernetworks
