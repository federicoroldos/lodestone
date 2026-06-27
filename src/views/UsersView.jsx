import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useT } from '@/context/I18nContext';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus } from 'lucide-react';

function UserModal({ open, onOpenChange, user, onSaved }) {
  const api = useApi();
  const t = useT();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setForm({
        name: user?.name || '',
        email: user?.email || '',
        password: '',
      });
    }
  }, [open, user]);

  async function save() {
    const body = { name: form.name, email: form.email };
    if (form.password || !user) body.password = form.password;
    try {
      if (user?.id) await api(`/api/users/${user.id}`, { method: 'PUT', body });
      else await api('/api/users', { method: 'POST', body });
      onSaved(user ? t('users.updatedToast') : t('users.createdToast'));
      onOpenChange(false);
    } catch (e) { setError(e.message); }
  }

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{user ? t('users.editTitle') : t('users.addTitle')}</DialogTitle></DialogHeader>
        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label>{t('users.fieldName')}</Label>
            <Input value={form.name} onChange={f('name')} placeholder={t('users.namePlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('users.fieldEmail')}</Label>
            <Input type="email" value={form.email} onChange={f('email')} placeholder={t('users.emailPlaceholder')} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label>{user ? t('users.fieldPasswordEdit') : t('users.fieldPasswordNew')}</Label>
            <Input type="password" value={form.password} onChange={f('password')} placeholder={t('users.passwordPlaceholder')} autoComplete="new-password" />
          </div>
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

export function UsersView() {
  const api = useApi();
  const t = useT();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  async function load() {
    try {
      const { users: list } = await api('/api/users');
      setUsers(list);
    } catch (e) { toast.error(e.message); }
  }

  useEffect(() => { load(); }, []);

  async function deleteUser(id) {
    try {
      await api(`/api/users/${id}`, { method: 'DELETE' });
      toast.success(t('users.deletedToast'));
      load();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('users.title')}</CardTitle>
          <Button variant="default" size="sm" onClick={() => { setEditUser(null); setModalOpen(true); }}>
            <Plus className="h-3.5 w-3.5" />
            {t('users.addUser')}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">{t('users.hint')}</p>
          {users.length === 0 ? (
            <EmptyState message={t('users.empty')} />
          ) : (
            <div className="space-y-1.5">
              {users.map(u => {
                const isSelf = currentUser && u.id === currentUser.id;
                return (
                  <div key={u.id} className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2.5 hover:bg-secondary/40 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{u.email}</span>
                        {isSelf && <span className="rounded px-1 py-0.5 text-[9px] font-bold uppercase bg-primary/15 text-primary border border-primary/25">{t('users.youBadge')}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.name || t('common.dashPlaceholder')}</div>
                    </div>
                    <Button variant="glass" size="xs" onClick={() => { setEditUser(u); setModalOpen(true); }}>
                      <Pencil className="h-3 w-3" />{t('common.edit')}
                    </Button>
                    <Button variant="ghost" size="icon-xs"
                      disabled={isSelf}
                      onClick={() => setPendingDelete(u)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <UserModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        user={editUser}
        onSaved={(msg) => { toast.success(msg); load(); }}
      />
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={t('users.deleteTitle')}
        description={pendingDelete ? t('users.deleteBody', { email: pendingDelete.email, cannotUndo: t('common.cannotUndo') }) : ''}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => { deleteUser(pendingDelete.id); setPendingDelete(null); }}
      />
    </>
  );
}
