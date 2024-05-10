import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS } from 'chart.js/auto'

import {
  useColorMode
} from '@gluestack-ui/themed'

const AlertChart = ({ fieldCounts, onBarClick }) => {
  const leLabels = Object.keys(fieldCounts).sort();
  const leValues = Object.values(fieldCounts);
  const colorMode = useColorMode()

  const data = {
    labels: leLabels,
    datasets: [
      {
        label: 'Field Count',
        data: leValues,
        backgroundColor: leValues.map((_, index) => `rgba(75, 192, ${192 + index * 20}, 0.6)`),
        borderColor: leValues.map((_, index) => `rgba(75, 192, ${192 + index * 20}, 1)`),
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          display: false,
        },
        ticks: {
          stepSize: 10,
          font: {
            size: 14,
            weight: 'bold',
            color: colorMode == 'light' ? 'black' : 'white'
          },
          color: 'rgba(0, 0, 0, 0.7)',
        },
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          font: {
            size: 14,
            weight: 'bold',
          },
          color: colorMode == 'light' ? 'black' : 'white'
        },
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
    },
    onClick: (event, elements) => {
      if (elements.length > 0) {
        const clickedIndex = elements[0].index;
        const clickedLabel = leLabels[clickedIndex];
        const clickedValue = leValues[clickedIndex];
        onBarClick(clickedLabel, clickedValue);
      }
    },
  };

  return (
    <div style={{ height: '400px', width: '100%' }}>
      <Bar data={data} options={options} />
    </div>
  );
};

export default AlertChart
