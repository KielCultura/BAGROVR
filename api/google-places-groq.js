export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { term, location } = req.body;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  // 1. Text Search for places
  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(term + ' in ' + location)}&key=${apiKey}`;
  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();

  if (!searchData.results || searchData.results.length === 0)
    return res.status(404).json({ error: "No places found." });

  // 2. For each place, get details (including reviews)
  const places = await Promise.all(
    searchData.results.slice(0, 10).map(async (place) => {
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,rating,user_ratings_total,review,formatted_address,url,types,photos&key=${apiKey}`;
      const detailsRes = await fetch(detailsUrl);
      const detailsData = await detailsRes.json();
      return detailsData.result || {};
    })
  );

  // 3. Construct prompt for Groq
  const prompt = `
You are a friendly local guide. Given this Google Places data, write a helpful, friendly top 10 list for a tourist in ${location} looking for ${term}. For each place, mention the name, rating, number of reviews, a fun detail, and provide a Google Maps link. If reviews are few, let the user know. Be concise and conversational.

Google Places data:
${JSON.stringify(places, null, 2)}
`;

  // 4. Call Groq
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
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
  const summary = groqJson.choices?.[0]?.message?.content || "Sorry, something went wrong with our guide.";

  res.status(200).json({ summary });
}
