import { build } from 'esbuild'

const functions = ['app-api', 'reminder-dispatcher']

await Promise.all(
  functions.map((name) =>
    build({
      entryPoints: [`cloudfunctions/${name}/src/index.ts`],
      // CloudBase Node handlers use the <file>.<export> form and do not
      // accept a nested path such as dist/index.main.
      outfile: `cloudfunctions/${name}/index.js`,
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      sourcemap: true,
      external: ['wx-server-sdk'],
    }),
  ),
)
