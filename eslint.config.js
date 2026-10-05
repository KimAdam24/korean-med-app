// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // The label scan's fetched data holds old versions of src/, taken out of git.
    ignores: ["dist/*", "tools/label-scan/data/**"],
  },
  {
    // Jest integration tests: `describe`, `jest`, `expect` and friends.
    files: ["integration/**/*.{ts,tsx}"],
    languageOptions: {
      globals: Object.fromEntries(
        ["jest", "describe", "it", "test", "expect", "beforeEach", "afterEach", "beforeAll", "afterAll"].map(
          (name) => [name, "readonly"]
        )
      ),
    },
  },
]);
