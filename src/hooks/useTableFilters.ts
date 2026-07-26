'use client';

import { useState, useCallback } from 'react';
import { Form } from 'antd';

/**
 * Shared hook for table filter panels.  Manages:
 *  - activeFilters (values applied to the current query)
 *  - filterOpen (collapse toggle)
 *  - filterForm (Ant Design Form instance)
 *  - handleSearch / handleReset (validate → apply / clear)
 *
 * @param defaults  initial (empty) filter values, e.g. { mac: '', poolId: 'ALL' }
 * @param onApply   optional side-effect callback (e.g. reset pagination)
 */
export function useTableFilters<T extends Record<string, string>>(
  defaults: T,
  onApply?: () => void,
) {
  const [activeFilters, setActiveFilters] = useState<T>(defaults);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterForm] = Form.useForm();

  const handleSearch = useCallback(async () => {
    try {
      const values = await filterForm.validateFields();
      const next: Record<string, string> = {} as Record<string, string>;
      for (const k of Object.keys(defaults)) {
        next[k] = values[k] != null ? String(values[k]) : (defaults[k] ?? '');
      }
      setActiveFilters(next as T);
      onApply?.();
    } catch {
      /* validation — user will see inline error, no further action needed */
    }
  }, [filterForm, defaults, onApply]);

  const handleReset = useCallback(() => {
    filterForm.resetFields();
    filterForm.setFieldsValue(defaults);
    setActiveFilters(defaults);
    onApply?.();
  }, [filterForm, defaults, onApply]);

  return {
    activeFilters,
    setActiveFilters, // rarely needed — for imperative resets outside the hook
    filterOpen,
    setFilterOpen,
    filterForm,
    handleSearch,
    handleReset,
  };
}
