// Expo config plugins execute as CommonJS during Continuous Native Generation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withProjectBuildGradle } = require('@expo/config-plugins');

const start = '// TRISSEA native staging begin';
const end = '// TRISSEA native staging end';
function updateGradle(contents, appKey) {
  if (!/^[a-z]$/.test(appKey ?? '')) throw new Error('A one-letter appKey is required for isolated native staging');
  const block = `${start}
// Keep native object paths out of pnpm's long dependency directories on Windows.
if (System.getProperty('os.name').toLowerCase().contains('windows')) {
  // Long checkout names plus generated target names can exceed MAX_PATH even
  // after object hashing. Isolate staging by canonical checkout path and app.
  def workspaceKey = java.security.MessageDigest.getInstance('SHA-256')
    .digest(rootProject.projectDir.canonicalPath.getBytes('UTF-8')).encodeHex().toString().substring(0, 12)
  def nativeRoot = new File(System.getProperty('user.home'), ".trissea-native/\${workspaceKey}/${appKey}")
  subprojects { nativeProject ->
    ['com.android.application', 'com.android.library'].each { androidPlugin ->
      nativeProject.pluginManager.withPlugin(androidPlugin) {
        def staging = new File(nativeRoot, nativeProject.name == 'app' ? 'a' : nativeProject.name)
        nativeProject.extensions.getByName('android').externalNativeBuild.cmake.buildStagingDirectory =
          staging
        // SDK CMake 3.31.6 bundles Ninja 1.12.1, which handles Windows input
        // paths above 260 characters. Object hashing alone cannot fix inputs.
        nativeProject.extensions.getByName('android').externalNativeBuild.cmake.version = '3.31.6'
        // Force deterministic object-name hashing before Ninja's Windows limit.
        // The default limit missed long pnpm/gesture-handler shadow-node paths.
        nativeProject.extensions.getByName('android').defaultConfig.externalNativeBuild.cmake.arguments '-DCMAKE_OBJECT_PATH_MAX=250'
      }
    }
  }
}
${end}`;
    const expression = new RegExp(`${start}[\\s\\S]*?${end}`);
    const existing = contents.replace(expression, '').trimEnd();
    // React Native's root plugin can eagerly evaluate :app and other modules.
    // Register callbacks before applying root plugins, while their DSL is mutable.
    const anchor = /^apply plugin:/m.exec(existing);
    if (!anchor) throw new Error('Cannot locate the Android root plugin anchor');
    return `${existing.slice(0, anchor.index).trimEnd()}\n\n${block}\n\n${existing.slice(anchor.index)}\n`;
}

module.exports = function withAndroidShortPaths(config, { appKey } = {}) {
  return withProjectBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('TRISSEA native staging requires Groovy build.gradle');
    mod.modResults.contents = updateGradle(mod.modResults.contents, appKey);
    return mod;
  });
};
module.exports.updateGradle = updateGradle;
