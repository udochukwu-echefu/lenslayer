// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // src/lib/shared is a byte-for-byte copy of the dashboard's types (see scripts/check-shared-types.mjs),
    // so the linter must not reformat it.
    ignores: ['dist/*', 'src/lib/shared/*'],
  },
]);
