import React from 'react'

import { Box, Heading, ScrollView, Text, VStack } from '@gluestack-ui/themed'

import TopologyWidget from 'components/Dashboard/TopologyWidget'

const Topology = () => (
  <ScrollView h="$full" sx={{ '@md': { h: '92vh' } }}>
    <VStack p="$4" space="md">
      <Heading size="md">Overview</Heading>
      <TopologyWidget />
      <Box
        bg="$backgroundCardLight"
        sx={{ _dark: { bg: '$backgroundCardDark' } }}
        borderRadius={8}
        p="$4"
      >
        <Text color="$muted500">
          The interactive network map is available in the web admin UI.
        </Text>
      </Box>
    </VStack>
  </ScrollView>
)

export default Topology
