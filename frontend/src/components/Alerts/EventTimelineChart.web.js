import React, {useState} from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS } from 'chart.js/auto'

import {
  Button,
  ButtonIcon,
  Center,
  FlatList,
  Heading,
  HStack,
  ScrollView,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Text,
  Tooltip,
  TooltipContent,
  View,
  VStack,
  SettingsIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@gluestack-ui/themed'

const TimelineChart = ({ topics, data, onBarClick }) => {
  // Process data to create timeline representation
  /*
  const proxcessedData = xdata.reduce((acc, item) => {
    const existingTopic = acc.find(t => t.topic === item.topic);
    if (existingTopic) {
      existingTopic.events.push(new Date(item.time));
    } else {
      acc.push({ topic: item.topic, events: [new Date(item.time)] });
    }
    return acc;
  }, []);
  */

  let eventTimeByTopic = {}
  for (let topic of topics) {
    eventTimeByTopic[topic] = []
  }
  let maxTime = new Date('2023-01-12T00:00:00Z')
  let minTime = new Date()

  for (let item of data) {
    if (item.selected !== 'wifi:station:disconnect') continue
    if (!eventTimeByTopic[item.selected]) {
      //unexpected
      eventTimeByTopic[item.selected] = []
    }
    let dt = new Date(item.time)
    if (!minTime) minTime = dt
    if (!maxTime) maxTime = dt
    if (dt < minTime) minTime = dt
    if (dt > maxTime) maxTime = dt
    eventTimeByTopic[item.selected].push(dt)
  }

  let width = (maxTime.getTime() - minTime.getTime())/100
  let chartMaxTime = new Date(maxTime.getTime() + width*10)
  let chartMinTime = new Date(maxTime.getTime() - width*10)

  const datasets = topics.map((topic, index) => {
      return {
        label: topic,
        data: eventTimeByTopic[topic].map(event => ({
          x: index,
          y: [ event.getTime() - minTime.getTime(),
              (new Date(event.getTime()+ width)) - minTime.getTime()],
          backgroundColor: `hsl(${index * 30}, 70%, 50%)`,
          borderColor: `hsl(${index * 30}, 70%, 40%)`,
          borderWidth: 1,
          pointStyle: 'rect',
      }))
    }
  })

  // Create chart data
  const chartData = {
    labels: topics,
    datasets: datasets,
  };

  const options = {
    legend: {
      show: false,
    },
    indexAxis: 'x',
    scales: {
      y: {
        type: 'linear',
        position: 'bottom',
        min: 0,
        max: chartMaxTime.getTime() - chartMinTime.getTime(),
        ticks: {
          callback: function(value) {
            const date = new Date(minTime.getTime() + value);
            return date.toLocaleDateString();
          }
        },
        title: {
          display: true,
          text: 'Time'
        }
      },
      x: {
        type: 'category',
        labels: topics,
        stacked: true,
        position: 'top',
      }
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: function(context) {
            const date = new Date(minTime.getTime() + context.parsed.x);
            return `${context.dataset.label}: ${date.toLocaleString()}`;
          }
        }
      }
    },
    onClick: (event, elements) => {
      if (elements.length > 0) {
        const index = elements[0].index;
        const datasetIndex = elements[0].datasetIndex;
        const clickedTopic = chartData.labels[datasetIndex];
        const clickedTime = new Date(minTime.getTime() + chartData.datasets[datasetIndex].data[index].x);
        if (onBarClick) {
          onBarClick(clickedTopic, clickedTime);
        }
      }
    },
    responsive: true,
    maintainAspectRatio: false,
  };


  return (
    <VStack>
      <ScrollView>
        <Bar data={chartData} options={options} />
      </ScrollView>
   </VStack>
  );
};

export default TimelineChart;
