// server.js
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import OpenAI from "openai";
import os from "os";

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true }));

// static public
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, "public")));

// openai client
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// helper: extract pdf/docx/txt
async function extractFileText(filePath, originalName) {
  const ext = (originalName || "").split(".").pop().toLowerCase();
  if (ext === "pdf") {
    const data = fs.readFileSync(filePath);
    const parsed = await pdfParse(data);
    return parsed.text || "";
  }
  if (ext === "docx") {
    const buffer = fs.readFileSync(filePath);
    const res = await mammoth.extractRawText({ buffer });
    return res.value || "";
  }
  if (ext === "txt") {
    return fs.readFileSync(filePath, "utf8");
  }
  // images: return empty (we could attach base64)
  return "";
}

async function fetchUrlText(url) {
  const resp = await fetch(url, { timeout: 15000 });
  const html = await resp.text();
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const selectors = ["article", "main", "[role=main]", "#content", ".article", ".entry-content", ".post"];
  for (const s of selectors) {
    const el = doc.querySelector(s);
    if (el && el.textContent && el.textContent.trim().length > 200) return el.textContent.trim();
  }
  return doc.body ? doc.body.textContent.trim() : "";
}

app.post("/api/process", upload.single("file"), async (req, res) => {
  try {
    let inputText = "";
    const task = (req.body.task || "summary").toLowerCase();

    // if file uploaded
    if (req.file) {
      inputText = await extractFileText(req.file.path, req.file.originalname);
      // cleanup temp
      fs.unlink(req.file.path, () => {});
    }

    // url
    if (!inputText && req.body.url) {
      try {
        inputText = await fetchUrlText(req.body.url);
      } catch (e) {
        console.error("fetchUrlText error:", e.message);
      }
    }

    // raw text
    if (!inputText && req.body.text) inputText = req.body.text;

    if (!inputText) return res.status(400).json({ error: "No input found. Upload file or provide text/URL." });

    if (!OPENAI_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY not set on server." });
    }

    let instruction = "";
    if (task === "mindmap") instruction = "Generate a hierarchical mindmap in Markdown nested lists.";
    else if (task === "bullet") instruction = "Generate clear bullet points.";
    else if (task === "flashcards") instruction = "Create up to 12 flashcards in JSON [{q:'',a:''}].";
    else if (task === "qa") instruction = "Create 8 short Q&A pairs.";
    else instruction = "Summarize the content into concise study notes.";

    const prompt = `You are an expert study assistant.\n${instruction}\n\nContent:\n${inputText}`;

    // Use Responses API endpoint via openai client
    const resp = await openai.responses.create({
      model: OPENAI_MODEL,
      input: prompt
    });

    // try to parse response
    let output = "";
    if (resp.output_text) output = resp.output_text;
    else if (resp.output && Array.isArray(resp.output)) {
      // gather textual pieces
      for (const o of resp.output) {
        if (o.type === "message" && o.content) {
          for (const c of o.content) {
            if (c.type === "output_text" && c.text) output += c.text;
          }
        }
      }
    } else {
      output = JSON.stringify(resp);
    }

    res.json({ ok: true, output });
  } catch (err) {
    console.error("server error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

// serve index.html as fallback
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${PORT}`);
});
