'use client';

import React, { use, useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Table, Tag, Select, Popconfirm, Button, message } from 'antd';
import { DeleteOutlined, UndoOutlined } from '@ant-design/icons';
import AppLayout from '@/components/AppLayout';
import MacAddress from '@/components/MacAddress';
import { formatLocalTime } from '@/lib/format-time';
import { translateError } from '@/lib/error-map';

const { Title } = Typography;

const STATE_COLORS: Record<string, string> = {
  BOUND: 'green',
  OFFERED: 'blue',
  EXPIRED: 'default',
  RELEASED: 'red',
};

export default function LeasesPage({ params }: { params: Promise<{ locale: string }> }) {
  const t = useTranslations('leases');
  const tc = useTranslations('common');
  const { locale } = use(params);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [macNotes, setMacNotes] = useState<Record<string, string>>({});
  const [sortField, setSortField] = useState('lease_end');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchMacNotes = useCallback(async () => {
    try {
      const res = await fetch('/api/mac-notes');
      if (res.ok) setMacNotes(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const searchParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: sortField, order: sortOrder });
      if (state !== 'ALL') searchParams.set('state', state);
      const res = await fetch(`/api/leases?${searchParams}`);
      const json = await res.json();
      setData(json.data || []);
      setTotal(json.total || 0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, state, sortField, sortOrder]);

  useEffect(() => { fetchData(); fetchMacNotes(); }, [fetchData, fetchMacNotes]);

  const handleRelease = async (ip: string) => {
    const res = await fetch(`/api/leases/${ip}`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) { message.error(translateError(result.error, tc) || tc('error')); return; }
    message.success(t('released'));
    fetchData();
  };

  const handleDelete = async (ip: string) => {
    const res = await fetch(`/api/leases/${ip}?purge=true`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) { message.error(translateError(result.error, tc) || tc('error')); return; }
    message.success(tc('deleteSuccess'));
    fetchData();
  };

  const columns = [
    { title: t('ipAddress'), dataIndex: 'ip_address', key: 'ip_address', width: 130, sorter: true },
    { title: t('macAddress'), dataIndex: 'mac_address', key: 'mac_address', width: 200, sorter: true,
      render: (mac: string) => <MacAddress mac={mac} macNotes={macNotes} onNoteUpdate={fetchMacNotes} /> },
    { title: t('hostname'), dataIndex: 'hostname', key: 'hostname', width: 120, sorter: true },
    {
      title: t('state'), dataIndex: 'state', key: 'state', width: 100, sorter: true,
      render: (state: string) => <Tag color={STATE_COLORS[state] || 'default'}>{t(state.toLowerCase())}</Tag>,
    },
    { title: t('startTime'), dataIndex: 'lease_start', key: 'lease_start', width: 170, sorter: true,
      render: (v: string) => formatLocalTime(v) },
    { title: t('endTime'), dataIndex: 'lease_end', key: 'lease_end', width: 170, sorter: true,
      render: (v: string) => formatLocalTime(v) },
    { title: t('pool'), dataIndex: 'pool_name', key: 'pool_name', width: 100, sorter: true },
    {
      title: tc('actions'), key: 'actions', width: 120, fixed: 'right' as const,
      render: (_: any, r: any) => {
        if (r.state === 'BOUND' || r.state === 'OFFERED') {
          return (
            <Popconfirm title={t('releaseConfirm')} onConfirm={() => handleRelease(r.ip_address)}>
              <Button icon={<UndoOutlined />} size="small" type="default">{t('release')}</Button>
            </Popconfirm>
          );
        }
        if (r.state === 'RELEASED' || r.state === 'EXPIRED') {
          return (
            <Popconfirm title={t('deleteConfirm')} onConfirm={() => handleDelete(r.ip_address)}>
              <Button icon={<DeleteOutlined />} size="small" danger />
            </Popconfirm>
          );
        }
        return null;
      },
    },
  ];

  return (
    <AppLayout locale={locale} onLocaleChange={() => {}}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>{t('title')}</Title>
        <Select value={state} onChange={v => { setState(v); setPage(1); }} style={{ width: 150 }}>
          <Select.Option value="ALL">{t('all')}</Select.Option>
          <Select.Option value="BOUND">{t('bound')}</Select.Option>
          <Select.Option value="OFFERED">{t('offered')}</Select.Option>
          <Select.Option value="EXPIRED">{t('expired')}</Select.Option>
          <Select.Option value="RELEASED">{t('released')}</Select.Option>
        </Select>
      </div>
      <Table columns={columns} dataSource={data} rowKey="ip_address" loading={loading} size="small"
        scroll={{ x: 'max-content' }}
        onChange={(_pagination, _filters, sorter: any) => {
          if (sorter.field) {
            setSortField(sorter.field);
            setSortOrder(sorter.order === 'ascend' ? 'asc' : 'desc');
          }
        }}
        pagination={{ current: page, pageSize, total, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }} />
    </AppLayout>
  );
}
