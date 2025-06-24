// ... other code ...
const places = await Promise.all(
  searchData.results.map(async (place) => {
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,rating,user_ratings_total,reviews,formatted_address,url,types&key=${apiKey}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();
    return detailsData.result || {};
  })
);

// Filter for hotels (lodging)
const hotels = places.filter(place => place.types && place.types.includes('lodging'));
const topHotels = hotels.slice(0, 10);

const placesForPrompt = topHotels.map(place => ({
  name: place.name,
  address: place.formatted_address,
  rating: place.rating,
  user_ratings_total: place.user_ratings_total,
  google_maps_url: place.url,
  review: place.reviews?.[0]?.text
}));

const prompt = `
You are a friendly local guide. Given this Google Places data, write a helpful, friendly top ${placesForPrompt.length} list for a tourist in ${location} looking for ${term}. For each place, mention the name, rating, number of reviews, a fun detail, and provide a Google Maps link. If reviews are few, let the user know. Be concise and conversational.

Google Places data:
${JSON.stringify(placesForPrompt, null, 2)}

If there are fewer than 10 places, just list the available ones. Do not invent or pad with unrelated places.
`;
// ...rest of code...
