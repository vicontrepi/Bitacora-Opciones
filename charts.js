// Canvas-only charts (sin librerías externas)
export function drawBarChart(canvas, labels, values, title) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  const pad = 50;
  const maxV = Math.max(1, ...values.map(v => Math.abs(v)));
  const scale = (H - pad*2) / (maxV * 1.2);
  const barW = Math.max(10, (W - pad*2) / (values.length || 1) * 0.6);
  const step = (W - pad*2) / Math.max(1, values.length || 1);

  ctx.strokeStyle = "#2a2d36"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, H - pad); ctx.lineTo(W - pad, H - pad);
  ctx.moveTo(pad, pad); ctx.lineTo(pad, H - pad); ctx.stroke();
  const zeroY = H - pad; ctx.strokeStyle = "#444b57"; ctx.beginPath();
  ctx.moveTo(pad, zeroY); ctx.lineTo(W - pad, zeroY); ctx.stroke();
  ctx.fillStyle = "#e8eaed"; ctx.font = "16px system-ui, sans-serif"; ctx.fillText(title, pad, 24);

  for (let i=0;i<values.length;i++) {
    const v = values[i];
    const x = pad + i*step + (step - barW)/2;
    const y = H - pad - (Math.max(0, v) * scale);
    const h = Math.abs(v) * scale;
    ctx.fillStyle = v >= 0 ? "#64b5f6" : "#ef5350";
    ctx.fillRect(x, y, barW, h);

    ctx.save(); ctx.fillStyle = "#9aa0a6"; ctx.font = "12px system-ui, sans-serif";
    const lbl = labels[i]; const tw = ctx.measureText(lbl).width;
    ctx.translate(x + barW/2, H - pad + 14); ctx.rotate(-Math.PI/6);
    ctx.fillText(lbl, -tw/2, 0); ctx.restore();
  }
}
export function drawLineChart(canvas, labels, values, title) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  const pad = 50;
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const span = (maxV - minV) || 1;
  const scaleY = (H - pad*2) / span;
  const stepX = (W - pad*2) / Math.max(1, values.length - 1);

  ctx.strokeStyle = "#2a2d36"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, H - pad); ctx.lineTo(W - pad, H - pad);
  ctx.moveTo(pad, pad); ctx.lineTo(pad, H - pad); ctx.stroke();
  ctx.fillStyle = "#e8eaed"; ctx.font = "16px system-ui, sans-serif"; ctx.fillText(title, pad, 24);
  ctx.strokeStyle = "#64b5f6"; ctx.lineWidth = 2; ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad + i * stepX;
    const y = H - pad - (v - minV) * scaleY;
    if (i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#9aa0a6"; ctx.font = "12px system-ui, sans-serif";
  const every = Math.ceil(labels.length / 10);
  labels.forEach((lbl, i) => {
    if (i % every !== 0) return;
    const x = pad + i * stepX;
    const tw = ctx.measureText(lbl).width;
    ctx.fillText(lbl, x - tw/2, H - pad + 14);
  });
}
