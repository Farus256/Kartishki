/** Neutral portrait while a photograph is absent or loading. */
export function PortraitPlaceholder({ seed = '' }: { seed?: string }) {
  return <svg viewBox="0 0 256 256" className="h-full w-full" aria-hidden="true">
    <rect width="256" height="256" fill="#d5cfc3" />
    <circle cx="128" cy="94" r="43" fill="#8c918b" />
    <path d="M38 256v-28a90 90 0 0 1 180 0v28Z" fill="#6b746e" />
  </svg>;
}
