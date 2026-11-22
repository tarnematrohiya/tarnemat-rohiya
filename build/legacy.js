// Windows 7 / 8 build: same app on Electron 22 (the last Electron that runs on Windows 7/8.1),
// one installer with 32-bit + 64-bit inside, updates from its own channel file win7.yml.
const base = require('../package.json').build;
module.exports = {
  ...base,
  electronVersion: '22.3.27',
  directories: { output: 'dist-legacy' },
  nsis: { ...base.nsis, artifactName: 'Tarnemat-Rohiya-Win7-Setup-${version}.${ext}' },
  publish: base.publish.map(p => ({ ...p, channel: 'win7' })),
};
