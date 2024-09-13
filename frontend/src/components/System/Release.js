import React, { useContext, useEffect, useRef, useState } from 'react'

import {
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  FormControlHelper,
  FormControlHelperText,
  HStack,
  Text,
  VStack,
  ArrowUpIcon,
  SettingsIcon,
  ButtonGroup,
  Checkbox,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  CheckIcon,
  ButtonSpinner
} from '@gluestack-ui/themed'

import { api } from 'api'
import { AlertContext } from 'AppContext'
import ModalForm from 'components/ModalForm'
import InputSelect from 'components/InputSelect'
import { RefreshCcwIcon } from 'lucide-react-native'
import { ListHeader } from 'components/List'

const prettyChannel = (channelStr) => {
  if (channelStr == '') {
    return 'main'
  }
  return channelStr.replace(/-/g, '')
}

const UpdateReleaseInfo = ({
  releaseInfo,
  onSubmit,
  onReset,
  onUpdate,
  ...props
}) => {
  const [versions, setVersions] = useState([])
  const [channels, setChannels] = useState([])
  const [CustomChannel, setCustomChannel] = useState('')
  const [CustomVersion, setCustomVersion] = useState('')
  const [verifyMessage, setShowVerifyMessage] = useState('')
  const [verified, setVerified] = useState(false)

  // fetch available releases and channels onLoad
  useEffect(() => {
    if (releaseInfo.CustomVersion != '') {
      setCustomVersion(releaseInfo.CustomVersion)
    }

    if (releaseInfo.CustomChannel != '') {
      setCustomChannel(releaseInfo.CustomChannel)
    }

    api
      .get('/releasesAvailable?container=super_base')
      .then((versions) => {
        versions?.reverse()
        let updatedVersions = versions?.filter((v) => v.match(/^\d+.\d+.\d+$/))
        updatedVersions?.unshift('latest')
        setVersions(updatedVersions)
      })
      .catch((err) => {})

    api
      .get('/releaseChannels')
      .then((channels) => {
        let newChannels = []
        for (let channel of channels) {
          newChannels.push(channel)
        }
        setChannels(newChannels)
      })
      .catch((err) => {})
  }, [])

  const checkVersionChange = (currentVersion, newVersion) => {
    let latest = versions[1]

    if (currentVersion.includes('-')) {
      currentVersion = currentVersion.split('-')[0]
    }

    // if, latest-dev tag - get the latest version
    if (currentVersion.startsWith('latest')) {
      currentVersion = latest
    }

    if (newVersion.startsWith('latest')) {
      newVersion = latest
    }

    let [newMajor, newMinor, newPatch] = newVersion.split('.')
    let [currentMajor, currentMinor, currentPatch] = currentVersion.split('.')

    // downgrade
    if (newMajor < currentMajor || newMinor < currentMinor) {
      return `Downgrading between major and minor versions is not supported, tread lightly & backup your configs`
    }

    // upgrade
    if (newMajor > currentMajor || newMinor > currentMinor) {
      return null
      //return 'Upgrade might have breaking changes, be sure you have read the changelog before you proceed'
    }

    /*if (newPatch < currentPatch) {
      return `YU downgraed?!`
    }*/

    return null
  }

  const handleChangeVersion = (value) => {
    let notify = checkVersionChange(releaseInfo.Current, value)
    setShowVerifyMessage(notify)

    setCustomVersion(value)
  }

  const handleChangeChannel = (value) => {
    setCustomChannel(value)
  }

  const handleSubmit = () => {
    //dont close if not verified upgrade might have breaking changes
    if (verifyMessage && verifyMessage.length && !verified) {
      return false
    }

    onSubmit({
      CustomVersion,
      CustomChannel
    })

    onUpdate()
  }

  const handleReset = () => {
    onReset()
    onUpdate()
  }

  return (
    <VStack space="md">
      <HStack space="md">
        <FormControl flex={2}>
          <FormControlLabel>
            <FormControlLabelText>Custom Version</FormControlLabelText>
          </FormControlLabel>
          <InputSelect
            options={versions?.map((value) => {
              return {
                label: value,
                value
              }
            })}
            value={releaseInfo.CustomVersion}
            onChange={handleChangeVersion}
            isDisabled
          />

          <FormControlLabel>
            <FormControlLabelText>Custom Channel</FormControlLabelText>
          </FormControlLabel>
          <InputSelect
            options={channels.map((value) => {
              return {
                label: prettyChannel(value),
                value
              }
            })}
            value={releaseInfo.CustomChannel}
            onChange={handleChangeChannel}
            isDisabled
          />
        </FormControl>
      </HStack>

      {verifyMessage?.length ? (
        <HStack space={4}>
          <FormControl flex={2}>
            <Checkbox
              size="md"
              value={verified}
              isChecked={verified}
              onChange={(enabled) => setVerified(!verified)}
            >
              <CheckboxIndicator mr="$2">
                <CheckboxIcon as={CheckIcon} />
              </CheckboxIndicator>
              <CheckboxLabel>I know what I'm doing</CheckboxLabel>
            </Checkbox>

            <FormControlHelper>
              <FormControlHelperText>{verifyMessage}</FormControlHelperText>
            </FormControlHelper>
          </FormControl>
        </HStack>
      ) : null}

      <Button action="primary" size="md" onPress={handleSubmit}>
        <ButtonText>Save</ButtonText>
      </Button>
      <Button action="secondary" size="md" onPress={handleReset}>
        <ButtonText>Reset to defaults</ButtonText>
      </Button>
    </VStack>
  )
}

const ReleaseInfo = ({ showModal, ...props }) => {
  const context = useContext(AlertContext)
  const [releaseInfo, setReleaseInfo] = useState(null)
  const [waitFor, setWaitFor] = useState(null)
  const [checkUpdates, setCheckUpdates] = useState(false)

  const updateRelease = () => {
    api
      .get('/release')
      .then((releaseInfo) => {
        setReleaseInfo(releaseInfo)

        api
          .getCheckUpdates()
          .then((state) => {
            setCheckUpdates(state)
          })
          .catch((err) => {})
      })
      .catch((err) => context.error(err))
  }

  useEffect(() => {
    updateRelease()
  }, [])

  const checkUpdate = (arg) => {
    let current
    if (!releaseInfo) {
      if (!arg) {
        return
      }
      current = arg.Current
    } else {
      current = releaseInfo.Current
    }

    setWaitFor('check')

    api
      .get('/releasesAvailable?container=super_base')
      .then((versions) => {
        versions?.reverse() // sort by latest first

        let latest = versions.find((v) => !v.includes('-dev'))
        let latestDev = versions.find((v) => v.includes('-dev'))

        // if latest get version
        if (current.startsWith('latest')) {
          current = current.includes('-dev') ? latestDev : latest
        }

        if (current.includes('-dev') && current != latestDev) {
          context.info(`Latest dev version is ${latestDev}, current ${current}`)
        } else if (current != latest) {
          context.info(`Latest version is ${latest}, current ${current}`)
        } else {
          context.success(`${current} is the latest version of spr`)
        }
      })
      .catch((err) => {})
      .finally(() => {
        setWaitFor(null)
      })
  }

  const runUpdate = () => {
    context.info(`Update started`)

    api
      .put('/update')
      .then(() => {
        //happens if already on the latest version, will return 200
        context.success('Update complete')
      })
      .catch((err) => {
        //otherwise times out.
        //poll for the API coming back up
        let interval = setInterval(() => {
          api
            .get('/release')
            .then(() => {
              clearInterval(interval)
              context.success('Update complete')
              updateRelease()
            })
            .catch(() => {
              context.info(`Waiting for update`)
            })
        }, 1000)
      })
  }

  const renderReleaseInfoRow = (label, value) => {
    //normalize current-version and channel to hold LHS or RHS of -
    if (label == 'Channel') {
      value = prettyChannel(value)
    } else if (label == 'Custom Version') {
      let parts = value.split('-')
      if (parts.length == 2) {
        value = parts[0]
      }
    }

    return (
      <HStack
        space="md"
        p="$4"
        bg="$backgroundCardLight"
        borderBottomColor="$borderColorCardLight"
        sx={{
          _dark: {
            bg: '$backgroundCardDark',
            borderBottomColor: '$borderColorCardDark'
          }
        }}
        borderBottomWidth={1}
        alignItems="center"
        justifyContent="flex-start"
      >
        <Text size="sm">{label}</Text>
        <Box textAlign="justify">
          <Text color="$muted500">{value}</Text>
        </Box>
      </HStack>
    )
  }

  const refModal = useRef(null)

  const onReset = (info) => {
    api
      .delete('/releaseSet')
      .then((result) => {
        refModal.current()

        context.success(`Reset release settings`)
      })
      .catch((err) => {
        context.error(err)
      })
  }

  const toggleCheckUpdates = () => {
    let newState = !checkUpdates
    setCheckUpdates(newState)

    //store into API
    if (newState) {
      api
        .setCheckUpdates()
        .then((result) => {
          context.success(`Enabled Automatically Checking for Updates `)
        })
        .catch((err) => {})
    } else {
      api
        .clearCheckUpdates()
        .then((result) => {
          context.success(`Disabled Automatically Checking for Updates`)
        })
        .catch((err) => {})
    }
  }

  const onSubmit = (info) => {
    if (
      info.CustomChannel != 'main' &&
      info.CustomChannel != '' &&
      info.CustomChannel[0] != '-'
    ) {
      info.CustomChannel = '-' + info.CustomChannel

      //set to latest if version is not set yet
      if (info.CustomVersion == '') {
        info.CustomVersion = 'latest'
      }
    }

    api
      .put('/releaseSet', info)
      .then((result) => {
        //TODO call /update
        /*api.put('/update').then(() => {
          //note: will not reach this
        }).catch(err => context.error(err))
        */

        //close modal
        refModal.current()

        // TODO trigger download in background and notify user when ready
        context.success(`Release settings updated`)
      })
      .catch((err) => {
        context.error(err)
      })
  }

  return (
    <Box {...props}>
      <ListHeader title="SPR Release">
        <ButtonGroup
          space="md"
          flexDirection="column"
          sx={{
            '@base': { flexDirection: 'column', gap: '$3' },
            '@md': { flexDirection: 'row', gap: '$3', alignItems: 'center' }
          }}
        >
          <Checkbox
            size="md"
            value={checkUpdates}
            isChecked={checkUpdates}
            onChange={(enabled) => toggleCheckUpdates()}
          >
            <CheckboxIndicator mr="$2">
              <CheckboxIcon as={CheckIcon} />
            </CheckboxIndicator>
            <CheckboxLabel size="sm">Auto-Check for Updates</CheckboxLabel>
          </Checkbox>

          <Button size="sm" onPress={checkUpdate}>
            <ButtonText>Check</ButtonText>
            <ButtonSpinner
              ml="$1"
              display={waitFor == 'check' ? 'flex' : 'none'}
            />
            <ButtonIcon
              as={RefreshCcwIcon}
              ml="$1"
              display={waitFor == 'check' ? 'none' : 'flex'}
            />
          </Button>

          <Button size="sm" onPress={runUpdate}>
            <ButtonText>Update</ButtonText>
            <ButtonIcon as={ArrowUpIcon} ml="$1" />
          </Button>

          <Button
            action="secondary"
            size="sm"
            onPress={() => refModal.current()}
          >
            <ButtonText>Set Version</ButtonText>
            <ButtonIcon as={SettingsIcon} ml="$1" />
          </Button>
        </ButtonGroup>
        <ModalForm title="Set Release Version" modalRef={refModal}>
          <UpdateReleaseInfo
            releaseInfo={releaseInfo}
            onSubmit={onSubmit}
            onReset={onReset}
            onUpdate={updateRelease}
          />
        </ModalForm>
      </ListHeader>

      {releaseInfo ? (
        <>
          {renderReleaseInfoRow('Current Version', releaseInfo.Current)}
          {renderReleaseInfoRow('Custom Version', releaseInfo.CustomVersion)}
          {renderReleaseInfoRow(
            'Custom Channel',
            releaseInfo.CustomVersion != ''
              ? prettyChannel(releaseInfo.CustomChannel)
              : ''
          )}
        </>
      ) : null}
    </Box>
  )
}

export default ReleaseInfo
