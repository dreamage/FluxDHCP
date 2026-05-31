'use client';

import React, { use, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Typography, Form, InputNumber, Input, Button, Badge, message, Popconfirm, Space, Alert, Card, Row, Col, Divider, Upload, Modal, Checkbox } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, DeleteOutlined, SaveOutlined, PlayCircleOutlined, PauseCircleOutlined, ExportOutlined, ImportOutlined } from '@ant-design/icons';
import AppLayout from '@/components/AppLayout';
import { translateError } from '@/lib/error-map';

const { Title, Text } = Typography;

export default function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const tl = useTranslations('layout');
  const { locale } = use(params);
  const [form] = Form.useForm();
  const [dhcpStatus, setDhcpStatus] = useState<'running' | 'stopped' | null>(null);
  const [loading, setLoading] = useState(false);
  const [startError, setStartError] = useState('');
  const [saving, setSaving] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<any>(null);
  const [clearLeases, setClearLeases] = useState(false);
  const [clearLogs, setClearLogs] = useState(false);

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
          log_retention_days: parseInt(config.log_retention_days, 10) || 90,
          decline_blacklist_duration: parseInt(config.decline_blacklist_duration, 10) || 3600,
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
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        message.success(t('saveSuccess'));
      } else {
        message.error(tc('error'));
      }
    } catch { /* validation */ }
    finally { setSaving(false); }
  };

  const handleClearLogs = async () => {
    const res = await fetch('/api/logs', { method: 'DELETE' });
    if (res.ok) {
      message.success(t('clearSuccess'));
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch('/api/config/export');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fluxdhcp-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(t('exportSuccess'));
    } catch {
      message.error(tc('error'));
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.version || !data.config) {
        message.error(t('importInvalidFormat'));
        return;
      }
      // Validate structure (#3)
      const arrayFields = ['pools', 'reservations', 'device_options', 'webhooks', 'mac_notes'] as const;
      for (const field of arrayFields) {
        if (data[field] && !Array.isArray(data[field])) {
          message.error(t('importInvalidFormat'));
          return;
        }
      }
      setPendingImportData(data);
      setClearLeases(false);
      setClearLogs(false);
      setImportModalOpen(true);
    } catch {
      message.error(t('importInvalidFormat'));
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImportData) return;
    try {
      const res = await fetch('/api/config/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pendingImportData, clearLeases, clearLogs }),
      });
      const result = await res.json();
      if (res.ok) {
        message.success(t('importSuccess'));
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
          log_retention_days: parseInt(config.log_retention_days, 10) || 90,
          decline_blacklist_duration: parseInt(config.decline_blacklist_duration, 10) || 3600,
        });
      } else {
        message.error(result.error || tc('error'));
      }
    } catch {
      message.error(tc('error'));
    }
  };

  const handleStartDhcp = async () => {
    try {
      setStartError('');
      const res = await fetch('/api/dhcp/start', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setDhcpStatus('running');
        message.success(t('dhcpStarted'));
      } else {
        const errMsg = translateError(data.error, tc) || tc('error');
        setStartError(errMsg);
        message.error(errMsg);
      }
    } catch (err: any) {
      const errMsg = err?.message || tc('networkError');
      setStartError(errMsg);
      message.error(errMsg);
    }
  };

  const handleStopDhcp = async () => {
    try {
      setStartError('');
      const res = await fetch('/api/dhcp/stop', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setDhcpStatus('stopped');
        message.success(t('dhcpStopped'));
      } else {
        const errMsg = translateError(data.error, tc) || tc('error');
        setStartError(errMsg);
        message.error(errMsg);
      }
    } catch (err: any) {
      const errMsg = err?.message || tc('networkError');
      setStartError(errMsg);
      message.error(errMsg);
    }
  };

  const isRunning = dhcpStatus === 'running';

  return (
    <AppLayout locale={locale} onLocaleChange={() => {}}>
      <Title level={3}>{t('title')}</Title>

      {startError && (
        <Alert type="error" message={startError} closable
          onClose={() => setStartError('')} style={{ marginBottom: 16 }} />
      )}

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
              <Button icon={<PauseCircleOutlined />} danger>{t('stop')}</Button>
            </Popconfirm>
          ) : (
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStartDhcp}>{t('start')}</Button>
          )}
        </div>
      </Card>

      {/* Server & DHCP Config */}
      <Form form={form} layout="vertical" onFinish={handleSave}>
      <Card title={t('serverConfig')} style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="server_ip" label={t('serverIp')}>
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
              <Form.Item name="log_retention_days" label={t('logRetentionDays')} tooltip={t('logRetentionHelp')}>
                <InputNumber style={{ width: '100%' }} min={1} placeholder="90" />
              </Form.Item>
            </Col>
          </Row>
      </Card>
      </Form>

      {/* Import / Export */}
      <Card title={t('importExport') || 'Import / Export'} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button icon={<ExportOutlined />} onClick={handleExport}>{t('exportConfig')}</Button>
          <Upload accept=".json" showUploadList={false}
            beforeUpload={(file) => { handleImport(file); return false; }}>
            <Button icon={<ImportOutlined />}>{t('importConfig')}</Button>
          </Upload>
          <Text type="secondary" style={{ fontSize: 13 }}>{t('importExportHelp')}</Text>
        </div>
      </Card>

      {/* Actions */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            {tc('save')}
          </Button>
          <Space split={<Divider type="vertical" />}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {t('dbPath')}: {process.env.DB_PATH || './data/fluxdhcp.db'}
            </Text>
            <Popconfirm title={t('clearConfirm')} onConfirm={handleClearLogs} okText={tc('confirm')} cancelText={tc('cancel')}>
              <Button icon={<DeleteOutlined />} danger size="small">{t('clearLogs')}</Button>
            </Popconfirm>
          </Space>
        </div>
      </Card>

      {/* Import Confirmation Modal */}
      <Modal
        title={t('importConfirmTitle')}
        open={importModalOpen}
        onOk={handleConfirmImport}
        onCancel={() => { setImportModalOpen(false); setPendingImportData(null); }}
        okText={tc('confirm')}
        cancelText={tc('cancel')}
        okButtonProps={{ danger: clearLeases || clearLogs }}
      >
        {pendingImportData && (
          <div>
            <Text style={{ display: 'block', marginBottom: 12 }}>{t('importConfirmDesc')}</Text>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <Text strong style={{ fontSize: 13 }}>{t('importWillReplace')}:</Text>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13 }}>
                {pendingImportData.config && <li>{t('importConfigItems')}: {pendingImportData.config.length}</li>}
                {pendingImportData.pools && <li>{t('importPools')}: {pendingImportData.pools.length}</li>}
                {pendingImportData.reservations && <li>{t('importReservations')}: {pendingImportData.reservations.length}</li>}
                {pendingImportData.device_options && <li>{t('importDeviceOptions')}: {pendingImportData.device_options.length}</li>}
                {pendingImportData.webhooks && <li>{t('importWebhooks')}: {pendingImportData.webhooks.length}</li>}
                {pendingImportData.mac_notes && <li>{t('importMacNotes')}: {pendingImportData.mac_notes.length}</li>}
              </ul>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Checkbox checked={clearLeases} onChange={e => setClearLeases(e.target.checked)}>
                <Text>{t('importClearLeases')}</Text>
              </Checkbox>
              <Checkbox checked={clearLogs} onChange={e => setClearLogs(e.target.checked)}>
                <Text>{t('importClearLogs')}</Text>
              </Checkbox>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
