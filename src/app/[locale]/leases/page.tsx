'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Table, Tag, Select, Popconfirm, Button, Modal, Form, Input, Space, Alert, Card } from 'antd';
import { DeleteOutlined, UndoOutlined, PlusOutlined, SearchOutlined, ReloadOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import MacAddress from '@/components/MacAddress';
import MacInput from '@/components/MacInput';
import { formatLocalTimeNoMs } from '@/lib/format-time';
import { translateError } from '@/lib/error-map';
import { useMacNotes } from '@/hooks/useMacNotes';
import { useNotify } from '@/hooks/useNotify';
import { isValidIPv4, ipToNum } from '@/lib/ip-utils';

const { Title } = Typography;

const STATE_COLORS: Record<string, string> = {
  BOUND: 'green',
  OFFERED: 'blue',
  EXPIRED: 'default',
  RELEASED: 'red',
};

const STATE_OPTIONS = ['BOUND', 'OFFERED', 'EXPIRED', 'RELEASED'] as const;

export default function LeasesPage() {
  const t = useTranslations('leases');
  const tc = useTranslations('common');
  const tr = useTranslations('reservations');
  const ipRule = { validator: (_: any, value: string) => (value && !isValidIPv4(value) ? Promise.reject(tc('invalidIpv4')) : Promise.resolve()) };
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeFilters, setActiveFilters] = useState({ poolId: 'ALL', state: 'ALL', ipStart: '', ipEnd: '', mac: '', hostname: '' });
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterForm] = Form.useForm();
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
  const notify = useNotify();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const searchParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: sortField, order: sortOrder });
      if (activeFilters.state !== 'ALL') searchParams.set('state', activeFilters.state);
      if (activeFilters.poolId !== 'ALL') searchParams.set('pool_id', activeFilters.poolId);
      if (activeFilters.ipStart && activeFilters.ipEnd) {
        searchParams.set('ip_start', activeFilters.ipStart);
        searchParams.set('ip_end', activeFilters.ipEnd);
      }
      if (activeFilters.mac) searchParams.set('mac', activeFilters.mac);
      if (activeFilters.hostname) searchParams.set('hostname', activeFilters.hostname);
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
  }, [page, pageSize, activeFilters, sortField, sortOrder]);

  useEffect(() => { fetchData(); fetchMacNotes(); }, [fetchData, fetchMacNotes]);

  const handleSearch = async () => {
    try {
      const values = await filterForm.validateFields();
      setActiveFilters({
        poolId: values.pool_id || 'ALL',
        state: values.state || 'ALL',
        ipStart: values.ip_start || '',
        ipEnd: values.ip_end || '',
        mac: values.mac || '',
        hostname: values.hostname || '',
      });
      setPage(1);
    } catch { /* validation */ }
  };

  const handleReset = () => {
    filterForm.resetFields();
    filterForm.setFieldsValue({ pool_id: 'ALL', state: 'ALL', ip_start: '', ip_end: '', mac: '', hostname: '' });
    setActiveFilters({ poolId: 'ALL', state: 'ALL', ipStart: '', ipEnd: '', mac: '', hostname: '' });
    setPage(1);
  };

  const handleRelease = async (ip: string) => {
    const res = await fetch(`/api/leases/${ip}`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) { notify.error(result.error); return; }
    notify.success(t('released'));
    fetchData();
  };

  const handleDelete = async (ip: string) => {
    const res = await fetch(`/api/leases/${ip}?purge=true`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) { notify.error(result.error); return; }
    notify.success(tc('deleteSuccess'));
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
        return;
      }
      notify.success(tc('createSuccess'));
      setResModalOpen(false);
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return; // form validation, handled by Ant Design
      const errMsg = err?.message || tc('error');
      setResError(errMsg);
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
      render: (v: string) => formatLocalTimeNoMs(v) },
    { title: t('endTime'), dataIndex: 'lease_end', key: 'lease_end', width: 170, sorter: true,
      render: (v: string) => formatLocalTimeNoMs(v) },
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
              <Button icon={<DeleteOutlined />} size="small" danger>{tc('delete')}</Button>
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
        <Button
          size="small"
          icon={filterOpen ? <UpOutlined /> : <DownOutlined />}
          onClick={() => setFilterOpen(!filterOpen)}
        >
          {t('advancedSearch')}
        </Button>
      </div>

      {filterOpen && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Form form={filterForm} layout="inline" initialValues={{ pool_id: 'ALL', state: 'ALL', ip_start: '', ip_end: '', mac: '', hostname: '' }}>
            <Form.Item name="pool_id" label={t('pool')}>
              <Select style={{ width: 160 }} size="small" allowClear>
                <Select.Option value="ALL">{t('allPools')}</Select.Option>
                {pools.map((p: any) => (
                  <Select.Option key={p.id} value={String(p.id)}>{p.name}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="state" label={t('state')}>
              <Select style={{ width: 130 }} size="small" allowClear>
                <Select.Option value="ALL">{t('allStates')}</Select.Option>
                {STATE_OPTIONS.map(s => (
                  <Select.Option key={s} value={s}>{t(s.toLowerCase())}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="ip_start" label={t('ipRange')} dependencies={['ip_end']}
              rules={[ipRule, ({ getFieldValue }) => ({
                validator(_: any, value: string) {
                  const end = getFieldValue('ip_end');
                  if ((value && !end) || (!value && end)) return Promise.reject(t('ipRangeBothRequired'));
                  if (value && end && isValidIPv4(value) && isValidIPv4(end) && ipToNum(value) > ipToNum(end)) return Promise.reject(tc('errStartIpGreaterThanEnd'));
                  return Promise.resolve();
                },
              })]}>
              <Input size="small" placeholder={t('ipStartPlaceholder')} style={{ width: 150 }} />
            </Form.Item>
            <span style={{ alignSelf: 'center', color: 'var(--color-text-secondary)' }}>~</span>
            <Form.Item name="ip_end" dependencies={['ip_start']}
              rules={[ipRule, ({ getFieldValue }) => ({
                validator(_: any, value: string) {
                  const start = getFieldValue('ip_start');
                  if ((value && !start) || (!value && start)) return Promise.reject(t('ipRangeBothRequired'));
                  if (value && start && isValidIPv4(value) && isValidIPv4(start) && ipToNum(start) > ipToNum(value)) return Promise.reject(tc('errStartIpGreaterThanEnd'));
                  return Promise.resolve();
                },
              })]}>
              <Input size="small" placeholder={t('ipEndPlaceholder')} style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="mac" label={t('macAddress')}>
              <Input size="small" placeholder={t('macPlaceholder')} style={{ width: 180 }} allowClear />
            </Form.Item>
            <Form.Item name="hostname" label={t('hostname')}>
              <Input size="small" placeholder={t('hostnamePlaceholder')} style={{ width: 150 }} allowClear />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" size="small" icon={<SearchOutlined />} onClick={handleSearch}>
                  {tc('search')}
                </Button>
                <Button size="small" icon={<ReloadOutlined />} onClick={handleReset}>
                  {t('reset')}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      )}

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
