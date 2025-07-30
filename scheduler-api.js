// Scheduler API Integration - Configured for Corprex
// This file is configured with your actual API URL

const SCHEDULER_API = {
    // Your Render API URL
    baseURL: 'https://corprex-scheduler.onrender.com/api',
    
    // Check if API is available
    async checkHealth() {
        try {
            const response = await fetch(`${this.baseURL}/health`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            const data = await response.json();
            console.log('API Health:', data);
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
            // Format date as YYYY-MM-DD
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
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

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('Scheduler API initializing...');
    
    // Check API health
    SCHEDULER_API.checkHealth().then(isHealthy => {
        if (isHealthy) {
            console.log('✅ Scheduler API is connected and healthy');
        } else {
            console.warn('⚠️ Scheduler API is not responding. Please check:');
            console.warn('1. Is the backend deployed and running on Render?');
            console.warn('2. Wait 30-60 seconds for cold start if using free tier');
        }
    });
    
    // Override the existing generateCalendar function
    const originalGenerateCalendar = window.generateCalendar;
    window.generateCalendar = async function() {
        console.log('Generating calendar with API data...');
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        // Update month display
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
        document.getElementById('calendarMonth').textContent = `${monthNames[month]} ${year}`;
        
        // Show loading state
        const calendarDays = document.getElementById('calendarDays');
        calendarDays.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #999;">Loading available dates...</div>';
        
        try {
            // Get available dates from API
            const availableDates = await SCHEDULER_API.getAvailableDates(year, month);
            console.log('Available dates:', availableDates);
            
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
                
                // Format date for comparison
                const dateMonth = String(dayDate.getMonth() + 1).padStart(2, '0');
                const dateDay = String(dayDate.getDate()).padStart(2, '0');
                const dateStr = `${dayDate.getFullYear()}-${dateMonth}-${dateDay}`;
                
                // Check if date is available from API
                if (availableDates.includes(dateStr) && dayDate >= today) {
                    dayElement.classList.add('available');
                    dayElement.onclick = () => window.selectDate(dayDate);
                } else {
                    dayElement.classList.add('disabled');
                }
                
                dayElement.innerHTML = `<span class="day-number">${day}</span>`;
                calendarDays.appendChild(dayElement);
            }
        } catch (error) {
            console.error('Error generating calendar:', error);
            calendarDays.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #f00;">Error loading calendar. Please refresh.</div>';
        }
    };
    
    // Override the showTimeSlots function
    const originalShowTimeSlots = window.showTimeSlots;
    window.showTimeSlots = async function(date) {
        console.log('Showing time slots for:', date);
        const timeSlots = document.getElementById('timeSlots');
        timeSlots.classList.add('active');
        
        // Update selected date display
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('selectedDate').textContent = date.toLocaleDateString('en-US', options);
        
        // Show loading state
        const timeSlotsGrid = document.getElementById('timeSlotsGrid');
        timeSlotsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center;"><div class="loading-spinner active"></div></div>';
        
        try {
            // Get available times from API
            const availableTimes = await SCHEDULER_API.getAvailableTimes(date);
            console.log('Available times:', availableTimes);
            
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
                slot.onclick = () => window.selectTime(time, slot);
                timeSlotsGrid.appendChild(slot);
            });
        } catch (error) {
            console.error('Error loading times:', error);
            timeSlotsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #f00;">Error loading times. Please try again.</p>';
        }
    };
    
    // Replace the form submission handler
    const schedulerForm = document.getElementById('schedulerForm');
    if (schedulerForm) {
        // Remove any existing listeners
        const newForm = schedulerForm.cloneNode(true);
        schedulerForm.parentNode.replaceChild(newForm, schedulerForm);
        
        // Add new listener
        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Submitting booking...');
            
            const submitBtn = document.getElementById('submitBtn');
            const submitText = document.getElementById('submitText');
            const loadingSpinner = document.getElementById('loadingSpinner');
            
            // Show loading state
            submitBtn.disabled = true;
            submitText.textContent = 'Scheduling...';
            loadingSpinner.classList.add('active');
            
            try {
                // Format date
                const year = window.selectedDate.getFullYear();
                const month = String(window.selectedDate.getMonth() + 1).padStart(2, '0');
                const day = String(window.selectedDate.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                
                // Prepare booking data
                const bookingData = {
                    firstName: document.getElementById('schedFirstName').value,
                    lastName: document.getElementById('schedLastName').value,
                    email: document.getElementById('schedEmail').value,
                    phone: document.getElementById('schedPhone').value || '',
                    company: document.getElementById('schedCompany').value,
                    message: document.getElementById('schedMessage').value || '',
                    date: dateStr,
                    time: window.selectedTime,
                    timezone: document.getElementById('timezoneSelect').value
                };
                
                console.log('Booking data:', bookingData);
                
                // Book the meeting
                const result = await SCHEDULER_API.bookMeeting(bookingData);
                console.log('Booking result:', result);
                
                // Hide loading spinner
                loadingSpinner.classList.remove('active');
                
                // Hide form and show success
                document.getElementById('bookingForm').classList.remove('active');
                document.getElementById('bookingSuccess').classList.add('active');
                
                // Reset form
                newForm.reset();
                
            } catch (error) {
                console.error('Booking error:', error);
                
                // Hide loading spinner
                loadingSpinner.classList.remove('active');
                
                let errorMessage = 'Failed to schedule meeting. ';
                if (error.message.includes('fetch')) {
                    errorMessage += 'Cannot connect to booking service. The service may be starting up - please try again in 30 seconds.';
                } else {
                    errorMessage += error.message;
                }
                
                alert(errorMessage);
                
            } finally {
                submitBtn.disabled = false;
                submitText.textContent = 'Schedule Meeting';
            }
        });
    }
});

// Log configuration
console.log('Scheduler API configured for Corprex');
console.log('API URL:', SCHEDULER_API.baseURL);
