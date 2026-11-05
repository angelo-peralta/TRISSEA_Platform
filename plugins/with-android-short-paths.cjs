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
  subprojects { nativeProject ->
    ['com.android.application', 'com.android.library'].each { androidPlugin ->
      nativeProject.pluginManager.withPlugin(androidPlugin) {
        def staging = nativeProject.name == 'app' ? "../../../.c/${appKey}/a" : ".cxx/\${nativeProject.name}"
        nativeProject.extensions.getByName('android').externalNativeBuild.cmake.buildStagingDirectory =
          new File(rootProject.projectDir, staging)
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
