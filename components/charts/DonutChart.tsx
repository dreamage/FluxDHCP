'use client';

import React from 'react';

export interface DonutSlice {
  label: string;
  value: number;
  /** 颜色，支持 CSS 变量 */
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  /** 中心主数值（可为 ReactNode） */
  centerValue?: React.ReactNode;
  centerLabel?: React.ReactNode;
  emptyText?: string;
  ariaLabel?: string;
}

/**
 * 手写 SVG 环形图 — 零第三方依赖。
 * 通过 strokeDasharray 分段 + rotate(-90) 从顶部起始，中心内容用 HTML 叠加。
 */
export default function DonutChart({
  slices,
  size = 140,
  thickness = 14,
  centerValue,
  centerLabel,
  emptyText = '',
  ariaLabel,
}: DonutChartProps) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let acc = 0;
  const segments = slices
    .filter(s => s.value > 0)
    .map(s => {
      const frac = total > 0 ? s.value / total : 0;
      const seg = { ...s, len: frac * circumference, offset: acc };
      acc += frac * circumference;
      return seg;
    });

  const isEmpty = segments.length === 0;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
        {/* 底环 */}
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke="var(--color-border)" strokeWidth={thickness} opacity={0.4}
        />
        {segments.map((s, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${s.len} ${Math.max(0, circumference - s.len)}`}
            strokeDashoffset={-s.offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          >
            <title>{`${s.label}: ${s.value}`}</title>
          </circle>
        ))}
      </svg>

      {/* 中心内容 */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none', textAlign: 'center', lineHeight: 1.2,
      }}>
        {isEmpty ? (
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{emptyText}</span>
        ) : (
          <>
            <span style={{
              fontSize: 22, fontWeight: 800, color: 'var(--color-text)',
              fontFamily: 'var(--font-mono)',
            }}>
              {centerValue}
            </span>
            {centerLabel != null && (
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                {centerLabel}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
