import React, { Component } from 'react'
import { SafeAreaView, SectionList, TextInput } from 'react-native'
import { dyndnsAPI } from 'api/Dyndns'
import Icon, { FontAwesomeIcon } from 'FontAwesomeUtils'
import { faXmark, faPlus } from '@fortawesome/free-solid-svg-icons'
import { AlertContext } from 'AppContext'

import {
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  Input,
  Link,
  Switch,
  Text,
  View,
  VStack,
  useColorModeValue
} from 'native-base'

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

  deleteDomain(orig) {
    let new_config = this.state.config
    let new_domains = []
    for (let domain of new_config.domains) {
      if (orig == domain.domain_name) {
        continue
      } else {
        new_domains.push(domain)
      }
    }
    new_config.domains = new_domains
    this.setState({ config: new_config })
  }

  addDomain(new_domain) {
    let new_config = this.state.config
    for (let domain of new_config.domains) {
      if (new_domain == domain.domain_name) {
        return
      }
    }
    new_config.domains.push({
      domain_name: new_domain,
      sub_domains: ['Subdomain']
    })
    this.setState({ config: new_config })
  }

  updateDomain(orig, new_domain) {
    let new_config = this.state.config
    let new_domains = []
    for (let domain of new_config.domains) {
      if (orig == domain.domain_name) {
        new_domains.push({
          domain_name: new_domain,
          sub_domains: domain.sub_domains
        })
      } else {
        new_domains.push(domain)
      }
    }
    new_config.domains = new_domains
    this.setState({ config: new_config })
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
    let new_config = this.state.config
    let new_domains = []
    for (let domain of new_config.domains) {
      if (domainTarget == domain.domain_name) {
        let new_sub_domains = domain.sub_domains
        const index = new_sub_domains.indexOf(origSub)
        if (index > -1) {
          new_sub_domains[index] = newSub
        }
        new_domains.push(domain)
      } else {
        new_domains.push(domain)
      }
    }
    new_config.domains = new_domains
    this.setState({ config: new_config })
  }

  render() {
    const Subdomain = ({ entry, section }) => (
      <HStack space={4} justifyContent="center">
        <TextInput
          w="1/4"
          textAlign="center"
          defaultValue={entry}
          //onChangeText={(d) => this.updateSubdomain(section, entry, d)}/>
          onBlur={(e) =>
            this.updateSubdomain(section, entry, e.nativeEvent.text)
          }
        />
        <Button.Group size="sm">
          <IconButton
            variant="ghost"
            colorScheme="secondary"
            icon={<Icon icon={faXmark} />}
            onPress={() => this.deleteSubdomain(section, entry)}
          />
        </Button.Group>
      </HStack>
    )

    let domainData = []
    if (this.state.config.domains) {
      this.state.config.domains.forEach((entry) => {
        domainData.push({ domain: entry.domain_name, data: entry.sub_domains })
      })
    }

    return (
      <View>
        <Box
          rounded="md"
          _light={{ bg: 'warmGray.50' }}
          _dark={{ bg: 'blueGray.800' }}
          width="100%"
          p="4"
          mb="4"
        >
          <HStack alignItems="center" mb="4">
            <Heading fontSize="xl">Dynamic DNS</Heading>

            <Switch
              marginLeft="auto"
              defaultIsChecked={this.state.isUp}
              onValueChange={this.handleChange}
            />
          </HStack>
          <Box>
            <Link href="https://github.com/TimothyYe/godns#configuration-file-format">
              Powered by godns. Click here to see the Documentation on Github.
            </Link>

            {this.state.config != {} ? (
              <Box
                /*bg={useColorModeValue('warmGray.50', 'blueGray.800')}*/
                rounded="md"
                width="100%"
                p="4"
              >
                <VStack space={2}>
                  {Object.keys(this.state.config)
                    .filter(
                      (label) =>
                        !['run_once', 'domains', 'socks5'].includes(label)
                    )
                    .map((label) => (
                      <HStack space={4} justifyContent="left">
                        <Text bold w="1/4" textAlign="right">
                          {label}
                        </Text>
                        <Input w="1/4" value={this.state.config[label]} />
                      </HStack>
                    ))}

                  <VStack space={2}>
                    <HStack>
                      <Text bold w="1/4" textAlign="right">
                        Domains
                      </Text>
                      <Button.Group size="sm">
                        <IconButton
                          variant="ghost"
                          colorScheme="primary"
                          icon={<Icon icon={faPlus} />}
                          onPress={() => this.addDomain('NewDomain.com')}
                        />
                      </Button.Group>
                    </HStack>

                    <SafeAreaView>
                      <SectionList
                        sections={domainData}
                        keyExtractor={(item, index) => item}
                        renderItem={({ item, index, section }) => (
                          <Subdomain entry={item} section={section.domain} />
                        )}
                        SectionSeparatorComponent={() => <br />}
                        renderSectionHeader={({ section: { domain } }) => (
                          <HStack space={4} justifyContent="center">
                            <TextInput
                              key={domain}
                              style={{ fontWeight: 'bold' }}
                              w="1/4"
                              defaultValue={domain}
                              textAlign="center"
                              onChangeText={(d) => this.updateDomain(domain, d)}
                            />
                            <Button.Group size="sm">
                              <IconButton
                                variant="ghost"
                                colorScheme="primary"
                                icon={<Icon icon={faPlus} />}
                                onPress={() =>
                                  this.addSubdomain(domain, 'NewSubdomain')
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
                      />
                    </SafeAreaView>
                  </VStack>

                  <Button
                    colorScheme="primary"
                    size="md"
                    type="submit"
                    alignSelf="center"
                    width="50%"
                    onPress={this.handleSubmit}
                    mt={4}
                  >
                    Save
                  </Button>
                </VStack>
              </Box>
            ) : (
              <Text>
                DynDNS Plugin is not running. See /configs/wireguard/wg0.conf
              </Text>
            )}
          </Box>
        </Box>
      </View>
    )
  }
}

DynDns.contextType = AlertContext
