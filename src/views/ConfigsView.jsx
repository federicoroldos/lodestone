import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { useT } from '@/context/I18nContext';
import { toast } from 'sonner';

export function ConfigsView() {
  const api = useApi();
  const t = useT();
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState('');
  const [content, setContent] = useState('');

  async function loadList() {
    try {
      const { files: f } = await api('/api/configs');
      setFiles(f);
      if (f.length) { setSelected(f[0]); loadFile(f[0]); }
    } catch (e) { toast.error(e.message); }
  }

  async function loadFile(name) {
    try {
      const { content: c } = await api(`/api/configs/${encodeURIComponent(name)}`);
      setContent(c);
    } catch (e) { toast.error(e.message); }
  }

  async function save() {
    try {
      await api(`/api/configs/${encodeURIComponent(selected)}`, { method: 'PUT', body: { content } });
      toast.success(t('configs.savedToast'));
    } catch (e) { toast.error(e.message); }
  }

  useEffect(() => { loadList(); }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('configs.title')}</CardTitle>
        <select
          className="h-8 rounded-md border border-input bg-background/60 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring/50"
          value={selected}
          onChange={e => { setSelected(e.target.value); loadFile(e.target.value); }}
        >
          {files.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">{(() => {
          const h = t('configs.hint');
          const tag = '.bak';
          const i = h.indexOf(tag);
          if (i < 0) return h;
          return <>{h.slice(0, i)}<code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{tag}</code>{h.slice(i + tag.length)}</>;
        })()}</p>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          spellCheck={false}
          className="w-full h-[52vh] rounded-md border border-input bg-console px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 resize-y"
        />
        <div className="flex items-center gap-3 mt-3">
          <Button variant="default" size="sm" onClick={save}>{t('common.save')}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
