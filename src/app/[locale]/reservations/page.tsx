'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Table, Button, Modal, Form, Input, Switch, Popconfirm, Select, Space, Alert, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import MacAddress from '@/components/MacAddress';
import MacInput from '@/components/MacInput';
import { translateError } from '@/lib/error-map';
import { useMacNotes } from '@/hooks/useMacNotes';
import { useNotify } from '@/hooks/useNotify';
import { isValidIPv4, ipToNum } from '@/lib/ip-utils';

const { Title } = Typography;

export default function ReservationsPage() {
  const t = useTranslations('reservations');
  const tc = useTranslations('common');
  const ipRule = { validator: (_: any, value: string) => (value && !isValidIPv4(value) ? Promise.reject(tc('invalidIpv4')) : Promise.resolve()) };
  const [data, setData] = useState<any[]>([]);
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilters, setActiveFilters] = useState({ poolId: 'ALL', enabled: 'ALL', ipStart: '', ipEnd: '', mac: '', hostname: '' });
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterForm] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [submitError, setSubmitError] = useState('');
  const { macNotes, fetchMacNotes } = useMacNotes();
  const [form] = Form.useForm();
  const notify = useNotify();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const searchParams = new URLSearchParams();
      if (activeFilters.poolId !== 'ALL') searchParams.set('pool_id', activeFilters.poolId);
      if (activeFilters.enabled !== 'ALL') searchParams.set('enabled', activeFilters.enabled);
      if (activeFilters.ipStart && activeFilters.ipEnd) {
        searchParams.set('ip_start', activeFilters.ipStart);
        searchParams.set('ip_end', activeFilters.ipEnd);
      }
      if (activeFilters.mac) searchParams.set('mac', activeFilters.mac);
      if (activeFilters.hostname) searchParams.set('hostname', activeFilters.hostname);
      const [resRes, poolRes] = await Promise.all([
        fetch(`/api/reservations?${searchParams}`),
        fetch('/api/pools'),
      ]);
      const resData = await resRes.json();
      const poolData = await poolRes.json();
      setData(Array.isArray(resData) ? resData : []);
      setPools(Array.isArray(poolData) ? poolData : []);
    } finally {
      setLoading(false);
    }
  }, [activeFilters]);

  useEffect(() => { fetchData(); fetchMacNotes(); }, [fetchData, fetchMacNotes]);

  const handleSearch = async () => {
    try {
      const values = await filterForm.validateFields();
      setActiveFilters({
        poolId: values.pool_id || 'ALL',
        enabled: values.enabled || 'ALL',
        ipStart: values.ip_start || '',
        ipEnd: values.ip_end || '',
        mac: values.mac || '',
        hostname: values.hostname || '',
      });
    } catch { /* validation */ }
  };

  const handleReset = () => {
    filterForm.resetFields();
    filterForm.setFieldsValue({ pool_id: 'ALL', enabled: 'ALL', ip_start: '', ip_end: '', mac: '', hostname: '' });
    setActiveFilters({ poolId: 'ALL', enabled: 'ALL', ipStart: '', ipEnd: '', mac: '', hostname: '' });
  };

  const handleAdd = () => {
    setEditingRecord(null);
    setSubmitError('');
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (record: any) => {
    setEditingRecord(record);
    setSubmitError('');
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleMacSelect = async (mac: string) => {
    try {
      const [infoRes, noteRes] = await Promise.all([
        fetch(`/api/mac-info?mac=${encodeURIComponent(mac)}`),
        fetch(`/api/mac-notes/${encodeURIComponent(mac)}`),
      ]);
      const fieldsToSet: Record<string, any> = {};
      if (infoRes.ok) {
        const info = await infoRes.json();
        if (info.ip_address) fieldsToSet.ip_address = info.ip_address;
        if (info.pool_id) fieldsToSet.pool_id = info.pool_id;
        if (info.hostname) fieldsToSet.hostname = info.hostname;
      }
      if (noteRes.ok) {
        const noteData = await noteRes.json();
        if (noteData?.note) fieldsToSet.description = noteData.note;
      }
      if (Object.keys(fieldsToSet).length > 0) form.setFieldsValue(fieldsToSet);
    } catch { /* ignore */ }
  };

  const handleSubmit = async () => {
    try {
      setSubmitError('');
      const values = await form.validateFields();
      const url = editingRecord ? `/api/reservations/${editingRecord.id}` : '/api/reservations';
      const method = editingRecord ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const result = await res.json();
      if (!res.ok) {
        const errMsg = translateError(result.error, tc) || tc('error');
        setSubmitError(errMsg);
        return;
      }

      notify.success(editingRecord ? tc('updateSuccess') : tc('createSuccess'));
      setModalOpen(false);
      setSubmitError('');
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return; // form validation, handled by Ant Design
      const errMsg = err?.message || tc('error');
      setSubmitError(errMsg);
    }
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/reservations/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      notify.error(result.error);
      return;
    }
    notify.success(tc('deleteSuccess'));
    fetchData();
  };

  const handleToggleEnabled = async (id: number, enabled: boolean) => {
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        notify.error(result.error);
        return;
      }
      fetchData();
    } catch {
      notify.error(null);
    }
  };

  const columns = [
    { title: t('macAddress'), dataIndex: 'mac_address', key: 'mac_address', width: 200,
      render: (mac: string) => <MacAddress mac={mac} macNotes={macNotes} onNoteUpdate={fetchMacNotes} /> },
    { title: t('ipAddress'), dataIndex: 'ip_address', key: 'ip_address', width: 130 },
    { title: t('hostname'), dataIndex: 'hostname', key: 'hostname', width: 120 },
    { title: t('pool'), dataIndex: 'pool_name', key: 'pool_name', width: 100 },
    { title: t('description'), dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: t('status'), key: 'status', width: 90,
      render: (_: any, r: any) => (
        <Switch checked={!!r.enabled} onChange={(v) => handleToggleEnabled(r.id, v)} size="small"
          checkedChildren={t('enabled')} unCheckedChildren={t('disabled')} />
      ),
    },
    {
      title: tc('actions'), key: 'actions', width: 100, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(r)} aria-label={tc('edit')} />
          <Popconfirm title={t('deleteConfirm')} onConfirm={() => handleDelete(r.id)}>
            <Button icon={<DeleteOutlined />} size="small" danger aria-label={tc('delete')} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div className="page-title-bar" style={{ justifyContent: 'space-between' }}>
        <Title level={3} style={{ margin: 0 }}>{t('title')}</Title>
        <Space>
          <Button
            size="small"
            icon={filterOpen ? <UpOutlined /> : <DownOutlined />}
            onClick={() => setFilterOpen(!filterOpen)}
          >
            {t('filter')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} size="small" onClick={handleAdd}>{t('addReservation')}</Button>
        </Space>
      </div>

      {filterOpen && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Form form={filterForm} layout="inline" initialValues={{ pool_id: 'ALL', enabled: 'ALL', ip_start: '', ip_end: '', mac: '', hostname: '' }}>
            <Form.Item name="pool_id" label={t('pool')}>
              <Select style={{ width: 160 }} size="small" allowClear>
                <Select.Option value="ALL">{t('allPools')}</Select.Option>
                {pools.map((p: any) => (
                  <Select.Option key={p.id} value={String(p.id)}>{p.name}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="enabled" label={t('status')}>
              <Select style={{ width: 130 }} size="small" allowClear>
                <Select.Option value="ALL">{t('allStates')}</Select.Option>
                <Select.Option value="1">{t('enabled')}</Select.Option>
                <Select.Option value="0">{t('disabled')}</Select.Option>
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

      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ showSizeChanger: true, pageSizeOptions: [20, 50, 100], defaultPageSize: 20 }} />

      <Modal title={editingRecord ? t('editReservation') : t('addReservation')} open={modalOpen}
        onOk={handleSubmit} onCancel={() => setModalOpen(false)} width={600}>
        {submitError && (
          <Alert type="error" message={submitError} closable
            onClose={() => setSubmitError('')} style={{ marginBottom: 16 }} />
        )}
        <Form form={form} layout="vertical">
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Form.Item name="mac_address" label={t('macAddress')} rules={[{ required: true, message: tc('requiredField') }]}
              style={{ flex: 1 }}>
              <MacInput placeholder={t('macPlaceholder')} knownMacs={data.map((r: any) => r.mac_address)}
                onSelect={handleMacSelect} />
            </Form.Item>
            <Button style={{ marginTop: 30 }} onClick={() => {
              const hex = Array.from({ length: 3 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(':').toUpperCase();
              const mac = `FF:FF:FF:${hex}`;
              form.setFieldsValue({ mac_address: mac, description: t('randomMacNote') });
            }}>{t('randomMac')}</Button>
          </div>
          <Form.Item name="ip_address" label={t('ipAddress')} rules={[{ required: true }, ipRule]}>
            <Input />
          </Form.Item>
          <Form.Item name="pool_id" label={t('pool')} rules={[{ required: true }]}>
            <Select placeholder={t('selectPool')}>
              {pools.map((p: any) => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="hostname" label={t('hostname')}><Input /></Form.Item>
          <Form.Item name="description" label={t('description')}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
