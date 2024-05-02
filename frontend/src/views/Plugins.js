import React, { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  FlatList,
  Input,
  InputField,
  InfoIcon,
  Link,
  HStack,
  VStack,
  Switch,
  Text,
  CloseIcon,
  LinkText,
  ScrollView,
  Spinner,
  ButtonSpinner,
  AddIcon,
  CheckIcon
} from '@gluestack-ui/themed'

import PluginList from 'components/Plugins/PluginList'
import { ListHeader } from 'components/List'

import { api, pluginAPI } from 'api'
import { alertState } from 'AppContext'
import ModalForm from 'components/ModalForm'
import AddPlugin from 'components/Plugins/AddPlugin'

const Plugins = (props) => {
  const [list, _setList] = useState([])
  const [plusList, setPlusList] = useState([])
  const [versions, setVersions] = useState({})

  const [token, setToken] = useState('')
  const [activeToken, setActiveToken] = useState('')
  const [updated, setUpdated] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const navigate = useNavigate()

  const setList = (plugins) => {
    _setList(plugins.filter((x) => x.Plus == false))
    setPlusList(plugins.filter((x) => x.Plus == true))
  }

  const getPluginVersionName = (plugin) => {
    let name = plugin.Name.toLowerCase()
    if (name.match(/^dns-(block|log)-extension$/)) {
      name = 'dns'
    }

    return `super${name}`
  }

  //get each plugin version
  const fetchVersions = async (plugins) => {
    //only fetch on init
    let vs = versions
    if (!Object.keys(versions)?.length) {
      let names = plugins.map(getPluginVersionName)
      vs = await api.version(names)

      setVersions(vs)
    }

    let pluginsV = [...plugins].map((p) => {
      let k = getPluginVersionName(p)
      p.Version = vs[k] || 'none'
      return p
    })

    setList(pluginsV)
  }

  const refreshList = (next) => {
    pluginAPI
      .list()
      .then((plugins) => {
        setList(plugins)
        fetchVersions(plugins)
          .then((withVersion) => {})
          .catch((err) => {})
      })
      .catch((err) => {
        alertState.error('failed to fetch plugins')
      })

    pluginAPI
      .getPlusToken()
      .then((token) => {
        setActiveToken(token)
      })
      .catch((err) => {
        alertState.error('failed to check plus settings')
      })
  }

  useEffect(() => {
    refreshList()
  }, [])

  const refModal = useRef(null)

  const notifyChange = (type) => {
    refModal.current()
    refreshList()
  }

  const deleteListItem = (row) => {
    pluginAPI
      .remove(row)
      .then((res) => {
        refreshList()
      })
      .catch((err) => {})
  }

  const handleToken = (value) => {
    setToken(value)
    setUpdated(true)
  }

  const handleTokenSubmit = () => {
    //navigate('/admin/plugins')
    if (updated) {
      setUpdated(false)
      pluginAPI
        .setPlusToken(token)
        .then((res) => {
          alertState.success('PLUS enabled')
          refreshList()
        })
        .catch((err) => {
          alertState.error('Failed to install PLUS token: ' + err.message)
        })
    }
  }

  const verifyToken = () => {
    setIsLoading(true)
    pluginAPI
      .validPlusToken()
      .then((res) => {
        setIsLoading(false)
        alertState.success('Token login ok')
      })
      .catch((err) => {
        setIsLoading(false)
        alertState.error('failed to login using token')
      })
  }

  return (
    <ScrollView sx={{ '@md': { h: '92vh' } }}>
      <ListHeader title="Plugins" description="">
        <HStack space="sm">
          <Button
            size="sm"
            action="secondary"
            onPress={() => navigate('/admin/custom_plugin/:name')}
          >
            <ButtonText>Add Plugin from URL</ButtonText>
            <ButtonIcon as={AddIcon} ml="$2" />
          </Button>
          <ModalForm
            title="Add a new Plugin"
            triggerText="New Plugin"
            modalRef={refModal}
          >
            <AddPlugin notifyChange={notifyChange} />
          </ModalForm>
        </HStack>
      </ListHeader>

      {activeToken !== '' ? (
        <>
          <ListHeader title="PLUS Plugins" />
          <PluginList
            list={plusList}
            deleteListItem={deleteListItem}
            notifyChange={refreshList}
          />
        </>
      ) : null}
      <ListHeader
        title={activeToken == '' ? 'Enable PLUS' : 'Reset PLUS Token'}
      >
        <HStack space="md" alignItems="center">
          <InfoIcon color="$muted500" />
          <Link isExternal href="https://www.supernetworks.org/plus.html">
            <LinkText>Learn about PLUS Mode</LinkText>
          </Link>
        </HStack>
      </ListHeader>

      <VStack
        space="md"
        p="$4"
        mb="$4"
        bg="$backgroundCardLight"
        sx={{
          '@md': { flexDirection: 'row' },
          _dark: {
            bg: '$backgroundCardDark'
          }
        }}
      >
        <Input
          sx={{
            '@md': { width: 440 }
          }}
        >
          <InputField
            onChangeText={(value) => handleToken(value)}
            onSubmitEditing={handleTokenSubmit}
            onMouseLeave={handleTokenSubmit}
            type="text"
            variant="underlined"
            placeholder={activeToken || 'Token'}
            onChangeText={handleToken}
            onSubmitEditing={handleTokenSubmit}
            onMouseLeave={handleTokenSubmit}
          />
        </Input>
        <Button onPress={handleTokenSubmit} isDisabled={!token?.length}>
          <ButtonIcon as={CheckIcon} mr="$2" />

          <ButtonText>Update token</ButtonText>
        </Button>
        {activeToken?.length ? (
          <Button action="secondary" onPress={verifyToken}>
            {isLoading ? (
              <ButtonSpinner mr="$2" />
            ) : (
              <ButtonIcon as={CheckIcon} mr="$2" />
            )}
            <ButtonText>Verify token</ButtonText>
          </Button>
        ) : null}
      </VStack>

      <PluginList
        list={list}
        deleteListItem={deleteListItem}
        notifyChange={refreshList}
      />


    </ScrollView>
  )
}

export default Plugins
