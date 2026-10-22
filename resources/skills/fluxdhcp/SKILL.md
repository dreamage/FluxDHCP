---
name: fluxdhcp
description: Operate a FluxDHCP server through its MCP tools — inspect pools, leases, logs and clients, and make configuration changes safely. Use when the user asks why a device cannot get an IP, wants a fixed address, needs a pool resized, or asks about DHCP leases, reservations, MAC blacklists or webhook deliveries.
---

# FluxDHCP operations handbook

This assumes the `fluxdhcp` MCP server is connected. If it is not, ask the user to configure `FLUXDHCP_URL` and `FLUXDHCP_API_KEY`. Do not try to work around the MCP layer with raw curl calls.

The server rejects anonymous requests. Any tool returning `AUTH_REQUIRED` means the key is missing — point the user to **Settings → API access** and wait. Do not look for another way in.

## Credentials

- Default to a **read-only** key. Read scope covers everything needed for troubleshooting.
- Only read/write keys can change configuration, add reservations, block MACs or resize pools. On `API_KEY_READ_ONLY`, stop and tell the user to switch keys; never try to bypass it.
- Never repeat the key value in replies, logs or commits.

## Tool map

| Question | Tool |
|---|---|
| Is the service up? How full are the pools? | `dhcp_status` |
| Which pools exist? | `pool_list` / `pool_get` |
| Which IPs in a pool are taken? | `pool_ips` |
| Who holds which address? | `lease_list` |
| Which devices have fixed addresses? | `reservation_list` |
| Which devices are blocked? | `blacklist_list` |
| What happened when a device tried to get an address? | `logs_query` |
| Which custom options are sent to a device? | `option_list` |
| What is this MAC's note? | `note_list` |

Read before writing. Before any write, confirm the current state with a read tool.

## Task recipes

### A. A device cannot get an IP

Narrow it down in order; each step may already answer the question. Do not start with raw logs.

1. `blacklist_list` filtered by the MAC — a blocked device receives **no** DHCP response at all, which is the most common cause
2. `dhcp_status` — if the service is stopped, nothing gets a lease
3. `logs_query mac=<mac> pageSize=20` — is the client's DISCOVER going unanswered, or is the REQUEST being NAKed?
4. `lease_list mac=<mac>` — did an old lease expire and fail to renew?
5. `pool_get` + `pool_ips` — is the pool full, `enabled=0`, or is the IP still in DECLINE cooldown?

The `server_response` field on NAK rows states the reason (not in pool, already leased, reservation mismatch). Quote it when explaining the failure.

### B. Give a new device a fixed address

1. `pool_list` — pick a pool with `enabled=1`; note `start_ip` / `end_ip`
2. `pool_ips` — choose an address with `status=free` (not `reserved` or `bound`)
3. `note_list mac=<mac>` — reuse an existing note as `description` if present
4. `reservation_create`
5. Verify with `reservation_list mac=<mac>`

If it returns `IP_LEASED_TO_OTHER`, another device currently holds that address. Pick a different one — do **not** release someone else's lease to make room.

### C. Expand an address pool

1. `dhcp_status` — check the pool's `percentage`
2. `pool_get id=<id>` — read the current values
3. Compute the new `end_ip`: still inside `subnet/netmask`, no overlap with other pools, and the pool must stay within 4096 addresses
4. `pool_update id=<id> end_ip=<new>`
5. `dhcp_status` again to confirm the new capacity

Before shrinking a range, verify no active lease sits in the portion being removed, or those devices will fail to renew.

### D. Temporarily block a device

`blacklist_add mac_address=<mac> reason="<why>"`, then remind the user to unblock it with `blacklist_remove`. Blocking removes all DHCP responses, so confirm with the user first.

## Hard constraints

- **Never call `service_stop`** unless the user explicitly asks to take DHCP down. Even then, restate the impact (every client will fail to renew) before doing it.
- **Never call `config_import`** unless the user supplied a file and approved each category to overwrite. It deletes existing rows first.
- Never delete a pool while it has active leases. The server returns 409 — do not work around it by deleting leases.
- Do not batch-delete reservations, blacklist entries or options. One at a time, each individually reversible.
- `netmask` is always dotted decimal (`255.255.255.0`), never `/24`.
- On a write failure, read `error.code` and `error.hint`, adjust, and retry at most twice. If the same error repeats, stop and ask.

## Stop and ask the user when

- The pool is full and cannot be expanded within the current subnet
- The change touches `server_ip` / `web_port` and would rebind the service
- A single action could affect many devices
- The request conflicts with the current state (for example deleting a pool that still has active leases)
