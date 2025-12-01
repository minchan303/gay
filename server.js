import express from "express";
import multer from "multer";
import cors from "cors";
import fetch from "node-fetch";
import pdfParse from "pdf-parse";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const upload = multer();

// ======== CONFIG ==========
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-4o-mini"; // model rẻ nhất

// ======== HELPERS ========
function chunkText(text, size = 1800) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

async function callOpenAI(prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 1200
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ============ MAIN API =============
app.post("/process", upload.single("file"), async (req, res) => {
  try {
    const mode = req.body.mode;
    let inputText = "";

    // === Input: Raw text ===
    if (req.body.inputType === "text") {
      inputText = req.body.text || "";
    }

    // === Input: PDF Upload ===
    if (req.body.inputType === "file" && req.file) {
      const pdfData = await pdfParse(req.file.buffer);
      inputText = pdfData.text;
    }

    // === Input: URL ===
    if (req.body.inputType === "url") {
      const html = await fetch(req.body.url).then(r => r.text());
      inputText = html.replace(/<[^>]*>?/gm, " ");
    }

    if (!inputText.trim()) {
      return res.json({ error: "Empty text" });
    }

    // CHUNKING — reduce token consumption
    const chunks = chunkText(inputText);
    const miniSummaries = [];

    for (let chunk of chunks) {
      const small = await callOpenAI(
        `Tóm tắt ngắn nhất có thể đoạn sau:\n\n${chunk}\n\n---\nChỉ trả về nội dung tóm tắt.`
      );
      miniSummaries.push(small);
    }

    const merged = miniSummaries.join("\n");

    let finalResult = "";

    // ===== MODES =====
    if (mode === "summary") {
      finalResult = await callOpenAI(
        `Tóm tắt toàn bộ nội dung sau một cách rõ ràng:\n\n${merged}`
      );
    }

    if (mode === "mindmap") {
      finalResult = await callOpenAI(
        `Hãy chuyển nội dung sau thành JSON Mindmap dạng cây:

{
 "root": "Chủ đề",
 "children": [
   { "text": "", "children": [] }
 ]
}

Nội dung:\n\n${merged}`
      );
    }

    if (mode === "flashcards") {
      finalResult = await callOpenAI(
        `Tạo flashcards dạng Q&A từ nội dung sau:

Format:
Q: ...
A: ...

Nội dung:\n\n${merged}`
      );
    }

    if (mode === "qa") {
      finalResult = await callOpenAI(
        `Trích xuất các câu hỏi quan trọng + câu trả lời từ nội dung sau:\n\n${merged}`
      );
    }

    res.json({ result: finalResult });

 } catch (err) {
  console.error("PDF / Processing Error:", err);
  res.json({ error: "Server error: " + err.message });
}

});

// ============ START SERVER ============
app.listen(3000, () => console.log("Server running on port 3000"));
