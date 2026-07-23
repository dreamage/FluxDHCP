'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Table, Tag, Select, AutoComplete, Switch, Space, Button, Dropdown, Checkbox } from 'antd';
import { SearchOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import MacAddress from '@/components/MacAddress';
import { formatLocalTime } from '@/lib/format-time';
import { translateServerResponse } from '@/lib/server-response';
import { useMacNotes } from '@/hooks/useMacNotes';
import { useNotify } from '@/hooks/useNotify';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;

const MSG_TYPE_COLORS: Record<number, string> = {
  1: 'blue',    // DISCOVER
  2: 'cyan',    // OFFER
  3: 'orange',  // REQUEST
  4: 'red',     // DECLINE
  5: 'green',   // ACK
  6: 'volcano', // NAK
  7: 'default', // RELEASE
  8: 'purple',  // INFORM
};

const LOGS_VISIBLE_COLS_KEY = 'fluxdhcp_dhcp_logs_visible_cols';
const DEFAULT_VISIBLE = ['timestamp', 'direction', 'message_type', 'client_mac', 'yiaddr', 'hostname'];

function renderRawOptions(rawOptions: any, tOpt: (key: string) => string): string {
  if (!rawOptions) return '';
  try {
    const options = typeof rawOptions === 'string' ? JSON.parse(rawOptions) : rawOptions;
    const getLabel = (code: string): string => {
      try {
        const label = tOpt(code);
        if (label && !label.startsWith('dhcpOptionCodes.')) return label;
      } catch { /* no translation */ }
      return '';
    };

    if (Array.isArray(options)) {
      return options.map((opt: any) => {
        const code = opt.code ?? opt.option_code ?? opt[0];
        const value = opt.value ?? opt.option_value ?? opt[1];
        const desc = getLabel(String(code));
        const suffix = desc ? ` # ${desc}` : '';
        return `Option ${code}${suffix}: ${typeof value === 'object' ? JSON.stringify(value) : value}`;
      }).join('\n');
    }
    if (typeof options === 'object') {
      return Object.entries(options).map(([key, val]) => {
        const desc = getLabel(key);
        const suffix = desc ? ` # ${desc}` : '';
        return `Option ${key}${suffix}: ${typeof val === 'object' ? JSON.stringify(val) : val}`;
      }).join('\n');
    }
    return JSON.stringify(options, null, 2);
  } catch {
    return String(rawOptions);
  }
}

export default function LogsPage() {
  const t = useTranslations('dhcpLogs');
  const tMsg = useTranslations('messageTypes');
  const tOpt = useTranslations('dhcpOptionCodes');
  const tSr = useTranslations('serverResponse');
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [messageType, setMessageType] = useState<string | undefined>();
  const [mac, setMac] = useState('');
  const [ip, setIp] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(3000);
  const { macNotes, knownMacs, fetchMacNotes } = useMacNotes();
  const [knownIps, setKnownIps] = useState<string[]>([]);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notify = useNotify();
  const hasNotified = useRef(false);

  // Column visibility state
  const [visibleKeys, setVisibleKeys] = useState<string[]>(DEFAULT_VISIBLE);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOGS_VISIBLE_COLS_KEY);
      if (saved) setVisibleKeys(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);
  const setVisibleKeysAndSave = (keys: string[]) => {
    setVisibleKeys(keys);
    try { localStorage.setItem(LOGS_VISIBLE_COLS_KEY, JSON.stringify(keys)); } catch { /* ignore */ }
  };

  const fetchKnownIps = useCallback(async () => {
    try {
      const res = await fetch('/api/leases?pageSize=500');
      if (res.ok) {
        const json = await res.json();
        setKnownIps([...new Set((json.data || []).map((l: any) => l.ip_address).filter(Boolean))] as string[]);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (messageType) params.set('messageType', messageType);
      if (mac) params.set('mac', mac);
      if (ip) params.set('ip', ip);
      const res = await fetch(`/api/dhcp-logs?${params}`);
      if (!res.ok) {
        if (!hasNotified.current) { notify.error(null); hasNotified.current = true; }
        return;
      }
      const json = await res.json();
      setData(json.data || []);
      setTotal(json.total || 0);
      hasNotified.current = false;
    } catch {
      if (!hasNotified.current) { notify.error(null); hasNotified.current = true; }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, messageType, mac, ip]);

  useEffect(() => { fetchData(); fetchMacNotes(); fetchKnownIps(); }, [fetchData, fetchMacNotes, fetchKnownIps]);

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(fetchData, refreshInterval);
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [autoRefresh, refreshInterval, fetchData]);

  const allColumns: ColumnsType<any> = [
    {
      title: t('timestamp'), dataIndex: 'timestamp', key: 'timestamp', width: 170,
      render: (v: string) => formatLocalTime(v),
    },
    {
      title: t('direction'), dataIndex: 'direction', key: 'direction', width: 90,
      render: (dir: string) => dir === 'send'
        ? <Tag color="green">{'→ ' + t('sent')}</Tag>
        : <Tag color="blue">{'← ' + t('received')}</Tag>,
    },
    {
      title: t('messageType'), dataIndex: 'message_type', key: 'message_type', width: 110,
      render: (type: number) => <Tag color={MSG_TYPE_COLORS[type] || 'default'}>{tMsg(String(type))}</Tag>,
    },
    { title: t('clientMac'), dataIndex: 'client_mac', key: 'client_mac', width: 200,
      render: (mac: string) => <MacAddress mac={mac} macNotes={macNotes} onNoteUpdate={fetchMacNotes} /> },
    { title: t('yiaddr'), dataIndex: 'yiaddr', key: 'yiaddr', width: 130 },
    { title: t('siaddr'), dataIndex: 'siaddr', key: 'siaddr', width: 130 },
    { title: t('giaddr'), dataIndex: 'giaddr', key: 'giaddr', width: 130 },
    { title: t('hostname'), dataIndex: 'hostname', key: 'hostname', width: 120 },
  ];

  const columnOptions = allColumns.map(c => ({ value: c.key as string, label: c.title as string }));
  const columns = useMemo(() => allColumns.filter(c => visibleKeys.includes(c.key as string)), [allColumns, visibleKeys, macNotes]);

  // Compute alternating background classes by MAC group
  const rowClassMap = useMemo(() => {
    const map: Record<number, string> = {};
    let groupIndex = 0;
    let prevMac: string | null = null;
    for (let i = 0; i < data.length; i++) {
      const mac = data[i]?.client_mac || '';
      if (mac !== prevMac) {
        if (prevMac !== null) groupIndex++;
        prevMac = mac;
      }
      map[i] = groupIndex % 2 === 0 ? 'log-row-even' : 'log-row-odd';
    }
    return map;
  }, [data]);

  const columnMenuItems = allColumns.map(c => ({
    key: c.key as string,
    label: (
      <Checkbox checked={visibleKeys.includes(c.key as string)}
        onChange={e => {
          const key = c.key as string;
          const next = e.target.checked ? [...visibleKeys, key] : visibleKeys.filter(k => k !== key);
          setVisibleKeysAndSave(next);
        }}>
        {c.title as string}
      </Checkbox>
    ),
  }));

  return (
    <>
      <div className="page-title-bar">
        <Title level={3} style={{ margin: 0 }}>{t('title')}</Title>
      </div>

      <Space wrap size="small" style={{ marginBottom: 16 }} align="center">
        <Select value={messageType} onChange={v => { setMessageType(v); setPage(1); }}
          allowClear placeholder={t('allTypes')} style={{ width: 150 }} size="small">
          {[1,2,3,4,5,6,7,8].map(type => (
            <Select.Option key={type} value={String(type)}>{tMsg(String(type))}</Select.Option>
          ))}
        </Select>
        <AutoComplete
          value={mac} onChange={v => setMac(v || '')}
          placeholder={t('clientMac')} allowClear
          style={{ width: 280 }} size="small"
          options={knownMacs.map(m => ({
            value: m,
            label: <span style={{ fontFamily: 'monospace' }}>{m}{macNotes[m] ? <span style={{ color: '#1890ff', marginLeft: 8, fontSize: 12 }}>({macNotes[m]})</span> : ''}</span>,
          }))}
          filterOption={(input, option) => (option?.value as string)?.toUpperCase().includes(input.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') { setPage(1); fetchData(); } }}
        />
        <AutoComplete
          value={ip} onChange={v => setIp(v || '')}
          placeholder={t('clientIp')} allowClear
          style={{ width: 150 }} size="small"
          options={knownIps.map(addr => ({ value: addr }))}
          filterOption={(input, option) => (option?.value as string)?.includes(input)}
          onKeyDown={e => { if (e.key === 'Enter') { setPage(1); fetchData(); } }}
        />
        <Button icon={<SearchOutlined />} size="small" onClick={() => { setPage(1); fetchData(); }} />
        <Button icon={<ReloadOutlined />} size="small" onClick={fetchData} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Switch size="small" checked={autoRefresh} onChange={setAutoRefresh} />
          <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{t('autoRefresh')}</span>
        </span>
        {autoRefresh && (
          <Select value={refreshInterval} onChange={setRefreshInterval} style={{ width: 90 }} size="small">
            <Select.Option value={3000}>3s</Select.Option>
            <Select.Option value={5000}>5s</Select.Option>
            <Select.Option value={10000}>10s</Select.Option>
            <Select.Option value={30000}>30s</Select.Option>
          </Select>
        )}
        <Dropdown menu={{ items: columnMenuItems }} trigger={['click']} placement="bottomRight">
          <Button icon={<SettingOutlined />} size="small" />
        </Dropdown>
      </Space>

      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small"
        scroll={{ x: 'max-content' }}
        rowClassName={(_, index) => rowClassMap[index] || 'log-row-even'}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        expandable={{
          rowExpandable: () => true,
          expandedRowRender: (record: any) => (
            <div style={{ padding: '8px 0' }}>
              {record.raw_options && (
                <div style={{ marginBottom: 8 }}>
                  <strong>{t('rawOptions')}:</strong>
                  <pre style={{ marginTop: 4, background: '#f1f5f9', padding: 8, borderRadius: 4, fontSize: 12, maxHeight: 200, overflow: 'auto' }}>
                    {renderRawOptions(record.raw_options, tOpt)}
                  </pre>
                </div>
              )}
              {record.server_response && (
                <div>
                  {(() => {
                    const parts = String(record.server_response).split('\n---OPTIONS---\n');
                    const summary = parts[0];
                    const respOptions = parts[1];
                    return (
                      <>
                        <strong>{t('serverResponse')}:</strong> {translateServerResponse(record.server_response, tSr)}
                        {respOptions && (
                          <pre style={{ marginTop: 4, background: '#f0fdf4', padding: 8, borderRadius: 4, fontSize: 12, maxHeight: 200, overflow: 'auto', border: '1px solid #bbf7d0' }}>
                            {renderRawOptions(respOptions, tOpt)}
                          </pre>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          ),
        }}
      />
    </>
  );
}
