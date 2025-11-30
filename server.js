import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

// ==== FIX CHUẨN ĐƯỜNG DẪN CHO RENDER ====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==== SET STATIC FOLDER ====
app.use(express.static(path.join(__dirname, "public")));

// ==== OPENAI CLIENT ====
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// ==== API CHÍNH ====
app.post("/api/process", async (req, res) => {
    try {
        const { text, task } = req.body;

        if (!text || !task) {
            return res.status(400).json({ error: "Missing text or task" });
        }

        if (!process.env.OPENAI_API_KEY) {
            return res.json({
                output: "Lỗi: OPENAI_API_KEY chưa được cấu hình trên Render environment."
            });
        }

        const prompt = `You are an AI assistant. Perform task "${task}" on the following input:\n\n${text}`;

        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }]
        });

        res.json({ output: completion.choices[0].message.content });

    } catch (err) {
        console.error("API error:", err);
        res.status(500).json({ error: "Server error", detail: err.message });
    }
});

// ==== CHẠY SERVER ====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("=======================================");
    console.log("AI STUDY SERVER IS RUNNING");
    console.log("PORT:", PORT);
    console.log("=======================================");
});
