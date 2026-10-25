import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MACHINE_START_CHECKS } from '../readiness';
import { StatusPanel, type StatusTone } from './StatusPanel';

const noop = () => {};

function panel(tone: StatusTone, atTheMachine: string[], swatchDownload: boolean): string {
  return renderToStaticMarkup(<StatusPanel
    tone={tone}
    title="Status"
    detail=""
    notes={[]}
    files={[]}
    onOpenFile={noop}
    onDownloadFile={noop}
    onPackage={noop}
    onPrint={noop}
    packaging={false}
    canPackage={tone === 'ready'}
    canPrint={tone === 'ready'}
    downloaded={false}
    swatch={{ gauges: [{ name: 'Body', measured: false }], onEnter: noop, file: { onDownload: swatchDownload ? noop : null, writing: false, problem: null } }}
    atTheMachine={atTheMachine}
  />);
}

const occurrences = (html: string, text: string) => html.split(text.replace(/'/g, '&#x27;')).length - 1;

describe('status panel start checks', () => {
  it('lists them with a swatch that can be downloaded while the design is blocked', () => {
    const html = panel('blocked', [], true);
    expect(html).toContain('At the machine, before knitting the swatch:');
    for (const check of MACHINE_START_CHECKS) expect(occurrences(html, check), check).toBe(1);
  });

  it('lists them once when the design can be knitted, and not without a swatch to download', () => {
    const ready = panel('ready', [...MACHINE_START_CHECKS], true);
    expect(ready).not.toContain('before knitting the swatch');
    for (const check of MACHINE_START_CHECKS) expect(occurrences(ready, check), check).toBe(1);
    const blocked = panel('blocked', [], false);
    for (const check of MACHINE_START_CHECKS) expect(occurrences(blocked, check), check).toBe(0);
  });
});
