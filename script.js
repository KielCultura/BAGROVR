async function fetchConversationalSummary(term, location = "Baguio City, Philippines") {
  const res = await fetch('/api/yelp-groq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      term,
      location,
      limit: 10,
      sort_by: 'best_match'
    })
  });
  if (!res.ok) {
    const errorMsg = (await res.json()).error || "Failed to fetch summary";
    throw new Error(errorMsg);
  }
  const data = await res.json();
  return data.summary || "No summary available.";
}

document.getElementById('searchForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const term = document.getElementById('establishment').value.trim();
  const location = document.getElementById('location').value.trim() || "Baguio City, Philippines";
  const resultDiv = document.getElementById('result');
  if (!term) return;
  resultDiv.innerHTML = '<span class="loading">Looking for the best results...</span>';
  try {
    const summary = await fetchConversationalSummary(term, location);
    resultDiv.innerHTML = summary.replace(/\n/g, "<br>");
  } catch (err) {
    resultDiv.innerHTML = `<span class="error">${err.message}</span>`;
  }
});