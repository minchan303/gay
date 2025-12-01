// script.js
(() => {
  const textInput = document.getElementById("textInput");
  const fileInput = document.getElementById("fileInput");
  const urlInput = document.getElementById("urlInput");
  const outputArea = document.getElementById("outputArea");
  const loading = document.getElementById("loading");
  const taskSelect = document.getElementById("taskSelect");
  const mindmapWrap = document.getElementById("mindmapWrap");
  const mindmapContainer = document.getElementById("mindmapContainer");
  const downloadSvgBtn = document.getElementById("downloadSvgBtn");

  // mode toggles
  document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener("change", () => {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    document.getElementById("textBox").style.display = mode === "text" ? "block" : "none";
    document.getElementById("fileBox").style.display = mode === "file" ? "block" : "none";
    document.getElementById("urlBox").style.display = mode === "url" ? "block" : "none";
  }));

  document.getElementById("clearBtn").addEventListener("click", () => {
    textInput.value = "";
    urlInput.value = "";
    if (fileInput) fileInput.value = null;
    outputArea.innerText = "";
    mindmapContainer.innerHTML = "";
    mindmapWrap.style.display = "none";
  });

  async function submit() {
    outputArea.innerText = "";
    mindmapContainer.innerHTML = "";
    mindmapWrap.style.display = "none";
    loading.style.display = "block";
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const task = taskSelect.value;

    const form = new FormData();
    form.append("task", task);

    if (mode === "text") {
      const t = textInput.value.trim();
      if (!t) { alert("Please enter text"); loading.style.display='none'; return; }
      form.append("text", t);
    } else if (mode === "file") {
      const f = fileInput.files[0];
      if (!f) { alert("Please choose a file"); loading.style.display='none'; return; }
      form.append("file", f);
    } else {
      const u = urlInput.value.trim();
      if (!u) { alert("Please enter URL"); loading.style.display='none'; return; }
      form.append("url", u);
    }

    try {
      const resp = await fetch("/api/process", { method: "POST", body: form });
      if (!resp.ok) {
        const err = await resp.json().catch(()=>null);
        throw new Error(err?.error || resp.statusText || "Server error");
      }
      const j = await resp.json();
      const out = j.output || JSON.stringify(j, null, 2);
      outputArea.innerText = out;

      if (task === "mindmap") {
        // try parse mindmap markdown-like output into tree then render SVG
        const tree = parseMindmapMarkdown(out);
        renderMindmapSVG(tree);
        mindmapWrap.style.display = "block";
      }

    } catch (e) {
      alert("Error: " + (e.message || e));
      outputArea.innerText = "Error: " + (e.message || JSON.stringify(e));
    } finally {
      loading.style.display = "none";
    }
  }

  document.getElementById("generateBtn").addEventListener("click", submit);

  // copy & download
  document.getElementById("copyBtn").addEventListener("click", async () => {
    const t = outputArea.innerText;
    if (!t) return alert("No output to copy");
    await navigator.clipboard.writeText(t);
    alert("Copied to clipboard");
  });
  document.getElementById("downloadBtn").addEventListener("click", () => {
    const t = outputArea.innerText;
    if (!t) return alert("No output to download");
    const blob = new Blob([t], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ai_output.txt";
    a.click();
    a.remove();
  });

  // ----- Mindmap helpers -----
  // parse simple markdown nested list like:
  // - Root
  //   - Child1
  //     - Grandchild
  //   - Child2
  function parseMindmapMarkdown(md) {
    const lines = md.split(/\r?\n/).map(l => l.replace(/\t/g, '    '));
    const root = { text: "Root", children: [] };
    const stack = [{ indent: -1, node: root }];

    for (let raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      // detect list markers -, *, or leading text treated as node
      const m = raw.match(/^(\s*)([-*+]|\d+\\.)?\\s*(.+)$/);
      if (!m) continue;
      const indent = Math.floor(m[1].length / 2);
      const text = m[3].trim();
      const node = { text, children: [] };

      while (stack.length && indent <= stack[stack.length-1].indent) stack.pop();
      stack[stack.length-1].node.children.push(node);
      stack.push({ indent, node });
    }
    // if root has only one child and that is actual root, return that child
    if (root.children.length === 1) return root.children[0];
    return root;
  }

  function renderMindmapSVG(tree) {
    // simple radial layout: convert tree to nodes with positions
    const svgNS = "http://www.w3.org/2000/svg";
    mindmapContainer.innerHTML = "";
    const w = Math.max(800, mindmapContainer.clientWidth || 900);
    const h = 600;
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.style.maxWidth = "100%";

    // flatten with BFS to compute levels
    const levels = [];
    function traverse(node, depth=0) {
      if (!levels[depth]) levels[depth] = [];
      levels[depth].push(node);
      if (node.children && node.children.length) {
        for (const c of node.children) traverse(c, depth+1);
      }
    }
    traverse(tree, 0);

    // position nodes by level
    const padding = 40;
    const colCount = levels.length;
    const colWidth = (w - padding*2) / Math.max(1, colCount-1);
    const nodes = [];
    for (let d=0; d<levels.length; d++) {
      const row = levels[d];
      const yStep = (h - padding*2) / Math.max(1, row.length - 1);
      for (let i=0;i<row.length;i++){
        const node = row[i];
        node.x = padding + d * colWidth;
        node.y = padding + (row.length === 1 ? (h/2) : i * yStep);
        nodes.push(node);
      }
    }

    // draw links: parent to children
    function findParent(child) {
      // parent is the node in previous level whose children includes child
      for (let n of nodes) {
        if (n.children && n.children.includes(child)) return n;
      }
      return null;
    }

    for (let node of nodes) {
      if (node === tree) continue;
      const parent = findParent(node);
      if (parent) {
        const line = document.createElementNS(svgNS, "path");
        const dx = (node.x - parent.x);
        const dy = (node.y - parent.y);
        const mx = parent.x + dx * 0.5;
        const path = `M ${parent.x} ${parent.y} C ${mx} ${parent.y} ${mx} ${node.y} ${node.x} ${node.y}`;
        line.setAttribute("d", path);
        line.setAttribute("stroke", "#c7e0ff");
        line.setAttribute("fill", "none");
        line.setAttribute("stroke-width", "2");
        svg.appendChild(line);
      }
    }

    // draw nodes
    for (let node of nodes) {
      const g = document.createElementNS(svgNS, "g");
      g.setAttribute("transform", `translate(${node.x},${node.y})`);
      // circle
      const r = 44 - Math.min(20, (node.text.length/10));
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("r", r);
      circle.setAttribute("fill", "#fff");
      circle.setAttribute("stroke", "#e6f0ff");
      circle.setAttribute("stroke-width", "2");
      g.appendChild(circle);
      // text
      const t = document.createElementNS(svgNS, "text");
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dy", "0.35em");
      t.setAttribute("font-size", Math.max(10, Math.min(14, 120 / Math.max(6, node.text.length))));
      t.setAttribute("fill", "#0b1321");
      t.textContent = node.text.length > 28 ? node.text.slice(0, 25) + "…" : node.text;
      g.appendChild(t);
      svg.appendChild(g);
    }

    mindmapContainer.appendChild(svg);

    // simple pan & zoom
    let isPanning=false, startX=0, startY=0, viewBox={x:0,y:0,w:w,h:h};
    svg.addEventListener("wheel", e => {
      e.preventDefault();
      const delta = e.deltaY;
      const scale = delta > 0 ? 1.1 : 0.9;
      viewBox.w *= scale;
      viewBox.h *= scale;
      svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    });
    svg.addEventListener("mousedown", e => { isPanning=true; startX=e.clientX; startY=e.clientY; });
    window.addEventListener("mouseup", ()=> isPanning=false);
    window.addEventListener("mousemove", e => {
      if (!isPanning) return;
      const dx = (startX - e.clientX) * (viewBox.w / w);
      const dy = (startY - e.clientY) * (viewBox.h / h);
      viewBox.x += dx; viewBox.y += dy;
      startX = e.clientX; startY = e.clientY;
      svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    });

    // export button
    downloadSvgBtn.onclick = () => {
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(svg);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img,0,0);
        const a = document.createElement("a");
        a.download = "mindmap.png";
        a.href = canvas.toDataURL("image/png");
        a.click();
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
    };
  }

})();
