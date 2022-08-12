import React, { Component } from 'react'
import { dyndnsAPI } from 'api/Dyndns'
import Icon, { FontAwesomeIcon } from 'FontAwesomeUtils'
import { faXmark, faPlus } from '@fortawesome/free-solid-svg-icons'
import { AlertContext } from 'AppContext'
import { ucFirst } from 'utils'

import {
  Box,
  Button,
  Divider,
  FlatList,
  FormControl,
  Heading,
  HStack,
  IconButton,
  Input,
  Link,
  Stack,
  Switch,
  SectionList,
  Text,
  View,
  VStack,
  useColorModeValue,
  InputGroup,
  InputRightAddon
} from 'native-base'

const Subdomain = ({ entry, domain, updateSubdomain, deleteSubdomain }) => (
  <HStack space={2} my={2}>
    <InputGroup width="100%">
      <Input
        flex={1}
        size="md"
        variant="outline"
        defaultValue={entry}
        onChangeText={(value) => updateSubdomain(domain, entry, value)}
      />
      <InputRightAddon
        children={
          <Text fontSize="xs" color="muted.500">
            .{domain}
          </Text>
        }
      />
      <InputRightAddon
        children={
          <Button.Group size="sm">
            <IconButton
              variant="ghost"
              colorScheme="secondary"
              icon={<Icon icon={faXmark} />}
              onPress={() => deleteSubdomain(domain, entry)}
            />
          </Button.Group>
        }
      />
    </InputGroup>
  </HStack>
)

export default class DynDns extends Component {
  state = { isUp: true, config: {} }
  constructor(props) {
    super(props)
    this.config = {}
    this.isUp = true

    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)

    this.addDomain = this.addDomain.bind(this)
    this.updateDomain = this.updateDomain.bind(this)
    this.deleteDomain = this.deleteDomain.bind(this)
    this.addSubdomain = this.addSubdomain.bind(this)
    this.deleteSubdomain = this.deleteSubdomain.bind(this)
    this.updateSubdomain = this.updateSubdomain.bind(this)
  }

  getConfig() {
    dyndnsAPI
      .config()
      .then((config) => {
        this.setState({ config })
      })
      .catch((err) => {
        this.setState({ isUp: false })
      })
  }

  componentDidMount() {
    this.getConfig()
  }

  handleSubmit() {
    const done = (res) => {
      this.context.success('Set Dyndns Configuration')
    }

    dyndnsAPI.setConfig(this.state.config).then(done, (e) => {
      this.context.error('API Failure: ' + e.message)
    })
  }

  handleChange() {
    let value = !this.state.isUp
  }

  deleteDomain(name) {
    let config = this.state.config
    let domains = config.domains || []

    config.domains = domains.filter((d) => d.domain_name !== name)

    this.setState({ config })
  }

  addDomain(name) {
    let config = this.state.config,
      domains = config.domains || []

    if (domains.map((d) => d.domain_name).includes(name)) {
      return
    }

    domains.push({
      domain_name: name,
      sub_domains: ['subdomain']
    })

    config.domains = domains

    this.setState({ config })
  }

  updateDomain(name, new_domain) {
    let config = this.state.config

    for (let domain of config.domains) {
      if (name == domain.domain_name) {
        domain.domain_name = new_domain
      }
    }

    this.setState({ config })
  }

  deleteSubdomain(domainTarget, subdomainTarget) {
    let new_config = this.state.config
    let new_domains = []
    for (let domain of new_config.domains) {
      if (domainTarget == domain.domain_name) {
        let new_sub_domains = domain.sub_domains
        const index = new_sub_domains.indexOf(subdomainTarget)
        if (index > -1) {
          new_sub_domains.splice(index, 1)
        }
        new_domains.push(domain)
      } else {
        new_domains.push(domain)
      }
    }
    new_config.domains = new_domains
    this.setState({ config: new_config })
  }

  addSubdomain(section, entry) {
    let new_config = this.state.config
    for (let domain of new_config.domains) {
      if (section == domain.domain_name) {
        if (domain.sub_domains.includes(entry)) {
          //already exists
          continue
        } else {
          domain.sub_domains.push(entry)
          this.setState({ config: new_config })
          return
        }
      }
    }
  }

  updateSubdomain(domainTarget, origSub, newSub) {
    let config = this.state.config,
      domains = []

    for (let domain of config.domains) {
      if (domainTarget == domain.domain_name) {
        let subdomains = domain.sub_domains
        const index = subdomains.indexOf(origSub)
        if (index > -1) {
          subdomains[index] = newSub
        }

        domains.push(domain)
      } else {
        domains.push(domain)
      }
    }

    config.domains = domains

    this.setState({ config })
  }

  render() {
    let domainData = []
    if (this.state.config.domains) {
      this.state.config.domains.forEach((entry) => {
        domainData.push({ domain: entry.domain_name, data: entry.sub_domains })
      })
    }

    const niceLabel = (label) => ucFirst(label.replace(/_/g, ' '))

    const handleChange = (name, value) => {
      let config = this.state.config
      config[name] = value
      this.setState({ config })
    }

    return (
      <View>
        <HStack alignItems="center" p={4}>
          <VStack space={1}>
            <Heading fontSize="md">Dynamic DNS</Heading>
            <HStack space={1}>
              <Text color="muted.500" fontSize="xs">
                Powered by godns.
              </Text>
              <Link
                _text={{ color: 'muted.500', fontSize: 'xs' }}
                href="https://github.com/TimothyYe/godns#configuration-file-format"
              >
                Read the documentation
              </Link>
            </HStack>
          </VStack>

          <Switch
            marginLeft="auto"
            defaultIsChecked={this.state.isUp}
            onValueChange={this.handleChange}
          />
        </HStack>

        <Box
          rounded="md"
          _light={{ bg: 'warmGray.50' }}
          _dark={{ bg: 'blueGray.800' }}
          width="100%"
          p={4}
          mb={4}
        >
          <VStack space={4}>
            {this.state.config.provider != undefined ? (
              <VStack space={8}>
                <Stack
                  space={2}
                  width={['100%', '100%', '5/6']}
                  direction={{ base: 'column', md: 'row' }}
                >
                  <VStack space={4} minW="1/2">
                    {Object.keys(this.state.config)
                      .filter(
                        (label) =>
                          !['run_once', 'domains', 'socks5'].includes(label)
                      )
                      .map((label) => (
                        <HStack key={label} space={4} justifyItems="center">
                          <FormControl.Label
                            flex={1}
                            fontSize="xs"
                            justifyContent="flex-end"
                          >
                            {niceLabel(label)}
                          </FormControl.Label>
                          <Input
                            flex={2}
                            size="md"
                            variant="underlined"
                            value={this.state.config[label]}
                            onChangeText={(value) => handleChange(label, value)}
                          />
                        </HStack>
                      ))}
                  </VStack>

                  <VStack space={4} minW="1/2">
                    <HStack space={4}>
                      <FormControl.Label flex={1} justifyContent="flex-end">
                        Domains
                      </FormControl.Label>

                      <Button.Group
                        flex={2}
                        size="xs"
                        justifyContent="flex-end"
                      >
                        <Button
                          variant="outline"
                          colorScheme="primary"
                          leftIcon={<Icon icon={faPlus} />}
                          onPress={() => this.addDomain('domain.tld')}
                        >
                          Add domain
                        </Button>
                      </Button.Group>
                    </HStack>

                    <Stack
                      direction={{ base: 'column', md: 'row' }}
                      justifyContent="flex-start"
                    >
                      <Box
                        display={{ base: 'none', md: 'flex' }}
                        flex={1}
                      ></Box>
                      <SectionList
                        sections={domainData}
                        renderSectionFooter={({ section }) => (
                          <Divider my={2} />
                        )}
                        renderSectionHeader={({ section: { domain } }) => (
                          <HStack space={2} my={2}>
                            <Input
                              flex={1}
                              size="md"
                              variant="underlined"
                              defaultValue={domain}
                              onChangeText={(d) => this.updateDomain(domain, d)}
                            />
                            <Button.Group size="sm">
                              <IconButton
                                variant="ghost"
                                colorScheme="primary"
                                icon={<Icon icon={faPlus} />}
                                onPress={() =>
                                  this.addSubdomain(domain, 'subdomain')
                                }
                              />
                              <IconButton
                                variant="ghost"
                                colorScheme="secondary"
                                icon={<Icon icon={faXmark} />}
                                onPress={() => this.deleteDomain(domain)}
                              />
                            </Button.Group>
                          </HStack>
                        )}
                        renderItem={({ item, section }) => (
                          <Subdomain
                            entry={item}
                            domain={section.domain}
                            updateSubdomain={this.updateSubdomain}
                            deleteSubdomain={this.deleteSubdomain}
                          />
                        )}
                        keyExtractor={(item, index) =>
                          `${item.provider}-${index}`
                        }
                      />
                    </Stack>
                  </VStack>
                </Stack>

                <Button
                  colorScheme="primary"
                  size="md"
                  w="1/3"
                  alignSelf="center"
                  onPress={this.handleSubmit}
                >
                  Save
                </Button>
              </VStack>
            ) : (
              <Text>DynDNS Plugin is not running</Text>
            )}
          </VStack>
        </Box>
      </View>
    )
  }
}

DynDns.contextType = AlertContext
