(() => {
  const canvas = document.querySelector('.veil-rain');
  if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const context = canvas.getContext('2d', { alpha: true });
  const vocabulary = [
    'VF008', 'VF001', 'VF009', 'APS', 'ARC', 'PROOF', 'HASH', 'LOCAL',
    'P0', 'P1', 'P2', 'P3', 'SOL', '0x', 'GETTER', 'POLICY', 'TRACE'
  ];
  const palette = [
    [143, 153, 169],
    [111, 123, 141],
    [177, 185, 198]
  ];
  const isEnginePage = document.body.classList.contains('app-page');

  let width = 0;
  let height = 0;
  let density = 0;
  let streams = [];
  let accentStreams = [];
  let frame = 0;
  let previous = 0;

  const randomToken = () => vocabulary[Math.floor(Math.random() * vocabulary.length)];

  function createStream(index) {
    const token = randomToken();
    const color = palette[Math.floor(Math.random() * palette.length)];
    return {
      x: 24 + index * density + Math.random() * density * .4,
      y: Math.random() * (height + 180),
      speed: 7 + Math.random() * 10,
      gap: 19 + Math.random() * 6,
      token,
      phase: Math.floor(Math.random() * token.length),
      length: 4 + Math.floor(Math.random() * 6),
      color,
      fill: `rgb(${color[0]},${color[1]},${color[2]})`,
      alpha: .36 + Math.random() * .32
    };
  }

  function resize() {
    const ratio = 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    // Keep the telemetry field spacious like the Privacy OS workspace.
    density = isEnginePage
      ? (width < 700 ? 19 : width < 1500 ? 24 : 27)
      : (width < 700 ? 17 : width < 1500 ? 21 : 24);
    const count = Math.ceil(width / density);
    streams = Array.from({ length: count }, (_, index) => createStream(index));
    // Two intentional hero lanes: they begin from the open upper canvas areas.
    const lanes = [.19, .57, .82];
    accentStreams = lanes.map((lane, index) => ({
      x: Math.round(width * lane),
      y: -8 - index * 76,
      speed: 39 + index * 5,
      gap: 18,
      token: index === 0 ? 'VF•' : index === 1 ? 'ARC•' : 'APS•',
      phase: index,
      length: 15,
      color: palette[index % palette.length],
      fill: `rgb(${palette[index % palette.length].join(',')})`,
      alpha: .68
    }));
  }

  function drawStream(stream, isAccent, delta) {
    stream.y += stream.speed * delta;
    context.fillStyle = stream.fill;
    for (let index = 0; index < stream.length; index += 1) {
      const y = stream.y - index * stream.gap;
      if (y < -20 || y > height + 20) continue;
      context.globalAlpha = stream.alpha * (1 - index / stream.length);
      const character = stream.token[(stream.phase + index) % stream.token.length];
      context.fillText(character, stream.x, y);
    }
    if (stream.y - stream.length * stream.gap > height + 40) {
      if (isAccent) {
        stream.y = -8 - Math.random() * 76;
        stream.phase = (stream.phase + 1) % stream.token.length;
      } else {
        Object.assign(stream, createStream(Math.round((stream.x - 24) / density)), {
          y: -40 - Math.random() * height * .65
        });
      }
    }
  }

  function draw(timestamp) {
    frame = requestAnimationFrame(draw);
    if (document.hidden || timestamp - previous < 16) return;
    const delta = Math.min((timestamp - previous) / 1000, .08);
    previous = timestamp;
    context.clearRect(0, 0, width, height);
    context.font = '11px Consolas, monospace';
    context.textAlign = 'center';

    for (const stream of streams) drawStream(stream, false, delta);
    for (const stream of accentStreams) drawStream(stream, true, delta);
    context.globalAlpha = 1;
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  frame = requestAnimationFrame(draw);
  window.addEventListener('pagehide', () => cancelAnimationFrame(frame), { once: true });
})();
