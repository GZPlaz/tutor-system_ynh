/**
 * Branding — control how the whole site looks. Edits show in the live preview
 * straight away; visitors see them after "Save changes".
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import { Button, ConfirmDialog, ErrorText, PageHeader, useAction, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { brandVars, CORNERS, FONTS, inkOn, loadFont, logoUrl, useBranding, type Branding } from '../../lib/branding';

const BRAND_SWATCHES = [
  { name: 'Navy', hex: '#1F3A5F' },
  { name: 'Oxford blue', hex: '#24406E' },
  { name: 'Teal', hex: '#1D5E5B' },
  { name: 'Forest', hex: '#2F5D3A' },
  { name: 'Burgundy', hex: '#7A2E3A' },
  { name: 'Graphite', hex: '#33383F' },
];
const ACCENT_SWATCHES = [
  { name: 'Ochre', hex: '#B7791F' },
  { name: 'Amber', hex: '#D9A21B' },
  { name: 'Terracotta', hex: '#C2603D' },
  { name: 'Sage', hex: '#5E8C61' },
  { name: 'Steel', hex: '#5B7FA6' },
];

type Editable = Omit<Branding, 'logo'>;
const editable = (b: Branding): Editable => {
  const { logo: _logo, ...rest } = b;
  return rest;
};
/** Highlights are edited raw (spaces, empty boxes) and cleaned up on save. */
const clean = (d: Editable): Editable => ({ ...d, highlights: d.highlights.map((h) => h.trim()).filter(Boolean) });

export function BrandingPage() {
  const { branding, refresh } = useBranding();
  const toast = useToast();
  const [draft, setDraft] = useState<Editable>(() => editable(branding));
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pick up the server copy when it (re)loads, unless the admin is mid-edit.
  const saved = useMemo(() => JSON.stringify(editable(branding)), [branding]);
  const dirty = JSON.stringify(clean(draft)) !== saved;
  useEffect(() => {
    if (!dirty) setDraft(editable(branding));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const [save, saving, saveError] = useAction(async () => {
    await api('/branding', { method: 'PUT', json: clean(draft) });
    await refresh();
    toast('Branding saved — everyone sees it now');
  });
  const [upload, uploading, uploadError] = useAction(async (file: File) => {
    const fd = new FormData();
    fd.set('logo', file);
    await api('/branding/logo', { method: 'POST', body: fd });
    await refresh();
    toast('Logo updated');
  });
  const [removeLogo, removingLogo] = useAction(async () => {
    await api('/branding/logo', { method: 'DELETE' });
    await refresh();
    toast('Logo removed');
  });

  const highlights = [...draft.highlights, '', '', ''].slice(0, 3);
  const logo = logoUrl(branding);

  return (
    <div className="page wide">
      <PageHeader
        title="Branding"
        description="Your name, logo, colours and welcome page. Changes appear in the preview straight away and go live when you save."
        action={
          <div className="button-row">
            <Button variant="ghost" onClick={() => setConfirmReset(true)}>Reset to defaults</Button>
            <Button busy={saving} disabled={!dirty} onClick={() => save()}>{dirty ? 'Save changes' : 'Saved'}</Button>
          </div>
        }
      />
      <ErrorText>{saveError}</ErrorText>

      <div className="branding-layout">
        <div className="branding-form">
          <fieldset className="panel">
            <legend className="panel-title">Name and logo</legend>
            <label className="field">
              <span>Site name</span>
              <input value={draft.siteName} maxLength={60} onChange={(e) => set('siteName', e.target.value)} />
              <small className="hint">Shown in the menu, the browser tab and every email.</small>
            </label>
            <div className="field">
              <span>Logo</span>
              <div className="logo-row">
                <div className="logo-box">{logo ? <img src={logo} alt="Current logo" /> : <span className="muted">No logo</span>}</div>
                <div className="button-row">
                  <Button variant="secondary" icon="upload" busy={uploading} onClick={() => fileRef.current?.click()}>{logo ? 'Replace' : 'Upload logo'}</Button>
                  {logo && <Button variant="ghost" busy={removingLogo} onClick={() => removeLogo()}>Remove</Button>}
                </div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
              </div>
              <small className="hint">PNG, JPEG or WebP up to 2 MB. A wide logo on a transparent background works best. It's also used as the browser tab icon.</small>
              <ErrorText>{uploadError}</ErrorText>
            </div>
          </fieldset>

          <fieldset className="panel">
            <legend className="panel-title">Welcome page</legend>
            <label className="field"><span>Headline</span><input value={draft.headline} maxLength={120} onChange={(e) => set('headline', e.target.value)} /></label>
            <label className="field"><span>Introduction</span><textarea rows={3} maxLength={400} value={draft.intro} onChange={(e) => set('intro', e.target.value)} /></label>
            <div className="field">
              <span>Reasons to join (up to three)</span>
              {highlights.map((h, i) => (
                <input key={i} value={h} maxLength={90} placeholder={`Reason ${i + 1}`} aria-label={`Reason ${i + 1}`}
                  onChange={(e) => { const next = [...highlights]; next[i] = e.target.value; set('highlights', next); }} />
              ))}
            </div>
            <label className="field">
              <span>Contact email (optional)</span>
              <input type="email" value={draft.supportEmail} onChange={(e) => set('supportEmail', e.target.value)} placeholder="hello@mindaccel.org" />
              <small className="hint">Shown to new students after they sign up.</small>
            </label>
            <label className="check"><input type="checkbox" checked={draft.pattern} onChange={(e) => set('pattern', e.target.checked)} /> Show the graph-paper pattern</label>
          </fieldset>

          <fieldset className="panel">
            <legend className="panel-title">Colours</legend>
            <ColorChoice label="Brand colour" hint="Buttons, links and the welcome panel." swatches={BRAND_SWATCHES} value={draft.primaryColor} onChange={(v) => set('primaryColor', v)} />
            <ColorChoice label="Attention colour" hint="Badges for things waiting on someone, like new requests." swatches={ACCENT_SWATCHES} value={draft.accentColor} onChange={(v) => set('accentColor', v)} />
          </fieldset>

          <fieldset className="panel">
            <legend className="panel-title">Style</legend>
            <div className="field">
              <span>Fonts</span>
              <div className="option-grid">
                {(Object.keys(FONTS) as Branding['font'][]).map((k) => (
                  <label key={k} className={`option-card ${draft.font === k ? 'selected' : ''}`}>
                    <input type="radio" name="font" checked={draft.font === k} onChange={() => set('font', k)} />
                    <span className="font-sample" style={{ fontFamily: FONTS[k].display }}>Aa</span>
                    <strong>{FONTS[k].label}</strong>
                    <small>{FONTS[k].description}</small>
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Corners</span>
              <div className="option-row">
                {(Object.keys(CORNERS) as Branding['corners'][]).map((k) => (
                  <label key={k} className={`option-chip ${draft.corners === k ? 'selected' : ''}`}>
                    <input type="radio" name="corners" checked={draft.corners === k} onChange={() => set('corners', k)} />
                    <span className="corner-sample" style={{ borderRadius: CORNERS[k].md }} /> {CORNERS[k].label}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Light or dark</span>
              <div className="option-row">
                {([['auto', "Match each visitor's device"], ['light', 'Always light'], ['dark', 'Always dark']] as const).map(([k, label]) => (
                  <label key={k} className={`option-chip ${draft.theme === k ? 'selected' : ''}`}>
                    <input type="radio" name="theme" checked={draft.theme === k} onChange={() => set('theme', k)} /> {label}
                  </label>
                ))}
              </div>
            </div>
          </fieldset>
        </div>

        <aside className="branding-preview" aria-label="Preview">
          <p className="preview-label">Preview</p>
          <Preview draft={draft} logo={logo} />
        </aside>
      </div>

      {confirmReset && (
        <ConfirmDialog title="Reset branding to the defaults?" confirmLabel="Reset" onClose={() => setConfirmReset(false)}
          onConfirm={async () => { await api('/branding/reset', { method: 'POST' }); await refresh(); setDraft(editable({ ...branding })); toast('Branding reset'); }}>
          <p>Name, welcome text, colours and style go back to the original MindAccel look. Your logo is kept.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function ColorChoice({ label, hint, swatches, value, onChange }: { label: string; hint: string; swatches: { name: string; hex: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="swatches">
        {swatches.map((s) => (
          <button key={s.hex} type="button" className={`swatch ${value.toLowerCase() === s.hex.toLowerCase() ? 'selected' : ''}`} style={{ background: s.hex, color: inkOn(s.hex) }} title={s.name} aria-label={s.name} aria-pressed={value.toLowerCase() === s.hex.toLowerCase()} onClick={() => onChange(s.hex)}>
            {value.toLowerCase() === s.hex.toLowerCase() && <Icon name="check" size={16} />}
          </button>
        ))}
        <label className="custom-color">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`Custom ${label.toLowerCase()}`} />
          <span>Custom</span>
          <code>{value.toUpperCase()}</code>
        </label>
      </div>
      <small className="hint">{hint}</small>
    </div>
  );
}

/** A miniature welcome page + a session card, styled with the draft only. */
function Preview({ draft, logo }: { draft: Editable; logo: string | null }) {
  const dark = draft.theme === 'dark';
  const vars = brandVars(draft, dark) as CSSProperties;
  useEffect(() => loadFont(draft.font), [draft.font]);
  return (
    <div className="preview" data-theme={dark ? 'dark' : 'light'} style={vars}>
      <div className={`preview-panel ${draft.pattern ? 'pattern' : ''}`}>
        <span className="brand">
          {logo ? <img src={logo} alt="" className="brand-logo" /> : <span className="brand-mark">{draft.siteName.slice(0, 1)}</span>}
          <span className="brand-name">{draft.siteName || 'Your site'}</span>
        </span>
        <p className="preview-headline">{draft.headline || 'Your headline'}</p>
        {clean(draft).highlights.map((h, i) => <p key={i} className="preview-highlight"><Icon name="check" size={14} /> {h}</p>)}
      </div>
      <div className="preview-body">
        <div className="preview-card">
          <div className="session-top">
            <strong className="preview-title">SAT Math</strong>
            <span className="pill attention">Needs your OK</span>
          </div>
          <p className="preview-muted">Thursday, 4:00 – 5:00 PM with Ana Ruiz</p>
          <div className="button-row">
            <span className="btn primary">Confirm</span>
            <span className="btn secondary">Decline</span>
          </div>
        </div>
      </div>
    </div>
  );
}
