const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Signs release builds with the real upload keystore instead of the debug one.
 *
 * Expo generates `android/` from scratch on every `prebuild --clean`, and that
 * generated build.gradle ships `signingConfig signingConfigs.debug` under
 * `release` with a comment telling you to replace it. A debug-signed APK is
 * rejected by the Play Store, so editing the generated file by hand would work
 * exactly until the next prebuild. This plugin reapplies the change every time.
 *
 * The keystore and its passwords live in `credentials/` (gitignored) and are
 * read at build time - nothing secret is written into the repo or the APK.
 */

const PROPERTIES_FILE = 'credentials/keystore.properties';

function readCredentials(projectRoot) {
  const file = path.join(projectRoot, PROPERTIES_FILE);
  if (!fs.existsSync(file)) return null;

  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }

  const required = [
    'CLIFFHANGER_UPLOAD_STORE_FILE',
    'CLIFFHANGER_UPLOAD_KEY_ALIAS',
    'CLIFFHANGER_UPLOAD_STORE_PASSWORD',
    'CLIFFHANGER_UPLOAD_KEY_PASSWORD',
  ];
  return required.every((key) => values[key]) ? values : null;
}

/** Copies the keystore next to the app module so Gradle can resolve it. */
const withKeystoreFile = (config) =>
  withDangerousMod(config, [
    'android',
    (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const credentials = readCredentials(projectRoot);
      if (!credentials) return modConfig;

      const source = path.join(projectRoot, 'credentials', credentials.CLIFFHANGER_UPLOAD_STORE_FILE);
      if (!fs.existsSync(source)) return modConfig;

      const destination = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        credentials.CLIFFHANGER_UPLOAD_STORE_FILE,
      );
      fs.copyFileSync(source, destination);
      return modConfig;
    },
  ]);

const withSigningConfig = (config) =>
  withAppBuildGradle(config, (modConfig) => {
    const credentials = readCredentials(modConfig.modRequest.projectRoot);
    if (!credentials) {
      // No keystore configured: leave the debug signing in place so a developer
      // build still works, rather than failing the whole prebuild.
      console.warn(
        '[withReleaseSigning] ' + PROPERTIES_FILE + ' not found - release builds will stay debug-signed.',
      );
      return modConfig;
    }

    let contents = modConfig.modResults.contents;

    const releaseSigningBlock = [
      '        release {',
      "            storeFile file('" + credentials.CLIFFHANGER_UPLOAD_STORE_FILE + "')",
      "            storePassword System.getenv('CLIFFHANGER_UPLOAD_STORE_PASSWORD') ?: '" +
        credentials.CLIFFHANGER_UPLOAD_STORE_PASSWORD +
        "'",
      "            keyAlias '" + credentials.CLIFFHANGER_UPLOAD_KEY_ALIAS + "'",
      "            keyPassword System.getenv('CLIFFHANGER_UPLOAD_KEY_PASSWORD') ?: '" +
        credentials.CLIFFHANGER_UPLOAD_KEY_PASSWORD +
        "'",
      '        }',
    ].join('\n');

    /*
     * Add a `release` signing config alongside the generated `debug` one.
     *
     * The guard looks for our own storeFile line rather than a `release {`
     * block: `signingConfigs { ... release {` matches across the whole file
     * because `buildTypes` also contains a `release {`, so a laxer test reports
     * the config as already present and silently skips the insert - leaving
     * build.gradle referencing a signingConfigs.release that does not exist.
     */
    const alreadyInserted = contents.includes(
      "storeFile file('" + credentials.CLIFFHANGER_UPLOAD_STORE_FILE + "')",
    );
    if (!alreadyInserted) {
      contents = contents.replace(/(signingConfigs\s*\{)/, '$1\n' + releaseSigningBlock);
    }

    // Point the release build type at it. This is the line that actually
    // matters - without it the APK is debug-signed and Play rejects the upload.
    contents = contents.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
      '$1signingConfig signingConfigs.release',
    );

    modConfig.modResults.contents = contents;
    return modConfig;
  });

module.exports = function withReleaseSigning(config) {
  return withSigningConfig(withKeystoreFile(config));
};
