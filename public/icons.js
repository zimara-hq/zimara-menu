// Shared authored outline icons. Names and sizes are bounded; callers provide visible labels.
const paths = Object.freeze({
  "arrowUpRight": "<path d=\"M7 17 17 7M7 7h10v10\"/>",
  "arrowRight": "<path d=\"M4 12h16m-6-6 6 6-6 6\"/>",
  "arrowsHorizontal": "<path d=\"M4 12h16M8 8l-4 4 4 4m8-8 4 4-4 4\"/>",
  "check": "<path d=\"m5 12 4 4L19 6\"/>",
  "plus": "<path d=\"M12 5v14M5 12h14\"/>",
  "close": "<path d=\"m6 6 12 12M6 18 18 6\"/>",
  "chevronDown": "<path d=\"m6 9 6 6 6-6\"/>",
  "moveUp": "<path d=\"M12 20V4m-6 6 6-6 6 6\"/>",
  "moveDown": "<path d=\"M12 4v16m-6-6 6 6 6-6\"/>",
  "bell": "<path d=\"M5 16h14l-2-3V9a5 5 0 0 0-10 0v4l-2 3M10 20h4\"/>",
  "volume": "<path d=\"m11 4-6 5H2v6h3l6 5V4m4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14\"/>",
  "phone": "<rect x=\"6\" y=\"2\" width=\"12\" height=\"20\" rx=\"2\"/><path d=\"M10 18h4\"/>",
  "laptop": "<rect x=\"4\" y=\"3\" width=\"16\" height=\"13\" rx=\"2\"/><path d=\"m4 16-2 5h20l-2-5\"/>",
  "key": "<circle cx=\"8\" cy=\"8\" r=\"5\"/><path d=\"m12 12 9 9m-3-3 3-3m-6 0 3-3\"/>",
  "coffee": "<path d=\"M4 8h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8m12 1h2a3 3 0 0 1 0 6h-2M7 3v2m4-2v2M3 22h16\"/>",
  "bean": "<ellipse cx=\"12\" cy=\"12\" rx=\"7\" ry=\"10\" transform=\"rotate(35 12 12)\"/><path d=\"M16 4c-9 4 1 12-8 16\"/>",
  "dish": "<path d=\"M3 17h18M5 17a7 7 0 0 1 14 0M12 8V5M2 21h20\"/>",
  "bag": "<path d=\"M5 7h14l2 14H3L5 7m3 0V6a4 4 0 0 1 8 0v1\"/>",
  "delivery": "<path d=\"M3 5h11v12H3V5m11 4h4l3 4v4h-7\"/><circle cx=\"7\" cy=\"18\" r=\"2\"/><circle cx=\"18\" cy=\"18\" r=\"2\"/>",
  "car": "<path d=\"m3 12 3-7h12l3 7v7h-3v-3H6v3H3v-7m0 0h18M6 13h2m8 0h2\"/>",
  "pin": "<path d=\"M12 22S4 14 4 9a8 8 0 1 1 16 0c0 5-8 13-8 13Z\"/><circle cx=\"12\" cy=\"9\" r=\"3\"/>",
  "star": "<path d=\"m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z\"/>",
  "user": "<circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M4 22v-3a8 8 0 0 1 16 0v3\"/>",
  "leaf": "<path d=\"M20 3C7 2 1 9 5 17s16 3 15-14ZM5 19 16 8\"/>",
  "alert": "<path d=\"m12 3 10 18H2L12 3Zm0 6v5m0 3v1\"/>",
  "moon": "<path d=\"M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z\"/>",
  "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1\"/>",
  "diamond": "<path d=\"m12 2 10 10-10 10L2 12 12 2Z\"/>",
  "circle": "<circle cx=\"12\" cy=\"12\" r=\"8\"/>",
  "sparkles": "<path d=\"m12 3 2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7Zm7 0v4m-2-2h4\"/>",
  "camera": "<path d=\"m8 6 2-3h4l2 3h5v15H3V6h5Z\"/><circle cx=\"12\" cy=\"13\" r=\"4\"/>",
  "file": "<path d=\"M5 2h9l5 5v15H5V2m9 0v6h5M8 12h8m-8 4h8\"/>",
  "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 6v6l4 2\"/>",
  "megaphone": "<path d=\"m3 9 17-6v18L3 15V9Zm4 7 2 6h4l-2-5\"/>",
  "pepper": "<path d=\"M17 7c1-3 3-4 5-3M7 10c1-4 9-5 11 0 2 6-7 12-15 11 4-2 4-7 4-11Z\"/>",
  "burger": "<path d=\"M3 10a9 7 0 0 1 18 0H3Zm0 4h18M3 18h18v3H3v-3Z\"/>",
  "bread": "<path d=\"M5 10C0 6 6 1 12 3c6-2 12 3 7 7v11H5V10Zm4-3v3m6-3v3\"/>",
  "cup": "<path d=\"M5 6h14l-2 16H7L5 6Zm7 0 2-4h5M4 6h16\"/>",
  "medical": "<path d=\"M7 3v5a5 5 0 0 0 10 0V3M5 3h4m6 0h4m-7 10v3a5 5 0 0 0 10 0v-3\"/><circle cx=\"21\" cy=\"10\" r=\"2\"/>",
  "scissors": "<circle cx=\"5\" cy=\"6\" r=\"3\"/><circle cx=\"5\" cy=\"18\" r=\"3\"/><path d=\"m8 8 13 13M8 16 21 3\"/>",
  "basket": "<path d=\"M3 8h18l-2 13H5L3 8Zm4 0 3-6m7 6-3-6M9 12v5m6-5v5\"/>",
  "undo": "<path d=\"M3 10h10a7 7 0 0 1 7 7v3M3 10l6-6m-6 6 6 6\"/>",
  "redo": "<path d=\"M21 10H11a7 7 0 0 0-7 7v3m17-10-6-6m6 6-6 6\"/>",
  "layout": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 10h18m-12 0v11\"/>",
  "text": "<path d=\"M4 5h16M12 5v15m-5 0h10\"/>",
  "image": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><circle cx=\"8\" cy=\"8\" r=\"2\"/><path d=\"m3 17 5-5 4 4 4-6 5 7\"/>",
  "gallery": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/>",
  "list": "<path d=\"M8 6h13M8 12h13M8 18h13M3 6h1m-1 6h1m-1 6h1\"/>",
  "help": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5m0 3v1\"/>",
  "eye": "<path d=\"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
  "eyeOff": "<path d=\"m3 3 18 18M9 5c6-2 13 7 13 7l-3 4M6 6l-4 6s4 7 10 7l4-1M10 10l4 4\"/>",
  "minus": "<path d=\"M5 12h14\"/>",
  "heart": "<path d=\"M12 21 3 12A6 6 0 0 1 12 4a6 6 0 0 1 9 8l-9 9Z\"/>",
  "chart": "<path d=\"M3 3v18h18M7 16v-4m5 4V6m5 10V9\"/>",
  "info": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v6m0-10v1\"/>"
});

export function icon(name, size = 20) {
  const path = Object.hasOwn(paths, name) ? paths[name] : paths.circle;
  const pixels = Number.isFinite(size) ? Math.min(48, Math.max(12, size)) : 20;
  return `<svg class="ui-icon" viewBox="0 0 24 24" width="${pixels}" height="${pixels}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="display:inline-block;vertical-align:middle;flex-shrink:0">${path}</svg>`;
}

if (typeof document !== 'undefined' && !document.querySelector('link[data-ui-icons]')) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./icons.css', import.meta.url).href;
  stylesheet.dataset.uiIcons = '';
  document.head.append(stylesheet);
}
