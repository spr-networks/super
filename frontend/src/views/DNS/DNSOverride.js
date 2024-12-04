import React, { useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import DNSOverrideList from 'components/DNS/DNSOverrideList'
import DNSImportOverride from 'components/DNS/DNSImportOverride'
import { AlertContext } from 'layouts/Admin'
import { blockAPI } from 'api/DNS'
import PluginDisabled from 'views/PluginDisabled'
import InputSelect from 'components/InputSelect'
import { Select } from 'components/Select'
import { TagItem } from 'components/TagItem'
import { TagMenu } from 'components/TagMenu'

import {
  Box,
  Switch,
  Badge,
  BadgeText,
  TrashIcon,
  Button,
  ButtonIcon,
  ButtonText,
  CloseIcon,
  ScrollView,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  HStack,
  Fab,
  FabIcon,
  FabLabel,
  Heading,
  AddIcon,
  Text,
  View,
  VStack
} from '@gluestack-ui/themed'

import ModalForm from 'components/ModalForm'
import DNSAddOverride from 'components/DNS/DNSAddOverride'
import { ListHeader } from 'components/List'

const DNSBlock = (props) => {
  const context = useContext(AlertContext)
  const [enabled, setEnabled] = useState(true)
  const [PermitDomains, setPermitDomains] = useState([])
  const [BlockDomains, setBlockDomains] = useState([])

  const [OverrideLists, setOverrideLists] = useState([])
  const [listOptions, setListOptions] = useState([])
  const [curList, setCurList] = useState({ Tags: [] })

  const refreshConfig = async () => {
    try {
      let config = await blockAPI.config()

      if (config.OverrideLists?.length) {
        setOverrideLists(config.OverrideLists)
        setListOptions(
          config.OverrideLists?.map((e) => ({ label: e.Name, value: e.Name }))
        )

        for (let entry of config.OverrideLists) {
          if (entry.Name == (curList.Name || 'Default')) {
            setPermitDomains(entry.PermitDomains)
            setBlockDomains(entry.BlockDomains)
            setCurList(entry)
            break
          }
        }
      }
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
  let refModalImportList = React.createRef()

  const notifyChange = async (type) => {
    if (type == 'config') {
      await refreshConfig()
      return
    } else if (type == 'block') {
      refModalAddBlock.current()
    } else if (type == 'permit') {
      refModalAddPermit.current()
    } else if (type == 'listimport') {
      refModalImportList.current()
    } else if (type == 'deletelist') {
      onChangeList('Default')
      await refreshConfig()
      return
    }
    refreshConfig()
  }

  const deleteListItem = async (listName, item) => {
    blockAPI
      .deleteOverride(listName, item)
      .then((res) => {
        notifyChange('config')
      })
      .catch((error) => {
        context.error('API Failure: ' + error.message)
      })
  }

  if (!enabled) {
    return <PluginDisabled plugin="dns" />
  }

  const onChangeList = (v) => {
    for (let entry of OverrideLists) {
      if (entry.Name == v) {
        setPermitDomains(entry.PermitDomains)
        setBlockDomains(entry.BlockDomains)
        setCurList(entry)
        return
      }
    }
    //failed to find, clear
    setBlockDomains([])
    setPermitDomains([])
  }

  const onChangeText = (v) => {
    for (let entry of OverrideLists) {
      if (entry.Name == v) {
        setPermitDomains(entry.PermitDomains)
        setBlockDomains(entry.BlockDomains)
        setCurList(entry)
        return
      }
    }

    setCurList({ Name: v, Tags: [], Enabled: true })
    //failed to find, clear
    setBlockDomains([])
    setPermitDomains([])
  }

  const handleTags = (tags) => {
    let newTags = [
      ...new Set(tags.filter((x) => typeof x == 'string' && x.length > 0))
    ]

    newTags = newTags.map((tag) => tag.toLowerCase())
    curList.Tags = newTags

    blockAPI
      .putOverrideList(curList.Name, curList)
      .then((res) => {
        notifyChange('config')
      })
      .catch((error) => {
        context.error('API Failure: ' + error.message)
      })
  }

  let defaultTags = []

  let title = 'Override List'
  if (curList.Name !== '') {
    title = `Override List: ${curList.Name}`
  }

  return (
    <View h="$full">
      <ScrollView h="$full">
        <VStack space="sm" pb="$16">
          <ListHeader title={title}>
            <ModalForm
              title="Import Override List"
              triggerText="Import List"
              triggerProps={{
                sx: {
                  '@base': { display: 'none' },
                  '@md': { display: 'flex' }
                }
              }}
              modalRef={refModalImportList}
            >
              <DNSImportOverride
                listName={curList.Name}
                notifyChange={notifyChange}
              />
            </ModalForm>
          </ListHeader>
          <VStack space="md" sx={{ '@md': { flexDirection: 'row' } }} px="$4">
            <Select selectedValue={curList.Name} onValueChange={onChangeList}>
              {listOptions.map((opt) => (
                <Select.Item key={opt} label={opt.label} value={opt.value} />
              ))}
            </Select>

            <HStack space="md" alignItems="center">
              {curList.Name !== '' && curList.Name !== 'Default' && (
                <>
                  <Switch
                    size="sm"
                    value={curList.Enabled}
                    onValueChange={(checked) => {
                      const updatedList = { ...curList, Enabled: checked }
                      blockAPI
                        .putOverrideList(curList.Name, updatedList)
                        .then(() => notifyChange('config'))
                        .catch((error) =>
                          context.error('API Failure: ' + error.message)
                        )
                    }}
                  />
                  <Badge
                    variant={curList.Enabled ? 'solid' : 'outline'}
                    action={curList.Enabled ? 'success' : 'muted'}
                  >
                    <BadgeText>
                      {curList.Enabled ? 'Enabled' : 'Disabled'}
                    </BadgeText>
                  </Badge>

                  <Button
                    variant="outline"
                    action="negative"
                    size="xs"
                    onPress={async () => {
                      try {
                        await blockAPI.deleteOverrideList(curList.Name, curList)
                        notifyChange('deletelist')
                      } catch (e) {
                        notifyChange('deletelist')
                      }
                    }}
                  >
                    <ButtonIcon as={TrashIcon} />
                    <ButtonText ml="$2">Delete List</ButtonText>
                  </Button>
                </>
              )}
            </HStack>
          </VStack>
          <VStack space="md" sx={{ '@md': { flexDirection: 'row' } }} px="$4">
            {curList.Name !== '' && curList.Name !== 'Default' && (
              <FormControl>
                <FormControlLabel>
                  <FormControlLabelText>Tags</FormControlLabelText>
                </FormControlLabel>

                <HStack flexWrap="wrap" w="$full" space="md">
                  <HStack
                    space="md"
                    flexWrap="wrap"
                    alignItems="center"
                    display={curList.Tags?.length ? 'flex' : 'none'}
                  >
                    {curList.Tags.map((tag) => (
                      <TagItem key={tag} name={tag} size="sm" />
                    ))}
                  </HStack>
                  <TagMenu
                    items={[...new Set(defaultTags.concat(curList.Tags))]}
                    selectedKeys={curList.Tags}
                    onSelectionChange={handleTags}
                  />
                </HStack>
              </FormControl>
            )}
          </VStack>

          <DNSOverrideList
            list={BlockDomains}
            listName={curList.Name}
            title="Block Domain"
            notifyChange={notifyChange}
            deleteListItem={deleteListItem}
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
                <DNSAddOverride
                  listName={curList.Name}
                  type={'block'}
                  notifyChange={notifyChange}
                />
              </ModalForm>
            )}
          />

          <DNSOverrideList
            key="allowdomain"
            list={PermitDomains}
            listName={curList.Name}
            title="Permit Domain"
            notifyChange={notifyChange}
            deleteListItem={deleteListItem}
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
                <DNSAddOverride
                  listName={curList.Name}
                  type={'permit'}
                  notifyChange={notifyChange}
                />
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
      <Fab
        renderInPortal={false}
        shadow={1}
        size="sm"
        onPress={() => refModalImportList.current()}
        bg="$primary600"
        mr="$64"
      >
        <FabIcon as={AddIcon} mr="$1" />
        <FabLabel>Import</FabLabel>
      </Fab>
    </View>
  )
}

export default DNSBlock
