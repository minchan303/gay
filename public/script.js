/* public/script.js
   Full frontend logic:
   - handle input modes (text / file / url)
   - call /api/process with FormData
   - handle outputs for tasks: summary, bullet, flashcards, qa, mindmap
   - render mindmap (D3 v7) with improved spacing, zoom/pan, export PNG
   - copy & download features
*/

(() => {
  // Elements
  const modeRadios = document.querySelectorAll('input[name="mode"]');
  const inputText = document.getElementById("inputText");
  const inputFile = document.getElementById("inputFile");
  const inputUrl = document.getElementById("inputUrl");
  const taskSelect = document.getElementById("taskSelect");
  const generateBtn = document.getElementById("generateBtn");
  const outputText = document.getElementById("outputText");
  const mindmapContainer = document.getElementById("mindmapContainer");
  const downloadBtn = document.getElementById("downloadBtn");

  // UI state toggles
  function updateInputVisibility() {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    if (mode === "text") {
      inputText.classList.remove("hidden");
      inputFile.classList.add("hidden");
      inputUrl.classList.add("hidden");
    } else if (mode === "file") {
      inputText.classList.add("hidden");
      inputFile.classList.remove("hidden");
      inputUrl.classList.add("hidden");
    } else {
      inputText.classList.add("hidden");
      inputFile.classList.add("hidden");
      inputUrl.classList.remove("hidden");
    }
  }

  modeRadios.forEach(r => r.addEventListener("change", updateInputVisibility));
  updateInputVisibility();

  // Utility: show message in output area
  function setOutput(text) {
    outputText.innerText = text || "";
  }

  // Utility: safe JSON parsing (extract first JSON block)
  function tryParseJSON(raw) {
    if (!raw || typeof raw !== "string") return null;
    raw = raw.trim();
    // remove code fences
    raw = raw.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
      return JSON.parse(raw);
    } catch (e) {
      // try to locate first { ... } or [ ... ]
      const objMatch = raw.match(/(\{[\s\S]*\})/m);
      const arrMatch = raw.match(/(\[[\s\S]*\])/m);
      const candidate = objMatch ? objMatch[0] : (arrMatch ? arrMatch[0] : null);
      if (!candidate) return null;
      try { return JSON.parse(candidate); } catch (e2) { return null; }
    }
  }

  // Generate: call server
  generateBtn.addEventListener("click", async () => {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const task = taskSelect.value;

    setOutput("");
    mindmapContainer.innerHTML = "";

    const form = new FormData();
    form.append("task", task);

    if (mode === "text") {
      const t = inputText.value && inputText.value.trim();
      if (!t) { alert("Please enter text."); return; }
      form.append("text", t);
    } else if (mode === "url") {
      const u = inputUrl.value && inputUrl.value.trim();
      if (!u) { alert("Please enter a URL."); return; }
      form.append("url", u);
    } else {
      const f = inputFile.files && inputFile.files[0];
      if (!f) { alert("Please choose a file."); return; }
      form.append("file", f);
    }

    generateBtn.disabled = true;
    generateBtn.innerText = "Processing…";

    try {
      const resp = await fetch("/api/process", { method: "POST", body: form });
      if (!resp.ok) {
        const txt = await resp.text().catch(()=>null);
        throw new Error(txt || `Server error ${resp.status}`);
      }
      const j = await resp.json().catch(async () => {
        const raw = await resp.text().catch(()=>"");
        return { output: raw };
      });

      // Try multiple response shapes:
      // 1) { ok:true, mindmap: {...}, raw: "..." }
      // 2) { ok:true, data: [...], raw: "..." } (flashcards/qa)
      // 3) { output: "..." } (summary/bullet)
      // 4) older designs: { output: "...", raw: "..." }
      if (task === "mindmap") {
        let tree = j.mindmap || j.data || j.output || j.raw || null;
        if (!tree) {
          // attempt parse from output/raw
          const candidate = tryParseJSON(j.output || j.raw || "");
          if (candidate) tree = candidate;
        }
        // If still string, treat as fallback -> wrap text
        if (!tree || typeof tree === "string") {
          tree = { name: "Root", children: [{ name: (j.raw || j.output || "").slice(0, 300) || "Content" }]};
        }
        setOutput(j.raw || j.output || JSON.stringify(tree, null, 2));
        renderMindmap(tree);
      } else if (task === "flashcards" || task === "qa") {
        // prefer structured data
        const parsed = j.data || tryParseJSON(j.raw || j.output || "");
        if (parsed) {
          // pretty print
          setOutput(JSON.stringify(parsed, null, 2));
        } else {
          setOutput(j.raw || j.output || "No structured JSON returned.");
        }
      } else {
        // summary/bullet
        const text = j.output || j.raw || j;
        setOutput(typeof text === "string" ? text : JSON.stringify(text, null, 2));
      }

    } catch (err) {
      console.error("Generate error:", err);
      setOutput("Error: " + (err.message || err));
    } finally {
      generateBtn.disabled = false;
      generateBtn.innerText = "Generate";
    }
  });

  // Download output as TXT
  downloadBtn.addEventListener("click", () => {
    const text = outputText.innerText || "";
    if (!text) { alert("No output to download."); return; }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ai_output.txt";
    a.click();
    a.remove();
  });

  // ---------------- MINDMAP RENDERING (IMPROVED SPACING) ----------------
  // Uses D3 v7 (page should load D3 via <script> in HTML)
  function renderMindmap(treeData) {
    // Accept treeData as object (name + children)
    if (!treeData) return;
    mindmapContainer.innerHTML = "";

    // Defensive: if treeData is JSON with root string 'Root' and children string, ok.
    // compute sizes
    const nodesCount = countNodes(treeData);
    const width = Math.max(1100, mindmapContainer.clientWidth || 1100);
    const height = Math.max(700, nodesCount * 60 + 240);

    const svg = d3.create("svg")
      .attr("width", width)
      .attr("height", height)
      .style("background", "#ffffff");

    // group where nodes & links live (we will zoom this)
    const g = svg.append("g").attr("transform", "translate(40,20)");

    // layout
    const root = d3.hierarchy(treeData);
    // Larger spacing: vertical spacing (x) and horizontal spacing (y)
    // nodeSize: [verticalSpacing, horizontalSpacing]
    const verticalSpacing = 100; // row spacing
    const horizontalSpacing = 240; // column spacing
    const treeLayout = d3.tree().nodeSize([verticalSpacing, horizontalSpacing]);
    treeLayout(root);

    // center vertically by computing minX & maxX
    const minX = d3.min(root.descendants(), d => d.x);
    const maxX = d3.max(root.descendants(), d => d.x);
    const totalHeight = maxX - minX + 200;
    const yOffset = (height - totalHeight) / 2 - minX; // shift to center

    // defs for shadow
    const defs = svg.append("defs");
    const filter = defs.append("filter").attr("id", "drop-shadow").attr("height", "160%");
    filter.append("feGaussianBlur").attr("in", "SourceAlpha").attr("stdDeviation", 3).attr("result", "blur");
    filter.append("feOffset").attr("in", "blur").attr("dx", 0).attr("dy", 2).attr("result", "offsetBlur");
    const fm = filter.append("feMerge");
    fm.append("feMergeNode").attr("in", "offsetBlur");
    fm.append("feMergeNode").attr("in", "SourceGraphic");

    // links: curved paths with smooth stroke
    g.append("g")
      .attr("class", "links")
      .selectAll("path")
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
      .attr("fill", "none")
      .attr("stroke", "#cfe6ff")
      .attr("stroke-width", 3)
      .attr("opacity", 0.95);

    // nodes
    const nodeGroup = g.append("g").attr("class", "nodes");
    const nodes = nodeGroup.selectAll("g.node")
      .data(root.descendants())
      .join("g")
      .attr("class", "node")
      .attr("transform", d => `translate(${d.y},${d.x + yOffset})`);

    // dynamic radius based on label length but bounded
    nodes.append("circle")
      .attr("r", d => {
        const len = (d.data && d.data.name) ? String(d.data.name).length : 6;
        // base radius influenced by label length
        const r = Math.max(32, Math.min(46, 160 / Math.max(6, len)));
        return r;
      })
      .attr("fill", "#ffffff")
      .attr("stroke", "#2563eb")
      .attr("stroke-width", 2)
      .attr("filter", "url(#drop-shadow)");

    // labels using foreignObject to allow wrapping and styling
    nodes.append("foreignObject")
      .attr("x", -100)
      .attr("y", d => -28)
      .attr("width", 200)
      .attr("height", 56)
      .append("xhtml:div")
      .style("font", "600 14px/1.1 'Inter', sans-serif")
      .style("text-align", "center")
      .style("color", "#0b1a2b")
      .style("word-wrap", "break-word")
      .style("pointer-events", "none")
      .html(d => escapeHtml(d.data && d.data.name ? d.data.name : ""));

    // append to DOM
    mindmapContainer.appendChild(svg.node());

    // zoom & pan
    const zoom = d3.zoom().scaleExtent([0.45, 2.4]).on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
    d3.select(svg.node()).call(zoom);

    // initial transform: center the root on left, scale to fit
    // compute desired translate to show root with some margin
    const initialScale = Math.min(1.2, Math.max(0.6, (mindmapContainer.clientWidth - 160) / (root.height * horizontalSpacing + 600)));
    const initialX = 60;
    const initialY = (height / 2) - (root.x + yOffset);
    d3.select(svg.node()).call(zoom.transform, d3.zoomIdentity.translate(initialX, initialY).scale(initialScale));
  }

  function countNodes(node) {
    if (!node) return 0;
    let cnt = 1;
    if (node.children && node.children.length) {
      node.children.forEach(c => cnt += countNodes(c));
    }
    return cnt;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");
  }

  // Export current mindmap SVG -> PNG (higher DPI)
  function exportMindmapPNG() {
    const svg = mindmapContainer.querySelector("svg");
    if (!svg) { alert("No mindmap to export."); return; }
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const rect = svg.getBoundingClientRect();
    const w = Math.max(800, Math.round(rect.width));
    const h = Math.max(600, Math.round(rect.height));
    const canvas = document.createElement("canvas");
    canvas.width = w * 2; // 2x for better DPI
    canvas.height = h * 2;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement("a");
      a.download = "mindmap.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
      a.remove();
    };
    img.onerror = (e) => {
      alert("Failed to export image: " + e);
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  }

  // Add a small export button inside page (or bind to existing)
  // If you want to use a dedicated button, create it and call exportMindmapPNG()
  // For convenience we attach ctrl+e (or command+e) to export when mindmap exists
  document.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "e") {
      try { exportMindmapPNG(); } catch (e) {}
    }
  });

  // If page includes a dedicated export button with id 'exportMindmapBtn', bind it
  const exportBtn = document.getElementById("exportMindmapBtn");
  if (exportBtn) exportBtn.addEventListener("click", exportMindmapPNG);

  // Optionally: if you want a UI control to copy output text to clipboard
  const copyBtn = document.getElementById("copyOutputBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(outputText.innerText || "");
        alert("Copied output to clipboard.");
      } catch (e) {
        alert("Copy failed.");
      }
    });
  }

  // Expose some functions for debugging if needed
  window.__aiStudy = {
    renderMindmap,
    exportMindmapPNG
  };

})();
