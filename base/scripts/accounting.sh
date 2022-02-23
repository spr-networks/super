#!/bin/bash

nft -f - << EOF

table ip accounting
delete table ip accounting

table ip accounting {

      set local_lan {
        type ipv4_addr
        flags interval
        elements = { $LANIP/24 }
      }

      set outgoing_traffic_lan {
        type ipv4_addr
        counter
        flags dynamic
        timeout 24h
        size 65535
      }

      set outgoing_traffic_wan {
        type ipv4_addr
        counter
        flags dynamic
        timeout 24h
        size 65535
      }

      set incoming_traffic_lan {
        type ipv4_addr
        counter
        flags dynamic
        timeout 24h
        size 65535
      }

      set incoming_traffic_wan {
        type ipv4_addr
        counter
        flags dynamic
        timeout 24h
        size 65535
      }

      set all_ip {
        type ifname . ipv4_addr . ipv4_addr
        counter
        flags dynamic
        timeout 1h
        size 4096
      }

      chain FORWARD {
        type filter hook forward priority -150 ; policy accept;

        # Log all input ip pairs (input interface, src ip, dst ip)
        add @all_ip { iifname . ip saddr . ip daddr }
        iifname . ip saddr . ip daddr @all_ip

        ip daddr @local_lan jump count_in
        ip saddr @local_lan jump count_out
      }

      chain count_in {
        ip saddr @local_lan goto count_in_lan
        add @incoming_traffic_wan { ip daddr }
        ip daddr @incoming_traffic_wan
      }

      chain count_in_lan {
        add @incoming_traffic_lan { ip daddr }
        ip daddr @incoming_traffic_lan
      }


      chain count_out {
        ip daddr @local_lan goto count_out_lan
        add @outgoing_traffic_wan { ip saddr }
        ip saddr @outgoing_traffic_wan
      }

      chain count_out_lan {
        add @outgoing_traffic_lan { ip saddr }
        ip saddr @outgoing_traffic_lan
      }

}
EOF
