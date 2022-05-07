import React from 'react'
import PropTypes from 'prop-types'
import { withRouter } from 'react-router'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faMagnifyingGlass, faTrash } from '@fortawesome/free-solid-svg-icons'

import { AlertContext } from 'layouts/Admin'
import ClientSelect from 'components/ClientSelect'
import DNSAddOverride from './DNSAddOverride'
import ModalForm from 'components/ModalForm'
import { logAPI } from 'api/DNS'
import { prettyDate } from 'utils'

import {
  Box,
  Button,
  FlatList,
  FormControl,
  Heading,
  Icon,
  Input,
  Stack,
  HStack,
  VStack,
  Text,
  ScrollView
} from 'native-base'

export class DNSLogHistoryList extends React.Component {
  static contextType = AlertContext
  state = {
    list: [],
    listAll: [],
    filterIPs: [],
    filterText: '',
    filterDateStart: '',
    filterDateEnd: '',
    selectedDomain: ''
  }

  constructor(props) {
    super(props)

    this.state.filterIPs = props.ips || []
    this.state.filterText = props.filterText || ''

    this.modalRef = React.createRef(null)

    this.handleChangeIP = this.handleChangeIP.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.triggerAlert = this.triggerAlert.bind(this)
    this.deleteHistory = this.deleteHistory.bind(this)
  }

  async componentDidMount() {
    await this.refreshList(this.state.filterIPs, this.filterList)
  }

  // next function is to ensure the state.list is updated
  async refreshList(ips, next) {
    if (!ips.length) {
      this.setState({ list: [], listAll: [] })
      return
    }

    Promise.allSettled(
      ips.map(async (ip) => {
        try {
          let list = await logAPI.history(ip)
          list = list.slice(0, 20)
          return list
        } catch (error) {
          throw `${ip}`
        }
      })
    ).then((results) => {
      let rejected = results
        .filter((r) => r.status == 'rejected')
        .map((r) => r.reason)
      if (rejected.length) {
        this.context.error('No DNS query history for ' + rejected.join(','))
      }

      let lists = results
        .filter((r) => r.value && r.value.length)
        .map((r) => r.value)

      // merge and sort lists desc
      let list = [].concat.apply([], lists)
      list.sort(
        (a, b) =>
          new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime()
      )

      this.setState({ listAll: list })
      this.setState({ list }, next)
    })
  }

  filterList(filterText = null) {
    if (!filterText) {
      filterText = this.state.filterText
    }

    if (!filterText.length) {
      return
    }

    let list = this.state.listAll

    let doFilter = false
    doFilter = doFilter || filterText.length

    let datematch = filterText.match(
      /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)-(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/
    )

    let dateStart = null,
      dateEnd = null

    if (datematch) {
      try {
        let [filterDateStart, filterDateEnd] = datematch.slice(1, 3)
        dateStart = new Date(filterDateStart).getTime()
        dateEnd = new Date(filterDateEnd).getTime()
      } catch (error) {}
    }

    if (doFilter) {
      list = list.filter((item) => {
        let match = false

        try {
          match = match || item.FirstName.includes(filterText)
          match = match || item.FirstAnswer.includes(filterText)
          match =
            match || item.Q.filter((r) => r.Name.includes(filterText)).length
          match = match || item.Type.match(filterText.toUpperCase())
        } catch (err) {
          match = false
        }

        if (dateStart && dateEnd) {
          let d = new Date(item.Timestamp).getTime()
          if (dateStart < d && d < dateEnd) {
            match = true
          }
        }

        return match
      })
    }

    this.setState({ list })
  }

  handleChangeIP(selectedIPs) {
    this.setState({ selectedIPs })

    let ips = selectedIPs.map((item) => item.value)

    // update url to include ips & filterText
    if (ips.length) {
      this.props.history.push(
        `/admin/dnsLog/${ips.join(',')}/${this.state.filterText}`
      )
    }

    this.setState({ filterIPs: ips })

    this.refreshList(ips)
  }

  handleChange(value) {
    this.setState({ filterText: value })

    this.filterList(value)
  }

  triggerAlert(index) {
    this.context.alert(
      'info',
      'DNS query',
      <ScrollView w="100%" h="400">
        <Text fontSize="xs">
          {JSON.stringify(this.state.list[index], null, '  ')}
        </Text>
      </ScrollView>
    )
  }

  deleteHistory() {
    let msg = `Delete history for ${this.state.filterIPs.join(', ')}?`
    if (!confirm(msg) || !this.state.filterIPs.length) {
      return
    }

    this.state.filterIPs.map(logAPI.deleteHistory)

    this.refreshList(this.state.filterIPs, this.filterList)
  }

  render() {
    const colorByType = (type) => {
      let keys = {
        NOERROR: 'success',
        NODATA: 'warning',
        OTHERERROR: 'danger',
        NXDOMAIN: 'danger'
      }

      let color = keys[type] || 'danger'

      return `${color}.500`
    }

    let hideClient = this.state.filterIPs.length <= 1
    hideClient = false

    const dateSelection = {
      startDate: new Date(),
      endDate: new Date(),
      key: 'selection'
    }

    const handleClickDomain = (e) => {
      let selectedDomain = e.target.innerText
      this.setState({ selectedDomain })
      this.modalRef.current() // toggle modal
      e.preventDefault()
    }

    const notifyChange = async () => {
      this.modalRef.current()
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
        <ModalForm
          title="Block domain"
          modalRef={this.modalRef}
          hideButton={true}
        >
          <DNSAddOverride
            type="block"
            domain={this.state.selectedDomain}
            clientip={
              this.state.filterIPs.length == 1 ? this.state.filterIPs[0] : '*'
            }
            notifyChange={notifyChange}
          />
        </ModalForm>

        <VStack space={2} mb="12">
          <Heading fontSize="lg">
            {this.state.filterIPs.join(',')} DNS Log
          </Heading>

          <Stack space={2} direction={{ base: 'column', md: 'row' }}>
            <FormControl flex="2">
              <FormControl.Label>Client</FormControl.Label>
              <ClientSelect
                isMulti
                value={this.state.filterIPs}
                onChange={this.handleChangeIP}
              />
            </FormControl>

            <FormControl flex="2">
              <FormControl.Label>Search</FormControl.Label>

              <Input
                type="text"
                name="filterText"
                size="lg"
                placeholder="Filter domain..."
                value={this.state.filterText}
                onChangeText={this.handleChange}
                InputRightElement={
                  <Icon
                    as={FontAwesomeIcon}
                    icon={faMagnifyingGlass}
                    color="muted.400"
                    mr={2}
                  />
                }
              />
            </FormControl>

            {/*
                <Input
                  type="date"
                  name="filterDateStart"
                  value={this.state.filterDateStart}
                  onChange={this.handleChange}
                  placeholder="Start"
                />            
                <Input
                  type="date"
                  name="filterDateEnd"
                  value={this.state.filterDateEnd}
                  onChange={this.handleChange}
                  placeholder="End"
                />
              */}

            <FormControl flex="1">
              {this.state.filterIPs.length && this.state.list.length ? (
                <>
                  <FormControl.Label>Delete history</FormControl.Label>
                  <Button
                    size="md"
                    variant="subtle"
                    colorScheme="danger"
                    leftIcon={<Icon as={FontAwesomeIcon} icon={faTrash} />}
                    onPress={this.deleteHistory}
                  >
                    Delete
                  </Button>
                </>
              ) : null}
            </FormControl>
          </Stack>
        </VStack>

        <FlatList
          data={this.state.list}
          renderItem={({ item, index }) => (
            <Box
              borderBottomWidth="1"
              _dark={{
                borderColor: 'muted.600'
              }}
              borderColor="muted.200"
            >
              <HStack
                space={1}
                justifyContent="space-between"
                alignItems="center"
                borderLeftWidth={2}
                borderLeftColor={colorByType(item.Type)}
                py="2"
                pl="2"
              >
                <Text
                  display={{ base: 'none', md: 'flex' }}
                  flex="1"
                  color={colorByType(item.Type)}
                >
                  {item.Type}
                </Text>

                {hideClient ? null : (
                  <Text flex="1">{item.Remote.split(':')[0]}</Text>
                )}

                <Stack space={1} flex="3">
                  <Text bold isTruncated onPress={handleClickDomain}>
                    {item.FirstName}
                  </Text>

                  <Text
                    color="muted.500"
                    onPress={() => this.triggerAlert(index)}
                  >
                    {item.FirstAnswer || '0.0.0.0'}
                  </Text>
                </Stack>

                <Text fontSize="xs" alignSelf="flex-start">
                  {prettyDate(item.Timestamp)}
                </Text>
              </HStack>
            </Box>
          )}
          keyExtractor={(item) => item.Timestamp}
        />
      </Box>
    )
  }
}

const DNSLogHistoryListWithRouter = withRouter(DNSLogHistoryList)

DNSLogHistoryListWithRouter.propTypes = {
  ips: PropTypes.array,
  filterText: PropTypes.string,
  history: PropTypes.shape({
    push: PropTypes.func
  }) //.isRequired
}

export default DNSLogHistoryListWithRouter
