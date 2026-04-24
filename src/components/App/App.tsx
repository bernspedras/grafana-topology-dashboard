import React, { Suspense } from 'react';

import { LoadingPlaceholder } from '@grafana/ui';

const TopologyPage = React.lazy(() => import('../../pages/TopologyPage'));

function App(): React.JSX.Element {
  return (
    <Suspense fallback={<LoadingPlaceholder text="Loading..." />}>
      <TopologyPage />
    </Suspense>
  );
}

export default App;
