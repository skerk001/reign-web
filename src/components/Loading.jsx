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
