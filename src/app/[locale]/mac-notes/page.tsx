'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Table, Button, Modal, Form, Input, Popconfirm, Space, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import MacInput from '@/components/MacInput';
import { useNotify } from '@/hooks/useNotify';
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
  const [activeFilters, setActiveFilters] = useState({ mac: '', note: '' });
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterForm] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMac, setEditingMac] = useState<string | null>(null);
  const [form] = Form.useForm();
  const notify = useNotify();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const searchParams = new URLSearchParams();
      if (activeFilters.mac) searchParams.set('mac', activeFilters.mac);
      if (activeFilters.note) searchParams.set('note', activeFilters.note);
      const res = await fetch(`/api/mac-notes?${searchParams}`);
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
  }, [activeFilters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSearch = async () => {
    try {
      const values = await filterForm.validateFields();
      setActiveFilters({
        mac: values.mac || '',
        note: values.note || '',
      });
    } catch { /* validation */ }
  };

  const handleReset = () => {
    filterForm.resetFields();
    filterForm.setFieldsValue({ mac: '', note: '' });
    setActiveFilters({ mac: '', note: '' });
  };

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
          notify.error(result.error);
          return;
        }
        notify.success(tc('updateSuccess'));
      } else {
        // Create new
        const res = await fetch('/api/mac-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mac_address: mac, note }),
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
    const res = await fetch(`/api/mac-notes/${encodeURIComponent(mac)}`, { method: 'DELETE' });
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      notify.error(result.error);
      return;
    }
    notify.success(tc('deleteSuccess'));
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
        <Space>
          <Button
            size="small"
            icon={filterOpen ? <UpOutlined /> : <DownOutlined />}
            onClick={() => setFilterOpen(!filterOpen)}
          >
            {t('filter')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} size="small" onClick={handleAdd}>{t('addNote')}</Button>
        </Space>
      </div>

      {filterOpen && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Form form={filterForm} layout="inline" initialValues={{ mac: '', note: '' }}>
            <Form.Item name="mac" label={t('macAddress')}>
              <Input size="small" placeholder={t('macPlaceholder')} style={{ width: 180 }} allowClear />
            </Form.Item>
            <Form.Item name="note" label={t('note')}>
              <Input size="small" placeholder={t('placeholder')} style={{ width: 200 }} allowClear />
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

      <Table columns={columns} dataSource={data} rowKey="mac_address" loading={loading}
        size="small" scroll={{ x: 'max-content' }}
        pagination={{ showSizeChanger: true, pageSizeOptions: [20, 50, 100], defaultPageSize: 20 }} />

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
