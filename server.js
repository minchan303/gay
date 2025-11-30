const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({limit:"30mb"}));
app.use(express.urlencoded({extended:true}));

const upload = multer({dest:"uploads/"});
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const PORT = process.env.PORT || 3000;

async function extractPDF(fp){ return (await pdfParse(fs.readFileSync(fp))).text; }
async function extractDocx(fp){ return (await mammoth.extractRawText({buffer:fs.readFileSync(fp)})).value; }
async function extractTxt(fp){ return fs.readFileSync(fp,"utf8"); }

async function extractUrl(url){
  const res = await fetch(url);
  const html = await res.text();
  return html.replace(/<[^>]*>/g," ");
}

async function callOpenAI(text){
  const res = await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{
      "Authorization":"Bearer "+OPENAI_KEY,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model:OPENAI_MODEL,
      input:text
    })
  });
  const j = await res.json();
  return j.output_text || JSON.stringify(j);
}

app.post("/api/process",upload.single("file"),async(req,res)=>{
  try{
    let input="";
    if(req.file){
      const ext=req.file.originalname.split(".").pop().toLowerCase();
      if(ext==="pdf") input = await extractPDF(req.file.path);
      else if(ext==="docx") input = await extractDocx(req.file.path);
      else if(ext==="txt") input = await extractTxt(req.file.path);
      else input="";
      fs.unlinkSync(req.file.path);
    }
    if(req.body.text) input=req.body.text;
    if(req.body.url) input=await extractUrl(req.body.url);

    const task = req.body.task || "summary";
    const prompt = `Task: ${task}
Content:
`+input;

    const out = await callOpenAI(prompt);
    res.json({output:out});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

app.use(express.static(path.join(__dirname,"public")));
app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT,()=>console.log("Server running on",PORT));
