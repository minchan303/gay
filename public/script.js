document.getElementById("generate").addEventListener("click", async () => {
    const text = document.getElementById("inputText").value.trim();
    const task = document.getElementById("task").value;

    if (!text) {
        alert("Please enter text.");
        return;
    }

    try {
        const res = await fetch("/api/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, task })
        });

        const data = await res.json();
        document.getElementById("output").textContent =
            data.output || "No output returned.";
    } catch (err) {
        document.getElementById("output").textContent =
            "Error calling API: " + err.message;
    }
});
entById('outputArea').innerText; if(!t) return alert('No output'); const blob=new Blob([t],{type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='ai_output.txt'; document.body.appendChild(a); a.click(); a.remove(); }
