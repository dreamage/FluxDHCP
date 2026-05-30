# FluxDHCP

> A lightweight, self-hosted DHCPv4 server with a modern web management UI.

[English](./README.md) | [中文](./README_CN.md)

## Features

- **Full DHCPv4 Protocol** - RFC 2131 compliant: DISCOVER/OFFER/REQUEST/ACK/NAK/RELEASE/DECLINE/INFORM
- **IP Pool Management** - Define subnets with start/end IP ranges, gateway, DNS servers, netmask, and per-pool lease times with overlap detection
- **Static Reservations** - Bind MAC addresses to specific IPs with random MAC generation
- **Per-device DHCP Options** - Assign custom option codes/values per MAC address
- **Lease Lifecycle Tracking** - Full state machine: OFFERED/BOUND/RELEASED/EXPIRED with automatic expiry cleanup
- **DECLINE IP Blacklist** - Declined IPs are blocked from reassignment for a configurable duration (default 1 hour)
- **Packet Logger** - Logs all DHCP transactions with direction (received/sent), raw options, yiaddr/siaddr/giaddr, vendor class, client ID, hostname, and server responses
- **MAC Notes** - Dedicated management page for adding custom notes/labels to MAC addresses
- **Webhook Notifications** - Push DHCP events (ACK/RELEASE/etc.) to external services via HTTP POST/GET with template variables, SSRF-protected URLs
- **Web Dashboard** - Redesigned with icon stat cards, overall IP usage bar, color-coded pool progress bars, and a timeline of recent events
- **Config Import/Export** - Export all configuration to JSON (pools, reservations, options, webhooks, settings) and import with optional lease/log clearing
- **Log Retention** - Configurable automatic cleanup of old logs (default 90 days)
- **Responsive UI** - Mobile-friendly layout with drawer sidebar, responsive cards, and compact tables
- **i18n Support** - Full English and Chinese localization including DHCP option codes and server response messages
- **Docker Ready** - One-command deployment with Docker Compose

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, Ant Design 5 |
| Backend | Node.js custom server, UDP socket (port 67) |
| Database | SQLite via better-sqlite3 |
| i18n | next-intl |

## Quick Start

### Docker Compose (Recommended)

```bash
git clone https://github.com/dreamage/FluxDHCP.git
cd FluxDHCP
docker-compose up -d
```

Open `http://localhost:3000` in your browser.

### Manual Installation

```bash
git clone https://github.com/dreamage/FluxDHCP.git
cd FluxDHCP
npm install
npm run build
npm start
```

> **Note:** Binding UDP port 67 requires root/admin privileges.

### Development

```bash
npm install
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `./data/fluxdhcp.db` | SQLite database file path |
| `WEB_PORT` | `3000` | Web UI port |

## Project Structure

```
FluxDHCP
├── src/
│   ├── server.ts            # Entry point (HTTP + UDP server)
│   ├── app/                 # Next.js pages and API routes
│   │   └── api/
│   │       ├── config/      # Config CRUD, import/export
│   │       ├── dhcp/        # DHCP start/stop/status
│   │       ├── pools/       # Pool management + IP grid
│   │       ├── leases/      # Lease management + delete
│   │       ├── reservations/# Static MAC-IP bindings
│   │       ├── options/     # Per-device DHCP options
│   │       ├── webhooks/    # Webhook CRUD + test
│   │       ├── logs/        # DHCP packet logs
│   │       ├── mac-notes/   # MAC note management
│   │       └── mac-info/    # MAC lookup across tables
│   ├── dhcp/                # DHCP protocol implementation
│   │   ├── protocol/        # Packet parser, serializer, constants
│   │   ├── lease-manager.ts # Lease lifecycle + log cleanup
│   │   ├── pool-manager.ts  # IP pool allocation + blacklist
│   │   └── option-manager.ts# Per-device DHCP options
│   ├── db/                  # SQLite schema and initialization
│   └── lib/                 # Utilities and singleton instances
├── components/              # Shared React components (AppLayout, MacInput, etc.)
├── i18n/                    # Internationalization (en, zh)
├── data/                    # SQLite database storage
└── docker-compose.yml
```

## Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Stat cards (active leases, pools, reservations, 24h requests), IP usage bar, pool progress bars, recent event timeline |
| **Pools** | Address pool CRUD with IP grid visualization (color-coded: free/reserved/bound/offered) |
| **Leases** | Lease list with state filtering (ALL/BOUND/OFFERED/EXPIRED/RELEASED), sortable columns, release and delete actions |
| **Reservations** | Static MAC-IP bindings with MAC autocomplete, random MAC generation, auto-fill from MAC notes |
| **Options** | Per-device DHCP option overrides with common option code dropdown |
| **MAC Notes** | Dedicated page for managing MAC address labels and notes |
| **Webhooks** | Webhook CRUD with event subscription, template variables, custom headers, test button |
| **Logs** | DHCP packet logs with direction indicator, 60+ translated option codes, column visibility selector, auto-refresh, MAC/IP autocomplete filters |
| **Settings** | DHCP service control, server config, T1/T2 parameters, log retention, DECLINE blacklist duration, config import/export |

## Config Import/Export

Export all configuration to a JSON file (excludes logs and leases). On import, you can optionally clear all leases and/or logs. The JSON file includes:

- `config` - Server settings (IP, port, lease time, T1/T2 ratios, etc.)
- `pools` - Address pool definitions
- `reservations` - Static MAC-IP bindings
- `device_options` - Per-device DHCP option overrides
- `webhooks` - Webhook configurations
- `mac_notes` - MAC address labels

DHCP config is automatically hot-reloaded after import (no service restart needed).

## Webhook Template Variables

Webhook push fields support the following template variables:

| Variable | Description |
|----------|-------------|
| `{{mac_address}}` | Client MAC address |
| `{{ip_address}}` | Assigned IP address |
| `{{hostname}}` | Client hostname |
| `{{message_type}}` | DHCP message type (e.g. `dhcp_ack`) |
| `{{pool_name}}` | IP pool name |
| `{{mac_note}}` | Custom note for the MAC address |
| `{{timestamp}}` | ISO 8601 timestamp |

## License

This project is licensed under the [GNU Affero General Public License v3.0](./LICENSE).

You are free to use, modify, and distribute this software, but any modifications or derivative works **must also be open-sourced** under the AGPL-3.0 license.
