import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { storyItems } from '../handoff';
import { MACHINE_START_CHECKS, type Finding } from '../readiness';
import { StatusPanel, type SwatchStep } from './StatusPanel';
import { statusNotes } from './statusNotes';

const noop = () => {};
type PanelProps = ComponentProps<typeof StatusPanel>;

const swatch = (measured: boolean, downloadable = true, downloaded = false): SwatchStep => ({
  gauges: [{ name: 'Body', measured }],
  onEnter: noop,
  file: { onDownload: downloadable ? noop : null, writing: false, problem: null, downloaded },
});

function panel(overrides: Partial<PanelProps> = {}): string {
  return renderToStaticMarkup(<StatusPanel
    tone="ready"
    title="Ready to knit"
    detail="Machine file checks passed."
    notes={[]}
    files={[{ id: 'body', name: 'Body', fileName: 'body.kc', facts: '120 rows', state: 'ok' }]}
    onOpenFile={noop}
    onDownloadFile={noop}
    onPackage={noop}
    onPrint={noop}
    packaging={false}
    canPackage={true}
    canPrint={true}
    downloaded={false}
    swatch={swatch(true)}
    atTheMachine={[...MACHINE_START_CHECKS]}
    {...overrides}
  />);
}

const occurrences = (html: string, text: string) => html.split(text.replace(/'/g, '&#x27;')).length - 1;
const textContent = (html: string) => html.replace(/<[^>]*>/g, '');
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);

function button(html: string, label: string): string {
  const found = buttons(html).find((candidate) => textContent(candidate) === label || candidate.includes(`aria-label="${label}"`));
  expect(found, `button ${label}`).toBeDefined();
  return found!;
}

function disclosure(html: string, label: string): string {
  const found = [...html.matchAll(/<details\b[^>]*>[\s\S]*?<\/details>/g)]
    .map(([details]) => details)
    .find((details) => {
      const summary = details.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1];
      return summary !== undefined && textContent(summary).trim().startsWith(label);
    });
  expect(found, `disclosure ${label}`).toBeDefined();
  expect(found!.match(/^<details\b[^>]*>/)?.[0], `${label} starts closed`).not.toMatch(/\bopen(?:=|\s|>)/);
  return found!;
}

/** Native closed details expose the summary but hide the remainder in the browser. */
function initiallyVisible(html: string): string {
  return html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, (details) => {
    expect(details.match(/^<details\b[^>]*>/)?.[0]).not.toMatch(/\bopen(?:=|\s|>)/);
    return details.match(/<summary\b[^>]*>[\s\S]*?<\/summary>/)?.[0] ?? '';
  });
}

const primaryLabels = (html: string) => buttons(initiallyVisible(html))
  .filter((candidate) => /class="[^"]*\bprimary-button\b/.test(candidate))
  .map(textContent);

function expectDisabled(html: string, label: string, disabled: boolean): void {
  expect(/\bdisabled(?:=|\s|>)/.test(button(html, label)), label).toBe(disabled);
}

describe('status panel progressive disclosure', () => {
  it('leads with the knitting package when the swatch is measured', () => {
    const html = panel();
    expect(primaryLabels(html)).toEqual(['Download knitting package']);
    expectDisabled(initiallyVisible(html), 'Download knitting package', false);
    expect(initiallyVisible(html)).toContain('Ready to knit');
    expect(initiallyVisible(html)).not.toContain('body.kc');
    expect(initiallyVisible(html)).not.toContain('Print knitting sheet');
    disclosure(html, 'Swatch');
    disclosure(html, 'Files and printing');
    disclosure(html, 'Before knitting');
  });

  it('leads with the swatch download before measurements are entered', () => {
    const html = panel({ swatch: swatch(false) });
    expect(primaryLabels(html)).toEqual(['Download swatch file']);
    expectDisabled(initiallyVisible(html), 'Download swatch file', false);
    expect(initiallyVisible(html)).not.toContain('Download knitting package');
    expect(disclosure(html, 'Swatch')).toContain('Enter your swatch');
    expectDisabled(disclosure(html, 'Files and printing'), 'Download knitting package', false);
  });

  it('leads with entering measurements once the swatch file is downloaded', () => {
    const html = panel({ swatch: swatch(false, true, true) });
    expect(primaryLabels(html)).toEqual(['Enter your swatch']);
    expect(initiallyVisible(html)).toContain('Swatch file downloaded');
    expect(disclosure(html, 'Swatch')).toContain('Download swatch file');
    expect(occurrences(html, 'Enter your swatch')).toBe(1);
  });

  it('leads with printing once the package is downloaded, and keeps the package a click away', () => {
    const html = panel({ downloaded: true });
    expect(primaryLabels(html)).toEqual(['Print knitting sheet']);
    expect(initiallyVisible(html)).toContain('Downloaded');
    expectDisabled(disclosure(html, 'Files and printing'), 'Download knitting package', false);
    expect(occurrences(html, 'Print knitting sheet')).toBe(1);
  });

  it('leads with entering measurements when no swatch file is available', () => {
    const html = panel({ swatch: swatch(false, false) });
    expect(primaryLabels(html)).toEqual(['Enter your swatch']);
    expectDisabled(initiallyVisible(html), 'Enter your swatch', false);
    expect(html).not.toContain('Download swatch file');
  });

  it('keeps the first blocker and its fix visible and puts the remaining notes in Why?', () => {
    const html = panel({
      tone: 'blocked',
      title: 'Fix the design',
      canPackage: false,
      notes: [
        { severity: 'error', text: 'The body is too wide.', why: 'It would not fit on the bed.', actions: <button type="button">Change width</button> },
        { severity: 'error', text: 'A transfer needs attention.' },
        { severity: 'info', text: 'The draw yarn uses carrier 1.' },
      ],
    });
    const visible = initiallyVisible(html);
    expect(visible).toContain('The body is too wide.');
    expect(visible).toContain('Change width');
    expect(visible).not.toContain('It would not fit on the bed.');
    expect(visible).toContain('2 more to check');
    expect(visible).not.toContain('A transfer needs attention.');
    expect(visible).not.toContain('The draw yarn uses carrier 1.');
    const why = disclosure(html, 'Why?');
    expect(why).toContain('It would not fit on the bed.');
    expect(why).toContain('A transfer needs attention.');
    expect(why).toContain('The draw yarn uses carrier 1.');
    expect(occurrences(html, 'The body is too wide.')).toBe(1);
    expectDisabled(html, 'Download knitting package', true);
  });

  it('shows the next step in words when no button takes it', () => {
    const html = panel({ tone: 'warn', title: '1 thing to check', notes: [{ severity: 'warning', text: 'Motif: cannot be placed', action: 'Move or shrink the motif.', why: 'It is left out.' }] });
    expect(initiallyVisible(html)).toContain('Move or shrink the motif.');
    expect(disclosure(html, 'Why?')).toContain('It is left out.');
    expect(primaryLabels(html)).toEqual([]);
  });

  it('leaves out Why? when there is nothing more to say', () => {
    const html = panel({ tone: 'blocked', title: 'The check stopped', detail: 'The worker failed.', notes: [], canPackage: false });
    expect(initiallyVisible(html)).toContain('The worker failed.');
    expect(html).not.toContain('<summary>Why?');
    expect(occurrences(html, 'The worker failed.')).toBe(1);
  });

  it('disables garment downloads and printing while checking, while preserving a validated swatch', () => {
    // Previously checked file props can remain present while the next compile runs.
    const html = panel({ tone: 'checking', title: 'Checking your design' });
    expectDisabled(html, 'Download knitting package', true);
    expectDisabled(html, 'Download body.kc', true);
    expectDisabled(html, 'Print knitting sheet', true);
    expectDisabled(disclosure(html, 'Swatch'), 'Download swatch file', false);
    expect(initiallyVisible(html)).not.toContain('Download swatch file');
  });

  it('retains file inspection, per-file gates, printing and swatch controls inside their disclosures', () => {
    const html = panel({
      files: [
        { id: 'body', name: 'Body', fileName: 'body.kc', facts: '120 rows', state: 'ok', copies: 2 },
        { id: 'sleeve', name: 'Sleeve', fileName: 'sleeve.kc', facts: '80 rows', state: 'blocked', error: 'Sleeve needs a fix.' },
        { id: 'neck', name: 'Neck', fileName: 'neck.kc', facts: '20 rows', state: 'checking' },
      ],
      fileDetail: { id: 'body', content: <p>Body shaping details</p> },
      canPrint: false,
    });
    const files = disclosure(html, 'Files and printing');
    expect(files).toContain('See what body.kc knits');
    expect(files).toContain('run 2×');
    expect(files).toContain('Body shaping details');
    expect(files).toContain('Sleeve needs a fix.');
    expectDisabled(files, 'Download body.kc', false);
    expectDisabled(files, 'Download sleeve.kc', true);
    expectDisabled(files, 'Download neck.kc', true);
    expectDisabled(files, 'Print knitting sheet', true);
    const swatchDetails = disclosure(html, 'Swatch');
    expect(swatchDetails).toContain('measured');
    expectDisabled(swatchDetails, 'Change your swatch', false);
    expectDisabled(swatchDetails, 'Download swatch file', false);
  });
});

describe('status panel start checks', () => {
  it('keeps each startup check once in the closed Before knitting disclosure', () => {
    const html = panel({ atTheMachine: [...MACHINE_START_CHECKS, 'Set the yarn tension for this swatch.'] });
    const before = disclosure(html, 'Before knitting');
    for (const check of MACHINE_START_CHECKS) {
      expect(occurrences(html, check), check).toBe(1);
      expect(occurrences(before, check), check).toBe(1);
      expect(occurrences(initiallyVisible(html), check), check).toBe(0);
    }
    expect(before).toContain('Set the yarn tension for this swatch.');
  });

  it('keeps a validated swatch and its startup checks available when the design is blocked', () => {
    const html = panel({ tone: 'blocked', canPackage: false, canPrint: false, atTheMachine: [], swatch: swatch(false) });
    expectDisabled(html, 'Download swatch file', false);
    expectDisabled(html, 'Download knitting package', true);
    const before = disclosure(html, 'Before knitting');
    for (const check of MACHINE_START_CHECKS) {
      expect(occurrences(html, check), check).toBe(1);
      expect(occurrences(before, check), check).toBe(1);
      expect(occurrences(initiallyVisible(html), check), check).toBe(0);
    }
  });

  it('does not invent startup checks for a blocked design without a downloadable swatch', () => {
    const html = panel({ tone: 'blocked', canPackage: false, canPrint: false, atTheMachine: [], swatch: swatch(false, false) });
    for (const check of MACHINE_START_CHECKS) expect(occurrences(html, check), check).toBe(0);
  });
});

describe('status notes', () => {
  const finding = (rule: string, fixes: Finding['fixes'] = []): Finding => ({ stage: 'kcode', rule, severity: 'warning', owner: 'design', path: null, title: rule, message: `${rule} message`, fixes });

  it('says what is wrong in a few words, with a birdseye back as the fix for long floats', () => {
    const [note] = statusNotes(storyItems([finding('long-float')]), { swatchStep: true, goTo: noop, birdseye: noop });
    expect(note!.text).toBe('Body colourwork: floats too long');
    expect(note!.action).toBeNull();
    expect(note!.why).toBe('A long strand of yarn would lie behind the work and snag fingers and hair. Switch the body to a birdseye back, or make the motif bolder or more compact.');
    const buttons = renderToStaticMarkup(<>{note!.actions}</>);
    expect(buttons.indexOf('Use a birdseye back')).toBeLessThan(buttons.indexOf('Show'));
  });

  it('keeps the next step in words where no fix is offered', () => {
    const [note] = statusNotes(storyItems([finding('long-float')]), { swatchStep: true, goTo: noop, birdseye: null });
    expect(note!.action).toBe('Switch the body to a birdseye back, or make the motif bolder or more compact.');
    expect(note!.why).toBe('A long strand of yarn would lie behind the work and snag fingers and hair.');
    expect(renderToStaticMarkup(<>{note!.actions}</>)).not.toContain('birdseye');
  });

  it('offers a finding’s own fix first, and a message without a story as it is', () => {
    const [resize, other] = statusNotes(storyItems([finding('size-off-target', [{ label: 'Resize to 44 rows', edits: [] }]), finding('unknown-rule')]), { swatchStep: true, goTo: noop, operate: noop });
    expect(resize!.text).toBe('Size: not the size you asked for');
    expect(resize!.action).toBeNull();
    expect(renderToStaticMarkup(<>{resize!.actions}</>)).toContain('Resize to 44 rows');
    expect(other).toMatchObject({ text: 'unknown-rule message', action: null, why: null });
  });
});
