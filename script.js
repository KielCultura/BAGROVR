let itinerary = [];
let lastPlaces = [];
let chatContext = {
  awaitingPreferences: true,
  lastQuery: "",
  lastBotMsg: "",
  awaitingReviewRequest: false,
  lastResults: [],
  lastPlaceIndex: null,
  greeted: false
};

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"'`=\/]/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
  })[s]);
}

// Chat UI
function addChatMessage(msg, type = "bot") {
  const chatArea = document.getElementById('chat-area');
  const row = document.createElement('div');
  row.className = 'chat-message';
  const bubble = document.createElement('div');
  bubble.className = type === "bot" ? 'chat-bot' : 'chat-user';
  bubble.innerText = msg;
  row.appendChild(bubble);
  chatArea.appendChild(row);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// Render results as cards (preserve your design)
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

// Itinerary (preserve your design)
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

// Conversational state machine
async function handleUserInput(input) {
  const low = input.trim().toLowerCase();
  if (!chatContext.greeted && ["hi", "hello", "hey"].includes(low)) {
    addChatMessage("Hi! 👋 I'm your BagRovr guide. What kind of places are you looking for in Baguio? (e.g. food, nature, hotels, family-friendly, open late...)", "bot");
    chatContext.greeted = true;
    chatContext.awaitingPreferences = true;
    return;
  }

  // If waiting for preferences
  if (chatContext.awaitingPreferences) {
    // Try to extract intent
    const keywords = ["food", "eat", "restaurant", "cafe", "park", "nature", "family", "kid", "open late", "hotel", "stay", "museum", "shopping", "mall", "art", "bar", "pub", "night"];
    const found = keywords.some(kw => low.includes(kw));
    if (!found) {
      addChatMessage("Could you tell me more about what kind of place or experience you want? (e.g. 'Nature parks', 'family-friendly food', 'hotels open late')", "bot");
      return;
    }
    chatContext.awaitingPreferences = false;
    chatContext.lastQuery = input;
    await fetchAndShowPlaces(input);
    return;
  }

  // After showing places: check for review requests or follow-up refinements
  if (!chatContext.awaitingPreferences && lastPlaces.length) {
    // 1-star to 5-star review request
    const reviewMatch = input.match(/(\d)[ -]?star/i);
    if (reviewMatch) {
      const rating = parseInt(reviewMatch[1]);
      const whichPlace = input.match(/first|second|third|(\d+)(st|nd|rd|th)?/i);
      let idx = 0;
      if (whichPlace && whichPlace[1]) {
        idx = parseInt(whichPlace[1], 10) - 1;
      } else if (/second/.test(input)) {
        idx = 1;
      } else if (/third/.test(input)) {
        idx = 2;
      }
      if (lastPlaces[idx]) {
        await showPlaceReviewsByRating(idx, rating);
      } else {
        addChatMessage("Which place would you like reviews for? (e.g. 'Show me 1-star reviews for the first place')", "bot");
      }
      return;
    }
    // New preferences/refinement
    if (input.match(/more|else|another|different|change|other/)) {
      addChatMessage("Sure! What type of places do you want this time? (e.g. food, parks, hotels, etc.)", "bot");
      chatContext.awaitingPreferences = true;
      return;
    }
    // Otherwise, treat as new preferences
    chatContext.awaitingPreferences = true;
    await handleUserInput(input);
    return;
  }
}

// Fetch and show places (calls your API)
async function fetchAndShowPlaces(query) {
  addChatMessage("Let me find the best places for you...", "bot");
  try {
    const resp = await fetch('/api/google-places-groq', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ term: query })
    });
    if (!resp.ok) throw new Error(`API error (${resp.status})`);
    const data = await resp.json();
    chatContext.lastResults = data.places;
    renderResults(Array.isArray(data.places) ? data.places : []);
    if (data.summary) addChatMessage(data.summary, "bot");
    else addChatMessage("Here are some places you might like!", "bot");
    addChatMessage("If you want to see specific reviews (e.g., 'Show me 1-star reviews for the first place'), just ask!", "bot");
  } catch (e) {
    addChatMessage("Sorry, I couldn't find any places right now. Please try again.", "bot");
    renderResults([]);
  }
}

// Show reviews of a certain rating for a selected place (calls your API directly)
async function showPlaceReviewsByRating(idx, rating) {
  const place = lastPlaces[idx];
  if (!place) {
    addChatMessage("Sorry, I couldn't find that place.", "bot");
    return;
  }
  addChatMessage(`Fetching ${rating}-star reviews for ${place.name}...`, "bot");
  try {
    // Fetch place details
    const apiKey = ""; // If you proxy this in your backend, you don't need a key here.
    // We'll call your backend with a special term to trigger review-only mode
    const resp = await fetch('/api/google-places-groq', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ term: `${place.name} in Baguio City` })
    });
    if (!resp.ok) throw new Error(`API error (${resp.status})`);
    const data = await resp.json();
    // Find reviews with the given rating
    const reviews = (data.places && data.places[0] && data.places[0].reviews)
      ? data.places[0].reviews : [];
    const filtered = reviews
      ? reviews.filter(r => Math.round(r.rating) == rating)
      : [];

    if (filtered && filtered.length) {
      filtered.slice(0, 3).forEach(r =>
        addChatMessage(`"${r.text}"\n– ${r.author_name || "Anonymous"}`, "bot")
      );
    } else {
      addChatMessage(`No ${rating}-star reviews found for ${place.name}.`, "bot");
    }
  } catch (e) {
    addChatMessage("Sorry, couldn't fetch reviews at this time.", "bot");
  }
}

// Chat input handling
document.getElementById('chatbot-form').onsubmit = e => {
  e.preventDefault();
  const inp = document.getElementById('chatbot-input');
  const val = inp.value.trim();
  if (!val) return;
  addChatMessage(val, "user");
  handleUserInput(val);
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
  addChatMessage("Hi! 👋 I'm your BagRovr guide. What kind of places are you looking for in Baguio? (e.g. food, nature, hotels, family-friendly, open late...)", "bot");
  chatContext.greeted = true;
};
