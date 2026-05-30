# FluxDHCP

> A lightweight, self-hosted DHCPv4 server with a modern web management UI.

[English](./README.md) | [中文](./README_CN.md)

## Features

- **Full DHCPv4 Protocol** - RFC 2131 compliant: DISCOVER/OFFER/REQUEST/ACK/NAK/RELEASE/DECLINE/INFORM
- **IP Pool Management** - Define subnets with start/end IP ranges, gateway, DNS servers, netmask, and per-pool lease times with overlap detection
- **Static Reservations** - Bind MAC addresses to specific IPs with random MAC generation and active lease conflict detection
- **Per-device DHCP Options** - Assign custom option codes/values per MAC address with 60+ translated option codes
- **Lease Lifecycle Tracking** - Full state machine: OFFERED/BOUND/RELEASED/EXPIRED with automatic expiry cleanup
- **DECLINE IP Blacklist** - Declined IPs are blocked from reassignment for a configurable duration (default 1 hour)
- **Packet Logger** - Logs all DHCP transactions with millisecond timestamps, direction (received/sent), raw options, yiaddr/siaddr/giaddr, vendor class, client ID, hostname, and fully localized server response messages
- **MAC Notes** - Dedicated management page for adding custom notes/labels to MAC addresses
- **Webhook Notifications** - Push DHCP events (ACK/RELEASE/etc.) to external services via HTTP POST/GET with template variables, SSRF-protected URLs
- **Web Dashboard** - Icon stat cards, overall IP usage bar, color-coded pool progress bars, and a timeline of recent events with consistent row heights
- **Config Import/Export** - Export all configuration to JSON with confirmation modal on import, optional lease/log clearing, and hot-reload
- **Log Retention** - Configurable automatic cleanup of old logs (default 90 days)
- **Responsive UI** - Mobile-friendly layout with drawer sidebar, responsive cards, and compact tables with horizontal scroll
- **Loading Splash Screen** - CSS-only splash screen eliminates flash of unstyled content during initial load
- **i18n Support** - Full English and Chinese localization including DHCP option codes, server response messages, and NAK reason codes
- **Docker Ready** - One-command deployment with Docker Compose

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, Ant Design 5 |
| Backend | Node.js custom server, UDP socket (port 67) |
| Database | SQLite via better-sqlite3 |
| Fonts | Self-hosted via next/font/google (DM Sans, JetBrains Mono) |
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
│   ├── app/
│   │   ├── layout.tsx       # Root layout with fonts and splash screen
│   │   ├── globals.css      # Global styles and responsive media queries
│   │   └── api/
│   │       ├── config/      # Config CRUD, import/export
│   │       ├── dhcp/        # DHCP start/stop/status
│   │       ├── pools/       # Pool management + IP grid
│   │       ├── leases/      # Lease management + release/delete
│   │       ├── reservations/# Static MAC-IP bindings + conflict check
│   │       ├── options/     # Per-device DHCP options
│   │       ├── webhooks/    # Webhook CRUD + test (SSRF-protected)
│   │       ├── logs/        # DHCP packet logs (ms precision)
│   │       ├── mac-notes/   # MAC note management
│   │       └── mac-info/    # MAC lookup across tables
│   ├── dhcp/
│   │   ├── protocol/        # Packet parser, serializer, constants
│   │   ├── lease-manager.ts # Lease lifecycle + log cleanup
│   │   ├── pool-manager.ts  # IP pool allocation + DECLINE blacklist
│   │   └── option-manager.ts# Per-device DHCP options
│   ├── db/                  # SQLite schema, migrations, init
│   └── lib/
│       ├── server-response.ts # Server response i18n (SR|TYPE|params format)
│       ├── url-validate.ts    # SSRF protection for webhook URLs
│       ├── mac-utils.ts       # MAC address normalization
│       ├── error-map.ts       # API error to i18n key mapping
│       └── format-time.ts     # Millisecond time formatting
├── components/
│   ├── AppLayout.tsx        # Sidebar, tabs with context menu, responsive drawer
│   ├── MacInput.tsx         # MAC address autocomplete with auto-uppercase
│   └── MacAddress.tsx       # Inline MAC display with note popover
├── i18n/en.json, zh.json    # Full localization (60+ DHCP option codes)
└── docker-compose.yml
```

## Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Stat cards with icons, IP usage bar, pool progress bars (hidden for disabled pools), recent event timeline |
| **Pools** | Address pool CRUD, IP grid visualization (auto-expanded, color-coded), expand/collapse all |
| **Leases** | Lease list with state filtering (ALL/BOUND/OFFERED/EXPIRED/RELEASED), sortable columns, distinct release/delete icons |
| **Reservations** | Static MAC-IP bindings, MAC autocomplete, random MAC, auto-fill from notes, active lease conflict detection |
| **Options** | Per-device DHCP option overrides, common option code dropdown |
| **MAC Notes** | MAC address labels and notes, sortable columns |
| **Webhooks** | Webhook CRUD, event subscription, template variables, custom headers, SSRF-protected URLs, test button |
| **Logs** | Millisecond timestamps, direction indicator, 60+ option code translations, column visibility selector, auto-refresh, MAC/IP autocomplete filters |
| **Settings** | DHCP service control, server config, T1/T2 with tooltips, log retention days, DECLINE blacklist duration, config import/export, clear logs |

## Config Import/Export

Export all configuration to a JSON file (excludes logs and leases). On import, a confirmation modal shows what will be replaced, with optional checkboxes to also clear leases and/or logs. The JSON includes:

- `config` - Server settings
- `pools` - Address pool definitions
- `reservations` - Static MAC-IP bindings
- `device_options` - Per-device DHCP options
- `webhooks` - Webhook configurations
- `mac_notes` - MAC address labels

DHCP config is automatically hot-reloaded after import (no service restart needed).

## Webhook Template Variables

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
