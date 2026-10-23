import { Suspense } from 'react';
import AssetPageClient from './AssetPageClient';

export default function Page() {
  return (
    <Suspense fallback={<div className="page">Loading…</div>}>
      <AssetPageClient />
    </Suspense>
  );
}
