from io import BytesIO

from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image
import pytesseract


app = Flask(__name__)
CORS(app)


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/ocr", methods=["POST", "OPTIONS"])
def ocr():
    if request.method == "OPTIONS":
        return ("", 204)

    image_file = request.files.get("image")
    language = request.form.get("language", "eng")

    if image_file is None:
        return jsonify({"error": "Missing image file in form-data key 'image'"}), 400

    try:
        image = Image.open(BytesIO(image_file.read()))
        text = pytesseract.image_to_string(image, lang=language)
        return jsonify({"text": text})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
