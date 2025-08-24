let itinerary = [];
let history = []; // [{query, offset, places}]
let lastPlaces = [];
let lastQuery = "";
let lastOffset = 0;
let lastMode = "idle"; // "idle" | "awaiting_action" | "awaiting_place_choice"
let lastDetailPlaceIdx = null;

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"'`=\/]/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
  })[s]);
}

function setInputEnabled(enabled) {
  document.getElementById('searchInput').disabled = !enabled;
  document.getElementById('searchForm').querySelector('button').disabled = !enabled;
  document.getElementById('searchInput').classList.toggle('disabled', !enabled);
}

function clearActionArea() {
  document.getElementById('actionArea').innerHTML = "";
}

function addResultsHistoryBlock(query, places, offset) {
  const historyArea = document.getElementById('historyArea');
  const block = document.createElement('div');
  block.className = 'history-block';
  const startNum = offset + 1;
  block.innerHTML = `<div class="history-query">Results for: <span style="color:#3146b6;">${escapeHTML(query)}</span> <span style="color:#444;">(${startNum}–${startNum + places.length - 1})</span></div>`;
  places.forEach((place, idx) => {
    const inItinerary = itinerary.some(x => x.name === place.name && x.address === place.address);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="place-row">
        <span class="place-number">${startNum + idx}.</span>
        <div class="card-header">
          <span class="card-title">${escapeHTML(place.name || 'Unknown')}</span>
          <button class="card-btn" ${inItinerary ? 'disabled' : ''} onclick="addToItinerary(${idx})">
            ${inItinerary ? 'Added' : 'Add to Itinerary'}
          </button>
        </div>
      </div>
      <div class="card-rating"><b>Rating:</b> ${typeof place.rating === 'number' ? place.rating : 'N/A'} (${place.user_ratings_total || 0} reviews)</div>
      <div class="card-address"><b>Location:</b> ${escapeHTML(place.address || '')}</div>
      ${place.review ? `<div class="card-desc">${escapeHTML(place.review)}</div>` : ""}
      <a class="card-link" href="${escapeHTML(place.google_maps_url || '#')}" target="_blank" rel="noopener">View on Google Maps</a>
    `;
    block.appendChild(card);
  });
  historyArea.prepend(block);
}

function renderItinerary() {
  const itineraryEl = document.getElementById('itineraryList');
  itineraryEl.innerHTML = '';
  if (!itinerary.length) {
    itineraryEl.innerHTML = '<li><em>No places yet.</em></li>';
    return;
  }
  itinerary.forEach((place, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${idx + 1}. ${escapeHTML(place.name)}</span>
      <button class="remove" onclick="removeFromItinerary(${idx})" title="Remove from itinerary">✕</button>
    `;
    itineraryEl.appendChild(li);
  });
}
window.addToItinerary = function(idx) {
  const place = lastPlaces[idx];
  if (place && !itinerary.some(x => x.name === place.name && x.address === place.address)) {
    itinerary.push({...place});
    renderItinerary();
    // no need to rerender the cards, as action buttons are always shown after
  }
};
window.removeFromItinerary = function(idx) {
  itinerary.splice(idx, 1);
  renderItinerary();
};

function renderActionPrompt() {
  lastMode = "awaiting_action";
  setInputEnabled(false);
  clearActionArea();
  const area = document.getElementById('actionArea');
  const div = document.createElement('div');
  div.innerHTML = `
    <div style="margin: 16px 0 10px 0; color:#4169e1; font-weight:bold;">
      Would you like me to generate more, or do you want more information on the places I have shown?
    </div>
    <div class="action-buttons">
      <button class="action-btn" onclick="actionButtonClicked('new')">No, I want to generate something else</button>
      <button class="action-btn" onclick="actionButtonClicked('more')">Yes, generate more</button>
      <button class="action-btn" onclick="actionButtonClicked('details')">Can you tell me more about these places?</button>
    </div>
  `;
  area.appendChild(div);
}

window.actionButtonClicked = function(which) {
  clearActionArea();
  if (which === "new") {
    lastMode = "idle";
    setInputEnabled(true);
    document.getElementById('searchInput').focus();
  } else if (which === "more") {
    lastOffset += 10;
    fetchAndShowPlaces(lastQuery, lastOffset);
  } else if (which === "details") {
    lastMode = "awaiting_place_choice";
    setInputEnabled(false);
    renderPlaceChoiceButtons();
  }
};

function renderPlaceChoiceButtons() {
  clearActionArea();
  const area = document.getElementById('actionArea');
  const div = document.createElement('div');
  div.innerHTML = `<div style="margin: 16px 0 10px 0; color:#4169e1; font-weight:bold;">
    Which place would you like to talk to me about?</div>`;
  const btnWrap = document.createElement('div');
  btnWrap.style.display = "flex";
  btnWrap.style.flexWrap = "wrap";
  btnWrap.style.gap = "6px";
  lastPlaces.forEach((place, idx) => {
    const btn = document.createElement('button');
    btn.className = 'place-choice-btn';
    btn.innerText = place.name;
    btn.onclick = () => {
      showPlaceDetails(idx);
    };
    btnWrap.appendChild(btn);
  });
  div.appendChild(btnWrap);
  area.appendChild(div);
}

async function handleInput(query) {
  // Only handle if in 'idle' mode
  if (lastMode !== "idle") return;
  lastQuery = query;
  lastOffset = 0;
  await fetchAndShowPlaces(lastQuery, lastOffset);
}

async function fetchAndShowPlaces(query, offset) {
  try {
    setInputEnabled(false);
    clearActionArea();
    const resp = await fetch('/api/google-places-groq', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ term: query, offset: offset })
    });
    if (!resp.ok) throw new Error(`API error (${resp.status})`);
    const data = await resp.json();
    lastPlaces = Array.isArray(data.places) ? data.places : [];
    history.unshift({ query, offset, places: lastPlaces });
    if (history.length > 10) history.length = 10;
    addResultsHistoryBlock(query, lastPlaces, offset);
    renderActionPrompt();
  } catch (e) {
    alert("Sorry, couldn't fetch places right now.");
    setInputEnabled(true);
  }
}

async function showPlaceDetails(idx) {
  setInputEnabled(false);
  clearActionArea();
  lastDetailPlaceIdx = idx;
  const place = lastPlaces[idx];
  try {
    const resp = await fetch('/api/google-places-groq', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ term: `${place.name} in Baguio City` })
    });
    if (!resp.ok) throw new Error(`API error (${resp.status})`);
    const data = await resp.json();
    const detail = Array.isArray(data.places) && data.places.length ? data.places[0] : place;
    // For demo, we show as a history block
    addResultsHistoryBlock(`More about ${detail.name}`, [detail], 0);
    renderActionPrompt();
  } catch (e) {
    alert("Sorry, couldn't fetch more details right now.");
    renderActionPrompt();
  }
}

document.getElementById('searchForm').onsubmit = e => {
  e.preventDefault();
  const inp = document.getElementById('searchInput');
  const val = inp.value.trim();
  if (!val) return;
  handleInput(val);
  inp.value = "";
};

// Itinerary PDF (unchanged)
function exportItineraryAsPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const font = 'helvetica';
  doc.setFont(font);
  doc.setFontSize(18);
  doc.text("My Baguio Itinerary", 20, 20);
  doc.setFontSize(12);
  let y = 30;
  itinerary.forEach((place, idx) => {
    doc.setFont(font, "bold");
    doc.text(`${idx + 1}. ${place.name}`, 20, y);
    y += 7;
    doc.setFont(font, "normal");
    doc.text(`Address: ${place.address}`, 22, y);
    y += 7;
    if (place.google_maps_url) {
      doc.text(`Link: ${place.google_maps_url}`, 22, y);
      y += 7;
    }
    if (place.timeSpent) {
      doc.text(`Time: ${place.timeSpent}`, 22, y);
      y += 7;
    }
    if (place.userNotes) {
      doc.text(`Notes: ${place.userNotes}`, 22, y);
      y += 7;
    }
    y += 5;
    if (y > 270) { doc.addPage(); y = 20; }
  });
  doc.save("bagrovr-itinerary.pdf");
}

window.onload = () => {
  renderItinerary();
  setInputEnabled(true);
};
