import { useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useServer } from '@/context/ServerContext';
import { useT } from '@/context/I18nContext';
import { ExternalLink } from 'lucide-react';

export function MapView() {
  const { mapUrl } = useServer();
  const t = useT();
  const wrapRef = useRef(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (!mapUrl) {
      const msg = t('mapView.configureFirst').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted-foreground);font-size:14px">${msg}</div>`;
      return;
    }
    if (el.dataset.loaded === mapUrl) return;
    el.dataset.loaded = mapUrl;
    el.innerHTML = `<iframe src="${mapUrl}" referrerpolicy="no-referrer" style="width:100%;height:100%;border:none;"></iframe>`;
  }, [mapUrl, t]);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{t('mapView.title')}</CardTitle>
        <Button variant="glass" size="xs" onClick={() => mapUrl && window.open(mapUrl, '_blank')}>
          <ExternalLink className="h-3 w-3" />
          {t('mapView.openInNewTab')}
        </Button>
      </CardHeader>
      <div ref={wrapRef} style={{ height: '74vh' }} />
    </Card>
  );
}
