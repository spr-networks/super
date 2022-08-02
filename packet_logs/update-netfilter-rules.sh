#!/bin/sh

# run to make sure netfilter rules have the correct prefix and include groups

POS=$(sudo nft -a list ruleset | grep 'log prefix "DRP:MAC "'|sed 's/.*# handle //g')
sudo nft replace rule inet filter DROP_MAC_SPOOF handle $POS log prefix \"drop:mac \" group 1

POS=$(sudo nft -a list ruleset | grep -i 'log prefix "DRP:FWD "'|sed 's/.*# handle //g')
sudo nft replace rule inet filter DROPLOGFWD handle $POS log prefix \"drop:forward \" group 1

POS=$(sudo nft -a list ruleset | grep -i 'log prefix "DRP:INP "'|sed 's/.*# handle //g')
sudo nft replace rule inet filter DROPLOGINP handle $POS log prefix \"drop:input \" group 1

POS=$(sudo nft -a list ruleset | grep '@internet_access'|sed 's/.*# handle //g')
sudo nft add rule inet filter FORWARD position $POS counter oifname \"eth0\" log prefix \"ip:out \" group 0

POS=$(sudo nft -a list ruleset | grep 'jump F_EST_RELATED'|tail -1|sed 's/.*# handle //g')
sudo nft add rule inet filter INPUT position $POS log prefix \"lan:in \" group 0
