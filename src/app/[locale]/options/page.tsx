'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Table, Button, Modal, Form, Input, InputNumber, Popconfirm, Select, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import MacAddress from '@/components/MacAddress';
import MacInput from '@/components/MacInput';
import { useNotify } from '@/hooks/useNotify';
import { useMacNotes } from '@/hooks/useMacNotes';

const { Title } = Typography;

// 常用 DHCP 选项码
const COMMON_OPTIONS = [
  { value: 1, label: '1 - Subnet Mask' },
  { value: 3, label: '3 - Router/Gateway' },
  { value: 6, label: '6 - DNS Server' },
  { value: 12, label: '12 - Host Name' },
  { value: 15, label: '15 - Domain Name' },
  { value: 28, label: '28 - Broadcast Address' },
  { value: 42, label: '42 - NTP Server' },
  { value: 66, label: '66 - TFTP Server' },
  { value: 119, label: '119 - Domain Search' },
];

export default function OptionsPage() {
  const t = useTranslations('options');
  const tc = useTranslations('common');
  const tOpt = useTranslations('dhcpOptionCodes');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const { macNotes, fetchMacNotes } = useMacNotes();
  const [form] = Form.useForm();
  const notify = useNotify();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/options');
      const result = await res.json();
      setData(Array.isArray(result) ? result : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); fetchMacNotes(); }, [fetchData, fetchMacNotes]);

  const handleAdd = () => {
    setEditingRecord(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (record: any) => {
    setEditingRecord(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const url = editingRecord ? `/api/options/${editingRecord.id}` : '/api/options';
      const method = editingRecord ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const result = await res.json();
      if (!res.ok) { notify.error(result.error); return; }

      notify.success(editingRecord ? tc('updateSuccess') : tc('createSuccess'));
      setModalOpen(false);
      fetchData();
    } catch { /* validation */ }
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/options/${id}`, { method: 'DELETE' });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) { notify.error(result.error); return; }
    notify.success(tc('deleteSuccess'));
    fetchData();
  };

  const columns = [
    { title: t('macAddress'), dataIndex: 'mac_address', key: 'mac_address', width: 200,
      render: (mac: string) => <MacAddress mac={mac} macNotes={macNotes} onNoteUpdate={fetchMacNotes} /> },
    { title: t('optionCode'), dataIndex: 'option_code', key: 'option_code', width: 140,
      render: (code: number) => {
        let label = '';
        try { label = tOpt(String(code)); } catch { /* no translation */ }
        return label && label !== String(code) ? `${code} - ${label}` : String(code);
      } },
    { title: t('optionName'), dataIndex: 'option_name', key: 'option_name', width: 120 },
    { title: t('optionValue'), dataIndex: 'option_value', key: 'option_value' },
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
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={handleAdd}>{t('addOption')}</Button>
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ showSizeChanger: true, pageSizeOptions: [20, 50, 100], defaultPageSize: 20 }} />

      <Modal title={editingRecord ? t('editOption') : t('addOption')} open={modalOpen}
        onOk={handleSubmit} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="mac_address" label={t('macAddress')}
            rules={[{ required: true, message: tc('requiredField') }]}>
            <MacInput placeholder={t('macPlaceholder')} disabled={!!editingRecord}
              knownMacs={data.map((r: any) => r.mac_address)} />
          </Form.Item>
          <Form.Item name="option_code" label={t('optionCode')} rules={[{ required: true }]}>
            <Select showSearch disabled={!!editingRecord}
              optionFilterProp="label"
              options={COMMON_OPTIONS.map(opt => ({
                value: opt.value,
                label: `${opt.value} - ${(() => { try { return tOpt(String(opt.value)); } catch { return opt.label.split(' - ')[1]; } })()}`,
              }))}
              dropdownRender={(menu) => (
                <>
                  {menu}
                  <div style={{ padding: '4px 8px', borderTop: '1px solid #d9d9d9' }}>
                    <InputNumber min={1} max={254} placeholder={t('customCode')}
                      style={{ width: '100%' }}
                      onPressEnter={(e) => {
                        const v = parseInt((e.target as HTMLInputElement).value, 10);
                        if (v >= 1 && v <= 254) form.setFieldValue('option_code', v);
                      }} />
                  </div>
                </>
              )} />
          </Form.Item>
          <Form.Item name="option_name" label={t('optionName')}><Input /></Form.Item>
          <Form.Item name="option_value" label={t('optionValue')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
