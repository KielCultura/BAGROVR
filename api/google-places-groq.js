const fetch = require('node-fetch');

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { term } = req.body;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (!apiKey || !groqKey) {
    return res.status(500).json({ error: "Missing API keys." });
  }

  // Use Google Places Text Search API for flexible queries
  let query = term ? `${term} in Baguio City` : "hotels in Baguio City";
  let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
  const resp = await fetch(url);
  const data = await resp.json();
  const places = (data.results || []).slice(0, 10);

  // Get Details for top 10 places only
  const detailedPlaces = await Promise.all(places.map(async (place) => {
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,rating,user_ratings_total,reviews,url&key=${apiKey}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();
    const result = detailsData.result || {};

    // Filter reviews: only keep those with rating >= 4
    let positiveReview = "";
    if (result.reviews && Array.isArray(result.reviews)) {
      const positive = result.reviews.filter(r => r.rating >= 4 && r.text && r.text.length > 0);
      if (positive.length > 0) {
        positiveReview = positive[0].text;
      }
    }
    return {
      name: result.name,
      address: result.formatted_address,
      rating: result.rating,
      user_ratings_total: result.user_ratings_total,
      google_maps_url: result.url,
      review: positiveReview
    };
  }));

  const placesForPrompt = detailedPlaces.map(place => ({
    name: place.name,
    address: place.address,
    rating: place.rating,
    user_ratings_total: place.user_ratings_total,
    google_maps_url: place.google_maps_url,
    review: place.review
  }));

  const prompt = `
You are a friendly local guide. Given this Google Places data, write a helpful, friendly top ${placesForPrompt.length} list for a tourist in Baguio City looking for ${term}. For each place, mention the name, rating, number of reviews, a fun detail, and provide a Google Maps link. Only refer to positive reviews (4 or 5 stars). Be concise and conversational.

Google Places data:
${JSON.stringify(placesForPrompt, null, 2)}
`;

  let summary = "Sorry, something went wrong with our guide.";
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });
    const groqJson = await groqRes.json();
    summary = groqJson.choices?.[0]?.message?.content || summary;
  } catch (e) {
    // fallback: skip summary
  }

  res.status(200).json({ summary, places: placesForPrompt });
};
