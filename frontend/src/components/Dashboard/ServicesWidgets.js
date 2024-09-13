import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tooltip } from 'components/Tooltip'

import {
  Box,
  HStack,
  Icon,
  Link,
  Pressable,
  Text,
  VStack,
  useColorMode
} from '@gluestack-ui/themed'

import {
  BanIcon,
  GlobeIcon,
  WaypointsIcon,
  RouterIcon,
  WifiIcon
} from 'lucide-react-native'

const ServiceIcon = ({name, link, icon, featureOn, serviceFailed}) => {
  const navigate = useNavigate()
  useEffect(() => {}, [])

  const colorMode = useColorMode()
  //$success400
  const colorOn = colorMode == 'light' ? '$blueGray500' : '$blueGray600',
    colorOff = colorMode == 'light' ? '$muted300' : '$muted500'

  const colorFail =  '$yellow500';

  const size = 32

  return (
    <Tooltip label={serviceFailed ? 'Docker Service Not Running' : ''}>
    <Pressable
      onPress={() => {
        navigate(link)
      }}
    >
      <VStack space="md">
        <Box
          p="$3"
          rounded="$full"
          bg={serviceFailed ? colorFail : featureOn ? colorOn : colorOff}
        >
          <Icon as={icon} color="$white" size={size} />
        </Box>
        <Text alignSelf="center" size="sm">
          {name}
        </Text>
      </VStack>
    </Pressable>
    </Tooltip>
  )
}

const ServicesEnabled = ({ features, isFeaturesInitialized, isMeshNode, serviceStatus, ...props }) => {
  const navigate = useNavigate()
  useEffect(() => {}, [])

  const colorMode = useColorMode()
  //$success400
  const colorOn = colorMode == 'light' ? '$blueGray500' : '$blueGray600',
    colorOff = colorMode == 'light' ? '$muted300' : '$muted500'

  const colorFail =  '$yellow500';

  const size = 32

  const isFail = (name) => {
    if (serviceStatus[name] === false) {
      return true
    }
    return false
  }

  if (isFeaturesInitialized == false) {
    return (
      <Box
        minHeight={150}
        bg="$backgroundCardLight"
        sx={{
          _dark: { bg: '$backgroundCardDark' }
        }}
        borderRadius={10}
        justifyContent="center"
      >
      </Box>
    )
  }

  return (
    <Box
      minHeight={150}
      bg="$backgroundCardLight"
      sx={{
        _dark: { bg: '$backgroundCardDark' }
      }}
      borderRadius={10}
      justifyContent="center"
    >
      <HStack
        space="lg"
        justifyContent="space-around"
        p="$4"
        rounded="lg"
        flexWrap="wrap"
      >
        <ServiceIcon
          name='WiFi'
          link='/admin/wireless'
          icon={WifiIcon}
          featureOn={features.includes('wifi')}
          serviceFailed={isFail('wifid')}
        />

        {isMeshNode == false ? (
        <>
          <ServiceIcon
            name='DNS'
            link='/admin/dnsLog/:ips/:text'
            icon={GlobeIcon}
            featureOn={features.includes('dns')}
            serviceFailed={isFail('dns')}
          />

          <ServiceIcon
            name='Block'
            link='/admin/dnsBlock'
            icon={BanIcon}
            featureOn={features.includes('dns-block')}
            serviceFailed={isFail('dns')}
          />

          <ServiceIcon
            name='VPN'
            link='/admin/wireguard'
            icon={WaypointsIcon}
            featureOn={features.includes('wireguard')}
            serviceFailed={isFail('wireguard')}
          />



        {features.includes('MESH') && (

          <ServiceIcon
            name='Mesh'
            link='/admin/mesh'
            icon={RouterIcon}
            featureOn={features.includes('MESH')}
            serviceFailed={isFail('mesh')}
          />

        )}
        </>
      ) : (
        <ServiceIcon
          name='Mesh'
          link='/admin/mesh'
          icon={RouterIcon}
          featureOn={features.includes('MESH')}
          serviceFailed={isFail('mesh')}
        />
      )}
      </HStack>
    </Box>
  )
}

export { ServicesEnabled }
