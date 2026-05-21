# Document Extractor Web App

Complete web app with:
- Click-to-select start and end points
- OCR text extraction from images
- Selection copy to clipboard
- Server-side OCR (Flask + pytesseract) with browser fallback (Tesseract.js)

## 1) Run backend OCR API

Requirements:
- Python 3.10+
- Tesseract OCR engine installed on your OS

Install Python packages:

```bash
cd backend
pip install -r requirements.txt
```

Run API:

```bash
python app.py
```

API runs on `http://127.0.0.1:5000`.

## 2) Run frontend

Serve project root with any static server, then open `index.html`.

Example with Python:

```bash
python -m http.server 8080
```

Open:
- `http://127.0.0.1:8080/index.html`

## OCR behavior

- Frontend tries server OCR first (`/api/ocr`)
- If backend is offline, it falls back to Tesseract.js in browser
