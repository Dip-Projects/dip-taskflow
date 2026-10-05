// public/tableWorker.js
// public/tableWorker.js  — add at the very top
self.onerror = function(msg, src, line, col, err) {
  self.postMessage({ error: "Worker JS error: " + msg + " line:" + line });
};
function colLetter(n) {
  let s = ""; n++;
  while (n > 0) { s = String.fromCharCode(((n-1)%26)+65)+s; n=Math.floor((n-1)/26); }
  return s;
}

self.onmessage = async function(e) {
  const { raw, headerInfo, dataR1, dataR2, c1, c2, bandText, sectionLabel } = e.data;

  const cols = Array.from({ length: c2 - c1 + 1 }, (_, i) => i + c1).slice(0, 15);
  if (!cols.length || dataR2 < dataR1) { self.postMessage({ error: "empty" }); return; }

  const titleRows = headerInfo?.titleRows || [];
  const labelRows = headerInfo?.labelRows || [];
  const useFallback = labelRows.length === 0;

  const MAX_W = 1400;
  const idealCW = Math.floor((MAX_W - 24) / cols.length);
  const CW = Math.max(60, Math.min(120, idealCW));
  const CH=26, BH=38, TH=22, LH=24, PAD=12;

  const dataRows = [];
  for (let r = dataR1; r <= dataR2; r++) dataRows.push(raw[r] || []);

  const W = PAD*2 + cols.length*CW;
  const H = BH + titleRows.length*TH + (useFallback ? LH : labelRows.length*LH) + dataRows.length*CH + PAD;

  let canvas, ctx;
  try {
    canvas = new OffscreenCanvas(W, H);
    ctx = canvas.getContext("2d");
  } catch(err) {
    self.postMessage({ error: "no_offscreen" });
    return;
  }

  ctx.fillStyle = "#fff"; ctx.fillRect(0,0,W,H);
  let y = 0;

  const grad = ctx.createLinearGradient(0,0,W,BH);
  grad.addColorStop(0,"#3d1200"); grad.addColorStop(0.5,"#7a2e00"); grad.addColorStop(1,"#c96a10");
  ctx.fillStyle=grad; ctx.fillRect(0,y,W,BH);
  ctx.fillStyle="#fff"; ctx.font="bold 14px Arial,sans-serif"; ctx.textBaseline="middle";
  ctx.fillText(bandText||sectionLabel,PAD,y+BH/2);
  y+=BH;

  titleRows.forEach(ri => {
    const text=(raw[ri]||[]).find(c=>c!==""&&c!=null)??"";
    ctx.fillStyle="#fdf3e7"; ctx.fillRect(0,y,W,TH);
    ctx.strokeStyle="rgba(201,106,16,0.3)"; ctx.lineWidth=0.75; ctx.strokeRect(0,y,W,TH);
    ctx.fillStyle="#7a2e00"; ctx.font="bold 12px Arial,sans-serif"; ctx.textBaseline="middle";
    ctx.fillText(String(text),PAD,y+TH/2); y+=TH;
  });

  if (!useFallback) {
    labelRows.forEach(ri => {
      const row=raw[ri]||[];
      ctx.fillStyle="#f0e4d4"; ctx.fillRect(0,y,W,LH);
      cols.forEach((ci,xi) => {
        const x=PAD+xi*CW;
        ctx.fillStyle="#3d1200"; ctx.font="bold 11.5px Arial,sans-serif"; ctx.textBaseline="middle";
        let t=String(row[ci]??"");
        while(ctx.measureText(t).width>CW-10&&t.length>1) t=t.slice(0,-1)+"…";
        ctx.fillText(t,x+5,y+LH/2);
        if(xi>0){ctx.strokeStyle="rgba(201,106,16,0.3)";ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+LH);ctx.stroke();}
      });
      ctx.strokeStyle="#c96a10";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,y+LH);ctx.lineTo(W,y+LH);ctx.stroke();
      y+=LH;
    });
  } else {
    ctx.fillStyle="#f5f0e8"; ctx.fillRect(0,y,W,LH);
    cols.forEach((ci,xi) => {
      const x=PAD+xi*CW; const label=colLetter(ci);
      ctx.fillStyle="#7a2e00"; ctx.font="bold 10px Arial,sans-serif"; ctx.textBaseline="middle";
      ctx.fillText(label,x+CW/2-ctx.measureText(label).width/2,y+LH/2);
      if(xi>0){ctx.strokeStyle="rgba(201,106,16,0.25)";ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+LH);ctx.stroke();}
    });
    y+=LH;
  }

  dataRows.forEach((row,ri) => {
    const ry=y+ri*CH;
    ctx.fillStyle=ri%2===0?"#ffffff":"#fdf9f4"; ctx.fillRect(0,ry,W,CH);
    ctx.strokeStyle="rgba(201,106,16,0.18)";ctx.lineWidth=0.5;
    ctx.beginPath();ctx.moveTo(0,ry+CH);ctx.lineTo(W,ry+CH);ctx.stroke();
    cols.forEach((ci,xi) => {
      const x=PAD+xi*CW;
      let t=String(row[ci]??"");
      ctx.fillStyle="#1c1917";ctx.font="12px Arial,sans-serif";ctx.textBaseline="middle";
      while(ctx.measureText(t).width>CW-8&&t.length>1) t=t.slice(0,-1)+"…";
      ctx.fillText(t,x+4,ry+CH/2);
      if(xi>0){ctx.strokeStyle="rgba(201,106,16,0.15)";ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(x,ry);ctx.lineTo(x,ry+CH);ctx.stroke();}
    });
  });

  ctx.strokeStyle="#c96a10";ctx.lineWidth=1.5;ctx.strokeRect(0,0,W,H);

  try {
    const blob = await canvas.convertToBlob({ type:"image/jpeg", quality:0.85 });
    const ab = await blob.arrayBuffer();
    self.postMessage({ arrayBuffer: ab }, [ab]);
  } catch(err) {
    self.postMessage({ error: String(err) });
  }
};