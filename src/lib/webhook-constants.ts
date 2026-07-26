/** Shared event-type constants for webhook configuration and delivery logs. */
export const EVENT_COLORS: Record<string, string> = {
  dhcp_discover: 'blue',
  dhcp_offer: 'cyan',
  dhcp_request: 'orange',
  dhcp_ack: 'green',
  dhcp_nak: 'volcano',
  dhcp_release: 'default',
  dhcp_inform: 'purple',
  dhcp_decline: 'red',
};

export const EVENT_OPTIONS = [
  { value: 'dhcp_discover', labelKey: 'dhcpDiscover' },
  { value: 'dhcp_offer', labelKey: 'dhcpOffer' },
  { value: 'dhcp_request', labelKey: 'dhcpRequest' },
  { value: 'dhcp_ack', labelKey: 'dhcpAck' },
  { value: 'dhcp_nak', labelKey: 'dhcpNak' },
  { value: 'dhcp_release', labelKey: 'dhcpRelease' },
  { value: 'dhcp_inform', labelKey: 'dhcpInform' },
  { value: 'dhcp_decline', labelKey: 'dhcpDecline' },
] as const;
