import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { Button, FormControl, Icon, Input, Modal } from 'native-base'

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
    variant: 'outline',
    colorScheme: 'primary',
    borderColor: 'info.400',
    rounded: 'full',
    leftIcon: <Icon as={FontAwesomeIcon} icon={faPlus} />
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
        leftIcon={<Icon as={FontAwesomeIcon} icon={faPlus} />}
        onPress={() => setIsOpen(true)}
        {...props}
      >
        {'Add ' + type}
      </Button>
    )*/
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
              <Input
                name={type}
                value={value}
                variant="underlined"
                placeholder={
                  'Enter ' + (type == 'IP' ? 'IP address' : type) + '...'
                }
                autoFocus
                onChangeText={(value) => {
                  setValue(value)
                }}
                onSubmitEditing={handlePress}
              />
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
