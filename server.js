/ Cloud-optimized version with better persistence for free tiers
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage (survives on Render/Cyclic better than SQLite)
// For production, replace with MongoDB Atlas or Redis
const db = {
  meetings: new Map(),
  availability: new Map(),
  
  // Initialize availability for next 90 days
  initializeAvailability() {
    const slots = [
      '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
      '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM'
    ];
    
    const today = moment();
    for (let i = 0; i < 90; i++) {
      const date = moment(today).add(i, 'days');
      const dayOfWeek = date.day();
      
      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      
      const dateStr = date.format('YYYY-MM-DD');
      slots.forEach(time => {
        const key = `${dateStr}-${time}`;
        if (!this.availability.has(key)) {
          this.availability.set(key, {
            date: dateStr,
            time: time,
            isAvailable: true
          });
        }
      });
    }
  },
  
  // Get available dates for a month
  getAvailableDates(year, month) {
    const startDate = moment(`${year}-${month}-01`).format('YYYY-MM-DD');
    const endDate = moment(startDate).endOf('month').format('YYYY-MM-DD');
    
    const dates = new Set();
    for (const [key, slot] of this.availability.entries()) {
      if (slot.date >= startDate && slot.date <= endDate && slot.isAvailable) {
        dates.add(slot.date);
      }
    }
    
    return Array.from(dates).sort();
  },
  
  // Get available times for a date
  getAvailableTimes(date) {
    const times = [];
    for (const [key, slot] of this.availability.entries()) {
      if (slot.date === date && slot.isAvailable) {
        times.push(slot.time);
      }
    }
    
    // Sort times chronologically
    return times.sort((a, b) => {
      const timeA = moment(a, 'h:mm A');
      const timeB = moment(b, 'h:mm A');
      return timeA.valueOf() - timeB.valueOf();
    });
  },
  
  // Check if slot is available
  isSlotAvailable(date, time) {
    const key = `${date}-${time}`;
    const slot = this.availability.get(key);
    return slot && slot.isAvailable;
  },
  
  // Mark slot as booked
  bookSlot(date, time) {
    const key = `${date}-${time}`;
    const slot = this.availability.get(key);
    if (slot) {
      slot.isAvailable = false;
    }
  },
  
  // Free slot (for cancellations)
  freeSlot(date, time) {
    const key = `${date}-${time}`;
    const slot = this.availability.get(key);
    if (slot) {
      slot.isAvailable = true;
    }
  }
};

// Initialize availability on startup
db.initializeAvailability();

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Keep service alive endpoint for monitoring services
app.get('/ping', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// API Routes

// Get available dates for a specific month
app.get('/api/availability/dates', (req, res) => {
  const { year, month } = req.query;
  
  if (!year || !month) {
    return res.status(400).json({ error: 'Year and month are required' });
  }
  
  const availableDates = db.getAvailableDates(year, month);
  res.json({ availableDates });
});

// Get available time slots for a specific date
app.get('/api/availability/times', (req, res) => {
  const { date } = req.query;
  
  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }
  
  // Check if date is in the past
  if (moment(date).isBefore(moment().startOf('day'))) {
    return res.json({ availableTimes: [] });
  }
  
  let availableTimes = db.getAvailableTimes(date);
  
  // If it's today, filter out past times
  if (moment(date).isSame(moment(), 'day')) {
    const now = moment();
    availableTimes = availableTimes.filter(time => {
      const slotTime = moment(time, 'h:mm A');
      return slotTime.isAfter(now);
    });
  }
  
  res.json({ availableTimes });
});

// Book a meeting
app.post('/api/meetings/book', async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    company,
    message,
    date,
    time,
    timezone
  } = req.body;
  
  // Validate required fields
  if (!firstName || !lastName || !email || !company || !date || !time || !timezone) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Check availability
  if (!db.isSlotAvailable(date, time)) {
    return res.status(409).json({ error: 'Time slot is no longer available' });
  }
  
  // Create meeting
  const meetingId = uuidv4();
  const meeting = {
    id: meetingId,
    firstName,
    lastName,
    email,
    phone: phone || '',
    company,
    message: message || '',
    meetingDate: date,
    meetingTime: time,
    timezone,
    status: 'scheduled',
    createdAt: new Date().toISOString()
  };
  
  // Save meeting
  db.meetings.set(meetingId, meeting);
  
  // Mark time slot as unavailable
  db.bookSlot(date, time);
  
  // Send confirmation emails
  try {
    // Format date for email
    const meetingDateTime = moment.tz(`${date} ${time}`, 'YYYY-MM-DD h:mm A', timezone);
    const formattedDate = meetingDateTime.format('MMMM D, YYYY');
    const formattedTime = meetingDateTime.format('h:mm A z');
    
    // Email to customer
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Meeting Confirmation - Corprex',
      html: `
        <h2>Meeting Confirmed!</h2>
        <p>Dear ${firstName} ${lastName},</p>
        <p>Your meeting with Corprex has been successfully scheduled.</p>
        <h3>Meeting Details:</h3>
        <ul>
          <li><strong>Date:</strong> ${formattedDate}</li>
          <li><strong>Time:</strong> ${formattedTime}</li>
          <li><strong>Duration:</strong> 45 minutes</li>
          <li><strong>Type:</strong> Strategy Session</li>
        </ul>
        <p>We'll send you a calendar invitation shortly. Looking forward to discussing how Corprex can transform your AI infrastructure.</p>
        <p>Best regards,<br>The Corprex Team</p>
      `
    });
    
    // Email to admin
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      subject: 'New Meeting Scheduled',
      html: `
        <h2>New Meeting Scheduled</h2>
        <h3>Contact Details:</h3>
        <ul>
          <li><strong>Name:</strong> ${firstName} ${lastName}</li>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Phone:</strong> ${phone || 'Not provided'}</li>
          <li><strong>Company:</strong> ${company}</li>
        </ul>
        <h3>Meeting Details:</h3>
        <ul>
          <li><strong>Date:</strong> ${formattedDate}</li>
          <li><strong>Time:</strong> ${formattedTime}</li>
          <li><strong>Message:</strong> ${message || 'No message'}</li>
        </ul>
        <p><strong>Meeting ID:</strong> ${meetingId}</p>
      `
    });
  } catch (emailError) {
    console.error('Email error:', emailError);
    // Don't fail the booking if email fails
  }
  
  res.json({
    success: true,
    meetingId,
    message: 'Meeting scheduled successfully'
  });
});

// Get all meetings (admin endpoint - should be protected in production)
app.get('/api/meetings', (req, res) => {
  const { status } = req.query;
  
  let meetings = Array.from(db.meetings.values());
  
  if (status) {
    meetings = meetings.filter(m => m.status === status);
  }
  
  // Sort by date and time
  meetings.sort((a, b) => {
    const dateA = moment(`${a.meetingDate} ${a.meetingTime}`, 'YYYY-MM-DD h:mm A');
    const dateB = moment(`${b.meetingDate} ${b.meetingTime}`, 'YYYY-MM-DD h:mm A');
    return dateA.valueOf() - dateB.valueOf();
  });
  
  res.json({ meetings });
});

// Cancel a meeting
app.post('/api/meetings/:id/cancel', (req, res) => {
  const { id } = req.params;
  
  const meeting = db.meetings.get(id);
  
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }
  
  // Update meeting status
  meeting.status = 'cancelled';
  
  // Make time slot available again
  db.freeSlot(meeting.meetingDate, meeting.meetingTime);
  
  res.json({ success: true, message: 'Meeting cancelled successfully' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    meetings: db.meetings.size,
    availableSlots: Array.from(db.availability.values()).filter(s => s.isAvailable).length
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Corprex Meeting Scheduler API',
    endpoints: {
      health: '/api/health',
      availableDates: '/api/availability/dates?year=2025&month=1',
      availableTimes: '/api/availability/times?date=2025-01-30',
      bookMeeting: 'POST /api/meetings/book',
      allMeetings: '/api/meetings',
      cancelMeeting: 'POST /api/meetings/:id/cancel'
    }
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
