import React, { useContext, useEffect, useState } from 'react'

import DNSOverrideList from 'components/DNS/DNSOverrideList'
import { AlertContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'
import PluginDisabled from 'views/PluginDisabled'

import {
  ScrollView,
  Fab,
  FabIcon,
  FabLabel,
  AddIcon,
  View,
  VStack
} from '@gluestack-ui/themed'

import ModalForm from 'components/ModalForm'
import DNSAddOverride from 'components/DNS/DNSAddOverride'

const DNSBlock = (props) => {
  const context = useContext(AlertContext)
  const [enabled, setEnabled] = useState(true)
  const [PermitDomains, setPermitDomains] = useState([])
  const [BlockDomains, setBlockDomains] = useState([])

  const refreshConfig = async () => {
    try {
      let config = await blockAPI.config()

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

  let refModalAddBlock = React.createRef()
  let refModalAddPermit = React.createRef()

  const notifyChange = async (type) => {
    if (type == 'config') {
      await refreshConfig()
      return
    } else if (type == 'block') {
      refModalAddBlock.current()
    } else if (type == 'permit') {
      refModalAddPermit.current()
    }
    refreshConfig()
  }

  if (!enabled) {
    return <PluginDisabled plugin="dns" />
  }

  /*let items = [
    {type: "block", title: 'Block Custom Domain', list: BlockDomains, modal: refModalAddBlock}
  ]*/

  return (
    <View h="$full">
      <ScrollView h="$full">
        <VStack space="sm" pb="$16">
          <DNSOverrideList
            list={BlockDomains}
            title="Block Custom Domain"
            notifyChange={notifyChange}
            renderHeader={() => (
              <ModalForm
                title="Add Block for Custom Domain"
                triggerText="Add Block"
                triggerProps={{
                  sx: {
                    '@base': { display: 'none' },
                    '@md': { display: 'flex' }
                  }
                }}
                modalRef={refModalAddBlock}
              >
                <DNSAddOverride type={'block'} notifyChange={notifyChange} />
              </ModalForm>
            )}
          />

          <DNSOverrideList
            key="allowdomain"
            list={PermitDomains}
            title="Permit Domain Override"
            notifyChange={notifyChange}
            renderHeader={() => (
              <ModalForm
                title="Add Permit Domain Override"
                triggerText="Add Permit"
                triggerProps={{
                  sx: {
                    '@base': { display: 'none' },
                    '@md': { display: 'flex' }
                  }
                }}
                modalRef={refModalAddPermit}
              >
                <DNSAddOverride type={'permit'} notifyChange={notifyChange} />
              </ModalForm>
            )}
          />
        </VStack>
      </ScrollView>

      <Fab
        renderInPortal={false}
        shadow={1}
        size="sm"
        onPress={() => refModalAddBlock.current()}
        bg="$primary600"
      >
        <FabIcon as={AddIcon} mr="$1" />
        <FabLabel>Add Block</FabLabel>
      </Fab>
      <Fab
        renderInPortal={false}
        shadow={1}
        size="sm"
        onPress={() => refModalAddPermit.current()}
        bg="$primary600"
        mr="$32"
      >
        <FabIcon as={AddIcon} mr="$1" />
        <FabLabel>Add Permit</FabLabel>
      </Fab>
    </View>
  )
}

export default DNSBlock
