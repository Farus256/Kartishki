// Original cut-paper characters. Shared SVG source for DOM portraits and Pixi textures.
const cache = new Map<string, string>();
export function illustrationUrl(id: string): string {
 if (cache.has(id)) return cache.get(id)!;
 const seed = [...id].reduce((n,c)=>n+c.charCodeAt(0),0);
 const mech = /ward|aegis|knight|colossus|omen|bulwark/.test(id);
 const beast = /whelp|viper|alpha|fang|hydra|howler|breeder/.test(id);
 const colors = ['#9a9b79','#bd9567','#899c92','#b98568','#9c9290'];
 const fill = colors[seed%colors.length];
 const face = mech
  ? `<path d="M64 62L183 55 194 177 65 181Z" fill="${fill}"/><path d="M78 42L168 42 180 65 65 70Z" fill="#1a1a1a"/><path d="M80 100L176 94 175 130 80 131Z" fill="#efece4"/><path d="M104 104L108 127M151 99L151 125M91 153L163 149"/><path d="M60 87L40 87 40 149 65 149M189 84L209 86 208 139 192 146" fill="#b6a98d"/>`
  : beast
  ? `<path d="M67 108L53 32 108 77 154 65 205 33 188 129 190 188 116 211 63 179Z" fill="${fill}"/><path d="M70 109L113 119 93 139Z M145 116L186 95 165 133Z" fill="#efece4"/><path d="M92 120L93 131M163 112L161 125"/><path d="M98 155L148 149 135 172Z" fill="#1a1a1a"/><path d="M88 184L135 180 156 163"/><path d="M51 144L18 137M57 159L22 165M181 144L228 137M179 164L221 177"/>`
  : `<path d="M67 97Q54 172 107 195L154 194Q187 163 175 100Z" fill="${fill}"/><path d="M48 104L204 96 184 75 173 41 93 47 78 87Z" fill="#3f473b"/><path d="M83 126L113 122M142 120L166 118M122 134L110 159 138 157M96 178L154 168"/><path d="M73 119L69 154M178 115L184 148"/><path d="M92 197L61 230 207 237 165 192 129 211Z" fill="#efece4"/><path d="M116 209L137 210 143 249 106 246Z" fill="#d92525"/>`;
 const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><pattern id="h" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><path d="M0 0V9" stroke="#1a1a1a" opacity=".08"/></pattern></defs><path fill="#cac8b7" d="M0 0H256V256H0Z"/><path d="M13 231L28 23 235 17 246 242Z" fill="#dcd6c5"/><g stroke="#1a1a1a" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">${face}</g><path fill="url(#h)" d="M0 0H256V256H0Z"/><path d="M15 18L59 14M220 219L233 241M23 208L32 240" stroke="#1a1a1a" stroke-width="2" opacity=".3"/></svg>`;
 const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);cache.set(id,url);return url;
}
