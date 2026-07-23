'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Table, Button, Modal, Form, Input, InputNumber, Switch, Tag, Popconfirm, Select, Space, Row, Col, Spin, Segmented } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ColumnHeightOutlined, ExpandOutlined, ShrinkOutlined, AppstoreOutlined, UnorderedListOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { isValidIPv4, ipToNum } from '@/lib/ip-utils';
import { useNotify } from '@/hooks/useNotify';

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

export default function PoolsPage() {
  const t = useTranslations('pools');
  const tc = useTranslations('common');
  const ipRule = { validator: (_: any, value: string) => (value && !isValidIPv4(value) ? Promise.reject(tc('invalidIpv4')) : Promise.resolve()) };
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<any>(null);
  const [ipGridData, setIpGridData] = useState<Record<number, { ips: any[]; stats: any }>>({});
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);
  const [ipLoading, setIpLoading] = useState<Record<number, boolean>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFree, setShowFree] = useState(false);
  const [form] = Form.useForm();
  const notify = useNotify();
  const dnsServers = (Form.useWatch('dns_servers', form) as string[] | undefined) || [];

  const moveDns = (index: number, direction: -1 | 1) => {
    const list = [...dnsServers];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    form.setFieldValue('dns_servers', list);
  };

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
        notify.error(result.error);
        return;
      }

      notify.success(editingPool ? tc('updateSuccess') : tc('createSuccess'));
      setModalOpen(false);
      fetchData();
    } catch { /* validation error */ }
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/pools/${id}`, { method: 'DELETE' });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify.error(result.error);
      return;
    }
    notify.success(tc('deleteSuccess'));
    fetchData();
  };

  const handleToggleEnabled = async (id: number, enabled: boolean) => {
    try {
      const res = await fetch(`/api/pools/${id}`, {
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

  const STATUS_TEXT_COLORS: Record<string, string> = {
    free: 'var(--color-ip-free-text)',
    reserved: 'var(--color-ip-reserved-text)',
    bound: 'var(--color-ip-bound-text)',
    offered: 'var(--color-ip-offered-text)',
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
            <span style={{ display: 'inline-block', width: 12, height: 12, background: STATUS_COLORS.free, marginRight: 4, borderRadius: 3 }} />
            <span style={{ display: 'inline-block', width: 12, height: 12, background: STATUS_COLORS.reserved, marginRight: 4, borderRadius: 3 }} />
            <span style={{ display: 'inline-block', width: 12, height: 12, background: STATUS_COLORS.bound, marginRight: 4, borderRadius: 3 }} />
            <span style={{ display: 'inline-block', width: 12, height: 12, background: STATUS_COLORS.offered, marginRight: 4, borderRadius: 3 }} />
          </span>
        </Space>
        {viewMode === 'grid' ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {ips.map((item: any) => {
              const lastOctet = item.ip.split('.').pop();
              const isReservedActive = item.isReserved && (item.status === 'bound' || item.status === 'offered');
              const cellBackground = STATUS_COLORS[item.status] || STATUS_COLORS.free;
              const cellTextColor = STATUS_TEXT_COLORS[item.status] || STATUS_TEXT_COLORS.free;
              let statusText: string;
              if (item.isReserved && item.status === 'bound') statusText = t('reservedBound');
              else if (item.isReserved && item.status === 'offered') statusText = t('reservedOffered');
              else statusText = t(item.status);
              const parts: string[] = [];
              if (item.mac) parts.push(item.mac);
              if (item.hostname) parts.push(item.hostname);
              if (item.note) parts.push(item.note);
              if (item.reservationNote) parts.push(item.reservationNote);
              const detail = parts.length > 0 ? ` (${parts.join(' - ')})` : '';
              const tooltipText = `${item.ip} - ${statusText}${detail}`;
              return (
                <div key={item.ip} title={tooltipText}
                  className="ip-grid-cell"
                  style={{
                    width: 34, height: 24, borderRadius: 3,
                    background: cellBackground,
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontFamily: "var(--font-jetbrains-mono), monospace",
                    fontWeight: 500,
                    color: cellTextColor,
                  }}>
                  {isReservedActive && (
                    <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: 'var(--color-ip-reserved)', pointerEvents: 'none' }} />
                  )}
                  <span style={{ position: 'relative', zIndex: 1 }}>{lastOctet}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <Table
            size="small"
            rowKey="ip"
            dataSource={showFree ? ips : ips.filter((i: any) => i.status !== 'free')}
            pagination={false}
            scroll={{ y: 400 }}
            columns={[
              { title: t('listIp'), dataIndex: 'ip', key: 'ip', width: 130, fixed: 'left' as const },
              {
                title: t('listStatus'), key: 'status', width: 150,
                render: (_: any, item: any) => {
                  let bg: string;
                  let textColor: string;
                  let text: string;
                  const isRA = item.isReserved && (item.status === 'bound' || item.status === 'offered');
                  if (isRA && item.status === 'bound') {
                    bg = STATUS_COLORS.bound;
                    textColor = STATUS_TEXT_COLORS.bound;
                    text = t('reservedBound');
                  } else if (isRA) {
                    bg = STATUS_COLORS.offered;
                    textColor = STATUS_TEXT_COLORS.offered;
                    text = t('reservedOffered');
                  } else {
                    bg = STATUS_COLORS[item.status] || STATUS_COLORS.free;
                    textColor = STATUS_TEXT_COLORS[item.status] || STATUS_TEXT_COLORS.free;
                    text = t(item.status);
                  }
                  return <Tag style={{ background: bg, color: textColor, border: 'none', borderBottom: isRA ? '2px solid var(--color-ip-reserved)' : undefined }}>{text}</Tag>;
                },
              },
              { title: t('listMac'), dataIndex: 'mac', key: 'mac', width: 160, render: (v: string) => v || '-' },
              { title: t('listHostname'), dataIndex: 'hostname', key: 'hostname', width: 150, render: (v: string) => v || '-' },
              { title: t('listReservationNote'), dataIndex: 'reservationNote', key: 'reservationNote', width: 160, render: (v: string) => v || '-' },
              { title: t('listMacNote'), dataIndex: 'note', key: 'note', render: (v: string) => v || '-' },
            ]}
          />
        )}
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
        <Switch checked={!!r.enabled} onChange={(v) => handleToggleEnabled(r.id, v)} size="small"
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
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as 'grid' | 'list')}
            options={[
              { label: t('viewGrid'), value: 'grid', icon: <AppstoreOutlined /> },
              { label: t('viewList'), value: 'list', icon: <UnorderedListOutlined /> },
            ]}
          />
          {viewMode === 'list' && (
            <Switch checked={showFree} onChange={setShowFree} size="small"
              checkedChildren={t('showFree')} unCheckedChildren={t('hideFree')} />
          )}
          <Button icon={<ExpandOutlined />} size="small"
            onClick={() => { setExpandedRowKeys(data.map((p: any) => p.id)); data.forEach((p: any) => fetchPoolIPs(p.id)); }}>
            {t('expandAll')}
          </Button>
          <Button icon={<ShrinkOutlined />} size="small"
            onClick={() => setExpandedRowKeys([])}>
            {t('collapseAll')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} size="small" onClick={handleAdd}>{t('addPool')}</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ showSizeChanger: true, pageSizeOptions: [20, 50, 100], defaultPageSize: 20 }}
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
            <Col span={12}><Form.Item name="start_ip" label={t('startIp')} dependencies={['end_ip']} rules={[{ required: true }, ipRule, ({ getFieldValue }) => ({ validator(_: any, value: string) { const end = getFieldValue('end_ip'); if (value && end && isValidIPv4(value) && isValidIPv4(end) && ipToNum(value) > ipToNum(end)) return Promise.reject(tc('errStartIpGreaterThanEnd')); return Promise.resolve(); } })]}><Input placeholder={t('startIpPlaceholder')} /></Form.Item></Col>
            <Col span={12}><Form.Item name="end_ip" label={t('endIp')} dependencies={['start_ip']} rules={[{ required: true }, ipRule, ({ getFieldValue }) => ({ validator(_: any, value: string) { const start = getFieldValue('start_ip'); if (value && start && isValidIPv4(value) && isValidIPv4(start) && ipToNum(value) < ipToNum(start)) return Promise.reject(tc('errStartIpGreaterThanEnd')); return Promise.resolve(); } })]}><Input placeholder={t('endIpPlaceholder')} /></Form.Item></Col>
          </Row>
          <Form.Item name="gateway" label={t('gateway')} rules={[ipRule]}><Input placeholder={t('gatewayPlaceholder')} /></Form.Item>
          <Form.Item name="dns_servers" label={t('dns')} rules={[{ validator: (_: any, value: string[]) => { if (!value || value.length === 0) return Promise.resolve(); for (const v of value) { if (!isValidIPv4(v)) return Promise.reject(tc('invalidIpv4')); } return Promise.resolve(); } }]}>
            <Select mode="tags" placeholder={t('dnsPlaceholder')} />
          </Form.Item>
          {dnsServers.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>{t('dnsOrderHint')}</div>
              {dnsServers.map((ip, idx) => (
                <div key={ip + idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid #f0f0f0' }}>
                  <span><Tag color="blue" style={{ marginRight: 8 }}>{idx + 1}</Tag>{ip}</span>
                  <Space size="small">
                    <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => moveDns(idx, -1)} title={t('moveUp')} />
                    <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={idx === dnsServers.length - 1} onClick={() => moveDns(idx, 1)} title={t('moveDown')} />
                  </Space>
                </div>
              ))}
            </div>
          )}
          <Form.Item name="lease_time" label={t('leaseTime')} rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={60} placeholder={t('leaseTimePlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
