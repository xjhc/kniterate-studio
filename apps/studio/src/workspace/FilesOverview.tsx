import type { KnitFile } from '../sweater/knitFile';

/** Every machine file of a project, in the order you run them, each as a strip of its sections. */

export interface OverviewFile {
  id: string;
  name: string;
  fileName: string;
  copies: number;
  file: KnitFile | null;
  waiting: string | null;
}

export function FilesOverview({ files, onOpen }: { files: OverviewFile[]; onOpen: (id: string) => void }) {
  const runs = files.reduce((sum, file) => sum + file.copies, 0);
  return <div className="files-overview">
    <h2>{runs} {runs === 1 ? 'run' : 'runs'} on the machine</h2>
    <ol>{files.map((item) => <li key={item.id}>
      <button type="button" onClick={() => onOpen(item.id)}>
        <span className="files-overview-name"><code>{item.fileName}</code> {item.name}{item.copies > 1 ? <em> · run {item.copies}×</em> : null}</span>
        {item.file ? <>
          <span className="files-overview-strip" aria-hidden="true">{item.file.sections.map((section, index) => <i key={index} className={`band-${section.kind}`} style={{ flexGrow: Math.max(1, section.passes.to - section.passes.from + 1) }} title={section.label} />)}</span>
          <span className="files-overview-facts">{item.file.passCount.toLocaleString()} passes · {item.file.sections.filter((section) => section.kind !== 'carriers-out').map((section) => section.label.replace(/:.*/, '')).filter((label, index, all) => all.indexOf(label) === index).join(' → ')}</span>
        </> : <span className="files-overview-facts">{item.waiting}</span>}
      </button>
    </li>)}</ol>
  </div>;
}
