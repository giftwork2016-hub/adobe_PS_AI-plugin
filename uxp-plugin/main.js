import { app, core, action } from "photoshop";

const MODEL_LABELS = {
  qwen: "Qwen (Alibaba)",
  "nano-banana": "Google Nano Banana",
  grok: "xAI Grok",
  meta: "Meta AI"
};

const WORKFLOW_LABELS = {
  generate: "Generate new artwork",
  edit: "Edit current selection",
  expand: "Outpaint beyond canvas"
};

const state = {
  preview: null
};

function init() {
  const elements = {
    promptInput: document.getElementById("prompt-input"),
    modelPicker: document.getElementById("model-picker"),
    workflowPicker: document.getElementById("workflow-picker"),
    strengthSlider: document.getElementById("strength-slider"),
    strengthValue: document.getElementById("strength-value"),
    seamlessSwitch: document.getElementById("seamless-switch"),
    maskSwitch: document.getElementById("mask-switch"),
    generateButton: document.getElementById("generate-button"),
    applyButton: document.getElementById("apply-button"),
    refreshButton: document.getElementById("refresh-button"),
    statusText: document.getElementById("status-text"),
    progressBar: document.getElementById("progress"),
    previewImage: document.getElementById("preview-image"),
    previewPlaceholder: document.getElementById("preview-placeholder"),
    documentInfo: document.getElementById("document-info")
  };

  elements.strengthSlider.addEventListener("input", (event) => {
    elements.strengthValue.textContent = `${event.target.value}%`;
  });

  elements.generateButton.addEventListener("click", async () => {
    await handleGenerate(elements);
  });

  elements.applyButton.addEventListener("click", async () => {
    await handleApply(elements);
  });

  elements.refreshButton.addEventListener("click", async () => {
    await updateDocumentInfo(elements);
  });

  updateDocumentInfo(elements).catch((error) => {
    console.error("Failed to load document info on init", error);
  });
}

async function handleGenerate(elements) {
  const prompt = elements.promptInput.value.trim();
  if (!prompt) {
    setStatus(elements, "warning", "Please enter a prompt before generating a preview.");
    return;
  }

  setProcessing(elements, true);
  setStatus(elements, "pending", "Contacting AI service...");
  elements.previewPlaceholder.hidden = false;
  elements.previewPlaceholder.textContent = "Generating preview...";
  elements.previewImage.hidden = true;

  try {
    const [documentSummary, previewUrl] = await Promise.all([
      fetchDocumentSummary(),
      simulatePreview(elements, prompt)
    ]);

    state.preview = {
      url: previewUrl,
      prompt,
      model: elements.modelPicker.value,
      workflow: elements.workflowPicker.value,
      strength: Number(elements.strengthSlider.value),
      preserveSubject: elements.seamlessSwitch.checked,
      respectMask: elements.maskSwitch.checked,
      documentSummary
    };

    elements.previewImage.src = state.preview.url;
    elements.previewImage.hidden = false;
    elements.previewPlaceholder.hidden = true;

    elements.applyButton.disabled = false;

    setStatus(elements, "success", "Preview generated. Apply to Photoshop to insert a placeholder layer.");
  } catch (error) {
    console.error("Preview generation failed", error);
    setStatus(elements, "error", `Preview failed: ${error.message}`);
  } finally {
    setProcessing(elements, false);
  }
}

async function handleApply(elements) {
  if (!state.preview) {
    setStatus(elements, "warning", "Generate a preview before applying.");
    return;
  }

  if (!app.documents.length) {
    setStatus(elements, "warning", "Open a Photoshop document to apply the AI result.");
    return;
  }

  setProcessing(elements, true);
  setStatus(elements, "pending", "Creating Photoshop layer placeholder...");

  try {
    await core.executeAsModal(async () => {
      const document = app.activeDocument;
      const layerName = `${MODEL_LABELS[state.preview.model] || "AI"} • ${state.preview.workflow}`;
      await document.createLayer({ name: layerName });
    }, { commandName: "AI Placeholder Layer" });

    setStatus(elements, "success", "Placeholder layer created. Replace its contents with the generated pixels from your service.");
  } catch (error) {
    console.error("Failed to create placeholder layer", error);
    setStatus(elements, "error", `Could not apply result: ${error.message}`);
  } finally {
    setProcessing(elements, false);
    await updateDocumentInfo(elements);
  }
}

async function updateDocumentInfo(elements) {
  try {
    const summary = await fetchDocumentSummary();
    elements.documentInfo.textContent = summary
      ? formatDocumentSummary(summary)
      : "No Photoshop document detected.";
  } catch (error) {
    console.error("Failed to fetch document info", error);
    elements.documentInfo.textContent = `Error loading document info: ${error.message}`;
  }
}

async function fetchDocumentSummary() {
  if (!app.documents.length) {
    return null;
  }

  const document = app.activeDocument;
  const docSummary = {
    name: document.title || document.name || "Untitled",
    widthPx: undefined,
    heightPx: undefined,
    resolution: document.resolution,
    numberOfLayers: undefined
  };

  if (document.width && typeof document.width.as === "function") {
    docSummary.widthPx = Number(document.width.as("px"));
  }
  if (document.height && typeof document.height.as === "function") {
    docSummary.heightPx = Number(document.height.as("px"));
  }

  try {
    const [descriptor] = await action.batchPlay([
      {
        _obj: "get",
        _target: [
          {
            _ref: "document",
            _enum: "ordinal",
            _value: "targetEnum"
          }
        ]
      }
    ], {
      synchronousExecution: true,
      modalBehavior: "execute"
    });

    if (descriptor && typeof descriptor.numberOfLayers === "number") {
      docSummary.numberOfLayers = descriptor.numberOfLayers;
    }
  } catch (error) {
    console.warn("batchPlay document descriptor failed", error);
  }

  return docSummary;
}

function simulatePreview(elements, prompt) {
  const modelLabel = MODEL_LABELS[elements.modelPicker.value] || "Custom model";
  const workflowLabel = WORKFLOW_LABELS[elements.workflowPicker.value] || "Workflow";
  const strength = Number(elements.strengthSlider.value);
  const preserveSubject = elements.seamlessSwitch.checked ? "Yes" : "No";
  const respectMask = elements.maskSwitch.checked ? "Yes" : "No";

  const documentSummary = elements.documentInfo.textContent;
  const text = `Model: ${modelLabel}\nWorkflow: ${workflowLabel}\nStrength: ${strength}%\nPreserve Subject: ${preserveSubject}\nRespect Mask: ${respectMask}\nPrompt: ${prompt}\n${documentSummary}`;

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'>
    <defs>
      <linearGradient id='bg' x1='0%' y1='0%' x2='100%' y2='100%'>
        <stop offset='0%' stop-color='#1473E6'/>
        <stop offset='100%' stop-color='#5C6BC0'/>
      </linearGradient>
    </defs>
    <rect width='800' height='600' rx='32' fill='url(#bg)' />
    <foreignObject x='32' y='32' width='736' height='536'>
      <body xmlns='http://www.w3.org/1999/xhtml' style='color:white;font-family:Arial,Helvetica,sans-serif;'>
        <h2 style='margin:0 0 12px 0;'>AI Preview</h2>
        <pre style='white-space:pre-wrap;font-size:20px;line-height:1.4;'>${escapeHtml(text)}</pre>
      </body>
    </foreignObject>
  </svg>`;

  const encoded = encodeURIComponent(svg).replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`data:image/svg+xml,${encoded}`);
    }, 500);
  });
}

function formatDocumentSummary(summary) {
  const width = summary.widthPx ? `${Math.round(summary.widthPx)} px` : "Unknown width";
  const height = summary.heightPx ? `${Math.round(summary.heightPx)} px` : "Unknown height";
  const layers = summary.numberOfLayers != null ? `${summary.numberOfLayers} layers` : "Layer count unavailable";
  const resolution = summary.resolution ? `${summary.resolution} ppi` : "Resolution unknown";

  return `${summary.name}\n${width} × ${height}\n${layers}\n${resolution}`;
}

function setStatus(elements, status, message) {
  elements.statusText.textContent = message;
  elements.statusText.dataset.status = status;
}

function setProcessing(elements, isProcessing) {
  elements.generateButton.disabled = isProcessing;
  elements.refreshButton.disabled = isProcessing;
  elements.progressBar.hidden = !isProcessing;
  elements.applyButton.disabled = isProcessing || !state.preview;
  if (!state.preview) {
    elements.previewPlaceholder.hidden = false;
    elements.previewImage.hidden = true;
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.addEventListener("DOMContentLoaded", init);
