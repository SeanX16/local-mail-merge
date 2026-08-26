const packageMetadata = require('./package.json');

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'Local Mail Merge',
    executableName: 'LocalMailMerge',
    appBundleId: 'com.seanx16.localmailmerge',
    appCopyright: 'Copyright © 2026 Sean.',
    ignore: [
      /^\/node_modules(\/|$)/,
      /^\/renderer(\/|$)/,
      /^\/electron(\/|$)/,
      /^\/scripts(\/|$)/,
      /^\/tsconfig\./,
      /^\/vite\.config\./,
      /^\/forge\.config\./,
      /^\/package-lock\.json$/,
      /^\/\.gitignore$/
    ],
    extraResource: [
      '../LocalMailMerge.Worker/publish',
      '../../samples',
      '../../templates'
    ]
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'LocalMailMerge',
        setupExe: `Local-Mail-Merge-v${packageMetadata.version}-Setup.exe`
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32']
    }
  ]
};
