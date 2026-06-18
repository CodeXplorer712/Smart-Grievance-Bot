// Auth check
if (sessionStorage.getItem("admin_logged_in") !== "true") {
    window.location.href = "admin-login.html";
}
var API_URL = "http://127.0.0.1:8000";
var allComplaints = [];
var filteredComplaints = [];
var categoryChart = null;
var statusChart = null;
var trendChart = null;
// Session timeout
var SESSION_TIMEOUT = 15 * 60 * 1000;
var WARNING_TIME = 13 * 60 * 1000;
var sessionTimer = null;
var warningTimer = null;
function resetSessionTimer() {
    clearTimeout(sessionTimer);
    clearTimeout(warningTimer);
    warningTimer = setTimeout(function () {
        alert("Your session will expire in 2 minutes due to inactivity.");
    }, WARNING_TIME);
    sessionTimer = setTimeout(function () {
        sessionStorage.removeItem("admin_logged_in");
        window.location.href = "admin-login.html";
    }, SESSION_TIMEOUT);
}
document.addEventListener("click", resetSessionTimer);
document.addEventListener("keydown", resetSessionTimer);
document.addEventListener("mousemove", resetSessionTimer);
document.addEventListener("scroll", resetSessionTimer);
resetSessionTimer();
// Navigation
var navLinks = document.querySelectorAll(".sidebar-nav .nav-link");
var sections = document.querySelectorAll(".content-section");
navLinks.forEach(function (link) {
    link.addEventListener("click", function (e) {
        e.preventDefault();
        navLinks.forEach(function (l) { l.classList.remove("active"); });
        link.classList.add("active");
        var target = link.id.replace("nav-", "section-");
        sections.forEach(function (s) { s.style.display = "none"; });
        document.getElementById(target).style.display = "block";
        if (target === "section-analytics") {
            buildCharts();
            buildHotspots();
        }
    });
});
// Logout
document.getElementById("logoutBtn").addEventListener("click", function () {
    sessionStorage.removeItem("admin_logged_in");
    window.location.href = "admin-login.html";
});
// Fetch all complaints
function fetchComplaints() {
    fetch(API_URL + "/complaints/all")
        .then(function (res) { return res.json(); })
        .then(function (data) {
            allComplaints = data;
            updateSummary();
            renderRecentTable();
            populateCategoryFilter();
            applyFilters();
        })
        .catch(function (err) {
            console.error("Failed to fetch complaints:", err);
        });
}
// Summary cards
function updateSummary() {
    var total = allComplaints.length;
    var pending = 0;
    var inprogress = 0;
    var resolved = 0;
    for (var i = 0; i < allComplaints.length; i++) {
        var s = allComplaints[i].status;
        if (s === "Pending") pending++;
        else if (s === "In Progress") inprogress++;
        else if (s === "Resolved") resolved++;
    }
    document.getElementById("total-count").textContent = total;
    document.getElementById("pending-count").textContent = pending;
    document.getElementById("inprogress-count").textContent = inprogress;
    document.getElementById("resolved-count").textContent = resolved;
}
// Recent table (last 5)
function renderRecentTable() {
    var sorted = allComplaints.slice().sort(function (a, b) {
        return new Date(b.timestamp) - new Date(a.timestamp);
    });
    var recent = sorted.slice(0, 5);
    var tbody = document.getElementById("recentTableBody");
    tbody.innerHTML = "";
    for (var i = 0; i < recent.length; i++) {
        var c = recent[i];
        var tr = document.createElement("tr");
        var urgencyHtml = "";
        if (c.status !== "Resolved") {
            var days = daysPending(c.timestamp);
            if (days > 5) {
                urgencyHtml = ' <span class="badge-urgent"><i class="bi bi-exclamation-triangle"></i> Urgent</span>';
            } else if (days > 3) {
                urgencyHtml = ' <span class="badge-due"><i class="bi bi-clock-history"></i> Due</span>';
            }
        }
        tr.innerHTML =
            "<td>" + escapeHtml(c.grievance_code) + "</td>" +
            "<td>" + escapeHtml(c.category || "-") + "</td>" +
            "<td>" + escapeHtml(c.location || "-") + "</td>" +
            "<td>" + statusBadge(c.status) + urgencyHtml + "</td>" +
            "<td>" + formatDate(c.timestamp) + "</td>";
        tbody.appendChild(tr);
    }
}
// Populate category filter
function populateCategoryFilter() {
    var select = document.getElementById("categoryFilter");
    var categories = {};
    for (var i = 0; i < allComplaints.length; i++) {
        var cat = allComplaints[i].category;
        if (cat) categories[cat] = true;
    }
    select.innerHTML = '<option value="">All Categories</option>';
    var keys = Object.keys(categories).sort();
    for (var j = 0; j < keys.length; j++) {
        var opt = document.createElement("option");
        opt.value = keys[j];
        opt.textContent = keys[j];
        select.appendChild(opt);
    }
}
// Filters
function applyFilters() {
    var search = document.getElementById("searchInput").value.toLowerCase();
    var category = document.getElementById("categoryFilter").value;
    var status = document.getElementById("statusFilter").value;
    var dateFrom = document.getElementById("dateFrom").value;
    var dateTo = document.getElementById("dateTo").value;
    filteredComplaints = allComplaints.filter(function (c) {
        if (search) {
            var code = (c.grievance_code || "").toLowerCase();
            var phone = (c.citizen_phone || "").toLowerCase();
            if (code.indexOf(search) === -1 && phone.indexOf(search) === -1) return false;
        }
        if (category && c.category !== category) return false;
        if (status === "Urgent") {
            if (c.status === "Resolved") return false;
            if (daysPending(c.timestamp) <= 5) return false;
        } else if (status && c.status !== status) return false;
        if (dateFrom) {
            var d = new Date(c.timestamp);
            if (d < new Date(dateFrom)) return false;
        }
        if (dateTo) {
            var d2 = new Date(c.timestamp);
            var toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            if (d2 > toDate) return false;
        }
        return true;
    });
    document.getElementById("complaintsCount").textContent = "Showing " + filteredComplaints.length + " complaints";
    renderComplaintsTable();
}
document.getElementById("searchInput").addEventListener("input", applyFilters);
document.getElementById("categoryFilter").addEventListener("change", applyFilters);
document.getElementById("statusFilter").addEventListener("change", applyFilters);
document.getElementById("dateFrom").addEventListener("change", applyFilters);
document.getElementById("dateTo").addEventListener("change", applyFilters);
// Complaints table
function renderComplaintsTable() {
    var tbody = document.getElementById("complaintsTableBody");
    tbody.innerHTML = "";
    var sorted = filteredComplaints.slice().sort(function (a, b) {
        return new Date(b.timestamp) - new Date(a.timestamp);
    });
    for (var i = 0; i < sorted.length; i++) {
        var c = sorted[i];
        var tr = document.createElement("tr");
        var urgencyHtml = "";
        if (c.status !== "Resolved") {
            var days = daysPending(c.timestamp);
            if (days > 5) {
                urgencyHtml = ' <span class="badge-urgent"><i class="bi bi-exclamation-triangle"></i> Urgent</span>';
            } else if (days > 3) {
                urgencyHtml = ' <span class="badge-due"><i class="bi bi-clock-history"></i> Due</span>';
            }
        }
        tr.innerHTML =
            "<td>" + escapeHtml(c.grievance_code) + "</td>" +
            "<td>" + escapeHtml(c.type || "-") + "</td>" +
            "<td>" + escapeHtml(c.category || "-") + "</td>" +
            "<td>" + escapeHtml(c.location || "-") + "</td>" +
            "<td>" + statusBadge(c.status) + urgencyHtml + "</td>" +
            "<td>" + formatConfidence(c.confidence) + "</td>" +
            "<td>" + formatDate(c.timestamp) + "</td>" +
            '<td><button class="btn btn-sm btn-outline-success view-btn" data-code="' + escapeHtml(c.grievance_code) + '">View</button></td>';
        tbody.appendChild(tr);
    }
    // View buttons
    var viewBtns = document.querySelectorAll(".view-btn");
    viewBtns.forEach(function (btn) {
        btn.addEventListener("click", function () {
            openDetailModal(btn.getAttribute("data-code"));
        });
    });
}
// Detail modal
function openDetailModal(code) {
    fetch(API_URL + '/complaint/track/' + code)
        .then(function (response) { return response.json(); })
        .then(function (complaint) {
            populateModal(complaint);
            var modal = new bootstrap.Modal(document.getElementById("detailModal"));
            modal.show();
        })
        .catch(function (error) {
            console.log('Error fetching detail:', error);
        });
}
function populateModal(c) {
    document.getElementById("modalCode").textContent = c.grievance_code;
    document.getElementById("modalType").textContent = c.type || "-";
    document.getElementById("modalLocation").textContent = c.location || "-";
    document.getElementById("modalStatus").innerHTML = statusBadge(c.status);
    document.getElementById("modalConfidence").textContent = formatConfidence(c.confidence);
    document.getElementById("modalDate").textContent = formatDate(c.timestamp);
    document.getElementById("modalPhone").textContent = c.citizen_phone || "-";

    // Assigned Zone
    document.getElementById("modalAssignedWorker").textContent = c.assigned_worker || "Not available";
    // Resolved By
    var resolvedByRow = document.getElementById("modalResolvedByRow");
    if (c.status === "Resolved" && c.resolved_by) {
        document.getElementById("modalResolvedBy").textContent = c.resolved_by;
        resolvedByRow.style.display = "";
    } else {
        resolvedByRow.style.display = "none";
    }

    // Category — if Unclassified show dropdown
    var catDiv = document.getElementById("modalCategory");
    if (c.category === "Unclassified" || !c.category) {
        catDiv.innerHTML =
            '<div class="d-flex gap-2 align-items-center">' +
            '<select class="form-select form-select-sm" id="classifySelect" style="width:auto;">' +
            '<option value="">Select category</option>' +
            '<option value="garbage">garbage</option>' +
            '<option value="pothole">pothole</option>' +
            '<option value="waterlogging">waterlogging</option>' +
            '<option value="Power & Electricity">Power & Electricity</option>' +
            '<option value="Illegal Encroachment">Illegal Encroachment</option>' +
            '<option value="Administrative Complaints">Administrative Complaints</option>' +
            '</select>' +
            '<button class="btn btn-sm btn-success" id="classifyBtn">Classify</button>' +
            '</div>';
        document.getElementById("classifyBtn").addEventListener("click", function () {
            var selected = document.getElementById("classifySelect").value;
            if (!selected) return;
            classifyComplaint(c.grievance_code, selected);
        });
    } else {
        catDiv.textContent = c.category;
    }
    // Images
    var imgRow = document.getElementById("modalImageRow");
    if (c.image_base64) {
        var imgSrc = c.image_base64;
        if (imgSrc.indexOf('data:') !== 0) {
            imgSrc = 'data:image/jpeg;base64,' + imgSrc;
        }
        document.getElementById("modalImage").src = imgSrc;
        imgRow.style.display = "";
    } else if (c.image_url) {
        document.getElementById("modalImage").src = c.image_url;
        imgRow.style.display = "";
    } else {
        imgRow.style.display = "none";
    }
    var resImgRow = document.getElementById("modalResolutionImageRow");
    if (c.resolution_image) {
        var resSrc = c.resolution_image;
        if (resSrc.indexOf('data:') !== 0) {
            resSrc = 'data:image/jpeg;base64,' + resSrc;
        }
        document.getElementById("modalResolutionImage").src = resSrc;
        resImgRow.style.display = "";
    } else if (c.resolution_image_url) {
        document.getElementById("modalResolutionImage").src = c.resolution_image_url;
        resImgRow.style.display = "";
    } else {
        resImgRow.style.display = "none";
    }
    var resNoteRow = document.getElementById("modalResolutionNoteRow");
    if (c.resolution_note) {
        document.getElementById("modalResolutionNote").textContent = c.resolution_note;
        resNoteRow.style.display = "";
    } else {
        resNoteRow.style.display = "none";
    }
}
// Classify complaint
function classifyComplaint(grievanceCode, category) {
    fetch(API_URL + "/complaint/classify", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grievance_code: grievanceCode, category: category })
    })
        .then(function (res) { return res.json(); })
        .then(function () {
            var modal = bootstrap.Modal.getInstance(document.getElementById("detailModal"));
            if (modal) modal.hide();
            fetchComplaints();
        })
        .catch(function (err) {
            console.error("Classify failed:", err);
        });
}
// Charts
function buildCharts() {
    // Category pie
    var catCounts = {};
    for (var i = 0; i < allComplaints.length; i++) {
        var cat = allComplaints[i].category || "Unknown";
        catCounts[cat] = (catCounts[cat] || 0) + 1;
    }
    var catLabels = Object.keys(catCounts);
    var catData = catLabels.map(function (k) { return catCounts[k]; });
    var catColors = ["#1B5E20", "#388E3C", "#66BB6A", "#A5D6A7", "#C8E6C9", "#E8F5E9", "#FFA000", "#D32F2F"];
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(document.getElementById("categoryChart"), {
        type: "pie",
        data: {
            labels: catLabels,
            datasets: [{
                data: catData,
                backgroundColor: catColors.slice(0, catLabels.length)
            }]
        },
        options: { responsive: true, plugins: { legend: { position: "bottom", labels: { font: { size: 11 } } } } }
    });
    // Status bar
    var statusCounts = { "Pending": 0, "In Progress": 0, "Resolved": 0 };
    for (var j = 0; j < allComplaints.length; j++) {
        var s = allComplaints[j].status;
        if (statusCounts[s] !== undefined) statusCounts[s]++;
    }
    if (statusChart) statusChart.destroy();
    statusChart = new Chart(document.getElementById("statusChart"), {
        type: "bar",
        data: {
            labels: ["Pending", "In Progress", "Resolved"],
            datasets: [{
                label: "Count",
                data: [statusCounts["Pending"], statusCounts["In Progress"], statusCounts["Resolved"]],
                backgroundColor: ["#D32F2F", "#FFA000", "#388E3C"]
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
    // Trend line (last 7 days)
    var today = new Date();
    var trendLabels = [];
    var trendData = [];
    for (var d = 6; d >= 0; d--) {
        var date = new Date(today);
        date.setDate(date.getDate() - d);
        var dateStr = date.toISOString().split("T")[0];
        trendLabels.push(dateStr);
        var count = 0;
        for (var k = 0; k < allComplaints.length; k++) {
            var cDate = new Date(allComplaints[k].timestamp).toISOString().split("T")[0];
            if (cDate === dateStr) count++;
        }
        trendData.push(count);
    }
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(document.getElementById("trendChart"), {
        type: "line",
        data: {
            labels: trendLabels,
            datasets: [{
                label: "Complaints",
                data: trendData,
                borderColor: "#1B5E20",
                backgroundColor: "rgba(27,94,32,0.1)",
                fill: true,
                tension: 0.3
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
}
// Hotspots
function buildHotspots() {
    var locCounts = {};
    for (var i = 0; i < allComplaints.length; i++) {
        var loc = allComplaints[i].location;
        if (loc) locCounts[loc] = (locCounts[loc] || 0) + 1;
    }
    var entries = Object.keys(locCounts).map(function (k) { return { name: k, count: locCounts[k] }; });
    entries.sort(function (a, b) { return b.count - a.count; });
    var top10 = entries.slice(0, 10);
    var maxCount = top10.length > 0 ? top10[0].count : 1;
    var container = document.getElementById("hotspotsContainer");
    container.innerHTML = "";
    for (var j = 0; j < top10.length; j++) {
        var pct = (top10[j].count / maxCount) * 100;
        var row = document.createElement("div");
        row.className = "hotspot-row";
        row.innerHTML =
            '<span class="hotspot-rank">' + (j + 1) + '</span>' +
            '<span class="hotspot-name">' + escapeHtml(top10[j].name) + '</span>' +
            '<span class="hotspot-count">' + top10[j].count + '</span>' +
            '<div class="hotspot-bar"><div class="hotspot-bar-fill" style="width:' + pct + '%"></div></div>';
        container.appendChild(row);
    }
    if (top10.length === 0) {
        container.innerHTML = '<p class="text-muted">No location data available.</p>';
    }
}
// Export Excel
document.getElementById("exportBtn").addEventListener("click", function () {
    var data = filteredComplaints.map(function (c) {
        return {
            "Code": c.grievance_code,
            "Type": c.type || "-",
            "Category": c.category || "-",
            "Location": c.location || "-",
            "Status": c.status,
            "Confidence": formatConfidence(c.confidence),
            "Date": formatDate(c.timestamp)
        };
    });
    var ws = XLSX.utils.json_to_sheet(data);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grievances");
    var now = new Date();
    var filename = "Grievance_Report_" +
        now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, "0") +
        String(now.getDate()).padStart(2, "0") +
        ".xlsx";
    XLSX.writeFile(wb, filename);
});
// Print
document.getElementById("printBtn").addEventListener("click", function () {
    window.print();
});
// Helpers
function daysPending(timestamp) {
    var now = new Date();
    var created = new Date(timestamp);
    var diffMs = now - created;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
function statusBadge(status) {
    if (status === "Pending") return '<span class="badge-pending">Pending</span>';
    if (status === "In Progress") return '<span class="badge-inprogress">In Progress</span>';
    if (status === "Resolved") return '<span class="badge-resolved">Resolved</span>';
    return '<span class="badge-unclassified">' + escapeHtml(status || "Unknown") + '</span>';
}
function formatConfidence(value) {
    if (!value && value !== 0) return 'N/A';
    var conf = value > 100 ? value / 100 : value;
    return conf.toFixed(2) + '%';
}
function formatDate(timestamp) {
    if (!timestamp) return '-';
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch (e) {
        return '-';
    }
}
function escapeHtml(str) {
    if (!str) return "";
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}
// Init
fetchComplaints();