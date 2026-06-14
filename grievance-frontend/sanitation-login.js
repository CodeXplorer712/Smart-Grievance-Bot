document.getElementById('loginBtn').addEventListener('click', function () {
  var username = document.getElementById('username').value.trim();
  var password = document.getElementById('password').value;
  var errorMsg = document.getElementById('errorMsg');

  if (username === 'sanitation' && password === 'sanitation@2026') {
    errorMsg.style.display = 'none';
    sessionStorage.setItem('sanitation_logged_in', 'true');
    window.location.href = 'sanitation.html';
  } else {
    errorMsg.textContent = 'Invalid username or password';
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
