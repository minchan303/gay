// UI refs
const inputModeRadios = document.getElementsByName("inputMode");
const textInput = document.getElementById("textInput");
const fileInput = document.getElementById("fileInput");
const urlInput = document.getElementById("urlInput");
const taskSelect = document.getElementById("taskSelect");
const generateBtn = document.getElementById("generateBtn");
const clearBtn = document.getElementById("clearBtn");
const loadingEl = document.getElementById("loading");
const outputEl = document.getElementById("output");
const mindmapContainer = document.getElementById("mindmapContainer");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const exportMindmapBtn = document.getElementById("exportMindmapBtn");

function setModeUI(mode) {
  textInput.classList.add("hidden");
  fileInput.classList.add("hidden");
  urlInput.classList.add("hidden");
  if (mode === "text") textInput.classList.remove("hidden");
  if (mode === "file") fileInput.classList.remove("hidden");
  if (mode === "url") urlInput.classList.remove("hidden");
}
inputModeRadios.forEach(r => r.addEventListener("change", () => setModeUI(document.querySelector("input[name='inputMode']:checked").value)));
setModeUI("text");

function showLoading() { loadingEl.classList.remove("hidden"); }
function hideLoading() { loadingEl.classList.add("hidden"); }

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function uploadFile(url, formData) {
  const res = await fetch(url, { method: "POST", body: formData });
  return res.json();
}

generateBtn.addEventListener("click", async () => {
  outputEl.innerHTML = "";
  mindmapContainer.innerHTML = "";
  mindmapContainer.classList.add("hidden");
  exportMindmapBtn.classList.add("hidden");
  copyBtn.style.display = "none";
  downloadBtn.style.display = "none";

  const mode = document.querySelector("input[name='inputMode']:checked").value;
  const task = taskSelect.value;

  try {
    showLoading();
    if (mode === "file") {
      const file = fileInput.files[0];
      if (!file) { alert("Chưa chọn file"); hideLoading(); return; }
      const form = new FormData();
      form.append("file", file);
      form.append("task", task);
      // upload endpoint
      const r = await uploadFile("/api/upload", form);
      hideLoading();
      handleServerResult(r, task);
      return;
    }

    if (mode === "url") {
      const url = urlInput.value.trim();
      if (!url) { alert("Chưa nhập URL"); hideLoading(); return; }
      const body = { inputType: "url", url, task };
      const r = await postJSON("/api/process", body);
      hideLoading();
      handleServerResult(r, task);
      return;
    }

    // text
    const text = textInput.value.trim();
    if (!text) { alert("Chưa nhập văn bản"); hideLoading(); return; }
    const body = { inputType: "text", text, task };
    const r = await postJSON("/api/process", body);
    hideLoading();
    handleServerResult(r, task);
  } catch (err) {
    hideLoading();
    console.error(err);
    outputEl.innerHTML = "Error: " + (err.message || JSON.stringify(err));
  }
});

function handleServerResult(r, task) {
  if (!r) { outputEl.innerHTML = "Server returned no data"; return; }
  if (r.error) {
    outputEl.innerHTML = "Error: " + r.error;
    return;
  }

  if (task === "mindmap") {
    if (r.mindmap) {
      outputEl.innerHTML = "";
      renderMindmap(r.mindmap);
      mindmapContainer.classList.remove("hidden");
      exportMindmapBtn.classList.remove("hidden");
      copyBtn.style.display = "none";
      downloadBtn.style.display = "none";
    } else {
      outputEl.innerHTML = "Server did not return mindmap data.";
    }
    return;
  }

  // text result
  const txt = r.text || r.result || "";
  outputEl.innerHTML = `<pre>${escapeHtml(txt)}</pre>`;
  copyBtn.style.display = "inline-block";
  downloadBtn.style.display = "inline-block";

  downloadBtn.onclick = () => {
    const a = document.createElement("a");
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    a.href = URL.createObjectURL(blob);
    a.download = "output.txt";
    a.click();
  };

  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(txt);
      alert("Đã copy");
    } catch {
      alert("Copy failed");
    }
  };
}

function escapeHtml(s) {
  return s.replace(/[&<>"'`]/g, c => ({ '&': '&amp;','<': '&lt;','>': '&gt;','"':'&quot;',"'":'&#39;', '`':'&#96;' }[c]));
}

// ----------- Mindmap render (D3 tree) -----------
function renderMindmap(data) {
  // data: { name, children: [...] }
  mindmapContainer.innerHTML = "";
  const width = mindmapContainer.clientWidth || 900;
  const height = mindmapContainer.clientHeight || 560;

  const svg = d3.select("#mindmapContainer")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g").attr("transform", "translate(40,40)");

  const root = d3.hierarchy(data);
  const treeLayout = d3.tree().size([height - 80, width - 200]);
  treeLayout(root);

  // links
  g.selectAll(".link")
    .data(root.links())
    .enter()
    .append("path")
    .attr("d", d3.linkHorizontal().x(d => d.y).y(d => d.x))
    .attr("fill", "none")
    .attr("stroke", "#cfe2ff")
    .attr("stroke-width", 2);

  const node = g.selectAll(".node")
    .data(root.descendants())
    .enter()
    .append("g")
    .attr("transform", d => `translate(${d.y},${d.x})`);

  node.append("circle")
    .attr("r", 28)
    .attr("fill", "#fff")
    .attr("stroke", "#3b6cff")
    .attr("stroke-width", 2);

  node.append("text")
    .attr("dy", 5)
    .attr("text-anchor", "middle")
    .style("font-size", "13px")
    .style("font-weight", 600)
    .text(d => d.data.name);
}

// export SVG -> PNG
exportMindmapBtn.addEventListener("click", () => {
  const svg = document.querySelector("#mindmapContainer svg");
  if (!svg) return alert("No mindmap to export");
  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement("canvas");
  canvas.width = svg.width.baseVal.value;
  canvas.height = svg.height.baseVal.value;
  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "mindmap.png";
    a.click();
  };
  img.onerror = () => alert("Failed to export");
  img.src = "data:image/svg+xml;base64," + btoa(svgData);
});
