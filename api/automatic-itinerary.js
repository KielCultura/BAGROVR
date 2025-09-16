const fetch = require('node-fetch');

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

  // 1. Get candidate places from Places Text Search
  const query = `${prompt} near ${startLocation}`;
  const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=&key=${apiKey}`;
  const resp = await fetch(placesUrl);
  const data = await resp.json();
  const places = (data.results || []).slice(0, 8); // Limit to 8 top places

  // 2. Fetch detailed info for each place
  const detailedPlaces = await Promise.all(
    places.map(async place => {
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,rating,user_ratings_total,types,geometry,photos,url,reviews&key=${apiKey}`;
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
        rating: result.rating,
        user_ratings_total: result.user_ratings_total,
        google_maps_url: result.url,
        review: positiveReview
      };
    })
  );

  // 3. Create a summary string of places for the LLM
  const placesForPrompt = detailedPlaces.map((p, i) =>
    `${i + 1}. ${p.name} (${p.address}) - Rating: ${p.rating || "N/A"} (${p.user_ratings_total || 0} reviews)`
  ).join('\n');

  // 4. Compose prompt for Groq
  const system = `You are a Baguio City travel assistant. You are given a list of real places, user interests, and times. Build a step-by-step itinerary between ${startTime} and ${endTime}, starting at "${startLocation}" and ending at "${endLocation}". Only use the places listed below. For each stop, pick a place, assign a time, and write a short, friendly description. NEVER invent a new place—use only those provided. Format the answer as a JSON array with keys: time, name, description, address, google_maps_url.`;

  const userPrompt = `
User wants: ${prompt}
Start time: ${startTime}
End time: ${endTime}
Start location: ${startLocation}
End location: ${endLocation}

PLACES:
${placesForPrompt}
  `;

  // 5. Call Groq
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
      max_tokens: 800,
    }),
  });

  const groqData = await groqRes.json();
  let itinerary = [];
  try {
    const content = groqData.choices?.[0]?.message?.content || "";
    // Try direct JSON
    itinerary = JSON.parse(content);
  } catch (e) {
    // Try to extract JSON from markdown block
    const content = groqData.choices?.[0]?.message?.content || "";
    const match = content.match(/```json\s*([\s\S]+?)```/);
    if (match) {
      try { itinerary = JSON.parse(match[1]); } catch {}
    }
  }

  // Fallback: If LLM fails, use places as is
  if (!Array.isArray(itinerary) || itinerary.length === 0) {
    itinerary = detailedPlaces.map((p, i) => ({
      time: "",
      name: p.name,
      description: p.review || "",
      address: p.address,
      google_maps_url: p.google_maps_url
    }));
  }

  res.status(200).json({ itinerary });
};
