'use client';

import React, { useState } from 'react';
import { Popover, Input, Button, Space, Popconfirm } from 'antd';
import { EditOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';

interface MacAddressProps {
  mac: string;
  macNotes: Record<string, string>;
  onNoteUpdate: () => void;
}

export default function MacAddress({ mac, macNotes, onNoteUpdate }: MacAddressProps) {
  const t = useTranslations('macNotes');
  const [open, setOpen] = useState(false);
  const [editingNote, setEditingNote] = useState('');
  const [saving, setSaving] = useState(false);

  const note = macNotes[mac];
  const normalizedMac = mac?.toUpperCase();

  const handleSave = async () => {
    if (!editingNote.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/mac-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac_address: mac, note: editingNote.trim() }),
      });
      setOpen(false);
      onNoteUpdate();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await fetch(`/api/mac-notes/${encodeURIComponent(mac)}`, { method: 'DELETE' });
    setOpen(false);
    onNoteUpdate();
  };

  const handleOpenChange = (visible: boolean) => {
    if (visible) {
      setEditingNote(note || '');
    }
    setOpen(visible);
  };

  const popoverContent = (
    <div style={{ width: 220 }}>
      <Input.TextArea
        rows={2}
        value={editingNote}
        onChange={e => setEditingNote(e.target.value)}
        placeholder={t('placeholder')}
        style={{ marginBottom: 8 }}
        onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); handleSave(); } }}
      />
      <Space>
        <Button type="primary" size="small" loading={saving} onClick={handleSave}>
          {note ? t('editNote') : t('addNote')}
        </Button>
        {note && (
          <Popconfirm title={t('deleteConfirm')} onConfirm={handleDelete}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        )}
      </Space>
    </div>
  );

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span>{mac}</span>
      {note && <span style={{ color: '#1890ff', fontSize: 12 }}>({note})</span>}
      <Popover
        content={popoverContent}
        title={note ? t('editNote') : t('addNote')}
        trigger="click"
        open={open}
        onOpenChange={handleOpenChange}
      >
        <Button
          type="text"
          size="small"
          icon={note ? <EditOutlined /> : <PlusOutlined />}
          style={{ padding: '0 2px', minWidth: 'auto', height: 18, fontSize: 12 }}
          title={note ? t('editNote') : t('addNote')}
        />
      </Popover>
    </span>
  );
}
