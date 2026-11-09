import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  KNITERATE_7GG_KCODE_PROFILE_V2,
  auditTraceV1,
  compareTraceRangesV1,
  parseKCodeDocument,
  projectKCodeMachineTrace,
  traceAutoSectionsV1,
  traceRowsV1,
  type MachineTraceV1,
  type TraceSectionV1,
} from '../../src/browser.js'

type Bed = 'front' | 'rear'
type Act = ['knit' | 'tuck' | 'drop', Bed, number, number?] | ['xfer', Bed, number, Bed, number]
const at = (bed: Bed, n: number, size = 5) => ({ bed, traceCoordinate: n, stitchSelector: { encodedValue: size } })
/** A hand-built trace: one entry per pass, its carrier and what it does. */
function trace(passes: { carrier: string; acts: Act[] }[]): MachineTraceV1 {
  return {
    passes: passes.map((pass, index) => ({
      index,
      direction: index % 2 === 0 ? '>>' : '<<',
      carrier: pass.carrier,
      speed: 100,
      roller: 100,
      actions: pass.acts.map((act) => (act[0] === 'xfer' ? { kind: 'xfer', source: at(act[1], act[2]), target: at(act[3], act[4]) } : { kind: act[0], at: at(act[1], act[2], act[3]) })),
    })),
    rackCommands: [],
  } as never
}
const row = (carrier: string, bed: Bed, from: number, to: number): { carrier: string; acts: Act[] } => ({ carrier, acts: Array.from({ length: to - from + 1 }, (_, i) => ['knit', bed, from + i] as Act) })
const check = (audit: ReturnType<typeof auditTraceV1>, id: string) => audit.checks.find((item) => item.id === id)!

describe('loop audit', () => {
  it('flags a start loop waiting too long, as handoff 2 held one', () => {
    // The waste knits needles 1-4 then keeps knitting 2-4 for 20 passes; needle 1's loop waits.
    const passes = [row('6', 'front', 1, 4), ...Array.from({ length: 20 }, () => row('6', 'front', 2, 4)), row('1', 'front', 1, 4), row('3', 'front', 1, 4)]
    const sections: TraceSectionV1[] = [{ name: 'waste', from: 1, to: 21 }, { name: 'draw', from: 22, to: 22 }, { name: 'body', from: 23, to: 23 }]
    const audit = auditTraceV1(trace(passes), { sections })
    expect(check(audit, 'start-hold')).toMatchObject({ ok: false, value: 21, at: ['f1 from pass 1 (c6) to 22 (c1)'] })
    expect(audit.ok).toBe(false)
  })

  it('flags waste yarn knitting through doubled body loops, as the birdseye top did', () => {
    const passes = [row('3', 'front', 1, 4), row('3', 'rear', 1, 4), { carrier: '0', acts: [1, 2, 3, 4].map((n) => ['xfer', 'rear', n, 'front', n] as Act) }, row('6', 'front', 1, 4), { carrier: '0', acts: [1, 2, 3, 4].map((n) => ['drop', 'front', n] as Act) }]
    const audit = auditTraceV1(trace(passes), { sections: [{ name: 'body', from: 1, to: 3 }, { name: 'top', from: 4, to: 5 }] })
    expect(check(audit, 'waste-through-body-loops')).toMatchObject({ ok: false, value: 4 })
    expect(check(audit, 'max-stack')).toMatchObject({ ok: true, value: 2 })
    expect(check(audit, 'unsupported-body-drops')).toMatchObject({ ok: true, value: 0 })
  })

  it('flags body loops dropped with nothing holding them, but not a chain bind-off\'s last loop', () => {
    const released = auditTraceV1(trace([row('3', 'front', 1, 4), { carrier: '0', acts: [['drop', 'front', 1], ['drop', 'front', 2]] as Act[] }]), { sections: [{ name: 'body', from: 1, to: 2 }] })
    expect(check(released, 'unsupported-body-drops')).toMatchObject({ ok: false, value: 2 })
    expect(check(released, 'loops-left')).toMatchObject({ ok: false, value: 2 })
    // A chain: transfer the edge loop onto its neighbour, knit the merged loop, ... then drop the last one.
    const chain = trace([row('3', 'front', 1, 3), { carrier: '0', acts: [['xfer', 'front', 1, 'front', 2]] as Act[] }, row('3', 'front', 2, 2), { carrier: '0', acts: [['xfer', 'front', 2, 'front', 3]] as Act[] }, row('3', 'front', 3, 3), { carrier: '0', acts: [['drop', 'front', 3]] as Act[] }])
    const bound = auditTraceV1(chain, { sections: [{ name: 'body', from: 1, to: 1 }, { name: 'bind-off', from: 2, to: 6 }] })
    expect(check(bound, 'unsupported-body-drops')).toMatchObject({ ok: true, value: 0 })
    expect(check(bound, 'loops-left')).toMatchObject({ ok: true, value: 0 })
  })

  it('notes a body yarn knitting an empty needle inside the fabric (an eyelet), and stacks', () => {
    const passes = [row('3', 'front', 1, 3), row('3', 'front', 5, 7), row('3', 'front', 4, 4), { carrier: '0', acts: [['xfer', 'front', 1, 'front', 2], ['xfer', 'front', 3, 'front', 2], ['xfer', 'front', 4, 'front', 2]] as Act[] }]
    const audit = auditTraceV1(trace(passes), { sections: [{ name: 'body', from: 1, to: 4 }] })
    expect(check(audit, 'inside-empty-front-knits')).toMatchObject({ severity: 'note', ok: false, value: 1 })
    expect(check(audit, 'max-stack')).toMatchObject({ ok: false, value: 4 })
  })

  it('counts a waste carrier as body yarn inside a body section (Kniterate\'s sweater knits its rib with C6)', () => {
    const passes = [row('3', 'front', 1, 4), row('6', 'front', 1, 4), row('6', 'front', 1, 4)]
    const audit = auditTraceV1(trace(passes), { sections: [{ name: 'rib', from: 1, to: 3 }] })
    expect(check(audit, 'waste-through-body-loops').value).toBe(0)
    expect(audit.emptyNeedleKnits.front.edge).toBe(4)
  })
})

describe('pass comparison', () => {
  it('lines up ranges by their left edge and calls a stitch-for-stitch match at another width a width difference', () => {
    const narrow = trace([row('3', 'front', 11, 14)])
    const shifted = trace([row('3', 'front', 31, 34)])
    const wide = trace([row('3', 'front', 31, 36)])
    expect(compareTraceRangesV1(narrow, { from: 1, to: 1 }, shifted, { from: 1, to: 1 })).toMatchObject({ compared: 1, identical: 1 })
    expect(compareTraceRangesV1(narrow, { from: 1, to: 1 }, wide, { from: 1, to: 1 }).differences[0]!.fields).toEqual(['width'])
    expect(compareTraceRangesV1(narrow, { from: 1, to: 1 }, trace([row('4', 'front', 11, 14)]), { from: 1, to: 1 }, { carrierMap: { 3: '4' } })).toMatchObject({ identical: 1 })
  })
})

interface AtlasEntry { name: string; file: string; sha256: string; dialect: 'app' | 'knitout-vendor'; roles: { waste: string; draw: string | null }; sections: TraceSectionV1[] }
const referenceDir = resolve(__dirname, '../../reference')
const atlas = (JSON.parse(readFileSync(resolve(referenceDir, 'atlas.json'), 'utf8')) as { references: AtlasEntry[] }).references
const referenceTrace = (entry: AtlasEntry) => {
  const parsed = parseKCodeDocument(readFileSync(resolve(referenceDir, entry.file), 'utf8'), { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: entry.dialect, strict: true })
  if (!parsed.ok) throw new Error(`${entry.file} is not strict KCode`)
  return projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2)
}

describe('reference atlas (Kniterate\'s own files)', () => {
  it('names every reference file by its exact bytes, with sections covering every pass in order', { timeout: 60_000 }, () => {
    expect(atlas.map((entry) => entry.file).sort()).toEqual(['2x2-rib-beanie.kc', 'back.kc', 'color-swatch-bindoff.kc', 'dbj.kc', 'fairisle.kc', 'fox-baby-beanie.kc', 'front.kc', 'jacquard.kc', 'sleeves.kc', 'sophie.kc', 'sophie2.kc', 'sophie_stripe.kc', 'swatch.kc'])
    for (const entry of atlas) {
      expect(createHash('sha256').update(readFileSync(resolve(referenceDir, entry.file))).digest('hex'), entry.name).toBe(entry.sha256)
      const passes = referenceTrace(entry).passes.length
      expect(entry.sections[0]!.from, entry.name).toBe(1)
      expect(entry.sections.at(-1)!.to, entry.name).toBe(passes)
      entry.sections.slice(1).forEach((section, index) => expect(section.from, `${entry.name} ${section.name}`).toBe(entry.sections[index]!.to + 1))
    }
  })

  it('agrees with the automatic sections, which cannot tell a sweater\'s rib from its body', { timeout: 60_000 }, () => {
    for (const entry of atlas) {
      const merged = entry.sections.reduce<TraceSectionV1[]>((list, section) => {
        const name = section.name === 'rib' ? 'body' : section.name
        const last = list.at(-1)
        if (last && last.name === name) list[list.length - 1] = { ...last, to: section.to }
        else list.push({ ...section, name })
        return list
      }, [])
      expect(traceAutoSectionsV1(referenceTrace(entry), entry.roles), entry.name).toEqual(merged)
    }
  })

  it('audits as Kniterate made them: each failing check is a deliberate choice the check states', { timeout: 120_000 }, () => {
    const outcomes = Object.fromEntries(atlas.map((entry) => {
      const audit = auditTraceV1(referenceTrace(entry), { roles: entry.roles, sections: entry.sections })
      return [entry.name, audit.checks.filter((item) => !item.ok).map((item) => `${item.id} ${item.value}`)]
    }))
    expect(outcomes).toEqual({
      fairisle: [], jacquard: [], dbj: [], 'fox-baby-beanie': [], swatch: [], 'color-swatch-bindoff': [],
      '2x2-rib-beanie': ['unsupported-body-drops 25'],
      front: ['unsupported-body-drops 118'],
      back: ['unsupported-body-drops 118'],
      sleeves: ['start-hold 75'],
      sophie: ['inside-empty-front-knits 48'],
      sophie2: ['loops-left 12', 'inside-empty-front-knits 58'],
      sophie_stripe: ['inside-empty-front-knits 58'],
    })
  })

  it('lists passes with their section, settings and needles', () => {
    const entry = atlas.find((item) => item.name === 'dbj')!
    const rows = traceRowsV1(referenceTrace(entry), entry.sections)
    expect(rows[105]!.text).toBe('106 << c0 rack 0 speed 300 roller 450 | drop rear 70 (92..161) [draw]')
    expect(rows[109]!).toMatchObject({ pass: 110, section: 'cast-on', rack: 0.5, carrier: '3', stitch: { front: [3], rear: [3] }, actions: { 'knit front': 70, 'knit rear': 70 } })
  })
})
