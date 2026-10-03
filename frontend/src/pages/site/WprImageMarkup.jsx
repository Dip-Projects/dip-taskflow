import { useEffect, useRef, useState } from "react";

const COLORS = ["#dc2626", "#16a34a", "#2563eb", "#c96a10", "#111827"];
const TOOLS = [
  { id: "rect", label: "Square" },
  { id: "circle", label: "Circle" },
  { id: "line", label: "Draw" },
  { id: "text", label: "Text" },
];

function withAlpha(hex, alpha) {
  const raw = hex.replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function textBoxOf(ctx, mark) {
  const size = mark.size || 24;
  ctx.save();
  ctx.font = `700 ${size}px "Segoe UI", sans-serif`;
  const width = ctx.measureText(mark.text || "").width;
  ctx.restore();
  const padX = size * 0.42;
  const padY = size * 0.3;
  return {
    x: mark.x,
    y: mark.y,
    w: Math.max(width + padX * 2, size),
    h: size + padY * 2,
    padX,
    padY,
    size,
  };
}

function drawMark(ctx, mark, selected) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = mark.color;
  ctx.fillStyle = withAlpha(mark.color, 0.34);
  ctx.lineWidth = mark.width || 4;
  if (mark.type === "rect") {
    ctx.fillRect(mark.x, mark.y, mark.w, mark.h);
    ctx.strokeRect(mark.x, mark.y, mark.w, mark.h);
  } else if (mark.type === "ellipse") {
    const rx = Math.abs(mark.w) / 2;
    const ry = Math.abs(mark.h) / 2;
    if (rx > 1 && ry > 1) {
      ctx.beginPath();
      ctx.ellipse(mark.x + mark.w / 2, mark.y + mark.h / 2, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else if (mark.type === "line" && mark.points?.length) {
    ctx.beginPath();
    mark.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
  } else if (mark.type === "text" && mark.text) {
    const box = textBoxOf(ctx, mark);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(box.x, box.y, box.w, box.h, 8);
    else ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill();
    ctx.lineWidth = Math.max(2, box.size / 14);
    ctx.stroke();
    ctx.font = `700 ${box.size}px "Segoe UI", sans-serif`;
    ctx.fillStyle = mark.color;
    ctx.fillText(mark.text, box.x + box.padX, box.y + box.padY + box.size * 0.82);
  }
  if (selected) {
    const box = markBounds(ctx, mark);
    const radius = handleRadius(ctx.canvas);
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = Math.max(2, radius * 0.18);
    ctx.strokeRect(box.x - 6, box.y - 6, box.w + 12, box.h + 12);
    ctx.setLineDash([]);
    Object.values(handlePoints(box)).forEach((point) => {
      ctx.beginPath();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#c96a10";
      ctx.lineWidth = Math.max(2, radius * 0.2);
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
  ctx.restore();
}

function handleRadius(canvas) {
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / canvas.width || 1;
  return Math.max(8, 12 / scale);
}

function handlePoints(box) {
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  const midX = box.x + box.w / 2;
  const midY = box.y + box.h / 2;
  return {
    n: { x: midX, y: box.y },
    e: { x: right, y: midY },
    s: { x: midX, y: bottom },
    w: { x: box.x, y: midY },
    ne: { x: right, y: box.y },
    nw: { x: box.x, y: box.y },
    se: { x: right, y: bottom },
    sw: { x: box.x, y: bottom },
  };
}

function hitHandle(ctx, mark, point) {
  const box = markBounds(ctx, mark);
  const radius = handleRadius(ctx.canvas) * 1.7;
  let found = "";
  let best = radius;
  Object.entries(handlePoints(box)).forEach(([key, handle]) => {
    const distance = Math.hypot(point.x - handle.x, point.y - handle.y);
    if (distance <= best) {
      found = key;
      best = distance;
    }
  });
  return found;
}

function resizeByHandle(mark, handle, point, snapshot) {
  const box = snapshot.box;
  const minSize = 12;
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  let x = box.x;
  let y = box.y;
  let w = box.w;
  let h = box.h;
  if (handle.includes("e")) w = Math.max(minSize, point.x - box.x);
  if (handle.includes("w")) {
    x = Math.min(point.x, right - minSize);
    w = right - x;
  }
  if (handle.includes("s")) h = Math.max(minSize, point.y - box.y);
  if (handle.includes("n")) {
    y = Math.min(point.y, bottom - minSize);
    h = bottom - y;
  }
  if (mark.type === "line" && snapshot.points) {
    const sx = box.w > 1 ? w / box.w : 1;
    const sy = box.h > 1 ? h / box.h : 1;
    return {
      ...mark,
      points: snapshot.points.map((item) => ({
        x: x + (item.x - box.x) * sx,
        y: y + (item.y - box.y) * sy,
      })),
    };
  }
  if (mark.type === "text") {
    const factor = handle === "n" || handle === "s"
      ? h / Math.max(1, box.h)
      : handle === "e" || handle === "w"
        ? w / Math.max(1, box.w)
        : (w / Math.max(1, box.w) + h / Math.max(1, box.h)) / 2;
    return { ...mark, x, y, size: Math.min(160, Math.max(14, Math.round((snapshot.size || 24) * factor))) };
  }
  return { ...mark, x, y, w, h };
}

function markBounds(ctx, mark) {
  if (mark.type === "text") return textBoxOf(ctx, mark);
  if (mark.type === "line" && mark.points?.length) {
    const xs = mark.points.map((point) => point.x);
    const ys = mark.points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(8, Math.max(...xs) - x), h: Math.max(8, Math.max(...ys) - y) };
  }
  return { x: mark.x, y: mark.y, w: Math.abs(mark.w || 0), h: Math.abs(mark.h || 0) };
}

function pointInMark(ctx, mark, point) {
  const box = markBounds(ctx, mark);
  const pad = Math.max(14, (mark.width || 4) * 2);
  if (mark.type === "line" && mark.points?.length > 1) {
    return mark.points.slice(1).some((end, index) => {
      const start = mark.points[index];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2));
      return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy)) <= pad;
    });
  }
  return point.x >= box.x - pad && point.x <= box.x + box.w + pad && point.y >= box.y - pad && point.y <= box.y + box.h + pad;
}

function scaleShape(mark, factor) {
  if (mark.type === "line" && mark.points?.length) {
    const cx = mark.points.reduce((sum, point) => sum + point.x, 0) / mark.points.length;
    const cy = mark.points.reduce((sum, point) => sum + point.y, 0) / mark.points.length;
    return {
      ...mark,
      width: Math.min(40, Math.max(2, (mark.width || 4) * factor)),
      points: mark.points.map((point) => ({
        x: cx + (point.x - cx) * factor,
        y: cy + (point.y - cy) * factor,
      })),
    };
  }
  const w = Math.max(10, (mark.w || 0) * factor);
  const h = Math.max(10, (mark.h || 0) * factor);
  return {
    ...mark,
    x: mark.x + (mark.w || 0) / 2 - w / 2,
    y: mark.y + (mark.h || 0) / 2 - h / 2,
    w,
    h,
    width: Math.min(40, Math.max(2, (mark.width || 4) * factor)),
  };
}

function ToolIcon({ name }) {
  const common = {
    viewBox: "0 0 24 24",
    width: 16,
    height: 16,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  if (name === "zoom-out") {
    return <svg {...common}><circle cx="10" cy="10" r="6" /><path d="M15 15l5 5M7.5 10h5" /></svg>;
  }
  if (name === "zoom-in") {
    return <svg {...common}><circle cx="10" cy="10" r="6" /><path d="M15 15l5 5M10 7.5v5M7.5 10h5" /></svg>;
  }
  if (name === "smaller") {
    return (
      <svg {...common}>
        <path d="M4 4l6 6" />
        <path d="M6.5 10H10V6.5" />
        <path d="M20 20l-6-6" />
        <path d="M17.5 14H14V17.5" />
      </svg>
    );
  }
  if (name === "larger") {
    return (
      <svg {...common}>
        <path d="M14 5h5v5M19.5 4.5l-6 6M10 19H5v-5M4.5 19.5l6-6" />
      </svg>
    );
  }
  if (name === "edit") {
    return <svg {...common}><path d="M4 20h4l11-11-4-4L4 16v4zM13 7l4 4" /></svg>;
  }
  if (name === "undo") {
    return (
      <svg {...common}>
        <path d="M9 14L4 9l5-5" />
        <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
      </svg>
    );
  }
  return <svg {...common}><path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" /></svg>;
}

function boxFrom(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  };
}

export default function WprImageMarkup({ imageUrl, onCancel, onSave }) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const imgRef = useRef(null);
  const startRef = useRef(null);
  const draftRef = useRef(null);
  const toolRef = useRef("pan");
  const colorRef = useRef(COLORS[0]);
  const marksRef = useRef([]);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const suppressDrawRef = useRef(false);
  const zoomRef = useRef(1);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState("pan");
  const [color, setColor] = useState(COLORS[0]);
  const [marks, setMarks] = useState([]);
  const [draft, setDraft] = useState(null);
  const [textBox, setTextBox] = useState(null);
  const [selectedText, setSelectedText] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [viewTick, setViewTick] = useState(0);
  const [error, setError] = useState("");
  const dragRef = useRef(null);
  zoomRef.current = zoom;

  toolRef.current = tool;
  colorRef.current = color;
  marksRef.current = marks;

  useEffect(() => {
    if (selectedText == null) return;
    const mark = marksRef.current[selectedText];
    if (mark?.color) setColor(mark.color);
  }, [selectedText]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setReady(true);
    };
    img.onerror = () => setError("Could not open this image.");
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!ready || !img || !canvas) return;
    const stage = stageRef.current;
    const maxW = Math.max(160, (stage?.clientWidth || window.innerWidth - 32) - 8);
    const maxH = Math.min(620, Math.max(220, window.innerHeight * 0.5));
    const fit = Math.min(maxW / img.width, maxH / img.height, 1);
    const scale = fit * zoom;
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.style.width = `${Math.max(1, Math.round(img.width * scale))}px`;
    canvas.style.height = `${Math.max(1, Math.round(img.height * scale))}px`;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    [...marks, draft].filter(Boolean).forEach((mark, index) => drawMark(ctx, mark, index === selectedText));
  }, [ready, marks, draft, selectedText, zoom]);

  useEffect(() => {
    const stage = stageRef.current;
    const bump = () => setViewTick((tick) => tick + 1);
    stage?.addEventListener("scroll", bump, { passive: true });
    window.addEventListener("resize", bump);
    return () => {
      stage?.removeEventListener("scroll", bump);
      window.removeEventListener("resize", bump);
    };
  }, [ready]);

  const changeZoom = (next, clientX, clientY) => {
    const stage = stageRef.current;
    const prev = zoomRef.current || 1;
    const clamped = Math.min(4, Math.max(0.5, next));
    if (!stage) {
      zoomRef.current = clamped;
      setZoom(clamped);
      return;
    }
    const stageRect = stage.getBoundingClientRect();
    const px = clientX == null ? stageRect.left + stage.clientWidth / 2 : clientX;
    const py = clientY == null ? stageRect.top + stage.clientHeight / 2 : clientY;
    const ratio = clamped / prev;
    const ox = px - stageRect.left + stage.scrollLeft;
    const oy = py - stageRect.top + stage.scrollTop;
    zoomRef.current = clamped;
    setZoom(clamped);
    requestAnimationFrame(() => {
      stage.scrollLeft = ox * ratio - (px - stageRect.left);
      stage.scrollTop = oy * ratio - (py - stageRect.top);
    });
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return undefined;

    const fingerPoint = (touch) => ({ x: touch.clientX, y: touch.clientY });
    const beginPinch = (touches) => {
      const a = fingerPoint(touches[0]);
      const b = fingerPoint(touches[1]);
      pinchRef.current = {
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        zoom: zoomRef.current || 1,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop,
      };
      startRef.current = null;
      draftRef.current = null;
      dragRef.current = null;
      suppressDrawRef.current = true;
      setDraft(null);
    };
    const movePinch = (touches) => {
      const pinch = pinchRef.current;
      if (!pinch) return;
      const a = fingerPoint(touches[0]);
      const b = fingerPoint(touches[1]);
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const next = Math.min(4, Math.max(0.5, pinch.zoom * (dist / pinch.dist)));
      const ratio = next / (pinch.zoom || 1);
      const stageRect = stage.getBoundingClientRect();
      const ox = pinch.midX - stageRect.left + pinch.scrollLeft;
      const oy = pinch.midY - stageRect.top + pinch.scrollTop;
      zoomRef.current = next;
      setZoom(next);
      stage.scrollLeft = ox * ratio - (midX - stageRect.left);
      stage.scrollTop = oy * ratio - (midY - stageRect.top);
    };
    const onTouchStart = (event) => {
      if (event.touches.length < 2) return;
      event.preventDefault();
      beginPinch(event.touches);
    };
    const onTouchMove = (event) => {
      if (event.touches.length < 2) return;
      event.preventDefault();
      if (!pinchRef.current) beginPinch(event.touches);
      movePinch(event.touches);
    };
    const onTouchEnd = (event) => {
      if (event.touches.length >= 2) {
        beginPinch(event.touches);
        return;
      }
      if (pinchRef.current) {
        pinchRef.current = null;
        startRef.current = null;
        draftRef.current = null;
        dragRef.current = null;
        setDraft(null);
      }
    };
    const onWheel = (event) => {
      event.preventDefault();
      const prev = zoomRef.current || 1;
      const step = event.deltaY > 0 ? -0.12 : 0.12;
      const stageRect = stage.getBoundingClientRect();
      const px = event.clientX;
      const py = event.clientY;
      const next = Math.min(4, Math.max(0.5, prev + step));
      const ratio = next / prev;
      const ox = px - stageRect.left + stage.scrollLeft;
      const oy = py - stageRect.top + stage.scrollTop;
      zoomRef.current = next;
      setZoom(next);
      stage.scrollLeft = ox * ratio - (px - stageRect.left);
      stage.scrollTop = oy * ratio - (py - stageRect.top);
    };

    stage.addEventListener("touchstart", onTouchStart, { passive: false });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    stage.addEventListener("touchend", onTouchEnd);
    stage.addEventListener("touchcancel", onTouchEnd);
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("touchend", onTouchEnd);
      stage.removeEventListener("touchcancel", onTouchEnd);
      stage.removeEventListener("wheel", onWheel);
    };
  }, [ready]);

  const strokeWidth = () => Math.max(4, (imgRef.current?.width || 800) * 0.004);
  const textSize = () => Math.max(22, Math.round((imgRef.current?.width || 800) * 0.028));

  const clampTextInside = (mark) => {
    const canvas = canvasRef.current;
    if (!canvas || mark?.type !== "text") return mark;
    const ctx = canvas.getContext("2d");
    let next = { ...mark, size: mark.size || textSize() };
    for (let pass = 0; pass < 8; pass += 1) {
      const box = textBoxOf(ctx, next);
      if (box.w <= canvas.width - 8 && box.h <= canvas.height - 8) break;
      next = { ...next, size: Math.max(14, Math.round(next.size * 0.86)) };
    }
    const box = textBoxOf(ctx, next);
    next.x = Math.min(Math.max(4, next.x), Math.max(4, canvas.width - box.w - 4));
    next.y = Math.min(Math.max(4, next.y), Math.max(4, canvas.height - box.h - 4));
    return next;
  };

  const clampMarkInside = (mark) => {
    const canvas = canvasRef.current;
    if (!canvas || mark?.type === "text") return mark;
    const ctx = canvas.getContext("2d");
    const box = markBounds(ctx, mark);
    let dx = 0;
    let dy = 0;
    if (box.x < 0) dx = -box.x;
    else if (box.x + box.w > canvas.width) dx = canvas.width - box.x - box.w;
    if (box.y < 0) dy = -box.y;
    else if (box.y + box.h > canvas.height) dy = canvas.height - box.y - box.h;
    if (!dx && !dy) return mark;
    if (mark.type === "line") {
      return { ...mark, points: (mark.points || []).map((point) => ({ x: point.x + dx, y: point.y + dy })) };
    }
    return { ...mark, x: mark.x + dx, y: mark.y + dy };
  };

  const pointFrom = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const hitMark = (point) => {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    const ctx = canvas.getContext("2d");
    for (let index = marksRef.current.length - 1; index >= 0; index -= 1) {
      if (pointInMark(ctx, marksRef.current[index], point)) return index;
    }
    return -1;
  };

  const onPointerDown = (event) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchRef.current || pointersRef.current.size >= 2) {
      startRef.current = null;
      draftRef.current = null;
      dragRef.current = null;
      setDraft(null);
      return;
    }
    if (!ready || textBox) return;
    const point = pointFrom(event);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let hit = selectedText != null && marksRef.current[selectedText] && hitHandle(ctx, marksRef.current[selectedText], point)
      ? selectedText
      : hitMark(point);
    const handle = hit >= 0 ? hitHandle(ctx, marksRef.current[hit], point) : "";
    if (hit >= 0) {
      const mark = marksRef.current[hit];
      const box = markBounds(ctx, mark);
      dragRef.current = handle
        ? {
            mode: "resize",
            index: hit,
            handle,
            snapshot: {
              box,
              points: (mark.points || []).map((item) => ({ ...item })),
              size: mark.size,
            },
          }
        : {
            mode: "move",
            index: hit,
            origin: point,
            snapshot: mark.type === "line"
              ? { points: (mark.points || []).map((item) => ({ ...item })) }
              : { x: mark.x, y: mark.y },
          };
      setSelectedText(hit);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (selectedText != null || toolRef.current === "pan") {
      if (selectedText != null) setSelectedText(null);
      if (toolRef.current !== "pan") return;
      const stage = stageRef.current;
      dragRef.current = {
        mode: "pan",
        x: event.clientX,
        y: event.clientY,
        scrollLeft: stage?.scrollLeft || 0,
        scrollTop: stage?.scrollTop || 0,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (toolRef.current === "text") {
      const point = pointFrom(event);
      const rect = canvasRef.current.getBoundingClientRect();
      setTextBox({
        ...point,
        left: rect.left + (point.x / canvasRef.current.width) * rect.width,
        top: rect.top + (point.y / canvasRef.current.height) * rect.height,
        value: "",
      });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = point;
    const width = strokeWidth();
    const next = toolRef.current === "line"
      ? { type: "line", points: [point], color: colorRef.current, width }
      : {
          type: toolRef.current === "circle" ? "ellipse" : "rect",
          x: point.x,
          y: point.y,
          w: 0,
          h: 0,
          color: colorRef.current,
          width,
        };
    draftRef.current = next;
    setDraft(next);
  };

  const onPointerMove = (event) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pinchRef.current || pointersRef.current.size >= 2) return;
    if (dragRef.current?.mode === "pan") {
      const stage = stageRef.current;
      if (stage) {
        stage.scrollLeft = dragRef.current.scrollLeft - (event.clientX - dragRef.current.x);
        stage.scrollTop = dragRef.current.scrollTop - (event.clientY - dragRef.current.y);
      }
      return;
    }
    if (dragRef.current) {
      const point = pointFrom(event);
      const { index, origin, snapshot, mode, handle } = dragRef.current;
      setMarks((prev) => prev.map((mark, item) => {
        if (item !== index) return mark;
        if (mode === "resize") {
          const resized = resizeByHandle(mark, handle, point, snapshot);
          return resized.type === "text" ? clampTextInside(resized) : resized;
        }
        const dx = point.x - origin.x;
        const dy = point.y - origin.y;
        if (mark.type === "line") {
          return clampMarkInside({
            ...mark,
            points: snapshot.points.map((itemPoint) => ({ x: itemPoint.x + dx, y: itemPoint.y + dy })),
          });
        }
        const moved = { ...mark, x: snapshot.x + dx, y: snapshot.y + dy };
        return mark.type === "text" ? clampTextInside(moved) : clampMarkInside(moved);
      }));
      return;
    }
    if (!startRef.current || toolRef.current === "text") return;
    const point = pointFrom(event);
    if (toolRef.current === "line") {
      const next = draftRef.current
        ? { ...draftRef.current, points: [...draftRef.current.points, point] }
        : null;
      draftRef.current = next;
      setDraft(next);
      return;
    }
    const box = boxFrom(startRef.current, point);
    const next = draftRef.current ? { ...draftRef.current, ...box } : null;
    draftRef.current = next;
    setDraft(next);
  };

  const onPointerUp = (event) => {
    pointersRef.current.delete(event.pointerId);
    if (pinchRef.current || suppressDrawRef.current) {
      dragRef.current = null;
      startRef.current = null;
      draftRef.current = null;
      setDraft(null);
      if (pointersRef.current.size === 0) suppressDrawRef.current = false;
      return;
    }
    if (dragRef.current) {
      dragRef.current = null;
      return;
    }
    const current = draftRef.current;
    startRef.current = null;
    draftRef.current = null;
    setDraft(null);
    if (!current) return;
    const bigEnough = current.type === "line"
      ? (current.points || []).length > 2
      : current.w > 6 && current.h > 6;
    if (bigEnough) setMarks((prev) => [...prev, current]);
  };

  const commitText = () => {
    const value = textBox?.value?.trim();
    if (value) {
      if (textBox.editIndex != null) {
        setMarks((prev) => prev.map((mark, index) => (
          index === textBox.editIndex ? clampTextInside({ ...mark, text: value }) : mark
        )));
        setSelectedText(textBox.editIndex);
      } else {
        setSelectedText(marksRef.current.length);
        setMarks((prev) => [
          ...prev,
          clampTextInside({
            type: "text",
            x: textBox.x,
            y: textBox.y,
            text: value,
            color: colorRef.current,
            size: textSize(),
          }),
        ]);
      }
    }
    setTextBox(null);
  };

  const resizeSelected = (factor) => {
    if (selectedText == null) return;
    setMarks((prev) => prev.map((mark, index) => {
      if (index !== selectedText) return mark;
      if (mark.type === "text") {
        const size = Math.min(160, Math.max(14, Math.round((mark.size || textSize()) * factor)));
        return clampTextInside({ ...mark, size });
      }
      return scaleShape(mark, factor);
    }));
  };

  const deleteSelected = () => {
    if (selectedText == null) return;
    setMarks((prev) => prev.filter((_, index) => index !== selectedText));
    setSelectedText(null);
    setTextBox(null);
  };

  const editSelectedText = () => {
    if (selectedText == null) return;
    const mark = marksRef.current[selectedText];
    const canvas = canvasRef.current;
    if (!mark || mark.type !== "text" || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    setTextBox({
      x: mark.x,
      y: mark.y,
      left: rect.left + (mark.x / canvas.width) * rect.width,
      top: rect.top + (mark.y / canvas.height) * rect.height,
      value: mark.text,
      editIndex: selectedText,
    });
  };

  const save = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const pending = textBox?.value?.trim();
    let list = marks;
    if (pending && textBox.editIndex != null) {
      list = marks.map((mark, index) => (index === textBox.editIndex ? clampTextInside({ ...mark, text: pending }) : mark));
    } else if (pending) {
      list = [...marks, clampTextInside({ type: "text", x: textBox.x, y: textBox.y, text: pending, color, size: textSize() })];
    }
    list = list.map((mark) => (mark.type === "text" ? clampTextInside(mark) : mark));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    [...list, draft].filter(Boolean).forEach((mark) => drawMark(ctx, mark, false));
    onSave(canvas.toDataURL("image/jpeg", 0.92));
  };

  return (
    <div className="wpr-mark-overlay" role="presentation">
      <div className="wpr-mark-modal" role="dialog" aria-modal="true" aria-label="Mark graphical image">
        <header className="wpr-mark-head">
          <div>
            <strong>Mark work sections</strong>
            <p>With the arrow, tap a mark to move, resize, or recolor it. Drag empty space to scroll. Choose Square, Circle, Draw, or Text to add a mark.</p>
          </div>
          <button type="button" className="wpr-mark-x" onClick={onCancel} aria-label="Close">×</button>
        </header>
        <div className="wpr-mark-tools">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`wpr-mark-tool${tool === item.id ? " is-on" : ""}`}
              onClick={() => { setTool(item.id); setTextBox(null); }}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className={`wpr-mark-tool wpr-mark-arrow${tool === "pan" ? " is-on" : ""}`}
            aria-label="Zoom and scroll"
            onClick={() => { setTool("pan"); setTextBox(null); setSelectedText(null); setDraft(null); }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M5 3.2l13.2 7.4-5.5.9-1.8 5.6-1.5-4.6L5 3.2z" fill="currentColor" />
            </svg>
          </button>
          <span className="wpr-mark-colors">
            {COLORS.map((item) => (
              <button
                key={item}
                type="button"
                className={`wpr-mark-swatch${color === item ? " is-on" : ""}`}
                style={{ background: item }}
                aria-label={item}
                onClick={() => {
                  setColor(item);
                  if (selectedText == null) return;
                  setMarks((prev) => prev.map((mark, index) => (
                    index === selectedText ? { ...mark, color: item } : mark
                  )));
                }}
              />
            ))}
          </span>
          <button type="button" className="wpr-mark-tool wpr-mark-icon" aria-label="Zoom out" onClick={() => changeZoom(Math.round((zoom - 0.25) * 100) / 100)}><ToolIcon name="zoom-out" /></button>
          <button type="button" className="wpr-mark-tool" onClick={() => changeZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button type="button" className="wpr-mark-tool wpr-mark-icon" aria-label="Zoom in" onClick={() => changeZoom(Math.round((zoom + 0.25) * 100) / 100)}><ToolIcon name="zoom-in" /></button>
          <button type="button" className="wpr-mark-tool wpr-mark-icon" aria-label="Smaller" onClick={() => resizeSelected(0.85)} disabled={selectedText == null}><ToolIcon name="smaller" /></button>
          <button type="button" className="wpr-mark-tool wpr-mark-icon" aria-label="Larger" onClick={() => resizeSelected(1.18)} disabled={selectedText == null}><ToolIcon name="larger" /></button>
          <button type="button" className="wpr-mark-tool wpr-mark-icon" aria-label="Edit text" onClick={editSelectedText} disabled={selectedText == null || marks[selectedText]?.type !== "text"}><ToolIcon name="edit" /></button>
          <button type="button" className="wpr-mark-tool wpr-mark-icon" aria-label="Undo" onClick={() => { setMarks((prev) => prev.slice(0, -1)); setSelectedText(null); }} disabled={!marks.length}><ToolIcon name="undo" /></button>
          <button type="button" className="wpr-mark-tool wpr-mark-icon" aria-label="Delete" onClick={deleteSelected} disabled={selectedText == null}><ToolIcon name="delete" /></button>
          <button type="button" className="wpr-mark-tool" onClick={() => { setMarks([]); setDraft(null); }} disabled={!marks.length}>Clear</button>
        </div>
        <div className="wpr-mark-stage" ref={stageRef}>
          {error ? <p className="wpr-mark-error">{error}</p> : <canvas
            ref={canvasRef}
            className={`wpr-mark-canvas is-${tool}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={(event) => {
              const index = hitMark(pointFrom(event));
              if (index < 0) return;
              const mark = marksRef.current[index];
              if (!mark || mark.type !== "text") {
                setSelectedText(index);
                return;
              }
              setSelectedText(index);
              const rect = canvasRef.current.getBoundingClientRect();
              const canvas = canvasRef.current;
              setTextBox({
                x: mark.x,
                y: mark.y,
                left: rect.left + (mark.x / canvas.width) * rect.width,
                top: rect.top + (mark.y / canvas.height) * rect.height,
                value: mark.text,
                editIndex: index,
              });
            }}
          />}
        </div>
        {textBox && (
          <form
            className="wpr-mark-text"
            style={(() => {
              const canvas = canvasRef.current;
              const formW = Math.min(280, window.innerWidth - 16);
              void viewTick;
              const formH = 46;
              if (!canvas) return { left: 8, top: 8, width: formW };
              const rect = canvas.getBoundingClientRect();
              const rawLeft = rect.left + (textBox.x / canvas.width) * rect.width;
              const rawTop = rect.top + (textBox.y / canvas.height) * rect.height;
              return {
                left: Math.max(8, Math.min(rawLeft, window.innerWidth - formW - 8)),
                top: Math.max(8, Math.min(rawTop, window.innerHeight - formH - 8)),
                width: formW,
              };
            })()}
            onSubmit={(event) => { event.preventDefault(); commitText(); }}
          >
            <input
              autoFocus
              value={textBox.value}
              placeholder="Write on this section"
              onChange={(event) => setTextBox((prev) => ({ ...prev, value: event.target.value }))}
              onKeyDown={(event) => { if (event.key === "Escape") setTextBox(null); }}
            />
            <button type="submit">Add</button>
          </form>
        )}
        <footer className="wpr-mark-foot">
          <button type="button" className="wpr-mark-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="wpr-mark-save" onClick={save} disabled={!ready || !!error}>Save marked image</button>
        </footer>
      </div>
    </div>
  );
}