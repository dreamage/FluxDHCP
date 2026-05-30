'use client';

import React, { useEffect, useState, forwardRef, useImperativeHandle, useRef } from 'react';
import { AutoComplete } from 'antd';

interface MacInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onSelect?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  knownMacs?: string[];
}

const MacInput = forwardRef<any, MacInputProps>(({ value, onChange, onSelect, placeholder, disabled, knownMacs }, ref) => {
  const [macNotes, setMacNotes] = useState<Record<string, string>>({});
  const inputRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  useEffect(() => {
    fetch('/api/mac-notes')
      .then(res => res.ok ? res.json() : {})
      .then(setMacNotes)
      .catch(() => {});
  }, []);

  // Build options from knownMacs (unique, sorted, with notes)
  const allMacs = Array.from(new Set([
    ...(knownMacs || []),
    ...Object.keys(macNotes),
  ])).filter(Boolean).sort();

  const options = allMacs.map(mac => {
    const note = macNotes[mac];
    return {
      value: mac,
      label: (
        <span>
          <span style={{ fontFamily: 'monospace' }}>{mac}</span>
          {note && <span style={{ color: '#1890ff', marginLeft: 8, fontSize: 12 }}>({note})</span>}
        </span>
      ),
    };
  });

  const handleChange = (val: string) => {
    if (!val) {
      onChange?.('');
      return;
    }
    onChange?.(val.toUpperCase());
  };

  return (
    <AutoComplete
      ref={inputRef}
      value={value}
      onChange={handleChange}
      onSelect={onSelect}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      allowClear
      filterOption={(inputValue, option) =>
        (option?.value as string)?.toUpperCase().includes(inputValue.toUpperCase()) ||
        (macNotes[option?.value as string] || '').toLowerCase().includes(inputValue.toLowerCase())
      }
      style={{ width: '100%' }}
    />
  );
});

MacInput.displayName = 'MacInput';

export default MacInput;
