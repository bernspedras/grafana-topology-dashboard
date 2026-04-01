import React, { Suspense, lazy } from 'react';
import { AppPlugin, type AppRootProps } from '@grafana/data';
import { LoadingPlaceholder } from '@grafana/ui';
import type { AppConfigProps } from './components/AppConfig/AppConfig';

export type { FlowLayout, StoredTopology, AppSettings } from './features/topology/application/pluginSettings';

const LazyApp = lazy(() => import('./components/App/App'));
const LazyAppConfig = lazy(() => import('./components/AppConfig/AppConfig'));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const App = (_props: AppRootProps): React.JSX.Element => (
  <Suspense fallback={<LoadingPlaceholder text="" />}>
    <LazyApp />
  </Suspense>
);

const AppConfig = (props: AppConfigProps): React.JSX.Element => (
  <Suspense fallback={<LoadingPlaceholder text="" />}>
    <LazyAppConfig {...props} />
  </Suspense>
);

export const plugin = new AppPlugin().setRootPage(App).addConfigPage({
  title: 'Configuration',
  icon: 'cog',
  body: AppConfig,
  id: 'configuration',
});
