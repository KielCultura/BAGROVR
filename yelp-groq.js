export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { location, term, limit = 10, sort_by = "best_match" } = req.body;

  if (!location || !term) {
    return res.status(400).json({ error: "Missing 'location' or 'term'." });
  }

  // 1. Fetch Yelp data
  const yelpRes = await fetch(
    `https://api.yelp.com/v3/businesses/search?location=${encodeURIComponent(location)}&term=${encodeURIComponent(term)}&limit=${limit}&sort_by=${sort_by}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.YELP_API_KEY}`,
      },
    }
  );
  const yelpData = await yelpRes.json();

  if (!yelpData.businesses || yelpData.businesses.length === 0) {
    return res.status(404).json({ error: "No businesses found." });
  }

  // 2. Send Yelp data to Groq for conversational summary
  const prompt = `
You are a friendly local guide. Given this Yelp data, write a friendly, helpful top 10 list for a tourist in ${location} looking for ${term}. Mention the name, rating, and a fun detail or two from the data for each. Be concise and conversational.

Yelp data:
${JSON.stringify(yelpData.businesses, null, 2)}
`;

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: "llama3-8b-8192",
      messages: [
        { role: "user", content: prompt }
      ],
      max_tokens: 800,
      temperature: 0.7,
    }),
  });

  const groqJson = await groqRes.json();
  const conversationalText = groqJson.choices?.[0]?.message?.content || "Sorry, something went wrong with our guide.";

  res.status(200).json({ summary: conversationalText });
}