'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Table, Tag, Select, Popconfirm, Button, message, Modal, Form, Input, Space, Alert } from 'antd';
import { DeleteOutlined, UndoOutlined, PlusOutlined } from '@ant-design/icons';
import MacAddress from '@/components/MacAddress';
import MacInput from '@/components/MacInput';
import { formatLocalTime } from '@/lib/format-time';
import { translateError } from '@/lib/error-map';
import { useMacNotes } from '@/hooks/useMacNotes';

const { Title } = Typography;

const STATE_COLORS: Record<string, string> = {
  BOUND: 'green',
  OFFERED: 'blue',
  EXPIRED: 'default',
  RELEASED: 'red',
};

export default function LeasesPage() {
  const t = useTranslations('leases');
  const tc = useTranslations('common');
  const tr = useTranslations('reservations');
  const ipRule = { pattern: /^(\d{1,3}\.){3}\d{1,3}$/, message: tc('invalidIpv4') };
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState('lease_end');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const { macNotes, fetchMacNotes } = useMacNotes();

  // Reservation modal state
  const [pools, setPools] = useState<any[]>([]);
  const [reservedMacs, setReservedMacs] = useState<Set<string>>(new Set());
  const [resModalOpen, setResModalOpen] = useState(false);
  const [resSubmitting, setResSubmitting] = useState(false);
  const [resError, setResError] = useState('');
  const [resForm] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const searchParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: sortField, order: sortOrder });
      if (state !== 'ALL') searchParams.set('state', state);
      const [res, resRes, poolRes] = await Promise.all([
        fetch(`/api/leases?${searchParams}`),
        fetch('/api/reservations'),
        fetch('/api/pools'),
      ]);
      const json = await res.json();
      setData(json.data || []);
      setTotal(json.total || 0);
      const resData = await resRes.json();
      const resList = Array.isArray(resData) ? resData : [];
      setReservedMacs(new Set(resList.map((r: any) => (r.mac_address || '').toUpperCase())));
      const poolData = await poolRes.json();
      setPools(Array.isArray(poolData) ? poolData : []);
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

  const handleAddReservation = (record: any) => {
    setResError('');
    resForm.resetFields();
    resForm.setFieldsValue({
      mac_address: record.mac_address,
      ip_address: record.ip_address,
      pool_id: record.pool_id,
      hostname: record.hostname,
    });
    setResModalOpen(true);
  };

  const handleReservationSubmit = async () => {
    try {
      setResError('');
      setResSubmitting(true);
      const values = await resForm.validateFields();
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const result = await res.json();
      if (!res.ok) {
        const errMsg = translateError(result.error, tc) || tc('error');
        setResError(errMsg);
        message.error(errMsg);
        return;
      }
      message.success(tc('createSuccess'));
      setResModalOpen(false);
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return; // form validation, handled by Ant Design
      const errMsg = err?.message || tc('error');
      setResError(errMsg);
      message.error(errMsg);
    } finally {
      setResSubmitting(false);
    }
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
      title: tc('actions'), key: 'actions', width: 220, fixed: 'right' as const,
      render: (_: any, r: any) => {
        const isReserved = reservedMacs.has((r.mac_address || '').toUpperCase());
        const buttons: React.ReactNode[] = [];
        if ((r.state === 'BOUND' || r.state === 'OFFERED') && !isReserved) {
          buttons.push(
            <Popconfirm key="release" title={t('releaseConfirm')} onConfirm={() => handleRelease(r.ip_address)}>
              <Button icon={<UndoOutlined />} size="small" type="default">{t('release')}</Button>
            </Popconfirm>
          );
        }
        if (r.state === 'RELEASED' || r.state === 'EXPIRED') {
          buttons.push(
            <Popconfirm key="delete" title={t('deleteConfirm')} onConfirm={() => handleDelete(r.ip_address)}>
              <Button icon={<DeleteOutlined />} size="small" danger />
            </Popconfirm>
          );
        }
        if (!isReserved) {
          buttons.push(
            <Button key="reserve" icon={<PlusOutlined />} size="small" onClick={() => handleAddReservation(r)}>
              {tr('addReservation')}
            </Button>
          );
        }
        return buttons.length > 0 ? <Space size={4} wrap>{buttons}</Space> : null;
      },
    },
  ];

  return (
    <>
      <div className="page-title-bar" style={{ justifyContent: 'space-between' }}>
        <Title level={3} style={{ margin: 0 }}>{t('title')}</Title>
        <Select value={state} onChange={v => { setState(v); setPage(1); }} style={{ width: 150 }} size="small">
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
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], onChange: (p, ps) => { setPage(p); setPageSize(ps); } }} />

      <Modal title={tr('addReservation')} open={resModalOpen}
        onOk={handleReservationSubmit} onCancel={() => setResModalOpen(false)}
        confirmLoading={resSubmitting} okText={tc('confirm')} cancelText={tc('cancel')} width={600}>
        {resError && (
          <Alert type="error" message={resError} closable
            onClose={() => setResError('')} style={{ marginBottom: 16 }} />
        )}
        <Form form={resForm} layout="vertical">
          <Form.Item name="mac_address" label={tr('macAddress')} rules={[{ required: true, message: tc('requiredField') }]}>
            <MacInput placeholder={tr('macPlaceholder')} knownMacs={data.map((r: any) => r.mac_address).filter(Boolean)} />
          </Form.Item>
          <Form.Item name="ip_address" label={tr('ipAddress')} rules={[{ required: true }, ipRule]}>
            <Input />
          </Form.Item>
          <Form.Item name="pool_id" label={tr('pool')} rules={[{ required: true }]}>
            <Select placeholder={tr('selectPool')}>
              {pools.map((p: any) => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="hostname" label={tr('hostname')}><Input /></Form.Item>
          <Form.Item name="description" label={tr('description')}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
