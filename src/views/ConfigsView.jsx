import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { useT } from '@/context/I18nContext';
import { useServer } from '@/context/ServerContext';
import { ConfigForm } from '@/components/configs/ConfigForm';
import { ConfigRaw } from '@/components/configs/ConfigRaw';
import { FileNav } from '@/components/configs/FileNav';
import { ValidationPanel } from '@/components/configs/ValidationPanel';
import { RestartBanner } from '@/components/configs/RestartBanner';
import { HistoryDropdown } from '@/components/configs/HistoryDropdown';
import { DiffPreview } from '@/components/configs/DiffPreview';
import { FILE_GROUPS, groupFile } from '@/configs/groups';
import { hasFriendlyForm, parseProperties } from '@/lib/configFile';
import { SERVER_PROPERTIES_SCHEMA } from '@/configs/schema';
import { toast } from 'sonner';
import { Repeat } from 'lucide-react';

const MODE_KEY = (base) => `lodestone.configs.mode.${base}`;

function readMode(base) {
  try {
    const v = localStorage.getItem(MODE_KEY(base));
    if (v === 'raw' || v === 'friendly') return v;
  } catch (_) { /* noop */ }
  return null;
}

function writeMode(base, mode) {
  try { localStorage.setItem(MODE_KEY(base), mode); } catch (_) { /* noop */ }
}

function pickInitial(files) {
  if (!files.length) return '';
  const gameplay = FILE_GROUPS.find((g) => g.id === 'gameplay');
  if (gameplay) {
    const first = files.find((f) => gameplay.files.map((s) => s.toLowerCase()).includes(f.toLowerCase()));
    if (first) return first;
  }
  return files[0];
}

export function ConfigsView() {
  const api = useApi();
  const t = useT();
  const { activeServerId } = useServer();
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState('');
  const [original, setOriginal] = useState('');
  const [current, setCurrent] = useState('');
  const [issues, setIssues] = useState([]);
  const [diffOpen, setDiffOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingRestart, setPendingRestart] = useState({});
  const [historyKey, setHistoryKey] = useState(0);
  const modesRef = useRef({});

  const loadList = useCallback(async () => {
    try {
      const { files: list } = await api('/api/configs');
      setFiles(list);
      const next = pickInitial(list);
      setSelected((cur) => (cur && list.includes(cur)) ? cur : next);
    } catch (e) { toast.error(e.message); }
  }, [api]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadList(); }, [activeServerId, loadList]);

  const loadFile = useCallback(async (name) => {
    if (!name) return;
    try {
      const { content: c } = await api(`/api/configs/${encodeURIComponent(name)}`);
      setOriginal(c);
      setCurrent(c);
      setIssues([]);
    } catch (e) { toast.error(e.message); }
  }, [api]);

  useEffect(() => { loadFile(selected); }, [selected, loadFile]);

  const base = selected;
  const canFriendly = hasFriendlyForm(base);
  const mode = (canFriendly && (readMode(base) || 'friendly')) || 'raw';
  const isFriendly = canFriendly && mode === 'friendly';

  const setMode = (m) => {
    if (!canFriendly) return;
    writeMode(base, m);
    setCurrent(original);
    modesRef.current = { ...modesRef.current, [base]: m };
    setIssues([]);
  };

  const onChange = (next) => setCurrent(next);
  const onValidation = (next) => setIssues(next);

  const showBanner = !!pendingRestart[base];

  async function doSave() {
    setSaving(true);
    try {
      await api(`/api/configs/${encodeURIComponent(base)}`, { method: 'PUT', body: { content: current } });
      setOriginal(current);
      setPendingRestart((p) => ({ ...p, [base]: true }));
      setHistoryKey((k) => k + 1);
      toast.success(t('configs.savedToast'));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const noChanges = current === original;
  const hasErrors = issues.some((i) => i.severity === 'error');
  const saveDisabled = noChanges || hasErrors || !selected;

  // Destructive-change warnings for the save summary. Any schema entry
  // with a `warning` i18n key contributes a line when its value actually
  // differs between the file on disk and the form, so the user is
  // reminded before e.g. changing the world type (which regenerates the
  // world on next start).
  const diffWarnings = useMemo(() => {
    if (noChanges) return [];
    const a = parseProperties(original || '');
    const b = parseProperties(current || '');
    const out = [];
    for (const s of SERVER_PROPERTIES_SCHEMA) {
      if (!s.warning) continue;
      if ((a.values[s.key] ?? '') !== (b.values[s.key] ?? '')) {
        const w = t(s.warning);
        if (w && w !== s.warning) out.push(w);
      }
    }
    return out;
  }, [original, current, noChanges, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('configs.title')}</CardTitle>
        <div className="flex items-center gap-2">
          {canFriendly && (
            <Button
              variant="glass"
              size="sm"
              onClick={() => setMode(isFriendly ? 'raw' : 'friendly')}
            >
              <Repeat className="h-3.5 w-3.5" />
              {isFriendly ? t('configs.switchToRaw') : t('configs.switchToFriendly')}
            </Button>
          )}
          <HistoryDropdown
            file={selected}
            refreshKey={historyKey}
            onRestored={(content) => {
              setOriginal(content);
              setCurrent(content);
              setHistoryKey((k) => k + 1);
              setPendingRestart((p) => ({ ...p, [base]: true }));
            }}
          />
        </div>
      </CardHeader>
      <CardContent>
        {showBanner && (
          <RestartBanner
            file={base}
            onDismiss={() => setPendingRestart((p) => { const n = { ...p }; delete n[base]; return n; })}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
          <FileNav
            files={files}
            selected={selected}
            onSelect={(f) => { setSelected(f); setCurrent(''); setIssues([]); }}
          />
          <div className="min-w-0">
            {isFriendly ? (
              <ConfigForm file={base} original={original} current={current} onChange={onChange} onValidation={onValidation} />
            ) : (
              <ConfigRaw value={current} onChange={onChange} filename={base} onValidation={onValidation} />
            )}

            <ValidationPanel issues={issues} />

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="default" size="sm" onClick={() => setDiffOpen(true)} disabled={saveDisabled}>
                {saving ? t('common.loading') : t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>

      <DiffPreview
        open={diffOpen}
        onOpenChange={setDiffOpen}
        before={original}
        after={current}
        filename={base}
        warnings={diffWarnings}
        onConfirm={async () => { setDiffOpen(false); await doSave(); }}
      />
    </Card>
  );
}
