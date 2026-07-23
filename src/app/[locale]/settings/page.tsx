'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Form, InputNumber, Input, Button, Popconfirm, Space, Card, Row, Col, Upload, Modal, Checkbox, Select, Switch } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, SaveOutlined, PlayCircleOutlined, PauseCircleOutlined, ExportOutlined, ImportOutlined, AppstoreOutlined, EnvironmentOutlined, ControlOutlined, StopOutlined, FileTextOutlined, BellOutlined, ToolOutlined, FieldTimeOutlined, ProfileOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useNotify } from '@/hooks/useNotify';
import { isValidIPv4 } from '@/lib/ip-utils';
import { formatLocalTimeNoMs } from '@/lib/format-time';
import { CONFIG_CATEGORIES, DEFAULT_EXPORT_KEYS } from '@/lib/config-categories';

const { Title, Text } = Typography;

// Category visual metadata: icon + accent color for the import/export selector
const CATEGORY_META: Record<string, { icon: React.ReactNode; color: string }> = {
  pools: { icon: <AppstoreOutlined />, color: '#0ea5e9' },
  reservations: { icon: <EnvironmentOutlined />, color: '#8b5cf6' },
  device_options: { icon: <ControlOutlined />, color: '#14b8a6' },
  mac_blacklist: { icon: <StopOutlined />, color: '#ef4444' },
  mac_notes: { icon: <FileTextOutlined />, color: '#f59e0b' },
  webhooks: { icon: <BellOutlined />, color: '#ec4899' },
  config: { icon: <ToolOutlined />, color: '#64748b' },
  leases: { icon: <FieldTimeOutlined />, color: '#6366f1' },
  dhcp_logs: { icon: <ProfileOutlined />, color: '#84cc16' },
};

// Categories that overwrite live data — flagged as dangerous on import
const DANGEROUS_CATS = ['leases', 'dhcp_logs'];

export default function SettingsPage() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const tl = useTranslations('layout');
  const ipRule = { validator: (_: any, value: string) => (value && !isValidIPv4(value) ? Promise.reject(tc('invalidIpv4')) : Promise.resolve()) };
  const [form] = Form.useForm();
  const [dhcpStatus, setDhcpStatus] = useState<'running' | 'stopped' | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<any>(null);
  const [importCats, setImportCats] = useState<string[]>([]);
  const [importFileStats, setImportFileStats] = useState<Record<string, number>>({});
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportCats, setExportCats] = useState<string[]>(DEFAULT_EXPORT_KEYS);
  const [exportStats, setExportStats] = useState<Record<string, number>>({});
  const [exporting, setExporting] = useState(false);
  const notify = useNotify();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [configRes, statusRes] = await Promise.all([fetch('/api/config'), fetch('/api/dhcp/status')]);
        const config = await configRes.json();
        const status = await statusRes.json();

        form.setFieldsValue({
          server_ip: config.server_ip,
          listen_interface: config.listen_interface,
          default_lease_time: parseInt(config.default_lease_time, 10),
          t1_ratio: parseFloat(config.t1_ratio),
          t2_ratio: parseFloat(config.t2_ratio),
          web_port: parseInt(config.web_port, 10),
          dhcp_log_retention_days: parseInt(config.dhcp_log_retention_days, 10) || 90,
          decline_blacklist_duration: parseInt(config.decline_blacklist_duration, 10) || 3600,
          webhook_timeout: parseInt(config.webhook_timeout, 10) || 10,
          ip_allocation_order: config.ip_allocation_order || 'sequential',
          honor_requested_ip: config.honor_requested_ip !== '0',
        });

        setDhcpStatus(status.status);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [form]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      // Convert boolean to string for config storage
      const payload = {
        ...values,
        honor_requested_ip: values.honor_requested_ip ? '1' : '0',
      };
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        notify.success(t('saveSuccess'));
      } else {
        const result = await res.json().catch(() => ({}));
        notify.error(result.error);
      }
    } catch (err: any) {
      if (err?.errorFields) {
        notify.warn(tc('requiredField'));
      }
    }
    finally { setSaving(false); }
  };

  const handleExportClick = async () => {
    try {
      const res = await fetch('/api/config/stats');
      const stats = await res.json();
      setExportStats(stats);
      setExportCats(DEFAULT_EXPORT_KEYS);
      setExportModalOpen(true);
    } catch {
      notify.error(null);
    }
  };

  const handleExportConfirm = async () => {
    if (exportCats.length === 0) {
      notify.warn(t('exportNoneSelected'));
      return;
    }
    try {
      setExporting(true);
      const catsParam = exportCats.join(',');
      const res = await fetch(`/api/config/export?categories=${encodeURIComponent(catsParam)}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fluxdhcp-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify.success(t('exportSuccess'));
      setExportModalOpen(false);
    } catch {
      notify.error(null);
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.version) {
        notify.warn(t('importInvalidFormat'));
        return;
      }
      const fileCats: string[] = [];
      const fileStats: Record<string, number> = {};
      for (const cat of CONFIG_CATEGORIES) {
        if (Array.isArray(data[cat.key])) {
          fileCats.push(cat.key);
          fileStats[cat.key] = data[cat.key].length;
        }
      }
      if (fileCats.length === 0) {
        notify.warn(t('importInvalidFormat'));
        return;
      }
      setPendingImportData(data);
      setImportFileStats(fileStats);
      setImportCats(fileCats);
      setImportModalOpen(true);
    } catch {
      notify.warn(t('importInvalidFormat'));
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImportData) return;
    if (importCats.length === 0) {
      notify.warn(t('importNoneSelected'));
      return;
    }
    try {
      const res = await fetch('/api/config/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pendingImportData, categories: importCats }),
      });
      const result = await res.json();
      if (res.ok) {
        notify.success(t('importSuccess'));
        setImportModalOpen(false);
        setPendingImportData(null);
        // Reload form values
        const configRes = await fetch('/api/config');
        const config = await configRes.json();
        form.setFieldsValue({
          server_ip: config.server_ip,
          listen_interface: config.listen_interface,
          default_lease_time: parseInt(config.default_lease_time, 10),
          t1_ratio: parseFloat(config.t1_ratio),
          t2_ratio: parseFloat(config.t2_ratio),
          web_port: parseInt(config.web_port, 10),
          dhcp_log_retention_days: parseInt(config.dhcp_log_retention_days, 10) || 90,
          decline_blacklist_duration: parseInt(config.decline_blacklist_duration, 10) || 3600,
          webhook_timeout: parseInt(config.webhook_timeout, 10) || 10,
          ip_allocation_order: config.ip_allocation_order || 'sequential',
          honor_requested_ip: config.honor_requested_ip !== '0',
        });
      } else {
        notify.error(result.error);
      }
    } catch {
      notify.error(null);
    }
  };

  const handleStartDhcp = async () => {
    try {
      const res = await fetch('/api/dhcp/start', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setDhcpStatus('running');
        notify.success(t('dhcpStarted'));
      } else {
        notify.fatal(t('dhcpService'), data.error);
      }
    } catch (err: any) {
      notify.fatal(t('dhcpService'), err?.message || null);
    }
  };

  const handleStopDhcp = async () => {
    try {
      const res = await fetch('/api/dhcp/stop', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setDhcpStatus('stopped');
        notify.success(t('dhcpStopped'));
      } else {
        notify.fatal(t('dhcpService'), data.error);
      }
    } catch (err: any) {
      notify.fatal(t('dhcpService'), err?.message || null);
    }
  };

  const isRunning = dhcpStatus === 'running';

  // Shared renderer for a selectable category row in import/export modals
  const renderCatRow = (
    cat: typeof CONFIG_CATEGORIES[number],
    count: number,
    checked: boolean,
    onToggle: (checked: boolean) => void,
  ) => {
    const meta = CATEGORY_META[cat.key];
    const isDanger = DANGEROUS_CATS.includes(cat.key);
    return (
      <div
        key={cat.key}
        onClick={() => onToggle(!checked)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
          border: `1px solid ${checked ? (isDanger ? '#f59e0b' : 'var(--color-primary)') : 'var(--color-border)'}`,
          background: checked ? (isDanger ? 'rgba(245,158,11,0.08)' : 'var(--color-primary-subtle)') : 'transparent',
          transition: 'all 0.15s ease',
        }}
      >
        <Checkbox checked={checked} onChange={e => { e.stopPropagation(); onToggle(e.target.checked); }} />
        {meta && (
          <span style={{
            width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${meta.color}1a`, color: meta.color, fontSize: 14, flexShrink: 0,
          }}>
            {meta.icon}
          </span>
        )}
        <span style={{ flex: 1, fontWeight: 500, fontSize: 14 }}>{t(cat.label)}</span>
        <span style={{
          fontSize: 12, fontWeight: 600, minWidth: 44, textAlign: 'center' as const,
          padding: '2px 10px', borderRadius: 10,
          color: checked ? (isDanger ? '#d97706' : 'var(--color-primary)') : 'var(--color-text-secondary)',
          background: checked ? (isDanger ? 'rgba(245,158,11,0.15)' : 'var(--color-primary-light)') : 'var(--color-hover)',
        }}>
          {t('itemsCount', { count })}
        </span>
      </div>
    );
  };

  return (
    <>
      <div className="page-title-bar">
        <Title level={3} style={{ margin: 0 }}>{t('title')}</Title>
      </div>

      {/* DHCP Service */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {dhcpStatus === null ? (
              <div style={{ width: 22, height: 22 }} />
            ) : isRunning ? (
              <CheckCircleFilled style={{ fontSize: 22, color: '#52c41a' }} />
            ) : (
              <CloseCircleFilled style={{ fontSize: 22, color: '#ff4d4f' }} />
            )}
            <div>
              <Text strong style={{ fontSize: 15 }}>{t('dhcpService')}</Text>
              <div style={{ fontSize: 13, color: '#8c8c8c', marginTop: 2 }}>
                {dhcpStatus === null ? '' : isRunning ? tl('running') : tl('stopped')}
              </div>
            </div>
          </div>
          {dhcpStatus === null ? null : isRunning ? (
            <Popconfirm title={t('confirmStop')} onConfirm={handleStopDhcp}>
              <Button icon={<PauseCircleOutlined />} danger size="small">{t('stop')}</Button>
            </Popconfirm>
          ) : (
            <Button type="primary" icon={<PlayCircleOutlined />} size="small" onClick={handleStartDhcp}>{t('start')}</Button>
          )}
        </div>
      </Card>

      {/* Server & DHCP Config */}
      <Form form={form} layout="vertical" onFinish={handleSave}>
      <Card title={t('serverConfig')} style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="server_ip" label={t('serverIp')} rules={[ipRule]}>
                <Input placeholder="0.0.0.0" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="listen_interface" label={t('listenInterface')}>
                <Input placeholder="0.0.0.0" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="web_port" label={t('webPort')}>
                <InputNumber style={{ width: '100%' }} min={1} max={65535} placeholder="3000" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="default_lease_time" label={t('defaultLeaseTime')}>
                <InputNumber style={{ width: '100%' }} min={60} placeholder="86400" />
              </Form.Item>
            </Col>
          </Row>
      </Card>

      {/* DHCP Parameters */}
      <Card title={t('dhcpParams')} style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="t1_ratio" label={t('t1Ratio')} tooltip={t('t1RatioHelp')}>
                <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.001} placeholder="0.5" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="t2_ratio" label={t('t2Ratio')} tooltip={t('t2RatioHelp')}>
                <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.001} placeholder="0.875" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="decline_blacklist_duration" label={t('declineBlacklistDuration')} tooltip={t('declineBlacklistHelp')}>
                <InputNumber style={{ width: '100%' }} min={0} placeholder="3600" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="dhcp_log_retention_days" label={t('logRetentionDays')} tooltip={t('logRetentionHelp')}>
                <InputNumber style={{ width: '100%' }} min={1} placeholder="90" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="webhook_timeout" label={t('webhookTimeout')} tooltip={t('webhookTimeoutHelp')}>
                <InputNumber style={{ width: '100%' }} min={1} placeholder="10" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="ip_allocation_order" label={t('ipAllocationOrder')} tooltip={t('ipAllocationOrderHelp')}>
                <Select>
                  <Select.Option value="sequential">{t('sequential')}</Select.Option>
                  <Select.Option value="random">{t('random')}</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="honor_requested_ip" label={t('honorRequestedIp')} tooltip={t('honorRequestedIpHelp')} valuePropName="checked">
                <Switch checkedChildren={t('yes')} unCheckedChildren={t('no')} />
              </Form.Item>
            </Col>
          </Row>
      </Card>
      </Form>

      {/* Import / Export */}
      <Card title={t('importExport') || 'Import / Export'} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button icon={<ExportOutlined />} size="small" onClick={handleExportClick}>{t('exportConfig')}</Button>
          <Upload accept=".json" showUploadList={false}
            beforeUpload={(file) => { handleImport(file); return false; }}>
            <Button icon={<ImportOutlined />} size="small">{t('importConfig')}</Button>
          </Upload>
          <Text type="secondary" style={{ fontSize: 13 }}>{t('importExportHelp')}</Text>
        </div>
      </Card>

      {/* Actions */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Button type="primary" icon={<SaveOutlined />} size="small" onClick={handleSave} loading={saving}>
            {tc('save')}
          </Button>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {t('dbPath')}: {process.env.DB_PATH || './data/fluxdhcp.db'}
          </Text>
        </div>
      </Card>

      {/* Export Modal */}
      <Modal
        title={t('exportConfig')}
        open={exportModalOpen}
        onOk={handleExportConfirm}
        onCancel={() => setExportModalOpen(false)}
        okText={tc('confirm')}
        cancelText={tc('cancel')}
        confirmLoading={exporting}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>{t('exportDesc')}</Text>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Space size="small">
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setExportCats(CONFIG_CATEGORIES.map(c => c.key))}>{t('selectAll')}</Button>
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setExportCats([])}>{t('selectNone')}</Button>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('selectedSummary', { count: exportCats.length })}</Text>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
          {CONFIG_CATEGORIES.map(cat => renderCatRow(cat, exportStats[cat.key] || 0, exportCats.includes(cat.key), (checked) => {
            if (checked) setExportCats([...exportCats, cat.key]);
            else setExportCats(exportCats.filter(c => c !== cat.key));
          }))}
        </div>
      </Modal>

      {/* Import Confirmation Modal */}
      <Modal
        title={t('importConfirmTitle')}
        open={importModalOpen}
        onOk={handleConfirmImport}
        onCancel={() => { setImportModalOpen(false); setPendingImportData(null); }}
        okText={tc('confirm')}
        cancelText={tc('cancel')}
        okButtonProps={{ danger: importCats.includes('leases') || importCats.includes('dhcp_logs') }}
      >
        {pendingImportData && (
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>{t('importConfirmDesc')}</Text>
            {pendingImportData.exported_at && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--color-hover)', fontSize: 13 }}>
                <ClockCircleOutlined style={{ color: 'var(--color-text-secondary)' }} />
                <Text type="secondary">{t('exportedAt')}</Text>
                <Text strong style={{ fontFamily: 'var(--font-mono)' }}>{formatLocalTimeNoMs(pendingImportData.exported_at)}</Text>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Space size="small">
                <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setImportCats(Object.keys(importFileStats))}>{t('selectAll')}</Button>
                <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setImportCats([])}>{t('selectNone')}</Button>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('selectedSummary', { count: importCats.length })}</Text>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
              {CONFIG_CATEGORIES.map(cat => {
                const count = importFileStats[cat.key];
                if (count === undefined) return null;
                return renderCatRow(cat, count, importCats.includes(cat.key), (checked) => {
                  if (checked) setImportCats([...importCats, cat.key]);
                  else setImportCats(importCats.filter(c => c !== cat.key));
                });
              })}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
