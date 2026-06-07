'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Table, Button, Modal, Form, Input, Popconfirm, message, Space, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TagOutlined } from '@ant-design/icons';
import MacInput from '@/components/MacInput';
import { translateError } from '@/lib/error-map';
import { formatLocalTime } from '@/lib/format-time';

const { Title, Text } = Typography;

interface MacNoteRow {
  mac_address: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export default function MacNotesPage() {
  const t = useTranslations('macNotes');
  const tc = useTranslations('common');
  const [data, setData] = useState<MacNoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMac, setEditingMac] = useState<string | null>(null);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mac-notes');
      if (res.ok) {
        const map = await res.json();
        const rows: MacNoteRow[] = Object.entries(map).map(([mac_address, note]) => ({
          mac_address,
          note: note as string,
          created_at: '',
          updated_at: '',
        }));
        setData(rows);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAdd = () => {
    setEditingMac(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (record: MacNoteRow) => {
    setEditingMac(record.mac_address);
    form.setFieldsValue({ mac_address: record.mac_address, note: record.note });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const mac = values.mac_address;
      const note = values.note;

      if (editingMac) {
        // Update existing
        const res = await fetch(`/api/mac-notes/${encodeURIComponent(editingMac)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note }),
        });
        const result = await res.json();
        if (!res.ok) {
          message.error(translateError(result.error, tc) || tc('error'));
          return;
        }
        message.success(tc('updateSuccess'));
      } else {
        // Create new
        const res = await fetch('/api/mac-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mac_address: mac, note }),
        });
        const result = await res.json();
        if (!res.ok) {
          message.error(translateError(result.error, tc) || tc('error'));
          return;
        }
        message.success(tc('createSuccess'));
      }

      setModalOpen(false);
      fetchData();
    } catch { /* validation */ }
  };

  const handleDelete = async (mac: string) => {
    const res = await fetch(`/api/mac-notes/${encodeURIComponent(mac)}`, { method: 'DELETE' });
    if (!res.ok) {
      message.error(tc('error'));
      return;
    }
    message.success(tc('deleteSuccess'));
    fetchData();
  };

  const columns = [
    {
      title: t('macAddress'), dataIndex: 'mac_address', key: 'mac_address', width: 220,
      render: (mac: string) => <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: 13 }}>{mac}</span>,
      sorter: (a: MacNoteRow, b: MacNoteRow) => a.mac_address.localeCompare(b.mac_address),
    },
    {
      title: t('note'), dataIndex: 'note', key: 'note',
      sorter: (a: MacNoteRow, b: MacNoteRow) => (a.note || '').localeCompare(b.note || ''),
      render: (note: string) => <Text>{note}</Text>,
    },
    {
      title: tc('actions'), key: 'actions', width: 100, fixed: 'right' as const,
      render: (_: any, r: MacNoteRow) => (
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
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('addNote')}</Button>
      </div>

      <Table columns={columns} dataSource={data} rowKey="mac_address" loading={loading}
        size="small" scroll={{ x: 'max-content' }}
        pagination={{ showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], defaultPageSize: 20 }} />

      <Modal title={editingMac ? t('editNote') : t('addNote')} open={modalOpen}
        onOk={handleSubmit} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="mac_address" label={t('macAddress')}
            rules={[{ required: true, message: tc('requiredField') }]}>
            <MacInput placeholder={t('macPlaceholder')} disabled={!!editingMac} />
          </Form.Item>
          <Form.Item name="note" label={t('note')}
            rules={[{ required: true, message: tc('requiredField') }]}>
            <Input.TextArea rows={3} placeholder={t('placeholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
