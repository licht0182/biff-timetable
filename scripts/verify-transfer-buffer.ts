import assert from 'node:assert/strict'
import { getTransferBuffer } from '../src/transfer-buffer'

const settings = {
  sameVenueMinutes: 0,
  sameClusterMinutes: 10,
  differentVenueMinutes: 30,
}

const cgv = 'CGV센텀시티 1관'
const dsu = '동서대학교-경남정보대학교 지하 1층 민석소극장'
const lotte = '롯데시네마 센텀시티 4관'

const cgvToDsu = getTransferBuffer(cgv, dsu, settings)
const dsuToCgv = getTransferBuffer(dsu, cgv, settings)
const dsuToLotte = getTransferBuffer(dsu, lotte, settings)

assert.equal(cgvToDsu.minutes, 18)
assert.equal(cgvToDsu.routeLabel, 'CGV → 동서대')
assert.equal(cgvToDsu.precise, true)
assert.equal(dsuToCgv.minutes, 19)
assert.equal(dsuToCgv.routeLabel, '동서대 → CGV')
assert.equal(dsuToLotte.minutes, 20)

assert.equal(getTransferBuffer(cgv, cgv, { ...settings, sameVenueMinutes: 5 }).minutes, 5)
assert.equal(getTransferBuffer('미등록 A', '미등록 B', settings).minutes, 30)
console.log('shared transfer buffer regressions passed')
