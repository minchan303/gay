// ------- MODE SELECTION -------
const modeRadios = document.getElementsByName("mode");
const textInput = document.getElementById("textInput");
const fileInput = document.getElementById("fileInput");
const urlInput = document.getElementById("urlInput");

modeRadios.forEach(r => {
    r.addEventListener("change", () => {
        textInput.classList.add("hidden");
        fileInput.classList.add("hidden");
        urlInput.classList.add("hidden");

        if (r.value === "paste") textInput.classList.remove("hidden");
        if (r.value === "upload") fileInput.classList.remove("hidden");
        if (r.value === "url") urlInput.classList.remove("hidden");
    });
});

document.getElementById("clearBtn").onclick = () => {
    textInput.value = "";
    urlInput.value = "";
    document.getElementById("output").innerHTML = "";
    document.getElementById("mindmapContainer").innerHTML = "";
};

// ========== CALL SERVER ==========
async function callAPI(text, task) {
    const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, task })
    });
    return res.json();
}

// ========== MAIN BUTTON ==========
document.getElementById("generateBtn").onclick = async () => {

    let content = "";

    if (modeRadios[0].checked) content = textInput.value;
    if (modeRadios[1].checked) {
        const file = fileInput.files[0];
        content = await file.text();
    }
    if (modeRadios[2].checked) content = urlInput.value;

    if (!content.trim()) return alert("Chưa có dữ liệu!");

    const task = document.getElementById("taskMenu").value;

    const result = await callAPI(content, task);

    if (task === "mindmap") {
        document.getElementById("output").innerHTML = "";
        renderMindmap(result);
        document.getElementById("exportMindmapBtn").classList.remove("hidden");
    } else {
        document.getElementById("mindmapContainer").innerHTML = "";
        document.getElementById("exportMindmapBtn").classList.add("hidden");
        document.getElementById("output").innerHTML = `<pre>${result}</pre>`;
    }
};

// ======================
//    BEAUTIFUL MINDMAP
// ======================
function renderMindmap(data) {
    const container = document.getElementById("mindmapContainer");
    container.innerHTML = "";

    const width = container.offsetWidth;
    const height = 600;

    const svg = d3.select("#mindmapContainer")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const g = svg.append("g").attr("transform", "translate(40,40)");

    const root = d3.hierarchy(data);
    const treeLayout = d3.tree().size([height - 80, width - 200]);
    treeLayout(root);

    // Links
    g.selectAll(".link")
        .data(root.links())
        .enter()
        .append("path")
        .attr("fill", "none")
        .attr("stroke", "#cdd8ff")
        .attr("stroke-width", 2)
        .attr("d", d3.linkHorizontal()
            .x(d => d.y)
            .y(d => d.x)
        );

    // Nodes
    const node = g.selectAll(".node")
        .data(root.descendants())
        .enter()
        .append("g")
        .attr("transform", d => `translate(${d.y},${d.x})`);

    node.append("circle")
        .attr("r", 26)
        .attr("fill", "#eef3ff")
        .attr("stroke", "#4c6aff")
        .attr("stroke-width", 2);

    node.append("text")
        .attr("dy", 5)
        .attr("text-anchor", "middle")
        .style("font-size", "13px")
        .style("font-weight", "500")
        .text(d => d.data.name);
}

// EXPORT PNG
document.getElementById("exportMindmapBtn").onclick = () => {
    const svg = document.querySelector("#mindmapContainer svg");
    const svgData = new XMLSerializer().serializeToString(svg);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    canvas.width = svg.width.baseVal.value;
    canvas.height = svg.height.baseVal.value;

    img.onload = () => {
        ctx.drawImage(img, 0, 0);
        const a = document.createElement("a");
        a.download = "mindmap.png";
        a.href = canvas.toDataURL("image/png");
        a.click();
    };

    img.src = "data:image/svg+xml;base64," + btoa(svgData);
};
