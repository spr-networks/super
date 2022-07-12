import PropTypes from 'prop-types'
import { prettySize } from 'utils'
import { Divider, Box, Text, useColorModeValue } from 'native-base'

const StatsChartWidget = (props) => {
	return (
		<Text>TODO</Text>
	)
}

StatsChartWidget.propTypes = {
  title: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  data: PropTypes.oneOfType([PropTypes.array, PropTypes.object]).isRequired,
  description: PropTypes.string,
  labels: PropTypes.array,
  text: PropTypes.string,
  colors: PropTypes.array,
  footerIcon: PropTypes.string,
  footerText: PropTypes.string
}

export default StatsChartWidget
