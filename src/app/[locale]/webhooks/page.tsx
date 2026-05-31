'use client';

import React, { use, useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Table, Button, Modal, Form, Input, Select, Switch, Popconfirm, message, Space, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SendOutlined, MinusCircleOutlined } from '@ant-design/icons';
import AppLayout from '@/components/AppLayout';
import { translateError } from '@/lib/error-map';

const { Title } = Typography;

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

const TEMPLATE_HINTS = [
  '{{mac_address}}', '{{ip_address}}', '{{hostname}}',
  '{{message_type}}', '{{pool_name}}', '{{mac_note}}', '{{timestamp}}',
];

export default function WebhooksPage({ params }: { params: Promise<{ locale: string }> }) {
  const t = useTranslations('webhook');
  const tc = useTranslations('common');
  const { locale } = use(params);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [form] = Form.useForm();

  const method = Form.useWatch('method', form) || 'POST';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/webhooks');
      const result = await res.json();
      setData(Array.isArray(result) ? result : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAdd = () => {
    setEditingRecord(null);
    form.resetFields();
    form.setFieldsValue({ method: 'POST', body_mode: 'json', events: [], fields: [{ name: '', value: '' }] });
    setModalOpen(true);
  };

  const handleEdit = (record: any) => {
    setEditingRecord(record);
    const fields = Array.isArray(record.fields) ? record.fields : JSON.parse(record.fields || '[]');
    form.setFieldsValue({
      ...record,
      events: Array.isArray(record.events) ? record.events : JSON.parse(record.events || '[]'),
      fields: fields.length > 0 ? fields : [{ name: '', value: '' }],
      body_mode: record.body_mode || 'json',
      headers: typeof record.headers === 'string' ? record.headers : JSON.stringify(record.headers || {}),
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      let parsedHeaders = values.headers;
      if (typeof parsedHeaders === 'string') {
        try { parsedHeaders = JSON.parse(parsedHeaders || '{}'); }
        catch { message.error(tc('invalidJson')); return; }
      }
      // Filter out empty fields
      const fields = (values.fields || []).filter((f: any) => f && f.name);
      const url = editingRecord ? `/api/webhooks/${editingRecord.id}` : '/api/webhooks';
      const method = editingRecord ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, fields, headers: parsedHeaders }),
      });
      const result = await res.json();
      if (!res.ok) { message.error(translateError(result.error, tc) || tc('error')); return; }
      message.success(editingRecord ? tc('updateSuccess') : tc('createSuccess'));
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || tc('error'));
    }
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
    if (!res.ok) { message.error(tc('error')); return; }
    message.success(tc('deleteSuccess'));
    fetchData();
  };

  const handleToggleEnabled = async (id: number, enabled: boolean) => {
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error('Failed');
      fetchData();
    } catch {
      message.error(tc('error'));
    }
  };

  const handleTest = async (id: number) => {
    try {
      const res = await fetch('/api/webhooks/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const result = await res.json();
      message[result.success ? 'success' : 'error'](`${t(result.success ? 'testSuccess' : 'testFail')}${result.message ? ': ' + result.message : ''}`);
    } catch (err: any) {
      message.error(`${t('testFail')}: ${err?.message || tc('unknownError')}`);
    }
  };

  const columns = [
    { title: t('name'), dataIndex: 'name', key: 'name', width: 120 },
    { title: t('url'), dataIndex: 'url', key: 'url', ellipsis: true, render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
    { title: t('method'), dataIndex: 'method', key: 'method', width: 70, render: (v: string) => <Tag color={v === 'POST' ? 'blue' : 'green'}>{v}</Tag> },
    { title: t('events'), dataIndex: 'events', key: 'events', width: 180,
      render: (v: any) => { const events = Array.isArray(v) ? v : JSON.parse(v || '[]'); return <Space wrap size={4}>{events.map((e: string) => <Tag key={e} color="blue" style={{ fontSize: 11 }}>{e.replace('dhcp_', '').toUpperCase()}</Tag>)}</Space>; },
    },
    { title: t('enabled'), key: 'enabled', width: 80,
      render: (_: any, r: any) => <Switch checked={!!r.enabled} onChange={(v) => handleToggleEnabled(r.id, v)} size="small" />,
    },
    { title: tc('actions'), key: 'actions', width: 120, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space>
          <Button icon={<SendOutlined />} size="small" onClick={() => handleTest(r.id)} title={t('test')} />
          <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(r)} />
          <Popconfirm title={t('deleteConfirm')} onConfirm={() => handleDelete(r.id)}>
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <AppLayout locale={locale} onLocaleChange={() => {}}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>{t('title')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('addWebhook')}</Button>
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], defaultPageSize: 20 }} />

      <Modal title={editingRecord ? t('editWebhook') : t('addWebhook')} open={modalOpen}
        onOk={handleSubmit} onCancel={() => setModalOpen(false)} width={640}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('name')} rules={[{ required: true }]}><Input placeholder={t('namePlaceholder')} /></Form.Item>
          <Form.Item name="url" label={t('url')} rules={[{ required: true }]}><Input placeholder={t('urlPlaceholder')} /></Form.Item>
          <Space style={{ width: '100%' }} align="start">
            <Form.Item name="method" label={t('method')} rules={[{ required: true }]} style={{ width: 120 }}>
              <Select><Select.Option value="POST">POST</Select.Option><Select.Option value="GET">GET</Select.Option></Select>
            </Form.Item>
            {method === 'POST' && (
              <Form.Item name="body_mode" label={t('bodyMode')} style={{ width: 160 }}>
                <Select>
                  <Select.Option value="json">JSON</Select.Option>
                  <Select.Option value="form">Form</Select.Option>
                </Select>
              </Form.Item>
            )}
          </Space>
          <Form.Item name="events" label={t('events')} rules={[{ required: true, message: tc('requiredField') }]}>
            <Select mode="multiple" placeholder={t('events')}>
              {EVENT_OPTIONS.map(opt => <Select.Option key={opt.value} value={opt.value}>{t(opt.labelKey)}</Select.Option>)}
            </Select>
          </Form.Item>

          <div style={{ marginBottom: 8 }}>
            <strong>{method === 'GET' ? t('queryParams') : t('bodyFields')}</strong>
            <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 8 }}>{t('templateHint')}: {TEMPLATE_HINTS.join(' ')}</span>
          </div>
          <Form.List name="fields">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <Space key={key} style={{ display: 'flex', marginBottom: 4 }} align="baseline">
                    <Form.Item name={[name, 'name']} noStyle>
                      <Input placeholder={t('fieldName')} style={{ width: 180 }} />
                    </Form.Item>
                    <Form.Item name={[name, 'value']} noStyle>
                      <Input placeholder={t('fieldValue')} style={{ width: 280 }} />
                    </Form.Item>
                    {fields.length > 1 && <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ef4444' }} />}
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} style={{ marginTop: 4 }}>
                  {t('addField')}
                </Button>
              </>
            )}
          </Form.List>

          <Form.Item name="secret" label={t('secret')} style={{ marginTop: 12 }}>
            <Input.Password placeholder={t('secretPlaceholder')} />
          </Form.Item>
          <Form.Item name="headers" label={t('headers')}>
            <Input.TextArea rows={2} placeholder={t('headersPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </AppLayout>
  );
}
