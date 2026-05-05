// SoundSage — Demo mode banner
//
// Renders a thin strip across the top of the app whenever the visitor
// is browsing under the synthesized demo session. Tells them the data
// is illustrative and gives them an easy path to either sign in for real
// or exit demo mode entirely.
//
// Server-rendered: the parent component (Masthead) decides whether to
// mount this based on the session.demo flag. No client state — visibility
// is controlled by mount/unmount, which keeps the banner from flashing
// on auth state changes.
//
// IMPORTANT — uses a plain <a> for the exit link rather than next/link.
// Next.js's <Link> automatically prefetches its destination when the
// component renders, which would silently fire /demo/exit and clear
// the demo cookie a few hundred ms after the page loaded. Plain
// anchors don't get prefetched, so the cookie survives until the
// user actually clicks the link.

export function DemoBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: 'var(--seal)',
        color: 'var(--paper)',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.04em',
        padding: '8px 16px',
        textAlign: 'center',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px 16px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <span>
        <span style={{ fontFamily: 'var(--font-mincho)', marginRight: 6 }}>
          見本
        </span>
        Demo mode — exploring sample data, no Spotify account connected.
      </span>
      <span style={{ display: 'inline-flex', gap: 14, alignItems: 'center' }}>
        {/* Sign-in path: clear the demo cookie first via /demo/exit, then
            land on the home page where the SignInPrompt + Google button
            are presented. Plain <a> instead of next/link — see file
            header for why. */}
        <a
          href="/demo/exit"
          style={{
            color: 'var(--paper)',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          Sign in to track your own
        </a>
      </span>
    </div>
  );
}
