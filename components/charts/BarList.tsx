'use client';

import React from 'react';

export interface BarItem {
  key: string | number;
  label: React.ReactNode;
  value: number;
  /** 右侧显示内容，默认显示 value */
  trailing?: React.ReactNode;
  color?: string;
  onClick?: () => void;
}

interface BarListProps {
  items: BarItem[];
  /** 最大值（用于归一化条形长度），默认取 items 中最大 value */
  max?: number;
  /** 条形最小可见宽度百分比，避免极小值不可见 */
  minPercent?: number;
  emptyText?: string;
}

/**
 * 横向条形排行 — 手写 div 实现，零依赖。
 */
export default function BarList({ items, max, minPercent = 2, emptyText = '' }: BarListProps) {
  if (items.length === 0) {
    return (
      <div style={{ color: 'var(--color-text-muted)', fontSize: 13, padding: '12px 0' }}>
        {emptyText}
      </div>
    );
  }

  const maxVal = Math.max(1, max ?? Math.max(...items.map(i => i.value)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map(item => {
        const pct = Math.max(minPercent, (item.value / maxVal) * 100);
        const clickable = !!item.onClick;
        return (
          <div
            key={item.key}
            onClick={item.onClick}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.onClick?.(); } } : undefined}
            style={{ cursor: clickable ? 'pointer' : 'default' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
              <span style={{
                fontSize: 13, color: 'var(--color-text)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {item.label}
              </span>
              <span style={{
                fontSize: 12, color: 'var(--color-text-secondary)',
                fontFamily: 'var(--font-mono)', flexShrink: 0,
              }}>
                {item.trailing ?? item.value}
              </span>
            </div>
            <div style={{
              height: 8, borderRadius: 4, overflow: 'hidden',
              background: 'var(--color-border-subtle)',
            }}>
              <div style={{
                width: `${pct}%`,
                height: '100%',
                borderRadius: 4,
                background: item.color || 'var(--color-chart-1)',
                transition: 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
