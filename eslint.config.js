// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
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
