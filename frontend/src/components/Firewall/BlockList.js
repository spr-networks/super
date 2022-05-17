import { useRef } from 'react'
import PropTypes from 'prop-types'
import { FontAwesomeIcon } from 'FontAwesomeUtils'
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'

import { firewallAPI } from 'api'
import ModalForm from 'components/ModalForm'
import AddBlock from './AddBlock'

import {
  Badge,
  Box,
  FlatList,
  Heading,
  Icon,
  IconButton,
  Stack,
  HStack,
  VStack,
  Text,
  useColorModeValue
} from 'native-base'

const BlockList = (props) => {
  let list = props.list || []
  let title = props.title || `BlockList:`

  let refModal = useRef(null)

  const deleteListItem = (item) => {
    const done = (res) => {
      props.notifyChange('block')
    }

    firewallAPI.deleteBlock(item).then(done)
  }

  const notifyChange = (t) => {
    refModal.current()
    props.notifyChange('block')
  }

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p="4"
      mb="4"
    >
      <HStack justifyContent="space-between" alignContent="center">
        <VStack>
          <Heading fontSize="xl">{title}</Heading>
        </VStack>
        <ModalForm
          title={`Add IP Block`}
          triggerText="Add IP Block"
          triggerIcon={faPlus}
          modalRef={refModal}
        >
          <AddBlock notifyChange={notifyChange} />
        </ModalForm>
      </HStack>

      <FlatList
        data={list}
        renderItem={({ item }) => (
          <Box
            borderBottomWidth="1"
            _dark={{
              borderColor: 'muted.600'
            }}
            borderColor="muted.200"
            py="2"
          >
            <HStack
              space={3}
              justifyContent="space-between"
              alignItems="center"
            >
              <Badge variant="outline">{item.Protocol}</Badge>

              <Text>{item.SrcIP}</Text>
              <Text>{item.DstIP}</Text>

              <IconButton
                alignSelf="center"
                size="sm"
                variant="ghost"
                colorScheme="secondary"
                icon={<Icon as={FontAwesomeIcon} icon={faXmark} />}
                onPress={() => deleteListItem(item)}
              />
            </HStack>
          </Box>
        )}
        keyExtractor={(item) => `${item.Protocol}${item.SrcIP}${item.DstIP}`}
      />

      {!list.length ? (
        <Text>There are no block rules configured yet</Text>
      ) : null}
    </Box>
  )
}

BlockList.propTypes = {
  notifyChange: PropTypes.func.isRequired
}

export default BlockList
