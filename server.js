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
    const whisperExt = ext === 'm4a' ? 'mp4' : (ext || 'mp4');
    const whisperName = `audio.${whisperExt}`;
    const mimeMap = { m4a:'audio/mp4', mp4:'audio/mp4', mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg', webm:'audio/webm' };
    const mime = mimeMap[ext] || req.file.mimetype || 'audio/mp4';

    let fullTranscript = '';

    if (buffer.length <= MAX) {
      // Audio pequeño — enviar directo
      fullTranscript = await whisperRequest(buffer, whisperName, mime, openaiKey);
    } else {
      // Audio grande — dividir en chunks
      let offset = 0;
      let partNum = 0;
      while (offset < buffer.length) {
        const chunk = buffer.slice(offset, offset + MAX);
        const part = await whisperRequest(chunk, `chunk_${partNum}.${whisperExt}`, mime, openaiKey);
        fullTranscript += (partNum > 0 ? ' ' : '') + part;
        offset += MAX;
        partNum++;
      }
    }

    res.json({ transcript: fullTranscript });
  } catch (e) {
    console.error('Transcribe error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

async function whisperRequest(buffer, filename, mime, key) {
  const form = new FormData();
  form.append('file', buffer, { filename, contentType: mime });
  form.append('model', 'whisper-1');
  form.append('language', 'es');
  form.append('response_format', 'text');

  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, ...form.getHeaders() },
    body: form
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error('Whisper: ' + txt);
  }
  return await r.text();
}

// ── GENERAR DOCUMENTOS con Claude ──
app.post('/api/generate', async (req, res) => {
  try {
    const anthropicKey = req.headers['x-anthropic-key'];
    if (!anthropicKey) return res.status(400).json({ error: 'Falta API Key de Anthropic' });

    const { system, user } = req.body;
    if (!system || !user) return res.status(400).json({ error: 'Faltan parámetros' });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: user }]
      })
    });

    if (!r.ok) {
      const txt = await r.text();
      throw new Error('Claude: ' + txt);
    }

    const data = await r.json();
    res.json({ text: data.content[0].text });
  } catch (e) {
    console.error('Generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Servir frontend ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
