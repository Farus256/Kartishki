export type BartenderMood = 'neutral' | 'greedy' | 'pleased' | 'frozen' | 'sad';

/** Uncle Cash. Same ink silhouette, the face changes with the mood. */
export function Bartender({ mood = 'neutral' }: { mood?: BartenderMood }) {
  return <svg viewBox="0 0 220 230" aria-hidden="true" className={`ab-dealer-art is-${mood}`} data-mood={mood}><g stroke="#1a1a1a" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
    <path d="M24 223L40 145 85 123 151 126 190 160 204 225Z" fill="#5a6450"/>
    <path d="M54 99L36 19 95 53 147 53 189 12 184 113 153 151 86 151Z" fill="#b89971"/>
    <path d="M47 35L55 72 78 61M173 34L150 62 175 68" fill="#d3b59a"/>
    {/* eyes */}
    {mood === 'pleased' && <g fill="none"><path d="M70 92q15-14 30 0M130 90q15-14 30 0"/></g>}
    {mood === 'frozen' && <g><path d="M68 84L101 89 80 100Z M127 88L165 75 147 98Z" fill="#dfe9ee"/><path d="M84 92h6M143 88h6"/></g>}
    {mood === 'sad' && <g><path d="M68 84L101 92 80 104Z M127 91L165 78 147 103Z" fill="#efece4"/><path d="M83 95L84 102M144 91L143 98" /><path d="M66 74l30 8M164 68l-30 10" fill="none"/></g>}
    {mood === 'greedy' && <g><path d="M66 78L103 89 78 104Z M125 88L167 71 149 102Z" fill="#f4e6a8"/><text x="76" y="99" fontFamily="PT Mono,monospace" fontWeight="bold" fontSize="17" fill="#1a1a1a" stroke="none">$</text><text x="140" y="95" fontFamily="PT Mono,monospace" fontWeight="bold" fontSize="17" fill="#1a1a1a" stroke="none">$</text></g>}
    {mood === 'neutral' && <g><path d="M68 80L101 89 80 102Z M127 88L165 73 147 100Z" fill="#efece4"/><path d="M81 87L82 97M144 83L143 94"/></g>}
    {/* nose */}
    <path d="M97 110L128 109 114 123Z" fill="#1a1a1a"/>
    {/* mouth */}
    {mood === 'pleased' && <path d="M92 124q22 22 52-4" fill="#3a1a1a"/>}
    {mood === 'greedy' && <path d="M96 126q18 16 48-6 l-4 12q-20 12-44-6z" fill="#3a1a1a"/>}
    {mood === 'frozen' && <path d="M100 128q6-6 12 0t12 0t12-2" fill="none"/>}
    {mood === 'sad' && <path d="M100 134q18-12 44-2" fill="none"/>}
    {mood === 'neutral' && <path d="M114 122L119 133 147 124" fill="none"/>}
    <path d="M57 110L22 104M63 121L27 130M161 107L202 96" fill="none"/>
    <path d="M75 144L96 164 139 163 162 141 175 225 62 227Z" fill="#d4c9ae"/>
    <path d="M80 180L151 177 155 205 78 209Z" fill="#efece4"/>
    <path d="M31 184L74 189 71 210 26 206M156 194L199 180 204 203 158 218" fill="#b89971"/>
    <path d="M174 151L193 148 202 186 175 192Z" fill="#788873"/>
    {mood === 'frozen' && <g fill="#cfeefb" stroke="#4f8aa6" strokeWidth="3"><path d="M60 22l5 22 5-22z M110 50l4 18 4-18z M170 18l5 20 5-20z"/></g>}
  </g><text x="89" y="199" fontFamily="PT Mono,monospace" fontSize="14" fill="#1a1a1a">$ CASH</text></svg>;
}
