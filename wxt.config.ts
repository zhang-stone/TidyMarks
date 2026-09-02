import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDesc__',
    default_locale: 'zh_CN',
    minimum_chrome_version: '134',
    permissions: ['bookmarks', 'storage', 'favicon'],
    optional_host_permissions: ['https://*/*'],
    action: {
      default_title: 'TidyMarks',
    },
  },
});
