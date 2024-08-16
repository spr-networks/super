. configs/base/config.sh

cat << END
ctrl_interface=/state/wifi/control
country_code=US
interface=$SSID_INTERFACE
ssid=$SSID_NAME
hw_mode=a
ieee80211d=1
ieee80211n=1
ieee80211ac=1
ieee80211h=1
#for mixed mode need w=1
ieee80211w=1
wmm_enabled=1
preamble=1
# awus036acm and netgear a6210 supported features
ht_capab=[LDPC][HT40+][HT40-][GF][SHORT-GI-20][SHORT-GI-40][TX-STBC][RX-STBC1]
vht_capab=[RXLDPC][SHORT-GI-80][TX-STBC-2BY1][RX-STBC-1][MAX-A-MPDU-LEN-EXP3][RX-ANTENNA-PATTERN][TX-ANTENNA-PATTERN]
vht_oper_chwidth=1
channel=36
vht_oper_centr_freq_seg0_idx=42
auth_algs=1
wpa=2
wpa_key_mgmt=WPA-PSK WPA-PSK-SHA256 SAE
rsn_pairwise=CCMP

# Security parameters

# Isolate stations and per-station group keys
ap_isolate=1
multicast_to_unicast=1

# Mitigate krack attack
wpa_disable_eapol_key_retries=1

# For PMKID leaks in wpa2, any hardening to do here? Besides not using fast roaming?
# no rsn_preauth, no 11r/ft-psk

# VLAN
per_sta_vif=1

# Support H2E and hunting and pecking
sae_pwe=2

# Passwords

wpa_psk_file=/configs/wifi/wpa2pskfile
sae_psk_file=/configs/wifi/sae_passwords

END
