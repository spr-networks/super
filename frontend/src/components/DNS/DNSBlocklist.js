import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons'

import { blockAPI } from 'api/DNS'
import DNSAddBlocklist from 'components/DNS/DNSAddBlocklist'
import ModalForm from 'components/ModalForm'
import { AlertContext } from 'layouts/Admin'

import {
  Box,
  FlatList,
  Heading,
  Icon,
  IconButton,
  Stack,
  HStack,
  VStack,
  Skeleton,
  Spacer,
  Spinner,
  Switch,
  Text,
  useColorModeValue
} from 'native-base'

export default class DNSBlocklist extends React.Component {
  state = { list: [], blockedDomains: 0, pending: false }

  constructor(props) {
    super(props)

    this.state.list = []

    this.handleItemSwitch = this.handleItemSwitch.bind(this)
    this.deleteListItem = this.deleteListItem.bind(this)
    this.notifyChange = this.notifyChange.bind(this)

    this.refAddBlocklistModal = React.createRef()
  }

  async componentDidMount() {
    this.refreshBlocklists()

    this.setState({ pending: true })

    blockAPI.metrics().then((metrics) => {
      this.setState({ blockedDomains: metrics.BlockedDomains })
    })
  }

  async refreshBlocklists() {
    let list = []
    // pending requests
    setTimeout(() => {
      if (!list.length) {
        this.setState({ list })
        this.setState({ pending: true })
      }
    }, 1500)

    blockAPI
      .blocklists()
      .then((blocklist) => {
        list = blocklist
        this.setState({ list })
        this.setState({ pending: false })
      })
      .catch((error) => {
        this.context.error('API Failure: ' + error.message)
      })
  }

  async notifyChange(type) {
    this.setState({ pending: false })
    await this.refreshBlocklists()
  }

  handleItemSwitch(item, value) {
    item.Enabled = value
    const list = this.state.list.map((_item) => {
      if (_item.URI == item.URI) {
        _item.Enabled = item.Enabled
      }

      return _item
    })

    // only update the ui
    this.setState({ list })
    this.setState({ pending: true })

    blockAPI
      .putBlocklist(item)
      .then((res) => {
        this.notifyChange('blocklists')
      })
      .catch((error) => {
        this.context.error('API Failure: ' + error.message)
      })
  }

  deleteListItem(item) {
    if (this.state.pending) {
      return this.context.error('Wait for pending updates to finish')
    }

    this.setState({ pending: true })

    blockAPI
      .deleteBlocklist(item)
      .then((res) => {
        this.notifyChange('blocklists')
      })
      .catch((error) => {
        this.context.error('API Failure: ' + error.message)
      })
  }

  render() {
    const notifyChangeBlocklist = async () => {
      await this.notifyChange()
      // close modal when added
      this.refAddBlocklistModal.current()
    }

    return (
      <Box
        _light={{ bg: 'warmGray.50' }}
        _dark={{ bg: 'blueGray.800' }}
        rounded="md"
        width="100%"
        p="4"
        mb="4"
      >
        <HStack justifyContent="space-between">
          <VStack>
            <Heading fontSize="xl">DNS Blocklists</Heading>

            {!this.state.pending ? (
              <Text color="muted.500">
                {this.state.blockedDomains.toLocaleString()} blocked domains
              </Text>
            ) : (
              <HStack space={1}>
                <Spinner accessibilityLabel="Loading posts" />
                <Text color="muted.500">Update running...</Text>
              </HStack>
            )}
          </VStack>

          <Box alignSelf="center">
            {!this.state.pending ? (
              <ModalForm
                title="Add DNS Blocklist"
                triggerText="add"
                triggerClass="pull-right"
                triggerIcon={faPlus}
                modalRef={this.refAddBlocklistModal}
              >
                <DNSAddBlocklist notifyChange={notifyChangeBlocklist} />
              </ModalForm>
            ) : null}
          </Box>
        </HStack>

        <FlatList
          data={this.state.list}
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
                <Text minW="50%" isTruncated>
                  {item.URI}
                </Text>

                <Box>
                  <Switch
                    isDisabled={this.state.pending}
                    defaultIsChecked={item.Enabled}
                    onValueChange={() =>
                      this.handleItemSwitch(item, !item.Enabled)
                    }
                  />
                </Box>

                <IconButton
                  alignSelf="center"
                  size="sm"
                  variant="ghost"
                  colorScheme="secondary"
                  icon={<Icon as={FontAwesomeIcon} icon={faXmark} />}
                  onPress={() => this.deleteListItem(item)}
                />
              </HStack>
            </Box>
          )}
          keyExtractor={(item) => item.URI}
        />
      </Box>
    )
  }
}

DNSBlocklist.contextType = AlertContext
