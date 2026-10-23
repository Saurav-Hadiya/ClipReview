'use client';

import type { Version } from '@/lib/types';

export interface VersionSwitcherProps {
  versions?: Version[];
  value?: string | null;
  onChange?: (versionId: string) => void;
}

export default function VersionSwitcher({ versions = [], value, onChange }: VersionSwitcherProps) {
  if (!versions.length) return null;
  const sorted = [...versions].sort((a, b) => a.number - b.number);
  return (
    <label className="vs">
      <span className="vs-label">Version</span>
      <select value={value || ''} onChange={(e) => onChange?.(e.target.value)} aria-label="Version">
        {sorted.map((v) => (
          <option key={v.id} value={v.id}>
            {`v${v.number} — ${new Date(v.createdAt).toLocaleDateString()}`}
          </option>
        ))}
      </select>
    </label>
  );
}
