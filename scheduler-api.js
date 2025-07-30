// Scheduler API Integration for Cloud Deployment
// Update the baseURL to your Render.com URL after deployment

const SCHEDULER_API = {
    // IMPORTANT: Update this URL after deploying to Render
    baseURL: 'http://localhost:3000/api', // Change to: https://your-app.onrender.com/api
    
    // Check if API is available
    async checkHealth() {
        try {
            const response = await fetch(`${this.baseURL}/health`);
            return response.ok;
        } catch (error) {
            console.error('API health check failed:', error);
            return false;
        }
    },
    
    // Get available dates for a month
    async getAvailableDates(year, month) {
        try {
            const response = await fetch(`${this.baseURL}/availability/dates?year=${year}&month=${month + 1}`);
            if (!response.ok) {
                throw new Error('Failed to fetch dates');
            }
            const data = await response.json();
            return data.availableDates || [];
        } catch (error) {
            console.error('Error fetching available dates:', error);
            return [];
        }
    },
    
    // Get available times for a date
    async getAvailableTimes(date) {
        try {
            const dateStr = moment(date).format('YYYY-MM-DD');
            const response = await fetch(`${this.baseURL}/availability/times?date=${dateStr}`);
            if (!response.ok) {
                throw new Error('Failed to fetch times');
            }
            const data = await response.json();
            return data.availableTimes || [];
        } catch (error) {
            console.error('Error fetching available times:', error);
            return [];
        }
    },
    
    // Book a meeting
    async bookMeeting(bookingData) {
        try {
            const response = await fetch(`${this.baseURL}/meetings/book`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(bookingData)
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Booking failed');
            }
            
            return data;
        } catch (error) {
            console.error('Error booking meeting:', error);
            throw error;
        }
    }
};

// Check API health on page load
window.addEventListener('load', async () => {
    const isHealthy = await SCHEDULER_API.checkHealth();
    if (!isHealthy) {
        console.warn('Scheduler API is not responding. It may be starting up (takes 30-60 seconds on free tier).');
    }
});

// Override the generateCalendar function to use API
const originalGenerateCalendar = window.generateCalendar;
window.generateCalendar = async function() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Update month display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('calendarMonth').textContent = `${monthNames[month]} ${year}`;
    
    // Show loading state
    const calendarDays = document.getElementById('calendarDays');
    calendarDays.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">Loading available dates...</div>';
    
    // Get available dates from API
    const availableDates = await SCHEDULER_API.getAvailableDates(year, month);
    
    // Clear loading state
    calendarDays.innerHTML = '';
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day disabled';
        calendarDays.appendChild(emptyDay);
    }
    
    // Add days of the month
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        
        const dayDate = new Date(year, month, day);
        dayDate.setHours(0, 0, 0, 0);
        const dateStr = moment(dayDate).format('YYYY-MM-DD');
        
        // Check if date is available from API
        if (availableDates.includes(dateStr) && dayDate >= today) {
            dayElement.classList.add('available');
            dayElement.onclick = () => selectDate(dayDate);
        } else {
            dayElement.classList.add('disabled');
        }
        
        dayElement.innerHTML = `<span class="day-number">${day}</span>`;
        calendarDays.appendChild(dayElement);
    }
};

// Override the showTimeSlots function
window.showTimeSlots = async function(date) {
    const timeSlots = document.getElementById('timeSlots');
    timeSlots.classList.add('active');
    
    // Update selected date display
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('selectedDate').textContent = date.toLocaleDateString('en-US', options);
    
    // Show loading state
    const timeSlotsGrid = document.getElementById('timeSlotsGrid');
    timeSlotsGrid.innerHTML = '<div class="loading-spinner active" style="grid-column: 1/-1;"></div>';
    
    // Get available times from API
    const availableTimes = await SCHEDULER_API.getAvailableTimes(date);
    
    // Generate time slots
    timeSlotsGrid.innerHTML = '';
    
    if (availableTimes.length === 0) {
        timeSlotsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999;">No available times for this date</p>';
        return;
    }
    
    availableTimes.forEach(time => {
        const slot = document.createElement('button');
        slot.className = 'time-slot';
        slot.textContent = time;
        slot.onclick = () => selectTime(time, slot);
        timeSlotsGrid.appendChild(slot);
    });
};

// Override the form submission handler
if (document.getElementById('schedulerForm')) {
    // Remove any existing listeners
    const form = document.getElementById('schedulerForm');
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    
    // Add new listener
    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submitBtn');
        const submitText = document.getElementById('submitText');
        const loadingSpinner = document.getElementById('loadingSpinner');
        
        // Show loading state
        submitBtn.disabled = true;
        submitText.textContent = 'Scheduling...';
        loadingSpinner.classList.add('active');
        
        try {
            // Prepare booking data
            const bookingData = {
                firstName: document.getElementById('schedFirstName').value,
                lastName: document.getElementById('schedLastName').value,
                email: document.getElementById('schedEmail').value,
                phone: document.getElementById('schedPhone').value,
                company: document.getElementById('schedCompany').value,
                message: document.getElementById('schedMessage').value,
                date: moment(selectedDate).format('YYYY-MM-DD'),
                time: selectedTime,
                timezone: document.getElementById('timezoneSelect').value
            };
            
            // Book the meeting
            const result = await SCHEDULER_API.bookMeeting(bookingData);
            
            // Hide loading spinner
            loadingSpinner.classList.remove('active');
            
            // Hide form and show success
            document.getElementById('bookingForm').classList.remove('active');
            document.getElementById('bookingSuccess').classList.add('active');
            
            // Reset form
            newForm.reset();
            
        } catch (error) {
            // Show error message
            loadingSpinner.classList.remove('active');
            
            let errorMessage = 'Failed to schedule meeting.';
            if (error.message === 'Failed to fetch') {
                errorMessage += ' The booking service may be starting up. Please try again in 30 seconds.';
            } else {
                errorMessage += ' ' + error.message;
            }
            
            alert(errorMessage);
            
        } finally {
            submitBtn.disabled = false;
            submitText.textContent = 'Schedule Meeting';
        }
    });
}

// Add moment.js if not already included
if (typeof moment === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js';
    document.head.appendChild(script);
}

// Log API configuration for debugging
console.log('Scheduler API configured with base URL:', SCHEDULER_API.baseURL);
console.log('Remember to update the baseURL after deploying to Render!');