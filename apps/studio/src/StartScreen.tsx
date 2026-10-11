import { useRef, type ChangeEvent } from 'react';
import { FileCode2, FolderOpen } from 'lucide-react';
import type { ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { openStudioProjectFile } from './chart/projectFile';
import { SilhouetteIcon } from './sweater/SilhouetteIcon';
import './start.css';

/**
 * The first thing a new visitor sees: what they can make, in their words.
 * Each choice opens the matching new-project form; a project file or a
 * machine file opens directly.
 */

function BeanieIcon() {
  return <svg viewBox="0 0 64 60" width="64" height="60" aria-hidden="true">
    <path d="M14 40 Q14 10 32 10 Q50 10 50 40 Z" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.6" />
    <rect x="11" y="38" width="42" height="12" rx="2" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.6" />
    {[16, 21, 26, 31, 36, 41, 46].map((x) => <path key={x} d={`M${x} 39v10`} stroke="currentColor" strokeWidth="1" opacity="0.6" />)}
  </svg>;
}

function ScarfIcon() {
  return <svg viewBox="0 0 64 60" width="64" height="60" aria-hidden="true">
    <rect x="20" y="6" width="24" height="48" rx="2" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.6" />
    {[16, 26, 36, 46].map((y) => <path key={y} d={`M20 ${y}h24`} stroke="currentColor" strokeWidth="3" opacity="0.35" />)}
    {[23, 28, 33, 38, 43].map((x) => <path key={x} d={`M${x - 1} 54v4`} stroke="currentColor" strokeWidth="1.4" />)}
  </svg>;
}

export function StartScreen({ onNew, onOpenProject, onOpenMachineFile, onBlank }: {
  onNew: (kind: 'sweater' | 'beanie' | 'rectangle') => void;
  onOpenProject: (project: ColorworkProjectV1) => void;
  onOpenMachineFile: () => void;
  onBlank: () => void;
}) {
  const projectInput = useRef<HTMLInputElement>(null);
  const openProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onOpenProject((await openStudioProjectFile(file)).project);
  };
  return <section className="start-screen" aria-labelledby="start-title">
    <div className="start-inner">
      <h1 id="start-title">What would you like to make?</h1>
      <p>Design it here and Studio turns it into checked programs for the Kniterate, with the pattern and how to put it together.</p>
      <div className="start-cards">
        <button type="button" onClick={() => onNew('sweater')}>
          <SilhouetteIcon silhouette="set-in" neckline="crew" />
          <b>Sweater</b>
          <small>Knitted flat in pieces and sewn. Drop shoulder, J-sleeve or set-in; any stitch; rib edges. Shape every piece yourself.</small>
        </button>
        <button type="button" onClick={() => onNew('beanie')}>
          <BeanieIcon />
          <b>Beanie</b>
          <small>Sized to a head, with a rib cuff and a colorwork body or a logo.</small>
        </button>
        <button type="button" onClick={() => onNew('rectangle')}>
          <ScarfIcon />
          <b>Scarf or blanket</b>
          <small>One colour in any stitch, or a colour chart painted stitch by stitch.</small>
        </button>
      </div>
      <div className="start-secondary">
        <button type="button" className="secondary-button" onClick={() => projectInput.current?.click()}><FolderOpen size={16} />Open a project file</button>
        <button type="button" className="secondary-button" onClick={onOpenMachineFile}><FileCode2 size={16} />Check a machine file (.kc or .k)</button>
        <button type="button" className="link-button" onClick={onBlank}>Start with a blank chart</button>
        <input ref={projectInput} className="file-input" type="file" accept="application/json,.json" aria-label="Project file" onChange={(event) => void openProject(event)} />
      </div>
      <p className="local-note">Everything stays on this device.</p>
    </div>
  </section>;
}
