import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';
import { Loader2, User, Lock, ArrowRight } from 'lucide-react';
import { SpinningCube } from '@/components/shared/SpinningCube';
import { useT } from '@/context/I18nContext';

const CUBE_ANIM_MS = 900;

// Best-effort public IP fetch. Used to make geolocation work even when the
// panel is running on localhost (where req.ip is always 127.0.0.1).
async function fetchPublicIp(timeoutMs = 3000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d.ip === 'string' ? d.ip : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function startCubeFly(cubeEl, formEl) {
  // FLIP the card cube to the background cube's spot (viewport centre, sized
  // to match the background cube in AppShell). The form fades out at the same
  // time so the cube appears to "leave" the card.
  //
  // The flying copy is a *clone* lifted into a fixed overlay on <body> so it
  // escapes the card's opacity fade — animating the in-card original would
  // just inherit the card's `opacity: 0` and never be seen in flight.
  const rect = cubeEl.getBoundingClientRect();
  const size = rect.width || 88;
  const target = Math.min(window.innerWidth, window.innerHeight) * 0.6;
  const scale = target / size;
  const cx = rect.left + size / 2;
  const cy = rect.top + size / 2;
  const dx = window.innerWidth / 2 - cx;
  const dy = window.innerHeight / 2 - cy;

  const clone = cubeEl.cloneNode(true);
  Object.assign(clone.style, {
    position: 'absolute',
    inset: '0',
    margin: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });
  clone.style.setProperty('--cube-dx', `${dx}px`);
  clone.style.setProperty('--cube-dy', `${dy}px`);
  clone.style.setProperty('--cube-scale', String(scale));

  const holder = document.createElement('div');
  holder.className = 'cube-login-host';
  Object.assign(holder.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: '60',
    pointerEvents: 'none',
  });
  holder.appendChild(clone);
  document.body.appendChild(holder);

  clone.classList.add('cube-login-anim');
  // Force a reflow so the browser commits the initial (identity) transform
  // *with* the transition attached, before we add the play class. Without
  // this the two class additions collapse into a single paint and the
  // transition never runs — the cube would just snap to the end state.
  void clone.offsetWidth;
  clone.classList.add('cube-login-anim--play');

  if (formEl) {
    formEl.classList.remove('view-enter');
    formEl.classList.add('login-card-leaving');
  }

  // Let the caller tear down the overlay once login hands off.
  return () => holder.remove();
}

export function LoginView({ onLogin }) {
  const t = useT();
  const [identifier, setIdentifier] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const cubeRef = useRef(null);
  const formRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    document.querySelectorAll('.cube-login-host').forEach(el => el.remove());
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    const id = identifier.trim();
    // Send as the right field based on whether it looks like an email,
    // so the server can give better feedback. Either works at lookup.
    const loginField = id.includes('@') ? { email: id } : { username: id };

    let data;
    try {
      const clientIp = await fetchPublicIp();
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...loginField,
          password: pass,
          ...(clientIp ? { clientIp } : {}),
        }),
      });
      data = await r.json();
      if (!r.ok) throw new Error(data.error || t('errors.loginFailed'));
    } catch (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    // Login OK — kick off the cube fly + form fade, then hand off.
    const el = cubeRef.current;
    const cleanupFly = el ? startCubeFly(el, formRef.current) : null;

    timerRef.current = setTimeout(() => {
      if (cleanupFly) cleanupFly();
      onLogin(data.token, data.user || null);
    }, el ? CUBE_ANIM_MS + 60 : 0);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background overflow-hidden grayscale">
      {/* Stone-tile texture (kept) */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'url(/resources/stone_tile.jpg)',
          backgroundRepeat: 'repeat',
          backgroundSize: '120px',
        }}
      />
      {/* Radial accent gradient (kept, neutral) */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at top, hsl(0 0% 100% / 0.04), transparent 60%)',
        }}
      />

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="login-card view-enter relative z-10 w-full max-w-[400px] rounded-2xl bg-card/85 px-8 pt-9 pb-7 shadow-2xl backdrop-blur-md"
      >
        {/* Spinning cube — FLIPs to the background cube's spot on successful login */}
        <div
          ref={cubeRef}
          className="mx-auto mb-12 mt-2 flex items-center justify-center"
        >
          <SpinningCube size={88} duration={14} className="relative" />
        </div>

        {/* Heading */}
        <div className="mb-7 text-center">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/85">
            {t('brand.name')}
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            {t('login.heading')}
          </h1>
          <p className="mt-1.5 text-xs text-muted-foreground/70">
            {t('login.subheading')}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Field label={t('login.identifierLabel')} required>
            <div className="relative">
              <User className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/55" />
              <Input
                type="text"
                placeholder={t('login.identifierPlaceholder')}
                autoComplete="username"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required
                className="pl-8"
              />
            </div>
          </Field>

          <Field label={t('login.passwordLabel')} required>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/55" />
              <Input
                type="password"
                placeholder={t('login.passwordPlaceholder')}
                autoComplete="current-password"
                value={pass}
                onChange={e => setPass(e.target.value)}
                required
                className="pl-8"
              />
            </div>
          </Field>

          {error && <Alert variant="error">{error}</Alert>}

          <Button
            type="submit"
            variant="default"
            size="default"
            className="shimmer-btn mt-1 h-10 w-full font-semibold tracking-wide"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('login.submitting')}
              </>
            ) : (
              <>
                {t('login.submit')}
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
