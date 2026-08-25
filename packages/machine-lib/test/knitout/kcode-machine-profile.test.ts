import { describe, expect, it } from 'vitest'

import {
  KNITERATE_7GG_KCODE_PROFILE_V1,
  KNITERATE_LOOP_STACK_SOFTWARE_POLICY_V1,
  basePayloadIndexToKCodeColumn,
  kcodeColumnToBasePayloadIndex,
  kcodeColumnToTraceCoordinate,
  type KCodeMachineProfileV1,
} from '../../src/knitout/kcode/machine-profile.js'

describe('Kniterate 7gg KCode machine profile V1', () => {
  const profile: KCodeMachineProfileV1 = KNITERATE_7GG_KCODE_PROFILE_V1

  it('pins a versioned target and both known KCode dialects', () => {
    expect(profile).toMatchObject({
      schemaVersion: 1,
      profileId: 'kniterate-7gg-kcode',
      profileVersion: 1,
      dialect: 'knitout-vendor',
      supportedDialects: ['app', 'knitout-vendor'],
    })
  })

  it('keeps official machine facts separate from the KCode raster frame', () => {
    expect(profile.machine).toMatchObject({
      gauge: 7,
      needlesPerBed: 252,
      addressableNeedleRange: { min: 1, max: 252 },
      carriers: ['1', '2', '3', '4', '5', '6'],
      evidence: {
        gauge: { confidence: 'official-documented' },
        needlesPerBed: { confidence: 'official-documented' },
        addressableNeedleRange: { confidence: 'repository-tested' },
        carriers: { confidence: 'official-documented' },
      },
    })

    expect(profile.raster).toMatchObject({
      validationRole: 'structural',
      leftPaddingColumns: 15,
      rightPaddingColumns: 15,
      standardNeedleColumns: 253,
      standardBasePayloadColumns: 283,
      kcodeColumnRange: { min: 0, max: 252 },
      evidence: { confidence: 'pinned-implementation' },
    })
    expect(profile.raster.standardBasePayloadColumns).toBe(
      profile.raster.leftPaddingColumns
        + profile.raster.standardNeedleColumns
        + profile.raster.rightPaddingColumns,
    )
  })

  it('scopes the 282-column backend exception to empty carrierless moves', () => {
    expect(profile.raster.legacyEmptyMove).toEqual({
      needleColumns: 252,
      basePayloadColumns: 282,
      carrier: '0',
      passType: 'Kn-Kn',
      requiresNoSelectedNeedles: true,
    })
    expect(profile.raster.legacyEmptyMove.basePayloadColumns).toBe(
      profile.raster.leftPaddingColumns
        + profile.raster.legacyEmptyMove.needleColumns
        + profile.raster.rightPaddingColumns,
    )
  })

  it('maps marker-free payload positions without reapplying decorated-index corrections', () => {
    expect(basePayloadIndexToKCodeColumn(15)).toBe(0)
    expect(basePayloadIndexToKCodeColumn(267)).toBe(252)
    expect(kcodeColumnToBasePayloadIndex(0)).toBe(15)
    expect(kcodeColumnToBasePayloadIndex(252)).toBe(267)
    expect(() => basePayloadIndexToKCodeColumn(283)).toThrow(RangeError)
    expect(() => kcodeColumnToBasePayloadIndex(253)).toThrow(RangeError)

    expect(kcodeColumnToTraceCoordinate(128, 'app')).toBe(128)
    expect(kcodeColumnToTraceCoordinate(128, 'knitout-vendor')).toBe(128)
    expect(profile.dialects['knitout-vendor']).toMatchObject({
      markerFreeTraceOffset: 0,
      evidence: { confidence: 'pinned-implementation' },
    })
  })

  it('pins the documented rack envelope and repository-tested half-pitch values', () => {
    expect(profile.rack.values).toEqual([
      -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, 0,
      0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4,
    ])
    expect(profile.rack.documentedBounds.lower).toMatchObject({
      value: -4,
      evidence: { confidence: 'official-documented' },
    })
    expect(profile.rack.documentedBounds.upper.value).toBe(4)
    expect(profile.rack.granularity).toBe(0.5)
  })

  it('shares a conservative loop-stack software policy without claiming a physical limit', () => {
    expect(profile.loopStackSoftwarePolicy).toBe(
      KNITERATE_LOOP_STACK_SOFTWARE_POLICY_V1,
    )
    expect(profile.loopStackSoftwarePolicy).toEqual({
      validationRole: 'conservative-software-policy',
      warningAbove: 2,
      errorAbove: 3,
      physicalSafetyClaim: 'not-established',
    })
  })

  it('does not confuse wider backend stitch encoding with documented selector levels', () => {
    expect(profile.stitchSelectors.documentedBounds).toMatchObject({
      lower: { value: 0, evidence: { confidence: 'official-documented' } },
      upper: { value: 15, evidence: { confidence: 'official-documented' } },
    })
    expect(profile.stitchSelectors.encoding).toMatchObject({
      alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      encodableBounds: {
        lower: { value: 0 },
        upper: { value: 35 },
      },
      evidence: { confidence: 'pinned-implementation' },
    })
  })

  it('marks uncertain speed and roller operational limits as unverified', () => {
    const { speed, roller } = profile.processSettings

    expect(profile.processSettings.validationRole).toBe('advisory')
    expect(speed.footerSyntaxEvidence.confidence).toBe('pinned-implementation')
    expect(roller.footerSyntaxEvidence.confidence).toBe('pinned-implementation')

    expect(speed.editorDocumentedBounds.lower).toMatchObject({
      value: null,
      inclusive: null,
      evidence: { confidence: 'unverified' },
    })
    expect(speed.editorDocumentedBounds.upper).toMatchObject({
      value: 800,
      evidence: { confidence: 'official-documented' },
    })
    expect(speed.operationalBounds.lower.evidence.confidence).toBe('unverified')
    expect(speed.operationalBounds.upper.evidence.confidence).toBe('unverified')

    expect(roller.editorDocumentedBounds).toMatchObject({
      lower: { value: -500, evidence: { confidence: 'official-documented' } },
      upper: { value: 999, evidence: { confidence: 'official-documented' } },
    })
    expect(roller.operationalBounds.lower.value).toBeNull()
    expect(roller.operationalBounds.upper.value).toBeNull()
    expect(roller.operationalBounds.lower.evidence.confidence).toBe('unverified')
  })

  it('does not claim a physical needle label for an unresolved trace column', () => {
    expect(profile.coordinates.physicalNeedleNumbering).toMatchObject({
      status: 'unverified',
      evidence: { confidence: 'unverified' },
    })
  })
})
