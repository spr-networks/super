import React, { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Box, Button, Icon, Modal } from 'native-base'
import { FontAwesomeIcon } from 'FontAwesomeUtils'
import { faPlus } from '@fortawesome/free-solid-svg-icons'

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

  return (
    <>
      {props.triggerText ? (
        <Box>
          <Button
            size="sm"
            variant="outline"
            colorScheme="primary"
            rounded="full"
            borderColor="info.400"
            leftIcon={
              <Icon as={FontAwesomeIcon} icon={props.triggerIcon || faPlus} />
            }
            onPress={toggleModal}
          >
            {props.triggerText || 'Open Modal'}
          </Button>
        </Box>
      ) : null}

      {show ? (
        <Modal isOpen={show} onClose={toggleModal} animationPreset="slide">
          <Modal.Content maxWidth="440px">
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
  triggerText: PropTypes.string,
  modalRef: PropTypes.any
}

export default ModalForm
