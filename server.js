import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { OpenAI } from "openai";

dotenv.config();
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/api/process", async (req, res) => {
    try {
        const { text, task } = req.body;

        let prompt = "";

        if (task === "mindmap") {
            prompt = `
Convert the following content into a hierarchical JSON mindmap.

REQUIREMENTS:
- Output must be valid JSON only.
- Structure:
{
  "name": "Root",
  "children": [
    { "name": "Main idea", "children": [...] }
  ]
}
- Use short labels.
- No explanation.
- Ensure valid JSON.

CONTENT:
${text}
`;
        } else {
            prompt = `Summarize this text:\n${text}`;
        }

        const completion = await client.responses.create({
            model: "gpt-4.1-mini",
            input: prompt,
        });

        let output = completion.output_text;

        // Clean invalid JSON
        output = output.replace(/```json/g, "").replace(/```/g, "").trim();

        // Attempt to parse JSON
        let json;
        try {
            json = JSON.parse(output);
        } catch (err) {
            // fallback: wrap in root
            json = { name: "Root", children: [{ name: output }] };
        }

        res.json({ mindmap: json });

    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ error: "Processing failed" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SERVER RUNNING on ${PORT}`));
