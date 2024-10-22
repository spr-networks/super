import React, { useContext, useEffect, useState } from 'react'
import DNSBlocklist from 'components/DNS/DNSBlocklist'
import DNSAddBlocklist from 'components/DNS/DNSAddBlocklist'
import DNSBlocklistSettings from 'components/DNS/DNSBlocklistSettings'

import ModalForm from 'components/ModalForm'
import TabView from 'components/TabView'
import { AlertContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'
import PluginDisabled from 'views/PluginDisabled'

import { View, Fab, FabIcon, FabLabel, AddIcon } from '@gluestack-ui/themed'

import DNSOverride from 'views/DNS/DNSOverride'

import { BanIcon, Settings2Icon, ShuffleIcon } from 'lucide-react-native'

const DNSBlockListTabs = (props) => {
  const context = useContext(AlertContext)
  const [enabled, setEnabled] = useState(true)
  const [config, setConfig] = useState({})
  const [PermitDomains, setPermitDomains] = useState([])
  const [BlockDomains, setBlockDomains] = useState([])

  const refreshConfig = async () => {
    try {
      let config = await blockAPI.config()

      setConfig({ ...config })
      setBlockDomains(config.BlockDomains)
      setPermitDomains(config.PermitDomains)
    } catch (error) {
      if ([404, 502].includes(error.message)) {
        setEnabled(false)
      } else {
        context.error('API Failure: ' + error.message)
      }
    }
  }

  useEffect(() => {
    refreshConfig()
  }, [])

  let refModalSettings = React.createRef()
  let refModalAdd = React.createRef()

  const notifyChange = (type) => {
    if (type == 'config') {
      refreshConfig()
      return
    } else if (type == 'add') {
      refModalAdd.current()
    } else if (type == 'settings') {
      refModalSettings.current()
    }
    refreshConfig()
  }

  if (!enabled) {
    return <PluginDisabled plugin="dns" />
  }

  return (
    <View h="$full">
      <DNSBlocklist
        config={config}
        renderHeader={() => (
          <ModalForm
            title="Add DNS Blocklist"
            triggerText="Add List"
            triggerProps={{
              sx: { '@base': { display: 'none' }, '@md': { display: 'flex' } }
            }}
            modalRef={refModalAdd}
          >
            <DNSAddBlocklist notifyChange={() => notifyChange('add')} />
          </ModalForm>
        )}
      />

      <ModalForm title="DNS Blocklist Settings" modalRef={refModalSettings}>
        <DNSBlocklistSettings notifyChange={() => notifyChange('settings')} />
      </ModalForm>

      <Fab
        renderInPortal={false}
        shadow={1}
        size="sm"
        onPress={() => refModalAdd.current()}
        bg="$primary600"
      >
        <FabIcon as={AddIcon} mr="$1" />
        <FabLabel>Add</FabLabel>
      </Fab>
      <Fab
        renderInPortal={false}
        shadow={1}
        size="sm"
        onPress={() => refModalSettings.current()}
        bg="$primary600"
        mr="$20"
      >
        <FabIcon as={Settings2Icon} mr="$1" />
        <FabLabel>Settings</FabLabel>
      </Fab>
    </View>
  )
}

const DNSBlockTabs = (props) => {
  return (
    <TabView
      tabs={[
        {
          title: 'DNS Blocklists',
          component: DNSBlockListTabs,
          icon: BanIcon
        },
        { title: 'Overrides', component: DNSOverride, icon: ShuffleIcon }
      ]}
    />
  )
}

//

export default DNSBlockTabs
