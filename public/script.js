// public/script.js
(() => {
  const modeRadios = document.querySelectorAll('input[name="mode"]');
  const textBox = document.getElementById("textBox");
  const fileBox = document.getElementById("fileBox");
  const urlBox = document.getElementById("urlBox");
  const textInput = document.getElementById("textInput");
  const fileInput = document.getElementById("fileInput");
  const urlInput = document.getElementById("urlInput");
  const taskSelect = document.getElementById("taskSelect");
  const generateBtn = document.getElementById("generateBtn");
  const clearBtn = document.getElementById("clearBtn");
  const loadingEl = document.getElementById("loading");
  const outputArea = document.getElementById("outputArea");
  const mindmapWrap = document.getElementById("mindmapWrap");
  const mindmapContainer = document.getElementById("mindmapContainer");
  const copyBtn = document.getElementById("copyBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const exportMindmapBtn = document.getElementById("exportMindmapBtn");

  modeRadios.forEach(r => r.addEventListener("change", () => {
    const m = document.querySelector('input[name="mode"]:checked').value;
    textBox.style.display = m === "text" ? "block" : "none";
    fileBox.style.display = m === "file" ? "block" : "none";
    urlBox.style.display = m === "url" ? "block" : "none";
  }));

  clearBtn.addEventListener("click", () => {
    textInput.value = "";
    urlInput.value = "";
    if (fileInput) fileInput.value = null;
    outputArea.innerText = "";
    mindmapContainer.innerHTML = "";
    mindmapWrap.style.display = "none";
  });

  copyBtn.addEventListener("click", async () => {
    const t = outputArea.innerText;
    if (!t) return alert("No output to copy");
    await navigator.clipboard.writeText(t);
    alert("Copied to clipboard");
  });

  downloadBtn.addEventListener("click", () => {
    const t = outputArea.innerText;
    if (!t) return alert("No output to download");
    const blob = new Blob([t], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ai_output.txt";
    a.click();
    a.remove();
  });

  generateBtn.addEventListener("click", async () => {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const task = taskSelect.value;
    loadingEl.style.display = "block";
    outputArea.innerText = "";
    mindmapContainer.innerHTML = "";
    mindmapWrap.style.display = "none";

    const form = new FormData();
    form.append("task", task);

    if (mode === "text") {
      const t = textInput.value.trim();
      if (!t) { alert("Please enter text"); loadingEl.style.display="none"; return; }
      form.append("text", t);
    } else if (mode === "url") {
      const u = urlInput.value.trim();
      if (!u) { alert("Please enter URL"); loadingEl.style.display="none"; return; }
      form.append("url", u);
    } else {
      const f = fileInput.files[0];
      if (!f) { alert("Please choose a file"); loadingEl.style.display="none"; return; }
      form.append("file", f);
    }

    try {
      const resp = await fetch("/api/process", { method: "POST", body: form });
      if (!resp.ok) {
        const err = await resp.json().catch(()=>null);
        throw new Error(err?.error || resp.statusText || "Server error");
      }
      const j = await resp.json();

      if (task === "mindmap") {
        const tree = j.mindmap || { name: "Root", children: [] };
        outputArea.innerText = j.raw || JSON.stringify(tree, null, 2);
        renderMindmap(tree);
        mindmapWrap.style.display = "block";
      } else if (task === "flashcards" || task === "qa") {
        outputArea.innerText = JSON.stringify(j.data || j.raw || [], null, 2);
      } else {
        outputArea.innerText = j.output || j.raw || "No output returned";
      }

    } catch (e) {
      alert("Error: " + e.message);
      outputArea.innerText = "Error: " + (e.message || JSON.stringify(e));
    } finally {
      loadingEl.style.display = "none";
    }
  });

  // ----------------- Mindmap rendering (improved visuals) -----------------
  // Render tree left->right with nicer nodes, wrapped labels, curved links, zoom/pan
  function renderMindmap(treeData) {
    mindmapContainer.innerHTML = "";
    const width = Math.max(900, mindmapContainer.clientWidth || 900);
    const height = Math.max(520, treeData.children ? 120 + (countNodes(treeData) * 8) : 520);

    const svg = d3.create("svg").attr("width", width).attr("height", height).style("background", "#fff");
    const g = svg.append("g").attr("transform", "translate(40,20)");

    const root = d3.hierarchy(treeData);
    const treeLayout = d3.tree().nodeSize([80, 180]); // row spacing, col spacing
    treeLayout(root);

    // adjust extents -> center vertically
    const minX = d3.min(root.descendants(), d => d.x);
    const maxX = d3.max(root.descendants(), d => d.x);
    const heightNeeded = maxX - minX + 120;
    const yOffset = Math.max(0, (height - heightNeeded) / 2 - minX);
    // links (curved)
    const linkGroup = g.append("g").attr("class", "links");
    linkGroup.selectAll("path")
      .data(root.links())
      .join("path")
      .attr("d", d => {
        const sx = d.source.y;
        const sy = d.source.x + yOffset;
        const tx = d.target.y;
        const ty = d.target.x + yOffset;
        const mx = (sx + tx) / 2;
        return `M${sx},${sy} C ${mx},${sy} ${mx},${ty} ${tx},${ty}`;
      })
      .attr("stroke", "#cfe6ff")
      .attr("stroke-width", 2.4)
      .attr("fill", "none");

    // nodes
    const nodeGroup = g.append("g").attr("class", "nodes");
    const nodes = nodeGroup.selectAll("g.node")
      .data(root.descendants())
      .join("g")
      .attr("class", "node")
      .attr("transform", d => `translate(${d.y},${d.x + yOffset})`);

    // drop shadow
    const defs = svg.append("defs");
    const filter = defs.append("filter").attr("id", "dropshadow").attr("height","130%");
    filter.append("feGaussianBlur").attr("in","SourceAlpha").attr("stdDeviation","3").attr("result","blur");
    filter.append("feOffset").attr("in","blur").attr("dx","0").attr("dy","2").attr("result","offsetBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in","offsetBlur");
    feMerge.append("feMergeNode").attr("in","SourceGraphic");

    nodes.append("circle")
      .attr("r", d => Math.max(26, Math.min(36, 120 / Math.max(6, d.data.name.length))))
      .attr("fill", "#ffffff")
      .attr("stroke", "#2b6cb0")
      .attr("stroke-width", 2)
      .attr("filter", "url(#dropshadow)");

    // text: use foreignObject for wrapping (more flexible)
    nodes.append("foreignObject")
      .attr("x", -80)
      .attr("y", d => -24)
      .attr("width", 160)
      .attr("height", 48)
      .append("xhtml:div")
      .style("font", "13px 'Inter', sans-serif")
      .style("text-align", "center")
      .style("color", "#0b1a2b")
      .style("pointer-events", "none")
      .html(d => escapeHtml(d.data.name));

    mindmapContainer.appendChild(svg.node());

    // zoom/pan
    const zoom = d3.zoom().scaleExtent([0.4, 2]).on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
    d3.select(svg.node()).call(zoom);

    // center & initial scale
    const initialScale = Math.min(1.1, Math.max(0.6, Math.min((mindmapContainer.clientWidth - 100) / (root.height * 180 + 300), 1.1)));
    const initialX = 20;
    const initialY = (mindmapContainer.clientHeight / 2) - (root.x || 0);
    d3.select(svg.node()).call(zoom.transform, d3.zoomIdentity.translate(initialX, initialY).scale(initialScale));
  }

  function countNodes(node) {
    if (!node) return 0;
    let c = 1;
    if (node.children) for (const ch of node.children) c += countNodes(ch);
    return c;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  // export mindmap as PNG
  exportMindmapBtn.addEventListener("click", () => {
    const svg = mindmapContainer.querySelector("svg");
    if (!svg) return alert("No mindmap to export.");
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const canvas = document.createElement("canvas");
    const rect = svg.getBoundingClientRect();
    canvas.width = rect.width * 2; // higher DPI
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement("a");
      a.download = "mindmap.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  });

})();
