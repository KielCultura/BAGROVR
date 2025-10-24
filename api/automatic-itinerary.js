const fetch = require('node-fetch');

const BAGUIO_LAT = 16.4023;
const BAGUIO_LNG = 120.5960;
const SEARCH_RADIUS_METERS = 6000; // Covers most of Baguio

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { prompt, startTime, endTime, startLocation, endLocation } = req.body;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (!apiKey || !groqKey) {
    res.status(500).json({ error: 'Missing API keys.' });
    return;
  }

  // --- Helper: Geocode start/end locations (optional) ---
  async function geocodePlace(placeStr) {
    if (!placeStr) return null;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(placeStr)}&key=${apiKey}`;
    const r = await fetch(url);
    const d = await r.json();
    const result = d.results?.[0];
    if (!result) return null;
    return {
      place_id: result.place_id,
      address: result.formatted_address,
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng
    };
  }

  // Optional geocoding (do not fail if absent)
  let startLocInfo = null, endLocInfo = null;
  if (startLocation) startLocInfo = await geocodePlace(startLocation);
  if (endLocation) endLocInfo = await geocodePlace(endLocation);

  // --- Tiny intent classifier (server-side) ---
  function classifyIntent(query) {
    if (!query || !query.trim()) return { intent: "ambiguous", score: 0 };
    const q = query.toLowerCase().trim();

    // Treat an exact single token "diy" as ambiguous by default (recommended UX).
    if (q === "diy") return { intent: "ambiguous", score: 0 };

    // Strong explicit tokens
    if (q.startsWith("plan:") || q.startsWith("itinerary:") || q.includes("itinerary") || q.match(/\bplan\b|\bcreate\b|\bmake\b/)) {
      return { intent: "plan_itinerary", score: 10 };
    }
    if (q.startsWith("find:") || q.startsWith("search:") || q.match(/\bnearby\b|\bnear\b|\bshop\b|\bstore\b/)) {
      return { intent: "search", score: -10 };
    }

    // Heuristics
    let score = 0;
    if (q.split(/\s+/).length === 1) score -= 2; // single-word often lookup
    if (q.includes("diy")) score -= 0; // don't bias heavily; we treated exact "diy" as ambiguous above

    const margin = 2;
    if (score >= margin) return { intent: "plan_itinerary", score };
    if (score <= -margin) return { intent: "search", score };
    return { intent: "ambiguous", score };
  }

  // Helper to add minutes to HH:MM string
  function addMinutes(timeStr, mins) {
    const [hhStr, mmStr] = (timeStr || "09:00").split(':');
    const hh = parseInt(hhStr, 10) || 9;
    const mm = parseInt(mmStr || "0", 10) || 0;
    const dt = new Date(0, 0, 0, hh, mm);
    dt.setMinutes(dt.getMinutes() + mins);
    const hh2 = String(dt.getHours()).padStart(2, '0');
    const mm2 = String(dt.getMinutes()).padStart(2, '0');
    return `${hh2}:${mm2}`;
  }

  // If classifier decides the user wants an itinerary (plan-only), bypass Google Places and ask LLM to produce a self-contained plan.
  const { intent } = classifyIntent(prompt || "");

  if (intent === "plan_itinerary") {
    // Strict LLM prompt: produce a JSON array itinerary (time, name, description, duration, materials, optional_shopping)
    const planSystem = `
You are an itinerary maker for Baguio City and for DIY projects. Do NOT return a list of shops only.
Create a self-contained itinerary based on the user's request. Provide ONLY valid JSON (a JSON array) where each item has these keys:
- time (string): formatted as "HH:MM-HH:MM" (use start/end times when possible)
- name (string): short title
- description (string): 1-2 sentences
- duration (integer): minutes
- materials (array or string): list of required materials or an empty array
- optional_shopping (string): ONE short sentence if materials need items; do NOT return lists of shops
- address (string): empty string "" if none
- google_maps_url (string): empty string "" if none
Return only JSON; do not include any explanatory text.
`;

    const planUser = `
User requested: ${prompt}
Start time: ${startTime || ""}
End time: ${endTime || ""}
Return ONLY a JSON array. Example item:
[{ "time": "09:00-10:00", "name": "Title", "description": "...", "duration": 60, "materials": ["..."], "optional_shopping":"", "address":"", "google_maps_url":"" }]
`;

    try {
      const groqResPlan = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3-70b-versatile',
          messages: [
            { role: "system", content: planSystem },
            { role: "user", content: planUser }
          ],
          temperature: 0.7,
          max_tokens: 1024,
        }),
      });

      const groqDataPlan = await groqResPlan.json();
      let itinerary = [];
      try {
        const content = groqDataPlan.choices?.[0]?.message?.content || "";
        itinerary = JSON.parse(content);
      } catch (e) {
        // Try to extract JSON from markdown block
        const content = groqDataPlan.choices?.[0]?.message?.content || "";
        const match = content.match(/```json\s*([\s\S]+?)```/);
        if (match) {
          try { itinerary = JSON.parse(match[1]); } catch (err) { /* fall through to fallback */ }
        }
      }

      // Fallback: if LLM returned bad shape, produce a sensible default schedule with proper time ranges and required keys
      if (!Array.isArray(itinerary) || itinerary.length === 0) {
        const start = startTime || "09:00";
        const defaultSteps = [
          { name: "Prep & materials", duration: 60, description: "Prepare materials and workspace.", materials: ["basic supplies (tape, glue, safety glasses)"] },
          { name: "Main build session", duration: 180, description: "Hands-on project session.", materials: ["project-specific materials", "tools"] },
          { name: "Finish & cleanup", duration: 60, description: "Finishing touches and cleanup.", materials: ["sandpaper","varnish"] }
        ];

        let cursor = start;
        itinerary = defaultSteps.map(s => {
          const end = addMinutes(cursor, s.duration);
          const item = {
            time: `${cursor}-${end}`,
            name: s.name,
            description: s.description,
            duration: s.duration,
            materials: Array.isArray(s.materials) ? s.materials : [s.materials],
            optional_shopping: "",
            address: "",
            google_maps_url: "",
            source: "generated"
          };
          cursor = end;
          return item;
        });
      } else {
        // Normalize items to ensure expected keys exist
        itinerary = itinerary.map(it => ({
          time: it.time || (startTime || "09:00"),
          name: it.name || "Activity",
          description: it.description || "",
          duration: typeof it.duration === 'number' ? it.duration : (it.duration ? Number(it.duration) || 60 : 60),
          materials: it.materials || [],
          optional_shopping: it.optional_shopping || "",
          address: it.address || "",
          google_maps_url: it.google_maps_url || "",
          source: it.source || "generated"
        }));
      }

      res.status(200).json({ itinerary });
      return;
    } catch (err) {
      // If the LLM call itself errors out, return a simple fallback itinerary so the client still gets something.
      const fallbackItinerary = [
        { time: `${startTime || "09:00"}-${addMinutes(startTime || "09:00", 60)}`, name: "Prep & materials", description: "Prepare materials and workspace.", duration: 60, materials: ["basic supp[...]" ],
        { time: `${addMinutes(startTime || "09:00", 60)}-${addMinutes(startTime || "09:00", 240)}`, name: "Main activity", description: "Hands-on project session.", duration: 180, materials: ["pr[...]" ]
      ];
      res.status(200).json({ itinerary: fallbackItinerary });
      return;
    }
  }

  // --- ELSE: Existing Places-based flow (unchanged) ---
  // Build Places API query for things to do near Baguio
  const placesQuery = `${prompt} in Baguio City`;
  const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(placesQuery)}&location=${BAGUIO_LAT},${BAGUIO_LNG}&radius=${SEARCH_RADIUS_METERS}&key=${apiKey}`;
  const resp = await fetch(placesUrl);
  const data = await resp.json();
  let places = (data.results || []).filter(p =>
    (p.formatted_address || '').toLowerCase().includes('baguio')
  ).slice(0, 8); // Limit to 8 top places

  // If no places found, show error
  if (!places.length) {
    res.status(404).json({ error: 'No places found in Baguio matching your interests.' });
    return;
  }

  // Get detailed info for each place (address, rating, URL, etc) INCLUDING opening_hours
  const detailedPlaces = await Promise.all(
    places.map(async place => {
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,rating,user_ratings_total,types,geometry,url,reviews,opening_hours&key=${apiKey}`;
      const detailsResp = await fetch(detailsUrl);
      const detailsData = await detailsResp.json();
      const result = detailsData.result || {};
      let positiveReview = "";
      if (result.reviews && Array.isArray(result.reviews)) {
        const positive = result.reviews.find(r => r.rating >= 4 && r.text && r.text.length > 0);
        if (positive) positiveReview = positive.text;
      }
      return {
        name: result.name,
        address: result.formatted_address,
        lat: result.geometry?.location?.lat,
        lng: result.geometry?.location?.lng,
        rating: result.rating,
        user_ratings_total: result.user_ratings_total,
        google_maps_url: result.url,
        review: positiveReview,
        types: result.types || [],
        opening_hours: result.opening_hours || null // keep opening_hours for schedule logic
      };
    })
  );

  // Group places by address or region (for efficiency)
  function groupPlacesByArea(placesArr) {
    const groups = {};
    placesArr.forEach(p => {
      // Group by first line of address (e.g. "Burnham Park, Baguio")
      const key = (p.address || "").split(',')[0].trim() || p.address || "Other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return groups;
  }

  const groupedPlaces = groupPlacesByArea(detailedPlaces);

  // Prepare places summary for the LLM, grouped by area, including opening hours
  let placesForPrompt = '';
  Object.entries(groupedPlaces).forEach(([area, plist], idx) => {
    placesForPrompt += `Area ${idx + 1}: ${area}\n`;
    plist.forEach((p, i) => {
      let hoursStr = '';
      if (p.opening_hours?.weekday_text) {
        hoursStr = ` | Hours: ${p.opening_hours.weekday_text.join('; ')}`;
      }
      placesForPrompt += `  - ${p.name} (${p.address}) | Rating: ${p.rating || "N/A"} (${p.user_ratings_total || 0} reviews)${hoursStr}\n`;
    });
  });

  // Improved Groq prompt (use opening hours to avoid closed assignments)
  const system = `
You are a Baguio City travel assistant. You are given a list of real places grouped by area, user interests, and their opening hours. Build an efficient step-by-step itinerary between ${startTime || "start"} and ${endTime || "end"} that:
- Only uses the places in the provided list.
- For each stop, assign a recommended time slot (e.g. 9:00-10:00am).
- Group activities at the same area together before moving to a new area.
- Minimize travel and avoid backtracking.
- STRICTLY consider the opening and closing times for each place (provided as "Hours" for each).
- Do NOT assign a time when a place is closed.
- If a place cannot be visited because of its opening hours, skip it and mention it in the description.
- If a specific place is requested but is closed at the timeframe, replace it with a similar destination and note this in the description.
- Format the answer as a JSON array with keys: time, name, description, address, google_maps_url.
- Make sure to address the user's needs.
`;

  const userPrompt = `
User wants: ${prompt}
Start time: ${startTime}
End time: ${endTime}

PLACES (grouped by area):
${placesForPrompt}
  `;

  // Call Groq (LLM) to build itinerary from places
  let groqData;
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3-70b-versatile',
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    groqData = await groqRes.json();
  } catch (e) {
    groqData = null;
  }

  let itinerary = [];
  if (groqData) {
    try {
      const content = groqData.choices?.[0]?.message?.content || "";
      itinerary = JSON.parse(content);
    } catch (e) {
      // Try to extract JSON from markdown block
      const content = groqData.choices?.[0]?.message?.content || "";
      const match = content.match(/```json\s*([\s\S]+?)```/);
      if (match) {
        try { itinerary = JSON.parse(match[1]); } catch (err) { /* continue to fallback */ }
      }
    }
  }

  // Fallback: If LLM fails, just group places and assign times sequentially with consistent keys
  if (!Array.isArray(itinerary) || itinerary.length === 0) {
    let currentTime = startTime || "09:00";
    itinerary = [];
    // Simple sequential pass through grouped places
    Object.entries(groupedPlaces).forEach(([area, plist]) => {
      plist.forEach(p => {
        itinerary.push({
          time: currentTime,
          name: p.name,
          description: p.review || "",
          address: p.address || "",
          google_maps_url: p.google_maps_url || "",
          source: "places"
        });
        // Increment time by 1 hour for next stop (roughly)
        let h = parseInt(currentTime.split(':')[0], 10) + 1;
        if (Number.isNaN(h)) h = 10;
        currentTime = (h < 10 ? "0" : "") + h + ":00";
      });
    });
  }

  res.status(200).json({ itinerary });
};
