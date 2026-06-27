import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useApi } from '@/hooks/useApi';
import { useT } from '@/context/I18nContext';
import { toast } from 'sonner';
import { fmtBytesRaw, joinRel } from '@/lib/utils';
import { Folder, FileText, ChevronUp, Upload, FolderPlus, RefreshCw, Pencil, PencilLine, Trash2, Download } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

export function FileManagerView() {
  const api = useApi();
  const t = useT();
  const { token } = useAuth();
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState([]);
  const [editFile, setEditFile] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  async function load(rel) {
    const p = rel ?? path;
    try {
      const data = await api(`/api/files?path=${encodeURIComponent(p)}`);
      setPath(data.path || '');
      setEntries(data.entries || []);
    } catch (e) { toast.error(e.message); }
  }

  useEffect(() => { load(''); }, []);

  async function goUp() {
    const i = path.lastIndexOf('/');
    await load(i === -1 ? '' : path.slice(0, i));
  }

  async function fileAction(act, e) {
    const rel = joinRel(path, e.name);
    if (act === 'edit') {
      try {
        const { content } = await api(`/api/files/read?path=${encodeURIComponent(rel)}`);
        setEditFile({ rel, name: e.name });
        setEditContent(content);
      } catch (err) { toast.error(err.message); }
      return;
    }
    if (act === 'rename') {
      const nn = prompt(t('files.renamePrompt'), e.name);
      if (!nn || nn === e.name) return;
      api('/api/files/rename', { method: 'POST', body: { path: rel, name: nn } })
        .then(() => load()).catch(err => toast.error(err.message));
      return;
    }
    if (act === 'delete') {
      setPendingDelete({ rel, name: e.name, isDir: e.dir });
      return;
    }
  }

  async function mkdir() {
    const name = prompt(t('files.newFolderPrompt'));
    if (!name) return;
    api('/api/files/mkdir', { method: 'POST', body: { path, name } })
      .then(() => load()).catch(err => toast.error(err.message));
  }

  async function upload(e) {
    if (!e.target.files.length) return;
    const fd = new FormData();
    for (const f of e.target.files) fd.append('files', f);
    try {
      await api(`/api/files/upload?path=${encodeURIComponent(path)}`, { method: 'POST', body: fd });
      toast.success(t('files.uploadedToast'));
      load();
    } catch (err) { toast.error(err.message); }
    e.target.value = '';
  }

  async function saveEdit() {
    try {
      await api('/api/files/write', { method: 'PUT', body: { path: editFile.rel, content: editContent } });
      setEditFile(null);
      toast.success(t('files.savedToast'));
    } catch (e) { toast.error(e.message); }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('files.title')}</CardTitle>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium border border-border bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 transition-colors">
              <Upload className="h-3 w-3" />
              {t('files.upload')}
              <input type="file" multiple hidden onChange={upload} />
            </label>
            <Button variant="glass" size="sm" onClick={mkdir}><FolderPlus className="h-3.5 w-3.5" /> {t('files.folder')}</Button>
            <Button variant="glass" size="xs" onClick={() => load()}><RefreshCw className="h-3 w-3" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-4">
            <Button variant="glass" size="xs" onClick={goUp} disabled={!path}>
              <ChevronUp className="h-3 w-3" /> {t('files.up')}
            </Button>
            <span className="font-mono text-xs text-primary">/{path}</span>
          </div>

          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">{t('files.empty')}</p>
          ) : (
            <div className="space-y-1">
              {entries.map(e => {
                const rel = joinRel(path, e.name);
                return (
                  <div key={e.name} className={cn(
                    'flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2 hover:bg-secondary/40 transition-colors group',
                    e.dir && 'cursor-pointer'
                  )}
                    onClick={e.dir ? () => load(rel) : undefined}
                  >
                    {e.dir
                      ? <Folder className="h-4 w-4 shrink-0 text-primary" />
                      : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    }
                    <span
                      className={cn('flex-1 text-sm font-medium truncate', e.editable && !e.dir && 'cursor-pointer hover:text-primary')}
                      onClick={e.editable && !e.dir ? () => fileAction('edit', e) : undefined}
                    >
                      {e.name}
                    </span>
                    {!e.dir && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {fmtBytesRaw(e.size)} · {new Date(e.mtime).toLocaleDateString()}
                      </span>
                    )}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {e.editable && !e.dir && (
                        <Button variant="ghost" size="icon-xs" onClick={ev => { ev.stopPropagation(); fileAction('edit', e); }} title={t('files.edit')}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                      {!e.dir && (
                        <Button variant="ghost" size="icon-xs" asChild onClick={ev => ev.stopPropagation()}>
                          <a href={`/api/files/download?path=${encodeURIComponent(rel)}&token=${encodeURIComponent(token)}`} download title={t('files.download')}>
                            <Download className="h-3 w-3" />
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon-xs" onClick={ev => { ev.stopPropagation(); fileAction('rename', e); }} title={t('files.rename')}>
                        <PencilLine className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon-xs"
                        onClick={ev => { ev.stopPropagation(); fileAction('delete', e); }} title={t('common.delete')}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* File editor dialog */}
      <Dialog open={!!editFile} onOpenChange={open => { if (!open) setEditFile(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{editFile?.name}</DialogTitle></DialogHeader>
          <div className="px-5 py-4">
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              spellCheck={false}
              className="w-full h-[50vh] rounded-md border border-input bg-console px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 resize-y"
            />
          </div>
          <DialogFooter>
            <Button variant="glass" onClick={() => setEditFile(null)}>{t('common.cancel')}</Button>
            <Button variant="default" onClick={saveEdit}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={t('files.deleteTitle')}
        description={pendingDelete
          ? (pendingDelete.isDir
              ? t('files.deleteFolderBody', { name: pendingDelete.name, andEverything: t('common.andEverything'), cannotUndo: t('common.cannotUndo') })
              : t('files.deleteFileBody', { name: pendingDelete.name }))
          : ''}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={async () => {
          try {
            await api(`/api/files?path=${encodeURIComponent(pendingDelete.rel)}`, { method: 'DELETE' });
            toast.success(t('files.deletedToast'));
            load();
          } catch (e) { toast.error(e.message); }
        }}
      />
    </>
  );
}
