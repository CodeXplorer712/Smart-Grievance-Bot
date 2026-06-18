var API_URL = 'http://127.0.0.1:8000';
document.getElementById('loginBtn').addEventListener('click', async function () {
  var username = document.getElementById('username').value.trim();
  var password = document.getElementById('password').value;
  var errorMsg = document.getElementById('errorMsg');

  try {
    var response = await fetch(API_URL + '/worker/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    });
    if (response.ok) {
      var data = await response.json();
      errorMsg.style.display = 'none';
      sessionStorage.setItem('worker_logged_in', 'true');
      sessionStorage.setItem('worker_name', data.name);
      sessionStorage.setItem('worker_username', data.username);
      sessionStorage.setItem('worker_zone_lat', data.zone_lat);
      sessionStorage.setItem('worker_zone_lng', data.zone_lng);
      sessionStorage.setItem('worker_zone_radius', data.zone_radius_km);
      window.location.href = 'sanitation.html';
    } else {
      errorMsg.textContent = 'Invalid username or password';
      errorMsg.style.display = 'block';
    }
  } catch (err) {
    errorMsg.textContent = 'Could not connect to server';
    errorMsg.style.display = 'block';
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    document.getElementById('loginBtn').click();
  }
});
document.getElementById('togglePassword').addEventListener('click', function () {
  var passwordInput = document.getElementById('password');
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
  } else {
    passwordInput.type = 'password';
  }
});
