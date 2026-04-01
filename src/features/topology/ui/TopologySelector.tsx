import React from 'react';
import { css } from '@emotion/css';
import type { SelectableValue } from '@grafana/data';
 
import { Select } from '@grafana/ui';
import type { TopologyListItem } from '../application/useTopologies';

interface TopologySelectorProps {
  readonly topologies: readonly TopologyListItem[];
  readonly selectedId: string;
  readonly onChange: (id: string) => void;
}

export function TopologySelector({ topologies, selectedId, onChange }: TopologySelectorProps): React.JSX.Element {
  const options: SelectableValue<string>[] = topologies.map((t) => ({
    label: t.name,
    value: t.id,
  }));

  return (
    <div className={selectorStyles.wrapper}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3" />
        <circle cx="18" cy="18" r="3" />
        <circle cx="18" cy="6" r="3" />
        <line x1="8.5" y1="7.5" x2="15.5" y2="16.5" />
        <line x1="8.5" y1="6" x2="15" y2="6" />
      </svg>
      {/* eslint-disable-next-line @typescript-eslint/no-deprecated */}
      <Select<string>
        options={options}
        value={selectedId}
        onChange={(v: SelectableValue<string>): void => { onChange(v.value ?? ''); }}
        isClearable={false}
        menuShouldPortal
      />
    </div>
  );
}

const selectorStyles = {
  wrapper: css({ display: 'flex', alignItems: 'center', gap: '8px' }),
};
