/**
 * Settings Controls for Drosophila Neural Chess.
 */

import { useGame } from '../store';
import { Heading } from './kit';

export function SettingsControls() {
  const settings = useGame((s) => s.settings);
  const updateSettings = useGame((s) => s.updateSettings);

  return (
    <div className="space-y-4">
      <Heading hint="Applied immediately.">Display & Audio</Heading>

      <Row label="Graphics quality" hint="Lower turns off shadows and antialiasing.">
        <Choice
          options={[
            { v: 'LOW', l: 'Low' },
            { v: 'MEDIUM', l: 'Medium' },
            { v: 'HIGH', l: 'High' },
          ]}
          value={settings.quality}
          onChange={(quality) => updateSettings({ quality })}
        />
      </Row>

      <Row label="Environment" hint="Sun daylight or floodlit night.">
        <Choice
          options={[
            { v: 'SUN', l: 'Sun' },
            { v: 'NIGHT', l: 'Night' },
          ]}
          value={settings.environment}
          onChange={(environment) => updateSettings({ environment })}
        />
      </Row>

      <Row label="Neural Visuals" hint="Pulses and emission in stadium core.">
        <Toggle
          on={settings.neuralVisuals}
          onChange={(neuralVisuals) => updateSettings({ neuralVisuals })}
        />
      </Row>

      <Row label="Camera Follow" hint="Smoothly follow fly when carrying pieces.">
        <Toggle
          on={settings.cameraFollow}
          onChange={(cameraFollow) => updateSettings({ cameraFollow })}
        />
      </Row>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
      <div>
        <div className="text-xs font-semibold text-slate-200">{label}</div>
        {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { v: T; l: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
      {options.map((opt) => (
        <button
          key={opt.v}
          onClick={() => onChange(opt.v)}
          className={`px-2.5 py-1 text-xs rounded font-medium transition-all ${
            value === opt.v
              ? 'bg-sky-500/20 text-sky-300 font-semibold shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          {opt.l}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
        on ? 'bg-sky-500' : 'bg-slate-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          on ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
