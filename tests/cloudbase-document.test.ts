import assert from 'node:assert/strict'
import test from 'node:test'
import { withoutDocumentId } from '../cloudfunctions/app-api/src/helpers'

test('removes immutable _id before document.set writes', () => {
  const data = withoutDocumentId({ _id: 'record-id', status: 'taken', localDate: '2026-09-09' })

  assert.deepEqual(data, { status: 'taken', localDate: '2026-09-09' })
  assert.equal('_id' in data, false)
})
