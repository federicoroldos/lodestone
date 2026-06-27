import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useApi } from '@/hooks/useApi';
import { useServer } from '@/context/ServerContext';
import { useT } from '@/context/I18nContext';
import { toast } from 'sonner';
import { Play, Pencil, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const CRON_PRESETS = [
  { labelKey: 'tasks.presetHourly', cron: '0 * * * *' },
  { labelKey: 'tasks.presetDaily4am', cron: '0 4 * * *' },
  { labelKey: 'tasks.presetEvery6h', cron: '0 */6 * * *' },
  { labelKey: 'tasks.presetWeekly', cron: '0 3 * * 0' },
];

function TaskModal({ open, onOpenChange, task, servers, activeServerId, onSaved }) {
  const api = useApi();
  const t = useT();
  const [form, setForm] = useState({ name: '', serverId: '', type: 'restart', command: '', cron: '0 4 * * *', enabled: true });
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      if (task) {
        setForm({ name: task.name, serverId: task.serverId, type: task.type, command: task.command || '', cron: task.cron, enabled: task.enabled !== false });
      } else {
        setForm({ name: '', serverId: activeServerId || (servers[0]?.id || ''), type: 'restart', command: '', cron: '0 4 * * *', enabled: true });
      }
    }
  }, [open, task, activeServerId]);

  async function save() {
    try {
      if (task?.id) await api(`/api/tasks/${task.id}`, { method: 'PUT', body: form });
      else await api('/api/tasks', { method: 'POST', body: form });
      onSaved(task ? t('tasks.updatedToast') : t('tasks.createdToast'));
      onOpenChange(false);
    } catch (e) { setError(e.message); }
  }

  const f = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(p => ({ ...p, [k]: v }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{task ? t('tasks.editTitle') : t('tasks.newTitle')}</DialogTitle></DialogHeader>
        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label>{t('tasks.fieldName')}</Label>
            <Input value={form.name} onChange={f('name')} placeholder={t('tasks.namePlaceholder')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('tasks.fieldServer')}</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background/60 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                value={form.serverId} onChange={f('serverId')}>
                {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('tasks.fieldAction')}</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background/60 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                value={form.type} onChange={f('type')}>
                <option value="restart">{t('tasks.actionRestart')}</option>
                <option value="backup">{t('tasks.actionBackup')}</option>
                <option value="command">{t('tasks.actionCommand')}</option>
              </select>
            </div>
          </div>
          {form.type === 'command' && (
            <div className="space-y-1.5">
              <Label>{t('tasks.fieldCommand')}</Label>
              <Input value={form.command} onChange={f('command')} placeholder={t('tasks.commandPlaceholder')} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('tasks.fieldCron')}</Label>
            <Input value={form.cron} onChange={f('cron')} placeholder={t('tasks.cronPlaceholder')} />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {CRON_PRESETS.map(p => (
                <button key={p.cron} type="button"
                  onClick={() => setForm(f => ({ ...f, cron: p.cron }))}
                  className="rounded px-2 py-0.5 text-xs border border-border bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  {t(p.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.enabled} onChange={f('enabled')} className="accent-primary" />
            <span className="text-muted-foreground">{t('tasks.enabled')}</span>
          </label>
          {error && <p className="text-xs text-status-error">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button variant="default" onClick={save}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TasksView() {
  const api = useApi();
  const t = useT();
  const { servers, activeServerId } = useServer();
  const [tasks, setTasks] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  async function load() {
    try {
      const { tasks: list } = await api('/api/tasks');
      setTasks(list);
    } catch (e) { toast.error(e.message); }
  }

  useEffect(() => { load(); }, []);

  async function runTask(id) {
    try {
      await api(`/api/tasks/${id}/run`, { method: 'POST' });
      toast.success(t('tasks.ranToast'));
    } catch (e) { toast.error(e.message); }
  }

  async function deleteTask(id, name) {
    try {
      await api(`/api/tasks/${id}`, { method: 'DELETE' });
      toast.success(t('tasks.deletedToast'));
      load();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('tasks.title')}</CardTitle>
          <Button variant="default" size="sm" onClick={() => { setEditTask(null); setModalOpen(true); }}>
            <Plus className="h-3.5 w-3.5" />
            {t('tasks.newTask')}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">{t('tasks.hint')}</p>
          {tasks.length === 0 ? (
            <EmptyState message={t('tasks.empty')} />
          ) : (
            <div className="space-y-1.5">
              {tasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2.5 hover:bg-secondary/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{task.name}</span>
                      {!task.enabled && <span className="rounded px-1 py-0.5 text-[9px] font-bold uppercase bg-muted text-muted-foreground border border-border">{t('tasks.paused')}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {task.serverName} · {task.type === 'command' ? `${t('tasks.commandPrefix')}${task.command}` : task.type} ·{' '}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{task.cron}</code>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="glass" size="xs" onClick={() => runTask(task.id)}><Play className="h-3 w-3" />{t('tasks.run')}</Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => { setEditTask(task); setModalOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs"
                      onClick={() => setPendingDelete(task)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <TaskModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        task={editTask}
        servers={servers}
        activeServerId={activeServerId}
        onSaved={(msg) => { toast.success(msg); load(); }}
      />
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={t('tasks.deleteTitle')}
        description={pendingDelete ? t('tasks.deleteBody', { name: pendingDelete.name }) : ''}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => { deleteTask(pendingDelete.id, pendingDelete.name); setPendingDelete(null); }}
      />
    </>
  );
}
