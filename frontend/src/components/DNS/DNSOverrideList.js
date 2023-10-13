import React from 'react'
import PropTypes from 'prop-types'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'

import ModalForm from 'components/ModalForm'
import DNSAddOverride from 'components/DNS/DNSAddOverride'
import { AlertContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'
import { format as timeAgo } from 'timeago.js'

import {
  Box,
  Heading,
  VStack,
  FlatList,
  HStack,
  Text,
  Button,
  ButtonIcon,
  CloseIcon
} from '@gluestack-ui/themed'

import ListHeader from 'components/List/ListHeader'

import { FlashList } from '@shopify/flash-list'

const DNSOverrideList = (props) => {
  const context = React.useContext(AlertContext)

  const deleteListItem = async (item) => {
    blockAPI
      .deleteOverride(item)
      .then((res) => {
        props.notifyChange('config')
      })
      .catch((error) => {
        context.error('API Failure: ' + error.message)
      })
  }

  let modalRef = React.useRef(null) //React.createRef()

  const notifyChange = async () => {
    if (props.notifyChange) {
      await props.notifyChange('config')
    }
    // close modal when added
    modalRef.current()
  }

  let overrideType = props.title.includes('Block') ? 'block' : 'permit'
  let list = props.list

  return (
    <>
      <ListHeader title={props.title} description="Set rules for DNS queries">
        <ModalForm
          title={'Add ' + props.title}
          triggerText={'Add ' + props.title.split(' ')[0]}
          modalRef={modalRef}
        >
          <DNSAddOverride type={overrideType} notifyChange={notifyChange} />
        </ModalForm>
      </ListHeader>

      <Box mb="$4">
        {!list || !list.length ? (
          <Text>{`No ${props.title.split(' ')[0]} rules configured`}</Text>
        ) : null}
        <FlatList
          data={list}
          renderItem={({ item }) => (
            <Box
              bg="$backgroundCardLight"
              borderBottomWidth={1}
              borderColor="$borderColorCardLight"
              sx={{
                _dark: {
                  bg: '$backgroundCardDark',
                  borderColor: '$borderColorCardDark'
                }
              }}
              p="$4"
            >
              <VStack
                sx={{ '@base': { flexDirection: 'row' } }}
                space="sm"
                justifyContent="space-between"
                alignItems="center"
              >
                <VStack
                  sx={{ '@md': { flexDirection: 'row' } }}
                  justifyContent="space-evenly"
                  flex={1}
                  space={'md'}
                >
                  <VStack
                    flex={1}
                    space={2}
                    sx={{ '@md': { flexDirection: 'row' } }}
                  >
                    <Text bold>{item.Domain}</Text>
                    <HStack space={{ base: 0, md: 2 }}>
                      <Text
                        display={{ base: 'none', md: 'flex' }}
                        color="muted.500"
                      >
                        =
                      </Text>
                      <Text>{item.ResultIP || '0.0.0.0'}</Text>
                    </HStack>
                  </VStack>

                  <VStack
                    flex={1}
                    space="md"
                    sx={{ '@md': { flexDirection: 'row' } }}
                    justifyContent="space-between"
                  >
                    <HStack space={'md'}>
                      <Text color="$muted500">Client:</Text>
                      <Text>{item.ClientIP}</Text>
                    </HStack>

                    <HStack space={'md'}>
                      <Text color="$muted500">Expiration:</Text>
                      <Text>
                        {item.Expiration
                          ? timeAgo(new Date(item.Expiration * 1e3))
                          : 'Never'}
                      </Text>
                    </HStack>
                  </VStack>
                </VStack>

                <Button variant="link" onPress={() => deleteListItem(item)}>
                  <ButtonIcon as={CloseIcon} color="$red700" />
                </Button>
              </VStack>
            </Box>
          )}
          keyExtractor={(item) => item.Domain}
        />
      </Box>
    </>
  )
}

DNSOverrideList.propTypes = {
  title: PropTypes.string.isRequired,
  list: PropTypes.array,
  notifyChange: PropTypes.func
}

export default DNSOverrideList
