import React from 'react'
import PropTypes from 'prop-types'

import {
  Button,
  ButtonText,
  ButtonIcon,
  HStack,
  ArrowLeftIcon,
  ArrowRightIcon
} from '@gluestack-ui/themed'

const Pagination = ({
  page,
  perPage,
  total,
  onChange,
  onPrevPage,
  onNextPage,
  ...props
}) => {
  return (
    <HStack space="md" alignItems="flex-start">
      <Button
        flex={1}
        variant="link"
        isDisabled={page <= 1}
        onPress={() => onChange(1)}
      >
        <ButtonIcon as={ArrowLeftIcon} mr="$1" />
        <ButtonText>Start</ButtonText>
      </Button>
      <Button
        flex={1}
        variant="link"
        isDisabled={page >= Math.ceil(total / perPage)}
        onPress={() => onChange(page + 1)}
      >
        <ButtonText>Next</ButtonText>
        <ButtonIcon as={ArrowRightIcon} ml="$1" />
      </Button>
    </HStack>
  )
}

Pagination.propTypes = {
  page: PropTypes.number.isRequired,
  pages: PropTypes.number.isRequired,
  perPage: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired
}

export default Pagination
