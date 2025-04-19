const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true
  }
});

app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));

// In-memory session storage
const chatSessions = new Map();
const emailSentSessions = new Set();

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // Use TLS
  auth: {
    user: 'joshi2401@gmail.com',
    pass: process.env.EMAIL_PASSWORD // This should be your app-specific password
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Verify the connection configuration
transporter.verify(function (error, success) {
  if (error) {
    console.log('SMTP connection error:', error);
  } else {
    console.log('SMTP server is ready to take our messages');
  }
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('newUser', async ({ name, email, sessionId }) => {
    try {
      const mailOptions = {
        from: 'joshi2401@gmail.com',
        to: 'joshi2401@gmail.com',
        subject: 'New Chat User',
        html: `
          <h3>New chat user:</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Session ID:</strong> ${sessionId}</p>
          <p><a href="http://localhost:3000?session=${sessionId}">Click here to respond to this chat</a></p>
        `
      };
      
      await transporter.sendMail(mailOptions);
      console.log('New user email sent');
    } catch (error) {
      console.error('Failed to send new user email:', error);
    }
  });

  socket.on('sendMessage', async (message) => {
    try {
      const sessionId = message.sessionId || socket.id;

      const existingSession = chatSessions.get(sessionId);
      const updatedMessages = [...(existingSession?.messages || []), message];

      chatSessions.set(sessionId, {
        messages: updatedMessages,
        userSocket: socket.id,
        active: true
      });

      socket.join(sessionId);

      if (!emailSentSessions.has(sessionId)) {
        const mailOptions = {
          from: 'joshi2401@gmail.com',
          to: 'joshi2401@gmail.com',
          subject: 'New Chat Message from Portfolio Website',
          html: `
            <p><strong>New message:</strong> ${message.text}</p>
            <p><a href="http://localhost:3000?session=${sessionId}">Click here to respond to this chat</a></p>
          `
        };

        try {
          await transporter.sendMail(mailOptions);
          console.log('Email sent for session:', sessionId);
          emailSentSessions.add(sessionId);
        } catch (emailError) {
          console.error('Failed to send email:', emailError);
        }
      }

      io.to(sessionId).emit('message', { ...message, sessionId });

      console.log('Message broadcast to session:', {
        sessionId,
        messageText: message.text,
        sender: message.sender,
        roomSize: io.sockets.adapter.rooms.get(sessionId)?.size
      });

    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  socket.on('joinSession', (sessionId) => {
    if (sessionId) {
      socket.rooms.forEach(room => {
        if (room !== socket.id) {
          socket.leave(room);
        }
      });

      socket.join(sessionId);
      console.log(`Socket ${socket.id} joined session ${sessionId}`);

      const session = chatSessions.get(sessionId);
      if (session) {
        socket.emit('chatHistory', session.messages);
        chatSessions.set(sessionId, { ...session, active: true });
      }
    }
  });

  socket.on('closeChat', (sessionId) => {
    if (sessionId) {
      socket.leave(sessionId);
      io.to(sessionId).emit('chatClosed');
    }
  });

  socket.on('disconnect', () => {
    const sessionId = socket.id;
    const session = chatSessions.get(sessionId);
    if (session) {
      const room = io.sockets.adapter.rooms.get(sessionId);
      if (!room || room.size === 0) {
        chatSessions.delete(sessionId);
      }
    }
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

server.listen(3001, () => {
  console.log('Server running on port 3001');
});
