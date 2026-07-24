#include <errno.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

static bool tap_configured;
static bool vsock_configured;
static int vsock_fd = -1;

int32_t
krun_create_ctx (void)
{
  return 1;
}

int32_t
krun_set_log_level (uint32_t level)
{
  (void) level;
  return 0;
}

int32_t
krun_set_vm_config (uint32_t ctx_id, uint8_t cpus, uint32_t ram_mib)
{
  (void) ctx_id;
  (void) cpus;
  (void) ram_mib;
  return 0;
}

int32_t
krun_add_virtiofs2 (uint32_t ctx_id, const char *tag, const char *path,
                    uint64_t shm_size)
{
  (void) ctx_id;
  (void) tag;
  (void) path;
  (void) shm_size;
  return 0;
}

int32_t
krun_add_net_tap (uint32_t ctx_id, const char *tap_name, uint8_t *mac,
                  uint32_t features, uint32_t flags)
{
  static const uint8_t expected_mac[6] = { 0x02, 0, 0, 0, 0, 1 };

  (void) ctx_id;
  (void) features;

  if (tap_name == NULL || strcmp (tap_name, "ktest0") != 0 || mac == NULL
      || memcmp (mac, expected_mac, sizeof (expected_mac)) != 0
      || flags != (1U << 1))
    return -EINVAL;

  tap_configured = true;
  return 0;
}

int32_t
krun_add_vsock_port2 (uint32_t ctx_id, uint32_t port, const char *path,
                      bool should_listen)
{
  struct sockaddr_un address = { 0 };

  (void) ctx_id;
  if (port != 4040 || path == NULL
      || strcmp (path, "/run/spr-krun/listen/socket.sock") != 0 || ! should_listen)
    return -EINVAL;

  vsock_fd = socket (AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
  if (vsock_fd < 0)
    return -errno;
  address.sun_family = AF_UNIX;
  memcpy (address.sun_path, path, strlen (path) + 1);
  if (bind (vsock_fd, (struct sockaddr *) &address, sizeof (address)) < 0)
    return -errno;
  if (listen (vsock_fd, 5) < 0)
    return -errno;

  vsock_configured = true;
  return 0;
}

int32_t
krun_set_rlimits (uint32_t ctx_id, const char *const rlimits[])
{
  (void) ctx_id;
  (void) rlimits;
  return 0;
}

int32_t
krun_start_enter (uint32_t ctx_id)
{
  (void) ctx_id;
  if (! tap_configured || ! vsock_configured)
    return -EINVAL;
  sleep (30);
  return 0;
}
