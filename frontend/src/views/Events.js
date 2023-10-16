import React, { useContext, useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Modal, useDisclose } from 'native-base' //TODONB

import { View } from '@gluestack-ui/themed'

import LogListDb from 'components/Logs/LogListDb'
import Database from 'views/System/Database'

const Events = (props) => {
  const { isOpen, onOpen, onClose } = useDisclose()

  const [modalTitle, setModalTitle] = useState('Container')
  const [modalBody, setModalBody] = useState('')
  const refModal = useRef(null)

  const showModal = (title, content) => {
    setModalTitle(title)
    setModalBody(content)
    onOpen()

    return onClose
  }

  return (
    <View>
      <LogListDb />
      <Database showModal={showModal} closeModal={onClose} />
      <Modal
        ref={refModal}
        isOpen={isOpen}
        onClose={onClose}
        animationPreset="slide"
      >
        <Modal.Content maxWidth={{ base: '100%', md: '90%' }}>
          <Modal.CloseButton />
          <Modal.Header>{modalTitle}</Modal.Header>
          <Modal.Body>{modalBody}</Modal.Body>
          {/*<Modal.Footer />*/}
        </Modal.Content>
      </Modal>
    </View>
  )
}

export default Events
