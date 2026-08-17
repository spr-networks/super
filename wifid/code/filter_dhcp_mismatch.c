/*
 *
 *  Parse DHCP packets to port 67 to verify that the client ethernet address matches the layer2 source address.
 *  If the packet ethernet address does not match, reject the packet on the interface.
 *
 */
#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/in.h>
#include <linux/udp.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>
#ifndef SPR_XDP_STANDALONE
#include <xdp/xdp_helpers.h>
#endif


struct dhcp {
    unsigned char               dp_op;          /* packet opcode type */
    unsigned char               dp_htype;       /* hardware addr type */
    unsigned char               dp_hlen;        /* hardware addr length */
    unsigned char               dp_hops;        /* gateway hops */
    unsigned int                dp_xid;         /* transaction ID */
    unsigned short              dp_secs;        /* seconds since boot began */
    unsigned short              dp_flags;       /* flags */
    struct in_addr      dp_ciaddr;      /* client IP address */
    struct in_addr      dp_yiaddr;      /* 'your' IP address */
    struct in_addr      dp_siaddr;      /* server IP address */
    struct in_addr      dp_giaddr;      /* gateway IP address */
    unsigned char               dp_chaddr[16];  /* client hardware address */
    unsigned char               dp_sname[64];   /* server host name */
    unsigned char               dp_file[128];   /* boot file name */
    unsigned char               dp_options[0];  /* variable-length options field */
};

#define DHCPD_PORT 67
#define DHCPC_PORT 68

#define FUNCNAME xdp_block_dhcp_mismatch


SEC("xdp_filter")
int FUNCNAME(struct xdp_md *ctx) {
  void *data = (void *)(long)ctx->data;
  void *data_end = (void *)(long)ctx->data_end;
  struct ethhdr *eth = data;
  if ((void*)eth + sizeof(*eth) <= data_end) {
    struct iphdr *ip = data + sizeof(*eth);
    if ((void*)ip + sizeof(*ip) <= data_end) {
      if (ip->protocol == IPPROTO_UDP) {
        __u32 ip_header_len = ip->ihl * 4;
        if (ip_header_len < sizeof(*ip)) {
          return XDP_DROP;
        }
        struct udphdr *udp = (void*)ip + ip_header_len;
        if ((void*)udp + sizeof(*udp) <= data_end) {
          if (udp->dest == bpf_ntohs(DHCPD_PORT)) {
            if (udp->source != bpf_ntohs(DHCPC_PORT)) {
              return XDP_DROP;
            }
            // https://github.com/spr-networks/super/issues/110 block ip options
            if (ip->ihl != 5) {
              return XDP_DROP;
            }
            // drop actual fragments (MF flag or nonzero offset), allow DF
            if (ip->frag_off & bpf_htons(0x3FFF)) {
              return XDP_DROP;
            }
            struct dhcp *d = (void *)udp + sizeof(*udp);
            if( (void *)d + offsetof(struct dhcp, dp_sname) <= data_end) {
              if (d->dp_htype != 1 || d->dp_hlen != ETH_ALEN) { return XDP_DROP; }
              int i, ret = 0;
              for (i = 0; i < ETH_ALEN; i++) {
                if (eth->h_source[i] != d->dp_chaddr[i]) ret = 1;
              }
              if (ret != 0) return XDP_DROP; //MISMATCH. drop
            } else {
              //invalid dhcp len, drop that
              return XDP_DROP;
            }
          }
        }
      }
    }
  }
  return XDP_PASS;
}

#ifndef SPR_XDP_STANDALONE
struct {
  __uint(priority, 10);
  __uint(XDP_PASS, 1);
} XDP_RUN_CONFIG(FUNCNAME);
#endif
