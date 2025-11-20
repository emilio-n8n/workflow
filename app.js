const svgNS = "http://www.w3.org/2000/svg";

const state = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  linkMode: false,
  pendingLinkFrom: null,
  draggingLink: null,
  apiKey: localStorage.getItem("gemini_api_key") || "",
};

const elements = {
  canvas: document.getElementById("canvas"),
  svg: document.getElementById("connections"),
  addNode: document.getElementById("add-node"),
  linkMode: document.getElementById("link-mode"),
  linkHint: document.getElementById("link-hint"),
  jsonPreview: document.getElementById("json-preview"),
  copyJson: document.getElementById("copy-json"),
  selectionPanel: document.getElementById("selection-panel"),
  nodeTitle: document.getElementById("node-title"),
  nodeDescription: document.getElementById("node-description"),
  deleteNode: document.getElementById("delete-node"),
  importJson: document.getElementById("import-json"),
  importFileInput: document.getElementById("import-file-input"),
  // AI & Settings Elements
  settingsBtn: document.getElementById("settings-btn"),
  settingsModal: document.getElementById("settings-modal"),
  closeSettings: document.getElementById("close-settings"),
  saveSettings: document.getElementById("save-settings"),
  apiKeyInput: document.getElementById("api-key-input"),
  aiPrompt: document.getElementById("ai-prompt"),
  aiGenerateBtn: document.getElementById("ai-generate-btn"),
  aiChatContainer: document.getElementById("ai-chat-container"),
  aiAnalyzeBtn: document.getElementById("ai-analyze-btn"),
  aiSuggestBtn: document.getElementById("ai-suggest-btn"),
};

const nodeElements = new Map();
const edgeElements = new Map();

const edgesGroup = document.createElementNS(svgNS, "g");
edgesGroup.setAttribute("data-role", "edges");

// Initialize
setupSvg();
attachEventListeners();
updateLinkHint();
updateJSONPreview();
if (state.apiKey) {
  elements.apiKeyInput.value = state.apiKey;
}

function setupSvg() {
  const defs = document.createElementNS(svgNS, "defs");
  const marker = document.createElementNS(svgNS, "marker");
  marker.id = "arrow-head";
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "10");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "6");
  marker.setAttribute("markerHeight", "6");
  marker.setAttribute("orient", "auto");

  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  // The fill is now handled by CSS or inherited, but we can set a default class
  marker.appendChild(path);
  defs.appendChild(marker);

  elements.svg.appendChild(defs);
  elements.svg.appendChild(edgesGroup);
}

function attachEventListeners() {
  // Core App Listeners
  elements.addNode.addEventListener("click", addNode);
  elements.linkMode.addEventListener("click", toggleLinkMode);
  elements.copyJson.addEventListener("click", copyJSONToClipboard);
  elements.importJson.addEventListener("click", () => elements.importFileInput.click());
  elements.importFileInput.addEventListener("change", handleJsonImport);

  elements.nodeTitle.addEventListener("input", (event) => {
    const node = getSelectedNode();
    if (!node) return;
    node.title = event.target.value;
    refreshNodeElement(node.id);
    updateJSONPreview();
  });

  elements.nodeDescription.addEventListener("input", (event) => {
    const node = getSelectedNode();
    if (!node) return;
    node.description = event.target.value;
    refreshNodeElement(node.id);
    updateJSONPreview();
  });

  elements.deleteNode.addEventListener("click", () => {
    if (state.selectedNodeId) {
      removeNode(state.selectedNodeId);
    }
  });

  elements.canvas.addEventListener("click", (event) => {
    if (event.target === elements.canvas) {
      clearPendingLink();
      selectNode(null);
    }
  });

  elements.svg.addEventListener("click", (event) => {
    if (event.target === elements.svg) {
      clearPendingLink();
      selectNode(null);
    }
  });

  window.addEventListener("resize", debounce(updateConnections, 100));

  // Settings Listeners
  elements.settingsBtn.addEventListener("click", () => {
    elements.settingsModal.classList.remove("hidden");
  });

  elements.closeSettings.addEventListener("click", () => {
    elements.settingsModal.classList.add("hidden");
  });

  elements.saveSettings.addEventListener("click", () => {
    const key = elements.apiKeyInput.value.trim();
    if (key) {
      state.apiKey = key;
      localStorage.setItem("gemini_api_key", key);
      elements.settingsModal.classList.add("hidden");
      addChatMessage("system", "Clé API enregistrée avec succès !");
    }
  });

  // AI Listeners
  elements.aiGenerateBtn.addEventListener("click", handleAIGeneration);
  elements.aiPrompt.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAIGeneration();
    }
  });

  elements.aiAnalyzeBtn.addEventListener("click", () => {
    const prompt = "Analyse ce flux utilisateur. Identifie les points de friction potentiels, les étapes manquantes ou les incohérences. Sois concis.";
    callGemini(prompt, true);
  });

  elements.aiSuggestBtn.addEventListener("click", () => {
    const prompt = "Suggère 3 étapes supplémentaires logiques pour ce flux. Réponds sous forme de liste.";
    callGemini(prompt, true);
  });
}

// --- AI Logic ---

async function handleAIGeneration() {
  const prompt = elements.aiPrompt.value.trim();
  if (!prompt) return;

  elements.aiPrompt.value = "";
  addChatMessage("user", prompt);

  // Check if user wants to generate a flow (heuristic)
  const isGenerationRequest = /cré|génèr|fais|flow|parcours/i.test(prompt);

  await callGemini(prompt, true); // Always include context for now
}

async function callGemini(userPrompt, includeContext = false) {
  if (!state.apiKey) {
    addChatMessage("system", "Veuillez d'abord configurer votre clé API Gemini dans les paramètres.");
    return;
  }

  addChatMessage("ai", "Réflexion en cours...");
  const loadingMsg = elements.aiChatContainer.lastElementChild;

  try {
    const currentJson = JSON.stringify({ nodes: state.nodes, edges: state.edges });

    const systemInstruction = `
      Tu es FlowGenius, un architecte UX expert.
      Ton rôle est d'aider l'utilisateur à concevoir des flux d'application.
      
      RÈGLES IMPORTANTES :
      1. Si l'utilisateur demande de CRÉER ou GÉNÉRER un flux, tu DOIS répondre UNIQUEMENT avec un objet JSON valide.
         Le JSON doit avoir cette structure :
         {
           "nodes": [ { "id": "unique_id", "title": "Titre", "description": "Desc", "x": 100, "y": 100 } ],
           "edges": [ { "from": "id1", "to": "id2" } ]
         }
         Ne mets pas de markdown (pas de \`\`\`json). Juste le JSON brut.
      
      2. Si l'utilisateur demande une ANALYSE ou des CONSEILS, réponds en texte clair, concis et professionnel.
      
      3. Contexte actuel du graphe : ${currentJson}
    `;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${state.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: systemInstruction + "\n\nUtilisateur: " + userPrompt }]
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    const aiText = data.candidates[0].content.parts[0].text;
    loadingMsg.remove();

    // Try to parse JSON
    try {
      // Clean up potential markdown code blocks if Gemini adds them despite instructions
      const cleanText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
      const jsonResponse = JSON.parse(cleanText);

      if (validateImportData(jsonResponse)) {
        loadState(jsonResponse);
        addChatMessage("ai", "J'ai généré le flux demandé. Vous pouvez maintenant le modifier.");
      } else {
        // It was JSON but not our schema? Treat as text.
        addChatMessage("ai", aiText);
      }
    } catch (e) {
      // Not JSON, treat as text response
      addChatMessage("ai", aiText);
    }

  } catch (error) {
    loadingMsg.remove();
    addChatMessage("system", "Erreur : " + error.message);
  }
}

function addChatMessage(type, text) {
  const div = document.createElement("div");
  div.className = `chat-message ${type}`;
  div.textContent = text;
  elements.aiChatContainer.appendChild(div);
  elements.aiChatContainer.scrollTop = elements.aiChatContainer.scrollHeight;
}

// --- Core Logic (Existing + Adapted) ---

function copyJSONToClipboard(event) {
  const payload = elements.jsonPreview.value;
  if (!payload) return;
  navigator.clipboard.writeText(payload).then(() => {
    const originalText = event.currentTarget.textContent;
    event.currentTarget.textContent = "Copié !";
    setTimeout(() => event.currentTarget.textContent = originalText, 2000);
  });
}

function addNode() {
  const node = {
    id: createId("node"),
    title: `Page ${state.nodes.length + 1}`,
    description: "",
    x: 100 + Math.random() * 50,
    y: 100 + Math.random() * 50,
  };

  state.nodes.push(node);
  const element = createNodeElement(node);
  nodeElements.set(node.id, element);
  elements.canvas.appendChild(element);
  selectNode(node.id);
  updateJSONPreview();
}

function removeNode(nodeId) {
  const index = state.nodes.findIndex((n) => n.id === nodeId);
  if (index === -1) return;

  state.nodes.splice(index, 1);

  const element = nodeElements.get(nodeId);
  if (element) {
    element.remove();
    nodeElements.delete(nodeId);
  }

  const removedEdges = state.edges.filter(
    (edge) => edge.from === nodeId || edge.to === nodeId
  );
  state.edges = state.edges.filter(
    (edge) => edge.from !== nodeId && edge.to !== nodeId
  );

  removedEdges.forEach((edge) => {
    const edgeId = edgeIdentifier(edge.from, edge.to);
    const edgeElement = edgeElements.get(edgeId);
    if (edgeElement) {
      edgeElement.remove();
      edgeElements.delete(edgeId);
    }
  });

  if (state.selectedNodeId === nodeId) {
    selectNode(null);
  }

  clearPendingLink();
  updateConnections();
  updateJSONPreview();
}

function createNodeElement(node) {
  const element = document.createElement("div");
  element.className = "node";
  element.dataset.id = node.id;
  positionNodeElement(element, node.x, node.y);

  const title = document.createElement("div");
  title.className = "node-title";
  title.textContent = node.title;

  const description = document.createElement("div");
  description.className = "node-description";
  description.textContent = node.description || "";

  const connector = document.createElement("span");
  connector.className = "connector";

  element.append(title, description, connector);

  connector.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    startConnectorDrag(event, node.id, connector);
  });

  let movedDuringDrag = false;

  element.addEventListener("pointerdown", (event) => {
    if (state.linkMode) return;
    event.preventDefault();
    event.stopPropagation();
    movedDuringDrag = false;
    startDragging(event, node, element, () => {
      movedDuringDrag = true;
    });
  });

  element.addEventListener("click", (event) => {
    event.stopPropagation();
    if (state.linkMode) {
      handleLinking(node.id);
      return;
    }

    if (!movedDuringDrag) {
      selectNode(node.id);
    }

    movedDuringDrag = false;
  });

  return element;
}

function startDragging(event, node, element, onMoveCallback) {
  const pointerId = event.pointerId;
  const startX = event.clientX;
  const startY = event.clientY;
  const initialX = node.x;
  const initialY = node.y;

  element.setPointerCapture(pointerId);
  element.classList.add("dragging");

  const moveHandler = (moveEvent) => {
    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;
    const newX = initialX + deltaX;
    const newY = initialY + deltaY;

    node.x = newX;
    node.y = newY;
    positionNodeElement(element, newX, newY);
    updateConnections();
    onMoveCallback();
  };

  const endHandler = () => {
    element.releasePointerCapture(pointerId);
    element.classList.remove("dragging");
    element.removeEventListener("pointermove", moveHandler);
    element.removeEventListener("pointerup", endHandler);
    element.removeEventListener("pointercancel", endHandler);
    updateJSONPreview();
  };

  element.addEventListener("pointermove", moveHandler);
  element.addEventListener("pointerup", endHandler);
  element.addEventListener("pointercancel", endHandler);
}

function handleLinking(targetNodeId) {
  if (!state.linkMode) return;

  if (!state.pendingLinkFrom) {
    state.pendingLinkFrom = targetNodeId;
    const element = nodeElements.get(targetNodeId);
    element?.classList.add("link-source"); // Add visual cue if needed
    updateLinkHint();
    return;
  }

  if (state.pendingLinkFrom === targetNodeId) {
    clearPendingLink();
    updateLinkHint();
    return;
  }

  if (!hasEdge(state.pendingLinkFrom, targetNodeId)) {
    createEdge(state.pendingLinkFrom, targetNodeId);
  }

  clearPendingLink();
  updateLinkHint();
}

function clearPendingLink() {
  if (!state.pendingLinkFrom) return;
  // Remove visual cue if added
  state.pendingLinkFrom = null;
}

function toggleLinkMode() {
  state.linkMode = !state.linkMode;
  elements.linkMode.classList.toggle("active", state.linkMode); // Add active style if needed

  if (!state.linkMode) {
    clearPendingLink();
  }

  updateLinkHint();
}

function createEdge(fromId, toId) {
  const edge = { from: fromId, to: toId };
  state.edges.push(edge);

  const edgeId = edgeIdentifier(fromId, toId);
  const path = document.createElementNS(svgNS, "path");
  path.classList.add("connection-line");
  path.dataset.edgeId = edgeId;
  edgesGroup.appendChild(path);
  edgeElements.set(edgeId, path);

  updateConnections();
  updateJSONPreview();
}

function hasEdge(fromId, toId) {
  return state.edges.some((edge) => edge.from === fromId && edge.to === toId);
}

function edgeIdentifier(fromId, toId) {
  return `${fromId}->${toId}`;
}

function updateConnections() {
  const canvasRect = elements.canvas.getBoundingClientRect();

  state.edges.forEach((edge) => {
    const source = nodeElements.get(edge.from);
    const target = nodeElements.get(edge.to);
    if (!source || !target) return;

    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    const startX = sourceRect.right - canvasRect.left;
    const startY = sourceRect.top + sourceRect.height / 2 - canvasRect.top;
    const endX = targetRect.left - canvasRect.left;
    const endY = targetRect.top + targetRect.height / 2 - canvasRect.top;

    const offset = Math.max(40, Math.abs(endX - startX) / 2);
    const curve = `M ${startX} ${startY} C ${startX + offset} ${startY} ${endX - offset} ${endY} ${endX} ${endY}`;

    const path = edgeElements.get(edgeIdentifier(edge.from, edge.to));
    if (path) {
      path.setAttribute("d", curve);
    }
  });
}

function selectNode(nodeId) {
  if (state.selectedNodeId === nodeId) return;

  if (state.selectedNodeId) {
    const previous = nodeElements.get(state.selectedNodeId);
    previous?.classList.remove("selected");
  }

  state.selectedNodeId = nodeId;

  if (!nodeId) {
    elements.selectionPanel.classList.add("hidden");
    elements.nodeTitle.value = "";
    elements.nodeDescription.value = "";
    return;
  }

  const node = state.nodes.find((item) => item.id === nodeId);
  const element = nodeElements.get(nodeId);
  if (!node || !element) return;

  element.classList.add("selected");
  elements.selectionPanel.classList.remove("hidden");
  elements.nodeTitle.value = node.title;
  elements.nodeDescription.value = node.description;
}

function getSelectedNode() {
  return state.nodes.find((node) => node.id === state.selectedNodeId) || null;
}

function refreshNodeElement(nodeId) {
  const node = state.nodes.find((item) => item.id === nodeId);
  const element = nodeElements.get(nodeId);

  if (!node || !element) return;

  const titleElement = element.querySelector(".node-title");
  const descriptionElement = element.querySelector(".node-description");

  titleElement.textContent = node.title || "Bloc";
  descriptionElement.textContent = node.description || "";
}

function positionNodeElement(element, x, y) {
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
}

function updateLinkHint() {
  if (state.linkMode) {
    if (state.pendingLinkFrom) {
      const node = state.nodes.find((item) => item.id === state.pendingLinkFrom);
      const name = node?.title || "ce bloc";
      elements.linkHint.textContent = `Relier "${name}" à...`;
    } else {
      elements.linkHint.textContent = "Sélectionnez la source puis la cible";
    }
  } else {
    elements.linkHint.textContent = "";
  }
}

function updateJSONPreview() {
  const payload = {
    nodes: state.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      description: node.description,
      position: { x: Math.round(node.x), y: Math.round(node.y) },
    })),
    edges: state.edges.map((edge) => ({ from: edge.from, to: edge.to })),
  };

  elements.jsonPreview.value = JSON.stringify(payload, null, 2);
}

function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), delay);
  };
}

function createId(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
}

function handleJsonImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (validateImportData(data)) {
        loadState(data);
      } else {
        alert("Le fichier JSON est invalide ou mal formaté.");
      }
    } catch (error) {
      alert("Erreur lors de la lecture du fichier JSON.");
      console.error(error);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function validateImportData(data) {
  return (
    data &&
    Array.isArray(data.nodes) &&
    Array.isArray(data.edges) &&
    data.nodes.every(
      (n) =>
        n.id &&
        n.title &&
        n.position &&
        typeof n.position.x === "number" &&
        typeof n.position.y === "number"
    ) &&
    data.edges.every((e) => e.from && e.to)
  );
}

function loadState(data) {
  // Clear current state
  state.nodes.forEach((node) => {
    const el = nodeElements.get(node.id);
    if (el) el.remove();
  });
  state.edges.forEach((edge) => {
    const el = edgeElements.get(edgeIdentifier(edge.from, edge.to));
    if (el) el.remove();
  });
  nodeElements.clear();
  edgeElements.clear();

  state.nodes = data.nodes.map(node => ({ ...node, x: node.position.x, y: node.position.y }));
  state.edges = data.edges;

  // Re-render canvas
  state.nodes.forEach((node) => {
    const element = createNodeElement(node);
    nodeElements.set(node.id, element);
    elements.canvas.appendChild(element);
  });

  state.edges.forEach((edge) => {
    const edgeId = edgeIdentifier(edge.from, edge.to);
    const path = document.createElementNS(svgNS, "path");
    path.classList.add("connection-line");
    path.dataset.edgeId = edgeId;
    edgesGroup.appendChild(path);
    edgeElements.set(edgeId, path);
  });

  selectNode(null);
  updateConnections();
  updateJSONPreview();
}

function startConnectorDrag(event, nodeId, connectorElement) {
  event.preventDefault();

  clearPendingLink();

  const pointerId = event.pointerId;
  connectorElement.setPointerCapture(pointerId);

  const { x: startX, y: startY } = getConnectorCoordinates(connectorElement);

  const tempPath = document.createElementNS(svgNS, "path");
  tempPath.classList.add("connection-line", "temp");
  edgesGroup.appendChild(tempPath);

  state.draggingLink = {
    fromId: nodeId,
    pointerId,
    pathElement: tempPath,
    startX,
    startY,
  };

  updateDraggingLinkPath(event);

  const moveHandler = (moveEvent) => {
    if (moveEvent.pointerId !== pointerId) return;
    updateDraggingLinkPath(moveEvent);
  };

  const upHandler = (upEvent) => {
    if (upEvent.pointerId !== pointerId) return;
    finishConnectorDrag(upEvent);
    connectorElement.releasePointerCapture(pointerId);
    connectorElement.removeEventListener("pointermove", moveHandler);
    connectorElement.removeEventListener("pointerup", upHandler);
    connectorElement.removeEventListener("pointercancel", upHandler);
  };

  connectorElement.addEventListener("pointermove", moveHandler);
  connectorElement.addEventListener("pointerup", upHandler);
  connectorElement.addEventListener("pointercancel", upHandler);
}

function updateDraggingLinkPath(event) {
  if (!state.draggingLink) return;

  const { startX, startY, pathElement } = state.draggingLink;
  const canvasRect = elements.canvas.getBoundingClientRect();
  const endX = event.clientX - canvasRect.left;
  const endY = event.clientY - canvasRect.top;
  const offset = Math.max(40, Math.abs(endX - startX) / 2);
  const curve = `M ${startX} ${startY} C ${startX + offset} ${startY} ${endX - offset} ${endY} ${endX} ${endY}`;
  pathElement.setAttribute("d", curve);
}

function finishConnectorDrag(event) {
  if (!state.draggingLink) return;

  const { fromId, pathElement } = state.draggingLink;
  pathElement.remove();

  const dropElement = document.elementFromPoint(event.clientX, event.clientY);
  const targetNodeElement = dropElement?.closest?.(".node");
  const targetId = targetNodeElement?.dataset?.id;

  if (targetId && targetId !== fromId && !hasEdge(fromId, targetId)) {
    createEdge(fromId, targetId);
  }

  state.draggingLink = null;
  updateConnections();
  updateJSONPreview();
}

function getConnectorCoordinates(connectorElement) {
  const rect = connectorElement.getBoundingClientRect();
  const canvasRect = elements.canvas.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - canvasRect.left,
    y: rect.top + rect.height / 2 - canvasRect.top,
  };
}
