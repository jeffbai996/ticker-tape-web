/** Build a bundled app without inheriting another deployment's audience. */
export function iosBuildOptions(env) {
  if (env.VITE_PRIVATE === '1') throw new Error('Private broker builds are not supported by the iOS preview.')
  const family = env.VITE_FAMILY_BUILD === '1'
  const capability = String(env.VITE_SYNC_CAPABILITY || '').trim().toLowerCase()
  if (family && !/^[a-f0-9]{32}$/.test(capability)) {
    throw new Error('The family build requires the existing sync capability. Do not generate a new one.')
  }
  if (!family && capability) throw new Error('A sync capability requires an explicit family build.')
  return {
    base: '/',
    build: { outDir: 'dist-ios' },
    define: {
      'import.meta.env.VITE_IOS': '"1"',
      'import.meta.env.VITE_PRIVATE': '"0"',
      'import.meta.env.VITE_TV': '"0"',
      'import.meta.env.VITE_PUBLIC_DEMO': JSON.stringify(family ? '0' : '1'),
      'import.meta.env.VITE_FAMILY_BUILD': JSON.stringify(family ? '1' : '0'),
      'import.meta.env.VITE_SYNC_CAPABILITY': JSON.stringify(capability),
    },
  }
}
