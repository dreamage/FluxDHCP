# FluxDHCP 运维手册（中文参考）

> 这是 `SKILL.md` 的中文对照版，供人阅读。Agent 实际加载的是 `SKILL.md`（英文），因为 MCP 工具描述也是英文，保持同一语言可以减少歧义。

这套流程假设 `fluxdhcp` MCP server 已连接。没连上时先让用户配置 `FLUXDHCP_URL` 和 `FLUXDHCP_API_KEY`，不要试图用 curl 绕过。

服务端不接受匿名请求。任何工具返回 `AUTH_REQUIRED` 都说明 key 没配好——让用户到 **设置 → API 访问** 创建一把，不要改用其他方式发请求。

## 凭据策略

- 默认使用**只读 key**。只读能完成排查类任务的全部工作。
- 只有用户明确要求“改配置 / 加保留 / 封 MAC / 扩容”时才需要写权限；遇到 `API_KEY_READ_ONLY` 就停下来告诉用户换 key，不要自己想办法绕过。
- 不要在回复、日志或提交里出现 key 明文。

## 工具速查

| 想知道什么 | 用什么 |
|---|---|
| 服务是否在跑、池用了多少、24h 请求量 | `dhcp_status` |
| 这台设备是谁、现在拿了什么 IP | `mac_info` |
| 有哪些地址池、当前配置是什么 | `pool_list` / `pool_get` / `config_get` |
| 池里哪些 IP 被占了 | `pool_ips` |
| 谁拿了什么地址 | `lease_list` |
| 谁被固定了地址 | `reservation_list` |
| 谁被封了 | `blacklist_list` |
| 设备拿不到地址的原始过程 | `logs_query` |
| 给某台设备下发的自定义选项 | `option_list` |
| 设备备注 | `note_list` |
| 某个 webhook 为什么没发出去 | `webhook_deliveries` |

先读后写。任何写操作前，先用读工具确认当前状态。

## 任务配方

### A. 某台设备拿不到 IP

按顺序收敛，每一步都可能直接给出答案，不要一上来就查日志。

先用 `mac_info mac=<mac>`：一次调用就能拿到它当前是保留还是租约、属于哪个池、主机名和备注。

1. `blacklist_list` 过滤该 MAC —— 被封的设备**完全收不到响应**，这是最常见原因
2. `dhcp_status` —— 服务停了的话所有设备都拿不到
3. `logs_query mac=<mac> pageSize=20` —— 看最后几条是 DISCOVER 无应答，还是 REQUEST 被 NAK
4. `lease_list mac=<mac>` —— 是否有 EXPIRED 后没续上
5. `pool_get` + `pool_ips` —— 池是否已满、是否 `enabled=0`、该 IP 是否在 DECLINE 冷却期

`logs_query` 里 NAK 的 `server_response` 会写明原因（不在池内、已被占用、保留地址不匹配等），直接引用它解释给用户。

### B. 给新设备分配固定 IP

1. `pool_list` 选一个 `enabled=1` 的池，注意 `start_ip`/`end_ip`
2. `pool_ips` 找一个 `status=free` 的地址（不要挑 reserved/bound 的）
3. `note_list mac=<mac>` 看是否已有备注，可复用为 `description`
4. `reservation_create`
5. 用 `reservation_list mac=<mac>` 复核

如果返回 `IP_LEASED_TO_OTHER`，说明该地址正被另一台设备使用，换一个地址，**不要**先去释放别人的租约。

### C. 扩容地址池

1. `dhcp_status` 看该池 `percentage`
2. `pool_get id=<id>` 拿现值
3. 算新 `end_ip`：必须仍在 `subnet/netmask` 内、不能与其它池重叠、整个池不超过 4096 个地址
4. `pool_update id=<id> end_ip=<new>`
5. 再 `dhcp_status` 确认容量变化

缩小范围前必须先确认被移除的区间里没有活跃租约，否则正在用这些地址的设备会在续约时失败。

### D. 临时封禁设备

`blacklist_add mac_address=<mac> reason="<原因>"`，完成后提醒用户记得用 `blacklist_remove` 解封。封禁会让设备完全失去 DHCP 响应，属于需要用户确认的动作。

## 硬约束

- **不调用 `service_stop`**，除非用户明确说“停掉 DHCP”。即使用户说了，也先复述影响（所有客户端续约失败）再执行。
- **不调用 `config_import`**，除非用户提供了文件并逐类确认要覆盖的类别。它会先删后插。
- 删除地址池（`pool_delete`）前必须先确认无活跃租约；服务端会返回 409，不要靠删除租约来绕过。
- 不要批量删除 reservation / blacklist / options。逐条来，每条都能单独回滚。
- `netmask` 一律点分十进制（`255.255.255.0`），不要写 `/24`。
- `logs_clear` 会清空全部数据包日志。只在用户明确要求时调用，并提醒历史排查记录会丢失。
- 写操作失败时读 `error.code` 和 `error.hint` 调整参数再试，最多重试两次；同一个错误重复出现就停下来问用户。

## 停下来问人的情况

- 池已满且无法在当前子网内扩容
- 需要修改 `server_ip` / `web_port` 这类会导致服务重绑的配置
- 一次操作可能影响大量设备
- 用户的要求与当前状态冲突（比如要删的池里还有活跃租约）
