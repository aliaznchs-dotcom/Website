// Minimal dependency-free line chart renderer for a canvas element.
function drawLineChart(canvas, points, { up = true } = {}) {
    if (!canvas || points.length < 2) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const pad = 8;

    const coords = points.map((p, i) => {
        const x = (i / (points.length - 1)) * (w - pad * 2) + pad;
        const y = h - pad - ((p - min) / range) * (h - pad * 2);
        return [x, y];
    });

    const color = up ? '#17ffb0' : '#ff4f6d';

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, up ? 'rgba(23,255,176,0.25)' : 'rgba(255,79,109,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.beginPath();
    ctx.moveTo(coords[0][0], coords[0][1]);
    coords.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(coords[coords.length - 1][0], h);
    ctx.lineTo(coords[0][0], h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(coords[0][0], coords[0][1]);
    coords.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
}
