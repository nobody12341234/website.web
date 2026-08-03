const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const JWT_SECRET = 'your-secret-key-change-this-in-production';
const publicDir = path.join(__dirname, 'public');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));
app.use('/public', express.static(publicDir));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/public/index.html', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Database Setup
const db = new sqlite3.Database('./chat.db', (err) => {
  if (err) console.error(err);
  else console.log('Connected to SQLite database');
});

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Groups/Chats table
  db.run(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      creator_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(creator_id) REFERENCES users(id)
    )
  `);

  // Group Members table
  db.run(`
    CREATE TABLE IF NOT EXISTS group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id, user_id),
      FOREIGN KEY(group_id) REFERENCES groups(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // Messages table
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(group_id) REFERENCES groups(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // Invites table
  db.run(`
    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(from_user_id) REFERENCES users(id),
      FOREIGN KEY(to_user_id) REFERENCES users(id),
      FOREIGN KEY(group_id) REFERENCES groups(id)
    )
  `);
});

// Middleware to verify JWT token
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(403).json({ error: 'No token provided' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.userId = decoded.userId;
    next();
  });
}

// Routes

// Sign Up
app.post('/api/signup', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    `INSERT INTO users (username, password) VALUES (?, ?)`,
    [username, hashedPassword],
    function (err) {
      if (err) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      res.json({ success: true, userId: this.lastID, username });
    }
  );
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: '7d',
    });
    res.json({ success: true, token, userId: user.id, username: user.username });
  });
});

// Get current user info
app.get('/api/user', verifyToken, (req, res) => {
  db.get(
    `SELECT id, username, created_at FROM users WHERE id = ?`,
    [req.userId],
    (err, user) => {
      if (err || !user) {
        return res.status(400).json({ error: 'User not found' });
      }
      res.json(user);
    }
  );
});

// Create Group
app.post('/api/groups', verifyToken, (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Group name required' });
  }

  db.run(
    `INSERT INTO groups (name, creator_id) VALUES (?, ?)`,
    [name, req.userId],
    function (err) {
      if (err) {
        return res.status(400).json({ error: 'Failed to create group' });
      }

      const groupId = this.lastID;

      // Add creator to group members
      db.run(
        `INSERT INTO group_members (group_id, user_id) VALUES (?, ?)`,
        [groupId, req.userId],
        (err) => {
          if (err) {
            return res.status(400).json({ error: 'Failed to add creator to group' });
          }
          res.json({ success: true, groupId, name });
        }
      );
    }
  );
});

// Get user's groups
app.get('/api/groups', verifyToken, (req, res) => {
  db.all(
    `SELECT g.* FROM groups g
     INNER JOIN group_members gm ON g.id = gm.group_id
     WHERE gm.user_id = ?
     ORDER BY g.created_at DESC`,
    [req.userId],
    (err, groups) => {
      if (err) {
        return res.status(400).json({ error: 'Failed to fetch groups' });
      }
      res.json(groups);
    }
  );
});

// Get group members
app.get('/api/groups/:groupId/members', verifyToken, (req, res) => {
  const { groupId } = req.params;

  db.all(
    `SELECT u.id, u.username FROM users u
     INNER JOIN group_members gm ON u.id = gm.user_id
     WHERE gm.group_id = ?`,
    [groupId],
    (err, members) => {
      if (err) {
        return res.status(400).json({ error: 'Failed to fetch members' });
      }
      res.json(members);
    }
  );
});

// Invite user to group
app.post('/api/groups/:groupId/invite', verifyToken, (req, res) => {
  const { groupId } = req.params;
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }

  db.get(
    `SELECT id FROM users WHERE username = ?`,
    [username],
    (err, user) => {
      if (err || !user) {
        return res.status(400).json({ error: 'User not found' });
      }

      db.get(
        `SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?`,
        [groupId, req.userId],
        (err, membership) => {
          if (err || !membership) {
            return res.status(403).json({ error: 'You are not a member of this group' });
          }

          db.get(
            `SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?`,
            [groupId, user.id],
            (err, alreadyMember) => {
              if (alreadyMember) {
                return res.status(400).json({ error: 'User is already in the group' });
              }

              db.get(
                `SELECT 1 FROM invites WHERE to_user_id = ? AND group_id = ? AND status = 'pending'`,
                [user.id, groupId],
                (err, pendingInvite) => {
                  if (pendingInvite) {
                    return res.status(400).json({ error: 'Invite already pending' });
                  }

                  db.run(
                    `INSERT INTO invites (from_user_id, to_user_id, group_id, status) VALUES (?, ?, ?, 'pending')`,
                    [req.userId, user.id, groupId],
                    (err) => {
                      if (err) {
                        return res.status(400).json({ error: 'Failed to create invite' });
                      }
                      res.json({ success: true, username });
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
});

// Get pending invites for current user
app.get('/api/invites', verifyToken, (req, res) => {
  db.all(
    `SELECT i.id, i.group_id, g.name as group_name, u.username as from_username
     FROM invites i
     INNER JOIN groups g ON g.id = i.group_id
     INNER JOIN users u ON u.id = i.from_user_id
     WHERE i.to_user_id = ? AND i.status = 'pending'
     ORDER BY i.created_at DESC`,
    [req.userId],
    (err, invites) => {
      if (err) {
        return res.status(400).json({ error: 'Failed to fetch invites' });
      }
      res.json(invites);
    }
  );
});

// Accept invite
app.post('/api/invites/:inviteId/accept', verifyToken, (req, res) => {
  const { inviteId } = req.params;

  db.get(`SELECT * FROM invites WHERE id = ? AND to_user_id = ?`, [inviteId, req.userId], (err, invite) => {
    if (err || !invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    db.run(
      `INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)`,
      [invite.group_id, req.userId],
      (err) => {
        if (err) {
          return res.status(400).json({ error: 'Failed to join group' });
        }

        db.run(
          `UPDATE invites SET status = 'accepted' WHERE id = ?`,
          [inviteId],
          (err) => {
            if (err) {
              return res.status(400).json({ error: 'Failed to update invite' });
            }
            res.json({ success: true });
          }
        );
      }
    );
  });
});

// Decline invite
app.post('/api/invites/:inviteId/decline', verifyToken, (req, res) => {
  const { inviteId } = req.params;

  db.run(
    `UPDATE invites SET status = 'declined' WHERE id = ? AND to_user_id = ?`,
    [inviteId, req.userId],
    function (err) {
      if (err || this.changes === 0) {
        return res.status(404).json({ error: 'Invite not found' });
      }
      res.json({ success: true });
    }
  );
});

// Get group messages
app.get('/api/groups/:groupId/messages', verifyToken, (req, res) => {
  const { groupId } = req.params;

  db.all(
    `SELECT m.id, m.message, m.created_at, u.username, u.id as user_id
     FROM messages m
     INNER JOIN users u ON m.user_id = u.id
     WHERE m.group_id = ?
     ORDER BY m.created_at ASC`,
    [groupId],
    (err, messages) => {
      if (err) {
        return res.status(400).json({ error: 'Failed to fetch messages' });
      }
      res.json(messages);
    }
  );
});

// Send message to group
app.post('/api/groups/:groupId/messages', verifyToken, (req, res) => {
  const { groupId } = req.params;
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message required' });
  }

  db.run(
    `INSERT INTO messages (group_id, user_id, message) VALUES (?, ?, ?)`,
    [groupId, req.userId, message],
    function (err) {
      if (err) {
        return res.status(400).json({ error: 'Failed to send message' });
      }
      res.json({ success: true, messageId: this.lastID });
    }
  );
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
