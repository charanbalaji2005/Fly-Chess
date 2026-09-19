/**
 * Settings, in the same drawer chrome as everything else.
 *
 * The existing `SettingsControls` already knows how to edit every setting,
 * so this is a container, not a rewrite -- with one addition: Developer Mode,
 * which is the switch that puts search telemetry and the state overlay back
 * on screen for the people who actually need them.
 */

import { useGame } from '../../store';
import { SettingsControls } from '../SettingsPanel';
import { Drawer, TONE, label } from './chrome';

export function SettingsDrawer() {
  const uiPanel = useGame((s) => s.uiPanel);
  const setUiPanel = useGame((s) => s.setUiPanel);
  const developer = useGame((s) => s.settings.debugOverlay);
  const updateSettings = useGame((s) => s.updateSettings);

  return (
    <Drawer
      open={uiPanel === 'SETTINGS'}
      title="Settings"
      onClose={() => setUiPanel('NONE')}
      width={286}
    >
      <SettingsControls />

      <div
        style={{
          marginTop: 14,
          paddingTop: 11,
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div className="flex items-center justify-between" style={{ gap: 10 }}>
          <div>
            <div style={{ ...label, fontSize: 9.5, color: TONE.dim }}>Developer mode</div>
            <div style={{ fontSize: 10, color: TONE.faint, marginTop: 2, lineHeight: 1.35 }}>
              Search depth, node counts, timings and raw state.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={developer}
            aria-label="Developer mode"
            onClick={() => updateSettings({ debugOverlay: !developer })}
            style={{
              width: 38,
              height: 21,
              flex: 'none',
              borderRadius: 11,
              border: '1px solid rgba(255,255,255,0.1)',
              background: developer ? 'rgba(94,203,245,0.3)' : 'rgba(255,255,255,0.05)',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 160ms ease',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: developer ? 19 : 2,
                width: 15,
                height: 15,
                borderRadius: '50%',
                background: developer ? TONE.accent : TONE.faint,
                transition: 'left 160ms ease, background 160ms ease',
              }}
            />
          </button>
        </div>
      </div>
    </Drawer>
  );
}
