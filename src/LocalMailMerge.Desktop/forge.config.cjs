module.exports = {
  packagerConfig: {
    asar: true,
    name: 'Local Mail Merge',
    executableName: 'LocalMailMerge',
    appBundleId: 'com.hkrc.localmailmerge',
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
        setupExe: 'LocalMailMergeSetup.exe'
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32']
    }
  ]
};
