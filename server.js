// server.js - Corprex Cloud Backend (Deploy to Render, Railway, or Heroku)
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors({
    origin: '*', // Configure this with your actual domain in production
    credentials: true
}));
app.use(express.json());

// MongoDB Setup (using MongoDB Atlas free tier)
const { MongoClient, ObjectId } = require('mongodb');

// MongoDB connection string - set this in your cloud provider's environment variables
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://username:password@cluster.mongodb.net/corprex?retryWrites=true&w=majority';

let db;
let collections = {};

// Connect to MongoDB
async function connectDB() {
    try {
        const client = new MongoClient(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        await client.connect();
        console.log('✅ Connected to MongoDB Atlas');
        
        db = client.db('corprex');
        
        // Initialize collections
        collections.users = db.collection('users');
        collections.models = db.collection('models');
        collections.usage = db.collection('usage');
        collections.apiKeys = db.collection('apiKeys');
        collections.sessions = db.collection('sessions');
        
        // Create indexes for better performance
        await createIndexes();
        
        // Initialize default data
        await initializeDefaultData();
        
        // Clean up expired sessions periodically
        setInterval(cleanExpiredSessions, 3600000); // Every hour
        
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        process.exit(1);
    }
}

// Create database indexes
async function createIndexes() {
    try {
        await collections.users.createIndex({ username: 1 }, { unique: true });
        await collections.sessions.createIndex({ token: 1 });
        await collections.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await collections.usage.createIndex({ timestamp: -1 });
        await collections.usage.createIndex({ username: 1 });
        console.log('✅ Database indexes created');
    } catch (error) {
        console.error('Index creation error:', error);
    }
}

// Initialize default data
async function initializeDefaultData() {
    try {
        // Check if admin exists
        const adminExists = await collections.users.findOne({ username: 'admin' });
        
        if (!adminExists) {
            await collections.users.insertOne({
                username: 'admin',
                password: hashPassword('admin123'),
                role: 'admin',
                modelAccess: ['all'],
                createdAt: new Date(),
                lastActive: null
            });
            console.log('✅ Default admin user created (username: admin, password: admin123)');
        }
        
        // Initialize default models
        const modelsCount = await collections.models.countDocuments();
        if (modelsCount === 0) {
            const defaultModels = [
                {
                    modelId: 'gpt-4',
                    name: 'GPT-4',
                    provider: 'openai',
                    enabled: true,
                    apiKeyRequired: true,
                    endpoint: 'https://api.openai.com/v1/chat/completions',
                    createdAt: new Date()
                },
                {
                    modelId: 'gpt-3.5-turbo',
                    name: 'GPT-3.5 Turbo',
                    provider: 'openai',
                    enabled: true,
                    apiKeyRequired: true,
                    endpoint: 'https://api.openai.com/v1/chat/completions',
                    createdAt: new Date()
                },
                {
                    modelId: 'claude-3-opus',
                    name: 'Claude 3 Opus',
                    provider: 'anthropic',
                    enabled: true,
                    apiKeyRequired: true,
                    endpoint: 'https://api.anthropic.com/v1/messages',
                    createdAt: new Date()
                },
                {
                    modelId: 'claude-3-sonnet',
                    name: 'Claude 3 Sonnet',
                    provider: 'anthropic',
                    enabled: true,
                    apiKeyRequired: true,
                    endpoint: 'https://api.anthropic.com/v1/messages',
                    createdAt: new Date()
                },
                {
                    modelId: 'llama-2-70b',
                    name: 'Llama 2 70B',
                    provider: 'replicate',
                    enabled: false,
                    apiKeyRequired: true,
                    endpoint: 'https://api.replicate.com/v1/predictions',
                    createdAt: new Date()
                },
                {
                    modelId: 'mistral-7b',
                    name: 'Mistral 7B',
                    provider: 'together',
                    enabled: false,
                    apiKeyRequired: true,
                    endpoint: 'https://api.together.xyz/inference',
                    createdAt: new Date()
                }
            ];
            
            await collections.models.insertMany(defaultModels);
            console.log('✅ Default models initialized');
        }
        
        // Initialize API keys document
        const apiKeysExist = await collections.apiKeys.findOne({ _id: 'main' });
        if (!apiKeysExist) {
            await collections.apiKeys.insertOne({
                _id: 'main',
                openai: '',
                anthropic: '',
                replicate: '',
                together: '',
                huggingface: '',
                updatedAt: new Date()
            });
            console.log('✅ API keys document initialized');
        }
        
    } catch (error) {
        console.error('Error initializing data:', error);
    }
}

// Utility functions
function hashPassword(password) {
    return crypto.createHash('sha256').update(password + (process.env.SALT || 'corprex2024')).digest('hex');
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Clean expired sessions
async function cleanExpiredSessions() {
    try {
        const result = await collections.sessions.deleteMany({
            expiresAt: { $lt: new Date() }
        });
        if (result.deletedCount > 0) {
            console.log(`Cleaned ${result.deletedCount} expired sessions`);
        }
    } catch (error) {
        console.error('Error cleaning sessions:', error);
    }
}

// Authentication middleware
async function authenticate(req, res, next) {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        
        const session = await collections.sessions.findOne({
            token,
            expiresAt: { $gt: new Date() }
        });
        
        if (!session) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        
        req.user = session.user;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
}

// Admin middleware
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// ==================== API ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production',
        database: db ? 'connected' : 'disconnected'
    });
});

// Authentication endpoints
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        const user = await collections.users.findOne({ username });
        
        if (!user || user.password !== hashPassword(password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = generateToken();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        await collections.sessions.insertOne({
            token,
            user: {
                id: user._id.toString(),
                username: user.username,
                role: user.role
            },
            createdAt: new Date(),
            expiresAt
        });
        
        // Update last active
        await collections.users.updateOne(
            { _id: user._id },
            { $set: { lastActive: new Date() } }
        );
        
        res.json({
            token,
            user: {
                id: user._id.toString(),
                username: user.username,
                role: user.role
            },
            expiresAt
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        await collections.sessions.deleteOne({ token });
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

// User management
app.get('/api/users', authenticate, requireAdmin, async (req, res) => {
    try {
        const users = await collections.users.find({}).toArray();
        
        const sanitizedUsers = users.map(u => ({
            id: u._id.toString(),
            username: u.username,
            role: u.role,
            modelAccess: u.modelAccess || [],
            createdAt: u.createdAt,
            lastActive: u.lastActive
        }));
        
        res.json(sanitizedUsers);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.post('/api/users', authenticate, requireAdmin, async (req, res) => {
    try {
        const { username, password, role = 'user', modelAccess = [] } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        // Check if user exists
        const existing = await collections.users.findOne({ username });
        if (existing) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        const result = await collections.users.insertOne({
            username,
            password: hashPassword(password),
            role,
            modelAccess,
            createdAt: new Date(),
            lastActive: null
        });
        
        res.json({
            id: result.insertedId.toString(),
            username,
            role,
            modelAccess
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

app.put('/api/users/:username/models', authenticate, requireAdmin, async (req, res) => {
    try {
        const { username } = req.params;
        const { modelAccess } = req.body;
        
        const result = await collections.users.updateOne(
            { username },
            { $set: { modelAccess } }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ message: 'Model access updated', modelAccess });
    } catch (error) {
        console.error('Error updating model access:', error);
        res.status(500).json({ error: 'Failed to update model access' });
    }
});

app.delete('/api/users/:username', authenticate, requireAdmin, async (req, res) => {
    try {
        const { username } = req.params;
        
        if (username === 'admin') {
            return res.status(400).json({ error: 'Cannot delete admin user' });
        }
        
        const result = await collections.users.deleteOne({ username });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Also delete user's sessions
        await collections.sessions.deleteMany({ 'user.username': username });
        
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Model management
app.get('/api/models', authenticate, async (req, res) => {
    try {
        const models = await collections.models.find({}).toArray();
        
        // Filter based on user access if not admin
        if (req.user.role !== 'admin') {
            const user = await collections.users.findOne({ username: req.user.username });
            const userAccess = user.modelAccess || [];
            
            const filteredModels = models.filter(m => 
                userAccess.includes('all') || userAccess.includes(m.modelId)
            );
            
            return res.json(filteredModels);
        }
        
        res.json(models);
    } catch (error) {
        console.error('Error fetching models:', error);
        res.status(500).json({ error: 'Failed to fetch models' });
    }
});

app.post('/api/models', authenticate, requireAdmin, async (req, res) => {
    try {
        const { modelId, name, provider, endpoint, apiKeyRequired = true } = req.body;
        
        if (!modelId || !name || !provider) {
            return res.status(400).json({ error: 'Model ID, name, and provider required' });
        }
        
        // Check if model exists
        const existing = await collections.models.findOne({ modelId });
        if (existing) {
            return res.status(400).json({ error: 'Model already exists' });
        }
        
        const result = await collections.models.insertOne({
            modelId,
            name,
            provider,
            endpoint,
            apiKeyRequired,
            enabled: false,
            createdAt: new Date()
        });
        
        res.json({
            id: result.insertedId.toString(),
            modelId,
            name,
            provider,
            enabled: false
        });
    } catch (error) {
        console.error('Error adding model:', error);
        res.status(500).json({ error: 'Failed to add model' });
    }
});

app.put('/api/models/:modelId', authenticate, requireAdmin, async (req, res) => {
    try {
        const { modelId } = req.params;
        const updates = req.body;
        
        const result = await collections.models.updateOne(
            { modelId },
            { $set: updates }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Model not found' });
        }
        
        const updated = await collections.models.findOne({ modelId });
        res.json(updated);
    } catch (error) {
        console.error('Error updating model:', error);
        res.status(500).json({ error: 'Failed to update model' });
    }
});

app.delete('/api/models/:modelId', authenticate, requireAdmin, async (req, res) => {
    try {
        const { modelId } = req.params;
        
        const result = await collections.models.deleteOne({ modelId });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Model not found' });
        }
        
        res.json({ message: 'Model deleted successfully' });
    } catch (error) {
        console.error('Error deleting model:', error);
        res.status(500).json({ error: 'Failed to delete model' });
    }
});

// API Key management
app.get('/api/keys', authenticate, requireAdmin, async (req, res) => {
    try {
        const keys = await collections.apiKeys.findOne({ _id: 'main' });
        
        if (!keys) {
            return res.json({});
        }
        
        // Mask the keys
        const maskedKeys = {};
        for (const [provider, key] of Object.entries(keys)) {
            if (provider !== '_id' && provider !== 'updatedAt' && key) {
                maskedKeys[provider] = key.substring(0, 6) + '...' + key.substring(key.length - 4);
            } else if (provider !== '_id' && provider !== 'updatedAt') {
                maskedKeys[provider] = '';
            }
        }
        
        res.json(maskedKeys);
    } catch (error) {
        console.error('Error fetching API keys:', error);
        res.status(500).json({ error: 'Failed to fetch API keys' });
    }
});

app.put('/api/keys/:provider', authenticate, requireAdmin, async (req, res) => {
    try {
        const { provider } = req.params;
        const { apiKey } = req.body;
        
        await collections.apiKeys.updateOne(
            { _id: 'main' },
            {
                $set: {
                    [provider]: apiKey,
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );
        
        res.json({ message: 'API key updated successfully' });
    } catch (error) {
        console.error('Error updating API key:', error);
        res.status(500).json({ error: 'Failed to update API key' });
    }
});

// Usage tracking
app.post('/api/usage', authenticate, async (req, res) => {
    try {
        const { model, input, output, tokens = 0 } = req.body;
        
        await collections.usage.insertOne({
            username: req.user.username,
            userId: req.user.id,
            model,
            input: input.substring(0, 500),
            output: output.substring(0, 500),
            tokens,
            timestamp: new Date()
        });
        
        res.json({ message: 'Usage recorded' });
    } catch (error) {
        console.error('Error recording usage:', error);
        res.status(500).json({ error: 'Failed to record usage' });
    }
});

app.get('/api/usage', authenticate, requireAdmin, async (req, res) => {
    try {
        const { limit = 100, offset = 0, username, model, startDate, endDate } = req.query;
        
        const query = {};
        
        if (username) query.username = username;
        if (model) query.model = model;
        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }
        
        const usage = await collections.usage
            .find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(offset))
            .toArray();
        
        const total = await collections.usage.countDocuments(query);
        
        res.json({
            data: usage,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Error fetching usage:', error);
        res.status(500).json({ error: 'Failed to fetch usage' });
    }
});

app.get('/api/usage/stats', authenticate, requireAdmin, async (req, res) => {
    try {
        const totalRequests = await collections.usage.countDocuments();
        
        const uniqueUsers = await collections.usage.distinct('username');
        
        const modelUsage = await collections.usage.aggregate([
            {
                $group: {
                    _id: '$model',
                    count: { $sum: 1 }
                }
            }
        ]).toArray();
        
        const userActivity = await collections.usage.aggregate([
            {
                $group: {
                    _id: '$username',
                    count: { $sum: 1 }
                }
            }
        ]).toArray();
        
        const recentActivity = await collections.usage
            .find({})
            .sort({ timestamp: -1 })
            .limit(10)
            .project({ username: 1, model: 1, timestamp: 1 })
            .toArray();
        
        const modelUsageMap = {};
        modelUsage.forEach(m => {
            modelUsageMap[m._id] = m.count;
        });
        
        const userActivityMap = {};
        userActivity.forEach(u => {
            userActivityMap[u._id] = u.count;
        });
        
        res.json({
            totalRequests,
            uniqueUsers: uniqueUsers.length,
            modelUsage: modelUsageMap,
            userActivity: userActivityMap,
            recentActivity
        });
    } catch (error) {
        console.error('Error calculating stats:', error);
        res.status(500).json({ error: 'Failed to calculate statistics' });
    }
});

// Chat endpoint (proxy to AI providers)
app.post('/api/chat', authenticate, async (req, res) => {
    try {
        const { model, messages } = req.body;
        
        // Check user access to model
        if (req.user.role !== 'admin') {
            const user = await collections.users.findOne({ username: req.user.username });
            const userAccess = user.modelAccess || [];
            
            if (!userAccess.includes('all') && !userAccess.includes(model)) {
                return res.status(403).json({ error: 'Access denied to this model' });
            }
        }
        
        // Get model configuration
        const modelConfig = await collections.models.findOne({ modelId: model });
        
        if (!modelConfig || !modelConfig.enabled) {
            return res.status(400).json({ error: 'Model not available' });
        }
        
        // Get API keys
        const apiKeys = await collections.apiKeys.findOne({ _id: 'main' });
        const apiKey = apiKeys?.[modelConfig.provider];
        
        if (!apiKey && modelConfig.apiKeyRequired) {
            return res.status(500).json({ error: 'API key not configured for this model' });
        }
        
        // Here you would make the actual API call to the provider
        // For now, returning a mock response
        const mockResponse = {
            role: 'assistant',
            content: `[Demo Response from ${modelConfig.name}] I received your message: "${messages[messages.length - 1].content}". In production, this would be the actual AI response.`
        };
        
        // Record usage
        await collections.usage.insertOne({
            username: req.user.username,
            userId: req.user.id,
            model,
            input: messages[messages.length - 1].content.substring(0, 500),
            output: mockResponse.content.substring(0, 500),
            tokens: 100,
            timestamp: new Date()
        });
        
        res.json(mockResponse);
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Failed to process chat request' });
    }
});

// Static file serving for admin dashboard
app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/public/admin-dashboard.html');
});

// Start server
async function startServer() {
    await connectDB();
    
    app.listen(PORT, () => {
        console.log(`
========================================
🚀 Corprex Backend Server Running
========================================
Port: ${PORT}
Environment: ${process.env.NODE_ENV || 'production'}
Database: MongoDB Atlas
Admin Login: username: admin, password: admin123
API Base URL: http://localhost:${PORT}/api
Admin Dashboard: http://localhost:${PORT}/admin
========================================
        `);
    });
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    process.exit(0);
});

startServer().catch(console.error);