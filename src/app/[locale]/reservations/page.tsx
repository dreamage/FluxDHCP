'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Table, Button, Modal, Form, Input, Switch, Popconfirm, Select, message, Space, Alert } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import MacAddress from '@/components/MacAddress';
import MacInput from '@/components/MacInput';
import { translateError } from '@/lib/error-map';
import { useMacNotes } from '@/hooks/useMacNotes';

const { Title } = Typography;

export default function ReservationsPage() {
  const t = useTranslations('reservations');
  const tc = useTranslations('common');
  const ipRule = { pattern: /^(\d{1,3}\.){3}\d{1,3}$/, message: tc('invalidIpv4') };
  const [data, setData] = useState<any[]>([]);
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [submitError, setSubmitError] = useState('');
  const { macNotes, fetchMacNotes } = useMacNotes();
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resRes, poolRes] = await Promise.all([fetch('/api/reservations'), fetch('/api/pools')]);
      const resData = await resRes.json();
      const poolData = await poolRes.json();
      setData(Array.isArray(resData) ? resData : []);
      setPools(Array.isArray(poolData) ? poolData : []);
    } finally {
      setLoading(false);
    }
  }, []);

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
        message.error(errMsg);
        return;
      }

      message.success(editingRecord ? tc('updateSuccess') : tc('createSuccess'));
      setModalOpen(false);
      setSubmitError('');
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return; // form validation, handled by Ant Design
      const errMsg = err?.message || tc('error');
      setSubmitError(errMsg);
      message.error(errMsg);
    }
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/reservations/${id}`, { method: 'DELETE' });
    if (!res.ok) { message.error(tc('error')); return; }
    message.success(tc('deleteSuccess'));
    fetchData();
  };

  const handleToggleEnabled = async (id: number, enabled: boolean) => {
    try {
      const res = await fetch(`/api/reservations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error('Failed');
      fetchData();
    } catch {
      message.error(tc('error'));
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
        <Switch checked={!!r.enabled} onChange={(v) => handleToggleEnabled(r.id, v)}
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
      <div className="page-title-bar" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>{t('title')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('addReservation')}</Button>
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], defaultPageSize: 20 }} />

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
