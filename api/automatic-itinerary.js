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

  // Helper: Geocode start/end locations (no Baguio check)
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

  // Only geocode if locations provided (optional)
  let startLocInfo = null, endLocInfo = null;
  if (startLocation) startLocInfo = await geocodePlace(startLocation);
  if (endLocation) endLocInfo = await geocodePlace(endLocation);

  // If you want to require valid geocoding, uncomment below
  // if ((startLocation && !startLocInfo) || (endLocation && !endLocInfo)) {
  //   res.status(400).json({ error: 'Start or end location is invalid.' });
  //   return;
  // }

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
        opening_hours: result.opening_hours || null // <--- Add opening_hours here
      };
    })
  );

  // Group places by address or region (for efficiency)
  function groupPlacesByArea(places) {
    const groups = {};
    places.forEach(p => {
      // Group by first line of address (e.g. "Burnham Park, Baguio")
      const key = p.address?.split(',')[0] || p.address;
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

  // Improved Groq prompt
  const system = `
You are a Baguio City travel assistant. You are given a list of real places grouped by area, user interests, and their opening hours. Build an efficient step-by-step itinerary between ${startTime} and ${endTime}.
- Only use the places in the provided list.
- For each stop, assign a recommended time slot (e.g. 9:00-10:00am) it may take more than one hour depending on the task (eg. 10:00am-1:00pm).
- Group activities at the same area together before moving to a new area.
- Minimize travel and avoid backtracking.
- STRICTLY consider the opening and closing times for each place (provided as "Hours" for each).
- Do NOT assign a time when a place is closed.
- If a place cannot be visited because of its opening hours, skip it and mention it in the description.
- If a specific place is requested but is closed at the timeframe, replace it with a similar destination and note this in the description.
- Format the answer as a JSON array with keys: time, name, description, address, google_maps_url.
- Make Sure To Address The Users Needs.
- If they state a specific location is to be the first destination or last put them at the last of the list or first depending on what they gave.
- If given a timeline (Example: Mall --> Restaurants --> Activity) follow it.
- Consider opening times according to the Starting and ending times they have stated.
- If they ask you to just make one, create an itinerary that includes popular destinations, along with food stops and dont forget the previous instructions when doing so.
`;

  const userPrompt = `
User wants: ${prompt}
Start time: ${startTime}
End time: ${endTime}

PLACES (grouped by area):
${placesForPrompt}
  `;

  // Call Groq
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

  const groqData = await groqRes.json();
  let itinerary = [];
  try {
    const content = groqData.choices?.[0]?.message?.content || "";
    itinerary = JSON.parse(content);
  } catch (e) {
    // Try to extract JSON from markdown block
    const content = groqData.choices?.[0]?.message?.content || "";
    const match = content.match(/```json\s*([\s\S]+?)```/);
    if (match) {
      try { itinerary = JSON.parse(match[1]); } catch {}
    }
  }

  // Fallback: If LLM fails, just group places and assign times sequentially
  if (!Array.isArray(itinerary) || itinerary.length === 0) {
    let currentTime = startTime || "09:00";
    itinerary = [];
    Object.entries(groupedPlaces).forEach(([area, plist]) => {
      plist.forEach(p => {
        itinerary.push({
          time: currentTime,
          name: p.name,
          description: p.review || "",
          address: p.address,
          google_maps_url: p.google_maps_url
        });
        // Increment time by 1 hour for next stop (roughly)
        let h = parseInt(currentTime.split(':')[0], 10) + 1;
        currentTime = (h < 10 ? "0" : "") + h + ":00";
      });
    });
  }

  res.status(200).json({ itinerary });
}
