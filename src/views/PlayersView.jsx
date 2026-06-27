import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/EmptyState';
import { useApi } from '@/hooks/useApi';
import { useServer } from '@/context/ServerContext';
import { toast } from 'sonner';
import { RefreshCw, X } from 'lucide-react';

function PlayerChip({ name, onAction }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <img
        src={`https://minotar.net/helm/${encodeURIComponent(name)}/22.png`}
        alt=""
        className="h-6 w-6 rounded"
        onError={e => { e.target.style.visibility = 'hidden'; }}
      />
      <span className="flex-1 text-sm font-medium text-foreground">{name}</span>
      <div className="flex items-center gap-1">
        <Button variant="glass" size="xs" onClick={() => onAction('op', name)}>OP</Button>
        <Button variant="glass" size="xs" onClick={() => onAction('kick', name)}>Kick</Button>
        <Button variant="destructive" size="xs" onClick={() => onAction('ban', name)}>Ban</Button>
      </div>
    </div>
  );
}

function PlayerList({ id, items, kind, onRemove }) {
  const EMPTY_MSG = { whitelist: 'Whitelist is empty.', op: 'No operators.', ban: 'No banned players.' };
  if (!items?.length) return <EmptyState message={EMPTY_MSG[kind] || 'Empty.'} />;
  return (
    <div className="max-h-72 overflow-y-auto space-y-1">
      {items.map((it, i) => {
        const name = typeof it === 'string' ? it : it.name;
        const reason = (it && typeof it === 'object' && it.reason) ? it.reason : '';
        return (
          <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 group">
            <img
              src={`https://minotar.net/helm/${encodeURIComponent(name)}/22.png`}
              alt=""
              className="h-5 w-5 rounded"
              onError={e => { e.target.style.visibility = 'hidden'; }}
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm text-foreground">{name}</span>
              {reason && <span className="block text-xs text-muted-foreground">{reason}</span>}
            </div>
            <button
              onClick={() => onRemove(kind, name)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-status-error transition-all text-sm"
              title={kind === 'ban' ? 'Pardon' : 'Remove'}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function AddPlayerForm({ kind, onAdd, placeholder, buttonLabel, buttonVariant = 'default' }) {
  const [name, setName] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(kind, name.trim()).then(() => setName(''));
  };
  return (
    <form onSubmit={submit} className="flex gap-2 mb-3">
      <Input value={name} onChange={e => setName(e.target.value)} placeholder={placeholder} className="flex-1 h-8 text-xs" />
      <Button type="submit" variant={buttonVariant} size="xs">{buttonLabel}</Button>
    </form>
  );
}

export function PlayersView() {
  const api = useApi();
  const { activeServerId, statuses } = useServer();
  const status = activeServerId ? (statuses[activeServerId] || {}) : {};
  const players = status.players || [];

  const [lists, setLists] = useState({ whitelist: [], ops: [], banned: [], whitelistEnabled: false });
  const [manualName, setManualName] = useState('');

  async function loadLists() {
    try {
      const d = await api('/api/playerlists');
      setLists(d);
    } catch (e) { toast.error(e.message); }
  }

  useEffect(() => { loadLists(); }, [activeServerId]);

  async function playerAction(action, name) {
    try {
      const r = await api(`/api/players/${action}`, { method: 'POST', body: { name } });
      if (r.error) toast.error(r.error);
      else toast.success(`${action} → ${name}`);
    } catch (e) { toast.error(e.message); }
  }

  async function plAction(kind, op, name) {
    try {
      const r = await api(`/api/playerlists/${kind}/${op}`, { method: 'POST', body: { name } });
      if (r?.error) { toast.error(r.error); return; }
      toast.success(r?.note || `${kind} ${op}: ${name}`);
      loadLists();
      setTimeout(loadLists, 1200);
    } catch (e) { toast.error(e.message); }
  }

  async function toggleWhitelist(e) {
    try {
      const r = await api('/api/whitelist/toggle', { method: 'POST', body: { enabled: e.target.checked } });
      toast.success(r?.note || `Whitelist ${e.target.checked ? 'enabled' : 'disabled'}`);
      loadLists();
    } catch (e) { toast.error(e.message); loadLists(); }
  }

  async function refreshList() {
    await api('/api/command', { method: 'POST', body: { cmd: 'list' } }).catch(() => {});
  }

  return (
    <div className="space-y-5">
      {/* Online players */}
      <Card>
        <CardHeader>
          <CardTitle>Online players</CardTitle>
          <Button variant="glass" size="xs" onClick={refreshList}>
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {players.length === 0 ? (
            <EmptyState message="No players online." />
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {players.map(name => (
                <PlayerChip key={name} name={name} onAction={playerAction} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual action */}
      <Card>
        <CardHeader><CardTitle>Manual player action</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={manualName}
              onChange={e => setManualName(e.target.value)}
              placeholder="Player name"
              className="w-40"
            />
            {['op', 'deop', 'kick'].map(a => (
              <Button key={a} variant="glass" size="sm" onClick={() => {
                if (!manualName.trim()) { toast.error('Enter a name'); return; }
                playerAction(a, manualName.trim());
              }}>{a.toUpperCase()}</Button>
            ))}
            <Button variant="destructive" size="sm" onClick={() => {
              if (!manualName.trim()) { toast.error('Enter a name'); return; }
              playerAction('ban', manualName.trim());
            }}>Ban</Button>
          </div>
        </CardContent>
      </Card>

      {/* Lists */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Whitelist</CardTitle>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={lists.whitelistEnabled} onChange={toggleWhitelist} className="accent-primary" />
              Enabled
            </label>
          </CardHeader>
          <CardContent>
            <AddPlayerForm kind="whitelist" onAdd={plAction} placeholder="Add player…" buttonLabel="Add" />
            <PlayerList kind="whitelist" items={lists.whitelist} onRemove={(kind, name) => plAction(kind, 'remove', name)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Operators</CardTitle></CardHeader>
          <CardContent>
            <AddPlayerForm kind="op" onAdd={plAction} placeholder="Add operator…" buttonLabel="Add" />
            <PlayerList kind="op" items={lists.ops} onRemove={(kind, name) => plAction(kind, 'remove', name)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Banned players</CardTitle></CardHeader>
          <CardContent>
            <AddPlayerForm kind="ban" onAdd={plAction} placeholder="Ban player…" buttonLabel="Ban" buttonVariant="destructive" />
            <PlayerList kind="ban" items={lists.banned} onRemove={(kind, name) => plAction(kind, 'remove', name)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
