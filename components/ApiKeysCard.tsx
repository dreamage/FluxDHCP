'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, Collapse, Form, Input, Modal, Popconfirm, Radio, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { KeyOutlined, PlusOutlined, CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNotify } from '@/hooks/useNotify';
import { apiErrorMessage } from '@/lib/api-error';
import { formatLocalTimeNoMs } from '@/lib/format-time';

const { Text, Paragraph } = Typography;

interface ApiKeyRow {
  id: number;
  name: string;
  key_prefix: string;
  scope: 'read' | 'write';
  enabled: number;
  last_used_at: string | null;
  created_at: string;
}

const codeStyle: React.CSSProperties = {
  margin: '6px 0 12px',
  padding: 10,
  fontSize: 12,
  lineHeight: 1.6,
  fontFamily: 'var(--font-jetbrains-mono), monospace',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  overflowX: 'auto',
  whiteSpace: 'pre',
};

export default function ApiKeysCard() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const notify = useNotify();

  const [rows, setRows] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ name: string; key: string } | null>(null);
  const [form] = Form.useForm();

  // 服务端渲染时拿不到 window.location，先用默认值，挂载后再替换，避免 hydration 不一致
  const [origin, setOrigin] = useState('http://localhost:3000');
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const httpConfig = (apiKey: string) => JSON.stringify({
    mcpServers: {
      fluxdhcp: {
        type: 'http',
        url: `${origin}/api/mcp`,
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    },
  }, null, 2);

  const stdioConfig = (apiKey: string) => JSON.stringify({
    mcpServers: {
      fluxdhcp: {
        command: 'node',
        args: ['/absolute/path/to/FluxDHCP/dist/mcp/stdio.js'],
        env: {
          FLUXDHCP_URL: origin,
          FLUXDHCP_API_KEY: apiKey,
        },
      },
    },
  }, null, 2);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/api-keys?pageSize=500');
      const json = await res.json();
      setRows(Array.isArray(json.items) ? json.items : []);
    } catch {
      notify.error(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify.success(t('apiKeyCopied'));
    } catch {
      notify.error(null);
    }
  };

  const handleCreate = async () => {
    try {
      setSubmitting(true);
      const values = await form.validateFields();
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const result = await res.json();
      if (!res.ok) {
        notify.error(apiErrorMessage(result));
        return;
      }
      setModalOpen(false);
      form.resetFields();
      setCreatedKey({ name: result.name, key: result.key });
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return;
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (row: ApiKeyRow, enabled: boolean) => {
    const res = await fetch(`/api/api-keys/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enabled ? 1 : 0 }),
    });
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      notify.error(apiErrorMessage(result));
      return;
    }
    fetchData();
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      notify.error(apiErrorMessage(result));
      return;
    }
    notify.success(tc('deleteSuccess'));
    fetchData();
  };

  const columns = [
    { title: t('apiKeyName'), dataIndex: 'name', key: 'name' },
    {
      title: t('apiKeyPrefix'), dataIndex: 'key_prefix', key: 'key_prefix', width: 160,
      render: (prefix: string) => <Text code>{prefix}…</Text>,
    },
    {
      title: t('apiKeyScope'), dataIndex: 'scope', key: 'scope', width: 100,
      render: (scope: string) => (
        <Tag color={scope === 'write' ? 'orange' : 'blue'}>
          {scope === 'write' ? t('scopeWrite') : t('scopeRead')}
        </Tag>
      ),
    },
    {
      title: t('apiKeyLastUsed'), dataIndex: 'last_used_at', key: 'last_used_at', width: 170,
      render: (v: string | null) => v ? formatLocalTimeNoMs(v) : <Text type="secondary">{t('apiKeyNeverUsed')}</Text>,
    },
    {
      title: t('apiKeyCreated'), dataIndex: 'created_at', key: 'created_at', width: 170,
      render: (v: string) => formatLocalTimeNoMs(v),
    },
    {
      title: t('apiKeyEnabled'), dataIndex: 'enabled', key: 'enabled', width: 90, align: 'center' as const,
      render: (enabled: number, row: ApiKeyRow) => (
        <Switch size="small" checked={!!enabled} onChange={v => handleToggle(row, v)} />
      ),
    },
    {
      title: tc('actions'), key: 'actions', width: 70, fixed: 'right' as const,
      render: (_: unknown, row: ApiKeyRow) => (
        <Popconfirm title={t('apiKeyDeleteConfirm')} onConfirm={() => handleDelete(row.id)}>
          <Button icon={<DeleteOutlined />} size="small" danger aria-label={tc('delete')} />
        </Popconfirm>
      ),
    },
  ];

  const usage = (
    <div style={{ fontSize: 13 }}>
      <ol style={{ paddingLeft: 18, margin: '0 0 12px', lineHeight: 1.9 }}>
        <li>{t('apiUsageStep1')}</li>
        <li>{t('apiUsageStep2')}</li>
        <li>{t('apiUsageStep3')}</li>
        <li>{t('apiUsageStep4')}</li>
      </ol>

      <Tabs
        size="small"
        items={[
          {
            key: 'http',
            label: t('apiUsageTabsHttp'),
            children: (
              <>
                <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
                  {t('apiUsageHttpHint')}
                </Paragraph>
                <pre style={codeStyle}>{httpConfig('fdx_xxxxxxxxxxxxxxxx')}</pre>
                <Button size="small" icon={<CopyOutlined />} onClick={() => copy(httpConfig('fdx_xxxxxxxxxxxxxxxx'))}>
                  {t('apiUsageCopy')}
                </Button>
              </>
            ),
          },
          {
            key: 'stdio',
            label: t('apiUsageTabsStdio'),
            children: (
              <>
                <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
                  {t('apiUsageStdioHint')}
                </Paragraph>
                <pre style={codeStyle}>{stdioConfig('fdx_xxxxxxxxxxxxxxxx')}</pre>
                <Button size="small" icon={<CopyOutlined />} onClick={() => copy(stdioConfig('fdx_xxxxxxxxxxxxxxxx'))}>
                  {t('apiUsageCopy')}
                </Button>
              </>
            ),
          },
        ]}
      />

      <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
        {t('apiUsageKeyHint')}
      </Paragraph>
    </div>
  );

  return (
    <Card
      title={<span><KeyOutlined style={{ marginRight: 8 }} />{t('apiAccess')}</span>}
      style={{ marginBottom: 16 }}
      extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>{t('apiKeyCreate')}</Button>}
    >
      <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
        {t('apiAccessDesc')}
      </Paragraph>

      <Table
        columns={columns}
        dataSource={rows}
        rowKey="id"
        size="small"
        loading={loading}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('apiKeyEmpty') }}
      />

      <Collapse
        ghost
        style={{ marginTop: 4 }}
        items={[{
          key: 'usage',
          label: <Text strong>{t('apiUsageTitle')}</Text>,
          children: usage,
        }]}
      />

      <Modal
        title={t('apiKeyCreate')}
        open={modalOpen}
        onOk={handleCreate}
        confirmLoading={submitting}
        onCancel={() => setModalOpen(false)}
        okText={tc('confirm')}
        cancelText={tc('cancel')}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ scope: 'read' }}>
          <Form.Item name="name" label={t('apiKeyName')} rules={[{ required: true, message: tc('requiredField') }]}>
            <Input placeholder={t('apiKeyNamePlaceholder')} maxLength={64} />
          </Form.Item>
          <Form.Item name="scope" label={t('apiKeyScope')}>
            <Radio.Group>
              <Radio.Button value="read">{t('scopeRead')}</Radio.Button>
              <Radio.Button value="write">{t('scopeWrite')}</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('apiKeyScopeHelp')}
          </Text>
        </Form>
      </Modal>

      <Modal
        title={t('apiKeyCreatedTitle')}
        open={!!createdKey}
        width={620}
        onCancel={() => setCreatedKey(null)}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={() => createdKey && copy(createdKey.key)}>{t('apiKeyCopy')}</Button>,
          <Button key="close" type="primary" onClick={() => setCreatedKey(null)}>{t('apiKeySaved')}</Button>,
        ]}
      >
        <Paragraph type="secondary" style={{ fontSize: 13 }}>
          {t('apiKeyCreatedDesc')}
        </Paragraph>

        <Space direction="vertical" style={{ width: '100%' }}>
          <Text strong>{createdKey?.name}</Text>
          <Input readOnly value={createdKey?.key} onFocus={e => e.currentTarget.select()} />
        </Space>

        <div style={{ marginTop: 16 }}>
          <Text strong style={{ fontSize: 13 }}>{t('apiKeyConfigTitle')}</Text>
          <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 0' }}>
            {t('apiKeyConfigHint')}
          </Paragraph>
          <pre style={codeStyle}>{httpConfig(createdKey?.key ?? '')}</pre>
          <Button size="small" icon={<CopyOutlined />} onClick={() => createdKey && copy(httpConfig(createdKey.key))}>
            {t('apiUsageCopy')}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
