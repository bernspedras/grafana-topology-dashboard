import React, { Suspense, lazy } from 'react';
import { AppPlugin, type AppRootProps } from '@grafana/data';
import { LoadingPlaceholder } from '@grafana/ui';
import type { AppConfigProps } from './components/AppConfig/AppConfig';

export interface FlowLayout {
  readonly positions?: Record<string, { x: number; y: number }>;
  readonly handleOverrides?: Record<string, { sourceHandle: string; targetHandle: string }>;
  readonly edgeLabelOffsets?: Record<string, { x: number; y: number }>;
}

export interface StoredTopology {
  readonly id: string;
  readonly name: string;
  readonly layout?: FlowLayout;
  readonly definition: unknown; // TopologyDefinitionRefs — kept as raw JSON
}

export interface AppSettings {
  dataSourceMap?: Record<string, string>;
  editAllowList?: readonly string[];
  topologies?: StoredTopology[];
  nodeTemplates?: unknown[];
  edgeTemplates?: unknown[];
}

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
