import { build } from 'esbuild'

const functions = ['app-api', 'reminder-dispatcher']

await Promise.all(
  functions.map((name) =>
    build({
      entryPoints: [`cloudfunctions/${name}/src/index.ts`],
      outfile: `cloudfunctions/${name}/dist/index.js`,
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      sourcemap: true,
      external: ['wx-server-sdk'],
    }),
  ),
)
