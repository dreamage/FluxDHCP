'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Table, Button, Modal, Form, Input, Popconfirm, Space, Switch } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import MacInput from '@/components/MacInput';
import MacAddress from '@/components/MacAddress';
import { useMacNotes } from '@/hooks/useMacNotes';
import { useNotify } from '@/hooks/useNotify';

const { Title } = Typography;

interface MacBlacklistRow {
  mac_address: string;
  reason: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export default function MacBlacklistPage() {
  const t = useTranslations('macBlacklist');
  const tc = useTranslations('common');
  const [data, setData] = useState<MacBlacklistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMac, setEditingMac] = useState<string | null>(null);
  const [form] = Form.useForm();
  const { macNotes, fetchMacNotes } = useMacNotes();
  const notify = useNotify();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mac-blacklist');
      if (res.ok) {
        const rows = await res.json();
        setData(rows);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); fetchMacNotes(); }, [fetchData, fetchMacNotes]);

  const handleAdd = () => {
    setEditingMac(null);
    form.resetFields();
    form.setFieldsValue({ enabled: true });
    setModalOpen(true);
  };

  const handleEdit = (record: MacBlacklistRow) => {
    setEditingMac(record.mac_address);
    form.setFieldsValue({
      mac_address: record.mac_address,
      reason: record.reason,
      enabled: !!record.enabled,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const mac = values.mac_address;
      const reason = values.reason || '';
      const enabled = values.enabled ? 1 : 0;

      if (editingMac) {
        const res = await fetch(`/api/mac-blacklist/${encodeURIComponent(editingMac)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason, enabled }),
        });
        const result = await res.json();
        if (!res.ok) {
          notify.error(result.error);
          return;
        }
        notify.success(tc('updateSuccess'));
      } else {
        const res = await fetch('/api/mac-blacklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mac_address: mac, reason, enabled }),
        });
        const result = await res.json();
        if (!res.ok) {
          notify.error(result.error);
          return;
        }
        notify.success(tc('createSuccess'));
      }

      setModalOpen(false);
      fetchData();
    } catch { /* validation */ }
  };

  const handleDelete = async (mac: string) => {
    const res = await fetch(`/api/mac-blacklist/${encodeURIComponent(mac)}`, { method: 'DELETE' });
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      notify.error(result.error);
      return;
    }
    notify.success(tc('deleteSuccess'));
    fetchData();
  };

  const handleToggleEnabled = async (record: MacBlacklistRow, checked: boolean) => {
    const res = await fetch(`/api/mac-blacklist/${encodeURIComponent(record.mac_address)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: checked ? 1 : 0 }),
    });
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      notify.error(result.error);
      return;
    }
    fetchData();
  };

  const columns = [
    {
      title: t('macAddress'), dataIndex: 'mac_address', key: 'mac_address', width: 280,
      render: (mac: string) => <MacAddress mac={mac} macNotes={macNotes} onNoteUpdate={fetchMacNotes} />,
      sorter: (a: MacBlacklistRow, b: MacBlacklistRow) => a.mac_address.localeCompare(b.mac_address),
    },
    {
      title: t('reason'), dataIndex: 'reason', key: 'reason',
      render: (reason: string) => reason || '-',
      sorter: (a: MacBlacklistRow, b: MacBlacklistRow) => (a.reason || '').localeCompare(b.reason || ''),
    },
    {
      title: t('enabled'), dataIndex: 'enabled', key: 'enabled', width: 100, align: 'center' as const,
      render: (enabled: number, record: MacBlacklistRow) => (
        <Switch size="small" checked={!!enabled} onChange={(checked) => handleToggleEnabled(record, checked)} />
      ),
    },
    {
      title: tc('actions'), key: 'actions', width: 100, fixed: 'right' as const,
      render: (_: any, r: MacBlacklistRow) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(r)} aria-label={tc('edit')} />
          <Popconfirm title={t('deleteConfirm')} onConfirm={() => handleDelete(r.mac_address)}>
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
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={handleAdd}>{t('addEntry')}</Button>
      </div>

      <Table columns={columns} dataSource={data} rowKey="mac_address" loading={loading}
        size="small" scroll={{ x: 'max-content' }}
        pagination={{ showSizeChanger: true, pageSizeOptions: [20, 50, 100], defaultPageSize: 20 }} />

      <Modal title={editingMac ? t('editEntry') : t('addEntry')} open={modalOpen}
        onOk={handleSubmit} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="mac_address" label={t('macAddress')}
            rules={[{ required: true, message: tc('requiredField') }]}>
            <MacInput placeholder={t('macPlaceholder')} disabled={!!editingMac} />
          </Form.Item>
          <Form.Item name="reason" label={t('reason')}>
            <Input.TextArea rows={3} placeholder={t('reasonPlaceholder')} />
          </Form.Item>
          <Form.Item name="enabled" label={t('enabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
