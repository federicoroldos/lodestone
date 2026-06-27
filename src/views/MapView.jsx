import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/EmptyState';
import { MapConfigDialog } from '@/components/shared/MapConfigDialog';
import { useServer } from '@/context/ServerContext';
import { useT } from '@/context/I18nContext';
import { ExternalLink, Map as MapIcon, Settings } from 'lucide-react';

export function MapView() {
  const { mapUrl, activeServer } = useServer();
  const t = useT();
  const [configOpen, setConfigOpen] = useState(false);

  const configured = Boolean(mapUrl);

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{t('mapView.title')}</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="glass"
              size="xs"
              onClick={() => setConfigOpen(true)}
            >
              <Settings className="h-3 w-3" />
              {t('mapView.settings')}
            </Button>
            <Button
              variant="glass"
              size="xs"
              disabled={!configured}
              onClick={() => configured && window.open(mapUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="h-3 w-3" />
              {t('mapView.openInNewTab')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {configured ? (
            <iframe
              key={mapUrl}
              src={mapUrl}
              referrerPolicy="no-referrer"
              title={t('mapView.title')}
              className="block w-full border-0 bg-background"
              style={{ height: '74vh' }}
            />
          ) : (
            <div style={{ height: '74vh' }} className="flex flex-col items-center justify-center gap-4 bg-background/40">
              <EmptyState
                icon={MapIcon}
                title={t('mapView.notConfiguredTitle')}
                message={t('mapView.notConfiguredBody')}
                className="max-w-sm"
              />
              <Button variant="default" size="sm" onClick={() => setConfigOpen(true)}>
                <Settings className="h-3.5 w-3.5" />
                {t('mapView.configure')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <MapConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        server={activeServer}
      />
    </>
  );
}
