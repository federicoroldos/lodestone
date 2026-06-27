import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { SpinningCube } from '@/components/shared/SpinningCube';

export function LoginView({ onLogin }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: pass }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Login failed');
      onLogin(data.token, data.user || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'url(/resources/stone_tile.jpg)',
          backgroundRepeat: 'repeat',
          backgroundSize: '120px',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(ellipse at top, hsl(156 46% 58% / 0.05), transparent 60%)',
        }}
      />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-card shadow-xl px-8 pt-10 pb-8 flex flex-col gap-1"
      >
        <div className="mx-auto mb-4 mt-1 flex items-center justify-center">
          <SpinningCube size={88} duration={14} />
        </div>
        <h1 className="text-center text-xl font-semibold tracking-tight text-foreground">Lodestone</h1>
        <p className="text-center text-xs text-muted-foreground/70 mb-8">Minecraft server panel</p>

        <div className="flex flex-col gap-3">
          <Input
            type="email"
            placeholder="Email"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            required
          />
          {error && (
            <Alert variant="error">
              {error}
            </Alert>
          )}
          <Button
            type="submit"
            variant="default"
            size="default"
            className="w-full mt-1"
            disabled={loading}
          >
            {loading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Signing in…</>
              : 'Log in'}
          </Button>
        </div>
        <p className="text-center text-[11px] text-muted-foreground/50 mt-6">Self-hosted panel · no telemetry</p>
      </form>
    </div>
  );
}
