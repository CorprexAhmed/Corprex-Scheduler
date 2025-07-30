// Test script to verify scheduler functionality
// Run with: node test-scheduler.js

// Use local URL for local testing, or your production URL
const API_URL = 'https://corprex-scheduler.onrender.com/api'; 
// For local testing, change to: 'http://localhost:3000/api'

async function testScheduler() {
    console.log('🧪 Testing Corprex Scheduler API...\n');
    console.log('API URL:', API_URL);
    console.log('Note: If using Render free tier, first request may take 30-60 seconds\n');
    
    // Test 1: Health Check
    console.log('1️⃣ Testing Health Check...');
    try {
        const healthResponse = await fetch(`${API_URL}/health`);
        const healthData = await healthResponse.json();
        console.log('✅ Health Check:', healthData);
    } catch (error) {
        console.log('❌ Health Check Failed:', error.message);
        console.log('Make sure the server is running or deployed!');
        return;
    }
    
    // Test 2: Get Available Dates
    console.log('\n2️⃣ Testing Available Dates...');
    try {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        
        const datesResponse = await fetch(`${API_URL}/availability/dates?year=${year}&month=${month}`);
        const datesData = await datesResponse.json();
        console.log(`✅ Available dates for ${month}/${year}:`, datesData.availableDates.slice(0, 5), '...');
    } catch (error) {
        console.log('❌ Available Dates Failed:', error.message);
    }
    
    // Test 3: Get Available Times
    console.log('\n3️⃣ Testing Available Times...');
    try {
        // Get tomorrow's date
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        // Skip if weekend
        while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
            tomorrow.setDate(tomorrow.getDate() + 1);
        }
        
        const dateStr = tomorrow.toISOString().split('T')[0];
        const timesResponse = await fetch(`${API_URL}/availability/times?date=${dateStr}`);
        const timesData = await timesResponse.json();
        console.log(`✅ Available times for ${dateStr}:`, timesData.availableTimes);
    } catch (error) {
        console.log('❌ Available Times Failed:', error.message);
    }
    
    // Test 4: Book a Test Meeting
    console.log('\n4️⃣ Testing Meeting Booking...');
    try {
        // Get a future date
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 3);
        while (futureDate.getDay() === 0 || futureDate.getDay() === 6) {
            futureDate.setDate(futureDate.getDate() + 1);
        }
        
        const testBooking = {
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
            phone: '555-1234',
            company: 'Test Company',
            message: 'This is a test booking',
            date: futureDate.toISOString().split('T')[0],
            time: '10:00 AM',
            timezone: 'America/New_York'
        };
        
        console.log('📧 Booking details:', testBooking);
        
        const bookResponse = await fetch(`${API_URL}/meetings/book`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testBooking)
        });
        
        const bookData = await bookResponse.json();
        if (bookResponse.ok) {
            console.log('✅ Meeting booked successfully!', bookData);
            console.log('\n⚠️  Note: Emails will be sent to:');
            console.log('   - Customer: test@example.com');
            console.log('   - Admin: admin@corprex.com');
        } else {
            console.log('❌ Booking failed:', bookData);
        }
    } catch (error) {
        console.log('❌ Meeting Booking Failed:', error.message);
    }
    
    // Test 5: Get All Meetings
    console.log('\n5️⃣ Testing Get All Meetings...');
    try {
        const meetingsResponse = await fetch(`${API_URL}/meetings`);
        const meetingsData = await meetingsResponse.json();
        console.log(`✅ Total meetings: ${meetingsData.meetings.length}`);
        if (meetingsData.meetings.length > 0) {
            console.log('Latest meeting:', meetingsData.meetings[meetingsData.meetings.length - 1]);
        }
    } catch (error) {
        console.log('❌ Get Meetings Failed:', error.message);
    }
    
    console.log('\n✨ Testing complete!');
    console.log('\nYour configuration:');
    console.log('- Email: sales@corprex.com');
    console.log('- Admin: admin@corprex.com');
    console.log('- API: https://corprex-scheduler.onrender.com/api');
}

// Run tests
testScheduler().catch(console.error);
