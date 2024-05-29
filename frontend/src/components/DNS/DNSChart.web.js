import React, { useEffect, useContext, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Pie, Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS } from 'chart.js/auto';
import { AlertContext } from 'AppContext';
import PluginDisabled from 'views/PluginDisabled';
import { dbAPI, logAPI } from 'api';
import { Box, View, Text, Pressable, useColorMode, HStack, VStack, Heading, Select, Input, ScrollView } from '@gluestack-ui/themed';
import ClientSelect from 'components/ClientSelect'
import DatePicker from 'components/DatePicker';

const DNSChartView = ({ responseTypeCounts, onSegmentClick }) => {
  const responseTypes = Object.keys(responseTypeCounts);
  const responseCounts = Object.values(responseTypeCounts);

  const data = {
    labels: responseTypes,
    datasets: [
      {
        data: responseCounts,
        backgroundColor: responseCounts.map((_, index) => `hsl(${index * 60}, 70%, 50%)`),
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'right',
      },
      title: {
        display: true,
        text: 'DNS Response Types',
      },
    },
    onClick: (event, elements) => {
      if (elements.length > 0) {
        const clickedIndex = elements[0].index;
        const clickedType = responseTypes[clickedIndex];
        onSegmentClick(clickedType);
      }
    },
  };

  return (
    <Box borderRadius="lg" bg="gray.100" p={4} shadow={2} width={300} height={300}>
      <Pie data={data} options={options} />
    </Box>
  );
};

const DomainBarChart = ({ domainCounts }) => {
  const domains = Object.keys(domainCounts);
  const counts = Object.values(domainCounts);

  const data = {
    labels: domains,
    datasets: [
      {
        label: 'Query Count',
        data: counts,
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    scales: {
      y: {
        beginAtZero: true,
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: 'Domain Query Counts',
      },
    },
  };

  return (
    <Box borderRadius="lg" bg="gray.100" p={4} shadow={2} flex={1}>
      <Bar data={data} options={options} />
    </Box>
  );
};



const FrequencyAnalysisChart = ({ domainFrequency }) => {
  const data = {
    labels: [...Array(24)].map((_, i) => `${i.toString().padStart(2, '0')}:00`),
    datasets: Object.entries(domainFrequency.datasets).map(([domain, data], index) => ({
      label: domain,
      data,
      borderColor: `hsl(${index * 60}, 70%, 50%)`,
      fill: false,
    })),
  };

  const options = {
    responsive: true,
    scales: {
      x: {
        title: {
          display: true,
          text: 'Time',
        },
      },
      y: {
        title: {
          display: true,
          text: 'Request Count',
        },
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        }
      },
    },
    plugins: {
      legend: {
        display: false,
        position: 'top',
      },
      title: {
        display: true,
        text: 'Frequency Analysis',
      },
    },
  };

  return (
    <Box borderRadius="lg" bg="gray.100" p={4} shadow={2}>
      <Line data={data} options={options} />
    </Box>
  );
};
const DNSChart = () => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [responseTypeCounts, setResponseTypeCounts] = useState({});
  const [domainCounts, setDomainCounts] = useState({});
  const [startDate, setStartDate] = useState(null)
  const [endDate, setEndDate] = useState(null);
  const [clientIP, setClientIP] = useState('');
  const [domainFrequency, setDomainFrequency] = useState({ labels: [], datasets: {} });
  const context = useContext(AlertContext);
  const params = useParams();

  useEffect(() => {
    logAPI.config().catch((error) => setIsEnabled(false));
    fetchData();
  }, [startDate, endDate, clientIP]);

  useEffect(() => {
    if (endDate === null) {
      return;
    }

    let utcOffsetMS = new Date().getTimezoneOffset() * 60000;
    let min = new Date(endDate);
    min.setTime(min.getTime() - utcOffsetMS);
    min = min.toISOString();

    let nextDay = new Date(endDate);
    nextDay.setTime(nextDay.getTime() + utcOffsetMS);
    nextDay.setDate(nextDay.getDate() + 1);
    let max = nextDay.toISOString();

    setStartDate(min);
    setEndDate(max);
  }, [endDate]);

  const fetchData = () => {
    dbAPI
      .buckets()
      .then((buckets) => {
        buckets = buckets.filter((b) => b.startsWith('dns:serve'));
        buckets.sort();
        Promise.all(
          buckets.map((bucket) =>
            dbAPI.items(bucket, {}).then((results) =>
              results.filter((result) => {
                const timestamp = new Date(result.Timestamp);
                const startTimestamp = startDate ? new Date(startDate) : null;
                const endTimestamp = endDate ? new Date(endDate) : null;
                const matchesDate =
                  (!startTimestamp || timestamp >= startTimestamp) &&
                  (!endTimestamp || timestamp <= endTimestamp);
                const matchesClientIP = !clientIP || result.Remote.startsWith(clientIP);
                return matchesDate && matchesClientIP;
              })
            )
          )
        ).then((allResults) => {
          const concatenatedResults = allResults.flat();
          const typeCounts = concatenatedResults.reduce((counts, { Type }) => {
            counts[Type] = (counts[Type] || 0) + 1;
            return counts;
          }, {});
          setResponseTypeCounts(typeCounts);

          const domainCounts = concatenatedResults.reduce((counts, { FirstName }) => {
            counts[FirstName] = (counts[FirstName] || 0) + 1;
            return counts;
          }, {});
          setDomainCounts(domainCounts);

          const frequencyData = allResults.flat().reduce((acc, { FirstName, Timestamp }) => {
            const domain = FirstName;
            const timestamp = new Date(Timestamp);
            const interval = `${timestamp.getHours()}:${timestamp.getMinutes()}`;

            if (!acc.labels.includes(interval)) {
              acc.labels.push(interval);
            }

            acc.datasets[domain] = acc.datasets[domain] || Array(acc.labels.length).fill(0);
            acc.datasets[domain][acc.labels.indexOf(interval)]++;

            return acc;
          }, { labels: [], datasets: {} });

          // Remove data where frequency is less than 2
          const filteredFrequencyData = {
            labels: frequencyData.labels.filter((_, index) => {
              return Object.values(frequencyData.datasets).some(data => data[index] >= 2);
            }),
            datasets: Object.entries(frequencyData.datasets).reduce((acc, [domain, data]) => {
              const filteredData = data.filter(freq => freq >= 1);
              if (filteredData.length > 0) {
                acc[domain] = filteredData;
              }
              return acc;
            }, {})
          };

          setDomainFrequency(frequencyData);

        });

      })

      .catch((err) => {
        context.error(`bucket error`, err);
      });
  };

  const handleSegmentClick = (responseType) => {
    // Implement filtering or additional actions based on the clicked response type
    console.log(`Clicked response type: ${responseType}`);
  };

  if (!isEnabled) {
    return <PluginDisabled plugin="dns" />;
  }

  return (
    <ScrollView>
    <VStack space={6} p={4}>
      <Heading size="xl">DNS Analysis</Heading>
      <HStack space={4}>
        <VStack space={2}>
          <Text>Start Date:</Text>
          <DatePicker value={startDate} onChange={setStartDate} />
        </VStack>
        <VStack space={2}>
          <Text>End Date:</Text>
          <DatePicker value={endDate} onChange={setEndDate} />
        </VStack>
        <VStack space={2}>
          <Text>Client IP:</Text>
          <ClientSelect
            name="DNSIP"
            value={clientIP}
            onSubmitEditing={(value) => setClientIP(value)}
            onChangeText={(value) => setClientIP(value)}
            onChange={(value) => setClientIP(value)}
          />
        </VStack>
      </HStack>
      <HStack space={4}>
        <DomainBarChart domainCounts={domainCounts} />
        <DNSChartView responseTypeCounts={responseTypeCounts} onSegmentClick={handleSegmentClick} />
      </HStack>
      <FrequencyAnalysisChart domainFrequency={domainFrequency} />
    </VStack>
    </ScrollView>
  );
};

export default DNSChart;
