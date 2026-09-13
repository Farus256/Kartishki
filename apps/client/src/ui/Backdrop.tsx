/** Muted studio colours complement both photographs and illustrated cards. */
export function Backdrop({ tone = 'paper' }: { tone?: 'paper' | 'noir' }) {
  return <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{ background: tone === 'noir'
    ? 'radial-gradient(ellipse at 50% 20%, #4c5b50, #19241f 80%)'
    : 'radial-gradient(ellipse at 65% 20%, #f1ece1, #c5c8ba 90%)' }} />;
}
