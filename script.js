let itinerary = [];
let lastPlaces = [];

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"'`=\/]/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
  })[s]);
}

function renderResults(places) {
  const resultsEl = document.getElementById('results');
  const resultsTitleEl = document.getElementById('resultsTitle');
  resultsEl.innerHTML = '';
  lastPlaces = Array.isArray(places) ? places : [];
  if (!lastPlaces.length) {
    resultsTitleEl.style.display = "none";
    resultsEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No places found.</div>';
    return;
  }
  resultsTitleEl.style.display = "block";
  lastPlaces.forEach((place, idx) => {
    const inItinerary = itinerary.some(x => x.name === place.name && x.address === place.address);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="place-row">
        <span class="place-number">${idx + 1}.</span>
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
    resultsEl.appendChild(card);
  });
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
    itinerary.push(place);
    renderItinerary();
    renderResults(lastPlaces);
  }
}
window.removeFromItinerary = function(idx) {
  itinerary.splice(idx, 1);
  renderItinerary();
  renderResults(lastPlaces);
}

// === Chatbot logic ===
function addChatMessage(msg, from = "bot") {
  const box = document.getElementById('chatbot-messages');
  const div = document.createElement('div');
  div.style.maxWidth = "80%";
  div.style.alignSelf = from === "user" ? "flex-end" : "flex-start";
  div.style.background = from === "user" ? "#e7f0ff" : "#f2f2fc";
  div.style.color = "#222";
  div.style.padding = "8px 12px";
  div.style.borderRadius = "10px";
  div.innerText = msg;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function chatbotParseIntent(text) {
  let query = "";
  let lower = text.toLowerCase();

  if (lower.includes("family") || lower.includes("kid")) query += "family friendly ";
  if (lower.includes("nature") || lower.includes("park")) query += "nature ";
  if (lower.includes("food") || lower.includes("eat")) query += "food ";
  if (lower.includes("open late") || lower.includes("night")) query += "open late ";
  if (lower.includes("hotel") || lower.includes("stay")) query += "hotels ";

  if (!query) query = text;

  return query.trim();
}

async function chatbotHandleInput(text) {
  addChatMessage("Let me find the best places for you...", "bot");
  const query = chatbotParseIntent(text);
  try {
    const resp = await fetch('/api/google-places-groq', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ term: query })
    });
    if (!resp.ok) throw new Error(`API error (${resp.status})`);
    const data = await resp.json();
    if (data.summary) addChatMessage(data.summary, "bot");
    else addChatMessage("Here are some great places I found!", "bot");
    renderResults(Array.isArray(data.places) ? data.places : []);
  } catch (e) {
    addChatMessage("Sorry, I couldn't find any places right now. Please try again.", "bot");
    renderResults([]);
  }
}

document.getElementById('chatbot-form').onsubmit = e => {
  e.preventDefault();
  const inp = document.getElementById('chatbot-input');
  const val = inp.value.trim();
  if (!val) return;
  addChatMessage(val, "user");
  chatbotHandleInput(val);
  inp.value = "";
};

document.getElementById('chatbot-toggle').onclick = () => {
  const box = document.getElementById('chatbot-box');
  box.style.display = (box.style.display === "flex") ? "none" : "flex";
  if (box.style.display === "flex") {
    setTimeout(() => document.getElementById('chatbot-input').focus(), 100);
    if (!box.getAttribute('data-greeted')) {
      addChatMessage("Hi! 👋 I'm your BagRovr chatbot. Tell me what you want to do in Baguio, and I'll recommend the best places. (E.g. 'I want food spots for kids open late')");
      box.setAttribute('data-greeted', '1');
    }
  }
};

function exportItineraryAsPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const font = 'helvetica'; // Set your preferred font
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
  renderResults([]);
};
