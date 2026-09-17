/**
 * A nickname with its bought effect. One element, one attribute: every effect is CSS in cosmetics.css
 * keyed on data-name-fx, with data-text feeding the layered pseudo-elements (shine, glitch, hologram).
 */
export function PlayerName({ fx, name, className }: { fx?: string; name: string; className?: string }) {
  return <span className={`name-fx${className ? ` ${className}` : ''}`} data-name-fx={fx || undefined} data-text={name}>{name}</span>;
}
