document.getElementById("loginBtn").addEventListener("click", function () {
    var username = document.getElementById("username").value;
    var password = document.getElementById("password").value;
    var errorMsg = document.getElementById("errorMsg");

    if (username === "admin" && password === "grievance@2026") {
        sessionStorage.setItem("admin_logged_in", "true");
        window.location.href = "admin.html";
    } else {
        errorMsg.textContent = "Invalid username or password";
        errorMsg.hidden = false;
    }
});

document.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
        document.getElementById("loginBtn").click();
    }
});
