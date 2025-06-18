const scriptUrl = "https://script.google.com/macros/s/AKfycbziPhNO07r2ngZcDdzrwFg23Zaa_w643lMzvWSsMqjy4rNPT3Dkh5LJ9EIgVjFs5MiX/exec";
const corsProxy = "https://corsproxy.io/?";
const proxiedUrl = corsProxy + encodeURIComponent(scriptUrl);

function sendData(data) {
  return fetch(proxiedUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  })
  .then(response => response.json());
}

document.getElementById("myForm").addEventListener("submit", function(event) {
  event.preventDefault();
  const name = document.getElementById("nameInput").value;
  const email = document.getElementById("emailInput").value;
  const resultDiv = document.getElementById("result");
  resultDiv.textContent = "Sending...";

  sendData({ name, email })
    .then(result => {
      resultDiv.textContent = "Success! Response: " + JSON.stringify(result);
      document.getElementById("myForm").reset();
    })
    .catch(error => {
      resultDiv.textContent = "Error: " + error;
    });
});
