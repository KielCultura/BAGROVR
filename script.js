// WARNING: Putting API keys in frontend JS is NOT secure for production or public demos! YES TEST LANG PLS HACKER HAVE MERCY THIS API IS FREE ANYWAYS 

const GROQ_API_KEY = ''; // TODO: Replace with your actual key for testing. Remove before sharing!
const endpoint = 'https://api.groq.com/openai/v1/chat/completions'; // Adjust API endpoint if GROQ docs change

document.getElementById('searchForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const query = document.getElementById('searchInput').value.trim();
  if (!query) return;

  const resultDiv = document.getElementById('result');
  resultDiv.textContent = 'Loading...';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768', // or whatever model you want (check GROQ docs)
        messages: [
          { role: 'user', content: query }
        ]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP error ${res.status}`);
    }

    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content || '(No reply)';
    resultDiv.innerHTML = `<b>Response:</b><br>${answer}`;
  } catch (err) {
    resultDiv.innerHTML = `<span class="error">Error: ${err.message}</span>`;
  }
});
