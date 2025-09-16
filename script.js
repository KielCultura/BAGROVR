// --- Initialization ---
let itinerary = [];
let history = [];
let lastPlaces = [];
let lastQuery = "";
let lastOffset = 0;
let lastMode = "idle"; // "idle" | "awaiting_action" | "awaiting_place_choice"
let lastDetailPlaceIdx = null;
let autoModeItinerary = []; // stores results from automatic mode

// --- PlaceAutocompleteElement state (ADDED) ---
let startPlace = '';
let endPlace = '';

// --- Enable/Disable submit button based on selection (ADDED) ---
function updateGenerateBtnState() {
  const btn = document.getElementById('generateBtn');
  if (btn) {
    btn.disabled = !(startPlace && endPlace);
  }
}

// --- Mode Switching ---
window.addEventListener('DOMContentLoaded', () => {
  // --- Setup autocomplete listeners (ADDED) ---
  const startAutocomplete = document.getElementById('startAutocomplete');
  const endAutocomplete = document.getElementById('endAutocomplete');
  if (startAutocomplete) {
    startAutocomplete.addEventListener('gmp-place-change', function(e) {
      startPlace = e.detail.place.formatted_address || e.detail.place.name || '';
      updateGenerateBtnState();
    });
  }
  if (endAutocomplete) {
    endAutocomplete.addEventListener('gmp-place-change', function(e) {
      endPlace = e.detail.place.formatted_address || e.detail.place.name || '';
      updateGenerateBtnState();
    });
  }

  document.getElementById('autoModeBtn').onclick = function() {
    document.getElementById('autoModeForm').style.display = 'block';
    document.getElementById('manualModeArea').style.display = 'none';
    this.classList.add('active');
    document.getElementById('manualModeBtn').classList.remove('active');
    document.getElementById('itineraryResults').style.display = 'block';
  };
  document.getElementById('manualModeBtn').onclick = function() {
    document.getElementById('autoModeForm').style.display = 'none';
    document.getElementById('manualModeArea').style.display = 'block';
    this.classList.add('active');
    document.getElementById('autoModeBtn').classList.remove('active');
    document.getElementById('itineraryResults').style.display = 'none';
  };
  renderItinerary();
  setInputEnabled(true);
  scrollToBottom();
});

// --- Helpers ---
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"'`=\/]/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
  })[s]);
}
function scrollToBottom() {
  const mainContent = document.getElementById('mainContent');
  if (mainContent)
    setTimeout(() => { mainContent.scrollTop = mainContent.scrollHeight; }, 0);
}
function setInputEnabled(enabled) {
  const input = document.getElementById('searchInput');
  const form = document.getElementById('searchForm');
  if (input) input.disabled = !enabled;
  if (form) form.querySelector('button').disabled = !enabled;
}
function clearActionArea() {
  const area = document.getElementById('actionArea');
  if (area) area.innerHTML = "";
}

// --- Results rendering (manual mode) ---
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
  historyArea.appendChild(block);
  scrollToBottom();
}

// --- Itinerary rendering (with notes & time) ---
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
      <div class="itinerary-header">
        <span>${idx + 1}. ${escapeHTML(place.name)}</span>
        <button class="remove" onclick="removeFromItinerary(${idx})" title="Remove from itinerary">✕</button>
      </div>
      <div style="font-size:0.97em;">
        <div><b>Time Spent:</b> <input type="text" placeholder="e.g. 1 hr" value="${escapeHTML(place.timeSpent||'')}" 
          onchange="updateItineraryTime(${idx}, this.value)" style="width:75px;"/></div>
        <div><b>Notes:</b> <textarea placeholder="Add notes..." onchange="updateItineraryNotes(${idx}, this.value)">${escapeHTML(place.userNotes||'')}</textarea></div>
        <a class="itinerary-link" href="${escapeHTML(place.google_maps_url||'#")}" target="_blank">Google Maps</a>
      </div>
    `;
    itineraryEl.appendChild(li);
  });
}
window.addToItinerary = function(idx) {
  const place = lastPlaces[idx];
  if (place && !itinerary.some(x => x.name === place.name && x.address === place.address)) {
    itinerary.push({
      ...place,
      timeSpent: "",
      userNotes: ""
    });
    renderItinerary();
  }
};
window.removeFromItinerary = function(idx) {
  itinerary.splice(idx, 1);
  renderItinerary();
};
window.updateItineraryTime = function(idx, val) {
  itinerary[idx].timeSpent = val;
};
window.updateItineraryNotes = function(idx, val) {
  itinerary[idx].userNotes = val;
};

// --- Action UI and State ---
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
  scrollToBottom();
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
    btn.onclick = (e) => {
      e.preventDefault();
      showPlaceDetails(idx);
    };
    btnWrap.appendChild(btn);
  });
  div.appendChild(btnWrap);
  area.appendChild(div);
  scrollToBottom();
}

// --- Search and Details Logic (manual mode) ---
async function handleInput(query) {
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
    history.push({ query, offset, places: lastPlaces });
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
    // Render as a "tourism ad" style summary
    const block = document.createElement('div');
    block.className = 'history-block';
    block.innerHTML = `
      <div class="history-query">Discover: <span style="color:#3146b6;">${escapeHTML(detail.name || place.name || 'Unknown')}</span></div>
      <div style="font-size:1.08em; margin-bottom:7px; color:#2d464d;">
        ${makeTourismAdSummary(detail)}
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">${escapeHTML(detail.name || 'Unknown')}</span>
        </div>
        <div class="card-rating"><b>Rating:</b> ${typeof detail.rating === 'number' ? detail.rating : 'N/A'} (${detail.user_ratings_total || 0} reviews)</div>
        <div class="card-address"><b>Location:</b> ${escapeHTML(detail.address || '')}</div>
        ${detail.review ? `<div class="card-desc">${escapeHTML(detail.review)}</div>` : ""}
        <a class="card-link" href="${escapeHTML(detail.google_maps_url || '#')}" target="_blank" rel="noopener">View on Google Maps</a>
      </div>
    `;
    document.getElementById('historyArea').appendChild(block);
    renderActionPrompt();
    scrollToBottom();
  } catch (e) {
    alert("Sorry, couldn't fetch more details right now.");
    renderActionPrompt();
  }
}

// --- "Tourism ad" summary generator ---
function makeTourismAdSummary(detail) {
  // Some fallback values
  const name = escapeHTML(detail.name || "this place");
  const rating = typeof detail.rating === 'number' ? `${detail.rating}★` : "well-rated";
  const address = escapeHTML(detail.address || "Baguio City");
  const closing = detail.opening_hours && detail.opening_hours.weekday_text
    ? "Open: " + detail.opening_hours.weekday_text.join(", ")
    : (detail.hours || "");
  // Pick a positive review if present
  let review = "";
  if (detail.reviews && detail.reviews.length) {
    // Try to find a 4- or 5-star review
    let pos = detail.reviews.find(r => r.rating >= 4);
    if (!pos) pos = detail.reviews[0];
    if (pos) review = `"${escapeHTML(pos.text)}" – ${escapeHTML(pos.author_name || "a visitor")}`;
  } else if (detail.review) {
    review = `"${escapeHTML(detail.review)}"`;
  }
  return `
    <b>${name}</b> is a ${rating} destination located at ${address}. ${closing ? closing + ". " : ""}
    ${review ? `<br><span style="color: #299b2a;">${review}</span>` : ""}
    <br>Discover why so many people love <b>${name}</b>!
  `;
}

// --- Manual Chat/search input at bottom ---
document.getElementById('searchForm').onsubmit = e => {
  e.preventDefault();
  const inp = document.getElementById('searchInput');
  const val = inp.value.trim();
  if (!val) return;
  handleInput(val);
  inp.value = "";
};

// --- Itinerary PDF export ---
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

// --- Automatic Mode Form Submission (MODIFIED) ---
document.getElementById('automaticItineraryForm').onsubmit = async function(e) {
  e.preventDefault();
  const form = e.target;
  const prompt = form.prompt.value;
  const startTime = form.startTime.value;
  const endTime = form.endTime.value;

  // --- Use <gmp-place-autocomplete> selections (ADDED) ---
  if (!startPlace || !endPlace) {
    document.getElementById('itineraryResults').innerHTML =
      "<div style='color:red;'>Please select valid start and end locations using the autocomplete boxes.</div>";
    updateGenerateBtnState();
    return;
  }

  document.getElementById('itineraryResults').innerHTML = "<p>Generating your itinerary...</p>";

  // Call your backend API
  const res = await fetch('/api/automatic-itinerary', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({prompt, startTime, endTime, startLocation: startPlace, endLocation: endPlace})
  });
  const data = await res.json();

  // Store and render results
  autoModeItinerary = data.itinerary || [];
  renderAutomaticItinerary(autoModeItinerary);
};

// --- Automatic itinerary renderer ---
function renderAutomaticItinerary(itineraryArr) {
  const container = document.getElementById('itineraryResults');
  if (!itineraryArr.length) {
    container.innerHTML = "<p>No itinerary found. Try updating your preferences.</p>";
    return;
  }
  container.innerHTML = itineraryArr.map((stop, idx) => `
    <div class="card">
      <div><b>${escapeHTML(stop.time || "")}</b> — <span class="card-title">${escapeHTML(stop.name || "")}</span></div>
      <div>${escapeHTML(stop.description || "")}</div>
      <div><b>Address:</b> ${escapeHTML(stop.address || "")}</div>
      <a class="card-link" href="${escapeHTML(stop.google_maps_url || "#")}" target="_blank">View on Google Maps</a>
      <button class="card-btn" onclick="addToItineraryAuto(${idx})">Add to Itinerary</button>
    </div>
  `).join('');
}

// --- Add to Itinerary from Automatic Mode ---
window.addToItineraryAuto = function(idx) {
  const stop = autoModeItinerary[idx];
  if (stop && !itinerary.some(x => x.name === stop.name && x.address === stop.address)) {
    itinerary.push({
      ...stop,
      timeSpent: "",
      userNotes: ""
    });
    renderItinerary();
  }
};
