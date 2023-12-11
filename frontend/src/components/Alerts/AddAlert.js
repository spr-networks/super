import React, { useEffect, useState } from 'react'

import {
  Button,
  ButtonText,
  FormControl,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  Switch,
  HStack,
  VStack,
  TrashIcon,
} from '@gluestack-ui/themed'

import { Select } from 'components/Select'

const AddAlert = ({ onSubmit, ...props }) => {
  const [TopicPrefix, setTopicPrefix] = useState('nft:wan:out')
  const [MatchAnyOne, setMatchAnyOne] = useState(false)
  const [InvertRule, setInvertRule] = useState(false)
  const [Conditions, setConditions] = useState([])

  //only one action is supported now. in the future we will implement
  // different action types, for example, disconnecting a device.
  const [GrabFields, setGrabFields] = useState([])
  const [ActionConfig, setActionConfig] = useState({})
  const [Name, setName] = useState("")


  const handleSubmit = () => {
    //validate here?
    let action = ActionConfig
    if (GrabFields.length > 0) {
      action.GrabFields = GrabFields
    }
    let item = {
      TopicPrefix,
      MatchAnyOne,
      InvertRule,
      Conditions,
      Actions: [action],
      Name,
    }

    onSubmit(item)
  }

  const handleConditionChange = (value, index) => {
    const newConditions = [...Conditions];
    newConditions[index].JPath = value;
    setConditions(newConditions);
  };

  const addCondition = () => {
    setConditions([...Conditions, { JPath: '' }]);
  };

  const removeCondition = (index) => {
    const newConditions = [...Conditions];
    newConditions.splice(index, 1);
    setConditions(newConditions);
  };

  const addGrabField = () => {
    setGrabFields([...GrabFields, '']);
  };

  const removeGrabField = (index) => {
    const newGrabFields = [...GrabFields];
    newGrabFields.splice(index, 1);
    setGrabFields(newGrabFields);
  };

  return (
    <VStack space="md">
      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Event Filter Prefix</FormControlLabelText>
        </FormControlLabel>
        <Input type="text" variant="underlined">
          <InputField
            name="TopicPrefix"
            value={TopicPrefix}
            onChangeText={(value) => setTopicPrefix(value)}
          />
        </Input>
      </FormControl>

      { (Conditions.length > 1) ? (
      <HStack space="md">
        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Match Any Condition</FormControlLabelText>
          </FormControlLabel>
          <Switch
            value={MatchAnyOne}
            onValueChange={() => setMatchAnyOne(!MatchAnyOne)}
          />
        </FormControl>

        <FormControl flex={1}>
          <FormControlLabel>
            <FormControlLabelText>Invert Rule</FormControlLabelText>
          </FormControlLabel>
          <Switch
            value={InvertRule}
            onValueChange={() => setInvertRule(!InvertRule)}
          />
        </FormControl>
      </HStack> )
      : null
    }
      {Conditions.map((condition, index) => (
          <HStack key={index} space="md">
            <FormControl flex={5}>
              <FormControlLabel>
                <FormControlLabelText>Condition Expression</FormControlLabelText>
              </FormControlLabel>
              <Input type="text" variant="underlined">
                <InputField
                  name={`JPath-${index}`}
                  value={condition.JPath}
                  onChangeText={(value) => handleConditionChange(value, index)}
                />
              </Input>
            </FormControl>
            <TrashIcon color="$red700" onClick={() => removeCondition(index)} />

          </HStack>
        ))}

        <Button action="primary" size="sm" onPress={addCondition}>
          <ButtonText>New Condition</ButtonText>
        </Button>


        <HStack flex={1}>
          <FormControl>
            <FormControlLabel>
              <FormControlLabelText>Send Notification</FormControlLabelText>
            </FormControlLabel>
            <Switch
              value={ActionConfig.SendNotification}
              onValueChange={() => setActionConfig({ ...ActionConfig, SendNotification: !ActionConfig.SendNotification })}
            />
            <FormControlHelper>
              <FormControlHelperText>UI Notification</FormControlHelperText>
            </FormControlHelper>
          </FormControl>

          <FormControl style={{marginLeft: "25px"}}>
            <FormControlLabel>
              <FormControlLabelText>Peristent Event</FormControlLabelText>
            </FormControlLabel>
            <Switch
              value={ActionConfig.StoreAlert}
              onValueChange={() => setActionConfig({ ...ActionConfig, StoreAlert: !ActionConfig.StoreAlert })}
            />
            <FormControlHelper>
              <FormControlHelperText>Store alert in DB</FormControlHelperText>
            </FormControlHelper>
          </FormControl>
        </HStack>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Alert Topic Suffix</FormControlLabelText>
          </FormControlLabel>
          <Input type="text" variant="underlined">
            <InputField
              placeholder="optional"
              name="StoreTopicSuffix"
              value={ActionConfig.StoreTopicSuffix}
              onChangeText={(value) => setActionConfig({ ...ActionConfig, StoreTopicSuffix: value })}
            />
          </Input>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Message Title</FormControlLabelText>
          </FormControlLabel>
          <Input type="text" variant="underlined">
            <InputField
              name="MessageTitle"
              value={ActionConfig.MessageTitle}
              onChangeText={(value) => setActionConfig({ ...ActionConfig, MessageTitle: value })}
            />
          </Input>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Message Body</FormControlLabelText>
          </FormControlLabel>
          <Input type="text" variant="underlined">
            <InputField
              name="MessageBody"
              value={ActionConfig.MessageBody}
              onChangeText={(value) => setActionConfig({ ...ActionConfig, MessageBody: value })}
            />
          </Input>
        </FormControl>

        <FormControl>
          <FormControlLabel>
            <FormControlLabelText>Collect Event with Alert</FormControlLabelText>
          </FormControlLabel>
          <Switch
            value={ActionConfig.GrabEvent}
            onValueChange={() => setActionConfig({ ...ActionConfig, GrabEvent: !ActionConfig.GrabEvent })}
          />
          <FormControlHelper>
            <FormControlHelperText>Add a custom field to specificy specific fields to collect</FormControlHelperText>
          </FormControlHelper>
        </FormControl>

        {GrabFields.map((field, index) => (
          <HStack key={index} space="md">
            <FormControl flex={5}>
              <FormControlLabel>
                <FormControlLabelText>Grab Field</FormControlLabelText>
              </FormControlLabel>
              <Input type="text" variant="underlined">
                <InputField
                  name={`GrabField-${index}`}
                  value={field}
                  onChangeText={(value) => handleGrabFieldChange(value, index)}
                />
              </Input>
            </FormControl>
            <Button flex={1} action="danger" size="sm" onPress={() => removeGrabField(index)}>
              <TrashIcon color="$red700" mr="$2" />
            </Button>
          </HStack>
        ))}

        <Button action="primary" size="sm" onPress={addGrabField}>
          <ButtonText>Add Custom Field to Collect from Event</ButtonText>
        </Button>


      <FormControl>
        <FormControlLabel>
          <FormControlLabelText>Alert Name</FormControlLabelText>
        </FormControlLabel>
        <Input type="text" variant="underlined">
          <InputField
            name="Name"
            value={Name}
            onChangeText={(value) => setName(value)}
          />
        </Input>
      </FormControl>

      <Button action="primary" size="md" onPress={handleSubmit}>
        <ButtonText>Save</ButtonText>
      </Button>
    </VStack>
  )
}

export default AddAlert