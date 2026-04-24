import CopyWebpackPlugin from 'copy-webpack-plugin';
import ESLintPlugin from 'eslint-webpack-plugin';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import LiveReloadPlugin from 'webpack-livereload-plugin';
import ReplaceInFileWebpackPlugin from 'replace-in-file-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import VirtualModulesPlugin from 'webpack-virtual-modules';
import { SubresourceIntegrityPlugin } from 'webpack-subresource-integrity';
import type { Configuration } from 'webpack';
import path from 'node:path';
import { getEntries, getPackageJson, getPluginJson, isWSL } from '../bundler/utils';
import { externals } from '../bundler/externals';
import { copyFilePatterns } from '../bundler/copyFiles';
import { BuildModeWebpackPlugin } from './BuildModeWebpackPlugin';

const pluginJson = getPluginJson();
const packageJson = getPackageJson();

const config = async (env: Record<string, unknown>): Promise<Configuration> => {
  const baseConfig: Configuration = {
    cache: {
      type: 'filesystem',
      buildDependencies: { config: [__filename] },
    },
    context: path.join(process.cwd(), 'src'),
    devtool: env.production ? 'source-map' : 'eval-source-map',
    entry: getEntries(),
    externals,
    mode: env.production ? 'production' : 'development',
    module: {
      rules: [
        {
          exclude: /node_modules/,
          test: /\.[tj]sx?$/,
          use: {
            loader: 'swc-loader',
            options: {
              jsc: {
                baseUrl: path.resolve(process.cwd(), 'src'),
                target: 'es2018',
                loose: false,
                parser: { syntax: 'typescript', tsx: true, decorators: false, dynamicImport: true },
                transform: { react: { runtime: 'classic' } },
              },
            },
          },
        },
        { test: /\.css$/, use: ['style-loader', 'css-loader'] },
        { test: /\.s[ac]ss$/, use: ['style-loader', 'css-loader', 'sass-loader'] },
        {
          test: /\.(png|jpe?g|gif|webp|svg)$/,
          type: 'asset/resource',
          generator: { filename: 'img/[hash][ext]' },
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf)(\?v=\d+\.\d+\.\d+)?$/,
          type: 'asset/resource',
          generator: { filename: 'fonts/[hash][ext]' },
        },
      ],
    },
    optimization: env.production
      ? {
          minimize: true,
          minimizer: [
            new TerserPlugin({
              terserOptions: {
                compress: { drop_console: ['log', 'info'] },
              },
            }),
          ],
        }
      : { minimize: false },
    output: {
      clean: { keep: /gpx_/ },
      filename: '[name].js',
      library: { type: 'amd' },
      path: path.resolve(process.cwd(), 'dist'),
      publicPath: `public/plugins/${pluginJson.id}/`,
      uniqueName: pluginJson.id,
    },
    plugins: [
      new VirtualModulesPlugin({
        'node_modules/grafana-public-path.js': `__webpack_public_path__ = window.__grafana_public_path__ || "public/plugins/${pluginJson.id}/";`,
      }),
      new CopyWebpackPlugin({ patterns: copyFilePatterns }),
      new ReplaceInFileWebpackPlugin([
        {
          dir: 'dist',
          files: ['plugin.json', 'module.js'],
          rules: [
            { search: '%VERSION%', replace: packageJson.version },
            { search: '%TODAY%', replace: new Date().toISOString().substring(0, 10) },
            { search: new RegExp('%PLUGIN_ID%', 'g'), replace: pluginJson.id },
          ],
        },
      ]),
      new BuildModeWebpackPlugin(),
      ...(env.development
        ? [
            new LiveReloadPlugin({ appendScriptTag: true, protocol: 'http', hostname: isWSL() ? 'localhost' : undefined }),
            new ForkTsCheckerWebpackPlugin({
              async: Boolean(env.development),
              issue: { include: [{ file: '**/*.{ts,tsx}' }] },
              typescript: { configFile: path.join(process.cwd(), 'tsconfig.json') },
            }),
            new ESLintPlugin({
              extensions: ['ts', 'tsx'],
              lintDirtyModulesOnly: true,
            }),
          ]
        : []),
    ],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      unsafeCache: true,
    },
  };

  return baseConfig;
};

export default config;
