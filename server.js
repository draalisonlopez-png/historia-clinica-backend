const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const path = require('path');
 
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
 
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
 
// ── TRANSCRIBIR con Whisper ──
app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  try {
    const openaiKey = req.headers['x-openai-key'];
    if (!openaiKey) return res.status(400).json({ error: 'Falta API Key de OpenAI' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo de audio' });
 
    const MAX = 24 * 1024 * 1024; // 24MB por chunk
    const buffer = req.file.buffer;
    const originalName = req.file.originalname || 'audio.m4a';
    const ext = originalName.split('.').pop().toLowerCase();
 
    // Normalizar extensión para Whisper
    const whisperExt = ext || 'm4a';
    const whisperName = `audio.${whisperExt}`;
    const mimeMap = { m4a:'audio/m4a', mp4:'audio/mp4', mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg', webm:'audio/webm' };
