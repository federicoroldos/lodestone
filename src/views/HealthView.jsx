import { useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { MetricsView } from './MetricsView';
import { useApi } from '@/hooks/useApi';
import { useServer } from '@/context/ServerContext';
import { useT } from '@/context/I18nContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const fmt = (value) => value ? new Date(value).toLocaleString() : '-';

// Translate a crash-rule field item; fall back to the stored English string if no key exists.
const ruleKey = (t, ruleId, field, i, fallback) => {
  const k = `health.rule.${ruleId}.${field}.${i}`;
  const v = t(k);
  return v === k ? fallback : v;
};

const categoryLabel = (t, category) => {
  const k = `health.rule.category.${category || 'unknown'}`;
  const v = t(k);
  return v === k ? (category || 'unknown') : v;
};

export function HealthView() {
  const t = useT();
  return <Tabs defaultValue="resources" className="space-y-5"><TabsList><TabsTrigger value="resources">{t('health.resources')}</TabsTrigger><TabsTrigger value="crashes">{t('health.crashes')}</TabsTrigger></TabsList><TabsContent value="resources"><MetricsView /></TabsContent><TabsContent value="crashes"><Crashes /></TabsContent></Tabs>;
}

function Crashes() {
  const api = useApi(); const t = useT(); const { activeServerId, servers } = useServer();
  const [items, setItems] = useState([]); const [detail, setDetail] = useState(null); const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const q = activeServerId ? `?serverId=${encodeURIComponent(activeServerId)}` : ''; setItems((await api(`/api/crashes${q}`)).items || []); } catch (e) { toast.error(e.message); } setLoading(false); };
  useEffect(() => { setDetail(null); load(); }, [activeServerId]);
  const open = async (id) => { try { setDetail(await api(`/api/crashes/${encodeURIComponent(id)}`)); } catch (e) { toast.error(e.message); } };
  const toggle = async () => { const g = detail.group; const action = g.acknowledgedAt ? 'unacknowledge' : 'acknowledge'; try { await api(`/api/crashes/groups/${g.id}/${action}`, { method: 'POST' }); await open(g.id); await load(); } catch (e) { toast.error(e.message); } };
  if (detail) return <CrashDetail data={detail} onBack={() => setDetail(null)} onToggle={toggle} t={t} />;
  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground">{t('common.loading')}</div>;
  if (!items.length) return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{t('health.noCrashes')}</CardContent></Card>;
  return <div className="space-y-3">{items.map((g) => <button type="button" key={g.id} onClick={() => open(g.id)} className="w-full rounded-lg border bg-card p-4 text-left hover:border-primary/50"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-status-warning"/><span className="font-medium">{categoryLabel(t, g.category)}</span><Badge variant="secondary">{t('health.occurrences', { count: g.count })}</Badge>{g.acknowledgedAt && <Badge variant="outline"><Check className="mr-1 h-3 w-3"/>{t('health.acknowledged')}</Badge>}</div><span className="text-xs text-muted-foreground">{fmt(g.lastSeenAt)}</span></div><div className="mt-2 text-xs text-muted-foreground">{servers.find((s) => s.id === g.serverId)?.name || g.serverId}</div></button>)}</div>;
}

function CrashDetail({ data, onBack, onToggle, t }) {
  const { group, incident, conclusions } = data;
  return <div className="space-y-5"><div className="flex items-center justify-between"><Button variant="ghost" onClick={onBack}><ChevronLeft className="h-4 w-4"/>{t('common.back')}</Button><Button variant="outline" onClick={onToggle}>{group.acknowledgedAt ? t('health.unacknowledge') : t('health.acknowledge')}</Button></div><Card><CardHeader><CardTitle>{t('health.evidence')}</CardTitle><p className="text-xs text-muted-foreground">{t('health.evidenceImmutable')}</p></CardHeader><CardContent className="space-y-4 text-sm"><div className="grid gap-2 sm:grid-cols-3"><span>{t('health.occurred')}: {fmt(incident.occurredAt)}</span><span>{t('health.exitCode')}: {incident.exitCode ?? '-'}</span><span>{t('health.signal')}: {incident.signal || '-'}</span></div>{incident.evidence.console?.length > 0 && <Evidence title={t('health.consoleTail')} text={incident.evidence.console.map((l) => l.text).join('\n')} />}{['latestLog', 'crashReport'].map((key) => incident.evidence[key]?.status === 'captured' ? <Evidence key={key} title={key === 'latestLog' ? t('health.latestLog') : t('health.crashReport')} text={incident.evidence[key].text}/> : <p key={key} className="text-xs text-muted-foreground">{key === 'latestLog' ? t('health.latestLog') : t('health.crashReport')}: {incident.evidence[key]?.reason || t('health.unavailable')}</p>)}</CardContent></Card><Card><CardHeader><CardTitle>{t('health.conclusions')}</CardTitle><p className="text-xs text-muted-foreground">{t('health.heuristicNotice')}</p></CardHeader><CardContent className="space-y-3">{!conclusions.length ? <p className="text-sm text-muted-foreground">{t('health.unknown')}</p> : conclusions.map((c) => <div key={c.id} className="rounded-lg border p-4"><div className="flex gap-2"><span className="font-medium">{categoryLabel(t, c.category)}</span><Badge variant="secondary">{t(`health.confidence.${c.confidence}`)}</Badge></div><ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{c.reasoning.map((x, i) => <li key={i}>{ruleKey(t, c.ruleId, 'reasoning', i, x)}</li>)}</ul><h4 className="mt-4 text-xs font-semibold uppercase text-muted-foreground">{t('health.suggestedChecks')}</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{c.suggestions.map((x, i) => <li key={i}>{ruleKey(t, c.ruleId, 'suggestions', i, x)}</li>)}</ul></div>)}</CardContent></Card></div>;
}
function Evidence({ title, text }) { return <div><h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</h4><pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{text}</pre></div>; }
