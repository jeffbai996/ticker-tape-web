const PRIVATE_FLAGS = ['VITE_PRIVATE', 'VITE_FAMILY_BUILD', 'VITE_FAMILY_AI']
const PRIVATE_VALUES = ['VITE_SYNC_CAPABILITY', 'VITE_READER_CAPABILITY', 'VITE_NEWS_PORTFOLIO_IDS']

export function publicBuildSettings(env) {
  const configured = [...PRIVATE_FLAGS.filter((key) => env[key] && env[key] !== '0'),
    ...PRIVATE_VALUES.filter((key) => env[key])]
  if (configured.length) {
    throw new Error(`This public demo does not accept private build configuration: ${configured.join(', ')}`)
  }
  // These substitutions also remove private-only imports from published assets.
  return { define: {
    'import.meta.env.VITE_PUBLIC_DEMO': JSON.stringify('1'),
    ...Object.fromEntries(PRIVATE_FLAGS.map((key) => [`import.meta.env.${key}`, JSON.stringify('0')])),
    ...Object.fromEntries(PRIVATE_VALUES.map((key) => [`import.meta.env.${key}`, JSON.stringify('')])),
  } }
}
