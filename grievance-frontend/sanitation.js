// Auth guard
if (sessionStorage.getItem('worker_logged_in') !== 'true') {
  window.location.href = 'sanitation-login.html';
}
var API_URL = 'http://10.185.249.202:8000';
var allComplaints = [];
var currentComplaint = null;
var resolutionModal = null;
// Session timeout
var SESSION_LIMIT = 15 * 60 * 1000;
var WARNING_AT = 13 * 60 * 1000;
var sessionTimer = null;
var warningTimer = null;
function resetSessionTimer() {
  clearTimeout(sessionTimer);
  clearTimeout(warningTimer);
  document.getElementById('sessionAlert').style.display = 'none';
  warningTimer = setTimeout(function () {
    document.getElementById('sessionAlert').style.display = 'block';
  }, WARNING_AT);
  sessionTimer = setTimeout(function () {
    sessionStorage.clear();
    window.location.href = 'sanitation-login.html';
  }, SESSION_LIMIT);
}
['click', 'touchstart', 'scroll'].forEach(function (evt) {
  document.addEventListener(evt, resetSessionTimer, { passive: true });
});
resetSessionTimer();
// Init
document.addEventListener('DOMContentLoaded', function () {
  resolutionModal = new bootstrap.Modal(document.getElementById('resolutionModal'));
  // Show worker name in header
  var workerName = sessionStorage.getItem('worker_name');
  if (workerName) {
    var headerTitle = document.querySelector('.header-title');
    headerTitle.innerHTML += '<span class="header-subtitle">' + workerName + "'s Zone</span>";
  }
  // Restore toggle states
  var savedToggle = sessionStorage.getItem('sanitation_today_toggle');
  if (savedToggle === 'true') {
    document.getElementById('todayToggle').checked = true;
  }
  var savedRouteToggle = sessionStorage.getItem('sanitation_route_toggle');
  if (savedRouteToggle === 'true') {
    document.getElementById('routeSortToggle').checked = true;
  }
  fetchComplaints();
  document.getElementById('logoutBtn').addEventListener('click', function () {
    sessionStorage.removeItem('worker_logged_in');
    sessionStorage.removeItem('worker_name');
    sessionStorage.removeItem('worker_username');
    sessionStorage.removeItem('worker_zone_lat');
    sessionStorage.removeItem('worker_zone_lng');
    sessionStorage.removeItem('worker_zone_radius');
    window.location.href = 'sanitation-login.html';
  });
  document.getElementById('todayToggle').addEventListener('change', function () {
    sessionStorage.setItem('sanitation_today_toggle', this.checked);
    renderList();
  });
  document.getElementById('routeSortToggle').addEventListener('change', function () {
    sessionStorage.setItem('sanitation_route_toggle', this.checked);
    renderList();
  });
  document.getElementById('detailBackBtn').addEventListener('click', closeDetail);
  document.getElementById('resolutionPhoto').addEventListener('change', function () {
    var file = this.files[0];
    if (file) {
      var reader = new FileReader();
      reader.onload = function (e) {
        document.getElementById('photoPreview').src = e.target.result;
        document.getElementById('photoPreviewWrap').style.display = 'block';
      };
      reader.readAsDataURL(file);
    } else {
      document.getElementById('photoPreviewWrap').style.display = 'none';
    }
  });
  document.getElementById('resolveBtn').addEventListener('click', handleResolve);
});
function fetchComplaints() {
  var zoneLat = sessionStorage.getItem('worker_zone_lat');
  var zoneLng = sessionStorage.getItem('worker_zone_lng');
  var zoneRadius = sessionStorage.getItem('worker_zone_radius');
  fetch(API_URL + '/complaints/zone?lat=' + zoneLat + '&lng=' + zoneLng + '&radius=' + zoneRadius)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      allComplaints = data;
      renderList();
      updateStats();
    })
    .catch(function () {
      allComplaints = [];
      renderList();
      updateStats();
    });
}
function todayDateStr() {
  var d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function daysPending(timestamp) {
  var created = new Date(timestamp);
  var now = new Date();
  var diff = now - created;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
function formatTimestamp(ts) {
  var d = new Date(ts);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  }) + ', ' + d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit'
  });
}
function statusClass(status) {
  if (status === 'Pending') return 'pending';
  if (status === 'In Progress') return 'in-progress';
  return 'resolved';
}
function updateStats() {
  var today = todayDateStr();
  var total = allComplaints.length;
  var pending = 0;
  var resolvedToday = 0;
  allComplaints.forEach(function (c) {
    if (c.status === 'Pending') pending++;
    if (c.status === 'Resolved' && c.resolved_at) {
      var rDate = c.resolved_at.substring(0, 10);
      if (rDate === today) resolvedToday++;
    }
  });
  document.getElementById('statTotal').innerHTML = '<i class="bi bi-collection"></i> Total: ' + total;
  document.getElementById('statPending').innerHTML = '<i class="bi bi-clock"></i> Pending: ' + pending;
  document.getElementById('statResolved').innerHTML = '<i class="bi bi-check-circle"></i> Resolved Today: ' + resolvedToday;
}
function renderList() {
  var list = document.getElementById('complaintsList');
  var empty = document.getElementById('emptyState');
  var todayOnly = document.getElementById('todayToggle').checked;
  var today = todayDateStr();
  var filtered = allComplaints.slice();
  if (todayOnly) {
    filtered = filtered.filter(function (c) {
      return c.timestamp && c.timestamp.substring(0, 10) === today;
    });
  }
  // Sort
  var routeSort = document.getElementById('routeSortToggle').checked;
  if (routeSort) {
    filtered = sortByRoute(filtered);
  } else {
    filtered.sort(function (a, b) {
      return new Date(a.timestamp) - new Date(b.timestamp);
    });
  }
  console.log('Route sort:', routeSort, '| Order:', filtered.map(function (c) {
    return c.grievance_code;
  }).join(', '));
  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  var html = '';
  filtered.forEach(function (c) {
    var days = daysPending(c.timestamp);
    var sc = statusClass(c.status);
    var badgeHtml = '';
    if (c.status !== 'Resolved') {
      if (days > 5) {
        badgeHtml = '<span class="badge-urgent"><i class="bi bi-exclamation-triangle"></i> Urgent</span>';
      } else if (days > 3) {
        badgeHtml = '<span class="badge-due"><i class="bi bi-clock-history"></i> Due</span>';
      }
    }
    var actionHtml = '';
    if (c.status === 'Pending') {
      actionHtml = '<button class="btn-start" onclick="event.stopPropagation();markInProgress(\'' + c.grievance_code + '\')">Start</button>';
    } else if (c.status === 'In Progress') {
      actionHtml = '<button class="btn-resolve-small" onclick="event.stopPropagation();openResolveModal(\'' + c.grievance_code + '\')">Resolve</button>';
    } else {
      actionHtml = '<span class="checkmark-icon"><i class="bi bi-check-circle-fill"></i></span>';
    }
    var rowClass = 'row-' + sc;
    html += '<div class="complaint-row ' + rowClass + '" onclick="openDetail(\'' + c.grievance_code + '\')">'
    html += '<span class="status-dot ' + sc + '"></span>';
    html += '<div class="complaint-info">';
    html += '<div><span class="complaint-code">' + c.grievance_code + '</span>' + badgeHtml + '</div>';
    html += '<div class="complaint-location">' + (c.location || '') + '</div>';
    html += '<div class="complaint-time">' + formatTimestamp(c.timestamp) + '</div>';
    html += '</div>';
    html += '<div class="complaint-action">' + actionHtml + '</div>';
    html += '<i class="bi bi-chevron-right row-chevron"></i>';
    html += '</div>';
  });
  list.innerHTML = html;
}
function openDetail(code) {
  fetch(API_URL + '/complaint/track/' + code)
    .then(function (response) { return response.json(); })
    .then(function (complaint) {
      currentComplaint = complaint;
      renderDetailView(complaint);
      document.getElementById('detailView').classList.add('open');
    })
    .catch(function (error) {
      console.log('Error fetching detail:', error);
    });
}
function renderDetailView(c) {
  var days = daysPending(c.timestamp);
  var sc = statusClass(c.status);
  var html = '';
  html += '<div class="detail-code">' + c.grievance_code + '</div>';
  var statusIcon = sc === 'pending' ? 'bi-clock' : sc === 'in-progress' ? 'bi-arrow-repeat' : 'bi-check-circle';
  html += '<div><span class="detail-status-badge ' + sc + '"><i class="bi ' + statusIcon + '"></i> ' + c.status + '</span></div>';
  if (c.status !== 'Resolved') {
    var overClass = days > 3 ? ' overdue' : '';
    html += '<div class="detail-pending-days' + overClass + '"><i class="bi bi-hourglass-split"></i> Pending for ' + days + ' day' + (days !== 1 ? 's' : '') + '</div>';
  }
  if (c.image_base64) {
    var imgSrc = c.image_base64;
    if (imgSrc.indexOf('data:') !== 0) {
      imgSrc = 'data:image/jpeg;base64,' + imgSrc;
    }
    html += '<img class="detail-image" src="' + imgSrc + '" alt="Complaint photo">';
  }
  html += '<div class="detail-field"><div class="detail-label">Category</div><div class="detail-value">' + (c.category || 'N/A') + '</div></div>';
  html += '<div class="detail-field"><div class="detail-label">Location</div><div class="detail-value">' + (c.location || 'N/A') + '</div></div>';
  html += '<div class="detail-field"><div class="detail-label">Timestamp</div><div class="detail-value">' + formatTimestamp(c.timestamp) + '</div></div>';
  // Get Directions
  var mapsUrl = '';
  if (c.latitude && c.longitude) {
    mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + c.latitude + ',' + c.longitude;
  } else if (c.lat && c.lng) {
    mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + c.lat + ',' + c.lng;
  } else if (c.location) {
    mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.location);
  }
  if (mapsUrl) {
    html += '<button class="btn-directions" onclick="window.open(\'' + mapsUrl + '\',\'_blank\')">';
    html += '<i class="bi bi-geo-alt-fill"></i>';
    html += 'Get Directions</button>';
  }
  // Action button
  if (c.status === 'Pending') {
    html += '<button class="btn-action-full" onclick="markInProgress(\'' + c.grievance_code + '\')"><i class="bi bi-play-fill"></i> Mark In Progress</button>';
  } else if (c.status === 'In Progress') {
    html += '<button class="btn-action-full" onclick="openResolveModal(\'' + c.grievance_code + '\')"><i class="bi bi-camera"></i> Upload Resolution Photo</button>';
  } else if (c.status === 'Resolved') {
    html += '<div class="resolution-section">';
    if (c.resolution_image) {
      var resSrc = c.resolution_image;
      if (resSrc.indexOf('data:') !== 0) {
        resSrc = 'data:image/jpeg;base64,' + resSrc;
      }
      html += '<img src="' + resSrc + '" alt="Resolution photo">';
    }
    if (c.resolution_note) {
      html += '<div class="resolution-note-text">' + c.resolution_note + '</div>';
    }
    html += '</div>';
  }
  document.getElementById('detailBody').innerHTML = html;
}
function closeDetail() {
  document.getElementById('detailView').classList.remove('open');
  currentComplaint = null;
}
function markInProgress(code) {
  fetch(API_URL + '/complaint/status/' + code, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'In Progress' })
  })
    .then(function (res) { return res.json(); })
    .then(function () {
      fetchComplaints();
      if (currentComplaint && currentComplaint.grievance_code === code) {
        setTimeout(function () { openDetail(code); }, 500);
      }
    });
}
function openResolveModal(code) {
  if (!currentComplaint || currentComplaint.grievance_code !== code) {
    currentComplaint = allComplaints.find(function (c) { return c.grievance_code === code; }) || { grievance_code: code };
  }
  document.getElementById('resolutionPhoto').value = '';
  document.getElementById('photoPreviewWrap').style.display = 'none';
  document.getElementById('resolutionNote').value = '';
  resolutionModal.show();
}
function handleResolve() {
  if (!currentComplaint) return;
  var fileInput = document.getElementById('resolutionPhoto');
  var noteInput = document.getElementById('resolutionNote');
  var code = currentComplaint.grievance_code;
  if (!fileInput.files[0]) {
    alert('Please select a photo.');
    return;
  }
  var reader = new FileReader();
  reader.onload = function (e) {
    var base64 = e.target.result;
    fetch(API_URL + '/complaint/resolve/' + code, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resolution_image: base64,
        resolution_note: noteInput.value,
        resolved_by: sessionStorage.getItem('worker_name')
      })
    })
      .then(function (res) { return res.json(); })
      .then(function () {
        resolutionModal.hide();
        closeDetail();
        fetchComplaints();
      });
  };
  reader.readAsDataURL(fileInput.files[0]);
}
function sortByRoute(complaints) {
  var withCoords = complaints.filter(function (c) { return c.lat && c.lng; });
  var withoutCoords = complaints.filter(function (c) { return !c.lat || !c.lng; });
  if (withCoords.length === 0) return complaints;
  // Sort by timestamp first to find the oldest complaint as starting point
  withCoords.sort(function (a, b) {
    return new Date(a.timestamp) - new Date(b.timestamp);
  });
  var sorted = [];
  var remaining = withCoords.slice();
  // Start with the oldest complaint
  var current = remaining.shift();
  sorted.push(current);
  // Nearest neighbor from there
  while (remaining.length > 0) {
    var nearestIndex = 0;
    var nearestDist = Infinity;
    for (var i = 0; i < remaining.length; i++) {
      var dist = getDistance(current.lat, current.lng, remaining[i].lat, remaining[i].lng);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIndex = i;
      }
    }
    current = remaining.splice(nearestIndex, 1)[0];
    sorted.push(current);
  }
  return sorted.concat(withoutCoords);
}
function getDistance(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
