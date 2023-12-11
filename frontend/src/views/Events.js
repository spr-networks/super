import React, { useState, useRef } from 'react'

import {
  View,
  Heading,
  Icon,
  Input,
  InputField,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContent,
  ModalCloseButton,
  ModalHeader,
  CloseIcon
} from '@gluestack-ui/themed'

import LogListDb from 'components/Logs/LogListDb'
import Database from 'views/System/Database'

const Events = (props) => {
  const [showModal, setShowModal] = useState(false)

  const [modalTitle, setModalTitle] = useState('Container')
  const [modalBody, setModalBody] = useState('')

  const onShowModal = (title, content) => {
    setModalTitle(title)
    setModalBody(content)
    setShowModal(true)

    return onClose
  }

  const onClose = () => {
    setShowModal(false)
  }

  return (
    <View>
      <LogListDb />
      {/*
      <Database showModal={onShowModal} closeModal={onClose} />

      <Modal isOpen={showModal} onClose={onClose}>
        <ModalBackdrop />
        <ModalContent>
          <ModalHeader>
            <Heading size="sm">{modalTitle}</Heading>
            <ModalCloseButton>
              <Icon as={CloseIcon} />
            </ModalCloseButton>
          </ModalHeader>
          <ModalBody>{modalBody}</ModalBody>
        </ModalContent>
      </Modal>
      */}
    </View>
  )
}

export default Events
