const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

/**
 * Resolves the ML Kit manifest conflict this module would otherwise cause.
 *
 * `com.google.mlkit.vision.DEPENDENCIES` tells Google Play Services which
 * on-device models to fetch at install time. It is a single `<meta-data>` key
 * holding a comma-separated list, and more than one package wants it:
 *
 *   - `expo-camera`        declares "barcode_ui"  (ships in every build)
 *   - `expo-dev-launcher`  declares "barcode_ui"  (debug manifest only)
 *   - this module needs    "ocr"
 *
 * The two Expo packages agree with each other, so they merge quietly. Adding
 * "ocr" from the module's own manifest does not merge — the Android manifest
 * merger treats two different values for one `android:name` as a conflict and
 * fails the build. It surfaces first in a dev build because of
 * `expo-dev-launcher`, but `expo-camera` alone would break release builds too,
 * so fixing only the dev case would just move the failure later.
 *
 * Only one value can win, so it is assembled here, where the whole app is in
 * scope, and marked `tools:replace` so the application manifest overrides every
 * library that declares the key.
 *
 * ## Keeping this honest
 *
 * The list is hardcoded because config plugins run during prebuild, before
 * Gradle merges library manifests — there is no way to read what `expo-camera`
 * declared and append to it. If `expo-camera` ever changes its value, dropping
 * it here would silently stop the barcode model from being fetched at install
 * and the first scan would stall while it downloaded. Hence the explicit
 * default below rather than a bare "ocr", and hence the `dependencies` prop for
 * overriding it without editing the module.
 */

const META_DATA_NAME = 'com.google.mlkit.vision.DEPENDENCIES';
const TOOLS_NAMESPACE = 'http://schemas.android.com/tools';

/** Must remain a superset of every value declared by a dependency. */
const DEFAULT_DEPENDENCIES = ['ocr', 'barcode_ui'];

/** @type {import('expo/config-plugins').ConfigPlugin<{ dependencies?: string[] } | void>} */
const withMlKitVisionDependencies = (config, props) => {
  const dependencies =
    props && Array.isArray(props.dependencies) && props.dependencies.length > 0
      ? props.dependencies
      : DEFAULT_DEPENDENCIES;

  // De-duplicated and order-stable so the generated manifest does not churn
  // between prebuilds.
  const value = [...new Set(dependencies)].join(',');

  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults;

    // `tools:replace` is meaningless unless the namespace is declared on the
    // root element. Expo's template usually includes it; setting it is
    // idempotent and removes the dependency on that staying true.
    manifest.manifest.$ = manifest.manifest.$ || {};
    manifest.manifest.$['xmlns:tools'] = TOOLS_NAMESPACE;

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    application['meta-data'] = application['meta-data'] || [];

    const existing = application['meta-data'].find(
      (item) => item.$ && item.$['android:name'] === META_DATA_NAME
    );

    if (existing) {
      existing.$['android:value'] = value;
      existing.$['tools:replace'] = 'android:value';
    } else {
      application['meta-data'].push({
        $: {
          'android:name': META_DATA_NAME,
          'android:value': value,
          'tools:replace': 'android:value',
        },
      });
    }

    return modConfig;
  });
};

module.exports = withMlKitVisionDependencies;
