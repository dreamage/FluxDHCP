'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Table, Button, Modal, Form, Input, Switch, Popconfirm, Select, Space, Alert } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import MacAddress from '@/components/MacAddress';
import MacInput from '@/components/MacInput';
import { translateError } from '@/lib/error-map';
import { useMacNotes } from '@/hooks/useMacNotes';
import { useNotify } from '@/hooks/useNotify';
import { isValidIPv4, ipToNum } from '@/lib/ip-utils';
import { ipRule, ipRangeRules } from '@/lib/validators';
import { useTableFilters } from '@/hooks/useTableFilters';
import FilterPanel from '@/components/FilterPanel';

const { Title } = Typography;

export default function ReservationsPage() {
  const t = useTranslations('reservations');
  const tc = useTranslations('common');
  const ruleSet = ipRangeRules(t, tc);

  const [data, setData] = useState<any[]>([]);
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { activeFilters, filterOpen, setFilterOpen, filterForm, handleSearch, handleReset } =
    useTableFilters({ poolId: 'ALL', enabled: 'ALL', ipStart: '', ipEnd: '', mac: '', hostname: '' });
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
      setError('');
    } catch {
      setError(tc('errFailedFetch'));
    } finally {
      setLoading(false);
    }
  }, [activeFilters, tc]);

  useEffect(() => { fetchData(); fetchMacNotes(); }, [fetchData, fetchMacNotes]);

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
          <Button type="primary" icon={<PlusOutlined />} size="small" onClick={handleAdd}>{t('addReservation')}</Button>
          <FilterPanel
            open={filterOpen}
            onToggle={() => setFilterOpen(!filterOpen)}
            label={t('filter')}
            form={filterForm}
            initialValues={{ poolId: 'ALL', enabled: 'ALL', ipStart: '', ipEnd: '', mac: '', hostname: '' }}
            onFinish={handleSearch}
            onSearch={handleSearch}
            onReset={handleReset}
          >
            <Form.Item name="poolId" label={t('pool')}>
              <Select style={{ width: 160 }} size="small" allowClear>
                <Select.Option value="ALL">{t('allPools')}</Select.Option>
                {pools.map((p: any) => (
                  <Select.Option key={p.id} value={String(p.id)}>{p.name}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="enabled" label={t('status')}>
              <Select style={{ width: 130 }} size="small" allowClear>
                <Select.Option value="ALL">{tc('allStates')}</Select.Option>
                <Select.Option value="1">{t('enabled')}</Select.Option>
                <Select.Option value="0">{t('disabled')}</Select.Option>
              </Select>
            </Form.Item>
          <Form.Item name="ipStart" label={t('ipRange')} dependencies={['ipEnd']}
            rules={ruleSet.start}>
            <Input size="small" placeholder={t('ipStartPlaceholder')} style={{ width: 150 }} />
          </Form.Item>
          <span style={{ alignSelf: 'center', color: 'var(--color-text-secondary)' }}>~</span>
          <Form.Item name="ipEnd" dependencies={['ipStart']}
            rules={ruleSet.end}>
            <Input size="small" placeholder={t('ipEndPlaceholder')} style={{ width: 150 }} />
          </Form.Item>
            <Form.Item name="mac" label={t('macAddress')}>
              <Input size="small" placeholder={tc('macFilterPlaceholder')} style={{ width: 180 }} allowClear />
            </Form.Item>
            <Form.Item name="hostname" label={t('hostname')}>
              <Input size="small" placeholder={t('hostnamePlaceholder')} style={{ width: 150 }} allowClear />
            </Form.Item>
          </FilterPanel>
        </Space>
      </div>

      {error && <Alert type="error" message={error} closable onClose={() => setError('')} style={{ marginBottom: 12 }} />}
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small"
        locale={{ emptyText: (activeFilters.poolId !== 'ALL' || activeFilters.enabled !== 'ALL' || activeFilters.mac || activeFilters.hostname || activeFilters.ipStart) ? tc('noFilterResults') : tc('noData') }}
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
          <Form.Item name="ip_address" label={t('ipAddress')} rules={[{ required: true }, ipRule(tc)]}>
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
