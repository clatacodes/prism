(function(){
  const input        = document.getElementById('emoji-input');
  const track         = document.getElementById('track');
  const neutralShelf  = document.getElementById('neutral-shelf');
  const countLabel    = document.getElementById('count-label');
  const seqText       = document.getElementById('seq-text');
  const copyBtn       = document.getElementById('copy-btn');
  const statusEl      = document.getElementById('status');
  const canvas        = document.getElementById('sampler');
  const ctx           = canvas.getContext('2d', { willReadFrequently: true });

  const SIZE = 72;
  const colorCache = new Map();

  function splitGraphemes(str){
    if (typeof Intl !== 'undefined' && Intl.Segmenter){
      const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
      return Array.from(seg.segment(str), s => s.segment);
    }
    return Array.from(str);
  }

  // Roughly identify clusters that are actually emoji (skips plain letters/punctuation/space)
  const pictographic = /\p{Extended_Pictographic}|\p{Emoji_Presentation}/u;
  function isEmojiCluster(cluster){
    const stripped = cluster.replace(/[\u200d\uFE0F]/g, '');
    return pictographic.test(stripped) && stripped.trim().length > 0;
  }

  function rgbToHsv(r, g, b){
    r/=255; g/=255; b/=255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    const d = max - min;
    let h = 0;
    if (d !== 0){
      if (max === r) h = ((g-b)/d) % 6;
      else if (max === g) h = (b-r)/d + 2;
      else h = (r-g)/d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d/max;
    const v = max;
    return { h, s, v };
  }

  function sampleColor(cluster){
    if (colorCache.has(cluster)) return colorCache.get(cluster);

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.font = `${Math.round(SIZE*0.72)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cluster, SIZE/2, SIZE/2 + 2);

    let data;
    try {
      data = ctx.getImageData(0, 0, SIZE, SIZE).data;
    } catch (e){
      const fallback = { h:0, s:0, v:0.5, rgb:'rgb(150,150,150)' };
      colorCache.set(cluster, fallback);
      return fallback;
    }

    let r=0,g=0,b=0,count=0;
    for (let i=0; i<data.length; i+=4){
      const alpha = data[i+3];
      if (alpha < 24) continue;
      r += data[i]; g += data[i+1]; b += data[i+2];
      count++;
    }
    let result;
    if (count === 0){
      result = { h:0, s:0, v:0, rgb:'rgb(180,180,180)' };
    } else {
      r = Math.round(r/count); g = Math.round(g/count); b = Math.round(b/count);
      const hsv = rgbToHsv(r,g,b);
      result = { h: hsv.h, s: hsv.s, v: hsv.v, rgb: `rgb(${r},${g},${b})` };
    }
    colorCache.set(cluster, result);
    return result;
  }

  function layoutRow(items, minGapPct){
    let prevX = -Infinity;
    return items.map(it => {
      let x = it.color.h / 360 * 100;
      if (x < prevX + minGapPct) x = prevX + minGapPct;
      prevX = x;
      return { ...it, x: Math.min(x, 100) };
    });
  }

  function render(){
    const raw = input.value;
    const clusters = splitGraphemes(raw).filter(isEmojiCluster);

    countLabel.textContent = clusters.length === 1 ? '1 emoji' : `${clusters.length} emoji`;

    if (clusters.length === 0){
      track.innerHTML = '';
      neutralShelf.classList.remove('show');
      neutralShelf.querySelectorAll('.glyph').forEach(n => n.remove());
      seqText.textContent = 'nothing sorted yet';
      seqText.classList.add('empty');
      copyBtn.disabled = true;
      statusEl.textContent = '';
      return;
    }

    const withColor = clusters.map((cluster, i) => ({
      cluster, i, color: sampleColor(cluster)
    }));

    const SAT_FLOOR = 0.14;
    const colorful = withColor.filter(it => it.color.s >= SAT_FLOOR)
                               .sort((a,b) => a.color.h - b.color.h || b.color.v - a.color.v);
    const neutral  = withColor.filter(it => it.color.s < SAT_FLOOR)
                               .sort((a,b) => b.color.v - a.color.v);

    const placed = layoutRow(colorful, colorful.length > 1 ? Math.min(9, 90/colorful.length) : 0);

    track.innerHTML = '';
    placed.forEach(it => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.style.left = it.x + '%';
      chip.style.setProperty('--dotcolor', it.color.rgb);
      chip.innerHTML = `<span class="glyph">${it.cluster}</span><span class="dot"></span>`;
      track.appendChild(chip);
    });

    neutralShelf.querySelectorAll('.glyph').forEach(n => n.remove());
    if (neutral.length){
      neutralShelf.classList.add('show');
      neutral.forEach(it => {
        const span = document.createElement('span');
        span.className = 'glyph';
        span.textContent = it.cluster;
        neutralShelf.appendChild(span);
      });
    } else {
      neutralShelf.classList.remove('show');
    }

    const orderedSequence = [...colorful, ...neutral].map(it => it.cluster).join(' ');
    seqText.textContent = orderedSequence;
    seqText.classList.remove('empty');
    copyBtn.disabled = false;
  }

  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 90);
  });

  copyBtn.addEventListener('click', async () => {
    const text = seqText.textContent;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      statusEl.textContent = 'Copied to clipboard.';
    } catch(e){
      statusEl.textContent = 'Could not copy — select the text manually.';
    }
    setTimeout(() => { statusEl.textContent = ''; }, 2200);
  });

  input.value = '🍎 🍊 🍋 🍏 🫐 🍇 🍓 ⚫ ⚪ 🔴 🟠 🟡 🟢 🔵 🟣';
  render();
})();
