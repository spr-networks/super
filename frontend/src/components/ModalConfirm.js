import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { Button, FormControl, Icon, Input, Modal } from 'native-base'

const ModalConfirm = (props) => {
  const [value, setValue] = useState('')
  const [isOpen, setIsOpen] = useState(props.isOpen || false)

  const { trigger, type, handleSubmit } = props
  const triggerRef = useRef(null)

  useEffect(() => {
    setIsOpen(props.isOpen ? true : false)

    return () => {
      setIsOpen(false)
    }
  }, [props.isOpen])

  const handlePress = () => {
    handleSubmit(value)
    setIsOpen(false)
    setValue('')
  }

  const handleOpen = () => setIsOpen(true)

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

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        animationPreset="slide"
      >
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
                variant="outline"
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
  handleSubmit: PropTypes.func.isRequired
}

export default ModalConfirm
