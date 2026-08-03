// Global state
let token = localStorage.getItem('token');
let userId = localStorage.getItem('userId');
let currentUsername = localStorage.getItem('username');
let currentGroupId = null;
let refreshMessagesInterval = null;
let refreshGroupsInterval = null;

const API_URL = '/api';
let deferredInstallPrompt = null;

// Initialize app
window.addEventListener('DOMContentLoaded', () => {
  const messageInput = document.getElementById('messageInput');
  if (messageInput) {
    messageInput.style.setProperty('color', '#111827', 'important');
    messageInput.style.setProperty('background-color', '#ffffff', 'important');
    messageInput.style.setProperty('background', '#ffffff', 'important');
    messageInput.style.setProperty('webkit-text-fill-color', '#111827', 'important');
    messageInput.style.setProperty('caret-color', '#111827', 'important');
    messageInput.style.setProperty('border', '2px solid #667eea', 'important');
  }

  if (token && userId) {
    showChatApp();
  } else {
    showAuthApp();
  }
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const installButton = document.getElementById('installButton');
  if (installButton) {
    installButton.classList.remove('hidden');
  }
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const installButton = document.getElementById('installButton');
  if (installButton) {
    installButton.classList.add('hidden');
  }
});

function promptInstall() {
  if (!deferredInstallPrompt) return;

  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then((choice) => {
    if (choice.outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    deferredInstallPrompt = null;
    document.getElementById('installButton')?.classList.add('hidden');
  });
}

// Toggle between login and signup forms
function toggleForm() {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  loginForm.classList.toggle('hidden');
  signupForm.classList.toggle('hidden');
}

// Sign Up
async function signup() {
  const username = document.getElementById('signupUsername').value;
  const password = document.getElementById('signupPassword').value;
  const errorDiv = document.getElementById('authError');

  if (!username || !password) {
    errorDiv.textContent = 'Please fill in all fields';
    errorDiv.classList.add('show');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      errorDiv.textContent = data.error || 'Signup failed';
      errorDiv.classList.add('show');
      return;
    }

    errorDiv.classList.remove('show');
    alert('Signup successful! Please login.');
    toggleForm();
  } catch (err) {
    errorDiv.textContent = 'Error: ' + err.message;
    errorDiv.classList.add('show');
  }
}

// Login
async function login() {
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  const errorDiv = document.getElementById('authError');

  if (!username || !password) {
    errorDiv.textContent = 'Please fill in all fields';
    errorDiv.classList.add('show');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      errorDiv.textContent = data.error || 'Login failed';
      errorDiv.classList.add('show');
      return;
    }

    // Save credentials
    token = data.token;
    userId = data.userId;
    currentUsername = data.username;

    localStorage.setItem('token', token);
    localStorage.setItem('userId', userId);
    localStorage.setItem('username', currentUsername);

    errorDiv.classList.remove('show');
    showChatApp();
  } catch (err) {
    errorDiv.textContent = 'Error: ' + err.message;
    errorDiv.classList.add('show');
  }
}

// Logout
function logout() {
  token = null;
  userId = null;
  currentUsername = null;
  currentGroupId = null;

  localStorage.removeItem('token');
  localStorage.removeItem('userId');
  localStorage.removeItem('username');

  clearInterval(refreshMessagesInterval);
  clearInterval(refreshGroupsInterval);

  const pendingInvitesList = document.getElementById('pendingInvitesList');
  if (pendingInvitesList) {
    pendingInvitesList.innerHTML = '<div class="pending-empty-state">No pending invites.</div>';
  }

  showAuthApp();
}

// Show chat app
function showChatApp() {
  document.getElementById('authContainer').classList.add('hidden');
  document.getElementById('chatContainer').classList.remove('hidden');
  document.getElementById('currentUsername').textContent = currentUsername;

  loadGroups();
  loadPendingInvites();
  refreshGroupsInterval = setInterval(() => {
    loadGroups();
    loadPendingInvites();
  }, 3000);
}

// Show auth app
function showAuthApp() {
  document.getElementById('authContainer').classList.remove('hidden');
  document.getElementById('chatContainer').classList.add('hidden');
  document.getElementById('loginForm').classList.remove('hidden');
  document.getElementById('signupForm').classList.add('hidden');
}

// Create Group
async function createGroup() {
  const groupName = document.getElementById('groupNameInput').value;

  if (!groupName.trim()) {
    alert('Please enter a group name');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: groupName }),
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || 'Failed to create group');
      return;
    }

    document.getElementById('groupNameInput').value = '';
    loadGroups();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Load Groups
async function loadGroups() {
  try {
    const response = await fetch(`${API_URL}/groups`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const groups = await response.json();
    const groupsList = document.getElementById('groupsList');
    groupsList.innerHTML = '';

    groups.forEach((group) => {
      const groupItem = document.createElement('div');
      groupItem.className = `group-item ${
        group.id === currentGroupId ? 'active' : ''
      }`;
      groupItem.textContent = group.name;
      groupItem.onclick = () => selectGroup(group.id, group.name);
      groupsList.appendChild(groupItem);
    });
  } catch (err) {
    console.error('Error loading groups:', err);
  }
}

// Load pending invites
async function loadPendingInvites() {
  if (!token) return;

  try {
    const response = await fetch(`${API_URL}/invites`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      return;
    }

    const invites = await response.json();
    renderPendingInvites(invites);
  } catch (err) {
    console.error('Error loading invites:', err);
  }
}

function renderPendingInvites(invites) {
  const container = document.getElementById('pendingInvitesList');
  if (!container) return;

  if (!Array.isArray(invites) || !invites.length) {
    container.innerHTML = '<div class="pending-empty-state">No pending invites.</div>';
    return;
  }

  container.innerHTML = invites
    .map(
      (invite) => `
        <div class="pending-invite">
          <div class="pending-invite-text">
            <strong>${escapeHtml(invite.from_username)}</strong> invited you to <strong>${escapeHtml(invite.group_name)}</strong>
          </div>
          <div class="pending-invite-actions">
            <button class="pending-accept" onclick="acceptInvite(${invite.id})">Accept</button>
            <button class="pending-decline" onclick="declineInvite(${invite.id})">Decline</button>
          </div>
        </div>
      `
    )
    .join('');
}

async function acceptInvite(inviteId) {
  try {
    const response = await fetch(`${API_URL}/invites/${inviteId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      alert('Could not accept invite');
      return;
    }

    loadPendingInvites();
    loadGroups();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function declineInvite(inviteId) {
  try {
    const response = await fetch(`${API_URL}/invites/${inviteId}/decline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      alert('Could not decline invite');
      return;
    }

    loadPendingInvites();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Select Group
function selectGroup(groupId, groupName) {
  currentGroupId = groupId;
  document.getElementById('noChatSelected').classList.add('hidden');
  document.getElementById('chatWindow').classList.remove('hidden');
  document.getElementById('chatGroupName').textContent = groupName;

  clearInterval(refreshMessagesInterval);
  loadMessages();
  loadMembers();

  // Auto-refresh messages every 2 seconds
  refreshMessagesInterval = setInterval(() => {
    loadMessages();
  }, 2000);

  // Refresh groups to show active state
  loadGroups();
}

// Load Messages
async function loadMessages() {
  if (!currentGroupId) return;

  try {
    const response = await fetch(
      `${API_URL}/groups/${currentGroupId}/messages`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const messages = await response.json();
    const container = document.getElementById('messagesContainer');
    
    // Only update if messages have changed
    const currentMessages = container.innerHTML;
    let newHTML = '';

    messages.forEach((msg) => {
      const isOwn = Number(msg.user_id) === Number(userId);
      const timestamp = new Date(msg.created_at).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });
      newHTML += `
        <div class="message ${isOwn ? 'own' : 'other'}">
          <div class="message-user">${msg.username}</div>
          <div class="message-text">${escapeHtml(msg.message)}</div>
          <div class="message-time">${timestamp}</div>
        </div>
      `;
    });

    if (currentMessages !== newHTML) {
      container.innerHTML = newHTML;
      container.scrollTop = container.scrollHeight;
    }
  } catch (err) {
    console.error('Error loading messages:', err);
  }
}

// Load Members
async function loadMembers() {
  if (!currentGroupId) return;

  try {
    const response = await fetch(
      `${API_URL}/groups/${currentGroupId}/members`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const members = await response.json();
    const membersList = document.getElementById('membersList');
    membersList.innerHTML = '';

    members.forEach((member) => {
      const memberItem = document.createElement('div');
      memberItem.className = 'member-item';
      memberItem.textContent = member.username;
      membersList.appendChild(memberItem);
    });
  } catch (err) {
    console.error('Error loading members:', err);
  }
}

// Send Message
async function sendMessage() {
  const messageInput = document.getElementById('messageInput');
  const message = messageInput.value.trim();

  if (!message) return;

  if (!currentGroupId) {
    alert('Please select a group first');
    return;
  }

  const container = document.getElementById('messagesContainer');
  const previewId = `local-${Date.now()}`;
  const previewMessage = document.createElement('div');
  previewMessage.className = 'message own';
  previewMessage.dataset.localId = previewId;
  previewMessage.innerHTML = `
    <div class="message-user">${escapeHtml(currentUsername || 'You')} (sending...)</div>
    <div class="message-text">${escapeHtml(message)}</div>
    <div class="message-time">Now</div>
  `;
  container.appendChild(previewMessage);
  container.scrollTop = container.scrollHeight;
  messageInput.value = '';

  try {
    const response = await fetch(
      `${API_URL}/groups/${currentGroupId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message }),
      }
    );

    if (!response.ok) {
      previewMessage.remove();
      alert('Failed to send message');
      return;
    }

    loadMessages();
  } catch (err) {
    previewMessage.remove();
    alert('Error: ' + err.message);
  }
}

// Handle message input Enter key
function handleMessageKeyPress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

// Toggle Invite Modal
function toggleInviteModal() {
  const modal = document.getElementById('inviteModal');
  modal.classList.toggle('hidden');
  modal.classList.toggle('show');
  document.getElementById('inviteUsername').value = '';
  document.getElementById('inviteError').classList.remove('show');
  document.getElementById('inviteSuccess').classList.remove('show');
}

// Invite User
async function inviteUser() {
  const username = document.getElementById('inviteUsername').value;
  const errorDiv = document.getElementById('inviteError');
  const successDiv = document.getElementById('inviteSuccess');

  if (!username.trim()) {
    errorDiv.textContent = 'Please enter a username';
    errorDiv.classList.add('show');
    return;
  }

  if (!currentGroupId) {
    errorDiv.textContent = 'Please select a group first';
    errorDiv.classList.add('show');
    return;
  }

  try {
    const response = await fetch(
      `${API_URL}/groups/${currentGroupId}/invite`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      errorDiv.textContent = data.error || 'Failed to invite user';
      errorDiv.classList.add('show');
      return;
    }

    successDiv.textContent = `${username} has been invited to the group!`;
    successDiv.classList.add('show');
    errorDiv.classList.remove('show');
    document.getElementById('inviteUsername').value = '';

    setTimeout(() => {
      successDiv.classList.remove('show');
    }, 2000);

    loadMembers();
  } catch (err) {
    errorDiv.textContent = 'Error: ' + err.message;
    errorDiv.classList.add('show');
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
