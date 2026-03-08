export function Placeholder({ title }) {
  return (
    <div style={{
      padding: '64px 24px',
      textAlign: 'center',
    }}>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontSize: '2rem',
        color: 'var(--text-primary)',
        marginBottom: '12px',
      }}>{title}</h2>
      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
        Coming soon — building this view next.
      </p>
    </div>
  );
}
