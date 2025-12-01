document.querySelectorAll("input[name='mode']").forEach(radio => {
    radio.addEventListener("change", () => {
        document.getElementById("inputText").style.display = "none";
        document.getElementById("fileInput").style.display = "none";
        document.getElementById("urlInput").style.display = "none";

        let mode = document.querySelector("input[name='mode']:checked").value;

        if (mode === "text") document.getElementById("inputText").style.display = "block";
        if (mode === "file") document.getElementById("fileInput").style.display = "block";
        if (mode === "url") document.getElementById("urlInput").style.display = "block";
    });
});

document.getElementById("generateBtn").addEventListener("click", async () => {
    const outputType = document.getElementById("outputType").value;
    const processing = document.getElementById("processing");
    const outputBox = document.getElementById("outputBox");
    const mindmapDiv = document.getElementById("mindmap-container");
    const downloadBtn = document.getElementById("downloadBtn");

    outputBox.innerHTML = "";
    mindmapDiv.style.display = "none";
    downloadBtn.style.display = "none";
    processing.style.display = "block";

    let payload = {};
    let mode = document.querySelector("input[name='mode']:checked").value;

    if (mode === "text") payload.text = document.getElementById("inputText").value;
    if (mode === "url") payload.url = document.getElementById("urlInput").value;

    if (mode === "file") {
        let file = document.getElementById("fileInput").files[0];
        let form = new FormData();
        form.append("file", file);
        form.append("type", outputType);

        let res = await fetch("/api/upload", { method: "POST", body: form });
        let data = await res.json();
        processing.style.display = "none";
        return showResult(data, outputType);
    }

    payload.type = outputType;

    const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await res.json();
    processing.style.display = "none";

    showResult(data, outputType);
});

function showResult(data, type) {
    const outputBox = document.getElementById("outputBox");
    const mindmapDiv = document.getElementById("mindmap-container");
    const downloadBtn = document.getElementById("downloadBtn");

    if (type === "mindmap") {
        mindmapDiv.style.display = "block";
        renderMindmap(data.mindmap);
        return;
    }

    outputBox.innerHTML = `<pre>${data.result}</pre>`;
    downloadBtn.style.display = "inline-block";

    downloadBtn.onclick = () => {
        const blob = new Blob([data.result], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "output.txt";
        a.click();
    };
}

// -----------------------
// 🎨 MINDMAP ĐẸP
// -----------------------

function renderMindmap(treeData) {
    const container = document.getElementById("mindmap-container");
    container.innerHTML = "";

    const width = container.clientWidth;
    const height = 600;

    const svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const g = svg.append("g")
        .attr("transform", "translate(60,50)");

    const tree = d3.tree().size([height - 100, width - 200]);
    const root = d3.hierarchy(treeData);
    tree(root);

    const links = root.links();
    const nodes = root.descendants();

    g.selectAll(".link")
        .data(links)
        .enter()
        .append("path")
        .attr("d", d3.linkHorizontal()
            .x(d => d.y)
            .y(d => d.x))
        .attr("stroke", "#7da2ff")
        .attr("stroke-width", 3)
        .attr("opacity", .4)
        .attr("fill", "none");

    const node = g.selectAll(".node")
        .data(nodes)
        .enter()
        .append("g")
        .attr("transform", d => `translate(${d.y}, ${d.x})`);

    node.append("circle")
        .attr("r", 30)
        .attr("fill", "white")
        .attr("stroke", "#3b6cff")
        .attr("stroke-width", 4);

    node.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", 5)
        .style("font-size", "16px")
        .style("font-weight", "600")
        .text(d => d.data.name);
}
