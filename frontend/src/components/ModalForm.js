import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import {
  Button,
  ButtonIcon,
  ButtonText,
  Heading,
  Icon,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContent,
  ModalCloseButton,
  ModalHeader,
  CloseIcon
} from '@gluestack-ui/themed'

import { PlusIcon } from 'lucide-react-native'

const ModalForm = (props) => {
  const [showModal, setShowModal] = useState(false)

  const onClose = () => setShowModal(false)
  const toggleModal = () => setShowModal(!showModal)

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
          <ButtonIcon as={PlusIcon} ml="$1" />
        </Button>
      ) : null}

      {showModal ? (
        <Modal isOpen={showModal} onClose={onClose}>
          <ModalBackdrop />
          <ModalContent>
            <ModalHeader>
              <Heading size="sm">{props.title || 'Title'}</Heading>
              <ModalCloseButton>
                <Icon as={CloseIcon} />
              </ModalCloseButton>
            </ModalHeader>
            <ModalBody pb="$6">{props.children}</ModalBody>
            {/*<ModalFooter />*/}
          </ModalContent>
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
