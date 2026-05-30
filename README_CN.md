# FluxDHCP

> 一个轻量级、可自托管的 DHCPv4 服务器，配备现代化的 Web 管理界面。

[English](./README.md) | [中文](./README_CN.md)

## 功能特性

- **完整的 DHCPv4 协议** - 符合 RFC 2131 标准：支持 DISCOVER/OFFER/REQUEST/ACK/NAK/RELEASE/DECLINE/INFORM 全部消息类型
- **IP 地址池管理** - 定义子网的起止 IP 范围、网关、DNS 服务器、子网掩码，支持按地址池设置租约时间，自动检测地址池重叠
- **静态地址绑定** - 将 MAC 地址绑定到指定 IP，支持随机 MAC 生成
- **设备级 DHCP 选项** - 按 MAC 地址分配自定义 DHCP 选项代码和值
- **租约生命周期追踪** - 完整状态机：OFFERED/BOUND/RELEASED/EXPIRED，自动清理过期租约
- **DECLINE IP 黑名单** - 客户端 DECLINE 的 IP 在可配置时长内不会被重新分配（默认 1 小时）
- **数据包日志** - 记录所有 DHCP 事务，包含方向（接收/发送）、原始选项、yiaddr/siaddr/giaddr、厂商类别、客户端 ID、主机名和服务器响应
- **MAC 备注管理** - 独立页面管理 MAC 地址的备注和标签
- **Webhook 通知** - 将 DHCP 事件（ACK/RELEASE 等）通过 HTTP POST/GET 推送到外部服务，支持模板变量，URL 经 SSRF 防护校验
- **Web 仪表盘** - 全新设计：图标统计卡片、总 IP 使用率进度条、彩色地址池进度条、最近事件时间线
- **配置导入导出** - 导出全部配置为 JSON（地址池、保留地址、设备选项、Webhook、设置），导入时可选清空租约和日志
- **日志自动清理** - 可配置的日志保留天数（默认 90 天），自动清理过期日志
- **响应式 UI** - 移动端友好：抽屉式侧边栏、响应式卡片、紧凑表格
- **国际化** - 完整的中英文支持，包括 DHCP 选项码和服务器响应消息翻译
- **Docker 一键部署** - 使用 Docker Compose 快速启动

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 15、React 19、Ant Design 5 |
| 后端 | Node.js 自定义服务器、UDP Socket（端口 67）|
| 数据库 | SQLite（better-sqlite3）|
| 国际化 | next-intl |

## 快速开始

### Docker Compose（推荐）

```bash
git clone https://github.com/dreamage/FluxDHCP.git
cd FluxDHCP
docker-compose up -d
```

在浏览器中打开 `http://localhost:3000`。

### 手动安装

```bash
git clone https://github.com/dreamage/FluxDHCP.git
cd FluxDHCP
npm install
npm run build
npm start
```

> **注意：** 绑定 UDP 67 端口需要 root/管理员权限。

### 开发模式

```bash
npm install
npm run dev
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DB_PATH` | `./data/fluxdhcp.db` | SQLite 数据库文件路径 |
| `WEB_PORT` | `3000` | Web 管理界面端口 |

## 项目结构

```
FluxDHCP
├── src/
│   ├── server.ts            # 入口文件（HTTP + UDP 服务器）
│   ├── app/                 # Next.js 页面和 API 路由
│   │   └── api/
│   │       ├── config/      # 配置读写、导入导出
│   │       ├── dhcp/        # DHCP 启动/停止/状态
│   │       ├── pools/       # 地址池管理 + IP 可视化
│   │       ├── leases/      # 租约管理 + 删除
│   │       ├── reservations/# 静态 MAC-IP 绑定
│   │       ├── options/     # 设备级 DHCP 选项
│   │       ├── webhooks/    # Webhook 管理 + 测试
│   │       ├── logs/        # DHCP 数据包日志
│   │       ├── mac-notes/   # MAC 备注管理
│   │       └── mac-info/    # MAC 地址信息查询
│   ├── dhcp/                # DHCP 协议实现
│   │   ├── protocol/        # 数据包解析器、序列化器、常量定义
│   │   ├── lease-manager.ts # 租约生命周期 + 日志清理
│   │   ├── pool-manager.ts  # IP 地址池分配 + 黑名单
│   │   └── option-manager.ts# 设备级 DHCP 选项管理
│   ├── db/                  # SQLite 数据库结构和初始化
│   └── lib/                 # 工具函数和单例实例
├── components/              # 共享 React 组件（AppLayout、MacInput 等）
├── i18n/                    # 国际化文件（英文、中文）
├── data/                    # SQLite 数据库存储
└── docker-compose.yml
```

## 页面说明

| 页面 | 说明 |
|------|------|
| **仪表盘** | 统计卡片（活跃租约、地址池、保留地址、24小时请求）、IP 使用率进度条、地址池使用率彩色进度条、最近事件时间线 |
| **地址池** | 地址池增删改查，IP 地址网格可视化（颜色区分：空闲/保留/已分配/已提供） |
| **租约** | 租约列表，支持状态筛选（全部/已绑定/已提供/已过期/已释放），可排序列，支持释放和删除操作 |
| **保留地址** | 静态 MAC-IP 绑定，MAC 地址自动补全，随机 MAC 生成，从 MAC 备注自动填充描述 |
| **设备选项** | 按设备的 DHCP 选项覆盖，常用选项码下拉选择 |
| **MAC 备注** | 独立页面管理 MAC 地址的备注标签，支持增删改查和排序 |
| **Webhook** | Webhook 增删改查，支持事件订阅、模板变量、自定义请求头、测试按钮 |
| **日志** | DHCP 数据包日志，显示方向标识，60+ DHCP 选项码翻译，列显示选择器，自动刷新，MAC/IP 自动补全搜索 |
| **设置** | DHCP 服务控制、服务器配置、T1/T2 参数、日志保留天数、DECLINE 黑名单时长、配置导入导出 |

## 配置导入导出

导出全部配置为 JSON 文件（不包含日志和租约）。导入时可选择是否清空所有租约和/或日志。JSON 文件包含：

- `config` - 服务器设置（IP、端口、租约时间、T1/T2 比例等）
- `pools` - 地址池定义
- `reservations` - 静态 MAC-IP 绑定
- `device_options` - 设备级 DHCP 选项覆盖
- `webhooks` - Webhook 配置
- `mac_notes` - MAC 地址备注

导入后 DHCP 配置自动热加载，无需重启服务。

## Webhook 模板变量

Webhook 推送字段支持以下模板变量：

| 变量 | 说明 |
|------|------|
| `{{mac_address}}` | 客户端 MAC 地址 |
| `{{ip_address}}` | 分配的 IP 地址 |
| `{{hostname}}` | 客户端主机名 |
| `{{message_type}}` | DHCP 消息类型（如 `dhcp_ack`）|
| `{{pool_name}}` | IP 地址池名称 |
| `{{mac_note}}` | MAC 地址的自定义备注 |
| `{{timestamp}}` | ISO 8601 时间戳 |

## 许可证

本项目基于 [GNU Affero 通用公共许可证 v3.0](./LICENSE) 开源。

你可以自由使用、修改和分发本软件，但任何修改或衍生作品**必须同样以 AGPL-3.0 许可证开源**。
