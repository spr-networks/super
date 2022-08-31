package main

import (
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/gopacket/layers"
	"github.com/gorilla/mux"
	"github.com/spr-networks/sprbus"
)

var NotificationSettingsFile = "/configs/base/notifications.json"
var ServerEventSock = "/state/api/eventbus.sock"

//notifications.json is array of this:
type NotificationSetting struct {
	//Conditions map[string]interface{}	`json:"Conditions"`
	Conditions       ConditionEntry `json:"Conditions"`
	SendNotification bool           `json:"Notification"`
	// could have templates: notificationTitle, notificationBody with ${dest_ip}
}

type ConditionEntry struct {
	Prefix   string `json:"Prefix"`
	Protocol string `json:"Protocol"`
	DstIP    string `json:"DstIP"`
	DstPort  int    `json:"DstPort"`
	SrcIP    string `json:"SrcIP"`
	SrcPort  int    `json:"SrcPort"`
}

//new format for notifications
type PacketInfo struct {
	//Ethernet  *PacketEthernet `json:"Ethernet,omitempty"`
	TCP       *layers.TCP  `json:"TCP,omitempty"`
	UDP       *layers.UDP  `json:"UDP,omitempty"`
	IP        *layers.IPv4 `json:"IP,omitempty"`
	DNS       *layers.DNS  `json:"DNS,omitempty"`
	Prefix    string       `json:"Prefix"`
	Action    string       `json:"Action"`
	Timestamp time.Time    `json:"Timestamp"`
}

/* example:
[
	{
		Conditions: { "Prefix": "nft:wan:out", "SrcIP": "192.168.2.18", "DstIP": "8.8.8.8" },
		Notification: true
	}
]
*/

var gNotificationConfig = []NotificationSetting{}

// NOTE reload on update
func loadNotificationConfig() {
	data, err := ioutil.ReadFile(NotificationSettingsFile)
	if err != nil {
		fmt.Println(err)
	} else {
		err = json.Unmarshal(data, &gNotificationConfig)
		if err != nil {
			fmt.Println(err)
		}
	}
}

func saveNotificationConfig() {
	file, _ := json.MarshalIndent(gNotificationConfig, "", " ")
	err := ioutil.WriteFile(NotificationSettingsFile, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
}

func getNotificationSettings(w http.ResponseWriter, r *http.Request) {
	loadNotificationConfig()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gNotificationConfig)
}

func modifyNotificationSettings(w http.ResponseWriter, r *http.Request) {
	loadNotificationConfig()

	//Nmtx.Lock()
	//defer Nmtx.Unlock()

	vars := mux.Vars(r)
	indexStr, index_ok := vars["index"]
	index := 0

	if index_ok {
		val, err := strconv.Atoi(indexStr)
		if err != nil {
			http.Error(w, "invalid index", 400)
			return
		}

		index = val
		if index < 0 || index >= len(gNotificationConfig) {
			http.Error(w, "invalid index", 400)
			return
		}
	}

	setting := NotificationSetting{}
	if r.Method == http.MethodPut {
		err := json.NewDecoder(r.Body).Decode(&setting)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		// validate
	}

	// delete, update, append
	if r.Method == http.MethodDelete {
		gNotificationConfig = append(gNotificationConfig[:index], gNotificationConfig[index+1:]...)
	} else if index_ok {
		gNotificationConfig[index] = setting
	} else {
		gNotificationConfig = append(gNotificationConfig, setting)
	}

	saveNotificationConfig()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gNotificationConfig)
}

// return true if we should send a notification
func checkNotificationTraffic(logEntry PacketInfo) bool {
	if logEntry.Prefix == "" {
		return false
	}

	// add nft prefix + remove extra whitespace from logs
	prefix := strings.TrimSpace(fmt.Sprintf("nft:%v", logEntry.Prefix))

	for _, setting := range gNotificationConfig {
		if setting.SendNotification != true {
			continue
		}

		shouldNotify := true

		cond := setting.Conditions

		if cond.Prefix != "" && cond.Prefix != prefix {
			shouldNotify = false
		}

		if cond.Protocol == "tcp" && logEntry.TCP == nil {
			shouldNotify = false
		}

		if cond.Protocol == "udp" && logEntry.UDP == nil {
			shouldNotify = false
		}

		if cond.SrcIP != "" && cond.SrcIP != fmt.Sprintf("%v", logEntry.IP.SrcIP) {
			shouldNotify = false
		}

		if cond.DstIP != "" && cond.DstIP != fmt.Sprintf("%v", logEntry.IP.DstIP) {
			shouldNotify = false
		}

		if cond.SrcPort != 0 {
			if cond.Protocol == "tcp" && logEntry.TCP == nil {
				shouldNotify = false
			} else if cond.Protocol == "tcp" && int(logEntry.TCP.SrcPort) != cond.SrcPort {
				shouldNotify = false
			}

			if cond.Protocol == "udp" && logEntry.UDP == nil {
				shouldNotify = false
			} else if cond.Protocol == "udp" && int(logEntry.UDP.SrcPort) != cond.SrcPort {
				shouldNotify = false
			}
		}

		if cond.DstPort != 0 {
			if cond.Protocol == "tcp" && logEntry.TCP == nil {
				shouldNotify = false
			} else if cond.Protocol == "tcp" && int(logEntry.TCP.DstPort) != cond.DstPort {
				shouldNotify = false
			}

			if cond.Protocol == "udp" && logEntry.UDP == nil {
				shouldNotify = false
			} else if cond.Protocol == "udp" && int(logEntry.UDP.DstPort) != cond.DstPort {
				shouldNotify = false
			}
		}

		if shouldNotify {
			return true
		}
	}

	return false
}

func logTraffic(topic string, data string) {
	var logEntry PacketInfo
	if err := json.Unmarshal([]byte(data), &logEntry); err != nil {
		log.Fatal(err)
	}

	//fmt.Printf("## Notification: %v @ %v\n", topic, logEntry.Timestamp)

	shouldNotify := checkNotificationTraffic(logEntry)

	if shouldNotify {
		fmt.Printf("Sending Notification to WebSocket: %v\n", topic)
		WSNotifyValue("nft", logEntry)
	}
}

// the rest is eventbus -> ws forwarding

func NotificationsRunEventListener() {
	go notificationEventListener()
}

// this is run in a separate thread
func notificationEventListener() {
	loadNotificationConfig()

	log.Printf("notification settings: %v conditions loaded\n", len(gNotificationConfig))
	//WSNotifyString("nft:event:init", `{"status": "init"}`)

	// if file exitst - could be another client connected

	log.Println("client")

	client, err := sprbus.NewClient(ServerEventSock)
	defer client.Close()

	if err != nil {
		log.Fatal("err", err)
	}

	log.Println("subscribing to nft: prefix")
	var wg sync.WaitGroup

	// subscribe to all nft: rules
	// rules = lan:in, lan:out, wan:in, wan:out, drop:input, drop:forward, drop:pfw
	stream, err := client.SubscribeTopic("nft:")
	if nil != err {
		log.Fatal(err)
	}

	go func() {
		wg.Add(1)

		for {
			reply, err := stream.Recv()
			if io.EOF == err {
				break
			}

			if nil != err {
				log.Fatal("ERRRRRR ", err) // Cancelled desc
				wg.Done()
				return
			}

			topic := reply.GetTopic()
			value := reply.GetValue()

			// wildcard sub - value is topic+value
			index := strings.Index(value, "{")
			if index <= 0 {
				continue
			}

			topic = value[0 : index-1]
			value = value[index:len(value)]

			logTraffic(topic, value)
		}
	}()

	time.Sleep(time.Second)

	wg.Wait()
}

type netfilterEntry struct {
	Ahespspi        *int    `json:"ahesp.spi,omitempty"`
	Arpdaddrstr     *string `json:"arp.daddr.str,omitempty"`
	Arpdhwaddr      *int    `json:"arp.dhwaddr,omitempty"`
	Arphwtype       *int    `json:"arp.hwtype,omitempty"`
	Arpoperation    *int    `json:"arp.operation,omitempty"`
	Arpprotocoltype *int    `json:"arp.protocoltype,omitempty"`
	Arpsaddrstr     *string `json:"arp.saddr.str,omitempty"`
	Arpshwaddr      *int    `json:"arp.shwaddr,omitempty"`
	Ctevent         *int    `json:"ct.event,omitempty"`
	Ctid            *int    `json:"ct.id,omitempty"`
	Ctmark          *int    `json:"ct.mark,omitempty"`

	Flowendsec    *int `json:"flow.end.sec,omitempty"`
	Flowendusec   *int `json:"flow.end.usec,omitempty"`
	Flowstartsec  *int `json:"flow.start.sec,omitempty"`
	Flowstartusec *int `json:"flow.start.usec,omitempty"`

	Icmpcode      *int `json:"icmp.code,omitempty"`
	Icmpcsum      *int `json:"icmp.csum,omitempty"`
	Icmpechoid    *int `json:"icmp.echoid,omitempty"`
	Icmpechoseq   *int `json:"icmp.echoseq,omitempty"`
	Icmpfragmtu   *int `json:"icmp.fragmtu,omitempty"`
	Icmpgateway   *int `json:"icmp.gateway,omitempty"`
	Icmptype      *int `json:"icmp.type,omitempty"`
	Icmpv6code    *int `json:"icmpv6.code,omitempty"`
	Icmpv6csum    *int `json:"icmpv6.csum,omitempty"`
	Icmpv6echoid  *int `json:"icmpv6.echoid,omitempty"`
	Icmpv6echoseq *int `json:"icmpv6.echoseq,omitempty"`
	Icmpv6type    *int `json:"icmpv6.type,omitempty"`

	Ip6flowlabel  *int    `json:"ip6.flowlabel,omitempty"`
	Ip6fragid     *int    `json:"ip6.fragid,omitempty"`
	Ip6fragoff    *int    `json:"ip6.fragoff,omitempty"`
	Ip6hoplimit   *int    `json:"ip6.hoplimit,omitempty"`
	Ip6nexthdr    *int    `json:"ip6.nexthdr,omitempty"`
	Ip6payloadlen *int    `json:"ip6.payloadlen,omitempty"`
	Ip6priority   *int    `json:"ip6.priority,omitempty"`
	Ipcsum        *int    `json:"ip.csum,omitempty"`
	Ipdaddrstr    *string `json:"ip.daddr.str,omitempty"`
	Ipfragoff     *int    `json:"ip.fragoff,omitempty"`
	Ipid          *int    `json:"ip.id,omitempty"`
	Ipihl         *int    `json:"ip.ihl,omitempty"`
	IpProtocol    *int    `json:"ip.protocol,omitempty"`
	IpSaddrStr    *string `json:"ip.saddr.str,omitempty"`
	IpTos         *int    `json:"ip.tos,omitempty"`
	IpTotLen      *int    `json:"ip.totlen,omitempty"`
	IpTtl         *int    `json:"ip.ttl,omitempty"`
	MacDaddrStr   *string `json:"mac.daddr.str,omitempty"`
	MacSaddrStr   *string `json:"mac.saddr.str,omitempty"`
	MacStr        *string `json:"mac.str,omitempty"`

	Nufwappname  *string `json:"nufw.app.name,omitempty"`
	Nufwosname   *string `json:"nufw.os.name,omitempty"`
	Nufwosrel    *string `json:"nufw.os.rel,omitempty"`
	Nufwosvers   *string `json:"nufw.os.vers,omitempty"`
	Nufwuserid   *int    `json:"nufw.user.id,omitempty"`
	Nufwusername *string `json:"nufw.user.name,omitempty"`

	OobFamily     *int    `json:"oob.family,omitempty"`
	OobGid        *int    `json:"oob.gid,omitempty"`
	OobHook       *int    `json:"oob.hook,omitempty"`
	OobIfindexIn  *int    `json:"oob.ifindex_in,omitempty"`
	OobIfindexOut *int    `json:"oob.ifindex_out,omitempty"`
	OobIn         *string `json:"oob.in,omitempty"`
	OobMark       *int    `json:"oob.mark"`
	OobOut        *string `json:"oob.out,omitempty"`
	OobPrefix     *string `json:"oob.prefix,omitempty"`
	OobProtocol   *int    `json:"oob.protocol,omitempty"`
	OobSeqglobal  *int    `json:"oob.seq.global,omitempty"`
	OobSeqlocal   *int    `json:"oob.seq.local,omitempty"`
	OobTimesec    *int    `json:"oob.time.sec,omitempty"`
	OobTimeusec   *int    `json:"oob.time.usec,omitempty"`
	OobUid        *int    `json:"oob.uid,omitempty"`

	Origipdaddrstr  *string `json:"orig.ip.daddr.str,omitempty"`
	Origipprotocol  *int    `json:"orig.ip.protocol,omitempty"`
	Origipsaddrstr  *string `json:"orig.ip.saddr.str,omitempty"`
	Origl4dport     *int    `json:"orig.l4.dport,omitempty"`
	Origl4sport     *int    `json:"orig.l4.sport,omitempty"`
	Origrawpktcount *int    `json:"orig.raw.pktcount,omitempty"`
	Origrawpktlen   *int    `json:"orig.raw.pktlen,omitempty"`

	Print            *string `json:"print,omitempty"`
	Pwsniffpass      *string `json:"pwsniff.pass,omitempty"`
	Pwsniffuser      *string `json:"pwsniff.user,omitempty"`
	Rawlabel         *int    `json:"raw.label,omitempty"`
	Rawmacaddrlen    *int    `json:"raw.mac.addrlen,omitempty"`
	Rawmac           *int    `json:"raw.mac,omitempty"`
	Rawmaclen        *int    `json:"raw.mac_len,omitempty"`
	Rawpktcount      *int    `json:"raw.pktcount,omitempty"`
	Rawpkt           *int    `json:"raw.pkt,omitempty"`
	Rawpktlen        *int    `json:"raw.pktlen,omitempty"`
	Rawtype          *int    `json:"raw.type,omitempty"`
	Replyipdaddrstr  *string `json:"reply.ip.daddr.str,omitempty"`
	Replyipprotocol  *int    `json:"reply.ip.protocol,omitempty"`
	Replyipsaddrstr  *string `json:"reply.ip.saddr.str,omitempty"`
	Replyl4dport     *int    `json:"reply.l4.dport,omitempty"`
	Replyl4sport     *int    `json:"reply.l4.sport,omitempty"`
	Replyrawpktcount *int    `json:"reply.raw.pktcount,omitempty"`
	Replyrawpktlen   *int    `json:"reply.raw.pktlen,omitempty"`
	Sctpcsum         *int    `json:"sctp.csum,omitempty"`
	Sctpdport        *int    `json:"sctp.dport,omitempty"`
	Sctpsport        *int    `json:"sctp.sport,omitempty"`
	Sumbytes         *int    `json:"sum.bytes,omitempty"`
	Sumname          *string `json:"sum.name,omitempty"`
	Sumpkts          *int    `json:"sum.pkts,omitempty"`
	Tcpack           *int    `json:"tcp.ack,omitempty"`
	Tcpackseq        *int    `json:"tcp.ackseq,omitempty"`
	Tcpcsum          *int    `json:"tcp.csum,omitempty"`
	Tcpdport         *int    `json:"tcp.dport,omitempty"`
	Tcpfin           *int    `json:"tcp.fin,omitempty"`
	Tcpoffset        *int    `json:"tcp.offset,omitempty"`
	Tcppsh           *int    `json:"tcp.psh,omitempty"`
	Tcpreserved      *int    `json:"tcp.reserved,omitempty"`
	Tcpres1          *int    `json:"tcp.res1,omitempty"`
	Tcpres2          *int    `json:"tcp.res2,omitempty"`
	Tcprst           *int    `json:"tcp.rst,omitempty"`
	Tcpseq           *int    `json:"tcp.seq,omitempty"`
	Tcpsport         *int    `json:"tcp.sport,omitempty"`
	Tcpsyn           *int    `json:"tcp.syn,omitempty"`
	Tcpurg           *int    `json:"tcp.urg,omitempty"`
	Tcpurgp          *int    `json:"tcp.urgp,omitempty"`
	Tcpwindow        *int    `json:"tcp.window,omitempty"`
	Udpcsum          *int    `json:"udp.csum,omitempty"`
	Udpdport         *int    `json:"udp.dport,omitempty"`
	Udplen           *int    `json:"udp.len,omitempty"`
	Udpsport         *int    `json:"udp.sport,omitempty"`

	SrcPort    *int    `json:"src_port,omitempty"`
	SrcIp      *string `json:"src_ip,omitempty"`
	DestPort   *int    `json:"dest_port,omitempty"`
	DestIp     *string `json:"dest_ip,omitempty"`
	Dvc        *string `json:"dvc,omitempty"`
	Timestamp  *string `json:"timestamp,omitempty"`
	LTimestamp string  `json:"@timestamp,omitempty"`
	Action     *string `json:"action,omitempty"`

	//GeoIP esGeoIP `json:"geoip"`
}
