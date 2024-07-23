export default [
  {
    TopicPrefix: 'nft:drop:mac',
    MatchAnyOne: false,
    InvertRule: false,
    Conditions: [],
    Actions: [
      {
        SendNotification: false,
        StoreAlert: true,
        MessageTitle: 'MAC Filter Violation',
        MessageBody:
          'MAC IP Violation {{InDev#Interface}} {{IP.SrcIP#Device}} {{IP.SrcIP}} {{Ethernet.SrcMAC}} to {{IP.DstIP}} {{Ethernet.DstMAC}}',
        NotificationType: 'warning',
        GrabEvent: true,
        GrabValues: false
      }
    ],
    Name: 'MAC Filter Violation',
    Disabled: true,
    RuleId: '7f3266dd-7697-44ce-8ddd-36a006043509'
  },
  {
    TopicPrefix: 'auth:failure',
    MatchAnyOne: false,
    InvertRule: false,
    Conditions: [
      {
        JPath: '$[?(@.type=="user")]'
      }
    ],
    Actions: [
      {
        SendNotification: false,
        StoreAlert: true,
        MessageTitle: 'Login Failure',
        MessageBody: '{{name}} failed to login with {{reason}}',
        NotificationType: 'error',
        GrabEvent: true,
        GrabValues: false
      }
    ],
    Name: 'User Login Failure',
    Disabled: true,
    RuleId: 'ea676ee7-ec68-4a23-aba4-ba69feee4d8c'
  },
  {
    TopicPrefix: 'nft:drop:private',
    MatchAnyOne: false,
    InvertRule: false,
    Conditions: [],
    Actions: [
      {
        SendNotification: false,
        StoreAlert: true,
        MessageTitle: 'Drop Private Network Request',
        MessageBody:
          'Dropped Traffic from {{IP.SrcIP#Device}} {{IP.SrcIP}} {{InDev#Interface}} to {{IP.DstIP}} {{OutDev#Interface}}',
        NotificationType: 'warning',
        GrabEvent: true,
        GrabValues: false
      }
    ],
    Name: 'Drop Private Request',
    Disabled: true,
    RuleId: '2adbec19-6b47-4a99-a499-ab0b8da652a8'
  },
  {
    TopicPrefix: 'wifi:auth:fail',
    MatchAnyOne: false,
    InvertRule: false,
    Conditions: [],
    Actions: [
      {
        SendNotification: true,
        StoreAlert: true,
        MessageTitle: 'WiFi Auth Failure',
        MessageBody:
          '{{MAC#Device}} {{MAC}} failed wifi authentication {{Reason}} with type {{Type}}',
        NotificationType: 'warning',
        GrabEvent: true,
        GrabValues: false
      }
    ],
    Name: 'Wifi Auth Failure',
    Disabled: false,
    RuleId: 'f16e9a58-9f80-455c-a280-211bd8b1fd05'
  },
  {
    TopicPrefix: 'wifi:auth:success',
    MatchAnyOne: false,
    InvertRule: false,
    Conditions: [],
    Actions: [
      {
        SendNotification: true,
        StoreAlert: false,
        MessageTitle: 'Device Connected',
        MessageBody: 'Authentication success for {{MAC#Device}}',
        NotificationType: 'success',
        GrabEvent: true,
        GrabValues: false,
        GrabFields: ['MAC']
      }
    ],
    Name: 'Device Connected',
    Disabled: false,
    RuleId: '387c3a9d-b072-4ba7-b6ff-895f484db4ec'
  },
  {
    TopicPrefix: 'nft:drop:input',
    MatchAnyOne: false,
    InvertRule: false,
    Conditions: [],
    Actions: [
      {
        SendNotification: false,
        StoreAlert: true,
        MessageTitle: 'Dropped Input',
        MessageBody:
          'Drop Incoming Traffic to Router from {{IP.SrcIP}} to port {{TCP.DstPort}} {{UDP.DstPort}}',
        NotificationType: 'warning',
        GrabEvent: true,
        GrabValues: false
      }
    ],
    Name: 'Dropped Input',
    Disabled: true,
    RuleId: '481822f4-a20c-4cec-92d9-dad032d2c450'
  },
  {
    TopicPrefix: 'dns:serve:',
    MatchAnyOne: false,
    InvertRule: false,
    Conditions: [
      {
        JPath: '$[?(@.FirstName=="c2h.se.")]'
      }
    ],
    Actions: [
      {
        SendNotification: false,
        StoreAlert: false,
        MessageTitle: 'Domain resolve',
        MessageBody: '{{Remote#Device}} domain lookup: {{FirstName}}',
        NotificationType: 'info',
        GrabEvent: true,
        GrabValues: false,
        GrabFields: ['FirstName', 'Remote']
      }
    ],
    Name: 'dns resolve',
    Disabled: true,
    RuleId: 'f6bdb6ee-ffcb-41af-b3c7-6270cba936fb'
  },
  {
   TopicPrefix: "device:vpn:online",
   MatchAnyOne: false,
   InvertRule: false,
   Conditions: [],
   Actions: [
    {
     SendNotification: true,
     StoreAlert: false,
     MessageTitle: "{{DeviceIP#Device}} connected via {{VPNType}} from {{RemoteEndpoint}}",
     MessageBody: "{{DeviceIP#Device}} connected via {{VPNType}} from {{RemoteEndpoint}}",
     NotificationType: "info",
     GrabEvent: true,
     GrabValues: false
    }
   ],
   Name: "VPN Connection",
   Disabled: false,
   RuleId: "6d3c9a04-8ad4-4ad3-8e7d-4fe61fd3c592"
 },
 {
  TopicPrefix: "device:vpn:offline",
  MatchAnyOne: false,
  InvertRule: false,
  Conditions: [],
  Actions: [
   {
    SendNotification: true,
    StoreAlert: false,
    MessageTitle: "{{DeviceIP#Device}} disconnected from {{VPNType}} by {{RemoteEndpoint}}",
    MessageBody: "{{DeviceIP#Device}} disconnected from {{VPNType}} by {{RemoteEndpoint}}",
    NotificationType: "info",
    GrabEvent: true,
    GrabValues: false
   }
  ],
  Name: "VPN Connection",
  Disabled: false,
  RuleId: "6d3c9a04-8ad4-4ad3-8e7d-4fe61fd3c593"
},
]
