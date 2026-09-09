import { copyFile, mkdir } from 'node:fs/promises'

const files = ['day-state.ts', 'index.ts', 'local-date.ts', 'regimen.ts']
const target = 'miniprogram/domain'

await mkdir(target, { recursive: true })
await Promise.all(files.map((file) => copyFile(`packages/domain/src/${file}`, `${target}/${file}`)))
