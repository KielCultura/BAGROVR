export default async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  // Get fields from request (these match your frontend)
  const { prompt, startTime, endTime, startLocation, endLocation } = req.body;

  // Simulated sample itinerary (replace with real AI logic later)
  const itinerary = [
    {
      time: startTime,
      name: "Burnham Park",
      description: "Start your day with a relaxing walk at Burnham Park.",
      address: "Jose Abad Santos Dr, Baguio, 2600 Benguet",
      google_maps_url: "https://goo.gl/maps/Cg2Qf8A5r2G2"
    },
    {
      time: "11:00",
      name: "Baguio Cathedral",
      description: "Visit the iconic Baguio Cathedral.",
      address: "Cathedral Loop, Baguio, Benguet",
      google_maps_url: "https://goo.gl/maps/2x4VvPhnP4v"
    },
    {
      time: endTime,
      name: endLocation,
      description: "Wrap up your day at your destination.",
      address: endLocation,
      google_maps_url: "#"
    }
  ];

  res.status(200).json({ itinerary });
};
