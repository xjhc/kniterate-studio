import { describe, expect, it } from 'vitest';
import { createColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { forgetProject, readRecentProject, readRecentProjects, rememberProject } from './recentProjects';

const chart = (id: string, title: string) => createColorworkProjectV1({
  kind: 'knitlab-colorwork-chart', version: 1, title, width: 2, height: 2,
  rowNumbering: 'bottom-up', palette: [{ id: 'ink', name: 'Ink', hex: '#112233' }],
  cells: [[0, 0], [0, 0]],
}, { id, title });

function memoryStorage(quota = Infinity) {
  const items = new Map<string, string>();
  const used = () => [...items].reduce((sum, [key, value]) => sum + key.length + value.length, 0);
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      const before = items.get(key);
      items.set(key, value);
      if (used() > quota) { if (before === undefined) items.delete(key); else items.set(key, before); throw new DOMException('full', 'QuotaExceededError'); }
    },
    removeItem: (key: string) => { items.delete(key); },
  };
}

describe('recent projects on this device', () => {
  it('keeps every project in its own slot, newest first, and opens each one back', () => {
    const storage = memoryStorage();
    rememberProject(storage, { slot: 'a', project: chart('beanie-1', 'Beanie'), kind: 'beanie', savedAt: '2026-10-11T10:00:00.000Z' });
    rememberProject(storage, { slot: 'b', project: chart('scarf-1', 'Scarf'), kind: 'panel', savedAt: '2026-10-11T11:00:00.000Z' });
    // Working on the beanie again moves it to the top.
    rememberProject(storage, { slot: 'a', project: chart('beanie-1', 'Beanie, renamed'), kind: 'beanie', savedAt: '2026-10-11T12:00:00.000Z' });
    expect(readRecentProjects(storage).map((item) => [item.slot, item.title, item.kind])).toEqual([['a', 'Beanie, renamed', 'beanie'], ['b', 'Scarf', 'panel']]);
    expect(readRecentProject(storage, 'b')?.title).toBe('Scarf');
    expect(readRecentProject(storage, 'missing')).toBeNull();
  });

  it('never drops a project to make room: a full storage fails, and removing is explicit', () => {
    const storage = memoryStorage(4000);
    rememberProject(storage, { slot: 'a', project: chart('one', 'One'), kind: 'chart' });
    expect(() => {
      for (let index = 0; index < 20; index += 1) rememberProject(storage, { slot: `s${index}`, project: chart(`p${index}`, `P${index}`), kind: 'chart' });
    }).toThrow();
    expect(readRecentProject(storage, 'a')?.title).toBe('One');
    expect(forgetProject(storage, 'a').some((item) => item.slot === 'a')).toBe(false);
    expect(readRecentProject(storage, 'a')).toBeNull();
  });

  it('ignores a damaged list', () => {
    const storage = memoryStorage();
    storage.setItem('kniterate-studio:recent-projects:v1', '{');
    expect(readRecentProjects(storage)).toEqual([]);
    storage.setItem('kniterate-studio:recent-projects:v1', JSON.stringify([{ slot: 'a' }, { slot: 'b', id: 'b', title: 'B', kind: 'chart', savedAt: 'now' }]));
    expect(readRecentProjects(storage).map((item) => item.slot)).toEqual(['b']);
  });
});
