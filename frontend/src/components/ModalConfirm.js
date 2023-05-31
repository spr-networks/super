import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Icon, FontAwesomeIcon } from 'FontAwesomeUtils'
import { faCirclePlus, faPlus } from '@fortawesome/free-solid-svg-icons'
import { Button, FormControl, Input, Modal, Select } from 'native-base'
import ClientSelect from 'components/ClientSelect'

const ModalConfirm = (props) => {
  const defaultValue = props.defaultValue || ''

  const [value, setValue] = useState(defaultValue)
  const [isOpen, setIsOpen] = useState(props.isOpen || false)

  const { trigger, type, onSubmit } = props
  const triggerRef = useRef(null)

  const handleOpen = () => setIsOpen(true)
  const handleClose = () => {
    setIsOpen(false)
    setValue(defaultValue)

    if (props.onClose) {
      props.onClose()
    }
  }

  const handlePress = () => {
    onSubmit(value)
    handleClose()
  }

  useEffect(() => {
    setIsOpen(props.isOpen ? true : false)

    return () => {
      setIsOpen(false)
    }
  }, [props.isOpen])

  /*
  useEffect(() => {
    if (props.modalRef) {
      props.modalRef.current = toggleModal
    }

    return () => {
      if (props.modalRef) {
        props.modalRef.current = null
      }
    }
  })*/

  useEffect(() => {
    setValue(defaultValue)

    return () => {
      setValue('')
    }
  }, [props.defaultValue])

  let triggerProps = {
    size: 'sm',
    variant: 'ghost', //'outline',
    colorScheme: 'blueGray',
    //borderColor: 'info.400',
    rounded: 'full',
    leftIcon: <Icon icon={faCirclePlus} />
  }

  const updateTrigger = () => {
    return trigger(
      {
        ...triggerProps,
        ref: triggerRef,
        onPress: handleOpen
      },
      { open: isOpen }
    )
    /*return (
      <Button
        variant="solid"
        colorScheme="primary"
        rounded="full"
        leftIcon={<Icon icon={faPlus} />}
        onPress={() => setIsOpen(true)}
        {...props}
      >
        {'Add ' + type}
      </Button>
    )*/
  }

  const handleChange = (value) => {
    setValue(value)
  }

  const renderItem = () => {
    if (props.options) {
      return (
        <Select
          selectedValue={value}
          onValueChange={handleChange}
          accessibilityLabel={`Choose ${type}`}
        >
          {props.options.map((val) => (
            <Select.Item key={val} label={val} value={val} />
          ))}
        </Select>
      )
    }

    if (type == 'IP') {
      return (
        <ClientSelect
          name="DstIP"
          value={value}
          onChange={handleChange}
          onChangeText={handleChange}
          onSubmitEditing={handlePress}
        />
      )
    }

    return (
      <Input
        name={type}
        value={value}
        variant="underlined"
        placeholder={'Enter ' + (type == 'IP' ? 'IP address' : type) + '...'}
        autoFocus={isOpen ? true : false}
        onChangeText={handleChange}
        onSubmitEditing={handlePress}
      />
    )
  }

  return (
    <>
      {trigger ? updateTrigger() : null}

      <Modal isOpen={isOpen} onClose={handleClose} animationPreset="slide">
        <Modal.Content maxWidth="250px">
          <Modal.CloseButton />
          <Modal.Header>{`Add ${type}`}</Modal.Header>
          <Modal.Body>
            <FormControl>
              {/*<FormControl.Label>
              {type == 'IP' ? 'IP address' : type}
              </FormControl.Label>*/}
              {renderItem()}
            </FormControl>
          </Modal.Body>
          <Modal.Footer>
            <Button w="100%" onPress={handlePress}>
              Save
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal>
    </>
  )
}

ModalConfirm.propTypes = {
  type: PropTypes.string.isRequired,
  defaultValue: PropTypes.any,
  onSubmit: PropTypes.func.isRequired,
  onClose: PropTypes.func
}

export default ModalConfirm
