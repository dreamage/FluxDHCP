/**
 * Shared Ant Design form validators.  Factories accept translation functions
 * so callers can use their page-level or common namespace.
 */
import type { Rule } from 'antd/es/form';
import { isValidIPv4, ipToNum } from './ip-utils';

/**
 * IP address format validator (optional: skips empty values).
 * Usage: <Form.Item rules={[ipRule(tc)]} ...>
 */
export function ipRule(tc: (key: string) => string): Rule {
  return {
    validator: (_: any, value: string) =>
      value && !isValidIPv4(value) ? Promise.reject(tc('invalidIpv4')) : Promise.resolve(),
  };
}

/**
 * Pair of validators for ipStart / ipEnd that enforce both-or-none + range order.
 * Usage: <Form.Item name="ipStart" dependencies={['ipEnd']} rules={ipRangeRules(t, tc).start} ...>
 *        <Form.Item name="ipEnd"   dependencies={['ipStart']} rules={ipRangeRules(t, tc).end}   ...>
 */
export function ipRangeRules(
  t: (key: string) => string,
  tc: (key: string) => string,
): { start: Rule[]; end: Rule[] } {
  const ipFmt = ipRule(tc);

  const bothOrNone = (value: string, other: string) => {
    if ((value && !other) || (!value && other)) return Promise.reject(t('ipRangeBothRequired'));
    return Promise.resolve();
  };

  const rangeOrder = (value: string, other: string) => {
    if (value && other && isValidIPv4(value) && isValidIPv4(other) && ipToNum(value) > ipToNum(other))
      return Promise.reject(tc('errStartIpGreaterThanEnd'));
    return Promise.resolve();
  };

  const start: Rule[] = [
    ipFmt,
    ({ getFieldValue }) => ({
      validator(_: any, value: string) {
        const end = getFieldValue('ipEnd');
        return bothOrNone(value, end).then(() => rangeOrder(value, end));
      },
    }),
  ];

  const end: Rule[] = [
    ipFmt,
    ({ getFieldValue }) => ({
      validator(_: any, value: string) {
        const start = getFieldValue('ipStart');
        return bothOrNone(value, start).then(() => rangeOrder(start, value));
      },
    }),
  ];

  return { start, end };
}
