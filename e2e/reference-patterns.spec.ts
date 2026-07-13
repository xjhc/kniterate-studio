import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { ColorworkChartV1 } from '@kniterate-studio/chart-contract';

interface DecodedReference {
  carriers: string[];
  width: number;
  rows: Map<number, string>[];
  lo: number;
}

function decodeReference(name: 'fairisle' | 'jacquard' | 'dbj'): DecodedReference {
  const text = readFileSync(`packages/machine-lib/reference/${name}.kc`, 'utf8');
  const passes: { carrier: string; front: number[]; roller: number }[] = [];
  let front = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('FRNT:')) front = line.slice(5);
    const footer = /^(?:>>|<<)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)/.exec(line);
    if (!footer) continue;
    if (footer[1] === 'Kn-Kn') {
      const operated: number[] = [];
      for (let index = 0; index < front.length; index += 1) if (front[index] === '-') operated.push(index);
      passes.push({ carrier: footer[2]!, front: operated, roller: Number(footer[4]) });
    }
    front = '';
  }
  const counts = new Map<string, number>();
  passes.forEach((pass) => counts.set(pass.carrier, (counts.get(pass.carrier) ?? 0) + 1));
  const carriers = [...counts].filter(([carrier, count]) => carrier !== '0' && carrier !== '6' && count > 8).map(([carrier]) => carrier).sort();
  const rows: Map<number, string>[] = [];
  let row = new Map<number, string>();
  let seen = new Set<string>();
  for (const pass of passes.filter((item) => carriers.includes(item.carrier) && item.roller === 450)) {
    if (seen.has(pass.carrier)) { rows.push(row); row = new Map(); seen = new Set(); }
    pass.front.forEach((column) => row.set(column, pass.carrier));
    seen.add(pass.carrier);
  }
  if (row.size) rows.push(row);
  const selectedRows = name === 'fairisle' ? rows.slice(1) : name === 'dbj' ? rows.slice(0, 70) : rows;
  const columns = selectedRows.flatMap((item) => [...item.keys()]);
  const lo = Math.min(...columns);
  const hi = Math.max(...columns);
  return { carriers, width: hi - lo + 1, rows: selectedRows, lo };
}

function chartFromReference(name: 'fairisle' | 'jacquard' | 'dbj'): ColorworkChartV1 {
  const decoded = decodeReference(name);
  const colors = ['#F1EDE3', '#B4423A', '#C99A35', '#29445F'];
  const palette = decoded.carriers.map((carrier, index) => ({ id: `carrier-${carrier}`, name: `Reference C${carrier}`, hex: colors[index]! }));
  const cells = decoded.rows.map((row) => Array.from({ length: decoded.width }, (_, column) => {
    const carrier = row.get(decoded.lo + column) ?? decoded.carriers[0]!;
    return decoded.carriers.indexOf(carrier);
  })).reverse();
  return {
    kind: 'knitlab-colorwork-chart', version: 1,
    title: `${name} reference pattern`, width: decoded.width, height: cells.length,
    rowNumbering: 'bottom-up', palette, cells,
  };
}

for (const name of ['fairisle', 'jacquard', 'dbj'] as const) {
  test(`authors and exports the decoded ${name}.kc face design`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', (error) => errors.push(error.message));
    const chart = chartFromReference(name);
    await page.goto('/');
    await page.locator('input[accept=".json,application/json"]').setInputFiles({
      name: `${name}.colorwork.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(chart)),
    });
    await expect(page.locator('.brand-copy small')).toContainText(`${name} reference pattern`);
    if (name !== 'fairisle') {
      await page.getByRole('button', { name: /^Birdseye/ }).click();
      await page.getByLabel('Color coverage').selectOption('full');
    }
    const exportButton = page.getByRole('button', { name: 'Export k-code' });
    await expect(exportButton).toBeEnabled({ timeout: 20_000 });
    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.kc$/);
    expect(chart.width).toBe(name === 'fairisle' ? 64 : name === 'jacquard' ? 67 : 70);
    expect(chart.palette).toHaveLength(name === 'dbj' ? 4 : 2);
    expect(errors).toEqual([]);
  });
}
