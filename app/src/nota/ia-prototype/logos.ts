// SVG concepts only; no production brand assets are replaced.
export const logoNames = ["原标识", "L1 · 薄荷五线谱", "L2 · 圆章音符", "L3 · 墨绿乐谱"];
export function notaLogo(version = 1, className = "brand-logo") {
  if (!version) return '<svg class="' + className + '" viewBox="0 0 64 64" width="32" height="32" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#a8d9b5"/><path d="M21 45V18l25 25V16" fill="none" stroke="#15291b" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="16.5" cy="46.5" rx="7.5" ry="5" transform="rotate(-22 16.5 46.5)" fill="#15291b"/><ellipse cx="41.5" cy="44.5" rx="7.5" ry="5" transform="rotate(-22 41.5 44.5)" fill="#15291b"/></svg>';
  const circle = version === 2, dark = version === 3;
  const bg = dark ? "#173c2d" : circle ? "#fffdf6" : "#b9dec2";
  const ink = dark ? "#c4e8c9" : "#183c2a";
  const line = dark ? "#769c7e" : circle ? "#a5b4a1" : "#789b7c";
  const ys = [20,28,36,44,52];
  // L1: lower and optically center the N; left head on a line, right in a space.
  const leftY = version === 1 || circle ? 52 : 44, rightY = version === 1 ? 48 : 36;
  const leftTop = version === 1 ? 22 : 14, rightTop = version === 1 ? 18 : 10;
  return '<svg xmlns="http://www.w3.org/2000/svg" class="' + className + '" viewBox="0 0 72 72" width="32" height="32" role="img" aria-label="Nota ' + logoNames[version] + '">' +
    (circle ? '<circle cx="36" cy="36" r="34.5" fill="' + bg + '" stroke="#d3dac9"/>' : '<rect x="0" y="0" width="72" height="72" rx="14" fill="' + bg + '"/>') +
    '<g stroke="' + line + '" stroke-width="1" opacity=".7">' + ys.map(y => '<path d="M' + (circle ? 13 : 7) + ' ' + y + 'H' + (circle ? 59 : 65) + '"/>').join('') + '</g>' +
    '<g transform="translate(' + (version === 1 ? 4 : 0) + ' 0)" fill="' + ink + '" stroke="' + ink + '"><path d="M25 ' + leftTop + 'V' + leftY + 'M50 ' + rightTop + 'V' + rightY + '" fill="none" stroke-width="4.8" stroke-linecap="round"/><path d="M25 ' + leftTop + ' 50 ' + rightY + '" fill="none" stroke-width="2" stroke-linecap="round"/><ellipse cx="19" cy="' + leftY + '" rx="7" ry="4.4" transform="rotate(-18 19 ' + leftY + ')" stroke="none"/><ellipse cx="44" cy="' + rightY + '" rx="7" ry="4.4" transform="rotate(-18 44 ' + rightY + ')" stroke="none"/></g></svg>';
}
