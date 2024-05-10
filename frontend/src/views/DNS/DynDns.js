import React, { Component } from 'react'
import { dyndnsAPI } from 'api/Dyndns'
import { AlertContext } from 'AppContext'
import { ucFirst } from 'utils'
import { Navigate } from 'react-router-dom';

import {
  Box,
  Button,
  ButtonText,
  ButtonGroup,
  Divider,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  HStack,
  Input,
  InputField,
  InputSlot,
  Link,
  Switch,
  SectionList,
  Text,
  View,
  VStack,
  ButtonIcon,
  CloseIcon,
  AddIcon,
  LinkText
} from '@gluestack-ui/themed'

import { ListHeader } from 'components/List'

const Subdomain = ({ entry, domain, updateSubdomain, deleteSubdomain }) => (
  <HStack space="md" my="$2">
    <Input flex={1} size="md" variant="outline">
      <InputField
        defaultValue={entry}
        onChangeText={(value) => updateSubdomain(domain, entry, value)}
      />
      <InputSlot>
        <Button
          action="secondary"
          variant="link"
          onPress={() => deleteSubdomain(domain, entry)}
        >
          <ButtonIcon as={CloseIcon} />
        </Button>
      </InputSlot>
    </Input>
  </HStack>
)

export default class DynDns extends Component {
  state = { isUp: true, config: {}, navigate: false }
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

  handleButtonClick = () => {
    this.setState({ navigate: true });
  };

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

    //as an easy workaround,
    //update ip_urls to be an array again
    let ip_urls = this.state.config['ip_urls']
    this.state.config['ip_urls'] = ip_urls.split(',').map((e) => e.trim())
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

    if (this.state.navigate) {
      return <Navigate to="/admin/plugins" replace={true} />;
    }

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
        <ListHeader title="Dynamic DNS" description="Powered by godns">
          <Link
            href="https://github.com/TimothyYe/godns#configuration-file-format"
            isExternal
          >
            <LinkText size="sm" color="$muted500">
              Read the documentation
            </LinkText>
          </Link>
          {/*<Switch
            marginLeft="auto"
            value={this.state.isUp}
            defaultIsChecked={this.state.isUp}
            onValueChange={this.handleChange}
          />*/}
        </ListHeader>

        <Box
          bg="$backgroundCardLight"
          sx={{
            _dark: { bg: '$backgroundCardDark' }
          }}
          p="$4"
        >
          <VStack space={4}>
            {this.state.config.provider != undefined ? (
              <VStack space="md">
                <VStack
                  space="md"
                  width={['100%', '100%', '5/6']}
                  sx={{ '@md': { flexDirection: 'row' } }}
                >
                  <VStack space="md" minW="$1/2">
                    {Object.keys(this.state.config)
                      .filter(
                        (label) =>
                          ![
                            'run_once',
                            'domains',
                            'socks5',
                            'ip_url',
                            'ipv6_url'
                          ].includes(label)
                      )
                      .map((label) => (
                        <FormControl>
                          <HStack key={label} space="md" justifyItems="center">
                            <FormControlLabel
                              flex={1}
                              size="xs"
                              justifyContent="flex-end"
                            >
                              <FormControlLabelText>
                                {niceLabel(label)}
                              </FormControlLabelText>
                            </FormControlLabel>
                            <Input flex={2} variant="underlined">
                              <InputField
                                value={this.state.config[label]}
                                onChangeText={(value) =>
                                  handleChange(label, value)
                                }
                              />
                            </Input>
                          </HStack>
                        </FormControl>
                      ))}
                  </VStack>

                  <VStack space="md" minW="$1/2">
                    <HStack space="md">
                      <FormControlLabel flex={1} justifyContent="flex-end">
                        <FormControlLabelText>Domains</FormControlLabelText>
                      </FormControlLabel>

                      <ButtonGroup flex={2} size="xs" justifyContent="flex-end">
                        <Button
                          action="primary"
                          variant="outline"
                          onPress={() => this.addDomain('domain.tld')}
                        >
                          <ButtonText>Add domain</ButtonText>
                          <ButtonIcon as={AddIcon} ml="$1" />
                        </Button>
                      </ButtonGroup>
                    </HStack>

                    <VStack
                      sx={{ '@md': { flexDirection: 'row' } }}
                      justifyContent="flex-start"
                    >
                      <Box
                        sx={{
                          '@base': { display: 'none' },
                          '@md': { display: 'flex' }
                        }}
                        flex={1}
                      ></Box>
                      <SectionList
                        sections={domainData}
                        renderSectionFooter={({ section }) => (
                          <Divider my="$2" />
                        )}
                        renderSectionHeader={({ section: { domain } }) => (
                          <HStack space="md" my="$2">
                            <Input flex={1} variant="underlined">
                              <InputField
                                defaultValue={domain}
                                onChangeText={(d) =>
                                  this.updateDomain(domain, d)
                                }
                              />
                            </Input>
                            <ButtonGroup size="sm">
                              <Button
                                action="primary"
                                variant="link"
                                onPress={() =>
                                  this.addSubdomain(domain, 'subdomain')
                                }
                              >
                                <ButtonIcon as={AddIcon} />
                              </Button>
                              <Button
                                action="secondary"
                                variant="link"
                                onPress={() => this.deleteDomain(domain)}
                              >
                                <ButtonIcon as={CloseIcon} />
                              </Button>
                            </ButtonGroup>
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
                    </VStack>
                  </VStack>
                </VStack>

                <Button
                  action="primary"
                  size="md"
                  w="$1/3"
                  alignSelf="center"
                  onPress={this.handleSubmit}
                >
                  <ButtonText>Save</ButtonText>
                </Button>
              </VStack>
            ) : (
              <Button
                size="sm"
                action="secondary"
                onPress={this.handleButtonClick}
              >
                <ButtonText>DynDNS Plugin is not running, enable under Plugins</ButtonText>
                <ButtonIcon as={AddIcon} ml="$2" />
              </Button>
            )}
          </VStack>
        </Box>
      </View>
    )
  }
}

DynDns.contextType = AlertContext
