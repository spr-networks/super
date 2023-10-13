import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Modal } from 'native-base' //TODONB
import { Button, ButtonIcon, ButtonText } from '@gluestack-ui/themed'
import { PlusIcon } from 'lucide-react-native'

const ModalForm = (props) => {
  const [show, setShow] = useState(false)

  const closeModal = () => setShow(false)
  const toggleModal = () => setShow(!show)

  // this allows us to close the modal using a ref to the modal
  useEffect(() => {
    if (props.modalRef) {
      props.modalRef.current = toggleModal
    }

    return () => {
      if (props.modalRef) {
        props.modalRef.current = null
      }
    }
  })

  let triggerProps = {
    size: 'xs',
    variant: 'solid',
    action: 'primary',
    onPress: toggleModal
  }

  if (props.triggerProps) {
    triggerProps = { ...triggerProps, ...props.triggerProps }
  }

  return (
    <>
      {props.triggerText ? (
        <Button {...triggerProps}>
          <ButtonText>{props.triggerText || 'Open Modal'}</ButtonText>
          <ButtonIcon as={PlusIcon} />
        </Button>
      ) : null}

      {show ? (
        <Modal isOpen={show} onClose={toggleModal} animationPreset="slide">
          <Modal.Content
            width={{ base: '100%' }}
            maxW={{ base: '100%', md: '440px' }}
            rounded={{ base: 'none', md: 'md' }}
          >
            <Modal.CloseButton />
            <Modal.Header>{props.title || 'Title'}</Modal.Header>
            <Modal.Body>{props.children}</Modal.Body>
            {/*<Modal.Footer />*/}
          </Modal.Content>
        </Modal>
      ) : null}
    </>
  )
}

ModalForm.propTypes = {
  title: PropTypes.string,
  triggerIcon: PropTypes.object,
  triggerProps: PropTypes.object,
  triggerText: PropTypes.string,
  modalRef: PropTypes.any
}

export default ModalForm
