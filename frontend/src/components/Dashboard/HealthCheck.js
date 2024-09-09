import React, { useEffect, useState, useContext } from 'react'
import { api } from 'api'
import { AlertContext, AppContext } from 'AppContext'
import { ServerIcon, GlobeIcon, NetworkIcon, WifiIcon } from 'lucide-react-native'
import {
  Box,
  Divider,
  Heading,
  HStack,
  Icon,
  Text,
  VStack,
  useColorMode
} from '@gluestack-ui/themed'

export const HealthCheck = () => {
  const [criticalStatus, setCriticalStatus] = useState({})
  const colorMode = useColorMode()
  const alertContext = useContext(AlertContext)
  const appContext = useContext(AppContext)
  const [criticalToCheck, setCriticalToCheck] = useState([])
  const [processed, setIsProcessed] = useState(false)

  useEffect(() => {

    if (appContext.isFeaturesInitialized === true) {
      let toCheck = appContext.isMeshNode ? [] : ['dns', 'dhcp']
      if (!appContext.isWifiDisabled) {
        toCheck.push('wifid')
      }

      let counter = 0

      const complete = () => {
        counter += 1
        if (counter == toCheck.length) {
          setIsProcessed(true)
        }
      }

      toCheck.forEach((s, idx) => {
        api.get(`/dockerPS?service=${s}`)
          .then(() => {
            setCriticalStatus(prev => ({ ...prev, [s]: true }))
            complete()
            counter += 1
          })
          .catch(() => {
            setCriticalStatus(prev => ({ ...prev, [s]: false }))
            alertContext.warning(s + " service is not running")
            complete()
          })
      })


      setCriticalToCheck(toCheck)
    }
  }, [appContext.isMeshNode, appContext.isFeaturesInitialized, appContext.isWifiDisabled])

  const getServiceIcon = (service) => {
    switch (service) {
      case 'dns':
        return GlobeIcon
      case 'dhcp':
        return NetworkIcon
      case 'wifid':
        return WifiIcon
      default:
        return ServerIcon
    }
  }

  return (
    <Box
      bg={colorMode === 'light' ? '$backgroundCardLight' : '$backgroundCardDark'}
      borderRadius={10}
      p="$4"
    >
      <Heading size="md" fontWeight={300} textAlign="center">
        Health Check
      </Heading>
      <Divider my="$2" />
      <VStack space="md" alignItems="center">
        {processed && criticalToCheck.map((service) => (
          <HStack key={service} space="md" alignItems="center">
            {/*<Icon
              as={getServiceIcon(service)}
              color={criticalStatus[service] ? '$success500' : '$error500'}
              size="sm"
            />*/}
            <Text>{service.toUpperCase()}</Text>
            <Text color={criticalStatus[service] ? '$success500' : '$error500'}>
              {criticalStatus[service] ? 'OK' : 'Stopped'}
            </Text>
          </HStack>
        ))}
      </VStack>
    </Box>
  )
}

export default HealthCheck
