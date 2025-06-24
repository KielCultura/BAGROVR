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

async function fetchResults(query) {
  const resultsEl = document.getElementById('results');
  const resultsTitleEl = document.getElementById('resultsTitle');
  let normalized = query.trim();
  if (!/baguio city/i.test(normalized)) {
    normalized += " in Baguio City";
  }
  resultsTitleEl.style.display = "none";
  resultsEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #4169e1;">Searching...</div>';
  try {
    const resp = await fetch('/api/google-places-groq', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ term: normalized })
    });
    if (!resp.ok) throw new Error(`API error (${resp.status})`);
    const data = await resp.json();
    renderResults(Array.isArray(data.places) ? data.places : []);
  } catch (err) {
    resultsEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #e64;">Sorry, something went wrong. Please try again.</div>';
  }
}

document.getElementById('searchForm').onsubmit = e => {
  e.preventDefault();
  const query = document.getElementById('searchInput').value.trim();
  if (query) {
    fetchResults(query);
    document.getElementById('searchInput').value = '';
  }
};

window.onload = () => {
  renderItinerary();
  renderResults([]);
};
