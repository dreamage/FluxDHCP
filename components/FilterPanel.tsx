'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, Form, Space } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd/es/form';

interface FilterPanelProps {
  /** collapse toggle state — component renders nothing when false */
  open: boolean;
  /** Ant Design Form instance */
  form: FormInstance;
  /** form initial values (should match hook defaults) */
  initialValues: Record<string, string>;
  /** Form onFinish handler */
  onFinish: () => void;
  /** search button handler */
  onSearch: () => void;
  /** reset button handler */
  onReset: () => void;
  /** form field children (Form.Item elements) */
  children: React.ReactNode;
}

/** Collapsible filter form card.  The toggle button is placed by the caller inside the title-bar. */
export default function FilterPanel({
  open, form, initialValues, onFinish, onSearch, onReset, children,
}: FilterPanelProps) {
  const tc = useTranslations('common');

  if (!open) return null;

  return (
    <Card size="small" style={{ marginBottom: 12 }}>
      <Form form={form} layout="inline" initialValues={initialValues} onFinish={onFinish}>
        {children}
        <Form.Item>
          <Space>
            <Button type="primary" size="small" icon={<SearchOutlined />} onClick={onSearch}>
              {tc('search')}
            </Button>
            <Button size="small" icon={<ReloadOutlined />} onClick={onReset}>
              {tc('reset')}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
}
