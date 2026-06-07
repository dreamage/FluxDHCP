import { Skeleton, Space } from 'antd';

export default function Loading() {
  return (
    <div style={{ maxWidth: 900 }}>
      <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 24 }} />
      <Skeleton active paragraph={{ rows: 4 }} />
      <div style={{ marginTop: 32 }}>
        <Space>
          <Skeleton.Button active size="default" />
          <Skeleton.Button active size="default" />
        </Space>
      </div>
      <div style={{ marginTop: 24 }}>
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    </div>
  );
}
