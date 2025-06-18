// Replace with your actual Google Apps Script URL
const scriptUrl = "https://script.google.com/macros/s/AKfycbziPhNO07r2ngZcDdzrwFg23Zaa_w643lMzvWSsMqjy4rNPT3Dkh5LJ9EIgVjFs5MiX/exec";
const corsProxy = "https://corsproxy.io/?";
const proxiedUrl = corsProxy + encodeURIComponent(scriptUrl);

// Example function to send data
function sendData(data) {
  fetch(proxiedUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(result => {
    console.log("Success:", result);
    // You can update the UI or show a message here
  })
  .catch(error => {
    console.error("Error:", error);
    // You can show an error message here
  });
}

// Example usage: Call sendData when a form is submitted
// document.getElementById("myForm").addEventListener("submit", function(event) {
//   event.preventDefault();
//   const data = {
//     name: document.getElementById("nameInput").value,
//     email: document.getElementById("emailInput").value
//   };
//   sendData(data);
// });
