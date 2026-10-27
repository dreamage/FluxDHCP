'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, Form, Input, Modal, Popconfirm, Radio, Space, Spin, Switch, Table, Tag, Typography } from 'antd';
import { PlusOutlined, CopyOutlined, DeleteOutlined, ApiOutlined } from '@ant-design/icons';
import { useNotify } from '@/hooks/useNotify';
import { copyText } from '@/client/clipboard';
import { apiErrorMessage } from '@/lib/api-error';
import { formatLocalTime } from '@/lib/format-time';

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
  const [agentOpen, setAgentOpen] = useState(false);
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

  // 一段可以直接丢给 AI 的接入说明:MCP 配置 + skill 地址,由 AI 自己决定装在哪
  const agentPrompt = (apiKey: string) => [
    t('apiAgentPromptLead'),
    '',
    t('apiAgentPromptMcp'),
    httpConfig(apiKey),
    '',
    t('apiAgentPromptSkill'),
    `${origin}/api/skills/fluxdhcp`,
  ].join('\n');

  const [skillPreview, setSkillPreview] = useState<{ open: boolean; loading: boolean; text: string }>({
    open: false,
    loading: false,
    text: '',
  });

  const loadSkill = async () => {
    setSkillPreview({ open: true, loading: true, text: '' });
    try {
      const res = await fetch('/api/skills/fluxdhcp');
      const text = res.ok ? await res.text() : '';
      setSkillPreview({ open: true, loading: false, text });
    } catch {
      setSkillPreview({ open: true, loading: false, text: '' });
    }
  };

  const downloadSkill = async () => {
    try {
      const res = await fetch('/api/skills/fluxdhcp');
      if (!res.ok) {
        notify.error(null);
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'SKILL.md';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      notify.error(null);
    }
  };

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

  const copy = async (text: string, successText: string) => {
    if (await copyText(text)) {
      notify.success(successText);
    } else {
      notify.error(tc('copyFailed'));
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
      render: (v: string | null) => v ? formatLocalTime(v) : <Text type="secondary">{t('apiKeyNeverUsed')}</Text>,
    },
    {
      title: t('apiKeyCreated'), dataIndex: 'created_at', key: 'created_at', width: 170,
      render: (v: string) => formatLocalTime(v),
    },
    {
      title: t('status'), dataIndex: 'enabled', key: 'enabled', width: 100, align: 'center' as const,
      render: (enabled: number, row: ApiKeyRow) => (
        <Switch size="small" checked={!!enabled} onChange={v => handleToggle(row, v)}
          checkedChildren={t('enabled')} unCheckedChildren={t('disabled')} />
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

  return (
    <Card style={{ marginBottom: 16 }}>
      <Space size={8} wrap style={{ marginBottom: 12 }}>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          {t('apiKeyCreate')}
        </Button>
        <Button size="small" icon={<ApiOutlined />} onClick={() => setAgentOpen(true)}>
          {t('apiUsageTitle')}
        </Button>
      </Space>
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

      <Modal
        title={t('apiUsageTitle')}
        open={agentOpen}
        onCancel={() => setAgentOpen(false)}
        width={620}
        footer={[
          <Button key="view" onClick={loadSkill}>{t('apiUsageSkillView')}</Button>,
          <Button key="download" onClick={downloadSkill}>{t('apiUsageSkillDownload')}</Button>,
          <Button key="copy" type="primary" icon={<CopyOutlined />}
            onClick={() => copy(agentPrompt('fdx_xxxxxxxxxxxxxxxx'), t('apiAgentCopied'))}>
            {t('apiAgentCopy')}
          </Button>,
        ]}
      >
        <pre style={codeStyle}>{agentPrompt('fdx_xxxxxxxxxxxxxxxx')}</pre>
      </Modal>

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
          <Form.Item name="scope" label={t('apiKeyScope')} tooltip={t('apiKeyScopeHelp')}>
            <Radio.Group>
              <Radio.Button value="read">{t('scopeRead')}</Radio.Button>
              <Radio.Button value="write">{t('scopeWrite')}</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('apiKeyCreatedTitle')}
        open={!!createdKey}
        width={620}
        onCancel={() => setCreatedKey(null)}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={() => createdKey && copy(createdKey.key, t('apiKeyCopied'))}>{t('apiKeyCopy')}</Button>,
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
          <pre style={codeStyle}>{agentPrompt(createdKey?.key ?? '')}</pre>
          <Button size="small" icon={<CopyOutlined />} onClick={() => createdKey && copy(agentPrompt(createdKey.key), t('apiAgentCopied'))}>
            {t('apiAgentCopy')}
          </Button>
        </div>
      </Modal>

      <Modal
        title={t('apiUsageSkillTitle')}
        open={skillPreview.open}
        onCancel={() => setSkillPreview({ open: false, loading: false, text: '' })}
        footer={[
          <Button
            key="copy"
            icon={<CopyOutlined />}
            disabled={skillPreview.loading || !skillPreview.text}
            onClick={() => copy(skillPreview.text, t('apiUsageSkillCopied'))}
          >
            {t('apiUsageSkillCopy')}
          </Button>,
        ]}
        width={760}
      >
        {skillPreview.loading ? (
          <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>
        ) : skillPreview.text ? (
          <pre style={{ ...codeStyle, maxHeight: '60vh', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {skillPreview.text}
          </pre>
        ) : (
          <Paragraph type="secondary">{t('apiUsageSkillMissing')}</Paragraph>
        )}
      </Modal>
    </Card>
  );
}
