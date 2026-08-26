/**
 * Session 1 is the engine only — SPEC §9. This shell exists so the scaffold builds
 * and the tokens are verifiable. Screens arrive in Session 2.
 */
export default function App() {
  return (
    <main className="min-h-dvh bg-ink px-6 py-10">
      <h1 className="font-display text-2xl tracking-display text-text">Cadence</h1>
      <p className="mt-2 text-sm text-muted">Engine built. Screens land in session 2.</p>
    </main>
  );
}
