// Error state with retry — shown when a data fetch fails instead of an
// endless spinner or a silently empty page.
export function LoadError({ message = "Couldn't load data.", onRetry }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '50vh', gap: 14,
    }}>
      <p style={{ color: 'var(--ink-2)', fontSize: '0.95rem', fontWeight: 700 }}>{message}</p>
      <p style={{ color: 'var(--faint)', fontSize: '0.8rem' }}>Check your connection and try again.</p>
      {onRetry && (
        <button onClick={onRetry} style={{
          padding: '9px 22px', borderRadius: 8, border: '1px solid var(--line-2)',
          background: 'var(--surface-2)', color: 'var(--ink)', fontWeight: 800,
          fontFamily: 'var(--font-body)', fontSize: '0.85rem', cursor: 'pointer',
        }}>Retry</button>
      )}
    </div>
  );
}

export default function Loading({ message = 'Loading...' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '50vh', gap: 14,
    }}>
      <div style={{
        width: 32, height: 32,
        border: '3px solid var(--border)', borderTopColor: 'var(--reign-gold)',
        borderRadius: '50%', animation: 'spin 0.7s linear infinite',
      }} />
      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>{message}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
