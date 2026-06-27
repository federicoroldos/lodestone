import { useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useServer } from '@/context/ServerContext';
import { ExternalLink } from 'lucide-react';

export function MapView() {
  const { mapUrl } = useServer();
  const wrapRef = useRef(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (!mapUrl) {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted-foreground);font-size:14px">Configure the map (BlueMap/Dynmap) first.</div>';
      return;
    }
    if (el.dataset.loaded === mapUrl) return;
    el.dataset.loaded = mapUrl;
    el.innerHTML = `<iframe src="${mapUrl}" referrerpolicy="no-referrer" style="width:100%;height:100%;border:none;"></iframe>`;
  }, [mapUrl]);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>World map</CardTitle>
        <Button variant="glass" size="xs" onClick={() => mapUrl && window.open(mapUrl, '_blank')}>
          <ExternalLink className="h-3 w-3" />
          Open in new tab
        </Button>
      </CardHeader>
      <div ref={wrapRef} style={{ height: '74vh' }} />
    </Card>
  );
}
