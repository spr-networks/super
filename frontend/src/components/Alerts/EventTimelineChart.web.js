import React, {useState, useEffect} from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS } from 'chart.js/auto'
import chroma from 'chroma-js'

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

  const [chartData, setChartData] = useState(null);
  const [chartMinTime, setChartMinTime] = useState(null);
  const [chartMaxTime, setChartMaxTime] = useState(null);

  const [minTime, setMinTime] = useState(null);
  const [maxTime, setMaxTime] = useState(null);

  useEffect(() => {
    const processData = () => {
      let eventTimeByTopic = {};
      for (let topic of topics) {
        eventTimeByTopic[topic] = [];
      }
      let maxTime = new Date('2023-01-12T00:00:00Z');
      let minTime = new Date();

      for (let item of data) {
        if (!eventTimeByTopic[item.selected]) {
          eventTimeByTopic[item.selected] = [];
        }
        let dt = new Date(item.time);
        if (dt < minTime) minTime = dt;
        if (dt > maxTime) maxTime = dt;
        eventTimeByTopic[item.selected].push({
          dt: dt,
          data: item
        });
      }

      setMinTime(minTime);
      setMaxTime(maxTime);
      //setStartTimeRange(maxTime - minTime)

      let width = (maxTime.getTime() - minTime.getTime()) / 100;
      let cmt = new Date(maxTime.getTime() + width * 2);
      let cmmt = new Date(minTime.getTime() - width * 2);
      setChartMinTime(cmmt)
      setChartMaxTime(cmt)

      let colors = chroma
        .scale(['seagreen', 'teal', 'lightskyblue', 'royalblue', 'navy'])
        .mode('lch')
        .colors(Object.keys(eventTimeByTopic).length);

      const datasets = topics.map((topic, index) => {
        let c = chroma(colors[index]).alpha(0.85).css();
        let ban = ['selected','bucket','time']
        return {
          label: topic + "",
          backgroundColor:  `rgba(75, 192, ${192 + index * 20}, 0.6)`,
          borderColor: `rgba(75, 192, ${192 + index * 20}, 1)`,
          borderWidth: 1,
          pointStyle: 'rect',
          data: eventTimeByTopic[topic].map(event => ({
            y: topic,
            x: [event.dt.getTime() - minTime.getTime(),
            (new Date(event.dt.getTime() + width)).getTime() - minTime.getTime()],
            customLabel: Object.entries(event.data).filter(([k]) => !ban.includes(k)).map(([key, value]) =>  `${key} : ${JSON.stringify(value)}`)
          }))
        };
      });

      setChartData({
        labels: topics,
        datasets: datasets,
      });
    };

    processData();
  }, [topics, data]);


  const max_end = chartMaxTime ? (chartMaxTime.getTime() - chartMinTime.getTime()) : 0

  const options = {
    legend: {
      show: false,
    },
    indexAxis: 'y',
    scales: {
      x: {
        min: 0,
        max: max_end,
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
      y: {
        type: 'category',
        labels: topics,
        stacked: true,
      }
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: function(context, data) {
            const date = new Date(minTime.getTime() + context.parsed.x);
            const dataset = chartData.datasets[context.datasetIndex];
            const datapoint = dataset.data[context.dataIndex];
            return [`${date.toLocaleString()}`, ...datapoint.customLabel];
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
    <ScrollView>
      {chartData && (
        <Bar data={chartData} options={options} />
      )}
    </ScrollView>
  );
};

export default TimelineChart;
