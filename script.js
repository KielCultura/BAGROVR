let itinerary = [];
let chatContext = {
  history: [],    // [{query, places}]
  lastResults: [],
  greeted: false,
  awaitingPreferences: true
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

// Results as stylish history block
function addResultsHistoryBlock(query, places) {
  const chatArea = document.getElementById('chat-area');
  const block = document.createElement('div');
  block.className = 'history-block';
  block.innerHTML = `<div class="history-query">Results for: <span style="color:#3146b6;">${escapeHTML(query)}</span></div>`;
  places.forEach((place, idx) => {
    const inItinerary = itinerary.some(x => x.name === place.name && x.address === place.address);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="place-row">
        <span class="place-number">${idx + 1}.</span>
        <div class="card-header">
          <span class="card-title">${escapeHTML(place.name || 'Unknown')}</span>
          <button class="card-btn" ${inItinerary ? 'disabled' : ''} onclick="addToItineraryFromChat(${chatContext.history.length},${idx})">
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
  chatArea.appendChild(block);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// Add to itinerary from chat result block
window.addToItineraryFromChat = function(histIdx, placeIdx) {
  const place = chatContext.history[histIdx].places[placeIdx];
  if (place && !itinerary.some(x => x.name === place.name && x.address === place.address)) {
    itinerary.push({...place});
    renderItinerary();
  }
}

// Itinerary
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
window.removeFromItinerary = function(idx) {
  itinerary.splice(idx, 1);
  renderItinerary();
}

// Conversational state machine
async function handleUserInput(input) {
  const low = input.trim().toLowerCase();

  // Place-specific question (e.g. "tell me more about Sunshine Park")
  const matchPlace = input.match(/(tell me more about|what is|what's|details.*|can you tell me about)\s+(.+)/i);
  if (matchPlace) {
    const name = matchPlace[2].trim().toLowerCase();
    for (let hIdx = chatContext.history.length - 1; hIdx >= 0; hIdx--) {
      const h = chatContext.history[hIdx];
      const idx = h.places.findIndex(p => p.name && p.name.toLowerCase().includes(name));
      if (idx !== -1) {
        await showPlaceDetails(h.places[idx]);
        return;
      }
    }
    addChatMessage("I couldn't find that place in our recent results. Try searching again?", "bot");
    return;
  }

  // Greet
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
    await fetchAndShowPlaces(input);
    return;
  }

  // After showing places: check for review requests or follow-up refinements
  if (!chatContext.awaitingPreferences && chatContext.history.length) {
    // 1-star to 5-star review request
    const reviewMatch = input.match(/(\d)[ -]?star/i);
    if (reviewMatch) {
      const rating = parseInt(reviewMatch[1]);
      // Try to match "for the (first|second|third|...)" or by place name
      let idx = 0;
      const whichPlace = input.match(/for the (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)/i);
      const ordinals = ["first","second","third","fourth","fifth","sixth","seventh","eighth","ninth","tenth"];
      if (whichPlace && whichPlace[1]) {
        idx = ordinals.indexOf(whichPlace[1].toLowerCase());
      }
      // fallback: try to match by name in current results
      if (input.match(/for (.+)/i) && idx === -1) {
        const nameStr = RegExp.$1.trim().toLowerCase();
        const lastPlaces = chatContext.history[chatContext.history.length-1].places;
        idx = lastPlaces.findIndex(p => p.name && p.name.toLowerCase().includes(nameStr));
        if (idx === -1) idx = 0;
      }
      if (chatContext.history.length && chatContext.history[chatContext.history.length-1].places[idx]) {
        await showPlaceReviewsByRating(chatContext.history[chatContext.history.length-1].places[idx], rating);
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
    chatContext.history.push({query, places: data.places});
    addResultsHistoryBlock(query, data.places);
    if (data.summary) addChatMessage(data.summary, "bot");
    else addChatMessage("Here are some places you might like!", "bot");
    addChatMessage("If you want to see specific reviews (e.g., 'Show me 1-star reviews for the first place'), or learn more about any place, just ask!", "bot");
  } catch (e) {
    addChatMessage("Sorry, I couldn't find any places right now. Please try again.", "bot");
  }
}

// Show more details about a place (as a history block)
async function showPlaceDetails(place) {
  addChatMessage(`Here's more about ${place.name}:`, "bot");
  addResultsHistoryBlock(`More about ${place.name}`, [place]);
  // Optionally, fetch additional details from your backend if needed
}

// Show reviews of a certain rating for a place (calls your API directly)
async function showPlaceReviewsByRating(place, rating) {
  addChatMessage(`Fetching ${rating}-star reviews for ${place.name}...`, "bot");
  try {
    const resp = await fetch('/api/google-places-groq', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ term: `${place.name} in Baguio City` })
    });
    if (!resp.ok) throw new Error(`API error (${resp.status})`);
    const data = await resp.json();
    // Find reviews with the given rating
    let reviews = [];
    if (data.places && data.places.length) {
      // Try to get all available reviews (if your API returns .reviews)
      reviews = data.places[0].reviews || [];
    }
    const filtered = reviews.filter(r => Math.round(r.rating) == rating);
    if (filtered.length) {
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
