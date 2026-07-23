# FluxDHCP 产品需求文档 (PRD)

> 版本：1.0.0
> 日期：2026-04-30
> 状态：Draft

---

## 1. 项目概述

### 1.1 项目简介

FluxDHCP 是一个基于 Node.js 的 DHCP 服务器，提供完整的 DHCP 协议服务（自实现 RFC 2131/2132），并通过 Web 管理界面进行配置和监控。项目面向需要灵活、可编程 DHCP 服务的网络管理员和运维人员。

### 1.2 核心目标

- **完整的 DHCP 服务**：自行实现 DHCP 协议，支持 DORA 流程、RELEASE、DECLINE、INFORM
- **灵活的地址管理**：支持多地址池、保留地址、per-device 自定义 DHCP 选项
- **可观测性**：所有 DHCP 请求与响应完整记录日志，支持 Web 端实时查看
- **易部署**：Docker 一键部署（Linux），SQLite 零配置数据库

### 1.3 目标用户

- 企业网络管理员
- 家庭实验室用户
- 需要精细控制 DHCP 行为的运维工程师

---

## 2. 技术架构

### 2.1 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| DHCP 协议 | Node.js `dgram` + TypeScript | 自实现 RFC 2131/2132，不依赖第三方 DHCP 库 |
| Web 框架 | Next.js 15 (App Router) | API Routes + SSR 页面 |
| UI 组件 | Ant Design 5.x | CSS-in-JS 天然兼容 Next.js SSR |
| 国际化 | `next-intl` | 支持中文/英文，默认英文 |
| 数据库 | SQLite (`better-sqlite3`) | WAL 模式，单文件，映射到宿主机 |
| 语言 | TypeScript | 全栈类型安全 |
| 容器化 | Docker | `network_mode: host`，仅支持 Linux |

### 2.2 进程架构

单进程架构，Next.js Custom Server 集成 DHCP 服务，共享 SQLite 连接：

```
┌──────────────────────────────────────────────┐
│               Node.js 进程                    │
│                                              │
│  ┌─────────────────────────────────────┐     │
│  │         Next.js (TCP 3000)          │     │
│  │  ┌───────────┐  ┌────────────────┐  │     │
│  │  │ App Router │  │  API Routes   │  │     │
│  │  │  (页面SSR) │  │  (/api/*)     │  │     │
│  │  └───────────┘  └────────────────┘  │     │
│  └─────────────────────────────────────┘     │
│                                              │
│  ┌─────────────────────────────────────┐     │
│  │       DHCP Server (UDP 67)          │     │
│  │  ┌──────────┐  ┌─────────────────┐  │     │
│  │  │ Protocol │  │  PoolManager    │  │     │
│  │  │ (RFC实现) │  │  (多地址池)     │  │     │
│  │  ├──────────┤  ├─────────────────┤  │     │
│  │  │ LeaseMgr │  │  OptionManager  │  │     │
│  │  │ (租约)   │  │  (per-device)   │  │     │
│  │  ├──────────┤  ├─────────────────┤  │     │
│  │  │ PktLogger│  │  EventEmitter   │  │     │
│  │  │ (日志)   │  │  (事件广播)     │  │     │
│  │  └──────────┘  └─────────────────┘  │     │
│  └─────────────────────────────────────┘     │
│                                              │
│  ┌─────────────────────────────────────┐     │
│  │    SQLite (better-sqlite3)          │     │
│  │    /data/fluxdhcp.db                │     │
│  └─────────────────────────────────────┘     │
└──────────────────────────────────────────────┘
```

**单进程选择理由**：
- SQLite 是单写模型，单进程避免写冲突
- `better-sqlite3` 同步 API 天然适配单进程
- 无 IPC 开销，DHCP 事件可直接通过 EventEmitter 传递给 WebSocket

### 2.3 项目文件结构

```
FluxDHCP/
├── docs/
│   └── PRD.md                      # 本文档
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # 根布局（Ant Design Provider）
│   │   ├── page.tsx                # 首页 → 重定向到 /dashboard
│   │   ├── dashboard/
│   │   │   └── page.tsx            # 仪表盘
│   │   ├── pools/
│   │   │   └── page.tsx            # 地址池管理
│   │   ├── reservations/
│   │   │   └── page.tsx            # 保留地址管理
│   │   ├── leases/
│   │   │   └── page.tsx            # 租约管理
│   │   ├── options/
│   │   │   └── page.tsx            # 设备选项管理
│   │   ├── logs/
│   │   │   └── page.tsx            # 日志查看
│   │   ├── settings/
│   │   │   └── page.tsx            # 系统设置
│   │   └── api/
│   │       ├── dashboard/
│   │       │   └── route.ts
│   │       ├── pools/
│   │       │   └── route.ts
│   │       ├── pools/[id]/
│   │       │   └── route.ts
│   │       ├── reservations/
│   │       │   └── route.ts
│   │       ├── reservations/[id]/
│   │       │   └── route.ts
│   │       ├── leases/
│   │       │   └── route.ts
│   │       ├── leases/[ip]/
│   │       │   └── route.ts
│   │       ├── options/
│   │       │   └── route.ts
│   │       ├── options/[id]/
│   │       │   └── route.ts
│   │       ├── logs/
│   │       │   └── route.ts
│   │       └── config/
│   │           └── route.ts
│   ├── dhcp/                       # DHCP 协议实现
│   │   ├── server.ts               # DHCP 服务器主类
│   │   ├── protocol/
│   │   │   ├── constants.ts        # 协议常量（端口、消息类型、选项码）
│   │   │   ├── parser.ts           # 数据包解析 (Buffer → Object)
│   │   │   ├── serializer.ts       # 数据包构造 (Object → Buffer)
│   │   │   └── options.ts          # DHCP 选项定义与编解码
│   │   ├── pool-manager.ts         # 多地址池 IP 分配
│   │   ├── lease-manager.ts        # 租约管理（分配、续约、释放、过期）
│   │   ├── option-manager.ts       # per-device DHCP 选项解析
│   │   └── packet-logger.ts        # DHCP 包日志记录
│   ├── db/                         # 数据库层
│   │   ├── index.ts                # 数据库初始化、连接
│   │   └── schema.ts               # 建表语句
│   ├── lib/                        # 共享工具
│   │   ├── dhcp-instance.ts        # DHCP 服务器单例
│   │   └── db-instance.ts          # 数据库单例
│   └── server.ts                   # Next.js Custom Server 入口
├── components/                     # React 共享组件
│   └── AntdProvider.tsx            # Ant Design SSR Provider
├── i18n/                           # 国际化
│   ├── en.json                     # 英文翻译（默认）
│   └── zh.json                     # 中文翻译
├── package.json
├── tsconfig.json
├── next.config.ts
├── Dockerfile
├── docker-compose.yml
└── .gitignore
```

---

## 3. DHCP 协议实现规格

### 3.1 数据包格式（RFC 2131）

```
偏移量   大小    字段           描述
------   ----    ----           ----
0        1       op             1=BOOTREQUEST(客户端→服务器), 2=BOOTREPLY(服务器→客户端)
1        1       htype          硬件地址类型: 1=10MB以太网
2        1       hlen           硬件地址长度: 6=以太网
3        1       hops           中继跳数
4        4       xid            事务ID（大端序）
8        2       secs           客户端获取地址后经过秒数
10       2       flags          标志位（bit15=广播标志）
12       4       ciaddr         客户端IP
16       4       yiaddr         服务器分配的IP
20       4       siaddr         下一个引导服务器IP
24       4       giaddr         中继代理IP
28       16      chaddr         客户端硬件地址（6字节MAC + 10字节零填充）
44       64      sname          服务器主机名
108      128     file           引导文件名
236      4       magic cookie   固定值 0x63825363
240      可变    options        DHCP选项（TLV格式）
```

最小数据包长度：576 字节。

### 3.2 DHCP 选项格式（RFC 2132）

TLV 编码：`Code(1字节) + Length(1字节) + Value(Length字节)`

特殊选项：
- 选项 0 (Pad)：仅 1 字节 Code，无 Length/Value
- 选项 255 (End)：仅 1 字节 Code，无 Length/Value

**关键选项定义**：

| Code | 名称 | 值类型 | 说明 |
|------|------|--------|------|
| 1 | Subnet Mask | IP (4字节) | 子网掩码 |
| 3 | Router | IP列表 (4×N字节) | 默认网关 |
| 6 | DNS Server | IP列表 (4×N字节) | DNS 服务器 |
| 12 | Host Name | ASCII | 客户端主机名 |
| 15 | Domain Name | ASCII | 域名 |
| 28 | Broadcast Address | IP (4字节) | 广播地址 |
| 50 | Requested IP | IP (4字节) | 客户端请求的IP |
| 51 | Lease Time | UInt32 (大端) | 租约时间（秒） |
| 53 | DHCP Message Type | UInt8 | 1-8 消息类型 |
| 54 | Server Identifier | IP (4字节) | 服务器IP |
| 55 | Parameter Request List | UInt8数组 | 客户端请求的选项列表 |
| 58 | Renewal Time (T1) | UInt32 (大端) | 续约时间 |
| 59 | Rebinding Time (T2) | UInt32 (大端) | 重绑定时间 |
| 60 | Vendor Class ID | ASCII | 厂商类别标识 |
| 61 | Client Identifier | UInt8数组 | 客户端标识 |

### 3.3 消息类型与 DORA 流程

```
客户端                          服务器
  |                                |
  |--- DHCPDISCOVER (广播) ------->|  op=1, xid=随机, ciaddr=0
  |                                |  chaddr=MAC, option53=1
  |                                |
  |<-- DHCPOFFER -----------------|  op=2, xid=同上, yiaddr=分配IP
  |                                |  option53=2, option54=服务器IP
  |                                |  option51=租约, option1=掩码
  |                                |
  |--- DHCPREQUEST (广播) ------->|  op=1, xid=同上
  |                                |  option53=3, option50=请求IP
  |                                |  option54=选中的服务器IP
  |                                |
  |<-- DHCPACK -------------------|  op=2, yiaddr=分配IP
  |                                |  option53=5, 完整配置选项
  |         或                      |
  |<-- DHCPNAK -------------------|  op=2, option53=6
  |                                |
```

### 3.4 完整消息类型支持

| 类型 | Code | 方向 | 处理逻辑 |
|------|------|------|---------|
| DHCPDISCOVER | 1 | 客户端→服务器 | 查找匹配地址池，分配IP，回复 DHCPOFFER |
| DHCPOFFER | 2 | 服务器→客户端 | 构造包含分配IP和配置选项的响应 |
| DHCPREQUEST | 3 | 客户端→服务器 | 验证请求（ServerID/RequestedIP），回复 ACK 或 NAK |
| DHCPDECLINE | 4 | 客户端→服务器 | 标记IP为冲突，释放租约，记录日志 |
| DHCPACK | 5 | 服务器→客户端 | 确认租约，持久化到数据库 |
| DHCPNAK | 6 | 服务器→客户端 | 拒绝请求（IP不在范围内/已分配/租约过期） |
| DHCPRELEASE | 7 | 客户端→服务器 | 释放租约，更新数据库状态 |
| DHCPINFORM | 8 | 客户端→服务器 | 客户端已有IP，仅请求配置选项，回复 ACK |

### 3.5 广播/单播响应规则

```
if (giaddr !== '0.0.0.0')       → 单播给 giaddr:67（中继代理转发）
else if (flags & 0x8000)        → 广播给 255.255.255.255:68
else if (ciaddr !== '0.0.0.0')  → 单播给 ciaddr:68
else                             → 广播给 255.255.255.255:68
```

### 3.6 IP 分配逻辑

```
收到 DHCPDISCOVER/DHCPREQUEST:
  0. 检查 DHCP 服务是否启动 → 未启动则忽略请求
  1. 检查保留地址表 → MAC 匹配且所属地址池已启用则返回保留IP
  2. 检查现有租约   → MAC 匹配且所属地址池已启用则返回相同IP（续约）
  3. 检查 Requested IP → 在某已启用的地址池范围内且未占用则分配
  4. 动态分配       → 遍历所有启用的地址池，找第一个可用IP
  5. 无可用IP       → 不回复（DISCOVER）/ 回复 NAK（REQUEST）

注：禁用的地址池在步骤 1-4 中均被跳过，但其已有租约数据保留在数据库中
```

### 3.7 租约生命周期

```
T1 (Renewal):   默认 leaseTime × 0.5   (50%后单播续约)
T2 (Rebinding): 默认 leaseTime × 0.875 (87.5%后广播续约)
Expiry:         leaseTime 到期

  0%        50%           87.5%        100%
  |----------|--------------|------------|
  BOUND    RENEWING     REBINDING     EXPIRED
```

服务端定时清理：每 60 秒扫描一次过期租约，将状态更新为 EXPIRED。

---

## 4. 功能需求

### 4.1 DHCP 服务器功能

#### 4.1.1 多地址池管理

- 支持创建多个独立的 IP 地址池（每个地址池对应一个 DHCP 网段）
- 每个地址池包含：名称、子网、掩码、起始IP、结束IP、默认网关、DNS 服务器、租约时间
- **每个地址池支持独立的启用/禁用开关**，禁用后该网段不再响应 DHCP 请求
- 地址池之间 IP 范围不可重叠（创建/修改时校验）
- 禁用地址池不影响已分配的租约，但不再接受新的分配请求
- 启用/禁用状态变更实时生效，无需重启 DHCP 服务

#### 4.1.2 保留地址

- 基于 MAC 地址绑定固定 IP（MAC-IP 一对一）
- 保留地址必须在某个地址池范围内
- 保留地址优先级高于动态分配
- 保留地址可关联 hostname 和描述信息
- 保留地址可启用/禁用

#### 4.1.3 Per-Device DHCP 选项

- 可为特定 MAC 地址设置自定义 DHCP 选项
- 自定义选项覆盖地址池默认值
- 支持所有标准 DHCP 选项码（1-254）
- 常用选项提供友好名称（如 option 3 = "Router/Gateway"）
- 自定义选项值为字符串格式，按选项类型解析

**典型场景**：某设备需要与默认网关不同的另一个网关
```
地址池 A 默认网关: 192.168.1.1
设备 AA:BB:CC:DD:EE:FF 自定义 option 3 (Router): 192.168.1.254
→ 该设备 DHCPACK 中 router 选项为 192.168.1.254
```

#### 4.1.4 完整日志记录

- 记录所有 DHCP 消息（DISCOVER/OFFER/REQUEST/ACK/NAK/RELEASE/DECLINE/INFORM）
- 每条日志包含：
  - 时间戳
  - 消息类型
  - 客户端 MAC 地址
  - 客户端/分配 IP
  - 请求的 IP（option 50）
  - 主机名（option 12）
  - 客户端标识（option 61）
  - 厂商类别（option 60）
  - 事务 ID（xid）
  - 完整 DHCP 选项（JSON 格式）
  - 服务端响应摘要
- 日志支持按时间范围、消息类型、MAC 地址、IP 地址筛选
- 日志支持分页浏览
- 日志可导出（后续版本）

#### 4.1.5 租约管理

- 实时跟踪所有活跃租约
- 租约状态：OFFERED → BOUND → RELEASED / EXPIRED
- 支持手动释放租约
- 租约信息：IP、MAC、hostname、状态、租约开始/结束时间、所属地址池
- 服务启动时从数据库恢复租约状态

#### 4.1.6 DHCP 服务整体启停

- DHCP 服务支持整体启动/停止，停止后 **Web 管理端仍正常运行**
- 停止 DHCP 服务时：关闭 UDP 67 端口监听，不再响应任何 DHCP 请求，所有地址池停止服务
- 启动 DHCP 服务时：重新绑定 UDP 67 端口，根据各地址池启用状态恢复服务
- DHCP 服务状态在 Web 端实时显示（运行中 / 已停止）
- 服务启停操作记录日志
- 停止 DHCP 服务不影响：Web 管理端访问、数据库读写、历史日志查看、配置修改

### 4.2 Web 管理端功能

#### 4.2.1 仪表盘 (Dashboard)

- 总览统计卡片：
  - 活跃租约数 / 总可用IP数
  - 地址池数量
  - 保留地址数量
  - 24小时内 DHCP 请求量
- 各地址池使用率进度条
- 最近 10 条 DHCP 事件
- 简易流量趋势图（24小时请求量）

#### 4.2.2 地址池管理 (Pools)

- 地址池列表（表格）：名称、子网、IP范围、网关、DNS、租约时间、状态、使用率
- 新增地址池：表单填写所有字段，提交时校验 IP 范围不重叠，默认启用
- 编辑地址池：修改除 IP 范围外的字段（IP 范围修改需确认影响）
- 删除地址池：确认弹窗，若存在活跃租约需额外确认
- **独立的启用/禁用开关**：每个地址池可单独启用或禁用，禁用后该网段不响应 DHCP 请求，但保留配置和已有租约

#### 4.2.3 保留地址管理 (Reservations)

- 保留地址列表：MAC、IP、hostname、所属地址池、描述、状态
- 新增保留地址：MAC 地址输入（支持格式自动校正 AA:BB:CC:DD:EE:FF）、IP 地址选择（下拉选择地址池后输入 IP）、hostname、描述
- 编辑保留地址
- 删除保留地址
- 启用/禁用切换

#### 4.2.4 租约管理 (Leases)

- 租约列表：IP、MAC、hostname、状态、租约开始/结束、所属地址池
- 状态筛选：全部 / BOUND / OFFERED / EXPIRED
- 手动释放租约（确认弹窗）
- 租约详情查看

#### 4.2.5 设备选项管理 (Options)

- 设备选项列表：MAC 地址、选项码、选项名称、选项值
- 按 MAC 地址分组显示
- 新增选项：输入 MAC、选择选项码（下拉，含常用选项友好名称）或输入自定义选项码、输入选项值
- 编辑选项值
- 删除选项

#### 4.2.6 日志查看 (Logs)

- 日志列表：时间、类型（彩色标签）、MAC、IP、hostname
- 筛选条件：时间范围、消息类型、MAC 地址、IP 地址
- 分页浏览
- 点击行展开详情：完整 DHCP 选项 JSON、服务端响应
- 自动刷新（可开关，默认 5 秒）

#### 4.2.7 国际化 (i18n)

- 支持中文和英文两种语言，**默认英文**
- 语言切换入口：顶部 Header 右侧语言选择器（下拉菜单，显示语言名称）
- 语言偏好存储在浏览器 localStorage，切换后即时生效，无需刷新
- 所有页面文本、按钮、提示信息、错误消息均需翻译
- Ant Design 组件内置国际化（ConfigProvider locale 切换）
- 后端 API 返回的数据（如消息类型名称）无需翻译，前端根据语言显示对应文本
- DHCP 日志中的消息类型标签前端根据当前语言显示名称

#### 4.2.8 系统设置 (Settings)

- DHCP 服务器配置：
  - 服务器 IP 地址
  - 监听接口
  - 默认租约时间
  - T1/T2 比例
  - **Web 管理端口**（默认 3000，可修改，修改后需重启服务生效）
  - **界面语言**（English / 中文，默认 English）
- DHCP 服务整体启动/停止（停止后 Web 管理端仍可正常使用）
- DHCP 服务运行状态显示
- 数据库信息：文件路径、大小、租约数、日志数
- 日志清理：按时间范围清理日志
- 导出配置（后续版本）

---

## 5. 数据库 Schema

### 5.1 表结构

```sql
-- 地址池
CREATE TABLE pools (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  subnet      TEXT    NOT NULL,           -- e.g. "192.168.1.0"
  netmask     TEXT    NOT NULL,           -- e.g. "255.255.255.0"
  start_ip    TEXT    NOT NULL,
  end_ip      TEXT    NOT NULL,
  gateway     TEXT,                       -- 默认网关
  dns_servers TEXT,                       -- JSON array: '["8.8.8.8","8.8.4.4"]'
  lease_time  INTEGER DEFAULT 86400,      -- 租约时间（秒）
  enabled     INTEGER DEFAULT 1,
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
);

-- 保留地址
CREATE TABLE reservations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mac_address TEXT    NOT NULL UNIQUE,
  ip_address  TEXT    NOT NULL UNIQUE,
  hostname    TEXT,
  pool_id     INTEGER REFERENCES pools(id),
  description TEXT,
  enabled     INTEGER DEFAULT 1,
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
);

-- Per-device DHCP 选项
CREATE TABLE device_options (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  mac_address  TEXT    NOT NULL,
  option_code  INTEGER NOT NULL,
  option_value TEXT    NOT NULL,
  option_name  TEXT,
  created_at   TEXT    DEFAULT (datetime('now')),
  UNIQUE(mac_address, option_code)
);

-- 租约
CREATE TABLE leases (
  ip_address   TEXT PRIMARY KEY,
  mac_address  TEXT NOT NULL,
  hostname     TEXT,
  state        TEXT NOT NULL DEFAULT 'OFFERED',  -- OFFERED, BOUND, RELEASED, EXPIRED
  pool_id      INTEGER REFERENCES pools(id),
  lease_start  TEXT,
  lease_end    TEXT,
  client_id    TEXT,
  vendor_class TEXT,
  requested_ip TEXT,
  xid          TEXT
);

-- DHCP 包日志
CREATE TABLE logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp       TEXT    DEFAULT (datetime('now')),
  message_type    INTEGER NOT NULL,   -- 1=DISCOVER, 2=OFFER, 3=REQUEST, 4=DECLINE, 5=ACK, 6=NAK, 7=RELEASE, 8=INFORM
  client_mac      TEXT    NOT NULL,
  client_ip       TEXT,
  requested_ip    TEXT,
  hostname        TEXT,
  client_id       TEXT,
  vendor_class    TEXT,
  xid             TEXT,
  raw_options     TEXT,               -- JSON: 完整 DHCP 选项
  pool_id         INTEGER,
  server_response TEXT                -- 服务端响应摘要
);

-- 全局配置
CREATE TABLE config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 5.2 索引

```sql
CREATE INDEX idx_reservations_mac ON reservations(mac_address);
CREATE INDEX idx_reservations_ip  ON reservations(ip_address);
CREATE INDEX idx_reservations_pool ON reservations(pool_id);
CREATE INDEX idx_device_options_mac ON device_options(mac_address);
CREATE INDEX idx_leases_mac   ON leases(mac_address);
CREATE INDEX idx_leases_state ON leases(state);
CREATE INDEX idx_leases_end   ON leases(lease_end);
CREATE INDEX idx_leases_pool  ON leases(pool_id);
CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_mac      ON logs(client_mac);
CREATE INDEX idx_logs_type     ON logs(message_type);
```

### 5.3 初始配置数据

```sql
INSERT INTO config (key, value) VALUES
  ('server_ip', '0.0.0.0'),
  ('listen_interface', '0.0.0.0'),
  ('default_lease_time', '86400'),
  ('t1_ratio', '0.5'),
  ('t2_ratio', '0.875'),
  ('dhcp_enabled', '1'),
  ('web_port', '3000'),
  ('dhcp_log_retention_days', '30');
```

---

## 6. API 设计

### 6.1 仪表盘

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dashboard` | 统计数据：活跃租约数、地址池使用率、24h请求数、最近事件 |

**响应示例**：
```json
{
  "activeLeases": 42,
  "totalIPs": 254,
  "poolCount": 3,
  "reservationCount": 10,
  "requests24h": 256,
  "poolUsage": [
    { "poolId": 1, "name": "Office", "used": 30, "total": 100, "percentage": 30 }
  ],
  "recentEvents": [
    { "timestamp": "...", "type": "ACK", "mac": "AA:BB:CC:DD:EE:FF", "ip": "192.168.1.100" }
  ]
}
```

### 6.2 地址池

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/pools` | 列表（含使用率统计） |
| POST | `/api/pools` | 创建（校验 IP 范围不重叠） |
| GET | `/api/pools/:id` | 详情 |
| PUT | `/api/pools/:id` | 更新 |
| DELETE | `/api/pools/:id` | 删除（确认存在活跃租约影响） |

**POST 请求体**：
```json
{
  "name": "Office",
  "subnet": "192.168.1.0",
  "netmask": "255.255.255.0",
  "start_ip": "192.168.1.10",
  "end_ip": "192.168.1.200",
  "gateway": "192.168.1.1",
  "dns_servers": ["8.8.8.8", "8.8.4.4"],
  "lease_time": 86400
}
```

### 6.3 保留地址

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/reservations` | 列表 |
| POST | `/api/reservations` | 创建（校验 MAC 唯一、IP 唯一、IP 在地址池范围内） |
| PUT | `/api/reservations/:id` | 更新 |
| DELETE | `/api/reservations/:id` | 删除 |

**POST 请求体**：
```json
{
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "ip_address": "192.168.1.50",
  "hostname": "printer-1",
  "pool_id": 1,
  "description": "3楼会议室打印机"
}
```

### 6.4 租约

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/leases` | 列表（支持 state 筛选参数） |
| DELETE | `/api/leases/:ip` | 手动释放租约 |

**GET 查询参数**：`?state=BOUND&page=1&pageSize=20`

### 6.5 设备选项

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/options` | 列表（支持 mac_address 筛选） |
| POST | `/api/options` | 创建（校验 mac+code 唯一） |
| PUT | `/api/options/:id` | 更新 |
| DELETE | `/api/options/:id` | 删除 |

**POST 请求体**：
```json
{
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "option_code": 3,
  "option_value": "192.168.1.254",
  "option_name": "Router"
}
```

### 6.6 日志

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/logs` | 日志列表（分页 + 多条件筛选） |

**GET 查询参数**：
- `page` / `pageSize` — 分页
- `messageType` — 消息类型筛选 (1-8)
- `mac` — MAC 地址筛选
- `ip` — IP 地址筛选
- `startTime` / `endTime` — 时间范围 (ISO 8601)

**响应示例**：
```json
{
  "total": 1523,
  "page": 1,
  "pageSize": 20,
  "data": [
    {
      "id": 1,
      "timestamp": "2026-04-30T10:00:00Z",
      "messageType": 5,
      "messageTypeName": "DHCPACK",
      "clientMac": "AA:BB:CC:DD:EE:FF",
      "clientIp": "192.168.1.100",
      "hostname": "device-1",
      "rawOptions": { "53": 5, "54": "192.168.1.1", "1": "255.255.255.0" },
      "serverResponse": "Assigned 192.168.1.100 from pool Office"
    }
  ]
}
```

### 6.7 全局配置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 获取所有配置项 |
| PUT | `/api/config` | 批量更新配置项 |

### 6.8 DHCP 服务控制

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/dhcp/start` | 启动 DHCP 服务 |
| POST | `/api/dhcp/stop` | 停止 DHCP 服务 |
| GET | `/api/dhcp/status` | 获取服务运行状态 |

---

## 7. 前端页面设计

### 7.1 通用布局

- 左侧固定侧边栏导航（可折叠）
- 顶部 Header 显示：项目名称、DHCP 服务状态指示灯、**语言切换器（English / 中文）**
- 内容区域自适应

### 7.2 页面清单

| 路由 | 页面 | 核心组件 |
|------|------|---------|
| `/dashboard` | 仪表盘 | StatisticCard, Progress, Timeline, Chart |
| `/pools` | 地址池管理 | Table, Modal(Form), Switch, Popconfirm |
| `/reservations` | 保留地址管理 | Table, Modal(Form), Switch, Popconfirm |
| `/leases` | 租约管理 | Table, Tag, Select(筛选), Popconfirm |
| `/options` | 设备选项管理 | Table, Modal(Form), Collapse(MAC分组) |
| `/logs` | 日志查看 | Table, DatePicker, Select, Input, Switch(自动刷新) |
| `/settings` | 系统设置 | Form, InputNumber, Button, Descriptions |

### 7.3 Ant Design 组件使用

- **表格**：`Table` 组件，支持排序、分页、行展开
- **表单**：`Form` + `Modal` 组合，创建/编辑共用弹窗
- **状态指示**：`Tag`（租约状态、消息类型）、`Badge`（服务状态）
- **确认操作**：`Popconfirm`（删除、释放）、`Modal.confirm`（有影响的操作）
- **数据展示**：`Statistic`（统计卡片）、`Progress`（使用率）
- **布局**：`Layout` + `Sider` + `Menu`

---

## 8. Docker 部署方案

### 8.1 Dockerfile（多阶段构建）

```dockerfile
# ===== Stage 1: 安装依赖 =====
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm ci

# ===== Stage 2: 构建 =====
FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build

# ===== Stage 3: 生产镜像 =====
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV DB_PATH=/data/fluxdhcp.db
ENV NEXT_TELEMETRY_DISABLED=1
ENV WEB_PORT=3000

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制 standalone 构建产物
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# SQLite 数据目录
RUN mkdir -p /data && chown nextjs:nodejs /data
VOLUME /data

USER nextjs

# Web 端口默认 3000，可通过 WEB_PORT 环境变量修改
# DHCP 固定使用 UDP 67
EXPOSE 3000/tcp 67/udp

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

> 注意：生产镜像中绑定 UDP 67 端口需要 `NET_ADMIN` capability 或 root 用户，根据实际部署情况可能需要调整 USER。

### 8.2 docker-compose.yml

```yaml
version: "3.8"

services:
  fluxdhcp:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: fluxdhcp
    restart: unless-stopped
    network_mode: host          # DHCP 广播需要 host 网络
    cap_add:
      - NET_ADMIN               # 绑定 UDP 67 权限
    volumes:
      - ./data:/data            # SQLite 数据库持久化
    environment:
      - DB_PATH=/data/fluxdhcp.db
      - NEXT_TELEMETRY_DISABLED=1
```

### 8.3 关键说明

**为什么使用 `network_mode: host`**：
- DHCP 使用广播（255.255.255.255）通信
- Docker bridge 网络的端口映射（`-p 67:67/udp`）仅转发单播，**不转发广播包**
- host 网络模式下容器直接共享宿主机网络栈，广播正常工作
- 此模式仅适用于 Linux

**为什么需要 `NET_ADMIN` capability**：
- 绑定 UDP 67（特权端口 < 1024）需要 CAP_NET_BIND_SERVICE
- 发送广播数据包需要 CAP_NET_BROADCAST
- `NET_ADMIN` 包含以上能力

**SQLite 持久化**：
- 数据库文件位于 `/data/fluxdhcp.db`
- WAL 模式会产生额外文件：`fluxdhcp.db-wal` 和 `fluxdhcp.db-shm`
- 这些文件必须在同一卷上（Docker volume 挂载已保证）
- 宿主机目录 `./data` 映射到容器 `/data`

---

## 9. 非功能需求

### 9.1 性能

- 单地址池至少支持 1000 个并发租约
- DHCP 响应延迟 < 50ms（局域网内）
- Web API 响应时间 < 200ms（P95）
- SQLite WAL 模式确保高并发读取不阻塞 DHCP 写入
- 日志表定期清理（默认保留 30 天）避免数据库膨胀

### 9.2 可靠性

- 服务重启后从数据库恢复租约状态
- DHCP 服务异常时自动重启（进程级别）
- 数据库写入使用事务保证一致性
- WAL 模式 + `synchronous=NORMAL` 在性能和数据安全间平衡

### 9.3 安全性

- Web 管理端仅监听内网（部署层面通过防火墙控制）
- DHCP 选项值输入校验（防止注入）
- API 输入参数校验（MAC 格式、IP 格式、范围校验）
- Docker 容器以非 root 用户运行（Web 部分）
- 日志不记录敏感信息

### 9.4 可观测性

- DHCP 服务状态（运行/停止）实时展示在 Web 端
- 所有 DHCP 包完整记录到数据库和 stdout
- 关键操作日志（启动、停止、配置变更）记录
- 错误日志包含堆栈信息，便于排查

### 9.5 兼容性

- DHCP 协议兼容 RFC 2131/2132 标准
- 兼容主流操作系统 DHCP 客户端（Windows、macOS、Linux、Android、iOS）
- 支持中继代理（giaddr 字段）
- Web 管理端兼容现代浏览器（Chrome、Firefox、Safari、Edge 最新 2 个主版本）

---

## 10. 里程碑

### M1：核心框架搭建

- 项目初始化（Next.js + TypeScript + Ant Design）
- 数据库初始化和 Schema 创建
- DHCP 协议核心实现（parser + serializer + constants）
- Next.js Custom Server 集成 DHCP 模块
- 基本页面布局

### M2：DHCP 服务器功能

- DHCP Server 主类（dgram socket + DORA 流程）
- PoolManager（多地址池 IP 分配）
- LeaseManager（租约分配、续约、释放、过期）
- OptionManager（per-device DHCP 选项）
- PacketLogger（完整日志记录）
- DHCP 服务启动/停止控制

### M3：Web 管理端

- 仪表盘页面
- 地址池 CRUD 页面
- 保留地址 CRUD 页面
- 租约管理页面
- 设备选项 CRUD 页面
- 日志查看页面（筛选、分页、详情）
- 系统设置页面

### M4：Docker 部署 & 完善

- Dockerfile 多阶段构建
- docker-compose.yml
- 端到端测试
- 错误处理完善
- 文档完善
