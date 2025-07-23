import React from 'react'
import {
  Modal,
  ModalBackdrop,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  ButtonText,
  Heading,
  Icon,
  VStack,
  HStack,
  Text,
  Box,
  Badge,
  BadgeText,
  BadgeIcon,
  ScrollView,
  AlertCircleIcon,
  CheckCircleIcon,
  LockIcon,
  CloseIcon
} from '@gluestack-ui/themed'

const PluginPermissionPrompt = ({ 
  isOpen, 
  onClose, 
  onAccept, 
  pluginName, 
  permissions,
  gitUrl,
  networkCapabilities 
}) => {
  const getPolicyDescription = (policy) => {
    const descriptions = {
      'wan': 'Access to internet/WAN',
      'lan': 'Access to local network',
      'dns': 'Access to DNS services',
      'api': 'Access to SPR API',
      'lan_upstream': 'Access to private/RFC1918 addresses',
      'disabled': 'No network access',
      'dns:family': 'Family-safe DNS filtering'
    }
    return descriptions[policy] || policy
  }

  const getAccessLevelColor = (level) => {
    switch (level) {
      case 'FULL':
        return 'error'
      case 'SCOPED':
        return 'warning'
      case 'NONE':
        return 'success'
      default:
        return 'muted'
    }
  }

  const getAccessLevelIcon = (level) => {
    switch (level) {
      case 'FULL':
        return AlertCircleIcon
      case 'SCOPED':
        return LockIcon
      case 'NONE':
        return CheckCircleIcon
      default:
        return CheckCircleIcon
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalBackdrop />
      <ModalContent>
        <ModalHeader>
          <Heading size="lg">Plugin Permissions</Heading>
          <ModalCloseButton>
            <Icon as={CloseIcon} />
          </ModalCloseButton>
        </ModalHeader>
        
        <ModalBody>
          <VStack space="lg">
            <Box>
              <Text size="md" mb="$2">
                <Text bold>{pluginName || 'This plugin'}</Text> is requesting the following permissions:
              </Text>
              {gitUrl && (
                <Text size="sm" color="$muted500">
                  Source: {gitUrl}
                </Text>
              )}
            </Box>

            <HStack space="sm" alignItems="center">
              <Icon 
                as={getAccessLevelIcon(permissions.accessLevel)} 
                size="xl" 
                color={`$${getAccessLevelColor(permissions.accessLevel)}500`}
              />
              <VStack>
                <Text size="lg" bold>
                  {permissions.level}
                </Text>
                <Text size="sm" color="$muted500">
                  {permissions.description}
                </Text>
              </VStack>
            </HStack>

            {permissions.paths && permissions.paths.length > 0 && (
              <Box 
                bg="$backgroundLight100" 
                p="$3" 
                borderRadius="$md"
                borderWidth={1}
                borderColor="$borderLight200"
              >
                <Text size="sm" bold mb="$2">
                  API Endpoints:
                </Text>
                <ScrollView maxHeight={200}>
                  <VStack space="xs">
                    {permissions.paths.map((path, index) => (
                      <HStack key={index} space="xs">
                        <Text size="sm" color="$muted600">•</Text>
                        <Text size="sm" fontFamily="$mono">
                          {path}
                        </Text>
                      </HStack>
                    ))}
                  </VStack>
                </ScrollView>
              </Box>
            )}

            {permissions.accessLevel === 'FULL' && (
              <Box 
                bg="$error50" 
                p="$3" 
                borderRadius="$md"
                borderWidth={1}
                borderColor="$error200"
              >
                <HStack space="sm" alignItems="center">
                  <Icon as={AlertCircleIcon} color="$error500" />
                  <Text size="sm" color="$error700" flex={1}>
                    This plugin requires full access to all SPR APIs. Only install plugins from trusted sources.
                  </Text>
                </HStack>
              </Box>
            )}

            {networkCapabilities && networkCapabilities.Interface && (
              <Box 
                bg="$backgroundLight100" 
                p="$3" 
                borderRadius="$md"
                borderWidth={1}
                borderColor="$borderLight200"
              >
                <Text size="sm" bold mb="$2">
                  Network Access:
                </Text>
                <VStack space="sm">
                  <HStack space="xs">
                    <Text size="sm" color="$muted600">Interface:</Text>
                    <Text size="sm" fontFamily="$mono">{networkCapabilities.Interface}</Text>
                  </HStack>
                  
                  {networkCapabilities.Policies && networkCapabilities.Policies.length > 0 && (
                    <VStack space="xs">
                      <Text size="sm" color="$muted600">Network Policies:</Text>
                      <VStack space="xs">
                        {networkCapabilities.Policies.map((policy, index) => (
                          <HStack key={index} space="xs" alignItems="center">
                            <Text size="sm" color="$muted600">•</Text>
                            <Text size="sm">
                              <Text fontFamily="$mono">{policy}</Text> - {getPolicyDescription(policy)}
                            </Text>
                          </HStack>
                        ))}
                      </VStack>
                    </VStack>
                  )}
                  
                  {networkCapabilities.Groups && networkCapabilities.Groups.length > 0 && (
                    <VStack space="xs">
                      <Text size="sm" color="$muted600">Groups:</Text>
                      <HStack space="sm" flexWrap="wrap">
                        {networkCapabilities.Groups.map((group, index) => (
                          <Badge key={index} size="sm" variant="solid" action="info">
                            <BadgeText>{group}</BadgeText>
                          </Badge>
                        ))}
                      </HStack>
                    </VStack>
                  )}
                </VStack>
              </Box>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter>
          <HStack space="md">
            <Button variant="outline" onPress={onClose}>
              <ButtonText>Cancel</ButtonText>
            </Button>
            <Button 
              action={permissions.accessLevel === 'FULL' ? 'negative' : 'positive'}
              onPress={onAccept}
            >
              <ButtonText>Accept & Install</ButtonText>
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default PluginPermissionPrompt