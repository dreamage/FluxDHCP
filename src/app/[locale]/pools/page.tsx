'use client';

import React, { use, useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Table, Button, Modal, Form, Input, InputNumber, Switch, Tag, Popconfirm, Select, message, Space, Row, Col, Spin } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ColumnHeightOutlined, ExpandOutlined, ShrinkOutlined } from '@ant-design/icons';
import AppLayout from '@/components/AppLayout';
import { translateError } from '@/lib/error-map';

const { Title } = Typography;

function formatLeaseTime(seconds: number, t: (key: string) => string): string {
  if (seconds < 60) return `${seconds}${t('seconds')}`;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}${t('days')}`);
  if (h > 0) parts.push(`${h}${t('hours')}`);
  if (m > 0 && d === 0) parts.push(`${m}${t('minutes')}`);
  return parts.length > 0 ? `${seconds} (${parts.join('')})` : `${seconds}${t('seconds')}`;
}

export default function PoolsPage({ params }: { params: Promise<{ locale: string }> }) {
  const t = useTranslations('pools');
  const tc = useTranslations('common');
  const { locale } = use(params);
  const ipRule = { pattern: /^(\d{1,3}\.){3}\d{1,3}$/, message: tc('invalidIpv4') };
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<any>(null);
  const [ipGridData, setIpGridData] = useState<Record<number, { ips: any[]; stats: any }>>({});
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);
  const [ipLoading, setIpLoading] = useState<Record<number, boolean>>({});
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pools');
      const result = await res.json();
      const pools = Array.isArray(result) ? result : [];
      setData(pools);
      // Auto-expand all pools
      const allIds = pools.map((p: any) => p.id);
      setExpandedRowKeys(allIds);
      allIds.forEach((id: number) => fetchPoolIPs(id));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAdd = () => {
    setEditingPool(null);
    form.resetFields();
    form.setFieldsValue({ lease_time: 86400 });
    setModalOpen(true);
  };

  const handleEdit = (record: any) => {
    setEditingPool(record);
    form.setFieldsValue({
      ...record,
      dns_servers: record.dns_servers || [],
      lease_time: record.lease_time,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const url = editingPool ? `/api/pools/${editingPool.id}` : '/api/pools';
      const method = editingPool ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const result = await res.json();
      if (!res.ok) {
        message.error(translateError(result.error, tc) || tc('error'));
        return;
      }

      message.success(editingPool ? tc('updateSuccess') : tc('createSuccess'));
      setModalOpen(false);
      fetchData();
    } catch { /* validation error */ }
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/pools/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) {
      message.error(translateError(result.error, tc) || tc('error'));
      return;
    }
    message.success(tc('deleteSuccess'));
    fetchData();
  };

  const handleToggleEnabled = async (id: number, enabled: boolean) => {
    try {
      const res = await fetch(`/api/pools/${id}`, {
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

  const fetchPoolIPs = async (poolId: number) => {
    if (ipGridData[poolId]) return;
    setIpLoading(prev => ({ ...prev, [poolId]: true }));
    try {
      const res = await fetch(`/api/pools/${poolId}/ips`);
      const result = await res.json();
      setIpGridData(prev => ({ ...prev, [poolId]: result }));
    } finally {
      setIpLoading(prev => ({ ...prev, [poolId]: false }));
    }
  };

  const handleExpand = (expanded: boolean, record: any) => {
    if (expanded) {
      setExpandedRowKeys(prev => [...prev, record.id]);
      fetchPoolIPs(record.id);
    } else {
      setExpandedRowKeys(prev => prev.filter(k => k !== record.id));
    }
  };

  const STATUS_COLORS: Record<string, string> = {
    free: 'var(--color-ip-free)',
    reserved: 'var(--color-ip-reserved)',
    bound: 'var(--color-ip-bound)',
    offered: 'var(--color-ip-offered)',
  };

  const expandedRowRender = (record: any) => {
    const gridData = ipGridData[record.id];
    if (ipLoading[record.id]) return <Spin style={{ padding: 16 }} />;
    if (!gridData) return null;

    const { ips, stats } = gridData;
    return (
      <div style={{ padding: '8px 16px' }}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Tag color="default">{t('statsTotal')}: {ips.length}</Tag>
          <Tag color="default">{t('statsFree')}: {stats.free}</Tag>
          <Tag color="warning">{t('statsReserved')}: {stats.reserved}</Tag>
          <Tag color="success">{t('statsBound')}: {stats.bound}</Tag>
          <Tag color="processing">{t('statsOffered')}: {stats.offered}</Tag>
          <span style={{ marginLeft: 8 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, background: STATUS_COLORS.free, marginRight: 4, borderRadius: 2 }} />
            <span style={{ display: 'inline-block', width: 12, height: 12, background: STATUS_COLORS.reserved, marginRight: 4, borderRadius: 2 }} />
            <span style={{ display: 'inline-block', width: 12, height: 12, background: STATUS_COLORS.bound, marginRight: 4, borderRadius: 2 }} />
            <span style={{ display: 'inline-block', width: 12, height: 12, background: STATUS_COLORS.offered, marginRight: 4, borderRadius: 2 }} />
          </span>
        </Space>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {ips.map((item: any) => {
            const lastOctet = item.ip.split('.').pop();
            return (
              <div key={item.ip} title={`${item.ip} - ${t(item.status)}${item.mac ? ` (${item.mac}${item.note ? ` - ${item.note}` : ''})` : ''}`}
                style={{
                  width: 34, height: 24, borderRadius: 4,
                  background: STATUS_COLORS[item.status] || STATUS_COLORS.free,
                  cursor: 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontFamily: "var(--font-jetbrains-mono), monospace",
                  fontWeight: 500,
                  color: item.status === 'free' ? 'var(--color-ip-free-text)' : '#fff',
                }}>
                {lastOctet}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const columns = [
    { title: t('name'), dataIndex: 'name', key: 'name', width: 120 },
    { title: t('subnet'), dataIndex: 'subnet', key: 'subnet', width: 140 },
    { title: t('range'), key: 'range', width: 240, render: (_: any, r: any) => `${r.start_ip} - ${r.end_ip}` },
    { title: t('gateway'), dataIndex: 'gateway', key: 'gateway', width: 140 },
    { title: t('leaseTime'), dataIndex: 'lease_time', key: 'lease_time', width: 140, render: (v: number) => formatLeaseTime(v, t) },
    {
      title: t('status'), key: 'status', width: 100,
      render: (_: any, r: any) => (
        <Switch checked={!!r.enabled} onChange={(v) => handleToggleEnabled(r.id, v)}
          checkedChildren={t('enabled')} unCheckedChildren={t('disabled')} />
      ),
    },
    {
      title: t('usage'), key: 'usage', width: 120,
      render: (_: any, r: any) => r.total > 0 ? <span>{r.used}/{r.total} ({r.percentage}%)</span> : '-',
    },
    {
      title: tc('actions'), key: 'actions', width: 100, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space>
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
        <Space>
          <Button icon={<ExpandOutlined />} size="small"
            onClick={() => { setExpandedRowKeys(data.map((p: any) => p.id)); data.forEach((p: any) => fetchPoolIPs(p.id)); }}>
            {t('expandAll')}
          </Button>
          <Button icon={<ShrinkOutlined />} size="small"
            onClick={() => setExpandedRowKeys([])}>
            {t('collapseAll')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('addPool')}</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], defaultPageSize: 20 }}
        expandable={{
          expandedRowKeys,
          onExpand: handleExpand,
          expandedRowRender,
          rowExpandable: () => true,
        }} />

      <Modal title={editingPool ? t('editPool') : t('addPool')} open={modalOpen}
        onOk={handleSubmit} onCancel={() => setModalOpen(false)} width={600}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('name')} rules={[{ required: true }]}>
            <Input placeholder={t('namePlaceholder')} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="subnet" label={t('subnet')} rules={[{ required: true }, ipRule]}><Input placeholder={t('subnetPlaceholder')} /></Form.Item></Col>
            <Col span={12}><Form.Item name="netmask" label={t('netmask')} rules={[{ required: true }, ipRule]}><Input placeholder={t('netmaskPlaceholder')} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="start_ip" label={t('startIp')} rules={[{ required: true }, ipRule]}><Input placeholder={t('startIpPlaceholder')} /></Form.Item></Col>
            <Col span={12}><Form.Item name="end_ip" label={t('endIp')} rules={[{ required: true }, ipRule]}><Input placeholder={t('endIpPlaceholder')} /></Form.Item></Col>
          </Row>
          <Form.Item name="gateway" label={t('gateway')} rules={[ipRule]}><Input placeholder={t('gatewayPlaceholder')} /></Form.Item>
          <Form.Item name="dns_servers" label={t('dns')}>
            <Select mode="tags" placeholder={t('dnsPlaceholder')} />
          </Form.Item>
          <Form.Item name="lease_time" label={t('leaseTime')} rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={60} placeholder={t('leaseTimePlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </AppLayout>
  );
}
