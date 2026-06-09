'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Table, Button, Select, Popconfirm, message, Space, Tag, Tooltip } from 'antd';
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

const EVENT_OPTIONS = [
  { value: 'dhcp_discover', labelKey: 'dhcpDiscover' },
  { value: 'dhcp_offer', labelKey: 'dhcpOffer' },
  { value: 'dhcp_request', labelKey: 'dhcpRequest' },
  { value: 'dhcp_ack', labelKey: 'dhcpAck' },
  { value: 'dhcp_nak', labelKey: 'dhcpNak' },
  { value: 'dhcp_release', labelKey: 'dhcpRelease' },
  { value: 'dhcp_inform', labelKey: 'dhcpInform' },
  { value: 'dhcp_decline', labelKey: 'dhcpDecline' },
];

const DELIVERY_STATUS_COLORS: Record<string, string> = {
  success: 'green',
  failed: 'orange',
  error: 'red',
  pending: 'blue',
};

const EVENT_COLORS: Record<string, string> = {
  dhcp_discover: 'blue',
  dhcp_offer: 'cyan',
  dhcp_request: 'orange',
  dhcp_ack: 'green',
  dhcp_nak: 'volcano',
  dhcp_release: 'default',
  dhcp_inform: 'purple',
  dhcp_decline: 'red',
};

function formatTimeShort(v: string | null | undefined): string {
  if (!v) return '-';
  let d: Date;
  if (v.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(v)) {
    d = new Date(v);
  } else {
    d = new Date(v + 'Z');
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

interface DeliveryLogsProps {
  webhooks: any[];
}

export default function DeliveryLogs({ webhooks }: DeliveryLogsProps) {
  const t = useTranslations('webhook');
  const tLogs = useTranslations('webhookLogs');
  const tc = useTranslations('common');

  const [logs, setLogs] = useState<any[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPageSize, setLogsPageSize] = useState(20);
  const [logsStatusFilter, setLogsStatusFilter] = useState<string | undefined>();
  const [logsWebhookFilter, setLogsWebhookFilter] = useState<string>('');

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(logsPage), pageSize: String(logsPageSize) });
      if (logsStatusFilter) params.set('status', logsStatusFilter);
      if (logsWebhookFilter) params.set('webhook_id', logsWebhookFilter);
      const res = await fetch(`/api/webhooks/deliveries?${params}`);
      const json = await res.json();
      setLogs(json.data || []);
      setLogsTotal(json.total || 0);
    } finally { setLogsLoading(false); }
  }, [logsPage, logsPageSize, logsStatusFilter, logsWebhookFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleClearLogs = async () => {
    const res = await fetch('/api/webhooks/deliveries', { method: 'DELETE' });
    if (res.ok) {
      message.success(tLogs('clearSuccess'));
      fetchLogs();
    }
  };

  const handleClearFilters = () => {
    setLogsStatusFilter(undefined);
    setLogsWebhookFilter('');
    setLogsPage(1);
  };

  const logColumns: ColumnsType<any> = [
    {
      title: tLogs('time'), dataIndex: 'created_at', key: 'created_at', width: 150,
      render: (v: string) => formatTimeShort(v),
    },
    {
      title: tLogs('webhookName'), dataIndex: 'webhook_name', key: 'webhook_name', width: 100,
      render: (name: string) => <Text strong style={{ fontSize: 13 }}>{name}</Text>,
    },
    {
      title: tLogs('event'), dataIndex: 'event_type', key: 'event_type', width: 120,
      render: (e: string) => {
        const opt = EVENT_OPTIONS.find(o => o.value === e);
        const label = opt ? t(opt.labelKey) : (e || '').replace('dhcp_', '').toUpperCase();
        return <Tag color={EVENT_COLORS[e] || 'blue'}>{label}</Tag>;
      },
    },
    {
      title: tLogs('status'), dataIndex: 'status', key: 'status', width: 70,
      render: (status: string) => <Tag color={DELIVERY_STATUS_COLORS[status] || 'default'}>{tLogs(status) || status}</Tag>,
    },
    {
      title: 'HTTP', dataIndex: 'http_status', key: 'http_status', width: 60,
      render: (code: number | null) => code ? <Text code style={{ fontSize: 12 }}>{code}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: tLogs('attempt'), key: 'attempt', width: 60,
      render: (_: any, r: any) => {
        if (r.status === 'success' && r.attempt === 1) return <Tag color="green" style={{ fontSize: 11 }}>1st</Tag>;
        return <Text type="secondary" style={{ fontSize: 12 }}>{r.attempt}/{r.max_attempts}</Text>;
      },
    },
    {
      title: tLogs('method'), dataIndex: 'method', key: 'method', width: 55,
      render: (m: string) => <Tag color={m === 'POST' ? 'blue' : 'green'}>{m}</Tag>,
    },
    {
      title: 'URL', dataIndex: 'url', key: 'url', ellipsis: true,
      render: (url: string) => <Text style={{ fontSize: 12 }} ellipsis>{url}</Text>,
    },
    {
      title: tLogs('requestBody'), dataIndex: 'request_body', key: 'request_body', width: 180, ellipsis: true,
      render: (body: string) => body
        ? <Tooltip title={<span style={{ fontFamily: 'monospace', wordBreak: 'break-all', whiteSpace: 'pre-wrap', maxWidth: 400, display: 'block' }}>{body}</span>} placement="topLeft"><Text style={{ fontSize: 12 }} ellipsis>{body}</Text></Tooltip>
        : <Text type="secondary">-</Text>,
    },
    {
      title: tLogs('error'), dataIndex: 'error', key: 'error', width: 120, ellipsis: true,
      render: (err: string) => err ? <Text type="danger" style={{ fontSize: 12 }} ellipsis>{err}</Text> : null,
    },
  ];

  return (
    <>
      <Typography.Title level={4} style={{ margin: '16px 0 12px', color: 'var(--color-text-secondary)' }}>{tLogs('title')}</Typography.Title>

      <Space wrap style={{ marginBottom: 12 }} align="center" size="small">
        <Select value={logsStatusFilter} onChange={v => { setLogsStatusFilter(v); setLogsPage(1); }}
          allowClear placeholder={tLogs('allStatus')} style={{ width: 120 }} size="small">
          <Select.Option value="success">{tLogs('success')}</Select.Option>
          <Select.Option value="failed">{tLogs('failed')}</Select.Option>
          <Select.Option value="error">{tLogs('errorStatus')}</Select.Option>
        </Select>
        <Select value={logsWebhookFilter} onChange={v => { setLogsWebhookFilter(v); setLogsPage(1); }}
          allowClear placeholder={tLogs('allWebhooks')} style={{ width: 160 }} size="small">
          {webhooks.map((w: any) => (
            <Select.Option key={w.id} value={String(w.id)}>{w.name}</Select.Option>
          ))}
        </Select>
        <Button icon={<ReloadOutlined />} size="small" onClick={fetchLogs} />
        <Button size="small" onClick={handleClearFilters}>{tLogs('clearFilters')}</Button>
        <Popconfirm title={tLogs('clearConfirm')} onConfirm={handleClearLogs} okText={tc('confirm')} cancelText={tc('cancel')}>
          <Button icon={<DeleteOutlined />} danger size="small">{tLogs('clearAll')}</Button>
        </Popconfirm>
        <Text type="secondary" style={{ fontSize: 12 }}>{tLogs('total')}: {logsTotal}</Text>
      </Space>

      <Table columns={logColumns} dataSource={logs} rowKey="id" loading={logsLoading} size="small"
        scroll={{ x: 900 }}
        pagination={{ current: logsPage, pageSize: logsPageSize, total: logsTotal, showSizeChanger: true, pageSizeOptions: [20, 50, 100], onChange: (p, ps) => { setLogsPage(p); setLogsPageSize(ps); } }} />
    </>
  );
}
