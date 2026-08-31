import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TidyMarks',
    description:
      'Analyze, organize and safely write back Chrome native bookmarks with an AI model you configure.',
    minimum_chrome_version: '134',
    permissions: ['bookmarks', 'storage', 'favicon'],
    optional_host_permissions: ['https://*/*'],
    action: {
      default_title: 'TidyMarks',
    },
  },
});
