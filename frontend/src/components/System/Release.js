import React, { useContext, useEffect, useRef, useState } from 'react'
import { Icon } from 'FontAwesomeUtils'
import {
  faWrench,
  faRefresh,
  faArrowUp
} from '@fortawesome/free-solid-svg-icons'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  FormControl,
  Heading,
  HStack,
  Stack,
  Text,
  Tooltip,
  useBreakpointValue,
  useColorModeValue
} from 'native-base'

import { api } from 'api'
import { AlertContext } from 'AppContext'
import ModalForm from 'components/ModalForm'
import InputSelect from 'components/InputSelect'

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

    api.get('/releasesAvailable?container=super_base').then((versions) => {
      versions.reverse()
      let updatedVersions = versions.filter((v) => v.match(/^\d+.\d+.\d+$/))
      updatedVersions.unshift('latest')
      setVersions(updatedVersions)
    })

    api.get('/releaseChannels').then((channels) => {
      let newChannels = []
      for (let channel of channels) {
        newChannels.push(channel)
      }
      setChannels(newChannels)
    })
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
    <Stack space={4}>
      <HStack space={4}>
        <FormControl flex={2}>
          <FormControl.Label>Custom Version</FormControl.Label>
          <InputSelect
            options={versions.map((value) => {
              return {
                label: value,
                value
              }
            })}
            value={releaseInfo.CustomVersion}
            onChange={handleChangeVersion}
            isDisabled
          />

          <FormControl.Label>Custom Channel</FormControl.Label>
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

      {verifyMessage && verifyMessage.length ? (
        <HStack space={4}>
          <FormControl flex={2}>
            <Checkbox
              accessibilityLabel="Verified"
              colorScheme="green"
              value={verified}
              isChecked={verified}
              onChange={(enabled) => setVerified(!verified)}
            >
              I know what I'm doing
            </Checkbox>

            <FormControl.HelperText>{verifyMessage}</FormControl.HelperText>
          </FormControl>
        </HStack>
      ) : null}

      <Button colorScheme="primary" size="md" onPress={handleSubmit}>
        Save
      </Button>
      <Button colorScheme="secondary" size="md" onPress={handleReset}>
        Reset to defaults
      </Button>
    </Stack>
  )
}

const ReleaseInfo = ({ showModal, ...props }) => {
  const context = useContext(AlertContext)
  const [releaseInfo, setReleaseInfo] = useState(null)

  const updateRelease = () => {
    api
      .get('/release')
      .then((releaseInfo) => {
        setReleaseInfo(releaseInfo)
      })
      .catch((err) => context.error(err))
  }

  useEffect(() => {
    updateRelease()
  }, [])

  const checkUpdate = () => {
    let current = releaseInfo.Current

    api.get('/releasesAvailable?container=super_base').then((versions) => {
      versions.reverse() // sort by latest first

      let latest = versions[0]
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
        space={4}
        p={4}
        bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
        borderBottomColor="borderColorCardLight"
        _dark={{ borderBottomColor: 'borderColorCardDark' }}
        alignItems="center"
        borderBottomWidth={1}
        justifyContent="flex-start"
      >
        <Text>{label}</Text>
        <Box textAlign="justify">
          <Text color="muted.500">{value}</Text>
        </Box>
      </HStack>
    )
  }

  const refModal = useRef(null)

  const onReset = (info) => {
    api
      .delete('/release')
      .then((result) => {
        refModal.current()

        context.success(`Reset release settings`)
      })
      .catch((err) => {
        context.error(err)
      })
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
      .put('/release', info)
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
      <Stack
        p={4}
        direction={{ base: 'column', md: 'row' }}
        space={{ base: 4, md: 0 }}
        alignItems={{ base: 'flex-start', md: 'center' }}
        justifyContent="space-between"
      >
        <Heading fontSize="md">SPR Release</Heading>
        <Stack
          direction={{ base: 'row', md: 'row' }}
          space={{ base: 2, md: 0 }}
        >
          <Tooltip label={'Check for new updates'}>
            <Button
              size="sm"
              variant="ghost"
              colorScheme="blueGray"
              leftIcon={<Icon icon={faRefresh} />}
              onPress={checkUpdate}
            >
              Check
            </Button>
          </Tooltip>
          <Tooltip label={'Run update'}>
            <Button
              size="sm"
              variant="ghost"
              colorScheme="blueGray"
              leftIcon={<Icon icon={faArrowUp} />}
              onPress={runUpdate}
            >
              Update
            </Button>
          </Tooltip>
          <Tooltip label={'Set Custom Version'}>
            <Button
              size="sm"
              variant="ghost"
              colorScheme="blueGray"
              leftIcon={<Icon icon={faWrench} />}
              onPress={() => refModal.current()}
            >
              Set Custom Version
            </Button>
          </Tooltip>
          <ModalForm title="Set Release Version" modalRef={refModal}>
            <UpdateReleaseInfo
              releaseInfo={releaseInfo}
              onSubmit={onSubmit}
              onReset={onReset}
              onUpdate={updateRelease}
            />
          </ModalForm>
        </Stack>
      </Stack>
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
