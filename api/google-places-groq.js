const fetch = require('node-fetch');

const BAGUIO_LAT = 16.4023;
const BAGUIO_LNG = 120.5960;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { term } = req.body;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (!apiKey || !groqKey) {
    return res.status(500).json({ error: "Missing API keys." });
  }

  // Get hotels in Baguio City
  let places = [];
  let next_page_token = null;
  for (let i = 0; i < 3 && places.length < 10; i++) {
    let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${BAGUIO_LAT},${BAGUIO_LNG}&radius=5000&type=lodging&key=${apiKey}`;
    if (next_page_token) url += `&pagetoken=${next_page_token}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.results) places = places.concat(data.results);
    next_page_token = data.next_page_token;
    if (!next_page_token) break;
    await new Promise(r => setTimeout(r, 2000));
  }

  // Get Details for top 10 hotels only
  const topResults = places.slice(0, 10);
  const hotels = await Promise.all(topResults.map(async (place) => {
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,rating,user_ratings_total,reviews,url&key=${apiKey}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();
    const hotel = detailsData.result || {};

    // Filter reviews: only keep those with rating >= 4
    let positiveReview = "";
    if (hotel.reviews && Array.isArray(hotel.reviews)) {
      const positive = hotel.reviews.filter(r => r.rating >= 4 && r.text && r.text.length > 0);
      if (positive.length > 0) {
        // Pick the first positive review
        positiveReview = positive[0].text;
      }
    }
    return {
      name: hotel.name,
      address: hotel.formatted_address,
      rating: hotel.rating,
      user_ratings_total: hotel.user_ratings_total,
      google_maps_url: hotel.url,
      review: positiveReview
    };
  }));

  // For Groq, only include positive reviews in prompt
  const hotelsForPrompt = hotels.map(hotel => ({
    name: hotel.name,
    address: hotel.address,
    rating: hotel.rating,
    user_ratings_total: hotel.user_ratings_total,
    google_maps_url: hotel.google_maps_url,
    review: hotel.review // Already filtered above
  }));

  const prompt = `
You are a friendly local guide. Given this Google Places data, write a helpful, friendly top ${hotelsForPrompt.length} list for a tourist in Baguio City looking for hotels. For each place, mention the name, rating, number of reviews, a fun detail, and provide a Google Maps link. Only refer to positive reviews (4 or 5 stars). Be concise and conversational.

Google Places data:
${JSON.stringify(hotelsForPrompt, null, 2)}
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

  res.status(200).json({ summary, places: hotelsForPrompt });
};
