function createDocumentExtractor(options) {
  const config = {
    rootSelector: "#documentRoot",
    statusSelector: "#status",
    copyButtonSelector: "#copySelectionBtn",
    a4PreviewToggleSelector: "#a4PreviewToggle",
    zoomRangeSelector: "#zoomRange",
    pageNumberSelector: "#pageNumber",
    selectedPreviewSelector: "#selectedTextPreview",
    textInputSelector: "#textInput",
    documentFileInputSelector: "#documentFileInput",
    openDocumentButtonSelector: "#openDocumentBtn",
    imageInputSelector: "#imageInput",
    replaceTextButtonSelector: "#replaceTextBtn",
    appendTextButtonSelector: "#appendTextBtn",
    runOcrButtonSelector: "#runOcrBtn",
    resetSelectionButtonSelector: "#resetSelectionBtn",
    clearDocumentButtonSelector: "#clearDocBtn",
    backendStatusSelector: "#backendStatus",
    imageSelector: "img[data-ocr-source='true']",
    ocrLanguage: "eng",
    ocrApiUrl: "http://127.0.0.1:5000/api/ocr",
    ocrHealthUrl: "http://127.0.0.1:5000/api/health",
    preferServerOCR: true,
    enableShortcut: true,
    ...options,
  };

  const documentRoot = document.querySelector(config.rootSelector);
  const statusEl = document.querySelector(config.statusSelector);
  const copySelectionBtn = document.querySelector(config.copyButtonSelector);
  const a4PreviewToggle = document.querySelector(config.a4PreviewToggleSelector);
  const zoomRange = document.querySelector(config.zoomRangeSelector);
  const pageNumberEl = document.querySelector(config.pageNumberSelector);
  const selectedPreviewEl = document.querySelector(config.selectedPreviewSelector);
  const textInput = document.querySelector(config.textInputSelector);
  const documentFileInput = document.querySelector(config.documentFileInputSelector);
  const openDocumentBtn = document.querySelector(config.openDocumentButtonSelector);
  const imageInput = document.querySelector(config.imageInputSelector);
  const replaceTextBtn = document.querySelector(config.replaceTextButtonSelector);
  const appendTextBtn = document.querySelector(config.appendTextButtonSelector);
  const runOcrBtn = document.querySelector(config.runOcrButtonSelector);
  const resetSelectionBtn = document.querySelector(config.resetSelectionButtonSelector);
  const clearDocBtn = document.querySelector(config.clearDocumentButtonSelector);
  const backendStatusEl = document.querySelector(config.backendStatusSelector);

  if (
    !documentRoot ||
    !statusEl ||
    !copySelectionBtn ||
    !a4PreviewToggle ||
    !zoomRange ||
    !pageNumberEl ||
    !selectedPreviewEl ||
    !textInput ||
    !documentFileInput ||
    !openDocumentBtn ||
    !imageInput ||
    !replaceTextBtn ||
    !appendTextBtn ||
    !runOcrBtn ||
    !resetSelectionBtn ||
    !clearDocBtn ||
    !backendStatusEl
  ) {
    throw new Error("Document extractor setup failed: required DOM element not found.");
  }

  const selectionState = {
    start: null,
    end: null,
    clickCount: 0,
  };

  function updateStatus(message) {
    statusEl.textContent = `Status: ${message}`;
  }

  function setButtonState() {
    copySelectionBtn.disabled = !(selectionState.start && selectionState.end);
  }

  function getApproxPageHeightPx() {
    if (documentRoot.classList.contains("a4-preview")) {
      return 1123;
    }
    return Math.max(window.innerHeight * 0.9, 780);
  }

  function updatePageNumber() {
    const zoomValue = Number(zoomRange.value) || 100;
    const scaledHeight = documentRoot.scrollHeight * (zoomValue / 100);
    const approxPageHeight = getApproxPageHeightPx();
    const totalPages = Math.max(1, Math.ceil(scaledHeight / approxPageHeight));

    const rect = documentRoot.getBoundingClientRect();
    const docTop = window.scrollY + rect.top;
    const viewportAnchor = window.scrollY + window.innerHeight * 0.4;
    const relative = Math.max(0, viewportAnchor - docTop);
    const currentPage = Math.min(totalPages, Math.max(1, Math.floor(relative / approxPageHeight) + 1));

    pageNumberEl.textContent = `Page ${currentPage} / ${totalPages}`;
  }

  function applyZoom() {
    const zoomValue = Number(zoomRange.value) || 100;
    documentRoot.style.transform = `scale(${zoomValue / 100})`;
    documentRoot.style.transformOrigin = "top center";
    updatePageNumber();
  }

  function handleA4PreviewToggle() {
    documentRoot.classList.toggle("a4-preview", a4PreviewToggle.checked);
    updateStatus(a4PreviewToggle.checked ? "A4 preview enabled." : "A4 preview disabled.");
    updatePageNumber();
  }

  function setBackendStatus(text, isOnline) {
    backendStatusEl.textContent = text;
    backendStatusEl.dataset.online = String(isOnline);
  }

  function updatePreview(text) {
    selectedPreviewEl.textContent = text || "No selection yet.";
  }

  function clearSelection() {
    selectionState.start = null;
    selectionState.end = null;
    selectionState.clickCount = 0;
    window.getSelection().removeAllRanges();
    setButtonState();
    updatePreview("");
    updateStatus("Selection reset. Click to set start point.");
  }

  function normalizeOCRText(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  async function extractWithServerOCRBlob(imageBlob, filename) {
    const formData = new FormData();
    formData.append("image", imageBlob, filename || "ocr-input.png");
    formData.append("language", config.ocrLanguage);

    const response = await fetch(config.ocrApiUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server OCR failed: ${response.status}`);
    }

    const payload = await response.json();
    return normalizeOCRText(payload.text || "");
  }

  async function extractWithClientOCRImageSrc(imageSrc, index, total) {
    const result = await Tesseract.recognize(imageSrc, config.ocrLanguage, {
      logger: (m) => {
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          const pct = Math.round(m.progress * 100);
          updateStatus(`OCR image ${index}/${total}: ${pct}%`);
        }
      },
    });
    return normalizeOCRText(result.data.text || "");
  }

  async function extractTextUsingOCR(imageSrc, index, total, filename) {
    if (config.preferServerOCR) {
      try {
        const imageResponse = await fetch(imageSrc);
        const imageBlob = await imageResponse.blob();
        const text = await extractWithServerOCRBlob(imageBlob, filename);
        setBackendStatus("Backend OCR: Connected", true);
        return text;
      } catch (serverError) {
        setBackendStatus("Backend OCR: Offline (using browser fallback)", false);
        if (typeof Tesseract === "undefined") {
          throw serverError;
        }
      }
    }

    return extractWithClientOCRImageSrc(imageSrc, index, total);
  }

  function splitToParagraphs(text) {
    return text
      .split(/\r?\n\r?\n/)
      .map((block) => block.trim())
      .filter(Boolean);
  }

  async function setDocumentFromContent(payload) {
    if (!payload || !payload.content) {
      updateStatus("Document file has no readable content.");
      return;
    }

    documentRoot.innerHTML = "";

    if (payload.kind === "html") {
      documentRoot.innerHTML = payload.content;
    } else {
      const paragraphs = splitToParagraphs(payload.content);
      paragraphs.forEach((paragraphText) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = paragraphText;
        documentRoot.appendChild(paragraph);
      });
    }

    clearSelection();
    updateStatus(`Document loaded (${payload.sourceLabel}).`);
    updatePageNumber();
  }

  async function parsePdfText(file) {
    if (typeof pdfjsLib === "undefined") {
      throw new Error("PDF parser library not loaded.");
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const chunks = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      updateStatus(`Reading PDF page ${pageNum}/${pdf.numPages}...`);
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str).join(" ");
      const normalizedPageText = normalizeOCRText(pageText);
      let pageTextForSelection = "";
      if (normalizedPageText.length > 30) {
        chunks.push(normalizedPageText);
        pageTextForSelection = normalizedPageText;
      } else {
        // Fallback OCR for scanned/bitmap PDF pages with missing text layer.
        updateStatus(`Running OCR on PDF page ${pageNum}/${pdf.numPages}...`);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport }).promise;
        const imageSrc = canvas.toDataURL("image/png");
        const ocrText = await extractTextUsingOCR(
          imageSrc,
          pageNum,
          pdf.numPages,
          `pdf-page-${pageNum}.png`
        );

        if (ocrText) {
          chunks.push(ocrText);
          pageTextForSelection = ocrText;
        }
      }
    }

    return chunks.join("\n\n");
  }

  async function parseDocxText(file) {
    if (typeof mammoth === "undefined") {
      throw new Error("DOCX parser library not loaded.");
    }

    const buffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    return result.value || "";
  }

  async function parseDocumentFile(file) {
    const fileName = file.name.toLowerCase();
    const type = file.type || "";

    if (fileName.endsWith(".pdf") || type.includes("pdf")) {
      const pdfText = await parsePdfText(file);
      return {
        kind: "text",
        content: pdfText,
        sourceLabel: "PDF text",
      };
    }

    if (
      fileName.endsWith(".docx") ||
      type.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    ) {
      const docxHtml = await parseDocxText(file);
      return {
        kind: "html",
        content: docxHtml,
        sourceLabel: "DOCX formatting preserved",
      };
    }

    if (type.startsWith("image/")) {
      updateStatus("Running OCR on image document...");
      const imageSrc = URL.createObjectURL(file);
      try {
        const text = await extractTextUsingOCR(imageSrc, 1, 1, file.name);
        return {
          kind: "text",
          content: text,
          sourceLabel: "Image OCR text",
        };
      } finally {
        URL.revokeObjectURL(imageSrc);
      }
    }

    const plainText = await file.text();
    return {
      kind: "text",
      content: plainText,
      sourceLabel: "Plain text",
    };
  }

  function getRangeAtPoint(clientX, clientY) {
    if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(clientX, clientY);
    }

    if (document.caretPositionFromPoint) {
      const caretPos = document.caretPositionFromPoint(clientX, clientY);
      if (!caretPos) {
        return null;
      }
      const range = document.createRange();
      range.setStart(caretPos.offsetNode, caretPos.offset);
      range.collapse(true);
      return range;
    }

    return null;
  }

  function calculateIndexFromPosition(container, node, offset) {
    const range = document.createRange();
    range.setStart(container, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  }

  function createPoint(range) {
    const node = range.startContainer;
    const offset = range.startOffset;
    return {
      node,
      offset,
      index: calculateIndexFromPosition(documentRoot, node, offset),
    };
  }

  function comparePoints(a, b) {
    const cmp = a.node.compareDocumentPosition(b.node);

    if (cmp === 0) {
      return a.offset - b.offset;
    }

    if (cmp & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }

    return 1;
  }

  function applySelection(a, b) {
    const range = document.createRange();
    if (comparePoints(a, b) <= 0) {
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      selectionState.start = a;
      selectionState.end = b;
    } else {
      range.setStart(b.node, b.offset);
      range.setEnd(a.node, a.offset);
      selectionState.start = b;
      selectionState.end = a;
    }

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    updateStatus(
      `Selection complete (start: ${selectionState.start.index}, end: ${selectionState.end.index})`
    );
    setButtonState();
  }

  function handleDocumentClick(event) {
    const range = getRangeAtPoint(event.clientX, event.clientY);
    if (!range || !documentRoot.contains(range.startContainer)) {
      return;
    }

    const point = createPoint(range);

    if (selectionState.clickCount === 0 || (selectionState.start && selectionState.end)) {
      selectionState.start = point;
      selectionState.end = null;
      selectionState.clickCount = 1;
      window.getSelection().removeAllRanges();
      updateStatus(`Start point set at index ${point.index}. Click again for end point.`);
      setButtonState();
      return;
    }

    selectionState.clickCount = 0;
    applySelection(selectionState.start, point);
  }

  async function extractTextFromImages() {
    const images = Array.from(documentRoot.querySelectorAll(config.imageSelector));
    if (images.length === 0) {
      updateStatus("No OCR images found. Upload image(s) first.");
      return;
    }

    runOcrBtn.disabled = true;
    updateStatus(`Running OCR on ${images.length} image(s)...`);

    for (let i = 0; i < images.length; i += 1) {
      const image = images[i];
      try {
        const text = await extractTextUsingOCR(
          image.src,
          i + 1,
          images.length,
          image.alt || `uploaded-image-${i + 1}.png`
        );

        if (!text) {
          continue;
        }

        const ocrSpan = document.createElement("span");
        ocrSpan.className = "ocr-inline";
        ocrSpan.textContent = text;

        image.insertAdjacentText("afterend", " ");
        image.insertAdjacentElement("afterend", ocrSpan);
        image.insertAdjacentText("afterend", " ");
      } catch (error) {
        console.error("OCR failed for image", error);
      }
    }

    runOcrBtn.disabled = false;
    updateStatus("OCR complete. Click to set start point.");
  }

  async function copySelectedText() {
    const text = window.getSelection().toString().trim();
    if (!text) {
      updateStatus("Nothing selected to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      updateStatus(`Copied ${text.length} characters to clipboard.`);
    } catch (error) {
      console.error("Clipboard write failed", error);
      updateStatus("Clipboard copy failed. Browser permission may be blocked.");
    }
  }

  function handleCopyShortcut(event) {
    const isCopyShortcut =
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === "c";
    if (!isCopyShortcut) {
      return;
    }
    event.preventDefault();
    copySelectedText();
  }

  function getCurrentSelectionText() {
    return window.getSelection().toString().trim();
  }

  function handleSelectionChange() {
    const text = getCurrentSelectionText();
    if (text) {
      updatePreview(text);
    }
  }

  function appendTextBlock(text) {
    const normalized = normalizeOCRText(text);
    if (!normalized) {
      updateStatus("Text input is empty.");
      return;
    }
    const paragraph = document.createElement("p");
    paragraph.textContent = normalized;
    documentRoot.appendChild(paragraph);
    updateStatus("Text appended to document.");
    updatePageNumber();
  }

  function replaceDocumentText() {
    const normalized = normalizeOCRText(textInput.value);
    if (!normalized) {
      updateStatus("Text input is empty.");
      return;
    }
    documentRoot.innerHTML = "";
    const paragraph = document.createElement("p");
    paragraph.textContent = normalized;
    documentRoot.appendChild(paragraph);
    clearSelection();
    updateStatus("Document text replaced.");
    updatePageNumber();
  }

  function appendDocumentText() {
    appendTextBlock(textInput.value);
  }

  async function openDocumentFile() {
    const file = documentFileInput.files && documentFileInput.files[0];
    if (!file) {
      updateStatus("Select a document file first.");
      return;
    }

    openDocumentBtn.disabled = true;
    updateStatus(`Opening ${file.name}...`);

    try {
      const parsed = await parseDocumentFile(file);
      await setDocumentFromContent(parsed);
    } catch (error) {
      console.error("Document open failed", error);
      updateStatus(`Could not open file: ${file.name}`);
    } finally {
      openDocumentBtn.disabled = false;
    }
  }

  function appendUploadedImages(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    let added = 0;
    files.forEach((file) => {
      if (!file.type.startsWith("image/")) {
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const figure = document.createElement("figure");
        const img = document.createElement("img");
        const cap = document.createElement("figcaption");
        img.src = String(reader.result);
        img.alt = file.name;
        img.setAttribute("data-ocr-source", "true");
        cap.textContent = `Uploaded image: ${file.name}`;
        figure.appendChild(img);
        figure.appendChild(cap);
        documentRoot.appendChild(figure);
      };
      reader.readAsDataURL(file);
      added += 1;
    });

    updateStatus(`${added} image(s) added. Click "Run OCR on Images".`);
    imageInput.value = "";
  }

  function clearDocument() {
    documentRoot.innerHTML = "";
    clearSelection();
    updateStatus("Document cleared.");
    updatePageNumber();
  }

  function init() {
    documentRoot.addEventListener("click", handleDocumentClick);
    document.addEventListener("selectionchange", handleSelectionChange);
    copySelectionBtn.addEventListener("click", copySelectedText);
    a4PreviewToggle.addEventListener("change", handleA4PreviewToggle);
    zoomRange.addEventListener("input", applyZoom);
    openDocumentBtn.addEventListener("click", openDocumentFile);
    replaceTextBtn.addEventListener("click", replaceDocumentText);
    appendTextBtn.addEventListener("click", appendDocumentText);
    runOcrBtn.addEventListener("click", extractTextFromImages);
    resetSelectionBtn.addEventListener("click", clearSelection);
    clearDocBtn.addEventListener("click", clearDocument);
    imageInput.addEventListener("change", appendUploadedImages);
    if (config.enableShortcut) {
      document.addEventListener("keydown", handleCopyShortcut);
    }
    window.addEventListener("scroll", updatePageNumber, { passive: true });
    window.addEventListener("resize", updatePageNumber);
    setBackendStatus("Backend OCR: Checking...", false);
    fetch(config.ocrHealthUrl)
      .then(() => setBackendStatus("Backend OCR: Connected", true))
      .catch(() => setBackendStatus("Backend OCR: Offline (fallback enabled)", false));
    setButtonState();
    applyZoom();
    updatePageNumber();
    updatePreview("");
  }

  function destroy() {
    documentRoot.removeEventListener("click", handleDocumentClick);
    document.removeEventListener("selectionchange", handleSelectionChange);
    copySelectionBtn.removeEventListener("click", copySelectedText);
    a4PreviewToggle.removeEventListener("change", handleA4PreviewToggle);
    zoomRange.removeEventListener("input", applyZoom);
    openDocumentBtn.removeEventListener("click", openDocumentFile);
    replaceTextBtn.removeEventListener("click", replaceDocumentText);
    appendTextBtn.removeEventListener("click", appendDocumentText);
    runOcrBtn.removeEventListener("click", extractTextFromImages);
    resetSelectionBtn.removeEventListener("click", clearSelection);
    clearDocBtn.removeEventListener("click", clearDocument);
    imageInput.removeEventListener("change", appendUploadedImages);
    window.removeEventListener("scroll", updatePageNumber);
    window.removeEventListener("resize", updatePageNumber);
    if (config.enableShortcut) {
      document.removeEventListener("keydown", handleCopyShortcut);
    }
  }

  return {
    init,
    destroy,
    copySelectedText,
    extractTextFromImages,
    getSelectionState: () => ({ ...selectionState }),
  };
}

const extractor = createDocumentExtractor();
extractor.init();
