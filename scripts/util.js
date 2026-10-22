function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* 颜色形状校验：接受 #RGB / #RRGGBB（可省略 #），其余一律抛错。
   必须抛错而不是返回 NaN —— Task 5/7 的门槛写作 contrast(...) >= 4.5，
   而 NaN >= 4.5 恒为 false，坏色值会静默通过无障碍断言（fail-open）。 */
function normalizeHex(input) {
  if (typeof input !== 'string') {
    throw new TypeError(`颜色必须是字符串，收到 ${typeof input}: ${String(input)}`);
  }
  const raw = input.trim().replace(/^#/, '');
  const hex = /^[0-9a-fA-F]{3}$/.test(raw) ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`颜色格式非法（应为 #RGB 或 #RRGGBB）：${input}`);
  return hex;
}

function luminance(input) {
  const rgb = normalizeHex(input).match(/../g).map((pair) => {
    const v = parseInt(pair, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrast(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

module.exports = { esc, luminance, contrast, normalizeHex };
